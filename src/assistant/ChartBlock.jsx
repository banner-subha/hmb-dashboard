import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// The model emits a spec; the rows come from the server cache keyed by
// tool_call_id. Numbers therefore never pass through the model.
//
// Carried over from the old chat unchanged apart from sizing: it has to read
// at 380px in the panel as well as full width on the page.

// Same descending blue spectrum the dashboard charts use, so a chat chart and
// a dashboard chart read as the same product.
const PALETTE = [
  '#1E40AF', '#2563EB', '#3B82F6', '#60A5FA',
  '#0EA5E9', '#06B6D4', '#38BDF8', '#818CF8',
];

const UNIT = {
  tonnage: ' t',
  actual_pending: ' t',
  pending_gross: ' t',
  order_qty: ' t',
  despatch_qty: ' t',
  cancelled_qty: ' t',
  target_derived: ' t',
  total_despatch: ' t',
  scheme_despatch: ' t',
  invoiced_despatch: ' t',
  gap: ' t',
  variance: ' t',
  pct_of_total: '%',
  achievement_pct: '%',
  match_pct: '%',
  avg_rate: '',
  revenue: '',
};

const METRIC_LABEL = {
  tonnage: 'Tonnage',
  actual_pending: 'Pending',
  pct_of_total: 'Share',
  avg_rate: 'Avg rate',
  revenue: 'Revenue',
  order_count: 'Orders',
  dealer_count: 'Dealers',
  achievement_pct: 'Achievement',
  target_derived: 'Target',
  total_despatch: 'Despatch',
  invoiced_despatch: 'Invoiced',
  gap: 'Gap',
  max_age_days: 'Oldest (days)',
  avg_age_days: 'Average age (days)',
};

function formatValue(v, metric) {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  if (metric === 'revenue') {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  }
  if (metric === 'avg_rate') {
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/MT`;
  }
  const unit = UNIT[metric] ?? '';
  const decimals = Number.isInteger(n) ? 0 : 1;
  return `${n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${unit}`;
}

function axisTick(v, metric) {
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  if (metric === 'revenue') {
    if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
    if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(0)}L`;
  }
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

function ChartTooltip({ active, payload, metric }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip min-w-[160px] space-y-1.5 p-3">
      <p className="text-sm font-bold leading-tight text-text-primary">{row.name}</p>
      <div className="flex justify-between gap-4 text-xs">
        <span className="text-text-muted">{METRIC_LABEL[metric] || metric}</span>
        <span className="font-mono font-semibold text-text-primary">
          {formatValue(row.value, metric)}
        </span>
      </div>
      {row.share != null && metric !== 'pct_of_total' && (
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-text-muted">Share</span>
          <span className="font-mono text-text-secondary">{Number(row.share).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

const AXIS = { fill: 'var(--color-text-muted)', fontSize: 11 };

export default function ChartBlock({ spec, loadResult }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadResult(spec.source).then(
      (p) => {
        if (cancelled) return;
        setPayload(p);
        setError(null);
      },
      (err) => {
        if (!cancelled) setError(err.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [spec.source, loadResult]);

  const data = useMemo(() => {
    if (!payload?.rows) return [];
    return payload.rows
      .map((r) => ({
        name: String(r.grp?.[spec.x] ?? '—'),
        value: r[spec.y] == null ? null : Number(r[spec.y]),
        share: r.pct_of_total == null ? null : Number(r.pct_of_total),
      }))
      .filter((d) => d.value != null)
      .slice(0, 24);
  }, [payload, spec.x, spec.y]);

  if (error) {
    return (
      <div className="my-4 rounded-xl border border-border bg-bg-tertiary px-3.5 py-3 text-[0.82rem] text-text-muted">
        Chart unavailable: {error}
      </div>
    );
  }
  if (!payload) {
    return (
      <div className="my-4 h-[260px] animate-pulse rounded-xl border border-border bg-bg-tertiary" />
    );
  }
  if (!data.length) return null;

  const long = data.length > 7 || data.some((d) => d.name.length > 10);
  const common = {
    data,
    margin: { top: 8, right: 12, bottom: long ? 58 : 8, left: 4 },
  };
  const xAxis = (
    <XAxis
      dataKey="name"
      tick={AXIS}
      stroke="var(--color-border)"
      interval={0}
      angle={long ? -38 : 0}
      textAnchor={long ? 'end' : 'middle'}
      height={long ? 62 : 26}
    />
  );
  const yAxis = (
    <YAxis
      tick={AXIS}
      stroke="var(--color-border)"
      width={52}
      tickFormatter={(v) => axisTick(v, spec.y)}
    />
  );
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />;
  const tip = (
    <Tooltip
      content={<ChartTooltip metric={spec.y} />}
      cursor={{ fill: 'var(--color-chart-cursor)' }}
    />
  );

  return (
    <figure className="my-4">
      {spec.title && (
        <figcaption className="mb-2 text-[0.85rem] font-semibold text-text-primary">
          {spec.title}
        </figcaption>
      )}
      <div className="rounded-xl border border-border bg-bg-card p-3">
        <ResponsiveContainer width="100%" height={spec.chart === 'pie' ? 300 : 280}>
          {spec.chart === 'bar' ? (
            <BarChart {...common}>
              {grid}
              {xAxis}
              {yAxis}
              {tip}
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={52}>
                {data.map((d, i) => (
                  <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : spec.chart === 'line' ? (
            <LineChart {...common}>
              {grid}
              {xAxis}
              {yAxis}
              {tip}
              <Line
                type="monotone"
                dataKey="value"
                stroke={PALETTE[1]}
                strokeWidth={2}
                dot={{ r: 3, fill: PALETTE[1] }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          ) : spec.chart === 'area' ? (
            <AreaChart {...common}>
              <defs>
                <linearGradient id={`fill-${spec.source}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE[1]} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={PALETTE[1]} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {grid}
              {xAxis}
              {yAxis}
              {tip}
              <Area
                type="monotone"
                dataKey="value"
                stroke={PALETTE[1]}
                strokeWidth={2}
                fill={`url(#fill-${spec.source})`}
              />
            </AreaChart>
          ) : (
            <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              {tip}
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="46%"
                outerRadius="72%"
                paddingAngle={1.5}
                stroke="var(--color-bg-card)"
                strokeWidth={2}
              >
                {data.map((d, i) => (
                  <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: 'var(--color-text-muted)' }}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
