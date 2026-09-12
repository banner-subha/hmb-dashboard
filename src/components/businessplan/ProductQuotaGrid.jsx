import { memo, useMemo } from 'react';
import { m } from 'framer-motion';
import { staggerContainer, kpiCard } from '../../utils/motionVariants';
import { formatMT1, formatPct1, formatCount } from '../../utils/businessPlan';

/**
 * One product line's quota.
 *
 * The bar is the conversion rate — target as a share of potential — so the
 * five cards can be read against each other at a glance: a short bar on a
 * large potential is headroom, a long bar is a line already planned close to
 * its ceiling.
 */
function ProductCard({ product, shareOfTarget, highlighted }) {
  const conversion = product.targetPct;
  const barWidth = conversion === null ? 0 : Math.max(0, Math.min(100, conversion));

  return (
    <div
      className={`glass-card-hover relative p-4 sm:p-5 flex flex-col h-full overflow-hidden ${
        highlighted ? 'ring-1 ring-accent-blue/60' : ''
      }`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ backgroundColor: product.color }} />

      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-[15px] font-extrabold text-text-primary leading-tight">
            {product.label}
          </div>
          <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-0.5">
            {product.code}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold"
          style={{ backgroundColor: `${product.color}1f`, color: product.color }}
        >
          {formatPct1(shareOfTarget)} of quota
        </span>
      </div>

      <div className="mb-1">
        <div className="stat-label text-[11px] text-text-muted mb-1">SP Target</div>
        <div className="text-2xl sm:text-[1.7rem] font-black text-text-primary leading-none tracking-tight">
          {formatMT1(product.spTarget)}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-text-muted font-semibold">Market Potential</span>
          <span className="font-bold text-text-secondary">{formatMT1(product.potential)}</span>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3 text-[13px] mb-1.5">
            <span className="text-text-muted font-semibold">Conversion Rate</span>
            <span className="font-extrabold" style={{ color: product.color }}>
              {formatPct1(conversion)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-bg-secondary overflow-hidden">
            <span
              className="block h-full rounded-full transition-[width] duration-500"
              style={{ width: `${barWidth}%`, backgroundColor: product.color }}
            />
          </div>
        </div>

        <div className="text-[12px] text-text-muted font-semibold pt-0.5">
          {formatCount(product.customers)} accounts planned
        </div>
      </div>
    </div>
  );
}

/**
 * Product Mix Quota Grid — `query_business_plan` grouped by product.
 *
 * The share badge is the only derived number on the card, and it divides two
 * figures from this same response, so the five shares always add to 100%.
 */
function ProductQuotaGrid({ products, activeProduct }) {
  const totalTarget = useMemo(
    () => (products || []).reduce((sum, p) => sum + p.spTarget, 0),
    [products]
  );

  if (!products || products.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-text-muted text-sm">
        No product quotas were planned for this selection.
      </div>
    );
  }

  return (
    <m.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
    >
      {products.map((p) => (
        <m.div key={p.code} variants={kpiCard}>
          <ProductCard
            product={p}
            shareOfTarget={totalTarget > 0 ? (p.spTarget / totalTarget) * 100 : null}
            highlighted={activeProduct === p.code}
          />
        </m.div>
      ))}
    </m.div>
  );
}

export default memo(ProductQuotaGrid);
