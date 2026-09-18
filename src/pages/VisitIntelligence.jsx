import { useState, useMemo, useEffect } from 'react';
import { Briefcase, AlertTriangle, RotateCcw } from 'lucide-react';

import SearchInput from '../components/common/SearchInput';
import SkeletonLoader from '../components/common/SkeletonLoader';
import ErrorBoundary from '../components/common/ErrorBoundary';

import VisitKPIRow from '../components/visits/VisitKPIRow';
import VisitAlignmentCards from '../components/visits/VisitAlignmentCards';
import DealerVisitTable from '../components/visits/DealerVisitTable';
import DistrictDemandTable from '../components/visits/DistrictDemandTable';
import RepPerformanceTable from '../components/visits/RepPerformanceTable';
import VisitTrendsPanel from '../components/visits/VisitTrendsPanel';
import VisitComparisonTab from '../components/visits/VisitComparisonTab';
import DealerScorecardModal from '../components/visits/DealerScorecardModal';

const MONTH_OPTIONS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

function formatMonthName(m) {
  const found = MONTH_OPTIONS.find(item => item.value === m);
  return found ? found.label : m;
}

import { useVisitData } from '../hooks/useVisitData';
import { useRawData } from '../context/DataContext';
import { useDashboardTelemetry } from '../context/DashboardTelemetryContext';
import {
  VISIT_SECTIONS,
  buildDespatchIndex,
  buildBusinessPlanDistrictIndex,
  buildBusinessPlanDealerIndex,
  buildRepRoleIndex,
  attachDistrictSales,
  REP_ROLES,
  quadrantConfig,
  comparableAvg,
  comparableFabricatorAvg,
  visitTrend,
  isUnlinked,
} from '../utils/visits';
import { queryBusinessPlan } from '../services/businessPlanService';
import ExportDropdown from '../components/common/ExportDropdown';
import { downloadCsv, getExportFilename } from '../utils/csvExport';

/**
 * Field Visits & Tracker.
 *
 * Two things this page deliberately does NOT do any more.
 *
 * It does not wrap itself in AnimatedPage. DashboardLayout already animates
 * whatever the router puts in the outlet, and this was the only page that
 * added a second motion wrapper inside that one. Nested inside the layout's
 * old `AnimatePresence mode="wait"`, that extra wrapper is what made the tab
 * blank out: the outgoing page stayed mounted at opacity 0 waiting for an
 * exit-complete that never arrived, so the new page never mounted until an
 * unrelated click forced a re-render.
 *
 * It does not set its own padding or max-width. The layout supplies
 * `p-4 sm:p-5` and `max-w-[1680px] mx-auto`; adding `p-8 max-w-7xl` on top
 * made this the one tab that sat narrower and further from the edges than
 * every other tab. The root is now `animate-fade-in space-y-6`, the same as
 * Dealer Network and State Overview.
 */
export default function VisitIntelligence() {
  const [section, setSection] = useState('dealers');
  const [state, setState] = useState('ALL');
  const [quadrant, setQuadrant] = useState('ALL');
  const [query, setQuery] = useState('');
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [repRole, setRepRole] = useState('ALL');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('09');

  // The dispatch feed lives in the dashboard payload, not the visit payload, so
  // the sales side of this tab is joined here rather than in the parser. It
  // also repairs the parser's own join: 16 districts the two feeds spell
  // differently were reporting no sales at all.
  const { rawData } = useRawData();
  const despatchIndex = useMemo(
    () => buildDespatchIndex(rawData?.districts || []),
    [rawData]
  );
  const despatchElapsedDays = rawData?.meta?.curElapsedDays ?? 0;

  // Live Business Plan targets from public.business_plan.
  //
  // Two grains, two requests. The dealer rows do not roll up into the district
  // figures: a district's plan covers accounts that never appear in the visit
  // tracker, so summing the dealer grain would quietly understate every
  // district. Asking for each grain separately keeps the two tabs reporting
  // what the plan actually says at their own level.
  const [bpDistrictTargets, setBpDistrictTargets] = useState(null);
  const [bpDealerTargets, setBpDealerTargets] = useState(null);
  const [repRoleNames, setRepRoleNames] = useState(null);

  useEffect(() => {
    let mounted = true;

    queryBusinessPlan({ dimensions: ['state', 'district'], limit: 1000 })
      .then(rows => {
        if (mounted && Array.isArray(rows) && rows.length > 0) {
          setBpDistrictTargets(rows);
        }
      })
      .catch(err => {
        console.warn('[VisitIntelligence] Live BP district targets fetch warning:', err);
      });

    // 2,004 rows in business_plan, so 2500 ceiling fetches 3 pages without extra round trips.
    queryBusinessPlan({ dimensions: ['state', 'district', 'dealer'], limit: 2500 })
      .then(rows => {
        if (mounted && Array.isArray(rows) && rows.length > 0) {
          setBpDealerTargets(rows);
        }
      })
      .catch(err => {
        console.warn('[VisitIntelligence] Live BP dealer targets fetch warning:', err);
      });

    // Who is a KRM and who is a KRO. Three one-column reads rather than one
    // wide one: the RPC groups by the dimensions it is given, so asking for all
    // three at once returns their cross product instead of three lists.
    Promise.all([
      queryBusinessPlan({ dimensions: ['krm'], limit: 2000 }),
      queryBusinessPlan({ dimensions: ['kro'], limit: 2000 }),
      queryBusinessPlan({ dimensions: ['jr_kro'], limit: 2000 }),
    ])
      .then(([krmRows, kroRows, jrRows]) => {
        if (!mounted) return;
        setRepRoleNames({
          krm: krmRows.map(r => r.grp?.krm).filter(Boolean),
          kro: kroRows.map(r => r.grp?.kro).filter(Boolean),
          jrKro: jrRows.map(r => r.grp?.jr_kro).filter(Boolean),
        });
      })
      .catch(err => {
        console.warn('[VisitIntelligence] Rep role fetch warning:', err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const repRoleIndex = useMemo(
    () => (repRoleNames ? buildRepRoleIndex(repRoleNames) : null),
    [repRoleNames]
  );

  const bpIndex = useMemo(
    () => (bpDistrictTargets ? buildBusinessPlanDistrictIndex(bpDistrictTargets) : null),
    [bpDistrictTargets]
  );

  const bpDealerIndex = useMemo(
    () => (bpDealerTargets ? buildBusinessPlanDealerIndex(bpDealerTargets) : null),
    [bpDealerTargets]
  );

  // The dealer index goes in rather than being applied to the result: the group
  // cards filter on `quadrant`, which this recomputes, so it has to land before
  // the filtering rather than after it.
  const {
    data, loading, error,
    dealers, districts, reps,
    summary, stateOptions, salesLink, counts,
  } = useVisitData({
    state,
    quadrant,
    query,
    role: repRole,
    bpDealerIndex,
    repRoleIndex,
    elapsedDays: despatchElapsedDays,
  });

  /**
   * The group cards filter the dealer table, so picking one moves you there.
   * Clicking "Needs Attention" while the District view was open used to look
   * like a dead control: the card lit up and nothing on screen changed,
   * because a group is a dealer-level classification and the district table
   * deliberately ignores it.
   */
  const selectQuadrant = key => {
    setQuadrant(key);
    if (key !== 'ALL') setSection('dealers');
  };

  const active = useMemo(
    () => VISIT_SECTIONS.find(s => s.key === section) || VISIT_SECTIONS[0],
    [section]
  );

  const districtsWithSales = useMemo(
    () => attachDistrictSales(districts, despatchIndex, despatchElapsedDays, bpIndex),
    [districts, despatchIndex, despatchElapsedDays, bpIndex]
  );

  useDashboardTelemetry({
    tabName: 'Field Visits & Tracker',
    filters: {
      section,
      state,
      quadrant,
      search: query || '',
      repRole,
      year: selectedYear,
      month: selectedMonth,
    },
    selectedEntity: selectedDealer ? {
      type: 'dealer',
      name: selectedDealer.dealer || selectedDealer.name,
      state: selectedDealer.state,
      district: selectedDealer.district,
    } : null,
    visibleKpis: {
      totalVisits: summary?.totalVisits ?? 0,
      visitedDealersCount: summary?.visitedDealers ?? (dealers?.length || 0),
      activeFieldRepsCount: summary?.activeReps ?? (reps?.length || 0),
      sectionName: active?.label || section,
    },
  });

  const handleExportFiltered = () => {
    if (section === 'dealers') {
      const cols = [
        { label: 'Dealer Name', key: 'dealer' },
        { label: 'State', getValue: r => r.state || 'Not recorded' },
        { label: 'District', getValue: r => r.district || 'Not recorded' },
        { label: 'Pincode', getValue: r => r.pincode || '—' },
        { label: 'Account Group', getValue: r => quadrantConfig(r.quadrant)?.label || r.quadrant || '—' },
        { label: 'Visits This Month', getValue: r => r.curVisits || 0 },
        { label: 'Historical Benchmark Visits', getValue: r => comparableAvg(r) },
        { label: 'Visit Net Growth', getValue: r => visitTrend(r).growth },
        { label: 'Actual Sales (MT)', getValue: r => (r.salesActual != null ? Number(r.salesActual).toFixed(1) : (isUnlinked(r) ? 'Unbilled' : '0.0')) },
        { label: 'Business Plan Target (MT)', getValue: r => (r.bpTarget != null ? Number(r.bpTarget).toFixed(1) : '—') },
        { label: 'Target Achievement %', getValue: r => (r.salesAchievedPct != null ? Number(r.salesAchievedPct).toFixed(1) + '%' : '—') },
        { label: 'Market Potential (MT)', getValue: r => (r.bpPotential != null ? Number(r.bpPotential).toFixed(1) : '—') },
      ];
      downloadCsv(getExportFilename('field_dealers', 'filtered'), cols, dealers);
    } else if (section === 'districts') {
      const cols = [
        { label: 'District', key: 'district' },
        { label: 'State', key: 'state' },
        { label: 'Fabricator Visits This Month', getValue: r => r.curFabricatorVisits || 0 },
        { label: 'Historical Benchmark Visits', getValue: r => comparableFabricatorAvg(r) },
        { label: 'Fabricator Visit Growth', getValue: r => Math.round(r.fabricatorGrowth ?? 0) || 0 },
        { label: 'Dealer Coverage %', getValue: r => (r.dealerCoveragePct != null ? Number(r.dealerCoveragePct).toFixed(1) + '%' : '—') },
        { label: 'Dealers Visited', getValue: r => r.dealersVisited || 0 },
        { label: 'Total Dealers in District', getValue: r => r.dealersTotal || 0 },
        { label: 'Actual Sales (MT)', getValue: r => (r.salesActual != null ? Number(r.salesActual).toFixed(1) : '0.0') },
        { label: 'Business Plan Target (MT)', getValue: r => (r.bpTarget != null ? Number(r.bpTarget).toFixed(1) : '—') },
        { label: 'Plan Achievement %', getValue: r => (r.salesAchievedPct != null ? Number(r.salesAchievedPct).toFixed(1) + '%' : '—') },
      ];
      downloadCsv(getExportFilename('field_districts', 'filtered'), cols, districtsWithSales);
    } else if (section === 'reps') {
      const cols = [
        { label: 'Sales Representative', key: 'rep' },
        { label: 'Role', getValue: r => r.role || 'Field Rep' },
        { label: 'Visits This Month', getValue: r => r.curVisits || 0 },
        { label: 'Previous Month Visits (MTD)', getValue: r => (r.prevVisitsMtd != null ? r.prevVisitsMtd : '—') },
        { label: 'Net Change in Visits', getValue: r => (r.prevVisitsMtd != null ? (r.curVisits - r.prevVisitsMtd) : '—') },
        { label: 'Visits Per Active Day', getValue: r => (r.visitsPerActiveDay != null ? Number(r.visitsPerActiveDay).toFixed(1) : '—') },
        { label: 'Active Working Days', getValue: r => r.activeDays || 0 },
        { label: 'Unique Accounts Visited', getValue: r => r.uniqueCustomers || 0 },
        { label: 'Dealer Visits', getValue: r => r.dealerVisits || 0 },
        { label: 'Fabricator Visits', getValue: r => r.fabricatorVisits || 0 },
      ];
      downloadCsv(getExportFilename('field_sales_team', 'filtered'), cols, reps);
    }
  };

  const handleExportRaw = () => {
    if (section === 'dealers') {
      const cols = [
        { label: 'Dealer Name', key: 'dealer' },
        { label: 'State', getValue: r => r.state || 'Not recorded' },
        { label: 'District', getValue: r => r.district || 'Not recorded' },
        { label: 'Pincode', getValue: r => r.pincode || '—' },
        { label: 'Account Group', getValue: r => quadrantConfig(r.quadrant)?.label || r.quadrant || '—' },
        { label: 'Visits This Month', getValue: r => r.curVisits || 0 },
        { label: 'Historical Benchmark Visits', getValue: r => comparableAvg(r) },
        { label: 'Visit Net Growth', getValue: r => visitTrend(r).growth },
        { label: 'Actual Sales (MT)', getValue: r => (r.salesActual != null ? Number(r.salesActual).toFixed(1) : (isUnlinked(r) ? 'Unbilled' : '0.0')) },
        { label: 'Business Plan Target (MT)', getValue: r => (r.bpTarget != null ? Number(r.bpTarget).toFixed(1) : '—') },
        { label: 'Target Achievement %', getValue: r => (r.salesAchievedPct != null ? Number(r.salesAchievedPct).toFixed(1) + '%' : '—') },
        { label: 'Market Potential (MT)', getValue: r => (r.bpPotential != null ? Number(r.bpPotential).toFixed(1) : '—') },
      ];
      downloadCsv(getExportFilename('field_dealers', 'raw_all'), cols, data?.dealers || []);
    } else if (section === 'districts') {
      const allDistrictsWithSales = attachDistrictSales(data?.districts || [], despatchIndex, despatchElapsedDays, bpIndex);
      const cols = [
        { label: 'District', key: 'district' },
        { label: 'State', key: 'state' },
        { label: 'Fabricator Visits This Month', getValue: r => r.curFabricatorVisits || 0 },
        { label: 'Historical Benchmark Visits', getValue: r => comparableFabricatorAvg(r) },
        { label: 'Fabricator Visit Growth', getValue: r => Math.round(r.fabricatorGrowth ?? 0) || 0 },
        { label: 'Dealer Coverage %', getValue: r => (r.dealerCoveragePct != null ? Number(r.dealerCoveragePct).toFixed(1) + '%' : '—') },
        { label: 'Dealers Visited', getValue: r => r.dealersVisited || 0 },
        { label: 'Total Dealers in District', getValue: r => r.dealersTotal || 0 },
        { label: 'Actual Sales (MT)', getValue: r => (r.salesActual != null ? Number(r.salesActual).toFixed(1) : '0.0') },
        { label: 'Business Plan Target (MT)', getValue: r => (r.bpTarget != null ? Number(r.bpTarget).toFixed(1) : '—') },
        { label: 'Plan Achievement %', getValue: r => (r.salesAchievedPct != null ? Number(r.salesAchievedPct).toFixed(1) + '%' : '—') },
      ];
      downloadCsv(getExportFilename('field_districts', 'raw_all'), cols, allDistrictsWithSales);
    } else if (section === 'reps') {
      const cols = [
        { label: 'Sales Representative', key: 'rep' },
        { label: 'Role', getValue: r => r.role || 'Field Rep' },
        { label: 'Visits This Month', getValue: r => r.curVisits || 0 },
        { label: 'Previous Month Visits (MTD)', getValue: r => (r.prevVisitsMtd != null ? r.prevVisitsMtd : '—') },
        { label: 'Net Change in Visits', getValue: r => (r.prevVisitsMtd != null ? (r.curVisits - r.prevVisitsMtd) : '—') },
        { label: 'Visits Per Active Day', getValue: r => (r.visitsPerActiveDay != null ? Number(r.visitsPerActiveDay).toFixed(1) : '—') },
        { label: 'Active Working Days', getValue: r => r.activeDays || 0 },
        { label: 'Unique Accounts Visited', getValue: r => r.uniqueCustomers || 0 },
        { label: 'Dealer Visits', getValue: r => r.dealerVisits || 0 },
        { label: 'Fabricator Visits', getValue: r => r.fabricatorVisits || 0 },
      ];
      downloadCsv(getExportFilename('field_sales_team', 'raw_all'), cols, data?.reps || []);
    }
  };

  if (loading && section !== 'comparison') {
    return (
      <div className="animate-fade-in space-y-6">
        <SkeletonLoader variant="card" count={1} className="h-16" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <SkeletonLoader variant="kpi" count={5} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <SkeletonLoader variant="kpi" count={5} />
        </div>
        <div className="glass-card overflow-hidden">
          <SkeletonLoader variant="table-row" count={8} />
        </div>
      </div>
    );
  }

  if ((error || !data) && section !== 'comparison') {
    return (
      <div className="animate-fade-in">
        <div className="glass-card p-10 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Field Visit Data Unavailable</h2>
          <p className="text-sm text-text-muted mb-6">{error || 'The visits dataset could not be loaded.'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-accent-blue text-white rounded-xl text-sm font-bold hover:opacity-90 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const rowsFor = { dealers, districts: districtsWithSales, reps };
  const visibleCount = rowsFor[section]?.length ?? 0;
  const filtersOn = state !== 'ALL' || quadrant !== 'ALL' || query !== '';

  return (
    <div className="animate-fade-in space-y-6">

      {/* Page title — same block every other tab uses */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
        <div className="flex items-start gap-3">
          <Briefcase className="w-7 h-7 text-accent-blue mt-1 shrink-0" />
          <div>
            <h2 className="text-3xl font-extrabold text-text-primary leading-tight">
              Field Visits &amp; Tracker
            </h2>
            <p className="text-sm text-text-muted mt-1">
              Dealer and fabricator visits this month, matched against sales results.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="filter-select text-sm py-2 px-3 w-full sm:w-[150px]"
            value={state}
            onChange={e => setState(e.target.value)}
            aria-label="Filter by state"
          >
            {stateOptions.map(st => (
              <option key={st} value={st}>{st === 'ALL' ? 'All States' : st}</option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            className="filter-select text-sm py-2 px-2.5 w-[100px] font-bold"
            value={selectedYear}
            onChange={e => {
              const yr = e.target.value;
              setSelectedYear(yr);
              if (yr === '2026' && Number(selectedMonth) > 9) {
                setSelectedMonth('09');
              }
            }}
            aria-label="Filter by year"
          >
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>

          {/* Month Selector */}
          <select
            className="filter-select text-sm py-2 px-2.5 w-[130px] font-bold"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            aria-label="Filter by month"
          >
            {MONTH_OPTIONS.filter(m => selectedYear !== '2026' || Number(m.value) <= 9).map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <span className="px-3.5 py-2 rounded-xl bg-bg-card/60 border border-border/40 text-[13px] font-bold text-text-secondary whitespace-nowrap">
            {selectedYear === '2026' && selectedMonth === '09' ? (data.meta?.curPeriod || 'This Month') : `${formatMonthName(selectedMonth)} ${selectedYear}`}
            {selectedYear === '2026' && selectedMonth === '09' && data.meta?.elapsedDays ? ` · ${data.meta.elapsedDays} Days So Far` : ''}
          </span>

          {filtersOn && (
            <button
              type="button"
              onClick={() => { setState('ALL'); setQuadrant('ALL'); setQuery(''); setSelectedYear('2026'); setSelectedMonth('09'); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Clear Filters
            </button>
          )}
        </div>
      </div>

      {section !== 'comparison' && (
        <>
          <ErrorBoundary>
            <VisitKPIRow summary={summary} meta={data.meta} />
          </ErrorBoundary>

          <ErrorBoundary>
            <VisitAlignmentCards
              summary={summary}
              selected={quadrant}
              onSelect={selectQuadrant}
              salesLink={salesLink}
            />
          </ErrorBoundary>
        </>
      )}

      {/* One card holds the view switcher, the search box and the active view,
          the way Dealer Network holds its controls and table together. */}
      <div className="glass-card p-4 sm:p-5 lg:p-6 space-y-5">

        <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between pb-5 border-b border-border/40">
          {/*
            The view switcher. Built here rather than on the shared
            .toggle-pill-* classes because those hard-force a pill radius and a
            small font through !important, and this control needs to read as
            the primary navigation of the page, not as a minor filter.
          */}
          <div
            role="tablist"
            aria-label="Field visit views"
            className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-bg-secondary/70 border border-border/50 flex-wrap"
          >
            {VISIT_SECTIONS.map(s => {
              const count = s.countKey ? counts[s.countKey] : null;
              const isActive = section === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSection(s.key)}
                  className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[14px] font-bold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-accent-blue text-white shadow-md'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                  }`}
                >
                  {s.label}
                  {count != null && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11.5px] font-bold tabular-nums ${
                        isActive ? 'bg-white/25 text-white' : 'bg-bg-card text-text-muted'
                      }`}
                    >
                      {count.toLocaleString('en-IN')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            {/* Role is a sales-team fact, so the control only exists on that
                view. KRM, KRO and everyone else — field staff who carry visits
                but hold no account in the Business Plan — are the three groups
                the plan itself recognises. */}
            {section === 'reps' && (
              <div
                role="group"
                aria-label="Filter by role"
                className="flex items-center gap-1 p-1 bg-bg-secondary/60 rounded-xl border border-border/40"
              >
                {REP_ROLES.map(r => {
                  const on = repRole === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRepRole(r.key)}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                        on
                          ? 'bg-accent-blue text-white shadow-sm'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            )}

            {active.searchHint && (
              <div className="w-full xl:w-[22rem]">
                <SearchInput
                  size="lg"
                  value={query}
                  onChange={setQuery}
                  placeholder={active.searchHint}
                />
              </div>
            )}

            {section !== 'trends' && section !== 'comparison' && (
              <ExportDropdown
                label="CSV"
                entityName={section === 'dealers' ? 'Dealers' : section === 'districts' ? 'Districts' : 'Sales Reps'}
                filteredCount={visibleCount}
                rawCount={
                  section === 'dealers' 
                    ? (data?.dealers || []).length 
                    : section === 'districts' 
                      ? (data?.districts || []).length 
                      : (data?.reps || []).length
                }
                onExportFiltered={handleExportFiltered}
                onExportRaw={handleExportRaw}
              />
            )}
          </div>
        </div>

        {/* Historical month guidance banner when viewing a past month on non-comparison views */}
        {section !== 'comparison' && (selectedYear !== '2026' || selectedMonth !== '09') && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-accent-blue/10 border border-accent-blue/30 text-text-primary">
            <div className="flex items-center gap-2.5">
              <Briefcase className="w-5 h-5 text-accent-blue shrink-0" />
              <span className="text-sm font-semibold">
                Selected period: <strong className="text-accent-blue font-bold">{formatMonthName(selectedMonth)} {selectedYear}</strong>. 
                Full multi-period comparison and district/sales team breakdowns are available in the Comparison tab.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSection('comparison')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent-blue hover:bg-accent-blue/90 text-white font-bold text-xs shrink-0 transition-colors cursor-pointer shadow-sm"
            >
              Open Comparison Tab →
            </button>
          </div>
        )}

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-xl font-extrabold text-text-primary leading-tight">{active.title}</h3>
            {active.countKey && (
              <span className="text-[13px] font-bold text-text-muted whitespace-nowrap">
                Showing {visibleCount.toLocaleString('en-IN')} of{' '}
                {(counts[active.countKey] ?? 0).toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <p className="text-[13.5px] text-text-muted mt-1.5 max-w-3xl leading-relaxed">{active.blurb}</p>
        </div>

        <ErrorBoundary>
          {section === 'dealers' && (
            <DealerVisitTable
              rows={dealers}
              onRowClick={setSelectedDealer}
              elapsedDays={data.meta?.elapsedDays}
            />
          )}
          {section === 'districts' && (
            <DistrictDemandTable
              rows={districtsWithSales}
              elapsedDays={data.meta?.elapsedDays}
              salesDays={despatchElapsedDays}
            />
          )}
          {section === 'reps' && <RepPerformanceTable rows={reps} />}
          {section === 'trends' && (
            <VisitTrendsPanel
              timeAnalytics={data.timeAnalytics}
              monthlyTrend={data.monthlyTrend}
              elapsedDays={data.meta?.elapsedDays}
            />
          )}
          {section === 'comparison' && (
            <VisitComparisonTab
              stateFilter={state}
              onStateChange={setState}
              initialPeriodA={`${selectedYear}-${selectedMonth}`}
            />
          )}
        </ErrorBoundary>

        {active.countKey && visibleCount === 0 && (
          <p className="text-center text-sm text-text-muted py-8">
            No rows match the current filters. Clear them to see everything again.
          </p>
        )}
      </div>

      <DealerScorecardModal
        dealer={selectedDealer}
        onClose={() => setSelectedDealer(null)}
      />
    </div>
  );
}
