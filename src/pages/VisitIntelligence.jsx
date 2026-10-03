import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import DistrictFabricatorPanel from '../components/visits/DistrictFabricatorPanel';
import { LeadsToggle } from '../components/visits/LeadTag';
import VisitRangePicker from '../components/visits/VisitRangePicker';

import { useVisitData } from '../hooks/useVisitData';
import { useVisitRange } from '../hooks/useVisitRange';
import { useRawData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useDashboardTelemetry } from '../context/DashboardTelemetryContext';
import {
  VISIT_SECTIONS,
  buildDespatchIndex,
  buildBusinessPlanDistrictIndex,
  buildBusinessPlanDealerIndex,
  buildRepRoleIndex,
  attachDistrictSales,
  REP_ROLES,
  dealerNameKey,
  quadrantConfig,
  comparableAvg,
  comparableFabricatorAvg,
  visitTrend,
  isUnlinked,
} from '../utils/visits';
import { queryBusinessPlan } from '../services/businessPlanService';
import { prefetchDefaultComparison, fetchNewLeadDealers } from '../services/visitService';
import ExportDropdown from '../components/common/ExportDropdown';
import { downloadCsv, getExportFilename } from '../utils/csvExport';

// Views a picked date range changes, and what they say about it.
const rangeViews = new Set(['districts', 'reps']);
const RANGE_BLURBS = {
  dealers: 'Dealer visits and account groups here are for this month. The date range applies to the KPIs, Districts & Fabricators and Sales Team.',
  districts: 'Fabricator visits by district in the chosen dates, against the same number of days before them. Sales and status are for this month.',
  reps: "Each rep's visits in the chosen dates, against the same number of days before them. Every column covers the chosen dates.",
  trends: 'Timings and monthly trends cover all recorded months. The date range applies to the KPIs, Districts & Fabricators and Sales Team.',
};

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
  const { user } = useAuth();
  const [section, setSection] = useState('dealers');
  // Deep links from the State, District and Dealer tabs, read once.
  const [searchParams] = useSearchParams();
  const [state, setState] = useState(() => searchParams.get('state') || 'ALL');
  const [district, setDistrict] = useState(() => searchParams.get('district') || 'ALL');
  const [quadrant, setQuadrant] = useState('ALL');
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const closeDistrict = useCallback(() => setSelectedDistrict(null), []);
  // The date range the visit views cover. null is the running month, which is
  // the parser's payload; anything else is read from query_visits_range.
  const [range, setRange] = useState(null);
  const [rangePreset, setRangePreset] = useState('month');
  const [repRole, setRepRole] = useState('ALL');
  // The Comparison tab's Period A once someone picks one there ('YYYY-MM').
  // Until then it follows the payload's latest visit month; see defaultPeriod.
  const [pickedPeriod, setPickedPeriod] = useState(null);

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
    summary, stateOptions, districtOptions, salesLink, counts,
  } = useVisitData({
    state,
    district,
    quadrant,
    query,
    role: repRole,
    bpDealerIndex,
    repRoleIndex,
    elapsedDays: despatchElapsedDays,
    user,
  });

  // The running cycle, read from the data rather than pinned to a literal
  // month, which kept showing the old month after every rollover. The tab bar
  // only renders once this payload has loaded, so the Comparison tab never
  // mounts before it is known. The clock is the fallback for a payload that
  // carries no visits at all.
  const defaultPeriod = useMemo(() => {
    const latest = data?.meta?.latestVisitDate;
    if (latest) return latest.slice(0, 7);
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, [data]);
  const periodA = pickedPeriod || defaultPeriod;

  // A picked range replaces the visit figures on the KPI row, the district
  // table and the sales team. Sales, plan and the dealer groups stay monthly.
  const ranged = useVisitRange({ range, state, district, query, role: repRole, data, summary, repRoleIndex, user });

  // Reset district if the active state changes or the current district is no longer among available options
  useEffect(() => {
    if (district !== 'ALL' && districtOptions?.length > 1 && !districtOptions.includes(district)) {
      setDistrict('ALL');
    }
  }, [district, districtOptions]);
  const inRange = ranged.active;
  const shownSummary = inRange ? ranged.summary : summary;
  const shownReps = inRange ? (ranged.reps || []) : reps;
  const shownCounts = inRange && ranged.counts ? { ...counts, ...ranged.counts } : counts;

  // The span the district table counts: day 1 of the latest visit month to
  // the latest visit day. The fabricator panel asks for the same days, so its
  // totals line up with the row that opened it.
  const latestVisitDate = data?.meta?.latestVisitDate;
  const tableRange = useMemo(() => {
    return latestVisitDate ? { from: `${latestVisitDate.slice(0, 7)}-01`, to: latestVisitDate } : null;
  }, [latestVisitDate]);

  // Dealers with a 'new lead' visit this month, for the New lead tag.
  const [newLeadDealers, setNewLeadDealers] = useState(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const fetchedLeadRangeRef = useRef(null);

  useEffect(() => {
    if (!tableRange?.from || !tableRange?.to) return undefined;
    const rangeKey = `${tableRange.from}:${tableRange.to}`;
    if (fetchedLeadRangeRef.current === rangeKey) return undefined;
    fetchedLeadRangeRef.current = rangeKey;

    let live = true;
    let timer = null;
    setLeadsLoading(true);

    const attempt = n => {
      fetchNewLeadDealers(tableRange)
        .then(rows => {
          if (!live) return;
          setNewLeadDealers(new Map((rows || []).map(r => [r.key, r])));
          setLeadsLoading(false);
        })
        .catch(err => {
          if (!live) return;
          if (n < 2) {
            timer = setTimeout(() => attempt(n + 1), n === 0 ? 1500 : 3000);
          } else {
            console.warn('[VisitIntelligence] New lead fetch warning:', err);
            setNewLeadDealers(prev => prev || new Map());
            setLeadsLoading(false);
          }
        });
    };

    attempt(0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [tableRange?.from, tableRange?.to]);

  const tagLeads = useCallback(
    rows => (newLeadDealers
      ? rows.map(d => {
        const lead = newLeadDealers.get(dealerNameKey(d.dealer || d.name));
        return lead ? { ...d, newLead: lead } : d;
      })
      : rows),
    [newLeadDealers]
  );
  const [dealerLeadsOnly, setDealerLeadsOnly] = useState(false);
  const taggedDealers = useMemo(() => tagLeads(dealers), [tagLeads, dealers]);
  const shownDealers = useMemo(
    () => (dealerLeadsOnly ? taggedDealers.filter(d => d.newLead) : taggedDealers),
    [dealerLeadsOnly, taggedDealers]
  );

  // Warm the Comparison tab's opening view once the page's own requests have
  // gone out, so switching to that tab doesn't wait on a cold RPC. It keys on
  // the default period, not later picks, because that is what the tab opens
  // with; the payload loads once, so this fires once per visit to the page.
  useEffect(() => {
    if (!data) return undefined;
    const timer = setTimeout(() => prefetchDefaultComparison(defaultPeriod), 1500);
    return () => clearTimeout(timer);
  }, [data, defaultPeriod]);

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
    () => attachDistrictSales(inRange ? (ranged.districts || []) : districts, despatchIndex, despatchElapsedDays, bpIndex),
    [inRange, ranged.districts, districts, despatchIndex, despatchElapsedDays, bpIndex]
  );

  // Every state and district the fabricator panel's selects can offer: the
  // month payload's districts, plus any only the picked range has. Not the
  // table's filtered rows, so a header filter doesn't narrow the panel.
  const panelDistrictOptions = useMemo(
    () => [...(data?.districts || []), ...(inRange ? (ranged.districts || []) : [])]
      .filter(d => d.state && d.district && d.district.toUpperCase() !== 'UNKNOWN')
      .map(d => ({ state: d.state, district: d.district })),
    [data, inRange, ranged.districts]
  );

  useDashboardTelemetry({
    tabName: 'Field Visits & Tracker',
    filters: {
      section,
      state,
      district,
      quadrant,
      search: query || '',
      repRole,
      year: periodA.slice(0, 4),
      month: periodA.slice(5, 7),
      dateFrom: range?.from || '',
      dateTo: range?.to || '',
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

  const dealerExportCols = [
    { label: 'Dealer Name', getValue: r => r.dealer || r.name || 'Not recorded' },
    { label: 'State', getValue: r => r.state || 'Not recorded' },
    { label: 'District', getValue: r => r.district || 'Not recorded' },
    { label: 'KRM', getValue: formatKrmValue },
    { label: 'KRO', getValue: formatKroValue },
    { label: 'Account Group', getValue: r => quadrantConfig(r.quadrant)?.label || r.quadrant || '—' },
    { label: 'Visits This Month', getValue: r => r.curVisits || 0 },
    { label: 'Usual Visits', getValue: r => comparableAvg(r) },
    { label: 'Visit Net Growth', getValue: r => visitTrend(r).growth },
    { label: 'Actual Sales (MT)', getValue: r => (r.salesActual != null ? Number(r.salesActual).toFixed(1) : (isUnlinked(r) ? 'Unbilled' : '0.0')) },
    { label: 'Business Plan Target (MT)', getValue: r => (r.bpTarget != null ? Number(r.bpTarget).toFixed(1) : '—') },
    { label: 'Target Achievement %', getValue: r => (r.salesAchievedPct != null ? Number(r.salesAchievedPct).toFixed(1) + '%' : '—') },
    { label: 'Market Potential (MT)', getValue: r => (r.bpPotential != null ? Number(r.bpPotential).toFixed(1) : '—') },
    { label: 'New Lead This Month', getValue: r => (r.newLead ? 'Yes' : '') },
  ];

  const districtExportColsFor = rangeMode => [
    { label: 'District', key: 'district' },
    { label: 'State', key: 'state' },
    { label: rangeMode ? 'Fabricator Visits in Period' : 'Fabricator Visits This Month', getValue: r => r.curFabricatorVisits || 0 },
    rangeMode
      ? { label: 'Fabricator Visits, Previous Period', getValue: r => r.rangePrevFabricatorVisits || 0 }
      : { label: 'Usual Fabricator Visits', getValue: r => comparableFabricatorAvg(r) },
    { label: 'Fabricator Visit Growth', getValue: r => Math.round(r.fabricatorGrowth ?? 0) || 0 },
    { label: 'Unique Fabricators Visited', getValue: r => r.curUniqueFabricators || 0 },
    { label: 'Actual Sales (MT)', getValue: r => (r.salesActual != null ? Number(r.salesActual).toFixed(1) : '0.0') },
    { label: 'Business Plan Target (MT)', getValue: r => (r.bpTarget != null ? Number(r.bpTarget).toFixed(1) : '—') },
    { label: 'Plan Achievement %', getValue: r => (r.salesAchievedPct != null ? Number(r.salesAchievedPct).toFixed(1) + '%' : '—') },
    { label: 'Pace Status', getValue: r => r.districtPaceStatus || 'UNKNOWN' },
    ...(rangeMode ? [{ label: 'Period', getValue: () => `${range.from} to ${range.to}` }] : []),
  ];
  const districtExportCols = districtExportColsFor(inRange);

  const repExportColsFor = rangeMode => [
    { label: 'Sales Representative', getValue: r => r.employee_name || r.name || r.rep || '—' },
    { label: 'Role', getValue: r => r.role || 'Field Rep' },
    { label: rangeMode ? 'Visits in Period' : 'Visits This Month', getValue: r => r.curVisits || 0 },
    { label: rangeMode ? 'Visits, Previous Period' : 'Last Month Visits (Same Days)', getValue: r => (r.prevVisitsMtd != null ? r.prevVisitsMtd : '—') },
    { label: 'Net Change in Visits', getValue: r => (r.prevVisitsMtd != null ? (r.curVisits - r.prevVisitsMtd) : '—') },
    { label: 'Visits Per Day', getValue: r => (r.dailyVisitRate != null ? Number(r.dailyVisitRate).toFixed(1) : (r.visitsPerActiveDay != null ? Number(r.visitsPerActiveDay).toFixed(1) : '—')) },
    { label: 'Active Working Days', getValue: r => r.activeDays || 0 },
    { label: 'Accounts Visited', getValue: r => r.uniqueCustomers || 0 },
    { label: 'Dealer Visits', getValue: r => r.dealerVisits || 0 },
    { label: 'Fabricator Visits', getValue: r => r.fabricatorVisits || 0 },
    { label: 'Avg Visit Duration (Mins)', getValue: r => r.avgDurationMins || 0 },
    ...(rangeMode ? [{ label: 'Period', getValue: () => `${range.from} to ${range.to}` }] : []),
  ];
  const repExportCols = repExportColsFor(inRange);

  const handleExportFiltered = () => {
    if (section === 'dealers') {
      downloadCsv(getExportFilename('field_dealers', 'filtered'), dealerExportCols, shownDealers);
    } else if (section === 'districts') {
      downloadCsv(getExportFilename('field_districts', 'filtered'), districtExportCols, districtsWithSales);
    } else if (section === 'reps') {
      downloadCsv(getExportFilename('field_sales_team', 'filtered'), repExportCols, shownReps);
    }
  };

  const handleExportRaw = () => {
    if (section === 'dealers') {
      downloadCsv(getExportFilename('field_dealers', 'raw_all'), dealerExportCols, tagLeads(data?.dealers || []));
    } else if (section === 'districts') {
      const allDistrictsWithSales = attachDistrictSales(data?.districts || [], despatchIndex, despatchElapsedDays, bpIndex);
      downloadCsv(getExportFilename('field_districts', 'raw_all'), districtExportColsFor(false), allDistrictsWithSales);
    } else if (section === 'reps') {
      downloadCsv(getExportFilename('field_sales_team', 'raw_all'), repExportColsFor(false), data?.employees || []);
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

  const rowsFor = { dealers: shownDealers, districts: districtsWithSales, reps: shownReps };
  const visibleCount = rowsFor[section]?.length ?? 0;
  const filtersOn = state !== 'ALL' || district !== 'ALL' || quadrant !== 'ALL' || query !== '' || dealerLeadsOnly;

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
          {filtersOn && (
            <button
              type="button"
              onClick={() => {
                setState('ALL');
                setDistrict('ALL');
                setQuadrant('ALL');
                setQuery('');
                setDealerLeadsOnly(false);
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
            {inRange && !ranged.ready ? (
              ranged.error ? (
                // Said here as well as over the table: on Dealers and Timings &
                // Trends this row is the only part of the page the range drives,
                // and a blank row there explained nothing.
                <div
                  role="alert"
                  className="glass-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-text-primary">Visits for these dates could not be loaded</p>
                      <p className="text-[13px] text-text-muted mt-0.5">{ranged.error}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={ranged.retry}
                    className="inline-flex items-center justify-center gap-1.5 min-h-11 md:min-h-0 px-3.5 py-2 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Try again
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  <SkeletonLoader variant="kpi" count={5} />
                </div>
              )
            ) : (
              <VisitKPIRow summary={shownSummary} meta={data.meta} period={inRange ? ranged.period : null} />
            )}
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

        {/* Single uniform row: Sub tabs on left, filters on right. It scrolls
            sideways on narrow screens rather than wrapping, so nothing in it
            may open a dropdown: the scroll box would clip it. */}
        <div className="flex items-center justify-between gap-2.5 pb-4 border-b border-border/40 overflow-x-auto no-scrollbar">
          {/*
            The view switcher. Built here rather than on the shared
            .toggle-pill-* classes because those hard-force a pill radius and a
            small font through !important, and this control needs to read as
            the primary navigation of the page, not as a minor filter.
          */}
          <div
            role="tablist"
            aria-label="Field visit views"
            className="flex items-center gap-1 p-1 rounded-xl bg-bg-secondary/70 border border-border/50 flex-nowrap shrink-0"
          >
            {VISIT_SECTIONS.map(s => {
              const count = s.countKey ? shownCounts[s.countKey] : null;
              const isActive = section === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSection(s.key)}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] sm:text-[12.5px] font-bold transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-accent-blue text-white shadow-md'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                  }`}
                >
                  {s.label}
                  {count != null && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-bold tabular-nums ${
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

          {/* Unified filters & actions on the right */}
          {section !== 'comparison' && (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <select
                id="visits-state-filter"
                className="filter-select text-[12px] py-1 pl-2.5 pr-7 h-[34px] w-[100px] sm:w-[110px] shrink-0 font-medium"
                value={state}
                onChange={e => {
                  setState(e.target.value);
                  setDistrict('ALL');
                }}
                aria-label="Filter by state"
              >
                {stateOptions.map(st => (
                  <option key={st} value={st}>
                    {st === 'ALL' ? (stateOptions.length === 2 ? `All ${stateOptions[1]}` : 'All States') : st}
                  </option>
                ))}
              </select>

              <select
                id="visits-district-filter"
                className="filter-select text-[12px] py-1 pl-2.5 pr-7 h-[34px] w-[110px] sm:w-[114px] shrink-0 font-medium"
                value={district}
                onChange={e => setDistrict(e.target.value)}
                aria-label="Filter by district"
              >
                <option value="ALL">
                  {districtOptions.length === 2 ? `All ${districtOptions[1]}` : 'All Districts'}
                </option>
                {districtOptions
                  .filter(d => d !== 'ALL')
                  .map(dt => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                  ))}
              </select>

              {/* Role is a sales-team fact, so the control only exists on that view. */}
              {section === 'reps' && (
                <div
                  role="group"
                  aria-label="Filter by role"
                  className="flex items-center gap-0.5 p-0.5 bg-bg-secondary/60 rounded-xl border border-border/40 shrink-0 h-[34px]"
                >
                  {REP_ROLES.map(r => {
                    const on = repRole === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setRepRole(r.key)}
                        className={`px-2 py-1 rounded-lg text-[11px] sm:text-[11.5px] font-bold transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
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

              {section === 'dealers' && (
                <LeadsToggle
                  on={dealerLeadsOnly}
                  count={taggedDealers.filter(d => d.newLead).length}
                  onChange={setDealerLeadsOnly}
                  loading={leadsLoading && !newLeadDealers}
                  compact
                />
              )}

              {active.searchHint && (
                <div className="w-[120px] sm:w-[135px] md:w-[140px] shrink-0">
                  <SearchInput
                    size="xs"
                    value={query}
                    onChange={setQuery}
                    placeholder={
                      section === 'dealers'
                        ? 'Search dealers...'
                        : section === 'districts'
                          ? 'Search districts...'
                          : 'Search reps...'
                    }
                  />
                </div>
              )}

            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h3 className="text-xl font-extrabold text-text-primary leading-tight">{active.title}</h3>
            {/* The period and the export sit with the count they change, out of
                the filter row: that row scrolls sideways on narrow screens,
                which clipped both dropdowns. */}
            <div className="flex flex-wrap items-center gap-2">
              {active.countKey && (!inRange || ranged.ready || !rangeViews.has(section)) && (
                <span className="text-[13px] font-bold text-text-muted whitespace-nowrap mr-1">
                  Showing {visibleCount.toLocaleString('en-IN')} of{' '}
                  {(shownCounts[active.countKey] ?? 0).toLocaleString('en-IN')}
                </span>
              )}

              {/* The period the visit views describe. "This month" is the
                  parser's payload; a picked range is read from field_visits and
                  changes the KPI row, the district table and the sales team.
                  The Comparison tab keeps its own period selectors. */}
              {section !== 'comparison' && data.meta?.latestVisitDate && (
                <VisitRangePicker
                  value={range}
                  preset={rangePreset}
                  latest={data.meta.latestVisitDate}
                  onChange={(next, key) => {
                    setRange(next);
                    setRangePreset(key);
                  }}
                  compact
                />
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
                        : (data?.employees || []).length
                  }
                  onExportFiltered={handleExportFiltered}
                  onExportRaw={handleExportRaw}
                  showChevron
                  compact
                  className="shrink-0"
                />
              )}
            </div>
          </div>
          <p className="text-[13.5px] text-text-muted mt-1.5 max-w-3xl leading-relaxed">
            {inRange && RANGE_BLURBS[section] ? RANGE_BLURBS[section] : active.blurb}
          </p>
        </div>

        <ErrorBoundary>
          {section === 'dealers' && (
            <DealerVisitTable
              rows={shownDealers}
              onRowClick={setSelectedDealer}
              elapsedDays={data.meta?.elapsedDays}
            />
          )}
          {section === 'districts' && (!inRange || ranged.ready) && (
            <DistrictDemandTable
              rows={districtsWithSales}
              elapsedDays={data.meta?.elapsedDays}
              salesDays={despatchElapsedDays}
              onRowClick={tableRange ? setSelectedDistrict : undefined}
              period={inRange ? ranged.period : null}
            />
          )}
          {inRange && rangeViews.has(section) && !ranged.ready && (
            ranged.error ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-sm text-text-muted">{ranged.error}</p>
                <button
                  type="button"
                  onClick={ranged.retry}
                  className="inline-flex items-center gap-1.5 min-h-11 md:min-h-0 px-3.5 py-2 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Try again
                </button>
              </div>
            ) : (
              <SkeletonLoader variant="table-row" count={8} />
            )
          )}
          {section === 'reps' && (!inRange || ranged.ready) && (
            <RepPerformanceTable rows={shownReps} period={inRange ? ranged.period : null} />
          )}
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
              periodA={periodA}
              onPeriodAChange={setPickedPeriod}
              latestVisitDate={data?.meta?.latestVisitDate || null}
            />
          )}
        </ErrorBoundary>

        {active.countKey && visibleCount === 0 && (!inRange || ranged.ready || !rangeViews.has(section)) && (
          <div className="text-center py-8 space-y-2">
            <p className="text-sm text-text-muted">
              No rows match the current filters. Clear them to see everything again.
            </p>
            {filtersOn && (
              <button
                type="button"
                onClick={() => {
                  setState('ALL');
                  setDistrict('ALL');
                  setQuadrant('ALL');
                  setQuery('');
                  setDealerLeadsOnly(false);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      <DealerScorecardModal
        dealer={selectedDealer}
        onClose={() => setSelectedDealer(null)}
      />

      <DistrictFabricatorPanel
        key={selectedDistrict ? `${selectedDistrict.state}|${selectedDistrict.district}` : 'none'}
        district={tableRange ? selectedDistrict : null}
        districtOptions={panelDistrictOptions}
        range={range || tableRange}
        roleIndex={repRoleIndex}
        onClose={closeDistrict}
      />
    </div>
  );
}
