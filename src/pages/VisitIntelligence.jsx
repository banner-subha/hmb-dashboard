import { useState } from 'react';
import { Briefcase, MapPin, AlertTriangle, Info } from 'lucide-react';

import AnimatedPage from '../components/common/AnimatedPage';
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
import { formatPct } from '../utils/formatters';

const SEARCH_PLACEHOLDERS = {
  dealers: 'Search dealer, district, executive...',
  districts: 'Search district or state...',
  reps: 'Search sales executive...',
  trends: 'Search is not used on this view',
};

/**
 * Field Visits & Sales Performance.
 *
 * This page was a 955-line single component that shared nothing with the rest
 * of the dashboard: it reimplemented KPI tiles, tables, formatting and trend
 * logic, and the knowledge graph showed it with zero edges to formatMT,
 * calculateMoM, getSeverityTheme, MoMIndicator, SkeletonLoader or DataTable
 * while every other page used all of them. It now orchestrates; the views,
 * the derivations and the domain vocabulary live in their own modules.
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

  if (loading) {
    return (
      <AnimatedPage>
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
          <SkeletonLoader variant="card" count={1} className="h-16" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <SkeletonLoader variant="kpi" count={5} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <SkeletonLoader variant="kpi" count={5} />
          </div>
          <div className="bg-bg-card rounded-2xl border border-border/40 overflow-hidden">
            <SkeletonLoader variant="table-row" count={8} />
          </div>
        </div>
      </AnimatedPage>
    );
  }

  if (error || !data) {
    return (
      <AnimatedPage>
        <div className="p-6 max-w-7xl mx-auto text-center py-20">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Field Visit Data Unavailable</h2>
          <p className="text-sm text-text-muted mb-6">{error || 'Could not load the visits dataset.'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/90"
          >
            Retry Connection
          </button>
        </div>
      </AnimatedPage>
    );
  }

  const rowsFor = { dealers, districts, reps };

  return (
    <AnimatedPage>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shadow-xs">
                <Briefcase className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-primary">
                Field Visits &amp; Sales Performance
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent/15 text-accent border border-accent/25">
                Current Month MTD
              </span>
            </div>
            <p className="text-xs sm:text-sm text-text-muted">
              Connecting customer field touchpoints with sales target achievement across dealers and districts.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-bg-card px-3 py-1.5 rounded-xl border border-border/50 text-xs font-medium text-text-secondary">
              <MapPin className="w-3.5 h-3.5 text-accent" />
              <select
                value={state}
                onChange={e => setState(e.target.value)}
                aria-label="Filter by state"
                className="bg-transparent border-none outline-none font-semibold text-text-primary cursor-pointer"
              >
                {stateOptions.map(st => (
                  <option key={st} value={st} className="bg-bg-secondary text-text-primary">
                    {st === 'ALL' ? 'All States' : st}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[11px] font-semibold text-text-muted px-2.5 py-1.5 rounded-xl bg-bg-card/60 border border-border/30">
              Period: {data.meta?.curPeriod || 'Active Month'}
            </div>
          </div>
        </div>

        <ErrorBoundary>
          <VisitKPIRow summary={summary} meta={data.meta} />
        </ErrorBoundary>

        {/*
          States plainly how much of this page rests on a sales link. Every
          quadrant except "No Sales Record Yet", and every target status, is
          meaningless without one — and only about a third of dealers have one.
        */}
        {salesLink && (
          <div className="flex items-start gap-2 text-[11.5px] text-text-muted bg-bg-card/60 border border-border/30 rounded-xl px-3 py-2.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
            <span>
              {salesLink.matched.toLocaleString('en-IN')} of{' '}
              {(salesLink.matched + salesLink.unmatched).toLocaleString('en-IN')} dealers
              ({formatPct(salesLink.matchPct)}) are linked to a sales account. Target
              status and visit-versus-sales categories apply only to those; the rest
              are visited prospects with no sales record to compare against.
            </span>
          </div>
        )}

        <ErrorBoundary>
          <VisitAlignmentCards
            summary={summary}
            selected={quadrant}
            onSelect={setQuadrant}
          />
        </ErrorBoundary>

        {/* Section tabs + search */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div className="flex gap-2 flex-wrap">
            {VISIT_SECTIONS.map(s => {
              const count = s.countKey ? counts[s.countKey] : null;
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSection(s.key)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors border ${
                    active
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-card text-text-secondary border-border/50 hover:bg-bg-card-hover'
                  }`}
                >
                  {s.label}
                  {count != null && (
                    <span className={active ? 'opacity-80' : 'text-text-muted'}> ({count.toLocaleString('en-IN')})</span>
                  )}
                </button>
              );
            })}
          </div>

          {section !== 'trends' && (
            <div className="w-full lg:w-80">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={SEARCH_PLACEHOLDERS[section]}
              />
            </div>
          )}
        </div>

        {/* Views */}
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

        {section !== 'trends' && rowsFor[section]?.length === 0 && (
          <p className="text-center text-sm text-text-muted py-10">
            No rows match the current filters.
          </p>
        )}

        <DealerScorecardModal
          dealer={selectedDealer}
          onClose={() => setSelectedDealer(null)}
        />
      </div>
    </AnimatedPage>
  );
}
