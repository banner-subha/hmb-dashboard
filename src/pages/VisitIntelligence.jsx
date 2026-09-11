import { useState, useMemo } from 'react';
import { Briefcase, AlertTriangle, RotateCcw } from 'lucide-react';

import SearchInput from '../components/common/SearchInput';
import SkeletonLoader from '../components/common/SkeletonLoader';
import ErrorBoundary from '../components/common/ErrorBoundary';

import VisitKPIRow from '../components/visits/VisitKPIRow';
import VisitAlignmentCards from '../components/visits/VisitAlignmentCards';
import DealerVisitTable from '../components/visits/DealerVisitTable';
import DistrictDemandTable from '../components/visits/DistrictDemandTable';
import RepPerformanceTable from '../components/visits/RepPerformanceTable';
import VisitTrendsPanel from '../components/visits/VisitTrendsPanel';
import DealerScorecardModal from '../components/visits/DealerScorecardModal';

import { useVisitData } from '../hooks/useVisitData';
import { VISIT_SECTIONS } from '../utils/visits';

/**
 * Field Visits & Tracker.
 *
 * Two things this page deliberately does NOT do any more.
 *
 * It does not wrap itself in AnimatedPage. DashboardLayout already animates
 * whatever the router puts in the outlet, and this was the only page that
 * added a second motion wrapper inside that one. Nested inside the layout's
 * old `AnimatePresence mode="wait"`, that extra wrapper is what made the tab
 * blank out: the outgoing page stayed mounted at opacity 0 waiting for an
 * exit-complete that never arrived, so the new page never mounted until an
 * unrelated click forced a re-render.
 *
 * It does not set its own padding or max-width. The layout supplies
 * `p-4 sm:p-5` and `max-w-[1680px] mx-auto`; adding `p-8 max-w-7xl` on top
 * made this the one tab that sat narrower and further from the edges than
 * every other tab. The root is now `animate-fade-in space-y-6`, the same as
 * Dealer Network and State Overview.
 */
export default function VisitIntelligence() {
  const [section, setSection] = useState('dealers');
  const [state, setState] = useState('ALL');
  const [quadrant, setQuadrant] = useState('ALL');
  const [query, setQuery] = useState('');
  const [selectedDealer, setSelectedDealer] = useState(null);

  const {
    data, loading, error,
    dealers, districts, reps,
    summary, stateOptions, salesLink, counts,
  } = useVisitData({ state, quadrant, query });

  /**
   * The group cards filter the dealer table, so picking one moves you there.
   * Clicking "Needs Attention" while the District view was open used to look
   * like a dead control: the card lit up and nothing on screen changed,
   * because a group is a dealer-level classification and the district table
   * deliberately ignores it.
   */
  const selectQuadrant = key => {
    setQuadrant(key);
    if (key !== 'ALL') setSection('dealers');
  };

  const active = useMemo(
    () => VISIT_SECTIONS.find(s => s.key === section) || VISIT_SECTIONS[0],
    [section]
  );

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6">
        <SkeletonLoader variant="card" count={1} className="h-16" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <SkeletonLoader variant="kpi" count={5} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <SkeletonLoader variant="kpi" count={5} />
        </div>
        <div className="glass-card overflow-hidden">
          <SkeletonLoader variant="table-row" count={8} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="animate-fade-in">
        <div className="glass-card p-10 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Field Visit Data Unavailable</h2>
          <p className="text-sm text-text-muted mb-6">{error || 'The visits dataset could not be loaded.'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-accent-blue text-white rounded-xl text-sm font-bold hover:opacity-90 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const rowsFor = { dealers, districts, reps };
  const visibleCount = rowsFor[section]?.length ?? 0;
  const filtersOn = state !== 'ALL' || quadrant !== 'ALL' || query !== '';

  return (
    <div className="animate-fade-in space-y-6">

      {/* Page title — same block every other tab uses */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
        <div className="flex items-start gap-3">
          <Briefcase className="w-7 h-7 text-accent-blue mt-1 shrink-0" />
          <div>
            <h2 className="text-3xl font-extrabold text-text-primary leading-tight">
              Field Visits &amp; Tracker
            </h2>
            <p className="text-sm text-text-muted mt-1">
              Dealer and fabricator visits this month, matched against sales results.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="filter-select text-sm py-2 px-3 w-full sm:w-[165px]"
            value={state}
            onChange={e => setState(e.target.value)}
            aria-label="Filter by state"
          >
            {stateOptions.map(st => (
              <option key={st} value={st}>{st === 'ALL' ? 'All States' : st}</option>
            ))}
          </select>

          <span className="px-3.5 py-2 rounded-xl bg-bg-card/60 border border-border/40 text-[13px] font-bold text-text-secondary whitespace-nowrap">
            {data.meta?.curPeriod || 'This Month'}
            {data.meta?.elapsedDays ? ` · ${data.meta.elapsedDays} Days So Far` : ''}
          </span>

          {filtersOn && (
            <button
              type="button"
              onClick={() => { setState('ALL'); setQuadrant('ALL'); setQuery(''); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Clear Filters
            </button>
          )}
        </div>
      </div>

      <ErrorBoundary>
        <VisitKPIRow summary={summary} meta={data.meta} />
      </ErrorBoundary>

      <ErrorBoundary>
        <VisitAlignmentCards
          summary={summary}
          selected={quadrant}
          onSelect={selectQuadrant}
          salesLink={salesLink}
        />
      </ErrorBoundary>

      {/* One card holds the view switcher, the search box and the active view,
          the way Dealer Network holds its controls and table together. */}
      <div className="glass-card p-4 sm:p-5 lg:p-6 space-y-5">

        <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between pb-5 border-b border-border/40">
          {/*
            The view switcher. Built here rather than on the shared
            .toggle-pill-* classes because those hard-force a pill radius and a
            small font through !important, and this control needs to read as
            the primary navigation of the page, not as a minor filter.
          */}
          <div
            role="tablist"
            aria-label="Field visit views"
            className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-bg-secondary/70 border border-border/50 flex-wrap"
          >
            {VISIT_SECTIONS.map(s => {
              const count = s.countKey ? counts[s.countKey] : null;
              const isActive = section === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSection(s.key)}
                  className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[14px] font-bold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-accent-blue text-white shadow-md'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                  }`}
                >
                  {s.label}
                  {count != null && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11.5px] font-bold tabular-nums ${
                        isActive ? 'bg-white/25 text-white' : 'bg-bg-card text-text-muted'
                      }`}
                    >
                      {count.toLocaleString('en-IN')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {active.searchHint && (
            <div className="w-full xl:w-[22rem]">
              <SearchInput
                size="lg"
                value={query}
                onChange={setQuery}
                placeholder={active.searchHint}
              />
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-xl font-extrabold text-text-primary leading-tight">{active.title}</h3>
            {active.countKey && (
              <span className="text-[13px] font-bold text-text-muted whitespace-nowrap">
                Showing {visibleCount.toLocaleString('en-IN')} of{' '}
                {(counts[active.countKey] ?? 0).toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <p className="text-[13.5px] text-text-muted mt-1.5 max-w-3xl leading-relaxed">{active.blurb}</p>
        </div>

        <ErrorBoundary>
          {section === 'dealers' && (
            <DealerVisitTable rows={dealers} onRowClick={setSelectedDealer} />
          )}
          {section === 'districts' && <DistrictDemandTable rows={districts} />}
          {section === 'reps' && <RepPerformanceTable rows={reps} />}
          {section === 'trends' && (
            <VisitTrendsPanel
              timeAnalytics={data.timeAnalytics}
              monthlyTrend={data.monthlyTrend}
              elapsedDays={data.meta?.elapsedDays}
            />
          )}
        </ErrorBoundary>

        {active.countKey && visibleCount === 0 && (
          <p className="text-center text-sm text-text-muted py-8">
            No rows match the current filters. Clear them to see everything again.
          </p>
        )}
      </div>

      <DealerScorecardModal
        dealer={selectedDealer}
        onClose={() => setSelectedDealer(null)}
      />
    </div>
  );
}
