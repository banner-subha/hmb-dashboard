import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Users,
  MapPin,
  Building2,
  Clock,
  Briefcase,
  Download,
  Search,
  Sparkles,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from 'lucide-react';
import SkeletonLoader from '../common/SkeletonLoader';
import SearchInput from '../common/SearchInput';
import { compareVisitsPeriods, fetchVisitsCalendar } from '../../services/visitService';
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
  if (!ym) return '2026-08';
  const [y, m] = ym.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  const pm = m - 1 < 10 ? `0${m - 1}` : `${m - 1}`;
  return `${y}-${pm}`;
}

function getPriorYear(ym) {
  if (!ym) return '2025-08';
  const [y, m] = ym.split('-');
  return `${Number(y) - 1}-${m}`;
}

export default function VisitComparisonTab({ stateFilter = 'ALL', onStateChange, initialPeriodA = null }) {
  // Available calendar
  const [calendar, setCalendar] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(true);

  // Selected periods
  const [periodA, setPeriodA] = useState(initialPeriodA || '2026-08');
  const [periodB, setPeriodB] = useState(initialPeriodA ? getPriorYear(initialPeriodA) : '2025-08');

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

  // Load calendar on mount
  useEffect(() => {
    let mounted = true;
    fetchVisitsCalendar()
      .then(res => {
        if (!mounted) return;
        setCalendar(res);
      })
      .catch(err => {
        console.warn('[VisitComparisonTab] Calendar fetch error:', err);
      })
      .finally(() => {
        if (mounted) setCalendarLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  // Fetch comparison data when periodA, periodB or stateFilter changes
  useEffect(() => {
    let mounted = true;
    const seq = ++requestSeqRef.current;

    // Small debounce to collapse rapid consecutive dropdown clicks
    const timer = setTimeout(() => {
      if (!mounted) return;
      setLoading(true);
      setError(null);

      compareVisitsPeriods({ periodA, periodB, state: stateFilter })
        .then(res => {
          if (seq !== requestSeqRef.current || !mounted) return;
          setData(res);
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
  }, [periodA, periodB, stateFilter]);

  // Handle period year/month change
  const handleYearChange = (which, year) => {
    const current = which === 'A' ? periodA : periodB;
    const [, m] = current.split('-');
    const newPeriod = `${year}-${m}`;
    if (which === 'A') setPeriodA(newPeriod);
    else setPeriodB(newPeriod);
  };

  const handleMonthChange = (which, month) => {
    const current = which === 'A' ? periodA : periodB;
    const [y] = current.split('-');
    const newPeriod = `${y}-${month}`;
    if (which === 'A') setPeriodA(newPeriod);
    else setPeriodB(newPeriod);
  };

  const handleSwap = () => {
    const temp = periodA;
    setPeriodA(periodB);
    setPeriodB(temp);
  };

  const handlePreset = (type) => {
    if (type === 'mom') {
      setPeriodB(getPriorMonth(periodA));
    } else if (type === 'yoy') {
      setPeriodB(getPriorYear(periodA));
    } else if (type === 'aug_yoy') {
      setPeriodA('2026-08');
      setPeriodB('2025-08');
    } else if (type === 'sep_mom') {
      setPeriodA('2026-09');
      setPeriodB('2026-08');
    }
  };

  const yearsList = calendar?.years || ['2026', '2025'];
  const [yearA, monthA] = periodA.split('-');
  const [yearB, monthB] = periodB.split('-');

  // CSV Export for the comparison
  const handleExportCsv = () => {
    if (!data) return;
    const dateStr = new Date().toISOString().split('T')[0];

    if (subView === 'districts') {
      const cols = [
        { label: 'District', key: 'district' },
        { label: 'State', key: 'state' },
        { label: `Visits (${formatPeriod(periodA, true)})`, key: 'visits_a' },
        { label: `Visits (${formatPeriod(periodB, true)})`, key: 'visits_b' },
        { label: 'Net Delta', key: 'delta' },
        { label: 'Growth %', getValue: r => r.growth_pct != null ? `${r.growth_pct}%` : '—' },
        { label: `Fabricators (${formatPeriod(periodA, true)})`, key: 'fabricators_a' },
        { label: `Fabricators (${formatPeriod(periodB, true)})`, key: 'fabricators_b' },
        { label: `Unique Accounts (${formatPeriod(periodA, true)})`, key: 'customers_a' },
        { label: `Unique Accounts (${formatPeriod(periodB, true)})`, key: 'customers_b' },
      ];
      downloadCsv(`hmb_visit_comparison_districts_${periodA}_vs_${periodB}_${dateStr}.csv`, cols, data.districts || []);
    } else if (subView === 'reps') {
      const cols = [
        { label: 'Sales Representative', key: 'rep' },
        { label: `Visits (${formatPeriod(periodA, true)})`, key: 'visits_a' },
        { label: `Visits (${formatPeriod(periodB, true)})`, key: 'visits_b' },
        { label: 'Net Delta', key: 'delta' },
        { label: 'Growth %', getValue: r => r.growth_pct != null ? `${r.growth_pct}%` : '—' },
        { label: `Active Days (${formatPeriod(periodA, true)})`, key: 'active_days_a' },
        { label: `Active Days (${formatPeriod(periodB, true)})`, key: 'active_days_b' },
        { label: `Unique Accounts (${formatPeriod(periodA, true)})`, key: 'customers_a' },
        { label: `Unique Accounts (${formatPeriod(periodB, true)})`, key: 'customers_b' },
      ];
      downloadCsv(`hmb_visit_comparison_sales_team_${periodA}_vs_${periodB}_${dateStr}.csv`, cols, data.reps || []);
    } else if (subView === 'customer_types') {
      const cols = [
        { label: 'Customer Type', key: 'customer_type' },
        { label: `Visits (${formatPeriod(periodA, true)})`, key: 'visits_a' },
        { label: `Share % (${formatPeriod(periodA, true)})`, getValue: r => `${r.share_a_pct}%` },
        { label: `Visits (${formatPeriod(periodB, true)})`, key: 'visits_b' },
        { label: `Share % (${formatPeriod(periodB, true)})`, getValue: r => `${r.share_b_pct}%` },
        { label: 'Net Delta', key: 'delta' },
        { label: 'Growth %', getValue: r => r.growth_pct != null ? `${r.growth_pct}%` : '—' },
      ];
      downloadCsv(`hmb_visit_comparison_customer_types_${periodA}_vs_${periodB}_${dateStr}.csv`, cols, data.customer_types || []);
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
        { label: `Visits (${formatPeriod(periodA, true)})`, key: 'visits_a' },
        { label: `Visits (${formatPeriod(periodB, true)})`, key: 'visits_b' },
        { label: 'Net Delta', key: 'delta' },
      ];
      downloadCsv(`hmb_visit_account_movement_${periodA}_vs_${periodB}_${dateStr}.csv`, cols, combined);
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

  // Filtered & sorted data for active sub-view
  const districtsList = useMemo(() => {
    if (!data?.districts) return [];
    let list = data.districts;
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
  }, [data?.districts, searchQuery, sortField, sortAsc]);

  const repsList = useMemo(() => {
    if (!data?.reps) return [];
    let list = data.reps;
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
  }, [data?.reps, searchQuery, sortField, sortAsc]);

  // Derived KPI comparisons
  const kpiDeltas = useMemo(() => {
    if (!data?.kpi_a || !data?.kpi_b) return null;
    const a = data.kpi_a;
    const b = data.kpi_b;

    const calc = (cur, prev) => {
      const c = cur || 0;
      const p = prev || 0;
      const diff = c - p;
      const pct = p > 0 ? ((diff / p) * 100) : null;
      return { cur: c, prev: p, diff, pct };
    };

    return {
      totalVisits: calc(a.total_visits, b.total_visits),
      dealerVisits: calc(a.dealer_visits, b.dealer_visits),
      fabricatorVisits: calc(a.fabricator_visits, b.fabricator_visits),
      uniqueCustomers: calc(a.unique_customers, b.unique_customers),
      activeReps: calc(a.active_reps, b.active_reps),
      avgDuration: {
        cur: a.avg_duration || 0,
        prev: b.avg_duration || 0,
        diff: Math.round(((a.avg_duration || 0) - (b.avg_duration || 0)) * 10) / 10,
      },
    };
  }, [data]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ──────────────── Top Selection Control Bar ──────────────── */}
      <div className="glass-card p-4 sm:p-5 border border-border/40 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-accent-blue shrink-0" />
            <div>
              <h3 className="text-lg font-extrabold text-text-primary leading-tight">
                Compare Field Visits
              </h3>
              <p className="text-[12.5px] text-text-muted mt-0.5">
                Precision historical comparison across 2025 and 2026 data.
              </p>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11.5px] font-bold text-text-muted mr-1 uppercase tracking-wider">Presets:</span>
            <button
              type="button"
              onClick={() => handlePreset('mom')}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-bg-secondary/80 hover:bg-bg-card text-text-secondary hover:text-text-primary border border-border/40 transition-colors cursor-pointer"
            >
              MoM: Prior Month
            </button>
            <button
              type="button"
              onClick={() => handlePreset('yoy')}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-bg-secondary/80 hover:bg-bg-card text-text-secondary hover:text-text-primary border border-border/40 transition-colors cursor-pointer"
            >
              YoY: Same Month Last Year
            </button>
            <button
              type="button"
              onClick={() => handlePreset('aug_yoy')}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-bg-secondary/80 hover:bg-bg-card text-text-secondary hover:text-text-primary border border-border/40 transition-colors cursor-pointer"
            >
              Aug 2026 vs Aug 2025
            </button>
            <button
              type="button"
              onClick={() => handlePreset('sep_mom')}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-bg-secondary/80 hover:bg-bg-card text-text-secondary hover:text-text-primary border border-border/40 transition-colors cursor-pointer"
            >
              Sep 2026 vs Aug 2026
            </button>
          </div>
        </div>

        {/* Period Selectors Row */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 pt-3 border-t border-border/30">
          {/* Period A Box */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-bg-secondary/60 border border-border/40">
            <span className="w-6 h-6 rounded-lg bg-accent-blue/20 text-accent-blue flex items-center justify-center font-black text-xs shrink-0">
              A
            </span>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <select
                className="filter-select text-sm py-1.5 px-2.5 font-bold"
                value={yearA}
                onChange={e => handleYearChange('A', e.target.value)}
                aria-label="Period A Year"
              >
                {yearsList.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                className="filter-select text-sm py-1.5 px-2.5 font-bold"
                value={monthA}
                onChange={e => handleMonthChange('A', e.target.value)}
                aria-label="Period A Month"
              >
                {MONTH_NAMES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <span className="text-xs font-semibold text-text-muted hidden sm:inline-block px-1">
              Primary
            </span>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSwap}
              title="Swap Period A and Period B"
              className="p-2.5 rounded-xl border border-border/50 bg-bg-card hover:bg-bg-card-hover text-text-secondary hover:text-accent-blue transition-colors cursor-pointer shadow-sm active:scale-95"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* Period B Box */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-bg-secondary/60 border border-border/40">
            <span className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-black text-xs shrink-0">
              B
            </span>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <select
                className="filter-select text-sm py-1.5 px-2.5 font-bold"
                value={yearB}
                onChange={e => handleYearChange('B', e.target.value)}
                aria-label="Period B Year"
              >
                {yearsList.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                className="filter-select text-sm py-1.5 px-2.5 font-bold"
                value={monthB}
                onChange={e => handleMonthChange('B', e.target.value)}
                aria-label="Period B Month"
              >
                {MONTH_NAMES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <span className="text-xs font-semibold text-text-muted hidden sm:inline-block px-1">
              Benchmark
            </span>
          </div>
        </div>
      </div>

      {/* ──────────────── Loading & Error States ──────────────── */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <SkeletonLoader variant="kpi" count={6} />
          </div>
          <div className="glass-card p-6">
            <SkeletonLoader variant="table-row" count={8} />
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="glass-card p-8 text-center border border-rose-500/30 bg-rose-500/5 space-y-3">
          <p className="font-extrabold text-base text-rose-400">Unable to Load Comparison</p>
          <p className="text-sm text-text-muted max-w-lg mx-auto">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              compareVisitsPeriods({ periodA, periodB, state: stateFilter })
                .then(res => {
                  setData(res);
                  setError(null);
                })
                .catch(err => setError(err.message || 'Comparison request failed'))
                .finally(() => setLoading(false));
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-blue hover:bg-accent-blue/90 text-white font-bold text-xs cursor-pointer shadow-sm transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Comparison
          </button>
        </div>
      )}

      {/* ──────────────── Executive KPI Comparison Row ──────────────── */}
      {!loading && !error && kpiDeltas && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            {/* Total Visits */}
            <KPICard
              label="Total Field Visits"
              icon={Briefcase}
              cur={kpiDeltas.totalVisits.cur}
              prev={kpiDeltas.totalVisits.prev}
              diff={kpiDeltas.totalVisits.diff}
              pct={kpiDeltas.totalVisits.pct}
              periodA={formatPeriod(periodA, true)}
              periodB={formatPeriod(periodB, true)}
            />

            {/* Dealer Visits */}
            <KPICard
              label="Dealer Visits"
              icon={Building2}
              cur={kpiDeltas.dealerVisits.cur}
              prev={kpiDeltas.dealerVisits.prev}
              diff={kpiDeltas.dealerVisits.diff}
              pct={kpiDeltas.dealerVisits.pct}
              periodA={formatPeriod(periodA, true)}
              periodB={formatPeriod(periodB, true)}
            />

            {/* Fabricator Visits */}
            <KPICard
              label="Fabricator Visits"
              icon={Layers}
              cur={kpiDeltas.fabricatorVisits.cur}
              prev={kpiDeltas.fabricatorVisits.prev}
              diff={kpiDeltas.fabricatorVisits.diff}
              pct={kpiDeltas.fabricatorVisits.pct}
              periodA={formatPeriod(periodA, true)}
              periodB={formatPeriod(periodB, true)}
            />

            {/* Unique Customers */}
            <KPICard
              label="Unique Accounts"
              icon={MapPin}
              cur={kpiDeltas.uniqueCustomers.cur}
              prev={kpiDeltas.uniqueCustomers.prev}
              diff={kpiDeltas.uniqueCustomers.diff}
              pct={kpiDeltas.uniqueCustomers.pct}
              periodA={formatPeriod(periodA, true)}
              periodB={formatPeriod(periodB, true)}
            />

            {/* Active Reps */}
            <KPICard
              label="Active Sales Reps"
              icon={Users}
              cur={kpiDeltas.activeReps.cur}
              prev={kpiDeltas.activeReps.prev}
              diff={kpiDeltas.activeReps.diff}
              pct={kpiDeltas.activeReps.pct}
              periodA={formatPeriod(periodA, true)}
              periodB={formatPeriod(periodB, true)}
            />

            {/* Avg Duration */}
            <div className="glass-card p-4 flex flex-col justify-between border border-border/40 hover:border-accent-blue/30 transition-all">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-text-muted uppercase tracking-wider">Avg Call Duration</span>
                <Clock className="w-4 h-4 text-accent-blue shrink-0" />
              </div>
              <div className="my-2">
                <div className="text-2xl font-black text-text-primary tracking-tight">
                  {kpiDeltas.avgDuration.cur} <span className="text-sm font-semibold text-text-muted">min</span>
                </div>
                <div className="text-[11.5px] text-text-muted mt-0.5">
                  vs {kpiDeltas.avgDuration.prev} min in {formatPeriod(periodB, true)}
                </div>
              </div>
              <div className="pt-2 border-t border-border/20 flex items-center justify-between text-xs">
                <span className="text-text-muted">Net Change</span>
                <span className={`font-bold tabular-nums ${kpiDeltas.avgDuration.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {kpiDeltas.avgDuration.diff >= 0 ? `+${kpiDeltas.avgDuration.diff}` : kpiDeltas.avgDuration.diff} min
                </span>
              </div>
            </div>
          </div>

          {/* ──────────────── Navigation & Sub-Views Card ──────────────── */}
          <div className="glass-card p-4 sm:p-5 lg:p-6 space-y-5 border border-border/40">
            {/* View switcher & actions */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-4 border-b border-border/30">
              <div
                role="tablist"
                aria-label="Comparison sub-views"
                className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-bg-secondary/70 border border-border/50 flex-wrap"
              >
                {[
                  { key: 'districts', label: 'Districts & Coverage', count: data?.districts?.length },
                  { key: 'reps', label: 'Sales Team', count: data?.reps?.length },
                  { key: 'customer_types', label: 'Customer Types', count: data?.customer_types?.length },
                  { key: 'movement', label: 'Account Movement', count: (data?.top_gainers?.length || 0) + (data?.top_decliners?.length || 0) },
                ].map(v => {
                  const isActive = subView === v.key;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => { setSubView(v.key); setSortField('visits_a'); setSortAsc(false); }}
                      className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-[13px] font-bold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-accent-blue text-white shadow-md'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                      }`}
                    >
                      {v.label}
                      {v.count != null && (
                        <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${isActive ? 'bg-white/25 text-white' : 'bg-bg-card text-text-muted'}`}>
                          {v.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                {(subView === 'districts' || subView === 'reps') && (
                  <div className="w-full sm:w-64">
                    <SearchInput
                      size="md"
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder={subView === 'districts' ? 'Search district or state…' : 'Search sales rep…'}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-xs font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5 text-accent-blue" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* ── SUB-VIEW 1: Districts & Coverage ── */}
            {subView === 'districts' && (
              <div className="overflow-x-auto rounded-xl border border-border/30">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-bg-secondary/70 border-b border-border/40 text-[12px] font-bold text-text-muted uppercase tracking-wider">
                      <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort('district')}>
                        District {sortField === 'district' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort('state')}>
                        State {sortField === 'state' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('visits_a')}>
                        {formatPeriod(periodA, true)} Visits {sortField === 'visits_a' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('visits_b')}>
                        {formatPeriod(periodB, true)} Visits {sortField === 'visits_b' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('delta')}>
                        Net Delta {sortField === 'delta' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('growth_pct')}>
                        % Growth {sortField === 'growth_pct' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 text-right">
                        Fabricators ({formatPeriod(periodA, true)} / {formatPeriod(periodB, true)})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {districtsList.map((row, idx) => {
                      const isPos = row.delta > 0;
                      const isNeg = row.delta < 0;
                      return (
                        <tr key={`${row.state}-${row.district}-${idx}`} className="hover:bg-bg-secondary/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-text-primary">{row.district}</td>
                          <td className="py-3 px-4 text-text-muted">{row.state}</td>
                          <td className="py-3 px-4 text-right font-bold text-text-primary tabular-nums">
                            {row.visits_a?.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right text-text-muted tabular-nums">
                            {row.visits_b?.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right font-bold tabular-nums">
                            <span className={isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-text-muted'}>
                              {isPos ? `+${row.delta}` : row.delta}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold tabular-nums">
                            {row.growth_pct != null ? (
                              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11.5px] font-bold ${
                                isPos ? 'bg-emerald-500/15 text-emerald-400' : isNeg ? 'bg-rose-500/15 text-rose-400' : 'text-text-muted'
                              }`}>
                                {isPos ? <ArrowUpRight className="w-3 h-3" /> : isNeg ? <ArrowDownRight className="w-3 h-3" /> : null}
                                {isPos ? `+${row.growth_pct}%` : `${row.growth_pct}%`}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-text-secondary">
                            <span className="font-bold text-text-primary">{row.fabricators_a || 0}</span>
                            <span className="text-text-muted text-xs"> / {row.fabricators_b || 0}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {districtsList.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-text-muted text-sm">
                          No districts found matching your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── SUB-VIEW 2: Sales Team (Reps) ── */}
            {subView === 'reps' && (
              <div className="overflow-x-auto rounded-xl border border-border/30">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-bg-secondary/70 border-b border-border/40 text-[12px] font-bold text-text-muted uppercase tracking-wider">
                      <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort('rep')}>
                        Sales Representative {sortField === 'rep' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('visits_a')}>
                        {formatPeriod(periodA, true)} Visits {sortField === 'visits_a' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('visits_b')}>
                        {formatPeriod(periodB, true)} Visits {sortField === 'visits_b' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('delta')}>
                        Net Delta {sortField === 'delta' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('growth_pct')}>
                        % Growth {sortField === 'growth_pct' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-3 px-4 text-right">
                        Active Field Days ({formatPeriod(periodA, true)} / {formatPeriod(periodB, true)})
                      </th>
                      <th className="py-3 px-4 text-right">
                        Unique Accounts ({formatPeriod(periodA, true)} / {formatPeriod(periodB, true)})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {repsList.map((row, idx) => {
                      const isPos = row.delta > 0;
                      const isNeg = row.delta < 0;
                      return (
                        <tr key={`${row.rep}-${idx}`} className="hover:bg-bg-secondary/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-text-primary">{row.rep}</td>
                          <td className="py-3 px-4 text-right font-bold text-text-primary tabular-nums">
                            {row.visits_a?.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right text-text-muted tabular-nums">
                            {row.visits_b?.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right font-bold tabular-nums">
                            <span className={isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-text-muted'}>
                              {isPos ? `+${row.delta}` : row.delta}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold tabular-nums">
                            {row.growth_pct != null ? (
                              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11.5px] font-bold ${
                                isPos ? 'bg-emerald-500/15 text-emerald-400' : isNeg ? 'bg-rose-500/15 text-rose-400' : 'text-text-muted'
                              }`}>
                                {isPos ? `+${row.growth_pct}%` : `${row.growth_pct}%`}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-text-secondary">
                            <span className="font-bold text-text-primary">{row.active_days_a || 0}</span>
                            <span className="text-text-muted text-xs"> / {row.active_days_b || 0} days</span>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-text-secondary">
                            <span className="font-bold text-text-primary">{row.customers_a || 0}</span>
                            <span className="text-text-muted text-xs"> / {row.customers_b || 0}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── SUB-VIEW 3: Customer Types ── */}
            {subView === 'customer_types' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {(data?.customer_types || []).map(ct => {
                  const isPos = ct.delta > 0;
                  return (
                    <div key={ct.customer_type} className="p-4 rounded-xl bg-bg-secondary/50 border border-border/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-text-primary text-base tracking-wide">
                          {ct.customer_type}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold tabular-nums ${
                          isPos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                        }`}>
                          {isPos ? `+${ct.delta}` : ct.delta} ({ct.growth_pct != null ? `${ct.growth_pct > 0 ? '+' : ''}${ct.growth_pct}%` : '—'})
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-bg-card/70 border border-border/20">
                          <div className="text-text-muted font-bold mb-1">{formatPeriod(periodA, true)}</div>
                          <div className="text-lg font-black text-text-primary">{ct.visits_a?.toLocaleString('en-IN')}</div>
                          <div className="text-[11px] text-text-muted">{ct.share_a_pct}% of visits</div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-bg-card/70 border border-border/20">
                          <div className="text-text-muted font-bold mb-1">{formatPeriod(periodB, true)}</div>
                          <div className="text-lg font-black text-text-secondary">{ct.visits_b?.toLocaleString('en-IN')}</div>
                          <div className="text-[11px] text-text-muted">{ct.share_b_pct}% of visits</div>
                        </div>
                      </div>

                      {/* Comparative visual bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-text-muted font-semibold">
                          <span>Share Comparison</span>
                          <span>{ct.share_a_pct}% vs {ct.share_b_pct}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-bg-card overflow-hidden flex">
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
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-base">
                    <TrendingUp className="w-5 h-5 shrink-0" />
                    <h4>Top 10 Expanding Accounts</h4>
                  </div>
                  <div className="divide-y divide-border/20">
                    {(data?.top_gainers || []).map((acc, idx) => (
                      <div key={`gainer-${idx}`} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-text-primary truncate text-sm">{acc.customer_name}</div>
                          <div className="text-[11.5px] text-text-muted mt-0.5">
                            {acc.customer_type} · {acc.district}, {acc.state}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-emerald-500/15 text-emerald-400 tabular-nums">
                            +{acc.delta} visits
                          </span>
                          <div className="text-[11px] text-text-muted mt-0.5">
                            {acc.visits_a} vs {acc.visits_b}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(data?.top_gainers || []).length === 0 && (
                      <p className="text-center text-xs text-text-muted py-4">No expanding accounts found.</p>
                    )}
                  </div>
                </div>

                {/* Top Decliners */}
                <div className="p-4 sm:p-5 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-4">
                  <div className="flex items-center gap-2 text-rose-400 font-extrabold text-base">
                    <TrendingDown className="w-5 h-5 shrink-0" />
                    <h4>Top 10 Dropping Accounts</h4>
                  </div>
                  <div className="divide-y divide-border/20">
                    {(data?.top_decliners || []).map((acc, idx) => (
                      <div key={`decliner-${idx}`} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-text-primary truncate text-sm">{acc.customer_name}</div>
                          <div className="text-[11.5px] text-text-muted mt-0.5">
                            {acc.customer_type} · {acc.district}, {acc.state}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-rose-500/15 text-rose-400 tabular-nums">
                            {acc.delta} visits
                          </span>
                          <div className="text-[11px] text-text-muted mt-0.5">
                            {acc.visits_a} vs {acc.visits_b}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(data?.top_decliners || []).length === 0 && (
                      <p className="text-center text-xs text-text-muted py-4">No dropping accounts found.</p>
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

/** Reusable KPI Comparison Card */
function KPICard({ label, icon: Icon, cur, prev, diff, pct, periodA, periodB }) {
  const isPos = diff > 0;
  const isNeg = diff < 0;

  return (
    <div className="glass-card p-4 flex flex-col justify-between border border-border/40 hover:border-accent-blue/30 transition-all">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-text-muted uppercase tracking-wider truncate">{label}</span>
        <Icon className="w-4 h-4 text-accent-blue shrink-0" />
      </div>

      <div className="my-2">
        <div className="text-2xl font-black text-text-primary tracking-tight tabular-nums">
          {cur?.toLocaleString('en-IN')}
        </div>
        <div className="text-[11.5px] text-text-muted mt-0.5 truncate">
          vs {prev?.toLocaleString('en-IN')} in {periodB}
        </div>
      </div>

      <div className="pt-2 border-t border-border/20 flex items-center justify-between text-xs">
        <span className="text-text-muted">Growth</span>
        <div className="flex items-center gap-1 font-bold tabular-nums">
          <span className={isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-text-muted'}>
            {isPos ? `+${diff.toLocaleString('en-IN')}` : diff?.toLocaleString('en-IN')}
          </span>
          {pct != null && (
            <span className={`px-1.5 py-0.2 rounded text-[11px] ${
              isPos ? 'bg-emerald-500/15 text-emerald-400' : isNeg ? 'bg-rose-500/15 text-rose-400' : 'text-text-muted'
            }`}>
              {isPos ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
