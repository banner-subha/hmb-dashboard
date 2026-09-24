import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Download,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import SkeletonLoader from '../common/SkeletonLoader';
import SearchInput from '../common/SearchInput';
import KPICard from '../common/KPICard';
import { compareVisitsPeriods, compareVisitsRanges, fetchVisitsCalendar, clearComparisonCache, priorYearPeriod as getPriorYear } from '../../services/visitService';
import {
  monthWeeks,
  completeThrough,
  likeForLike,
  formatRange,
  rangeDays,
  rangeKey,
  weekPresets,
  todayLocalISO,
} from '../../utils/visitWeeks';
import { formatTrend, getTrendColor } from '../../utils/trendEngine';
import { downloadCsv } from '../../utils/csvExport';

const MONTH_NAMES = [
  { value: '01', label: 'January', short: 'Jan' },
  { value: '02', label: 'February', short: 'Feb' },
  { value: '03', label: 'March', short: 'Mar' },
  { value: '04', label: 'April', short: 'Apr' },
  { value: '05', label: 'May', short: 'May' },
  { value: '06', label: 'June', short: 'Jun' },
  { value: '07', label: 'July', short: 'Jul' },
  { value: '08', label: 'August', short: 'Aug' },
  { value: '09', label: 'September', short: 'Sep' },
  { value: '10', label: 'October', short: 'Oct' },
  { value: '11', label: 'November', short: 'Nov' },
  { value: '12', label: 'December', short: 'Dec' },
];

function formatPeriod(ym, short = false) {
  if (!ym) return '—';
  const [y, m] = String(ym).split('-');
  const found = MONTH_NAMES.find(item => item.value === m);
  if (!found) return ym;
  return short ? `${found.short} ${y}` : `${found.label} ${y}`;
}

function getPriorMonth(ym) {
  if (!ym) return null;
  const [y, m] = ym.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function signed(n) {
  const v = Number(n) || 0;
  return v > 0 ? `+${v.toLocaleString('en-IN')}` : v.toLocaleString('en-IN');
}

const PAGE_SIZES = [25, 50, 100, 0];

function pageSizeLabel(size) {
  return size === 0 ? 'All' : String(size);
}

/**
 * Pagination bar. It sits above the table rather than below it: these tables
 * run to a couple of hundred rows, and a control you can only reach by
 * scrolling past everything it controls is not much of a control.
 */
function TablePagination({ total, page, pageCount, pageSize, onPage, onPageSize, noun }) {
  const start = total === 0 ? 0 : (pageSize === 0 ? 1 : (page - 1) * pageSize + 1);
  const end = pageSize === 0 ? total : Math.min(page * pageSize, total);
  const atFirst = page <= 1;
  const atLast = page >= pageCount;

  const navBtn = 'p-2 rounded-lg border border-border/60 bg-bg-card text-text-secondary transition-colors';
  const navOn = 'hover:bg-bg-card-hover hover:text-text-primary cursor-pointer';
  const navOff = 'opacity-40 cursor-not-allowed';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[14px] font-semibold text-text-secondary tabular-nums">
          {total === 0
            ? `No ${noun}`
            : <>Showing <span className="font-bold text-text-primary">{start.toLocaleString('en-IN')}–{end.toLocaleString('en-IN')}</span> of <span className="font-bold text-text-primary">{total.toLocaleString('en-IN')}</span> {noun}</>}
        </span>

        <label className="flex items-center gap-2 text-[13px] font-bold text-text-muted uppercase tracking-wider">
          Rows
          <select
            className="filter-select text-[14px] py-1.5 px-3 font-bold"
            value={pageSize}
            onChange={e => onPageSize(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map(s => (
              <option key={s} value={s}>{pageSizeLabel(s)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(1)}
          disabled={atFirst}
          aria-label="First page"
          className={`${navBtn} ${atFirst ? navOff : navOn}`}
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={atFirst}
          aria-label="Previous page"
          className={`${navBtn} ${atFirst ? navOff : navOn}`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="px-3 text-[14px] font-bold text-text-secondary tabular-nums whitespace-nowrap">
          Page {page.toLocaleString('en-IN')} of {pageCount.toLocaleString('en-IN')}
        </span>

        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={atLast}
          aria-label="Next page"
          className={`${navBtn} ${atLast ? navOff : navOn}`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onPage(pageCount)}
          disabled={atLast}
          aria-label="Last page"
          className={`${navBtn} ${atLast ? navOff : navOn}`}
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Field visit period comparison.
 *
 * The period selectors live here and nowhere else. The page header used to
 * carry its own year and month dropdowns, and on this sub-tab they did
 * nothing at all: this view asks the comparison RPC for two explicit periods
 * and never read them. They now sit in the card below, and Period A writes
 * back to the page's month, so switching to Dealers or Sales Team lands on
 * the month you were just comparing. The state filter stays in the page
 * header, shared by every sub-tab, rather than being repeated here.
 */
export default function VisitComparisonTab({
  stateFilter = 'ALL',
  onStateChange,
  stateOptions = [],
  periodA,
  onPeriodAChange,
  latestVisitDate = null,
}) {
  // Available calendar — which months the visit feed actually holds.
  const [calendar, setCalendar] = useState(null);

  // Month or week comparison. Weeks are fixed date blocks of the month, 1–7,
  // 8–14, 15–21, 22–28, 29–end (see utils/visitWeeks.js). Week picks stay
  // local: the page's own period is a month, so only month mode writes
  // Period A back.
  const [mode, setMode] = useState('month');
  const [weekA, setWeekA] = useState(null);
  const [weekB, setWeekB] = useState(null);
  const [clickedWeekPreset, setClickedWeekPreset] = useState(null);

  // District scope. Sent to the RPC rather than applied to the rows here:
  // the KPI ribbon, the sales team and the customer-type mix are all
  // aggregated server side, so filtering in the browser would narrow the
  // districts table and quietly leave the other three state-wide.
  const [district, setDistrict] = useState('ALL');

  // Held separately from `data` so the dropdown keeps its full list while a
  // request is in flight, and does not collapse to the district just picked.
  const [districtOptions, setDistrictOptions] = useState([]);

  // Pagination for the two row-based breakdowns.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Period B is a benchmark, not a page-level filter, so it stays local.
  const [periodB, setPeriodB] = useState(() => getPriorYear(periodA) || '2025-09');

  // Sub-view: 'districts', 'reps', 'customer_types', 'movement'
  const [subView, setSubView] = useState('districts');
  const [searchQuery, setSearchQuery] = useState('');

  // Sorting
  const [sortField, setSortField] = useState('visits_a');
  const [sortAsc, setSortAsc] = useState(false);

  // Comparison data
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Request sequencing to discard stale responses
  const requestSeqRef = useRef(0);

  // Bumped by the Retry button so a retry runs through the same fetch effect,
  // with the district scope and stale-response guard, instead of a side path.
  const [retryTick, setRetryTick] = useState(0);

  // Load calendar on mount
  useEffect(() => {
    let mounted = true;
    fetchVisitsCalendar()
      .then(res => {
        if (mounted) setCalendar(res);
      })
      .catch(err => {
        console.warn('[VisitComparisonTab] Calendar fetch error:', err);
      });

    return () => { mounted = false; };
  }, []);

  // A district belongs to one state, so changing the state retires whichever
  // district was selected.
  //
  // Adjusted during render rather than in an effect, the way SearchInput syncs
  // its own box. React finishes this re-render before committing, so the fetch
  // effect below only ever sees the settled pair and a state change costs one
  // request instead of two.
  const [prevStateFilter, setPrevStateFilter] = useState(stateFilter);
  if (prevStateFilter !== stateFilter) {
    setPrevStateFilter(stateFilter);
    setDistrict('ALL');
  }

  // Newest visit day: the database's own when the calendar reports it
  // (migration 020), otherwise the visits payload's. `through` is the last
  // fully loaded day, which is where a running week is cut.
  const latestDay = calendar?.latest_date || latestVisitDate || null;
  const through = useMemo(() => completeThrough(latestDay, todayLocalISO()), [latestDay]);

  // What is actually compared: the picked weeks, cut at `through` and matched
  // to the same number of days.
  const weekCompare = useMemo(
    () => (weekA && weekB ? likeForLike(weekA, weekB, through) : null),
    [weekA, weekB, through]
  );
  const effA = weekCompare?.a;
  const effB = weekCompare?.b;
  const weekKeyA = effA ? rangeKey(effA) : null;
  const weekKeyB = effB ? rangeKey(effB) : null;

  // Fetch comparison data when the periods or the state/district scope changes
  useEffect(() => {
    // Ranges travel as keys so the effect re-runs on a new span, not on every
    // fresh object with the same dates.
    const toRange = key => {
      const [from, to] = key.split('_');
      return { from, to };
    };
    if (mode === 'week' && (!weekKeyA || !weekKeyB)) return undefined;
    let mounted = true;
    const seq = ++requestSeqRef.current;

    // Small debounce to collapse rapid consecutive dropdown clicks
    const timer = setTimeout(() => {
      if (!mounted) return;
      setLoading(true);
      setError(null);

      const request = mode === 'week'
        ? compareVisitsRanges({ a: toRange(weekKeyA), b: toRange(weekKeyB), state: stateFilter, district })
        : compareVisitsPeriods({ periodA, periodB, state: stateFilter, district });
      request
        .then(res => {
          if (seq !== requestSeqRef.current || !mounted) return;
          setData(res);
          if (Array.isArray(res?.district_options)) {
            setDistrictOptions(res.district_options);
          }
          setError(null);
        })
        .catch(err => {
          if (seq !== requestSeqRef.current || !mounted) return;
          console.error('[VisitComparisonTab] Compare error:', err);
          setError(err.message || 'Failed to compare visits data.');
        })
        .finally(() => {
          if (seq === requestSeqRef.current && mounted) {
            setLoading(false);
          }
        });
    }, 150);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [mode, periodA, periodB, weekKeyA, weekKeyB, stateFilter, district, retryTick]);

  const yearsList = useMemo(
    () => (calendar?.years?.length ? calendar.years.map(String) : ['2026', '2025']),
    [calendar]
  );

  /**
   * Only the months that year actually has rows for. Offering all twelve every
   * year is part of why these dropdowns felt broken: picking a month with no
   * data returned an empty comparison that read as a failure rather than as a
   * month nobody has recorded visits in yet.
   */
  const monthsFor = year => {
    const rows = calendar?.by_year?.[String(year)];
    if (!Array.isArray(rows) || rows.length === 0) return MONTH_NAMES;
    const available = new Set(rows.map(r => String(r.month).split('-')[1]));
    const list = MONTH_NAMES.filter(m => available.has(m.value));
    return list.length > 0 ? list : MONTH_NAMES;
  };

  const setPeriod = (which, ym) => {
    if (which === 'A') onPeriodAChange?.(ym);
    else setPeriodB(ym);
  };

  const handleYearChange = (which, year) => {
    const [, m] = (which === 'A' ? periodA : periodB).split('-');
    const months = monthsFor(year);
    // Sep exists in 2026 but not necessarily in a year that ended early, so a
    // year change keeps the month when it is available and otherwise falls to
    // the latest month that year does have.
    const keep = months.some(x => x.value === m) ? m : months[months.length - 1].value;
    setPeriod(which, `${year}-${keep}`);
  };

  const handleMonthChange = (which, month) => {
    const [y] = (which === 'A' ? periodA : periodB).split('-');
    setPeriod(which, `${y}-${month}`);
  };

  const handleSwap = () => {
    if (mode === 'week') {
      setWeekA(weekB);
      setWeekB(weekA);
      return;
    }
    const a = periodA;
    setPeriodB(a);
    onPeriodAChange?.(periodB);
  };

  const latestMonth = calendar?.latest_month || null;

  /**
   * Presets are relative, never pinned to a literal month. "Aug 2026 vs Aug
   * 2025" stops being a shortcut the moment the data rolls forward; "latest
   * month" keeps meaning the newest month in the feed.
   */
  const presets = useMemo(() => ([
    {
      key: 'mom',
      label: 'vs Prior Month',
      a: periodA,
      b: getPriorMonth(periodA),
    },
    {
      key: 'yoy',
      label: 'vs Same Month Last Year',
      a: periodA,
      b: getPriorYear(periodA),
    },
    {
      key: 'latest_mom',
      label: latestMonth ? `${formatPeriod(latestMonth, true)} vs Prior Month` : 'Latest vs Prior Month',
      a: latestMonth,
      b: getPriorMonth(latestMonth),
    },
    {
      key: 'latest_yoy',
      label: latestMonth ? `${formatPeriod(latestMonth, true)} Year on Year` : 'Latest Year on Year',
      a: latestMonth,
      b: getPriorYear(latestMonth),
    },
  ]), [periodA, latestMonth]);

  /**
   * Which preset to light up.
   *
   * More than one can describe the same pair of periods. The first two hold
   * Period A where it is and only move the benchmark; the last two also jump
   * Period A to the latest month. When A is already the latest month — the
   * default — those are the same pair, so a plain `find` always awarded the
   * highlight to the first two and the last two could never light up at all,
   * which read as the buttons being dead.
   *
   * So the button that was actually pressed wins whenever it still describes
   * the current pair. Reaching the same pair through the dropdowns instead
   * falls back to the first preset that matches.
   */
  const [clickedPreset, setClickedPreset] = useState(null);

  const activePreset = useMemo(() => {
    const matches = presets.filter(p => p.a === periodA && p.b === periodB);
    if (matches.length === 0) return null;
    if (clickedPreset && matches.some(m => m.key === clickedPreset)) return clickedPreset;
    return matches[0].key;
  }, [presets, periodA, periodB, clickedPreset]);

  const applyPreset = p => {
    if (!p.a || !p.b) return;
    setClickedPreset(p.key);
    setPeriodB(p.b);
    if (p.a !== periodA) onPeriodAChange?.(p.a);
  };

  // ── Week mode ──────────────────────────────────────────────────────────────

  const weekPresetList = useMemo(() => weekPresets(through), [through]);

  // Weeks of a month that have started by the last complete day.
  const weeksFor = ym => monthWeeks(ym).filter(w => !through || w.from <= through);

  const setWeek = (which, range) => (which === 'A' ? setWeekA(range) : setWeekB(range));

  /**
   * Moving a week's year or month keeps its week number when that month has
   * it, and otherwise lands on the month's last started week.
   */
  const handleWeekMonthChange = (which, ym) => {
    const current = which === 'A' ? weekA : weekB;
    const weeks = weeksFor(ym);
    if (weeks.length === 0) return;
    const idx = current ? (monthWeeks(current.from.slice(0, 7)).find(w => w.from <= current.from && current.from <= w.to)?.idx || 1) : 1;
    const pick = weeks.find(w => w.idx === idx) || weeks[weeks.length - 1];
    setWeek(which, { from: pick.from, to: pick.to });
  };

  const handleWeekYearChange = (which, year) => {
    const current = which === 'A' ? weekA : weekB;
    const m = current?.from.slice(5, 7);
    const months = monthsFor(year);
    const keep = months.some(x => x.value === m) ? m : months[months.length - 1].value;
    handleWeekMonthChange(which, `${year}-${keep}`);
  };

  const applyWeekPreset = p => {
    setClickedWeekPreset(p.key);
    setWeekA(p.a);
    setWeekB(p.b);
  };

  const activeWeekPreset = useMemo(() => {
    if (!weekA || !weekB) return null;
    const same = (x, y) => x.from === y.from && x.to === y.to;
    const matches = weekPresetList.filter(p => same(p.a, weekA) && same(p.b, weekB));
    if (matches.length === 0) return null;
    if (clickedWeekPreset && matches.some(m => m.key === clickedWeekPreset)) return clickedWeekPreset;
    return matches[0].key;
  }, [weekPresetList, weekA, weekB, clickedWeekPreset]);

  // The first switch to Week opens on this week against last week.
  const switchMode = next => {
    if (next === mode) return;
    if (next === 'week' && !weekA && weekPresetList[0]) applyWeekPreset(weekPresetList[0]);
    setMode(next);
  };

  const [yearA, monthA] = periodA.split('-');
  const [yearB, monthB] = periodB.split('-');
  const isWeek = mode === 'week' && effA && effB;
  const labelA = isWeek ? formatRange(effA) : formatPeriod(periodA, true);
  const labelB = isWeek ? formatRange(effB) : formatPeriod(periodB, true);
  // File names and the pagination reset key: plain, sortable, no spaces.
  const keyA = isWeek ? weekKeyA : periodA;
  const keyB = isWeek ? weekKeyB : periodB;

  // The page owns the state list, but this tab renders while the page's own
  // visit payload is still loading, so fall back to whatever is selected
  // rather than briefly showing an empty dropdown.
  const stateList = useMemo(() => {
    const list = stateOptions?.length 
      ? stateOptions.filter(s => s && s.trim() !== '' && s.toUpperCase() !== 'UNKNOWN')
      : ['ALL'];
    if (stateFilter && stateFilter !== 'ALL' && stateFilter.toUpperCase() !== 'UNKNOWN' && !list.includes(stateFilter)) {
      list.push(stateFilter);
    }
    return list;
  }, [stateOptions, stateFilter]);

  /**
   * District names only — the state is never appended, because choosing a
   * district now sets the state for you rather than leaving you to read which
   * state it belonged to.
   *
   * Each entry keeps its owning state so that mapping can happen, and the list
   * is deduplicated case-insensitively: the feed spells some states two ways
   * ("Assam" and "ASSAM"), which otherwise puts the same district in twice.
   * Sorted by name rather than by the RPC's state-then-name order, which looks
   * arbitrary once the state is no longer on screen.
   */
  const districtList = useMemo(() => {
    const rows = Array.isArray(districtOptions) ? districtOptions : [];
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const name = r?.district;
      if (!name || !name.trim() || name.toUpperCase() === 'UNKNOWN' || name.toUpperCase() === 'NULL') continue;
      const key = name.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value: name, state: r.state || null });
    }
    return out.sort((a, b) => a.value.localeCompare(b.value));
  }, [districtOptions]);

  /**
   * The district's own state, matched back to the exact spelling the page's
   * state dropdown uses. The visit feed writes states in upper case while the
   * page lists them in title case, so this compares case-insensitively and
   * returns the page's spelling — anything else would leave the state select
   * showing a blank value.
   */
  const resolveStateOption = raw => {
    if (!raw) return null;
    const needle = String(raw).toLowerCase();
    return stateList.find(s => s !== 'ALL' && s.toLowerCase() === needle) || null;
  };

  /**
   * Picking a district adopts that district's state, so the two controls can
   * never describe a combination that has no rows in it.
   *
   * prevStateFilter is moved forward by hand here. The state change below is
   * the one case where it must NOT clear the district — that guard exists to
   * drop a district when you switch states, and this is the reverse.
   */
  const handleDistrictChange = value => {
    if (value === 'ALL') {
      setDistrict('ALL');
      return;
    }
    const owner = resolveStateOption(districtList.find(d => d.value === value)?.state);
    if (owner && owner !== stateFilter) {
      setPrevStateFilter(owner);
      onStateChange?.(owner);
    }
    setDistrict(value);
  };

  const scopeOn = stateFilter !== 'ALL' || district !== 'ALL';

  // CSV Export for the comparison
  const handleExportCsv = () => {
    if (!data) return;
    const dateStr = new Date().toISOString().split('T')[0];

    if (subView === 'districts') {
      const cols = [
        { label: 'District', key: 'district' },
        { label: 'State', key: 'state' },
        { label: `Visits (${labelA})`, key: 'visits_a' },
        { label: `Visits (${labelB})`, key: 'visits_b' },
        { label: 'Change', key: 'delta' },
        { label: 'Growth %', getValue: r => r.growth_pct != null ? `${r.growth_pct}%` : '—' },
        { label: `Fabricators (${labelA})`, key: 'fabricators_a' },
        { label: `Fabricators (${labelB})`, key: 'fabricators_b' },
        { label: `Accounts Visited (${labelA})`, key: 'customers_a' },
        { label: `Accounts Visited (${labelB})`, key: 'customers_b' },
      ];
      downloadCsv(`hmb_visit_comparison_districts_${keyA}_vs_${keyB}_${dateStr}.csv`, cols, data.districts || []);
    } else if (subView === 'reps') {
      const cols = [
        { label: 'Sales Representative', key: 'rep' },
        { label: `Visits (${labelA})`, key: 'visits_a' },
        { label: `Visits (${labelB})`, key: 'visits_b' },
        { label: 'Change', key: 'delta' },
        { label: 'Growth %', getValue: r => r.growth_pct != null ? `${r.growth_pct}%` : '—' },
        { label: `Active Days (${labelA})`, key: 'active_days_a' },
        { label: `Active Days (${labelB})`, key: 'active_days_b' },
        { label: `Accounts Visited (${labelA})`, key: 'customers_a' },
        { label: `Accounts Visited (${labelB})`, key: 'customers_b' },
      ];
      downloadCsv(`hmb_visit_comparison_sales_team_${keyA}_vs_${keyB}_${dateStr}.csv`, cols, data.reps || []);
    } else if (subView === 'customer_types') {
      const cols = [
        { label: 'Customer Type', key: 'customer_type' },
        { label: `Visits (${labelA})`, key: 'visits_a' },
        { label: `Share % (${labelA})`, getValue: r => `${r.share_a_pct}%` },
        { label: `Visits (${labelB})`, key: 'visits_b' },
        { label: `Share % (${labelB})`, getValue: r => `${r.share_b_pct}%` },
        { label: 'Change', key: 'delta' },
        { label: 'Growth %', getValue: r => r.growth_pct != null ? `${r.growth_pct}%` : '—' },
      ];
      downloadCsv(`hmb_visit_comparison_customer_types_${keyA}_vs_${keyB}_${dateStr}.csv`, cols, data.customer_types || []);
    } else if (subView === 'movement') {
      const gainers = (data.top_gainers || []).map(r => ({ ...r, direction: 'Expansion' }));
      const decliners = (data.top_decliners || []).map(r => ({ ...r, direction: 'Reduction' }));
      const combined = [...gainers, ...decliners];
      const cols = [
        { label: 'Account Name', key: 'customer_name' },
        { label: 'Customer Type', key: 'customer_type' },
        { label: 'District', key: 'district' },
        { label: 'State', key: 'state' },
        { label: 'Direction', key: 'direction' },
        { label: `Visits (${labelA})`, key: 'visits_a' },
        { label: `Visits (${labelB})`, key: 'visits_b' },
        { label: 'Change', key: 'delta' },
      ];
      downloadCsv(`hmb_visit_account_movement_${keyA}_vs_${keyB}_${dateStr}.csv`, cols, combined);
    }
  };

  // Helper for sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortArrow = field => (sortField === field ? (sortAsc ? ' ↑' : ' ↓') : '');

  // Anything that changes which rows exist, or their order, sends you back to
  // the first page. Staying on page 6 of a list that just shrank to two pages
  // shows an empty table and reads as a failed filter.
  const pageKey = [subView, searchQuery, sortField, sortAsc, keyA, keyB, stateFilter, district].join('|');
  const [prevPageKey, setPrevPageKey] = useState(pageKey);
  if (prevPageKey !== pageKey) {
    setPrevPageKey(pageKey);
    setPage(1);
  }

  // Filtered & sorted data for active sub-view.
  //
  // The two row sets are pulled out of `data` before the memos rather than
  // reached into inside them: the React Compiler infers a dependency on the
  // whole of `data` from `data.districts` and then refuses to optimise the
  // component because that is broader than the declared dependency list.
  const districtRows = data?.districts;
  const repRows = data?.reps;

  const districtsList = useMemo(() => {
    if (!districtRows) return [];
    let list = districtRows;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(d =>
        (d.district && d.district.toLowerCase().includes(q)) ||
        (d.state && d.state.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      const valA = a[sortField] ?? 0;
      const valB = b[sortField] ?? 0;
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [districtRows, searchQuery, sortField, sortAsc]);

  const repsList = useMemo(() => {
    if (!repRows) return [];
    let list = repRows;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => r.rep && r.rep.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const valA = a[sortField] ?? 0;
      const valB = b[sortField] ?? 0;
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [repRows, searchQuery, sortField, sortAsc]);

  // Paging is derived rather than stored, so a page number left over from a
  // longer list is clamped on the way out instead of having to be corrected
  // by a second render.
  const activeList = subView === 'reps' ? repsList : districtsList;
  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(activeList.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const pagedRows = pageSize === 0
    ? activeList
    : activeList.slice((safePage - 1) * pageSize, safePage * pageSize);

  const pagination = (
    <TablePagination
      total={activeList.length}
      page={safePage}
      pageCount={pageCount}
      pageSize={pageSize}
      onPage={setPage}
      onPageSize={size => { setPageSize(size); setPage(1); }}
      noun={subView === 'reps' ? 'sales reps' : 'districts'}
    />
  );

  /**
   * The metric ribbon, described as data so it can render on the shared
   * KPICard the rest of this page uses. It previously had a private card
   * component with its own border treatment, its own type scale and a bespoke
   * sixth tile, which is why this row read as a different product from the
   * ribbon sitting directly above it on every other sub-tab.
   */
  const kpiCards = useMemo(() => {
    if (!data?.kpi_a || !data?.kpi_b) return null;
    const a = data.kpi_a;
    const b = data.kpi_b;

    const build = (label, accent, cur, prev, { unit = '', decimals = 0 } = {}) => {
      const c = Number(cur) || 0;
      const p = Number(prev) || 0;
      const diff = Number((c - p).toFixed(decimals));
      const pct = p > 0 ? Number((((c - p) / p) * 100).toFixed(1)) : null;
      const curText = decimals > 0 ? c.toFixed(decimals) : c.toLocaleString('en-IN');
      const prevText = decimals > 0 ? p.toFixed(decimals) : p.toLocaleString('en-IN');
      const suffix = unit ? ` ${unit}` : '';
      return {
        label,
        accent,
        value: `${curText}${suffix}`,
        momDisplay: pct != null ? formatTrend(pct) : undefined,
        momColor: pct != null ? getTrendColor(pct) : undefined,
        subtitle: `${signed(diff)}${suffix} vs ${prevText}${suffix} in ${labelB}`,
      };
    };

    return [
      build('Total Field Visits', '#3b82f6', a.total_visits, b.total_visits),
      build('Dealer Visits', '#22c55e', a.dealer_visits, b.dealer_visits),
      build('Fabricator Visits', '#94a3b8', a.fabricator_visits, b.fabricator_visits),
      build('Accounts Visited', '#06b6d4', a.unique_customers, b.unique_customers),
      build('Active Sales Reps', '#eab308', a.active_reps, b.active_reps),
      build('Avg Visit Length', '#f59e0b', a.avg_duration, b.avg_duration, { unit: 'min', decimals: 1 }),
    ];
  }, [data, labelB]);

  const subViews = [
    { key: 'districts', label: 'Districts & Coverage', count: data?.districts?.length },
    { key: 'reps', label: 'Sales Team', count: data?.reps?.length },
    { key: 'customer_types', label: 'Customer Types', count: data?.customer_types?.length },
    { key: 'movement', label: 'Account Movement', count: (data?.top_gainers?.length || 0) + (data?.top_decliners?.length || 0) },
  ];

  // One line per period: the headline above already names both periods, so
  // the box carries only its A/B chip and the pickers.
  const periodBox = (which, caption, year, month) => (
    <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          title={caption}
          className={`w-6 h-6 rounded-md grid place-items-center text-[12px] font-black shrink-0 ${
            which === 'A'
              ? 'bg-accent-blue/15 text-accent-blue'
              : 'bg-amber-500/15 text-amber-400'
          }`}
        >
          {which}
          <span className="sr-only"> {caption}</span>
        </span>
      <select
        className="filter-select text-[13px] py-1.5 px-2.5 font-bold w-[5.5rem] shrink-0"
        value={year}
        onChange={e => handleYearChange(which, e.target.value)}
        aria-label={`Period ${which} year`}
      >
        {yearsList.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select
        className="filter-select text-[13px] py-1.5 px-2.5 font-bold min-w-0 flex-1"
        value={month}
        onChange={e => handleMonthChange(which, e.target.value)}
        aria-label={`Period ${which} month`}
      >
        {monthsFor(year).map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
    </div>
  );

  /**
   * Week counterpart of periodBox: year, month, then the month's weeks. The
   * header shows the span actually compared, which after like-for-like
   * matching can be shorter than the week picked below it.
   */
  const weekBox = (which, caption, picked, compared) => {
    if (!picked || !compared) return null;
    const ym = picked.from.slice(0, 7);
    const [year] = ym.split('-');
    const weeks = weeksFor(ym);
    const pickedKey = rangeKey(picked);

    return (
      <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            title={caption}
            className={`w-6 h-6 rounded-md grid place-items-center text-[12px] font-black shrink-0 ${
              which === 'A'
                ? 'bg-accent-blue/15 text-accent-blue'
                : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            {which}
            <span className="sr-only"> {caption}</span>
          </span>
        <select
          className="filter-select text-[13px] py-1.5 px-2.5 font-bold w-[5.5rem] shrink-0"
          value={year}
          onChange={e => handleWeekYearChange(which, e.target.value)}
          aria-label={`Week ${which} year`}
        >
          {yearsList.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className="filter-select text-[13px] py-1.5 px-2.5 font-bold w-[7.5rem] shrink-0"
          value={ym.split('-')[1]}
          onChange={e => handleWeekMonthChange(which, `${year}-${e.target.value}`)}
          aria-label={`Week ${which} month`}
        >
          {monthsFor(year).map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          className="filter-select text-[13px] py-1.5 px-2.5 font-bold min-w-0 flex-1"
          value={pickedKey}
          onChange={e => {
            const [from, to] = e.target.value.split('_');
            setWeek(which, { from, to });
          }}
          aria-label={`Week ${which}`}
        >
          {weeks.map(w => (
            <option key={w.idx} value={rangeKey(w)}>
              Wk {w.idx} · {formatRange(w, { year: false })}
            </option>
          ))}
        </select>
      </div>
    );
  };

  // Plain-language note under the headline, only for what changes the read:
  // a running week matched to the same days, the newest day left out of a
  // week it belongs to, or two spans of different length.
  const touchesLatest = r => latestDay && r.from <= latestDay && latestDay <= r.to;
  const weekNote = isWeek
    ? [
        weekCompare.matched
          ? `${rangeDays(effA) === 1 ? 'First day' : `First ${rangeDays(effA)} days`} so far, matched to the same days`
          : null,
        through && through < latestDay && (touchesLatest(weekA) || touchesLatest(weekB))
          ? `${formatRange({ from: latestDay, to: latestDay }, { year: false })} still loading`
          : null,
        !weekCompare.matched && rangeDays(effA) !== rangeDays(effB)
          ? `${rangeDays(effA)} days vs ${rangeDays(effB)} ${rangeDays(effB) === 1 ? 'day' : 'days'}, so the totals are not a fair match`
          : null,
      ].filter(Boolean).join(' · ')
    : '';

  const modeBtn = on =>
    `px-2.5 py-1 rounded-md text-[12.5px] font-bold transition-colors duration-150 cursor-pointer ${
      on ? 'bg-accent-blue text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
    }`;

  const shownPresets = mode === 'week' ? weekPresetList : presets;
  const shownActive = mode === 'week' ? activeWeekPreset : activePreset;

  return (
    <div className="space-y-4 animate-fade-in">

      {/*
        Metric ribbon first: the six figures are the answer, the period and
        scope controls below are how to change the question. One row from xl;
        fitValue scales each figure to its tile rather than a fixed size, and
        --kpi-fit holds every figure in the row to one modest size.
      */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <SkeletonLoader variant="kpi" count={6} />
        </div>
      )}
      {!loading && !error && kpiCards && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 [--kpi-fit:6.5]">
          {kpiCards.map(card => (
            <KPICard
              key={card.label}
              fitValue
              label={card.label}
              value={card.value}
              subtitle={card.subtitle}
              momDisplay={card.momDisplay}
              momColor={card.momColor}
              accentColor={card.accent}
            />
          ))}
        </div>
      )}

      {/* ──────────────── Period selection ──────────────── */}
      <div className="glass-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          {/*
            No second "Compare Field Visits" heading here — the section title
            directly above this card already says it. This slot carries what
            that title cannot: the two periods currently in play, and the state
            scope inherited from the page header.
          */}
          <div className="flex items-start gap-3">
            <Calendar className="w-[18px] h-[18px] text-accent-blue shrink-0 mt-0.5" />
            <div>
              <div className="text-base font-extrabold text-text-primary leading-tight">
                {isWeek ? labelA : formatPeriod(periodA)} <span className="text-text-muted font-bold">vs</span> {isWeek ? labelB : formatPeriod(periodB)}
              </div>
              {weekNote && (
                <p className="text-[13px] font-semibold text-text-secondary mt-1">{weekNote}</p>
              )}
              <p className="text-[13px] text-text-muted mt-1 leading-snug">
                {stateFilter === 'ALL' ? 'All states' : stateFilter}
                {district !== 'ALL' ? ` · ${district} district` : ''}. Every figure on this tab uses this scope.
              </p>
            </div>
          </div>

          {/* Grain switch, then the presets for that grain, lit when active */}
          <div className="flex flex-wrap items-center lg:justify-end gap-2 self-start">
          <div
            role="group"
            aria-label="Compare by"
            className="flex items-center gap-0.5 p-0.5 rounded-lg bg-bg-secondary/70 border border-border/50"
          >
            <button type="button" aria-pressed={mode === 'month'} onClick={() => switchMode('month')} className={modeBtn(mode === 'month')}>
              Month
            </button>
            <button
              type="button"
              aria-pressed={mode === 'week'}
              onClick={() => switchMode('week')}
              disabled={!through}
              className={through ? modeBtn(mode === 'week') : 'px-2.5 py-1 rounded-md text-[12.5px] font-bold text-text-muted/50 cursor-not-allowed'}
            >
              Week
            </button>
          </div>
          <div
            role="group"
            aria-label="Comparison presets"
            className="flex items-center gap-0.5 p-0.5 rounded-lg bg-bg-secondary/70 border border-border/50 flex-wrap"
          >
            {shownPresets.map(p => {
              const on = shownActive === p.key;
              const disabled = !p.a || !p.b;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => (mode === 'week' ? applyWeekPreset(p) : applyPreset(p))}
                  className={`px-2.5 py-1 rounded-md text-[12.5px] font-bold transition-colors duration-150 whitespace-nowrap ${
                    disabled
                      ? 'text-text-muted/50 cursor-not-allowed'
                      : on
                        ? 'bg-accent-blue text-white cursor-pointer'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-card cursor-pointer'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          </div>
        </div>

        {/* Period A / swap / Period B, then scope, on one line from xl */}
        <div className="flex flex-col xl:flex-row xl:items-center gap-3 pt-3 border-t border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
            {isWeek ? weekBox('A', 'This period', weekA, effA) : periodBox('A', 'This period', yearA, monthA)}
            <button
              type="button"
              onClick={handleSwap}
              title="Swap the two periods"
              aria-label="Swap the two periods"
              className="self-center p-1.5 rounded-md border border-border/60 bg-bg-card hover:bg-bg-card-hover text-text-secondary hover:text-accent-blue transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
            {isWeek ? weekBox('B', 'Compared with', weekB, effB) : periodBox('B', 'Compared with', yearB, monthB)}
          </div>

          {/*
            Scope sits with the periods, not above the table, because it is not a
            table refinement: both selections go to the RPC and narrow the KPI
            ribbon and all four breakdowns together. The state control lives here
            rather than in the page header while this tab is open, so there is
            only ever one of it on screen.
          */}
          <div className="flex flex-wrap items-center gap-2 xl:pl-3 xl:border-l xl:border-border/40">
            <span className="text-[12px] font-bold uppercase tracking-wider text-text-muted shrink-0">
              Scope
            </span>
            <select
              className="filter-select text-[13px] py-1.5 px-2.5 font-bold w-[150px]"
              value={stateFilter}
              onChange={e => onStateChange?.(e.target.value)}
              aria-label="Filter by state"
            >
              {stateList.map(st => (
                <option key={st} value={st}>{st === 'ALL' ? 'All States' : st}</option>
              ))}
            </select>
            <select
              className="filter-select text-[13px] py-1.5 px-2.5 font-bold w-[180px]"
              value={district}
              onChange={e => handleDistrictChange(e.target.value)}
              aria-label="Filter by district"
              disabled={districtList.length === 0}
            >
              <option value="ALL">
                {districtList.length > 0 ? `All Districts (${districtList.length})` : 'All Districts'}
              </option>
              {districtList.map(d => (
                <option key={d.value} value={d.value}>{d.value}</option>
              ))}
            </select>

            {scopeOn && (
              <button
                type="button"
                onClick={() => { setDistrict('ALL'); onStateChange?.('ALL'); }}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ──────────────── Loading & Error States ──────────────── */}
      {loading && (
        <div className="space-y-4">
          <div className="glass-card p-6">
            <SkeletonLoader variant="table-row" count={8} />
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="glass-card p-8 text-center border border-rose-500/30 bg-rose-500/5 space-y-3">
          <p className="font-extrabold text-lg text-rose-400">Unable to Load Comparison</p>
          <p className="text-[15px] text-text-muted max-w-lg mx-auto">{error}</p>
          <button
            type="button"
            onClick={() => {
              clearComparisonCache();
              setRetryTick(t => t + 1);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-blue hover:bg-accent-blue/90 text-white font-bold text-[14px] cursor-pointer transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Comparison
          </button>
        </div>
      )}

      {/* ──────────────── Metric ribbon ──────────────── */}
      {!loading && !error && kpiCards && (
        <>
          {/* ──────────────── Breakdown ──────────────── */}
          <div className="glass-card p-4 sm:p-5 lg:p-6 space-y-5">
            {/* View switcher & actions */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-5 border-b border-border/40">
              <div
                role="tablist"
                aria-label="Comparison breakdowns"
                className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-bg-secondary/70 border border-border/50 flex-wrap"
              >
                {subViews.map(v => {
                  const isActive = subView === v.key;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => { setSubView(v.key); setSortField('visits_a'); setSortAsc(false); }}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-bold transition-colors duration-150 cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-accent-blue text-white'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                      }`}
                    >
                      {v.label}
                      {v.count != null && (
                        <span className={`px-1.5 py-0.5 rounded-md text-[12px] font-bold tabular-nums ${isActive ? 'bg-white/25 text-white' : 'bg-bg-card text-text-muted'}`}>
                          {v.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {(subView === 'districts' || subView === 'reps') && (
                  <div className="w-full sm:w-72">
                    <SearchInput
                      size="lg"
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder={subView === 'districts' ? 'Search district or state' : 'Search sales rep'}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-text-secondary hover:text-text-primary text-[13px] font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap"
                  title="Export Comparison to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-accent-blue shrink-0" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* ── SUB-VIEW 1: Districts & Coverage ── */}
            {subView === 'districts' && (
              <div className="space-y-4">
              {pagination}
              <div className="overflow-x-auto rounded-xl border border-border/40">
                <table className="w-full text-left border-collapse text-[15px]">
                  <thead>
                    <tr className="bg-bg-secondary/70 border-b border-border/40 text-[12.5px] font-bold text-text-muted uppercase tracking-wider">
                      <th className="py-3.5 px-4 cursor-pointer" onClick={() => handleSort('district')}>
                        District{sortArrow('district')}
                      </th>
                      <th className="py-3.5 px-4 cursor-pointer" onClick={() => handleSort('state')}>
                        State{sortArrow('state')}
                      </th>
                      <th className="py-3.5 px-4 text-right cursor-pointer" onClick={() => handleSort('visits_a')}>
                        {labelA} Visits{sortArrow('visits_a')}
                      </th>
                      <th className="py-3.5 px-4 text-right cursor-pointer" onClick={() => handleSort('visits_b')}>
                        {labelB} Visits{sortArrow('visits_b')}
                      </th>
                      <th className="py-3.5 px-4 text-right cursor-pointer" onClick={() => handleSort('delta')}>
                        Change{sortArrow('delta')}
                      </th>
                      <th className="py-3.5 px-4 text-right cursor-pointer" onClick={() => handleSort('growth_pct')}>
                        % Growth{sortArrow('growth_pct')}
                      </th>
                      <th className="py-3.5 px-4 text-right">
                        Fabricators ({labelA} / {labelB})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {pagedRows.map((row, idx) => {
                      const isPos = row.delta > 0;
                      const isNeg = row.delta < 0;
                      return (
                        <tr key={`${row.state}-${row.district}-${idx}`} className="hover:bg-bg-secondary/40 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-text-primary">{row.district}</td>
                          <td className="py-3.5 px-4 text-text-muted">{row.state}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-text-primary tabular-nums">
                            {row.visits_a?.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right text-text-muted tabular-nums">
                            {row.visits_b?.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold tabular-nums">
                            <span className={isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-text-muted'}>
                              {signed(row.delta)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold tabular-nums">
                            {row.growth_pct != null ? (
                              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[13px] font-bold ${
                                isPos ? 'bg-emerald-500/15 text-emerald-400' : isNeg ? 'bg-rose-500/15 text-rose-400' : 'text-text-muted'
                              }`}>
                                {isPos ? <ArrowUpRight className="w-3.5 h-3.5" /> : isNeg ? <ArrowDownRight className="w-3.5 h-3.5" /> : null}
                                {isPos ? `+${row.growth_pct}%` : `${row.growth_pct}%`}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums text-text-secondary">
                            <span className="font-bold text-text-primary">{row.fabricators_a || 0}</span>
                            <span className="text-text-muted text-[13px]"> / {row.fabricators_b || 0}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {pagedRows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-text-muted text-[15px]">
                          No districts match the current scope and search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </div>
            )}

            {/* ── SUB-VIEW 2: Sales Team (Reps) ── */}
            {subView === 'reps' && (
              <div className="space-y-4">
              {pagination}
              <div className="overflow-x-auto rounded-xl border border-border/40">
                <table className="w-full text-left border-collapse text-[15px]">
                  <thead>
                    <tr className="bg-bg-secondary/70 border-b border-border/40 text-[12.5px] font-bold text-text-muted uppercase tracking-wider">
                      <th className="py-3.5 px-4 cursor-pointer" onClick={() => handleSort('rep')}>
                        Sales Representative{sortArrow('rep')}
                      </th>
                      <th className="py-3.5 px-4 text-right cursor-pointer" onClick={() => handleSort('visits_a')}>
                        {labelA} Visits{sortArrow('visits_a')}
                      </th>
                      <th className="py-3.5 px-4 text-right cursor-pointer" onClick={() => handleSort('visits_b')}>
                        {labelB} Visits{sortArrow('visits_b')}
                      </th>
                      <th className="py-3.5 px-4 text-right cursor-pointer" onClick={() => handleSort('delta')}>
                        Change{sortArrow('delta')}
                      </th>
                      <th className="py-3.5 px-4 text-right cursor-pointer" onClick={() => handleSort('growth_pct')}>
                        % Growth{sortArrow('growth_pct')}
                      </th>
                      <th className="py-3.5 px-4 text-right">
                        Active Field Days ({labelA} / {labelB})
                      </th>
                      <th className="py-3.5 px-4 text-right">
                        Accounts Visited ({labelA} / {labelB})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {pagedRows.map((row, idx) => {
                      const isPos = row.delta > 0;
                      const isNeg = row.delta < 0;
                      return (
                        <tr key={`${row.rep}-${idx}`} className="hover:bg-bg-secondary/40 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-text-primary">{row.rep}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-text-primary tabular-nums">
                            {row.visits_a?.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right text-text-muted tabular-nums">
                            {row.visits_b?.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold tabular-nums">
                            <span className={isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-text-muted'}>
                              {signed(row.delta)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold tabular-nums">
                            {row.growth_pct != null ? (
                              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[13px] font-bold ${
                                isPos ? 'bg-emerald-500/15 text-emerald-400' : isNeg ? 'bg-rose-500/15 text-rose-400' : 'text-text-muted'
                              }`}>
                                {isPos ? `+${row.growth_pct}%` : `${row.growth_pct}%`}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums text-text-secondary">
                            <span className="font-bold text-text-primary">{row.active_days_a || 0}</span>
                            <span className="text-text-muted text-[13px]"> / {row.active_days_b || 0} days</span>
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums text-text-secondary">
                            <span className="font-bold text-text-primary">{row.customers_a || 0}</span>
                            <span className="text-text-muted text-[13px]"> / {row.customers_b || 0}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {pagedRows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-text-muted text-[15px]">
                          No sales reps match the current scope and search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </div>
            )}

            {/* ── SUB-VIEW 3: Customer Types ── */}
            {subView === 'customer_types' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {(data?.customer_types || []).map(ct => {
                  const isPos = ct.delta > 0;
                  return (
                    <div key={ct.customer_type} className="p-5 rounded-xl bg-bg-secondary/50 border border-border/40 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-extrabold text-text-primary text-lg tracking-wide">
                          {ct.customer_type}
                        </span>
                        <span className={`px-2.5 py-1 rounded-md text-[13px] font-bold tabular-nums whitespace-nowrap ${
                          isPos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                        }`}>
                          {signed(ct.delta)} ({ct.growth_pct != null ? `${ct.growth_pct > 0 ? '+' : ''}${ct.growth_pct}%` : '—'})
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-bg-card/70 border border-border/30">
                          <div className="text-[12.5px] text-text-muted font-bold uppercase tracking-wider mb-1.5">{labelA}</div>
                          <div className="text-2xl font-black text-text-primary tabular-nums">{ct.visits_a?.toLocaleString('en-IN')}</div>
                          <div className="text-[13px] text-text-muted mt-0.5">{ct.share_a_pct}% of visits</div>
                        </div>
                        <div className="p-3 rounded-lg bg-bg-card/70 border border-border/30">
                          <div className="text-[12.5px] text-text-muted font-bold uppercase tracking-wider mb-1.5">{labelB}</div>
                          <div className="text-2xl font-black text-text-secondary tabular-nums">{ct.visits_b?.toLocaleString('en-IN')}</div>
                          <div className="text-[13px] text-text-muted mt-0.5">{ct.share_b_pct}% of visits</div>
                        </div>
                      </div>

                      {/* Comparative visual bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[13px] text-text-muted font-semibold">
                          <span>Share Comparison</span>
                          <span className="tabular-nums">{ct.share_a_pct}% vs {ct.share_b_pct}%</span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-bg-card overflow-hidden flex">
                          <div className="bg-accent-blue h-full" style={{ width: `${Math.min(ct.share_a_pct, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── SUB-VIEW 4: Account Movement (Gainers & Decliners) ── */}
            {subView === 'movement' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Top Gainers */}
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                  <div className="flex items-center gap-2.5 text-emerald-400 font-extrabold text-lg">
                    <TrendingUp className="w-5 h-5 shrink-0" />
                    <h4>Top 10 Expanding Accounts</h4>
                  </div>
                  <div className="divide-y divide-border/20">
                    {(data?.top_gainers || []).map((acc, idx) => (
                      <div key={`gainer-${idx}`} className="py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-text-primary truncate text-[15px]">{acc.customer_name}</div>
                          <div className="text-[13px] text-text-muted mt-0.5 truncate">
                            {acc.customer_type} · {acc.district}, {acc.state}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[13px] px-2 py-0.5 rounded-md font-bold bg-emerald-500/15 text-emerald-400 tabular-nums">
                            +{acc.delta} visits
                          </span>
                          <div className="text-[12.5px] text-text-muted mt-1 tabular-nums">
                            {acc.visits_a} vs {acc.visits_b}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(data?.top_gainers || []).length === 0 && (
                      <p className="text-center text-[14px] text-text-muted py-6">No expanding accounts found.</p>
                    )}
                  </div>
                </div>

                {/* Top Decliners */}
                <div className="p-4 sm:p-5 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-3">
                  <div className="flex items-center gap-2.5 text-rose-400 font-extrabold text-lg">
                    <TrendingDown className="w-5 h-5 shrink-0" />
                    <h4>Top 10 Dropping Accounts</h4>
                  </div>
                  <div className="divide-y divide-border/20">
                    {(data?.top_decliners || []).map((acc, idx) => (
                      <div key={`decliner-${idx}`} className="py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-text-primary truncate text-[15px]">{acc.customer_name}</div>
                          <div className="text-[13px] text-text-muted mt-0.5 truncate">
                            {acc.customer_type} · {acc.district}, {acc.state}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[13px] px-2 py-0.5 rounded-md font-bold bg-rose-500/15 text-rose-400 tabular-nums">
                            {acc.delta} visits
                          </span>
                          <div className="text-[12.5px] text-text-muted mt-1 tabular-nums">
                            {acc.visits_a} vs {acc.visits_b}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(data?.top_decliners || []).length === 0 && (
                      <p className="text-center text-[14px] text-text-muted py-6">No dropping accounts found.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
