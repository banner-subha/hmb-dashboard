import { memo } from 'react';

const PAGE_SIZES = [25, 50, 100];

const btn =
  'px-3 py-1.5 rounded-lg border border-border bg-bg-card text-[13px] font-semibold text-text-secondary hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

/** Row count, rows-per-page choice and previous/next for the dealer table. */
function TablePager({ page, pageCount, pageSize, total, onPage, onPageSize }) {
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 text-[13px] text-text-muted">
      <p>
        Showing <span className="font-bold text-text-primary tabular-nums">{from.toLocaleString('en-IN')}</span> to{' '}
        <span className="font-bold text-text-primary tabular-nums">{to.toLocaleString('en-IN')}</span> of{' '}
        <span className="font-bold text-text-primary tabular-nums">{total.toLocaleString('en-IN')}</span> dealers
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="ob-page-size" className="text-[13px]">Rows</label>
        <select
          id="ob-page-size"
          className="filter-select !py-1.5"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span className="tabular-nums px-1" aria-live="polite">
          Page <span className="font-bold text-text-primary">{page + 1}</span> of {pageCount}
        </span>
        <button type="button" className={btn} disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export default memo(TablePager);
