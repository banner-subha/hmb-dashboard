import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, MapPin, User, X } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { fetchDealerBills } from '../../services/outstandingService';
import { downloadCsv, getExportFilename } from '../../utils/csvExport';
import {
  VOUCHER_CSV_COLUMNS,
  formatDate,
  formatINR,
  formatINRFull,
  getOverdueSeverity,
  matchSourceInfo,
} from '../../utils/outstanding';

// The largest account has 1,643 entries; drawing them all at once is ~10,000
// cells on a phone. The first batch covers every account but 13.
const FIRST_BATCH = 200;

const VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'bills', label: 'Bills' },
  { key: 'credits', label: 'Credits' },
];

function Figure({ label, value, tone = 'text-text-primary' }) {
  return (
    <div className="px-3 py-2.5 rounded-xl bg-bg-secondary border border-border">
      <span className="block text-[12px] font-bold text-text-muted">{label}</span>
      <span className={`block text-[17px] font-black tabular-nums mt-0.5 ${tone}`} title={formatINRFull(value)}>{formatINR(value)}</span>
    </div>
  );
}

/**
 * Days past the due date. Where the ledger has no due date the RPC falls back
 * to days since the bill, and the tooltip says so.
 */
function DaysCell({ v }) {
  const credit = Number(v.outstanding_amount) < 0;
  const n = Math.round(Number(v.overdue_days) || 0);
  const title = v.due_date ? undefined : 'No due date recorded: days counted from the bill date';
  if (n < 0) return <span className="text-emerald-400 font-bold whitespace-nowrap" title={title}>Due in {-n} days</span>;
  if (n === 0) return <span className="text-emerald-400 font-bold" title={title}>Due today</span>;
  // A credit's age is how long it has sat unmatched, not a late payment.
  return (
    <span className={`font-bold tabular-nums ${credit ? 'text-text-muted' : getOverdueSeverity(n).text}`} title={title}>
      {n.toLocaleString('en-IN')} days{v.due_date ? '' : '*'}
    </span>
  );
}

/**
 * Slide-over with every open entry for one dealer, loaded on open. Portalled to
 * body for the same reason as DealerScorecardModal: the layout's scroll panel
 * carries a transform, which would trap `position: fixed` inside it.
 */
function VoucherDrilldownModal({ account, onClose }) {
  const [result, setResult] = useState({ key: null, vouchers: null, error: null });
  const [view, setView] = useState('all');
  const [limit, setLimit] = useState(FIRST_BATCH);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);

  useBodyScrollLock(Boolean(account));

  const key = account?.key;
  useEffect(() => {
    if (!account) return undefined;
    let live = true;
    fetchDealerBills(account)
      .then((vouchers) => live && setResult({ key: account.key, vouchers, error: null }))
      .catch((err) => live && setResult({ key: account.key, vouchers: null, error: err.message }));
    return () => { live = false; };
  }, [account]);

  // Focus moves into the drawer on open, Tab stays inside it, and focus goes
  // back to the row's button on close. The page remounts this per dealer
  // (key), so the view toggle starts at "All" each time.
  useEffect(() => {
    if (!key) return undefined;
    returnFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = dialogRef.current.querySelectorAll('button:not([disabled]), [href], select, input');
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus?.();
    };
  }, [key, onClose]);

  const loaded = result.key === key ? result : { vouchers: null, error: null };
  const shown = useMemo(() => {
    const all = loaded.vouchers || [];
    const bills = all.filter((v) => Number(v.outstanding_amount) > 0);
    const credits = all.filter((v) => Number(v.outstanding_amount) <= 0);
    if (view === 'bills') return bills;
    if (view === 'credits') return credits;
    // Bills first: they are what gets chased. Each part keeps the RPC's
    // most-overdue-first order.
    return [...bills, ...credits];
  }, [loaded.vouchers, view]);

  if (!account) return null;

  const a = account;
  const geo = a.districtLabel ? `${a.districtLabel}, ${a.stateLabel}` : a.stateLabel;
  const exportBills = () => {
    const slug = a.dealer_name.slice(0, 40);
    downloadCsv(getExportFilename(`outstanding_bills_${slug}`, view), VOUCHER_CSV_COLUMNS, shown);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-drawer-title"
        className="ob-drawer relative flex flex-col w-full max-w-[860px] h-full bg-bg-primary border-l border-border shadow-2xl"
      >
        <header className="p-4 sm:p-5 border-b border-border space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="ob-drawer-title" className="text-xl sm:text-2xl font-black text-text-primary leading-tight break-words">{a.dealer_name}</h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[13px] text-text-muted">
                <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden="true" />{geo}</span>
                <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" aria-hidden="true" />{a.employee_names || 'No salesperson recorded'}</span>
                <span className="break-all line-clamp-2" title={a.party_codes || undefined}>{a.party_codes || 'No party code'}</span>
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close bills"
              className="shrink-0 w-10 h-10 rounded-full bg-bg-secondary border border-border flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Figure label="Outstanding" value={a.total_outstanding} />
            <Figure label="Overdue" value={a.overdue_amount} tone={Number(a.overdue_amount) > 0 ? 'text-red-400' : 'text-text-secondary'} />
            <Figure label="Bills due" value={a.billsTotal} />
            <Figure label="Unadjusted credits" value={a.credit_total} tone="text-text-secondary" />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-tertiary border border-border w-max" role="group" aria-label="Show entries">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                aria-pressed={view === v.key}
                onClick={() => { setView(v.key); setLimit(FIRST_BATCH); }}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-bold cursor-pointer ${view === v.key ? 'bg-bg-card text-accent-blue border border-border-accent' : 'text-text-secondary border border-transparent hover:text-text-primary'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loaded.error ? (
            <p className="m-5 rounded-xl border border-severity-critical/40 bg-severity-critical/10 p-4 text-sm font-semibold text-red-400">{loaded.error}</p>
          ) : !loaded.vouchers ? (
            <div className="p-5 space-y-2" role="status" aria-label="Loading bills">
              {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-11" />)}
            </div>
          ) : shown.length === 0 ? (
            <p className="p-10 text-center text-sm text-text-muted">No {view === 'credits' ? 'credit entries' : 'open bills'} for this dealer.</p>
          ) : (
            <table className="w-full text-left border-collapse text-[13px]">
              <caption className="sr-only">Open entries for {a.dealer_name}: bills first, most overdue first</caption>
              <thead className="sticky top-0 z-10 bg-bg-secondary text-[12px] text-text-muted">
                <tr>
                  <th scope="col" className="px-3 sm:px-4 py-2.5 font-bold">Bill / credit no.</th>
                  <th scope="col" className="px-3 py-2.5 font-bold hidden sm:table-cell">Order no.</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">Due date</th>
                  <th scope="col" className="px-3 py-2.5 font-bold text-right">Days overdue</th>
                  <th scope="col" className="px-3 sm:px-4 py-2.5 font-bold text-right">Amount</th>
                  <th scope="col" className="px-3 sm:px-4 py-2.5 font-bold hidden md:table-cell">Matched from</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((v) => {
                  const amt = Number(v.outstanding_amount);
                  const src = matchSourceInfo(v.match_source);
                  return (
                    <tr key={v.id} className="table-row-separator align-top">
                      <td className="px-3 sm:px-4 py-2.5 table-cell-separator">
                        <span className="block font-semibold text-text-primary break-all">{v.voucher_no}</span>
                        <span className="block text-[12px] text-text-muted mt-0.5">{amt < 0 ? 'Credit' : 'Bill'}, {formatDate(v.voucher_date) || 'no date'}</span>
                      </td>
                      <td className="px-3 py-2.5 table-cell-separator text-text-secondary hidden sm:table-cell break-all">{v.order_no || <span className="text-text-muted">None</span>}</td>
                      <td className="px-3 py-2.5 table-cell-separator text-text-secondary whitespace-nowrap">{formatDate(v.due_date) || 'n/a'}</td>
                      <td className="px-3 py-2.5 table-cell-separator text-right whitespace-nowrap"><DaysCell v={v} /></td>
                      <td className={`px-3 sm:px-4 py-2.5 table-cell-separator text-right font-bold tabular-nums whitespace-nowrap ${amt < 0 ? 'text-text-secondary' : 'text-text-primary'}`} title={formatINRFull(amt)}>
                        {formatINR(amt)}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 table-cell-separator hidden md:table-cell">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-bg-secondary border border-border text-[11.5px] font-semibold text-text-secondary whitespace-nowrap" title={src.title}>{src.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {shown.length > limit && (
            <div className="p-4 text-center">
              <button
                type="button"
                onClick={() => setLimit(shown.length)}
                className="px-4 py-2 rounded-xl border border-border bg-bg-card text-[13px] font-bold text-accent-blue hover:border-border-accent cursor-pointer"
              >
                Show all {shown.length.toLocaleString('en-IN')} entries
              </button>
            </div>
          )}
          {shown.some((v) => !v.due_date && Number(v.overdue_days) > 0) && (
            <p className="px-4 py-3 text-[12px] text-text-muted">* No due date recorded, so days are counted from the bill date.</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 p-3 sm:p-4 border-t border-border bg-bg-secondary">
          <span className="text-[13px] text-text-muted">
            {loaded.vouchers
              ? `${Math.min(limit, shown.length).toLocaleString('en-IN')} of ${loaded.vouchers.length.toLocaleString('en-IN')} entries shown`
              : 'Loading entries'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportBills}
              disabled={!shown.length}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-bg-card text-[13px] font-bold text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-accent-blue" aria-hidden="true" /> Export bills
            </button>
            <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl bg-accent-blue text-white text-[13px] font-bold cursor-pointer hover:opacity-90">
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}

export default memo(VoucherDrilldownModal);
