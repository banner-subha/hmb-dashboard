import React, { useState, useEffect, useMemo, memo } from 'react';
import { getVisitData } from '../services/dataService';
import { VISIT_QUADRANTS } from '../utils/constants';
import AnimatedPage from '../components/common/AnimatedPage';
import SearchInput from '../components/common/SearchInput';
import {
  Briefcase,
  Users,
  Target,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Layers,
  MapPin,
  ChevronRight,
  Activity,
  X,
  Compass,
  Check
} from 'lucide-react';

export default function VisitIntelligence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [activeSection, setActiveSection] = useState('dealers'); // 'dealers' | 'districts' | 'reps' | 'trends'
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedQuadrant, setSelectedQuadrant] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDealer, setSelectedDealer] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await getVisitData();
        if (mounted) {
          if (res) {
            setData(res);
          } else {
            setError('Unable to load field visit dataset.');
          }
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Error loading field visit data');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // Derived state list for filters
  const stateOptions = useMemo(() => {
    if (!data?.dealers) return [];
    const set = new Set(data.dealers.map(d => d.state).filter(s => s && s !== 'Unknown'));
    return ['ALL', ...Array.from(set).sort()];
  }, [data]);

  // Filtered dealers
  const filteredDealers = useMemo(() => {
    if (!data?.dealers) return [];
    return data.dealers.filter(d => {
      if (selectedState !== 'ALL' && d.state !== selectedState) return false;
      if (selectedQuadrant !== 'ALL' && d.quadrant !== selectedQuadrant) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = d.dealer.toLowerCase().includes(q);
        const matchDist = (d.district || '').toLowerCase().includes(q);
        const matchRep = (d.primaryRep || '').toLowerCase().includes(q);
        if (!matchName && !matchDist && !matchRep) return false;
      }
      return true;
    });
  }, [data, selectedState, selectedQuadrant, searchQuery]);

  // Filtered districts
  const filteredDistricts = useMemo(() => {
    if (!data?.districts) return [];
    return data.districts.filter(d => {
      if (selectedState !== 'ALL' && d.state !== selectedState) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchDist = (d.district || '').toLowerCase().includes(q);
        const matchState = (d.state || '').toLowerCase().includes(q);
        if (!matchDist && !matchState) return false;
      }
      return true;
    });
  }, [data, selectedState, searchQuery]);

  // Filtered reps
  const filteredReps = useMemo(() => {
    if (!data?.employees) return [];
    return data.employees.filter(r => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return r.employee_name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, searchQuery]);

  // Computed summary based on selected state
  const stateSummary = useMemo(() => {
    if (!data) return null;
    if (selectedState === 'ALL') return data.summary;

    const stateDealers = data.dealers.filter(d => d.state === selectedState);
    const stateDistricts = data.districts.filter(d => d.state === selectedState);
    
    const curDealerV = stateDealers.reduce((sum, d) => sum + (d.curVisits || 0), 0);
    const activeVisited = stateDealers.filter(d => d.curVisits > 0).length;
    const totalTracked = stateDealers.length;
    const curFabV = stateDistricts.reduce((sum, d) => sum + (d.curFabricatorVisits || 0), 0);

    const qCounts = { GROWTH_DRIVER: 0, RED_FLAG: 0, NEGLECTED: 0, ORGANIC: 0 };
    stateDealers.forEach(d => {
      if (qCounts[d.quadrant] !== undefined) qCounts[d.quadrant]++;
    });

    return {
      curTotalVisits: curDealerV + curFabV,
      curDealerVisits: curDealerV,
      curFabricatorVisits: curFabV,
      activeDealersVisited: activeVisited,
      totalDealersTracked: totalTracked,
      dealerCoveragePct: totalTracked > 0 ? Math.round((activeVisited / totalTracked) * 1000) / 10 : 0,
      avgVisitDurationMins: data.summary?.avgVisitDurationMins || 0,
      activeFieldReps: data.summary?.activeFieldReps || 0,
      growthDriversCount: qCounts.GROWTH_DRIVER,
      redFlagsCount: qCounts.RED_FLAG,
      neglectedCount: qCounts.NEGLECTED,
      organicChampionsCount: qCounts.ORGANIC
    };
  }, [data, selectedState]);

  if (loading) {
    return (
      <AnimatedPage>
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-pulse">
          <div className="h-10 bg-bg-card rounded-xl w-1/3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 bg-bg-card rounded-2xl border border-border/40" />
            ))}
          </div>
          <div className="h-80 bg-bg-card rounded-2xl border border-border/40" />
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
          <p className="text-sm text-text-muted mb-6">{error || 'Could not load visits dataset.'}</p>
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

  return (
    <AnimatedPage>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        
        {/* ── Executive Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shadow-xs">
                <Briefcase className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-primary">
                Field Visits & Sales Performance
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent/15 text-accent border border-accent/25">
                Current Month MTD
              </span>
            </div>
            <p className="text-xs sm:text-sm text-text-muted">
              Connecting customer field touchpoints with sales target achievement across dealers and districts.
            </p>
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-bg-card px-3 py-1.5 rounded-xl border border-border/50 text-xs font-medium text-text-secondary">
              <MapPin className="w-3.5 h-3.5 text-accent" />
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
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

        {/* ── Executive Metric Ribbon ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
          
          <div className="glass-card-hover p-4 rounded-2xl relative overflow-hidden border-l-4 border-l-blue-500">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1 flex items-center justify-between">
              <span>Total Visits Completed</span>
              <Activity className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-text-primary">
              {(stateSummary?.curTotalVisits || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-text-muted mt-1">
              {stateSummary?.curDealerVisits} dealer · {stateSummary?.curFabricatorVisits} fabricator visits
            </div>
          </div>

          <div className="glass-card-hover p-4 rounded-2xl relative overflow-hidden border-l-4 border-l-emerald-500">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1 flex items-center justify-between">
              <span>Dealers Visited</span>
              <Target className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-text-primary">
              {stateSummary?.dealerCoveragePct}%
            </div>
            <div className="text-[11px] text-emerald-400 font-semibold mt-1">
              {stateSummary?.activeDealersVisited} of {stateSummary?.totalDealersTracked} network dealers reached
            </div>
          </div>

          <div className="glass-card-hover p-4 rounded-2xl relative overflow-hidden border-l-4 border-l-purple-500">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1 flex items-center justify-between">
              <span>Fabricator Field Visits</span>
              <Users className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-text-primary">
              {(stateSummary?.curFabricatorVisits || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-text-muted mt-1">
              Local workshop & builder visits
            </div>
          </div>

          <div className="glass-card-hover p-4 rounded-2xl relative overflow-hidden border-l-4 border-l-amber-500">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1 flex items-center justify-between">
              <span>Average Time on Site</span>
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-text-primary">
              {stateSummary?.avgVisitDurationMins} <span className="text-sm font-bold text-text-muted">mins</span>
            </div>
            <div className="text-[11px] text-text-muted mt-1">
              Average meeting duration
            </div>
          </div>

          <div className="glass-card-hover p-4 rounded-2xl relative overflow-hidden border-l-4 border-l-cyan-500 col-span-2 lg:col-span-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1 flex items-center justify-between">
              <span>Active Sales Executives</span>
              <Compass className="w-3.5 h-3.5 text-cyan-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-text-primary">
              {stateSummary?.activeFieldReps}
            </div>
            <div className="text-[11px] text-cyan-400 font-semibold mt-1">
              Field force deployed
            </div>
          </div>

        </div>

        {/* ── Strategic Quadrant Ribbon: Dealer Sales & Visit Alignment ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
              <span>Dealer Sales & Field Visit Alignment</span>
            </h2>
            {selectedQuadrant !== 'ALL' && (
              <button
                onClick={() => setSelectedQuadrant('ALL')}
                className="text-xs text-accent hover:underline flex items-center gap-1 font-semibold"
              >
                Clear Category Filter <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            
            {/* Category 1: High Growth Accounts */}
            <div
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'GROWTH_DRIVER' ? 'ALL' : 'GROWTH_DRIVER')}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border relative overflow-hidden ${
                selectedQuadrant === 'GROWTH_DRIVER'
                  ? 'bg-emerald-500/15 border-emerald-500 shadow-md ring-1 ring-emerald-500'
                  : 'bg-bg-card hover:bg-bg-card-hover border-emerald-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> High Growth Accounts
                </span>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  Visits ↑ · Ahead of Target
                </span>
              </div>
              <div className="text-3xl font-black text-text-primary mb-1">
                {stateSummary?.growthDriversCount || 0} <span className="text-xs font-semibold text-text-muted">dealers</span>
              </div>
              <p className="text-[11.5px] text-text-muted leading-snug">
                Dealers where regular field visits directly helped beat sales targets. High return on sales team time.
              </p>
            </div>

            {/* Category 2: High Attention, Behind Target */}
            <div
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'RED_FLAG' ? 'ALL' : 'RED_FLAG')}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border relative overflow-hidden ${
                selectedQuadrant === 'RED_FLAG'
                  ? 'bg-rose-500/15 border-rose-500 shadow-md ring-1 ring-rose-500'
                  : 'bg-bg-card hover:bg-bg-card-hover border-rose-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> High Attention, Behind Target
                </span>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                  Visits ↑ · Behind Target
                </span>
              </div>
              <div className="text-3xl font-black text-text-primary mb-1">
                {stateSummary?.redFlagsCount || 0} <span className="text-xs font-semibold text-text-muted">dealers</span>
              </div>
              <p className="text-[11.5px] text-text-muted leading-snug">
                Frequent visits but sales are lagging. Requires review of pricing, credit limits, or dealer relationship.
              </p>
            </div>

            {/* Category 3: Under-Visited Accounts */}
            <div
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'NEGLECTED' ? 'ALL' : 'NEGLECTED')}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border relative overflow-hidden ${
                selectedQuadrant === 'NEGLECTED'
                  ? 'bg-amber-500/15 border-amber-500 shadow-md ring-1 ring-amber-500'
                  : 'bg-bg-card hover:bg-bg-card-hover border-amber-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4" /> Under-Visited Accounts
                </span>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                  Visits ↓ · Behind Target
                </span>
              </div>
              <div className="text-3xl font-black text-text-primary mb-1">
                {stateSummary?.neglectedCount || 0} <span className="text-xs font-semibold text-text-muted">dealers</span>
              </div>
              <p className="text-[11.5px] text-text-muted leading-snug">
                Sales dropped due to low sales rep contact. Immediate visit required to prevent account loss.
              </p>
            </div>

            {/* Category 4: Steady Growth Accounts */}
            <div
              onClick={() => setSelectedQuadrant(selectedQuadrant === 'ORGANIC' ? 'ALL' : 'ORGANIC')}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border relative overflow-hidden ${
                selectedQuadrant === 'ORGANIC'
                  ? 'bg-blue-500/15 border-blue-500 shadow-md ring-1 ring-blue-500'
                  : 'bg-bg-card hover:bg-bg-card-hover border-blue-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" /> Steady Growth Accounts
                </span>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                  Visits ↓ · Ahead of Target
                </span>
              </div>
              <div className="text-3xl font-black text-text-primary mb-1">
                {stateSummary?.organicChampionsCount || 0} <span className="text-xs font-semibold text-text-muted">dealers</span>
              </div>
              <p className="text-[11.5px] text-text-muted leading-snug">
                Accounts meeting or beating sales targets with minimal visit requirements.
              </p>
            </div>

          </div>
        </div>

        {/* ── Business Section Navigation Tabs ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-1.5 p-1 bg-bg-card rounded-xl border border-border/50 max-w-fit">
            <button
              onClick={() => setActiveSection('dealers')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSection === 'dealers'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Dealer Performance ({filteredDealers.length})
            </button>
            <button
              onClick={() => setActiveSection('districts')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSection === 'districts'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              District Demand & Fabricators ({filteredDistricts.length})
            </button>
            <button
              onClick={() => setActiveSection('reps')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSection === 'reps'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Sales Team Performance ({filteredReps.length})
            </button>
            <button
              onClick={() => setActiveSection('trends')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSection === 'trends'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Visit Times & Monthly Trends
            </button>
          </div>

          <div className="w-full sm:w-72">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={
                activeSection === 'dealers' ? 'Search dealer, district, executive...' :
                activeSection === 'districts' ? 'Search district or state...' :
                'Search sales executive...'
              }
            />
          </div>
        </div>

        {/* ── VIEW 1: DEALER PERFORMANCE TABLE ── */}
        {activeSection === 'dealers' && (
          <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-bg-secondary/60 text-text-muted uppercase tracking-wider text-[10px] font-bold">
                    <th className="py-3 px-4">Dealer Name</th>
                    <th className="py-3 px-3">District & State</th>
                    <th className="py-3 px-3">Sales & Visit Category</th>
                    <th className="py-3 px-3 text-right">Visits This Month</th>
                    <th className="py-3 px-3 text-right">Past 6-Mo Monthly Avg</th>
                    <th className="py-3 px-3 text-right">Change vs Avg</th>
                    <th className="py-3 px-3 text-center">Target Status</th>
                    <th className="py-3 px-3 text-right">Current Sales Rate</th>
                    <th className="py-3 px-3 text-right">Avg Visit Length</th>
                    <th className="py-3 px-4">Assigned Sales Executive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filteredDealers.slice(0, 50).map((dl, idx) => {
                    const qCfg = VISIT_QUADRANTS[dl.quadrant] || VISIT_QUADRANTS.ORGANIC;
                    const isAhead = dl.paceStatus === 'AHEAD';
                    const isGrowth = dl.visitGrowthStatus === 'GROWTH';

                    return (
                      <tr
                        key={idx}
                        onClick={() => setSelectedDealer(dl)}
                        className="hover:bg-bg-card-hover transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4 font-bold text-text-primary group-hover:text-accent flex items-center gap-1.5">
                          <span>{dl.dealer}</span>
                          <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-accent transition-opacity" />
                        </td>
                        <td className="py-3 px-3 text-text-secondary whitespace-nowrap">
                          {dl.district ? `${dl.district}, ${dl.state}` : dl.state}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold"
                            style={{ backgroundColor: qCfg.bgColor, color: qCfg.color, border: `1px solid ${qCfg.borderColor}` }}
                          >
                            {qCfg.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-text-primary">
                          {dl.curVisits}
                        </td>
                        <td className="py-3 px-3 text-right text-text-muted">
                          {dl.histAvgVisits}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <span className={`inline-flex items-center gap-0.5 font-bold ${isGrowth ? 'text-emerald-400' : 'text-text-muted'}`}>
                            {isGrowth ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                            {dl.visitGrowth > 0 ? `+${dl.visitGrowth}` : dl.visitGrowth}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            isAhead ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}>
                            {isAhead ? 'Ahead of Target' : 'Behind Target'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-text-primary whitespace-nowrap">
                          {dl.currentDailyRate ? `${dl.currentDailyRate} MT/day` : '0 MT'}
                        </td>
                        <td className="py-3 px-3 text-right text-text-muted whitespace-nowrap">
                          {dl.avgDurationMins ? `${dl.avgDurationMins} min` : '-'}
                        </td>
                        <td className="py-3 px-4 text-text-secondary whitespace-nowrap">
                          {dl.primaryRep}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredDealers.length > 50 && (
              <div className="p-3 text-center text-xs font-semibold text-text-muted bg-bg-secondary/40 border-t border-border/30">
                Showing top 50 of {filteredDealers.length} matching dealers. Search above to find any specific account.
              </div>
            )}
          </div>
        )}

        {/* ── VIEW 2: DISTRICT DEMAND & FABRICATORS ── */}
        {activeSection === 'districts' && (
          <div className="space-y-6">
            <div className="glass-card p-4 rounded-xl border border-border/40 text-xs text-text-muted leading-relaxed flex items-center gap-3">
              <Compass className="w-5 h-5 text-accent shrink-0" />
              <span>
                <strong>Fabricators are key local influencers:</strong> While fabricators buy steel through local dealers, our sales team visits them to create grassroots demand for HMB Ispat bars and grills. Below shows fabricator visits by district compared to that district's sales pace.
              </span>
            </div>

            <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/40 bg-bg-secondary/60 text-text-muted uppercase tracking-wider text-[10px] font-bold">
                      <th className="py-3 px-4">District</th>
                      <th className="py-3 px-3">State</th>
                      <th className="py-3 px-3 text-right">Fabricator Visits This Month</th>
                      <th className="py-3 px-3 text-right">Distinct Fabricators Visited</th>
                      <th className="py-3 px-3 text-right">Past 6-Mo Monthly Avg</th>
                      <th className="py-3 px-3 text-right">Visit Intensity</th>
                      <th className="py-3 px-3 text-center">District Sales Target Status</th>
                      <th className="py-3 px-4">Market Demand Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {filteredDistricts.slice(0, 50).map((dt, idx) => {
                      const isAccel = dt.fabricatorTrend === 'ACCELERATING';
                      const isAhead = dt.districtPaceStatus === 'AHEAD';

                      let insight = '';
                      let insightColor = 'text-text-muted';
                      if (isAccel && isAhead) {
                        insight = 'Strong fabricator engagement driving healthy dealer sales';
                        insightColor = 'text-emerald-400 font-bold';
                      } else if (isAccel && !isAhead) {
                        insight = 'Active fabricator visits, but dealer sales conversion lagging';
                        insightColor = 'text-amber-400';
                      } else if (!isAccel && !isAhead) {
                        insight = 'Low fabricator visits corresponding with slower dealer sales';
                        insightColor = 'text-rose-400';
                      } else {
                        insight = 'Steady dealer sales with baseline fabricator touchpoints';
                        insightColor = 'text-blue-400';
                      }

                      return (
                        <tr key={idx} className="hover:bg-bg-card-hover transition-colors">
                          <td className="py-3 px-4 font-black text-text-primary">
                            {dt.district}
                          </td>
                          <td className="py-3 px-3 text-text-secondary whitespace-nowrap">
                            {dt.state}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-text-primary">
                            {dt.curFabricatorVisits}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-purple-400">
                            {dt.curUniqueFabricators}
                          </td>
                          <td className="py-3 px-3 text-right text-text-muted">
                            {dt.histAvgFabricatorVisits}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <span className={`inline-flex items-center gap-0.5 font-bold ${isAccel ? 'text-emerald-400' : 'text-text-muted'}`}>
                              {isAccel ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                              {dt.fabricatorGrowth > 0 ? `+${dt.fabricatorGrowth}` : dt.fabricatorGrowth}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              isAhead ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}>
                              {isAhead ? 'Ahead of Target' : 'Behind Target'}
                            </span>
                          </td>
                          <td className={`py-3 px-4 text-xs whitespace-nowrap ${insightColor}`}>
                            {insight}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── VIEW 3: SALES TEAM PERFORMANCE ── */}
        {activeSection === 'reps' && (
          <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-bg-secondary/60 text-text-muted uppercase tracking-wider text-[10px] font-bold">
                    <th className="py-3 px-4">Sales Executive</th>
                    <th className="py-3 px-3 text-right">Visits This Month</th>
                    <th className="py-3 px-3 text-right">Total Historical Visits</th>
                    <th className="py-3 px-3 text-right">Working Days on Field</th>
                    <th className="py-3 px-3 text-right">Visits per Day</th>
                    <th className="py-3 px-3 text-right">Dealers Visited</th>
                    <th className="py-3 px-3 text-right">Fabricators Visited</th>
                    <th className="py-3 px-3 text-right">Avg Visit Length</th>
                    <th className="py-3 px-4 text-center">Visit Timing (Morning / Afternoon)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filteredReps.slice(0, 50).map((rep, idx) => (
                    <tr key={idx} className="hover:bg-bg-card-hover transition-colors">
                      <td className="py-3 px-4 font-bold text-text-primary">
                        {rep.employee_name}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-accent">
                        {rep.curVisits}
                      </td>
                      <td className="py-3 px-3 text-right text-text-secondary">
                        {rep.totalVisits.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-text-muted">
                        {rep.activeDays} days
                      </td>
                      <td className="py-3 px-3 text-right font-black text-text-primary">
                        {rep.dailyVisitRate} <span className="text-[10px] font-normal text-text-muted">visits/day</span>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-blue-400">
                        {rep.dealerVisits}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-purple-400">
                        {rep.fabricatorVisits}
                      </td>
                      <td className="py-3 px-3 text-right text-text-muted whitespace-nowrap">
                        {rep.avgDurationMins} min
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="w-24 h-2 bg-bg-secondary rounded-full overflow-hidden flex">
                            <div className="bg-amber-500 h-full" style={{ width: `${rep.middayPct}%` }} title={`Morning/Midday: ${rep.middayPct}%`} />
                            <div className="bg-blue-500 h-full" style={{ width: `${rep.afternoonPct}%` }} title={`Afternoon: ${rep.afternoonPct}%`} />
                          </div>
                          <span className="text-[10px] text-text-muted whitespace-nowrap">
                            {rep.middayPct}% / {rep.afternoonPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── VIEW 4: VISIT TIMES & MONTHLY TRENDS ── */}
        {activeSection === 'trends' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Hourly Distribution Card */}
            <div className="glass-card p-5 rounded-2xl border border-border/50 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" /> When Do Visits Happen During the Day?
              </h3>
              <p className="text-xs text-text-muted">
                Analysis of customer check-in times across the sales team. Peak hours concentrate between 11:00 AM and 4:00 PM.
              </p>
              <div className="space-y-2 pt-2">
                {Object.entries(data.timeAnalytics?.hourlyDistribution || {}).map(([hour, count]) => {
                  const maxCount = Math.max(...Object.values(data.timeAnalytics?.hourlyDistribution || { 1: 1 }));
                  const pct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={hour} className="flex items-center gap-3 text-xs">
                      <span className="w-12 text-text-muted font-mono font-bold">{hour}</span>
                      <div className="flex-1 h-3 bg-bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-16 text-right font-black text-text-primary">{count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Visit Duration Breakdown */}
            <div className="glass-card p-5 rounded-2xl border border-border/50 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" /> How Long Does Each Visit Take?
              </h3>
              <p className="text-xs text-text-muted">
                Time spent on site per visit. Over 268,000 visits tracked with exact check-in and completion times.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-4 bg-bg-secondary/60 rounded-xl border border-border/30">
                  <span className="text-[11px] font-bold text-text-muted block">Quick Check-in</span>
                  <span className="text-2xl font-black text-text-primary">
                    {(data.timeAnalytics?.durationBuckets?.under15m || 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-text-muted block mt-0.5">Under 15 minutes (Quick status / collection)</span>
                </div>
                <div className="p-4 bg-bg-secondary/60 rounded-xl border border-border/30">
                  <span className="text-[11px] font-bold text-emerald-400 block">Standard Meeting</span>
                  <span className="text-2xl font-black text-text-primary">
                    {(data.timeAnalytics?.durationBuckets?.['15to30m'] || 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-text-muted block mt-0.5">15 to 30 minutes (Commercial discussion)</span>
                </div>
                <div className="p-4 bg-bg-secondary/60 rounded-xl border border-border/30">
                  <span className="text-[11px] font-bold text-blue-400 block">Detailed Review</span>
                  <span className="text-2xl font-black text-text-primary">
                    {(data.timeAnalytics?.durationBuckets?.['30to60m'] || 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-text-muted block mt-0.5">30 to 60 minutes (Order planning meeting)</span>
                </div>
                <div className="p-4 bg-bg-secondary/60 rounded-xl border border-border/30">
                  <span className="text-[11px] font-bold text-purple-400 block">Strategic Review</span>
                  <span className="text-2xl font-black text-text-primary">
                    {(data.timeAnalytics?.durationBuckets?.over60m || 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-text-muted block mt-0.5">Over 1 hour (Key account strategic reviews)</span>
                </div>
              </div>

              {/* 21-Month Trend Preview */}
              <div className="pt-4 border-t border-border/30">
                <span className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-2">
                  Monthly Field Visits Over the Past 21 Months
                </span>
                <div className="flex items-end gap-1 h-20 pt-2">
                  {(data.monthlyTrend || []).map((m, idx) => {
                    const maxV = Math.max(...data.monthlyTrend.map(t => t.totalVisits));
                    const heightPct = Math.max(10, Math.round((m.totalVisits / maxV) * 100));
                    return (
                      <div
                        key={idx}
                        className="flex-1 bg-accent/30 hover:bg-accent rounded-t transition-all group relative cursor-pointer"
                        style={{ height: `${heightPct}%` }}
                      >
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-bg-card text-[9px] text-text-primary font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap z-20 border border-border">
                          {m.month}: {m.totalVisits.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── DEALER DETAIL SCORECARD POPUP ── */}
        {selectedDealer && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-bg-card border border-border rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative animate-fade-in">
              <button
                onClick={() => setSelectedDealer(null)}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>

              <div>
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold mb-2"
                  style={{
                    backgroundColor: VISIT_QUADRANTS[selectedDealer.quadrant]?.bgColor,
                    color: VISIT_QUADRANTS[selectedDealer.quadrant]?.color,
                    border: `1px solid ${VISIT_QUADRANTS[selectedDealer.quadrant]?.borderColor}`
                  }}
                >
                  {VISIT_QUADRANTS[selectedDealer.quadrant]?.label}
                </span>
                <h3 className="text-xl font-black text-text-primary leading-tight">
                  {selectedDealer.dealer}
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {selectedDealer.district}, {selectedDealer.state} · Assigned Executive: {selectedDealer.primaryRep}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-bg-secondary/60 rounded-xl border border-border/30">
                  <span className="text-[10.5px] font-bold text-text-muted block">Visits Completed This Month</span>
                  <span className="text-2xl font-black text-text-primary">{selectedDealer.curVisits}</span>
                  <span className="text-[10px] text-text-muted block mt-0.5">
                    Past 6-Mo Avg: {selectedDealer.histAvgVisits} visits/month
                  </span>
                </div>
                <div className="p-3 bg-bg-secondary/60 rounded-xl border border-border/30">
                  <span className="text-[10.5px] font-bold text-text-muted block">Sales Target Status</span>
                  <span className={`text-2xl font-black ${selectedDealer.paceStatus === 'AHEAD' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selectedDealer.paceStatus === 'AHEAD' ? 'Ahead of Target' : 'Behind Target'}
                  </span>
                  <span className="text-[10px] text-text-muted block mt-0.5">
                    Current Rate: {selectedDealer.currentDailyRate} MT/day
                  </span>
                </div>
              </div>

              <div className="p-4 bg-bg-secondary/40 rounded-xl border border-border/30 text-xs text-text-muted space-y-1.5">
                <div className="font-bold text-text-primary">Recommended Action:</div>
                <p className="leading-relaxed">
                  {VISIT_QUADRANTS[selectedDealer.quadrant]?.description}
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSelectedDealer(null)}
                  className="px-4 py-2 bg-accent text-white rounded-xl text-xs font-bold hover:bg-accent/90"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AnimatedPage>
  );
}
