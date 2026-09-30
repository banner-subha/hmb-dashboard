import { useMemo, useState } from 'react';
import { m } from 'framer-motion';
import { AlertTriangle, PackageOpen, X } from 'lucide-react';

import { useData } from '../context/DataContext';
import { useDashboardTelemetry } from '../context/DashboardTelemetryContext';
import ErrorBoundary from '../components/common/ErrorBoundary';
import SkeletonLoader from '../components/common/SkeletonLoader';
import FilterBar from '../components/common/FilterBar';
import KPICard from '../components/common/KPICard';
import DataTable from '../components/common/DataTable';
import SearchInput from '../components/common/SearchInput';
import ExportDropdown from '../components/common/ExportDropdown';
import { staggerContainer, kpiCard } from '../utils/motionVariants';
import { AGING_BUCKETS, agingTotal } from '../utils/backlogAging';
import { buildPendingRows, summarisePending } from '../utils/pendingOrders';
import { formatMT, formatDayLabel } from '../utils/formatters';
import { downloadCsv, getExportFilename } from '../utils/csvExport';

/**
 * Pending Orders.
 *
 * Orders placed but not yet despatched, from the dashboard file: how much,
 * how old, how long the current despatch pace needs to clear it, and who is
 * waiting. Follows the shared filters (state, district, product) and the
 * login's own states, like State, District and Dealer Overview.
 *
 * No padding, max width or page animation of its own: DashboardLayout
 * supplies all three.
 */

const BUCKET_FILL = { d0_30: '#10b981', d31_60: '#f59e0b', d61_90: '#f97316', d90plus: '#ef4444' };
const BUCKET_LABEL = { d0_30: '0–30 Days', d31_60: '31–60 Days', d61_90: '61–90 Days', d90plus: '90+ Days' };
const LEVELS = [
  { value: 'state', label: 'States' },
  { value: 'district', label: 'Districts' },
  { value: 'dealer', label: 'Dealers' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = mk => { const [y, mo] = mk.split('-').map(Number); return `${MONTHS[mo - 1] || mk} ${y}`; };
const count = n => (n || 0).toLocaleString('en-IN');
const mtNum = n => formatMT(n).replace(' MT', '');
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

const CLEAR_TONE = {
  CLEAR: 'text-severity-none',
  ON_TRACK: 'text-severity-none',
  MONITOR: 'text-amber-500',
  AT_RISK: 'text-orange-500',
  CRITICAL: 'text-severity-critical',
};

function AgeBar({ aging, className = 'w-20' }) {
  const total = agingTotal(aging);
  if (!total) return null;
  return (
    <div className={`flex h-1.5 rounded-full overflow-hidden bg-bg-tertiary ${className}`} aria-hidden="true">
      {AGING_BUCKETS.map(b => (aging[b.key] > 0 ? (
        <div key={b.key} className="h-full" style={{ width: `${(aging[b.key] / total) * 100}%`, background: BUCKET_FILL[b.key] }} />
      ) : null))}
    </div>
  );
}

// One blue ramp, darkest for the largest share: the split reads as parts of
// one backlog, not as unrelated categories competing for colour.
const MIX_RAMP = ['#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#a5b4fc', '#c7d2fe'];

function MixPanel({ title, note, rows, total }) {
  return (
    <section className="glass-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-extrabold text-text-primary">{title}</h3>
        <span className="text-[13px] font-bold text-text-secondary tabular-nums whitespace-nowrap">{formatMT(total)}</span>
      </div>
      {note && <p className="text-[13px] text-text-muted mt-1">{note}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted mt-4">N/A</p>
      ) : (
        <>
          <div className="flex gap-0.5 h-3 rounded-md overflow-hidden mt-4" aria-hidden="true">
            {rows.map((r, i) => (
              <div key={r.key} className="h-full first:rounded-l-md last:rounded-r-md" style={{ flexGrow: r.qty, flexBasis: 0, background: MIX_RAMP[i % MIX_RAMP.length] }} title={`${r.label}: ${formatMT(r.qty)}`} />
            ))}
          </div>
          <table className="w-full mt-3 text-sm">
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className="border-t border-border/40 first:border-t-0">
                  <td className="py-2 pr-2 w-4">
                    <span className="block w-2.5 h-2.5 rounded-sm" style={{ background: MIX_RAMP[i % MIX_RAMP.length] }} aria-hidden="true" />
                  </td>
                  <td className="py-2 font-semibold text-text-secondary">{r.label}</td>
                  <td className="py-2 text-right font-bold text-text-primary tabular-nums whitespace-nowrap">{formatMT(r.qty)}</td>
                  <td className="py-2 pl-3 w-14 text-right text-text-muted font-semibold tabular-nums">{pct(r.qty, total).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export default function PendingOrders() {
  const { data, loading, error, filters, dispatch } = useData();
  const [level, setLevel] = useState(() => (filters.selectedDistrict ? 'dealer' : filters.selectedState ? 'district' : 'state'));
  const [bucket, setBucket] = useState('');
  const [search, setSearch] = useState('');

  const asOf = data?.meta?.dataAsOfDate || null;
  const product = filters.selectedProduct || null;

  const summary = useMemo(() => (data ? summarisePending({
    dealers: data.dealers, products: data.products, product, asOf,
  }) : null), [data, product, asOf]);

  const allRows = useMemo(() => (data ? buildPendingRows({
    level, states: data.states, districts: data.districts, dealers: data.dealers, product, asOf,
  }) : []), [data, level, product, asOf]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(r => {
      if (bucket && !(r.aging[bucket] > 0)) return false;
      if (!q) return true;
      return [r.name, r.district, r.state].some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [allRows, bucket, search]);

  useDashboardTelemetry({
    tabName: 'Pending Orders',
    filters,
    visibleKpis: summary ? {
      pending_orders_mt: summary.total,
      dealers_waiting: summary.dealerCount,
      days_to_clear_at_current_pace: summary.daysToClear != null ? Math.round(summary.daysToClear * 10) / 10 : null,
      over_30_days_mt: summary.over30,
      oldest_order: summary.oldest,
      dealers_waiting_with_no_despatch_this_month: summary.noDespatchCount,
      data_as_of: asOf,
    } : null,
  });

  const columns = useMemo(() => {
    const nameHeader = level === 'state' ? 'State' : level === 'district' ? 'District' : 'Dealer';
    const cols = [
      {
        id: 'name',
        header: nameHeader,
        accessorFn: r => r.name,
        meta: { minWidth: level === 'dealer' ? '200px' : '150px' },
        cell: info => {
          const r = info.row.original;
          const sub = level === 'district' ? r.state : level === 'dealer' ? `${r.district}, ${r.state}` : null;
          return (
            <div className="min-w-0">
              <span className="font-semibold text-text-primary block truncate">{r.name}</span>
              {sub && <span className="text-[11px] text-text-muted block truncate">{sub}</span>}
            </div>
          );
        },
      },
      {
        id: 'pending',
        header: 'Pending',
        accessorFn: r => r.pending,
        meta: { minWidth: '120px' },
        cell: info => {
          const r = info.row.original;
          return (
            <div>
              <span className="font-bold text-text-primary tabular-nums whitespace-nowrap">{formatMT(r.pending)}</span>
              <span className="block text-[11px] text-text-muted">{r.share.toFixed(1)}% share</span>
            </div>
          );
        },
      },
      {
        id: 'over30',
        header: 'Aged >30 Days',
        accessorFn: r => r.over30,
        meta: { minWidth: '130px' },
        cell: info => {
          const r = info.row.original;
          return (
            <div className="space-y-1">
              <span className={`font-bold tabular-nums whitespace-nowrap ${r.over30 > 0 ? 'text-amber-500' : 'text-text-muted'}`}>
                {r.over30 > 0 ? formatMT(r.over30) : 'N/A'}
              </span>
              <AgeBar aging={r.aging} />
            </div>
          );
        },
      },
      {
        id: 'oldest',
        header: 'Oldest Order',
        accessorFn: r => r.oldestDays ?? -1,
        meta: { minWidth: '120px' },
        cell: info => {
          const r = info.row.original;
          if (!r.oldest) return <span className="text-text-muted">No date</span>;
          return (
            <div>
              <span className="font-semibold text-text-primary whitespace-nowrap">{formatDayLabel(r.oldest)}</span>
              {r.oldestDays != null && <span className="block text-[11px] text-text-muted">{r.oldestDays} days</span>}
            </div>
          );
        },
      },
      {
        id: 'daysToClear',
        header: 'Clearance',
        accessorFn: r => r.daysToClear,
        meta: { minWidth: '120px' },
        cell: info => {
          const r = info.row.original;
          const stalled = !(r.pace > 0);
          return (
            <div>
              <span className={`font-bold tabular-nums whitespace-nowrap ${CLEAR_TONE[r.clearStatus] || 'text-text-primary'}`}>
                {stalled ? 'No pace' : `${r.daysToClear.toFixed(1)} days`}
              </span>
              <span className="block text-[11px] text-text-muted whitespace-nowrap">
                {stalled ? 'N/A' : `@ ${r.pace.toFixed(1)} MT/day`}
              </span>
            </div>
          );
        },
      },
      {
        id: 'despatched',
        header: 'MTD Despatch',
        accessorFn: r => r.despatchedThisMonth,
        meta: { minWidth: '130px' },
        cell: info => {
          const v = info.getValue();
          return v > 0
            ? <span className="tabular-nums whitespace-nowrap text-text-secondary">{formatMT(v)}</span>
            : <span className="font-bold text-severity-critical whitespace-nowrap">N/A</span>;
        },
      },
    ];
    if (level !== 'dealer') {
      cols.splice(2, 0, {
        id: 'dealersWaiting',
        header: 'Dealers',
        accessorFn: r => r.dealersWaiting,
        meta: { minWidth: '90px' },
        cell: info => <span className="font-semibold tabular-nums">{count(info.getValue())}</span>,
      });
    }
    return cols;
  }, [level]);

  const csvColumns = [
    { label: level === 'state' ? 'State' : level === 'district' ? 'District' : 'Dealer', getValue: r => r.name },
    ...(level !== 'state' ? [{ label: 'State', getValue: r => r.state }] : []),
    ...(level === 'dealer' ? [{ label: 'District', getValue: r => r.district }] : []),
    { label: 'Pending (MT)', getValue: r => r.pending.toFixed(2) },
    { label: 'Share %', getValue: r => r.share.toFixed(1) },
    ...(level !== 'dealer' ? [{ label: 'Dealers', getValue: r => r.dealersWaiting }] : []),
    ...AGING_BUCKETS.map(b => ({ label: `${BUCKET_LABEL[b.key]} (MT)`, getValue: r => (r.aging[b.key] || 0).toFixed(2) })),
    { label: 'Oldest order', getValue: r => r.oldest || '' },
    { label: 'Order age (days)', getValue: r => r.oldestDays ?? '' },
    { label: 'Daily pace (MT/day)', getValue: r => r.pace.toFixed(2) },
    { label: 'Clearance (days)', getValue: r => (r.pace > 0 ? r.daysToClear.toFixed(1) : '') },
    { label: 'MTD despatch (MT)', getValue: r => r.despatchedThisMonth.toFixed(2) },
  ];
  const exportFiltered = () => downloadCsv(getExportFilename(`pending_${level}s`, 'filtered'), csvColumns, rows);
  const exportAll = () => downloadCsv(getExportFilename(`pending_${level}s`, 'all'), csvColumns, allRows);

  const openRow = (r) => {
    if (r.level === 'state') {
      dispatch({ type: 'SET_STATE', payload: r.state });
      setLevel('district');
    } else if (r.level === 'district') {
      dispatch({ type: 'SET_STATE', payload: r.state });
      dispatch({ type: 'SET_DISTRICT', payload: r.district });
      setLevel('dealer');
    }
    setBucket('');
    setSearch('');
  };

  if (error) {
    return (
      <div className="glass-card p-10 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" aria-hidden="true" />
        <h2 className="text-xl font-bold text-text-primary mb-2">Pending orders unavailable</h2>
        <p className="text-sm text-text-muted max-w-lg mx-auto">{String(error)}</p>
      </div>
    );
  }

  const s = summary;
  const loadingView = loading || !s;
  const activeBucket = AGING_BUCKETS.find(b => b.key === bucket);
  const cards = s ? [
    {
      label: 'Pending Orders',
      value: `${mtNum(s.total)} MT`,
      subtitle: `${count(s.dealerCount)} dealers`,
      accent: '#f59e0b',
    },
    {
      label: 'Clearance Time',
      value: s.daysToClear != null ? `${s.daysToClear.toFixed(1)} Days` : 'None',
      subtitle: s.pace > 0 ? `@ ${s.pace.toFixed(1)} MT/day avg despatch` : 'N/A',
      accent: '#3b82f6',
    },
    {
      label: 'Aged >30 Days',
      value: `${mtNum(s.over30)} MT`,
      subtitle: `${pct(s.over30, s.total).toFixed(1)}% of backlog`,
      accent: '#f97316',
    },
    {
      label: 'Oldest Order Age',
      value: s.oldestDays != null ? `${s.oldestDays} Days` : 'None',
      subtitle: s.oldest ? `Ordered ${formatDayLabel(s.oldest)}` : 'N/A',
      accent: '#ef4444',
    },
    {
      label: 'Zero MTD Despatch',
      value: count(s.noDespatchCount),
      subtitle: `Dealers holding ${formatMT(s.noDespatchQty)} backlog`,
      accent: '#a855f7',
    },
  ] : [];

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <PackageOpen className="w-7 h-7 text-accent-blue mt-1 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-3xl font-extrabold text-text-primary leading-tight">Pending Orders</h2>
          </div>
        </div>
        {asOf && (
          <span className="px-3.5 py-2 rounded-xl bg-bg-card/60 border border-border/40 text-[13px] font-bold text-text-secondary whitespace-nowrap self-start md:self-auto">
            As of {formatDayLabel(asOf)}
          </span>
        )}
      </div>

      <ErrorBoundary>
        {loadingView ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <SkeletonLoader variant="kpi" count={5} />
          </div>
        ) : (
          <m.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 [--kpi-fit:6]">
            {cards.map(c => (
              <m.div key={c.label} variants={kpiCard}>
                <KPICard fitValue label={c.label} value={c.value} subtitle={c.subtitle} accentColor={c.accent} />
              </m.div>
            ))}
          </m.div>
        )}
      </ErrorBoundary>

      {!loadingView && (
        <ErrorBoundary>
          <section className="glass-card p-4 sm:p-5" aria-labelledby="pending-age-heading">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 mb-4">
              <div>
                <h3 id="pending-age-heading" className="text-lg font-extrabold text-text-primary">Backlog Ageing</h3>
                <p className="text-[13px] text-text-muted mt-1 max-w-[75ch]">
                  Order age from order date to {asOf ? formatDayLabel(asOf) : 'the latest upload'}. Select a bucket to filter the order book.
                  {product && ' Product-level ageing estimated from dealer totals.'}
                </p>
              </div>
              {activeBucket && (
                <button
                  type="button"
                  onClick={() => setBucket('')}
                  className="inline-flex items-center gap-1.5 self-start shrink-0 px-3 py-1.5 rounded-lg border border-border-accent bg-accent-blue-soft text-[13px] font-bold text-accent-blue cursor-pointer hover:opacity-90"
                >
                  {BUCKET_LABEL[activeBucket.key]}
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="sr-only">Clear age filter</span>
                </button>
              )}
            </div>
            <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {AGING_BUCKETS.map(b => {
                const qty = s.aging[b.key] || 0;
                const share = pct(qty, s.total);
                const selected = bucket === b.key;
                const dealersIn = s.bucketDealers[b.key] || 0;
                return (
                  <li key={b.key}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={qty <= 0}
                      onClick={() => setBucket(selected ? '' : b.key)}
                      // index.css fades every disabled button in light mode to 0.62,
                      // which takes this box's 12px line under 4.5:1. A zero box
                      // reads as zero without the fade.
                      style={{ opacity: 1 }}
                      className={`w-full h-full text-left rounded-xl border p-3 transition-colors disabled:cursor-default cursor-pointer ${
                        selected ? 'border-border-accent bg-accent-blue-soft' : 'border-border bg-bg-secondary hover:border-border-accent'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-[13px] font-bold text-text-secondary">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: BUCKET_FILL[b.key] }} aria-hidden="true" />
                        {BUCKET_LABEL[b.key]}
                      </span>
                      <span className="block text-xl font-black text-text-primary tabular-nums whitespace-nowrap mt-1.5">{formatMT(qty)}</span>
                      <span className="block h-1.5 rounded-full bg-bg-tertiary mt-2 overflow-hidden" aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${share}%`, background: BUCKET_FILL[b.key] }} />
                      </span>
                      <span className="block text-[12px] text-text-muted mt-1.5">
                        {share.toFixed(1)}% · {count(dealersIn)} {dealersIn === 1 ? 'dealer' : 'dealers'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </ErrorBoundary>
      )}

      {!loadingView && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MixPanel
            title="Order Month Mix"
            note="Backlog split by the month each order was placed. Older months carry the clearance risk."
            rows={s.byMonth.map(r => ({ key: r.month, label: monthLabel(r.month), qty: r.qty }))}
            total={s.total}
          />
          <MixPanel
            title="Product Mix"
            note={product ? 'Selected product only.' : 'Backlog split by product line, largest first.'}
            rows={s.products.map(p => ({ key: p.product, label: p.label, qty: p.pending }))}
            total={s.products.reduce((a, p) => a + p.pending, 0)}
          />
        </div>
      )}

      <section className="space-y-3" aria-labelledby="pending-table-heading">
        <h3 id="pending-table-heading" className="text-lg font-extrabold text-text-primary">Pending Order Book</h3>
        <div className="glass-card p-3 sm:p-3.5 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-full border border-border/40" role="group" aria-label="Group by">
              {LEVELS.map(opt => {
                const active = level === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLevel(opt.value)}
                    className={`px-3.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                      active ? 'bg-accent-blue text-white border-accent-blue' : 'bg-transparent text-text-secondary border-transparent hover:text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <FilterBar inline />
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <div className="w-[170px] sm:w-[200px]">
              <SearchInput placeholder={`Search ${LEVELS.find(l => l.value === level).label.toLowerCase()}...`} value={search} onChange={setSearch} />
            </div>
            <ExportDropdown
              label="Export CSV"
              entityName={LEVELS.find(l => l.value === level).label}
              filteredCount={rows.length}
              rawCount={allRows.length}
              onExportFiltered={exportFiltered}
              onExportRaw={exportAll}
            />
          </div>
        </div>
        <ErrorBoundary>
          {loadingView ? (
            <div className="rounded-xl border border-border overflow-hidden">
              <SkeletonLoader variant="table-row" count={8} />
            </div>
          ) : rows.length === 0 ? (
            <div className="glass-card p-8 text-center text-sm text-text-muted">
              No pending orders for the selected filters.
            </div>
          ) : (
            <DataTable
              key={`${level}-${bucket}`}
              data={rows}
              columns={columns}
              pageSize={15}
              defaultSort={[{ id: 'pending', desc: true }]}
              onRowClick={level === 'dealer' ? undefined : openRow}
            />
          )}
        </ErrorBoundary>
        {!loadingView && level !== 'dealer' && rows.length > 0 && (
          <p className="text-[12px] text-text-muted">Row click opens {level === 'state' ? 'district' : 'dealer'} view.</p>
        )}
      </section>
    </div>
  );
}
