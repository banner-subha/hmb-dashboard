import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Download, Table2 } from 'lucide-react';

// Full rows for a tool call, sortable, with CSV export. Fetched from the
// server-side cache keyed by tool_call_id, so what is exported is exactly
// what SQL returned.
//
// Collapsed by default in the panel: a wide table in a 420px column is worth
// offering, not imposing. The full-page view is where it is comfortable.

const TONNES = new Set([
  'tonnage', 'actual_pending', 'pending_gross', 'order_qty', 'despatch_qty',
  'cancelled_qty', 'avg_line_tonnes', 'target_derived', 'total_despatch',
  'scheme_despatch', 'invoiced_despatch', 'gap', 'variance',
]);
const PERCENT = new Set(['pct_of_total', 'achievement_pct', 'match_pct']);
const RUPEES = new Set(['revenue', 'avg_rate']);

const HEADER = {
  tonnage: 'Tonnage (MT)',
  actual_pending: 'Pending (MT)',
  pending_gross: 'Gross pending (MT)',
  order_qty: 'Ordered (MT)',
  despatch_qty: 'Despatched (MT)',
  cancelled_qty: 'Cancelled (MT)',
  avg_line_tonnes: 'Avg line (MT)',
  target_derived: 'Target (MT)',
  total_despatch: 'Despatch (MT)',
  scheme_despatch: 'Scheme (MT)',
  invoiced_despatch: 'Invoiced (MT)',
  gap: 'Gap (MT)',
  variance: 'Variance (MT)',
  pct_of_total: 'Share',
  achievement_pct: 'Achievement',
  match_pct: 'Matched',
  revenue: 'Revenue',
  avg_rate: 'Avg rate',
  line_count: 'Lines',
  invoice_count: 'Invoices',
  order_count: 'Orders',
  dealer_count: 'Dealers',
  behind_count: 'Behind',
  achieved_count: 'Achieved',
  matched_dealers: 'Matched dealers',
  max_age_days: 'Oldest (days)',
  avg_age_days: 'Avg age (days)',
  oldest_order: 'Oldest order',
  target_is_derived: 'Target derived',
};

const titleise = (k) =>
  HEADER[k] || k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function display(key, value) {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (RUPEES.has(key)) {
    if (key === 'avg_rate') return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/MT`;
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  }
  if (PERCENT.has(key)) return `${n.toFixed(1)}%`;
  if (TONNES.has(key)) {
    return n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  if (Number.isInteger(n)) return n.toLocaleString('en-IN');
  return n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Flatten grp into real columns so both the table and the CSV are one row per
// group with no nested JSON.
function flatten(rows) {
  const dimKeys = [];
  for (const r of rows) {
    for (const k of Object.keys(r.grp || {})) {
      if (!dimKeys.includes(k)) dimKeys.push(k);
    }
  }
  const metricKeys = Object.keys(rows[0] || {}).filter((k) => k !== 'grp');
  const flat = rows.map((r) => {
    const out = {};
    for (const k of dimKeys) out[k] = r.grp?.[k] ?? null;
    for (const k of metricKeys) out[k] = r[k];
    return out;
  });
  return { columns: [...dimKeys, ...metricKeys], dimKeys, rows: flat };
}

function toCsv(columns, rows) {
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    // Leading =, +, - or @ makes a spreadsheet treat the cell as a formula.
    const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };
  const lines = [columns.map(escape).join(',')];
  for (const r of rows) lines.push(columns.map((c) => escape(r[c])).join(','));
  return lines.join('\n');
}

export default function ResultTable({ toolCallId, tool, rowCount, loadResult }) {
  const [payload, setPayload] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState(null);

  useEffect(() => {
    if (!open || payload) return;
    let cancelled = false;
    loadResult(toolCallId)
      .then((p) => !cancelled && setPayload(p))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [open, payload, toolCallId, loadResult]);

  const table = useMemo(() => {
    if (!payload?.rows?.length) return null;
    return flatten(payload.rows);
  }, [payload]);

  const sorted = useMemo(() => {
    if (!table) return [];
    if (!sort) return table.rows;
    const { key, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    return [...table.rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null) return 1;
      if (bv == null) return -1;
      const an = Number(av);
      const bn = Number(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [table, sort]);

  const download = () => {
    if (!table) return;
    const csv = toCsv(table.columns, sorted);
    // Excel needs a BOM to read UTF-8 correctly.
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tool}-${toolCallId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!rowCount) return null;

  return (
    <div className="my-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 -ml-1.5 text-[0.8rem] text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-secondary"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <Table2 className="h-3.5 w-3.5 shrink-0" />
          <span className="tabular-nums">
            {open ? 'Hide' : 'Show'} {rowCount.toLocaleString('en-IN')} row
            {rowCount === 1 ? '' : 's'}
          </span>
        </button>
        {open && table && (
          <button
            type="button"
            onClick={download}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.78rem] text-text-muted transition-colors hover:bg-bg-card-hover hover:text-accent-blue"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        )}
      </div>

      {open && error && (
        <p className="mt-2 text-[0.8rem] text-severity-critical">Could not load rows: {error}</p>
      )}

      {open && !payload && !error && (
        <div className="mt-2 h-24 animate-pulse rounded-xl border border-border bg-bg-tertiary" />
      )}

      {open && table && (
        <div className="mt-2 max-h-[26rem] overflow-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-[0.82rem]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-bg-tertiary">
                {table.columns.map((c, ci) => {
                  const active = sort?.key === c;
                  const numeric = !table.dimKeys.includes(c);
                  return (
                    <th
                      key={c}
                      className={`whitespace-nowrap border-b border-border px-3 py-2 font-semibold ${
                        numeric ? 'text-right' : 'text-left'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSort((prev) =>
                            prev?.key === c
                              ? { key: c, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                              : { key: c, dir: numeric ? 'desc' : 'asc' },
                          )
                        }
                        className={`inline-flex items-center gap-1 transition-colors hover:text-accent-blue ${
                          active ? 'text-accent-blue' : 'text-text-primary'
                        } ${numeric && ci > 0 ? 'flex-row-reverse' : ''}`}
                      >
                        {titleise(c)}
                        {active &&
                          (sort.dir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          ))}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, ri) => (
                <tr key={ri} className="border-t border-border/60 hover:bg-bg-card-hover">
                  {table.columns.map((c) => (
                    <td
                      key={c}
                      className={`px-3 py-[7px] ${
                        table.dimKeys.includes(c)
                          ? 'text-text-primary'
                          : 'text-right tabular-nums text-text-secondary'
                      }`}
                    >
                      {display(c, r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
