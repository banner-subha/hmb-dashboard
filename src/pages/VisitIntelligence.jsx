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

/**
 * The Comparison tab's Period A is seeded from, and written back to, this
 * page's selected month. Nothing else on the page reads it: the other views
 * come from the parser payload, which covers the running cycle only.
 */
const DEFAULT_PERIOD = { year: '2026', month: '09' };

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
  const [selectedYear, setSelectedYear] = useState(DEFAULT_PERIOD.year);
  const [selectedMonth, setSelectedMonth] = useState(DEFAULT_PERIOD.month);

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

  const formatKrmValue = r => {
    if (r?.krmVisits && r.krmVisits.length > 0) {
      return r.krmVisits.map(k => `${k.name}${k.visits ? ` (${k.visits})` : ''}`).join(', ');
    }
    return r?.assignedKrm || '—';
  };

  const formatKroValue = r => {
    if (r?.kroVisits && r.kroVisits.length > 0) {
      return r.kroVisits.map(k => `${k.name}${k.visits ? ` (${k.visits})` : ''}`).join(', ');
    }
    if (r?.assignedKro) {
      return r.assignedKro;
    }
    if (r?.otherVisits && r.otherVisits.length > 0) {
      return r.otherVisits.map(k => `${k.name}${k.visits ? ` (${k.visits})` : ''}`).join(', ');
    }
    return r?.primaryRep || '—';
  };

  const handleExportFiltered = () => {
    if (section === 'dealers') {
      const cols = [
        { label: 'Dealer Name', key: 'dealer' },
        { label: 'State', getValue: r => r.state || 'Not recorded' },
        { label: 'District', getValue: r => r.district || 'Not recorded' },
        { label: 'KRM', getValue: formatKrmValue },
        { label: 'KRO', getValue: formatKroValue },
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
        { label: 'KRM', getValue: formatKrmValue },
        { label: 'KRO', getValue: formatKroValue },
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
          {/* Comparison carries its own State control next to its District
              one, so the header drops this while that tab is open rather than
              showing the same filter twice. */}
          {section !== 'comparison' && (
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
          )}

          {/* The period the page describes. A label, not a control: the dealer,
              district and sales-team views are all derived from the parser's
              payload, which only ever covers the running cycle, so a year and
              month picker here had nothing to act on. Any other month is the
              Comparison tab's job, and that tab carries its own period
              selectors. */}
          {section !== 'comparison' && (
            <span className="px-3.5 py-2 rounded-xl bg-bg-card/60 border border-border/40 text-[13px] font-bold text-text-secondary whitespace-nowrap">
              {data.meta?.curPeriod || 'This Month'}
              {data.meta?.elapsedDays ? ` · ${data.meta.elapsedDays} Days So Far` : ''}
            </span>
          )}

          {filtersOn && (
            <button
              type="button"
              onClick={() => {
                setState('ALL');
                setQuadrant('ALL');
                setQuery('');
                // The period is left alone. It is no longer a filter over this
                // page — it belongs to the Comparison tab, where the two
                // periods are the subject of the view rather than a filter on
                // it, and clearing them out from under a comparison in
                // progress is not what this button is asking for.
              }}
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
            className="flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-2xl bg-bg-secondary/70 border border-border/50 flex-nowrap shrink-0 overflow-x-auto no-scrollbar"
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
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-[13px] sm:text-[13.5px] font-bold transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-accent-blue text-white shadow-md'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                  }`}
                >
                  {s.label}
                  {count != null && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11px] sm:text-[11.5px] font-bold tabular-nums ${
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

          <div className="flex items-center gap-2 sm:gap-3 flex-nowrap justify-end shrink-0 ml-auto overflow-x-auto no-scrollbar">
            {/* Role is a sales-team fact, so the control only exists on that
                view. KRM, KRO and everyone else — field staff who carry visits
                but hold no account in the Business Plan — are the three groups
                the plan itself recognises. */}
            {section === 'reps' && (
              <div
                role="group"
                aria-label="Filter by role"
                className="flex items-center gap-0.5 sm:gap-1 p-1 bg-bg-secondary/60 rounded-xl border border-border/40 shrink-0"
              >
                {REP_ROLES.map(r => {
                  const on = repRole === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRepRole(r.key)}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] sm:text-[12.5px] font-bold transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
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
              <div className="w-[180px] sm:w-[210px] lg:w-[240px] shrink-0">
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
                label="Export CSV"
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
                className="shrink-0"
              />
            )}
          </div>
        </div>

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
              stateOptions={stateOptions}
              periodA={`${selectedYear}-${selectedMonth}`}
              onPeriodAChange={ym => {
                const [y, m] = ym.split('-');
                setSelectedYear(y);
                setSelectedMonth(m);
              }}
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
