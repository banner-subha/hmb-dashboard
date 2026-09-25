import { useCallback, useState } from 'react';
import { AlertTriangle, Receipt } from 'lucide-react';

import ErrorBoundary from '../components/common/ErrorBoundary';
import SkeletonLoader from '../components/common/SkeletonLoader';
import OutstandingKPIRow from '../components/outstanding/OutstandingKPIRow';
import AgingBreakdownPanel from '../components/outstanding/AgingBreakdownPanel';
import OutstandingFilterBar from '../components/outstanding/OutstandingFilterBar';
import DealerOutstandingTable from '../components/outstanding/DealerOutstandingTable';
import VoucherDrilldownModal from '../components/outstanding/VoucherDrilldownModal';

import { useOutstandingData } from '../hooks/useOutstandingData';
import { useDashboardTelemetry } from '../context/DashboardTelemetryContext';
import { downloadCsv, getExportFilename } from '../utils/csvExport';
import { ACCOUNT_CSV_COLUMNS, formatDate, formatINR } from '../utils/outstanding';

/**
 * Outstanding Receivables.
 *
 * Customer balances from the ERP outstanding ledger, a snapshot replaced each
 * time `outstanding.xlsx` is uploaded. The whole dealer book is loaded once and
 * every figure on the page (KPIs, aging, table) is totalled from the same
 * filtered rows, so they always agree with each other and, unfiltered, with
 * query_outstanding_summary to the paisa.
 *
 * Like the other tabs, no padding, max width or page animation of its own:
 * DashboardLayout supplies all three.
 */
export default function OutstandingIntelligence() {
  const ob = useOutstandingData();
  const [selected, setSelected] = useState(null);
  const closeDrawer = useCallback(() => setSelected(null), []);

  useDashboardTelemetry({
    tabName: 'Outstanding',
    filters: ob.filters,
    selectedEntity: selected?.dealer_name || null,
    visibleKpis: ob.loading ? null : {
      net_outstanding: formatINR(ob.summary.total),
      overdue: formatINR(ob.summary.overdue),
      not_yet_due: formatINR(ob.summary.current),
      unpaid_bills_before_credits: formatINR(ob.summary.bills),
      bills_over_90_days: formatINR(ob.summary.bills90),
      credits_not_set_off: formatINR(ob.summary.credit),
      dealers: ob.summary.dealerCount,
      ledger_as_on: ob.summary.asOn,
    },
  });

  const exportFiltered = () => downloadCsv(getExportFilename('outstanding_dealers', 'filtered'), ACCOUNT_CSV_COLUMNS, ob.rows);
  const exportAll = () => downloadCsv(getExportFilename('outstanding_dealers', 'raw_all'), ACCOUNT_CSV_COLUMNS, ob.book);

  if (ob.error) {
    return (
      <div className="animate-fade-in">
        <div className="glass-card p-10 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Outstanding could not load</h2>
          <p className="text-sm text-text-muted mb-6 max-w-lg mx-auto">{ob.error}</p>
          <button type="button" onClick={ob.reload} className="px-4 py-2 bg-accent-blue text-white rounded-xl text-sm font-bold hover:opacity-90 cursor-pointer">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const asOn = formatDate(ob.summary.asOn);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <Receipt className="w-7 h-7 text-accent-blue mt-1 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-3xl font-extrabold text-text-primary leading-tight">Outstanding</h2>
            <p className="text-sm text-text-muted mt-1">
              What each dealer owes us, how much is overdue, and the bills behind it.
            </p>
          </div>
        </div>
        {asOn && (
          <span className="px-3.5 py-2 rounded-xl bg-bg-card/60 border border-border/40 text-[13px] font-bold text-text-secondary whitespace-nowrap self-start md:self-auto">
            As of {asOn}
          </span>
        )}
      </div>

      <ErrorBoundary>
        {ob.loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <SkeletonLoader variant="kpi" count={5} />
          </div>
        ) : (
          <OutstandingKPIRow summary={ob.summary} />
        )}
      </ErrorBoundary>

      <ErrorBoundary>
        {ob.loading ? (
          <div className="skeleton h-[170px] rounded-2xl" aria-hidden="true" />
        ) : (
          <AgingBreakdownPanel
            summary={ob.summary}
            activeBucket={ob.filters.bucket}
            onSelectBucket={(key) => ob.setFilter('bucket', key)}
          />
        )}
      </ErrorBoundary>

      <section className="space-y-3" aria-labelledby="dealer-table-heading">
        <h3 id="dealer-table-heading" className="text-lg font-extrabold text-text-primary">Dealer-wise outstanding</h3>
        <OutstandingFilterBar
          filters={ob.filters}
          setFilter={ob.setFilter}
          onReset={ob.resetFilters}
          activeFilterCount={ob.activeFilterCount}
          stateOptions={ob.stateOptions}
          districtOptions={ob.districtOptions}
          onExportFiltered={exportFiltered}
          onExportAll={exportAll}
          filteredCount={ob.rows.length}
          totalCount={ob.book.length}
        />
        <ErrorBoundary>
          {ob.loading ? (
            <div className="rounded-xl border border-border overflow-hidden">
              <SkeletonLoader variant="table-row" count={8} />
            </div>
          ) : (
            <DealerOutstandingTable
              rows={ob.rows}
              sort={ob.sort}
              onSort={ob.setSort}
              onOpen={setSelected}
              onClearFilters={ob.resetFilters}
              hasFilters={ob.activeFilterCount > 0}
            />
          )}
        </ErrorBoundary>
      </section>

      <VoucherDrilldownModal key={selected?.key || 'none'} account={selected} onClose={closeDrawer} />
    </div>
  );
}
