import { memo } from 'react';
import { m } from 'framer-motion';
import KPICard from '../common/KPICard';
import { staggerContainer, kpiCard } from '../../utils/motionVariants';
import { formatINR } from '../../utils/outstanding';

const pctOf = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');
const count = (n) => n.toLocaleString('en-IN');

/**
 * Five headline figures on the shared KPICard, laid out like the Business Plan
 * row: one row from xl, each tile its own card. The first three are net and add
 * up to the balance; the last two are the before-credit sides of that net.
 *
 * No rupee sign in the figure: KPICard only splits a
 * figure that starts with a digit into number and unit, and only that form
 * scales to fit (fitValue). --kpi-fit is the widest figure ("443.30 Cr") in
 * ems, so every figure in the row lands at one size.
 */
function OutstandingKPIRow({ summary: s }) {
  const cards = [
    { label: 'Total Outstanding', value: s.total, subtitle: `${count(s.dealerCount)} dealers, ${count(s.voucherCount)} open entries`, accent: '#3b82f6' },
    { label: 'Overdue', value: s.overdue, subtitle: `${pctOf(s.overdue, s.total)} of outstanding is past due date`, accent: '#ef4444' },
    { label: 'Not Yet Due', value: s.current, subtitle: `${pctOf(s.current, s.total)} of outstanding is within credit period`, accent: '#22c55e' },
    { label: 'Total Bills Due', value: s.bills, subtitle: `${formatINR(s.bills90)} of it is over 90 days overdue`, accent: '#f97316' },
    { label: 'Credits Pending', value: Math.abs(s.credit), subtitle: `${count(s.creditCount)} payments and credit notes to adjust against bills`, accent: '#94a3b8' },
  ];

  return (
    <m.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 [--kpi-fit:5]"
    >
      {cards.map((c) => (
        <m.div key={c.label} variants={kpiCard}>
          <KPICard fitValue label={c.label} value={formatINR(c.value, false)} subtitle={c.subtitle} accentColor={c.accent} />
        </m.div>
      ))}
    </m.div>
  );
}

export default memo(OutstandingKPIRow);
