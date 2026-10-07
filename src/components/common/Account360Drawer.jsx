import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { MapPin, X } from 'lucide-react';
import { useFilterState } from '../../context/DataContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import SignalBadge from './SignalBadge';
import { SIGNALS } from '../../utils/account360';
import { formatMT } from '../../utils/formatters';
import { formatINR, formatINRFull, formatDate } from '../../utils/outstanding';
import { formatMonthLabel } from '../../utils/businessPlan';
import { getProductFullName } from '../../utils/constants';

const mt = n => formatMT(n, 1);
const FOCUSABLE = 'button:not([disabled]), [href], select, input';
const qs = params => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

// Chart fills. Fills keep their saturation in the light theme; text never uses them.
const FILL = { blue: '#4E8FF7', green: '#22c55e', amber: '#eab308', orange: '#f97316', red: '#ef4444', muted: '#64748b' };
const paceFill = p => (p >= 0.9 ? FILL.green : p >= 0.7 ? FILL.amber : FILL.red);
/** "742.2 MT short" or "120.0 MT ahead": the plan gap in tonnes. */
const gapText = (cur, due) => {
  if (due == null) return 'No target';
  const gap = cur - due;
  return Math.abs(gap) < 0.05 ? 'On target' : `${mt(Math.abs(gap))} ${gap < 0 ? 'short' : 'ahead'}`;
};
const AGE_BANDS = [
  { key: 'd0_30', label: '0 to 30 days', fill: FILL.blue },
  { key: 'd31_60', label: '31 to 60', fill: FILL.amber },
  { key: 'd61_90', label: '61 to 90', fill: FILL.orange },
  { key: 'd90plus', label: 'Over 90', fill: FILL.red },
];

// ── Pieces ──────────────────────────────────────────────────────────────────

function Swatch({ fill }) {
  return <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: fill }} aria-hidden="true" />;
}

function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[11.5px] text-text-muted">
      {items.filter(Boolean).map(it => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <Swatch fill={it.fill} />
          {it.label}
          {it.value != null && <span className="font-semibold text-text-primary tabular-nums">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Segments that add up to one bar. Zero segments are left out. */
function StackBar({ parts, label }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (!(total > 0)) return <div className="h-3 rounded-full bg-bg-secondary" aria-hidden="true" />;
  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-bg-secondary gap-px" role="img" aria-label={label}>
      {parts.filter(p => p.value > 0).map(p => (
        <span key={p.label} title={`${p.label}: ${p.text}`} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.fill }} />
      ))}
    </div>
  );
}

/** Small caret that names a point on a bar; also used as its legend key. */
function Caret({ className = '', style }) {
  return <span className={`w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-text-secondary ${className}`} style={style} aria-hidden="true" />;
}

/**
 * A reference point on a bar: a caret above it and a notch cut through the
 * track in the card colour, so nothing is drawn on top of the fill.
 */
function Mark({ at }) {
  // Kept off the rounded ends, where a notch would vanish and the caret overhang.
  const left = `clamp(6px, ${at}, calc(100% - 6px))`;
  return (
    <>
      <Caret className="absolute top-0 -translate-x-1/2" style={{ left }} />
      <span className="absolute bottom-0 h-3 w-[3px] -translate-x-1/2 bg-bg-card" style={{ left }} aria-hidden="true" />
    </>
  );
}

/**
 * Despatch as progress toward the plan target. The track ends at the target
 * (or at despatch once it passes), and the share due by today is marked.
 */
function TargetBar({ target, due, actual, pace }) {
  const max = Math.max(target, actual || 0);
  const at = v => `${Math.min(100, (v / max) * 100)}%`;
  const showDue = due > 0 && due < target;
  return (
    <div>
      <div
        className="relative pt-2"
        role="img"
        aria-label={`Despatched ${mt(actual)} of a ${mt(target)} target${showDue ? `, ${mt(due)} due by today` : ''}`}
      >
        <div className="h-3 rounded-full bg-border overflow-hidden">
          <span className="block h-full rounded-full" style={{ width: at(actual), backgroundColor: pace != null ? paceFill(pace) : FILL.blue }} />
        </div>
        {showDue && <Mark at={at(due)} />}
        {actual > target && <Mark at={at(target)} />}
      </div>
      <div className="flex items-center justify-between gap-3 mt-2 text-[11.5px] text-text-muted tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          {showDue && <><Caret />Due by today <span className="font-semibold text-text-primary">{mt(due)}</span></>}
        </span>
        <span>Target <span className="font-semibold text-text-primary">{mt(target)}</span></span>
      </div>
    </div>
  );
}

/** Two bars on one scale: this month against the usual. */
function CompareBars({ rows }) {
  const max = Math.max(1, ...rows.flatMap(r => [r.cur, r.usual]));
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex justify-between text-[11.5px] mb-1">
            <span className="text-text-muted">{r.label}</span>
            <span className="tabular-nums text-text-primary font-semibold">
              {r.cur.toLocaleString('en-IN')}{' '}
              <span className="font-normal text-text-muted">vs usual {r.usual.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</span>
            </span>
          </div>
          <div className="relative pt-2">
            <div className="h-3 rounded-full bg-border overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${(r.cur / max) * 100}%`, backgroundColor: r.cur >= r.usual ? FILL.green : FILL.amber }} />
            </div>
            {r.usual > 0 && <Mark at={`${(r.usual / max) * 100}%`} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** This month against last month per product, on one scale, with what is still waiting. */
function ProductBars({ products }) {
  const max = Math.max(1, ...products.flatMap(p => [p.cur, p.prev]));
  return (
    <ul className="space-y-3">
      {products.map(p => (
        <li key={p.product} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-text-primary truncate">{getProductFullName(p.product)}</span>
            <span className="block text-[11px] text-text-muted">{p.pending > 0 ? `${mt(p.pending)} waiting` : 'Nothing waiting'}</span>
          </span>
          <span className="space-y-1" aria-hidden="true">
            <span className="block h-2.5 rounded-sm bg-bg-secondary"><span className="block h-full rounded-sm" style={{ width: `${(p.cur / max) * 100}%`, backgroundColor: FILL.blue }} /></span>
            <span className="block h-1.5 rounded-sm bg-bg-secondary"><span className="block h-full rounded-sm" style={{ width: `${(p.prev / max) * 100}%`, backgroundColor: FILL.muted }} /></span>
          </span>
          <span className="text-right tabular-nums">
            <span className="block text-[12.5px] font-bold text-text-primary">{mt(p.cur)}</span>
            <span className="block text-[11px] text-text-muted">{mt(p.prev)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Block({ title, period, link, wide, children }) {
  return (
    <section className={`flex flex-col p-4 rounded-xl bg-bg-card border border-border min-w-0 ${wide ? 'md:col-span-2' : ''}`}>
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-bold text-text-primary">{title}</h3>
          {period && <p className="mt-0.5 text-[12px] text-text-muted">{period}</p>}
        </div>
        {link && (
          <button
            type="button"
            onClick={link.onClick}
            className="shrink-0 inline-flex items-center min-h-[44px] -my-3 sm:min-h-0 sm:my-0 text-[12px] font-semibold text-accent-blue hover:underline underline-offset-2 cursor-pointer"
          >
            {link.label}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function Lead({ value, sub }) {
  return (
    <div className="mb-3">
      <div className="text-[24px] leading-none font-black text-text-primary tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-text-muted">{sub}</div>}
    </div>
  );
}

function Missing({ status, empty }) {
  if (status === 'loading') return <div className="flex-1 min-h-24 rounded-lg bg-bg-secondary animate-pulse" aria-label="Loading" />;
  if (status === 'error') return <p className="text-[13px] text-severity-critical">Could not load this source. Reload the page to try again.</p>;
  return <p className="text-[13px] text-text-muted">{empty}</p>;
}

// ── Drawer ──────────────────────────────────────────────────────────────────

/**
 * Account view: despatch, pending orders, receivables, the business plan and
 * field visits for one state, district or dealer, with the dealers that need
 * attention first. Slides over the page like the Outstanding bills drawer and
 * the Visits district panel; portalled for the same reason (the layout's
 * scroll container is transformed).
 */
export default function Account360Drawer({ record, meta, status, onClose }) {
  const navigate = useNavigate();
  const { filters, dispatch } = useFilterState();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const open = Boolean(record && meta);
  useBodyScrollLock(open);

  const id = record ? `${record.level}|${record.state}|${record.district}|${record.name}` : null;
  useEffect(() => {
    if (!id) return undefined;
    const back = document.activeElement;
    closeRef.current?.focus();
    const onKey = e => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = dialogRef.current.querySelectorAll(FOCUSABLE);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [id, onClose]);

  if (!open) return null;

  const { level, despatch, pending, outstanding: out, plan, visits, pace, signal } = record;
  const isDealer = level === 'dealer';
  const go = url => { onClose(); navigate(url); };

  const openPending = () => {
    // Pending reads the shared filters, not the URL.
    dispatch({ type: 'SYNC_FILTERS', payload: { state: record.state, district: record.district, product: filters.selectedProduct } });
    go('/pending');
  };
  const openOutstanding = () => go(`/outstanding${out?.accountKey
    ? qs({ dealer: out.accountKey })
    : qs({ state: out?.place.state, district: out?.place.district })}`);
  const openPlan = () => go(`/business-plan${qs({
    state: plan?.place.state, district: plan?.place.district, customer: isDealer ? plan?.customer : null,
  })}`);
  const openVisits = () => go(`/visits${qs({
    state: visits?.place.state, district: visits?.place.district, q: isDealer ? visits?.dealer : null,
  })}`);
  const openDealer = d => go(`/dealers${qs({ state: d.state, district: d.district, search: d.name })}`);

  const planMonth = meta.planMonth ? formatMonthLabel(meta.planMonth) : null;
  const despatchMonth = meta.despatchMonth ? formatMonthLabel(meta.despatchMonth) : null;
  const visitsMonth = meta.visitsPeriod ? `${formatMonthLabel(meta.visitsPeriod)}${meta.visitsFullMonth ? '' : ', to date'}` : null;
  const ledgerDate = meta.ledgerAsOn ? `as on ${formatDate(meta.ledgerAsOn)}` : null;

  const where = isDealer ? `${record.district}, ${record.state}` : level === 'district' ? record.state : null;
  const flagged = SIGNALS.map(s => ({ ...s, n: record.signalCounts?.[s.key] || 0 })).filter(s => s.n > 0);
  const unflagged = Math.max(0, (record.dealerCount || 0) - flagged.reduce((a, s) => a + s.n, 0));
  const planCurrent = meta.planCurrent !== false;
  const due = record.planDue || 0;
  const rates = meta.matchRate || {};

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="a360-title"
        className="ob-drawer relative flex flex-col w-full max-w-[900px] h-full bg-bg-primary border-l border-border shadow-2xl overflow-y-auto overscroll-contain md:overflow-hidden"
      >
        {/* Who, and what needs doing */}
        <header className="p-4 sm:p-6 border-b border-border space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="a360-title" className="text-xl sm:text-[26px] font-black text-text-primary leading-tight break-words tracking-tight">{record.name}</h2>
              <p className="flex items-center gap-1.5 mt-1.5 text-[13px] text-text-muted">
                {where && <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                {where || `${record.dealerCount} dealers with a despatch record`}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close account view"
              className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {signal ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <SignalBadge signal={signal} />
              <p className="text-[13.5px] text-text-primary leading-snug">
                {isDealer
                  ? <>{signal.reason}. <span className="text-text-muted">{signal.action}</span></>
                  : <>{signal.count} of {record.dealerCount} dealers. <span className="text-text-muted">{signal.action}</span></>}
              </p>
            </div>
          ) : (
            <p className="text-[13.5px] text-text-muted">
              {Object.values(status).some(s => s === 'loading')
                ? 'Linking pending orders, receivables, plan and visits.'
                : 'Nothing in the linked data needs attention.'}
            </p>
          )}

          {!isDealer && record.dealerCount > 0 && flagged.length > 0 && (
            <div>
              <StackBar
                label="Dealers by attention"
                parts={[
                  ...flagged.map(s => ({ label: s.label, value: s.n, text: `${s.n} dealers`, fill: s.color })),
                  { label: 'No flag', value: unflagged, text: `${unflagged} dealers`, fill: FILL.muted },
                ]}
              />
              <Legend items={[
                ...flagged.map(s => ({ label: s.label, value: s.n, fill: s.color })),
                unflagged > 0 && { label: 'No flag', value: unflagged, fill: FILL.muted },
              ]} />
            </div>
          )}
        </header>

        {/* On a phone the whole drawer scrolls, so the header does not hold a third of the screen. */}
        <div className="flex-1 md:overflow-y-auto md:overscroll-contain p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Block title="Plan and despatch" period={despatchMonth} link={plan ? { label: 'View in Business Plan', onClick: openPlan } : null}>
              <Lead
                value={mt(despatch.cur)}
                sub={planCurrent && plan?.target > 0
                  ? `despatched against the ${planMonth} target of ${mt(plan.target)}`
                  : `despatched, against ${mt(despatch.prev)} last month`}
              />
              {plan && !planCurrent ? (
                <p className="mt-auto pt-3 border-t border-border text-[12px] text-text-muted leading-relaxed">
                  No plan filed for {despatchMonth} yet. The latest is {planMonth}, so there is no target to measure against.
                </p>
              ) : plan ? (
                <>
                  {plan.target > 0 && <TargetBar target={plan.target} due={due} actual={despatch.cur} pace={pace} />}
                  <dl className={`mt-auto pt-4 grid gap-3 text-[12px] ${plan.potential > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <div>
                      <dt className="text-text-muted">Against target so far</dt>
                      <dd className="font-bold text-text-primary tabular-nums">{gapText(despatch.cur, record.planDue)}</dd>
                    </div>
                    {plan.potential > 0 && <div><dt className="text-text-muted">Potential</dt><dd className="font-bold text-text-primary tabular-nums">{mt(plan.potential)}</dd></div>}
                    {isDealer
                      ? <div><dt className="text-text-muted">Last month</dt><dd className="font-bold text-text-primary tabular-nums">{mt(despatch.prev)}</dd></div>
                      : <div><dt className="text-text-muted">Plans filed</dt><dd className="font-bold text-text-primary tabular-nums">{plan.filed} of {plan.accounts}</dd></div>}
                  </dl>
                </>
              ) : <Missing status={status.plan} empty="Not in the business plan." />}
            </Block>

            <Block title="Pending orders" link={pending.qty > 0 ? { label: 'View in Pending', onClick: openPending } : null}>
              {pending.qty > 0 ? (
                <>
                  <Lead value={mt(pending.qty)} sub={`waiting${pending.oldestDays != null ? `, oldest ${pending.oldestDays} days` : ''}`} />
                  <StackBar
                    label="Pending orders by age"
                    parts={AGE_BANDS.map(b => ({ label: b.label, value: pending.aging[b.key], text: mt(pending.aging[b.key]), fill: b.fill }))}
                  />
                  <Legend items={AGE_BANDS.filter(b => pending.aging[b.key] > 0).map(b => ({ label: b.label, value: mt(pending.aging[b.key]), fill: b.fill }))} />
                  <dl className="mt-auto pt-3 grid grid-cols-2 gap-3 text-[12px]">
                    <div><dt className="text-text-muted">Over 30 days</dt><dd className="font-bold text-text-primary tabular-nums">{mt(pending.over30)}</dd></div>
                    <div><dt className="text-text-muted">Share over 30 days</dt><dd className="font-bold text-text-primary tabular-nums">{Math.round((pending.over30 / pending.qty) * 100)}%</dd></div>
                  </dl>
                </>
              ) : <p className="text-[13px] text-text-muted">No orders waiting.</p>}
            </Block>

            <Block title="Receivables" period={ledgerDate} link={out ? { label: 'View in Outstanding', onClick: openOutstanding } : null}>
              {out ? (
                <>
                  <Lead value={<span title={formatINRFull(out.total)}>{formatINR(out.total)}</span>} sub={`outstanding, ${formatINR(out.overdue)} of it overdue`} />
                  <StackBar
                    label="Receivables, overdue and not yet due"
                    parts={[
                      { label: 'Overdue', value: out.overdue, text: formatINR(out.overdue), fill: FILL.red },
                      { label: 'Not yet due', value: out.notDue, text: formatINR(out.notDue), fill: FILL.blue },
                    ]}
                  />
                  <Legend items={[
                    { label: 'Overdue', value: formatINR(out.overdue), fill: FILL.red },
                    { label: 'Not yet due', value: formatINR(out.notDue), fill: FILL.blue },
                  ]} />
                  <dl className="mt-auto pt-3 grid grid-cols-2 gap-3 text-[12px]">
                    <div><dt className="text-text-muted">Oldest unpaid bill</dt><dd className="font-bold text-text-primary tabular-nums">{out.maxOverdueDays > 0 ? `${Math.round(out.maxOverdueDays).toLocaleString('en-IN')} days late` : 'None late'}</dd></div>
                    {!isDealer && <div><dt className="text-text-muted">Dealers owing</dt><dd className="font-bold text-text-primary tabular-nums">{out.dealers}</dd></div>}
                  </dl>
                </>
              ) : <Missing status={status.outstanding} empty="No ledger balance found for this name." />}
            </Block>

            <Block title="Field visits" period={visitsMonth} link={visits ? { label: 'View in Visits', onClick: openVisits } : null}>
              {visits ? (
                <>
                  <Lead
                    value={visits.cur.toLocaleString('en-IN')}
                    sub={isDealer && visits.rep ? `dealer visits, mostly by ${visits.rep}` : 'dealer visits'}
                  />
                  <CompareBars rows={[
                    { label: 'Dealer visits', cur: visits.cur, usual: visits.usual },
                    !isDealer && visits.fabricatorCur > 0 && { label: 'Fabricator visits', cur: visits.fabricatorCur, usual: visits.fabricatorUsual },
                  ].filter(Boolean)} />
                  {isDealer && (visits.kro || visits.krm) && (
                    <dl className="mt-auto pt-3 grid grid-cols-2 gap-3 text-[12px]">
                      <div className="min-w-0"><dt className="text-text-muted">Assigned KRO</dt><dd className="font-bold text-text-primary truncate">{visits.kro || 'Not assigned'}</dd></div>
                      <div className="min-w-0"><dt className="text-text-muted">Assigned KRM</dt><dd className="font-bold text-text-primary truncate">{visits.krm || 'Not assigned'}</dd></div>
                    </dl>
                  )}
                </>
              ) : <Missing status={status.visits} empty="No visits recorded." />}
            </Block>

            {record.products?.length > 0 && (
              <Block title="Product mix" period={despatchMonth} wide>
                <ProductBars products={record.products} />
                <Legend items={[
                  { label: 'This month', fill: FILL.blue },
                  { label: 'Last month', fill: FILL.muted },
                ]} />
              </Block>
            )}
          </div>

          {!isDealer && record.topDealers?.length > 0 && (
            <section className="rounded-xl bg-bg-card border border-border overflow-hidden">
              <header className="px-4 py-3 border-b border-border">
                <h3 className="text-[13.5px] font-bold text-text-primary">Dealers needing attention</h3>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11.5px] text-text-muted">
                      <th scope="col" className="px-4 py-2 font-semibold">Dealer</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Attention</th>
                      <th scope="col" className="px-3 py-2 font-semibold text-right">Pending orders</th>
                      <th scope="col" className="px-3 py-2 font-semibold text-right">Overdue</th>
                      <th scope="col" className="px-4 py-2 font-semibold text-right">{planCurrent ? 'Despatched / target' : 'Despatched'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.topDealers.map(d => (
                      <tr key={`${d.district}|${d.name}`} className="border-t border-border hover:bg-bg-card-hover">
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => openDealer(d)}
                            className="text-left min-h-[44px] sm:min-h-0 font-semibold text-text-primary hover:text-accent-blue hover:underline underline-offset-2 cursor-pointer"
                          >
                            {d.name}
                          </button>
                          {level === 'state' && <span className="block text-[11.5px] text-text-muted">{d.district}</span>}
                        </td>
                        <td className="px-3 py-2.5"><SignalBadge signal={d.signal} /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-text-primary whitespace-nowrap">{d.pending.qty > 0 ? mt(d.pending.qty) : 'None'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-text-primary whitespace-nowrap">{d.outstanding?.overdue > 0 ? formatINR(d.outstanding.overdue) : 'None'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-primary whitespace-nowrap">
                          {!planCurrent ? mt(d.despatch.cur) : d.plan?.target > 0
                            ? <>{mt(d.despatch.cur)} <span className="text-text-muted">/ {mt(d.plan.target)}</span></>
                            : <>{mt(d.despatch.cur)} <span className="text-text-muted">/ no target</span></>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {rates.outstanding != null && (
            <p className="text-[11.5px] text-text-muted leading-relaxed max-w-[75ch]">
              Of {meta.activeDealers} active dealers, {rates.outstanding}% matched to the ledger, {rates.plan ?? 'n/a'}% to the plan
              and {rates.visits ?? 'n/a'}% to visits. A dealer with no match shows no figure rather than zero.
              {pace != null && ` Target so far is the ${planMonth} target scaled to the days gone in ${despatchMonth}.`}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
