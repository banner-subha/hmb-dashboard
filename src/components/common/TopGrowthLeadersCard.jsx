import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import CollapsibleCard from './CollapsibleCard';
import { formatMT } from '../../utils/formatters';
import MoMIndicator from './MoMIndicator';
import { calculateMoM } from '../../utils/trendEngine';
import { TrendingUp, MapPin, ChevronRight, ArrowRight } from 'lucide-react';

function TopGrowthLeadersCard({ intel }) {
  const navigate = useNavigate();
  const { dispatch } = useData();
  const [activeTab, setActiveTab] = useState('states');

  // Filter all growing states and districts (mom > 0 and cur > 0)
  const allGrowingStates = useMemo(() => {
    return (intel?.scoredStates || [])
      .filter(s => {
        const mom = calculateMoM(s.cur, s.prev);
        return mom > 0 && s.cur > 0;
      })
      .sort((a, b) => (b.cur - b.prev) - (a.cur - a.prev));
  }, [intel?.scoredStates]);

  const allGrowingDistricts = useMemo(() => {
    return (intel?.scoredDistricts || [])
      .filter(d => {
        const mom = calculateMoM(d.cur, d.prev);
        return mom > 0 && d.cur > 0;
      })
      .sort((a, b) => (b.cur - b.prev) - (a.cur - a.prev));
  }, [intel?.scoredDistricts]);

  // Show up to max 6 inside the card
  const displayedList = useMemo(() => {
    return activeTab === 'states' 
      ? allGrowingStates.slice(0, 6) 
      : allGrowingDistricts.slice(0, 6);
  }, [activeTab, allGrowingStates, allGrowingDistricts]);

  const totalGrowingCount = activeTab === 'states' ? allGrowingStates.length : allGrowingDistricts.length;

  const handleExploreAll = () => {
    dispatch({ type: 'RESET' });
    if (activeTab === 'states') {
      navigate('/states?trend=GROWING');
    } else {
      navigate('/districts?trend=GROWING');
    }
  };

  const handleItemClick = (item) => {
    if (activeTab === 'states') {
      dispatch({ type: 'SET_STATE', payload: item.state });
      navigate(`/states?state=${encodeURIComponent(item.state)}`);
    } else {
      if (item.state) {
        dispatch({ type: 'SET_STATE', payload: item.state });
      }
      dispatch({ type: 'SET_DISTRICT', payload: item.district });
      navigate(`/districts?state=${encodeURIComponent(item.state || '')}&district=${encodeURIComponent(item.district)}`);
    }
  };

  return (
    <CollapsibleCard 
      title="Best Performing Areas" 
      badge={
        <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold shadow-xs badge-theme-green">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Growing</span>
        </div>
      }
      accentColor="#22c55e"
    >
      <div className="space-y-3.5 py-0.5">
        <div className="space-y-3">
          {/* Toggle between States and Districts */}
          <div className="flex rounded-lg bg-bg-secondary p-1 border border-border/50 gap-1">
            <button
              onClick={() => setActiveTab('states')}
              className={`flex-1 py-1.5 px-2 text-[11px] sm:text-xs md:text-sm font-extrabold rounded-md transition-all cursor-pointer truncate ${
                activeTab === 'states'
                  ? 'bg-bg-card text-text-primary shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              States Growing ({allGrowingStates.length})
            </button>
            <button
              onClick={() => setActiveTab('districts')}
              className={`flex-1 py-1.5 px-2 text-[11px] sm:text-xs md:text-sm font-extrabold rounded-md transition-all cursor-pointer truncate ${
                activeTab === 'districts'
                  ? 'bg-bg-card text-text-primary shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Districts Growing ({allGrowingDistricts.length})
            </button>
          </div>

          {/* List of Growth Leaders */}
          <div className="space-y-2">
            {displayedList.length === 0 ? (
              <div className="text-sm text-text-muted italic py-6 text-center font-medium">
                No positive growth {activeTab} recorded in this cycle
              </div>
            ) : (
              displayedList.map((item, idx) => {
                const name = activeTab === 'states' ? item.state : item.district;
                const gain = Math.max(0, (item.cur || 0) - (item.prev || 0));

                return (
                  <div 
                    key={`${name}-${idx}`}
                    onClick={() => handleItemClick(item)}
                    className="group flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-bg-secondary/60 hover:bg-bg-card border border-border/40 hover:border-accent-blue/40 transition-all cursor-pointer shadow-xs gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="w-6 h-6 rounded-full bg-accent-blue/15 text-accent-blue border border-accent-blue/30 font-black text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm sm:text-[15px] font-bold text-text-primary truncate group-hover:text-accent-blue transition-colors leading-snug">
                          {name}
                        </div>
                        {activeTab === 'districts' && item.state && (
                          <div className="text-xs text-text-muted flex items-center gap-1 font-medium mt-0.5 truncate">
                            <MapPin className="w-3 h-3 text-text-muted shrink-0" />
                            <span className="truncate">{item.state}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-sm sm:text-[15px] font-black text-text-primary font-mono">{formatMT(item.cur)}</div>
                        <div className="text-xs font-bold text-severity-none flex items-center justify-end gap-1 mt-0.5">
                          <span>+{formatMT(gain)}</span>
                          <span>·</span>
                          <MoMIndicator cur={item.cur} prev={item.prev} className="text-xs" />
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-blue transition-transform group-hover:translate-x-0.5 shrink-0" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2 border-t border-border/40">
          <button
            onClick={handleExploreAll}
            className="w-full py-2.5 px-3 rounded-lg bg-bg-secondary hover:bg-bg-card border border-border/60 hover:border-accent-blue/50 text-xs sm:text-sm font-bold text-accent-blue hover:text-accent-blue/80 flex items-center justify-center gap-2 transition-all cursor-pointer group shadow-xs leading-snug"
          >
            <span>See All {activeTab === 'states' ? 'Growing States' : 'Growing Districts'} ({totalGrowingCount})</span>
            <ArrowRight className="w-4 h-4 text-accent-blue transition-transform group-hover:translate-x-1 shrink-0" />
          </button>
        </div>
      </div>
    </CollapsibleCard>
  );
}

export default React.memo(TopGrowthLeadersCard);
