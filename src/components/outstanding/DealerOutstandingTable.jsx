import { memo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react';
import TablePager from './TablePager';
import {
  AGING_BUCKETS,
  bucketBillsPaise,
  formatDate,
  formatINR,
  formatINRFull,
  getOverdueSeverity,
} from '../../utils/outstanding';

const COLUMNS = [
  { id: 'dealer', label: 'Dealer', sortable: false, className: 'w-[26%]' },
  { id: 'total', label: 'Outstanding', sortable: true, className: 'w-[13%] text-right' },
  { id: 'overdue', label: 'Overdue', sortable: true, className: 'w-[12%] text-right' },
  { id: 'days', label: 'Bill ageing', sortable: true, className: 'w-[18%]' },
  { id: 'oldest', label: 'Oldest due date', sortable: true, className: 'w-[12%]' },
  { id: 'entries', label: 'Bills', sortable: true, className: 'w-[11%]' },
  { id: 'action', label: 'View', sortable: false, className: 'w-[8%]', srOnly: true },
];

// The card view has no column headers, so it sorts from this list instead.
const CARD_SORTS = [
  { value: 'total:desc', label: 'Outstanding, highest first' },
  { value: 'overdue:desc', label: 'Overdue, highest first' },
  { value: 'days:desc', label: 'Most days overdue' },
  { value: 'oldest:asc', label: 'Oldest due date first' },
  { value: 'entries:desc', label: 'Most bills' },
];

const geoText = (r) => (r.districtLabel ? `${r.districtLabel}, ${r.stateLabel}` : r.stateLabel);

/** Unpaid bills split by age, as one bar. Width is share of this dealer's own bills. */
function AgeBar({ row }) {
  const parts = AGING_BUCKETS.map((b) => ({ ...b, paise: bucketBillsPaise(row, b) })).filter((p) => p.paise > 0);
  const total = parts.reduce((s, p) => s + p.paise, 0);
  if (!total) return <span className="text-[12.5px] text-text-muted">No bills due</span>;
  const label = parts.map((p) => `${p.label} ${formatINR(p.paise / 100)}`).join(', ');
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full bg-bg-secondary" role="img" aria-label={label} title={label}>
      {parts.map((p) => (
        <span key={p.key} className="h-full" style={{ width: `${(p.paise / total) * 100}%`, background: p.fill }} />
      ))}
    </span>
  );
}

/**
 * How late the oldest unpaid bill is. When credits already cover everything
 * past due (net overdue at or below zero) it is muted: the bill is still open
 * on the ledger, but there is nothing to chase.
 */
function DaysBadge({ row }) {
  const days = row.max_bill_overdue_days;
  if (days == null) return null;
  const n = Math.round(Number(days));
  if (n <= 0) return <span className="text-[12.5px] font-bold text-emerald-400">Not yet due</span>;
  const covered = !(Number(row.overdue_amount) > 0);
  return (
    <span className={`text-[12.5px] font-bold tabular-nums ${covered ? 'text-text-muted' : getOverdueSeverity(n).text}`}>
      Oldest bill {n.toLocaleString('en-IN')} days overdue{covered ? ', adjusted by credits' : ''}
    </span>
  );
}

function AgeLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
      <span className="font-semibold">Bill ageing:</span>
      {AGING_BUCKETS.map((b) => (
        <span key={b.key} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: b.fill }} aria-hidden="true" />
          {b.label}
        </span>
      ))}
    </p>
  );
}

function NetCell({ row }) {
  const net = Number(row.total_outstanding);
  return (
    <>
      <span className="block text-[15px] font-black tabular-nums text-text-primary" title={formatINRFull(net)}>
        {formatINR(net)}
      </span>
      <span className="block text-[12px] text-text-muted mt-0.5">
        {net < 0 ? 'Advance / credit balance' : `Bills due ${formatINR(row.billsTotal)}`}
      </span>
    </>
  );
}

const count = (v) => (v || 0).toLocaleString('en-IN');
const entriesText = (r) => `${count(r.bill_count)} ${r.bill_count === 1 ? 'bill' : 'bills'}, ${count(r.credit_count)} ${r.credit_count === 1 ? 'credit' : 'credits'}`;

function SortHeader({ col, sort, onSort }) {
  if (!col.sortable) {
    return <span className={col.srOnly ? 'sr-only' : ''}>{col.label}</span>;
  }
  const active = sort.id === col.id;
  const Icon = active ? (sort.desc ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <button
      type="button"
      // The due-date column opens oldest first; the rest open largest first.
      onClick={() => onSort({ id: col.id, desc: active ? !sort.desc : col.id !== 'oldest' })}
      className={`inline-flex items-center gap-1.5 font-bold whitespace-nowrap cursor-pointer hover:text-text-primary ${active ? 'text-text-primary' : ''} ${col.className.includes('text-right') ? 'flex-row-reverse' : ''}`}
    >
      {col.label}
      <Icon className={`w-3.5 h-3.5 ${active ? '' : 'opacity-50'}`} aria-hidden="true" />
    </button>
  );
}

/**
 * The dealer receivables table. Sorting and filtering happen in the page hook;
 * this only pages and renders. Below 1280px (phones, tablets, laptops with the
 * sidebar open) the seven columns do not fit, so each dealer becomes a card
 * instead of a table that scrolls sideways.
 */
function DealerOutstandingTable({ rows, sort, onSort, onOpen, onClearFilters, hasFilters }) {
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  // A new filter or sort starts from page one. Reset during render so the old
  // page never paints against the new rows.
  const [prevRows, setPrevRows] = useState(rows);
  if (prevRows !== rows) {
    setPrevRows(rows);
    setPage(0);
  }

  if (rows.length === 0) {
    return (
      <div className="glass-card p-10 text-center">
        <p className="text-base font-bold text-text-primary">No dealers match these filters.</p>
        <p className="text-sm text-text-muted mt-1">Try another spelling, or widen the state and age filters.</p>
        {hasFilters && (
          <button type="button" onClick={onClearFilters} className="mt-4 px-4 py-2 rounded-xl bg-accent-blue text-white text-sm font-bold cursor-pointer hover:opacity-90">
            Clear filters
          </button>
        )}
      </div>
    );
  }

  const pageCount = Math.ceil(rows.length / pageSize);
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const ariaSort = (id) => (sort.id === id ? (sort.desc ? 'descending' : 'ascending') : 'none');

  return (
    <div className="space-y-3">
      <AgeLegend />
      <div className="hidden xl:block overflow-x-auto rounded-xl border border-border bg-bg-card">
        <table className="w-full table-fixed text-left border-collapse min-w-[940px]">
          <caption className="sr-only">Dealers by outstanding balance. Select a row to see its bills.</caption>
          <thead className="bg-bg-secondary text-[12.5px] text-text-muted">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.id} scope="col" aria-sort={c.sortable ? ariaSort(c.id) : undefined} className={`px-3 py-3 font-bold border-b border-border ${c.className}`}>
                  <SortHeader col={c} sort={sort} onSort={onSort} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} onClick={() => onOpen(r)} className="table-row-separator bg-bg-card hover:bg-bg-card-hover cursor-pointer align-top">
                <td className="px-3 py-3 table-cell-separator">
                  <span className="block font-bold text-[14.5px] text-text-primary leading-tight break-words">{r.dealer_name}</span>
                  <span className="block text-[12px] text-text-muted mt-1 truncate" title={r.party_codes || undefined}>
                    {r.party_codes || 'No party code'}
                  </span>
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md bg-bg-secondary border border-border text-[12px] font-semibold text-text-secondary">
                    {geoText(r)}
                  </span>
                </td>
                <td className="px-3 py-3 table-cell-separator text-right"><NetCell row={r} /></td>
                <td className="px-3 py-3 table-cell-separator text-right">
                  <span className={`block text-[15px] font-bold tabular-nums ${Number(r.overdue_amount) > 0 ? 'text-red-400' : 'text-text-secondary'}`} title={formatINRFull(r.overdue_amount)}>
                    {formatINR(r.overdue_amount)}
                  </span>
                </td>
                <td className="px-3 py-3 table-cell-separator">
                  <AgeBar row={r} />
                  <span className="block mt-1.5"><DaysBadge row={r} /></span>
                </td>
                <td className="px-3 py-3 table-cell-separator text-[13.5px] text-text-secondary tabular-nums">
                  {formatDate(r.oldest_bill_due_date) || <span className="text-text-muted">No open bill</span>}
                </td>
                <td className="px-3 py-3 table-cell-separator text-[13px] text-text-secondary tabular-nums">
                  <span className="block">{count(r.bill_count)} {r.bill_count === 1 ? 'bill' : 'bills'}</span>
                  <span className="block text-text-muted">{count(r.credit_count)} {r.credit_count === 1 ? 'credit' : 'credits'}</span>
                </td>
                <td className="px-3 py-3 table-cell-separator">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpen(r); }}
                    aria-label={`View bills for ${r.dealer_name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-bg-secondary text-[13px] font-bold text-accent-blue hover:border-border-accent cursor-pointer whitespace-nowrap"
                  >
                    View <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="xl:hidden flex items-center gap-2">
        <label htmlFor="ob-card-sort" className="text-[13px] font-semibold text-text-muted whitespace-nowrap">Sort by</label>
        <select
          id="ob-card-sort"
          className="filter-select flex-1 sm:flex-none sm:w-64"
          value={`${sort.id}:${sort.desc ? 'desc' : 'asc'}`}
          onChange={(e) => {
            const [id, dir] = e.target.value.split(':');
            onSort({ id, desc: dir === 'desc' });
          }}
        >
          {!CARD_SORTS.some((o) => o.value === `${sort.id}:${sort.desc ? 'desc' : 'asc'}`) && (
            <option value={`${sort.id}:${sort.desc ? 'desc' : 'asc'}`}>Custom order</option>
          )}
          {CARD_SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <ul className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
        {visible.map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => onOpen(r)} className="w-full h-full text-left p-4 rounded-xl border border-border bg-bg-card hover:bg-bg-card-hover hover:border-border-accent cursor-pointer">
              <span className="block font-bold text-[15px] text-text-primary leading-tight break-words">{r.dealer_name}</span>
              <span className="block text-[12.5px] text-text-muted mt-1">{geoText(r)}</span>
              <span className="flex items-end justify-between gap-3 mt-3">
                <span><NetCell row={r} /></span>
                <span className="text-right">
                  <span className="block text-[12px] text-text-muted">Overdue</span>
                  <span className={`block text-[15px] font-bold tabular-nums ${Number(r.overdue_amount) > 0 ? 'text-red-400' : 'text-text-secondary'}`}>
                    {formatINR(r.overdue_amount)}
                  </span>
                </span>
              </span>
              <span className="block mt-3"><AgeBar row={r} /></span>
              <span className="flex items-center justify-between gap-3 mt-2">
                <DaysBadge row={r} />
                <span className="inline-flex items-center gap-1 text-[13px] font-bold text-accent-blue">
                  {entriesText(r)} <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <TablePager
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        total={rows.length}
        onPage={setPage}
        onPageSize={(n) => { setPageSize(n); setPage(0); }}
      />
    </div>
  );
}

export default memo(DealerOutstandingTable);
