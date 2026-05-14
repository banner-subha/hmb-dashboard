import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
  Activity,
  Target,
  Map,
  Layers
} from 'lucide-react';
import SeverityBadge from './SeverityBadge';

// Helper to format numbers safely
const formatNum = (num, fallback = '-') => (typeof num === 'number' ? num.toFixed(1) : fallback);

export default function AlertIntelligenceGrid({ alerts = [] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [showRootCauseOnly, setShowRootCauseOnly] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());

  // 1. Alert Summary Chips counts
  const counts = useMemo(() => {
    return alerts.reduce((acc, alert) => {
      const sev = alert.severity?.toUpperCase();
      if (sev === 'CRITICAL') acc.critical++;
      if (sev === 'HIGH') acc.high++;
      if (sev === 'MEDIUM') acc.medium++;
      return acc;
    }, { critical: 0, high: 0, medium: 0 });
  }, [alerts]);

  // 2. Filter logic
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      // search
      const query = searchQuery.toLowerCase();
      const searchable = `${alert.dealer || ''} ${alert.district || ''} ${alert.state || ''} ${alert.products || ''} ${alert.reason || ''} ${alert.title || ''}`.toLowerCase();
      if (searchQuery && !searchable.includes(query)) return false;

      // severity
      if (selectedSeverity !== 'ALL' && alert.severity?.toUpperCase() !== selectedSeverity) return false;

      // level
      const level = alert.level || alert.category || 'OVERALL';
      if (selectedLevel !== 'ALL' && level.toUpperCase() !== selectedLevel) return false;

      // root cause only
      if (showRootCauseOnly && !alert.rootCause) return false;

      return true;
    });
  }, [alerts, searchQuery, selectedSeverity, selectedLevel, showRootCauseOnly]);

  // 3. Hierarchical Grouping Logic (Sort for tree structure)
  const groupedAlerts = useMemo(() => {
    // We try to sort them so State is followed by its Districts, followed by their Dealers
    const sorted = [...filteredAlerts].sort((a, b) => {
      const stateA = (a.state || '').toLowerCase();
      const stateB = (b.state || '').toLowerCase();
      if (stateA !== stateB) return stateA.localeCompare(stateB);

      const levelOrder = { 'STATE': 1, 'DISTRICT': 2, 'DEALER': 3, 'PRODUCT': 4, 'OVERALL': 5 };
      const lvlA = levelOrder[(a.level || a.category || '').toUpperCase()] || 99;
      const lvlB = levelOrder[(b.level || b.category || '').toUpperCase()] || 99;
      
      if (lvlA !== lvlB) return lvlA - lvlB;

      const distA = (a.district || '').toLowerCase();
      const distB = (b.district || '').toLowerCase();
      if (distA !== distB) return distA.localeCompare(distB);

      return 0; // fallback
    });

    return sorted;
  }, [filteredAlerts]);

  const toggleRow = (index) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const renderTrendIcon = (mom) => {
    if (typeof mom !== 'number') return <Minus className="w-4 h-4 text-text-muted" />;
    if (mom < 0) return <TrendingDown className="w-4 h-4 text-severity-critical" />;
    if (mom > 0) return <TrendingUp className="w-4 h-4 text-severity-none" />;
    return <Minus className="w-4 h-4 text-text-muted" />;
  };

  const getIndentLevel = (alert) => {
    const lvl = (alert.level || alert.category || '').toUpperCase();
    if (lvl === 'DISTRICT') return 1;
    if (lvl === 'DEALER') return 2;
    return 0;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* HEADER & CHIPS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent-blue" />
            Alert Intelligence Grid
          </h3>
          <p className="text-sm text-text-secondary">Detailed alert explorer and operational drill-down</p>
        </div>
        
        {/* SUMMARY CHIPS */}
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setSelectedSeverity(selectedSeverity === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-sm font-bold ${
              selectedSeverity === 'CRITICAL' 
                ? 'bg-severity-critical/20 border-severity-critical text-severity-critical' 
                : 'bg-bg-card border-border text-text-secondary hover:border-severity-critical/50 hover:text-text-primary'
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-severity-critical"></div>
            Critical <span className="ml-1 opacity-75">{counts.critical}</span>
          </button>
          
          <button 
            onClick={() => setSelectedSeverity(selectedSeverity === 'HIGH' ? 'ALL' : 'HIGH')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-sm font-bold ${
              selectedSeverity === 'HIGH' 
                ? 'bg-severity-high/20 border-severity-high text-severity-high' 
                : 'bg-bg-card border-border text-text-secondary hover:border-severity-high/50 hover:text-text-primary'
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-severity-high"></div>
            High <span className="ml-1 opacity-75">{counts.high}</span>
          </button>

          <button 
            onClick={() => setSelectedSeverity(selectedSeverity === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-sm font-bold ${
              selectedSeverity === 'MEDIUM' 
                ? 'bg-severity-medium/20 border-severity-medium text-severity-medium' 
                : 'bg-bg-card border-border text-text-secondary hover:border-severity-medium/50 hover:text-text-primary'
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-severity-medium"></div>
            Medium <span className="ml-1 opacity-75">{counts.medium}</span>
          </button>
        </div>
      </div>

      {/* COMBINED FILTER BAR & TABLE MODULE */}
      <div className="glass-card overflow-hidden flex flex-col">
        {/* SMART FILTER BAR */}
        <div className="p-3 flex flex-col md:flex-row gap-3 items-center justify-between border-b border-border bg-bg-card/50">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input 
                type="text" 
                placeholder="Search alerts, entities..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input py-1.5 text-xs w-full bg-bg-input/50"
              />
            </div>
            
            <select 
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="filter-select py-1.5 text-xs bg-bg-input/50"
            >
              <option value="ALL">All Levels</option>
              <option value="STATE">State</option>
              <option value="DISTRICT">District</option>
              <option value="DEALER">Dealer</option>
              <option value="PRODUCT">Product</option>
            </select>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary hover:text-text-primary transition-colors">
              <input 
                type="checkbox" 
                checked={showRootCauseOnly}
                onChange={(e) => setShowRootCauseOnly(e.target.checked)}
                className="rounded border-border bg-bg-input text-accent-blue focus:ring-accent-blue"
              />
              <Layers className="w-4 h-4" />
              Show Root Causes Only
            </label>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-secondary border-b border-border text-xs uppercase tracking-wider text-text-muted">
                <th className="p-3 font-bold w-8"></th>
                <th className="p-3 font-bold">Severity</th>
                <th className="p-3 font-bold">Level</th>
                <th className="p-3 font-bold">Entity</th>
                <th className="p-3 font-bold text-right">MoM %</th>
                <th className="p-3 font-bold text-right">MT Loss</th>
                <th className="p-3 font-bold text-right">Impact Score</th>
                <th className="p-3 font-bold text-center">Root Cause</th>
                <th className="p-3 font-bold text-center">Trend</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {groupedAlerts.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-text-muted">
                    No alerts match the selected filters.
                  </td>
                </tr>
              ) : (
                groupedAlerts.map((alert, idx) => {
                  const isExpanded = expandedRows.has(idx);
                  const indent = getIndentLevel(alert);
                  const entityName = alert.dealer || alert.district || alert.state || alert.products || (alert.title ? alert.title.split(':')[0] : 'Unknown');
                  const lvl = (alert.level || alert.category || 'OVERALL').toUpperCase();
                  
                  return (
                    <React.Fragment key={idx}>
                      <tr 
                        onClick={() => toggleRow(idx)}
                        className={`border-b border-border/50 hover:bg-bg-secondary/50 cursor-pointer transition-colors ${isExpanded ? 'bg-bg-secondary/30' : ''}`}
                      >
                        <td className="p-3 text-text-muted">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="p-3">
                          <SeverityBadge severity={alert.severity || 'LOW'} />
                        </td>
                        <td className="p-3">
                          <span className="text-xs font-bold text-text-muted">{lvl}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2" style={{ paddingLeft: `${indent * 1.5}rem` }}>
                            {indent > 0 && <div className="w-3 h-px bg-border-accent opacity-50"></div>}
                            {lvl === 'PRODUCT' && <Target className="w-3.5 h-3.5 text-text-muted" />}
                            {lvl === 'STATE' && <Map className="w-3.5 h-3.5 text-text-muted" />}
                            {lvl === 'DISTRICT' && <Map className="w-3.5 h-3.5 text-text-muted" />}
                            {lvl === 'DEALER' && <Search className="w-3.5 h-3.5 text-text-muted" />}
                            <span className="font-medium text-text-primary">{entityName}</span>
                          </div>
                        </td>
                        <td className={`p-3 text-right font-medium ${alert.mom < 0 ? 'text-severity-critical' : 'text-text-primary'}`}>
                          {alert.mom ? `${alert.mom > 0 ? '+' : ''}${formatNum(alert.mom)}%` : '-'}
                        </td>
                        <td className="p-3 text-right text-text-secondary">
                          {alert.drop ? formatNum(alert.drop) : (alert.data?.drop ? formatNum(alert.data.drop) : '-')}
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <span className="text-xs font-bold text-text-secondary">{alert.impactScore || '-'}</span>
                            {alert.impactScore && (
                              <div className="w-12 h-1.5 bg-bg-input rounded-full overflow-hidden">
                                <div className="bg-accent-blue h-full" style={{ width: `${Math.min(100, alert.impactScore)}%` }}></div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {alert.rootCause ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                              ROOT
                            </span>
                          ) : (
                            <span className="text-text-muted">-</span>
                          )}
                        </td>
                        <td className="p-3 flex justify-center">
                          {renderTrendIcon(alert.mom)}
                        </td>
                      </tr>

                      {/* EXPANDED DETAILS */}
                      {isExpanded && (
                        <tr className="bg-bg-secondary/20 border-b border-border">
                          <td colSpan="9" className="p-0">
                            <div className="p-4 pl-12 border-l-2 border-accent-blue ml-[18px] my-2 space-y-4 animate-slide-up">
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <h4 className="text-xs font-bold text-text-muted uppercase mb-2">AI Reasoning & Context</h4>
                                  <p className="text-sm text-text-secondary leading-relaxed">
                                    {alert.reason || alert.detail || "No detailed AI reasoning available for this alert."}
                                  </p>
                                </div>
                                
                                <div>
                                  <h4 className="text-xs font-bold text-text-muted uppercase mb-2">Recommended Actions</h4>
                                  <div className="bg-bg-card border border-border rounded p-3 text-sm">
                                    <div className="flex gap-2 items-start">
                                      <Activity className="w-4 h-4 text-severity-none shrink-0 mt-0.5" />
                                      <span className="text-text-primary">
                                        {alert.recommendedAction || "Investigate related entities and verify dispatch logs."}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {(alert.state || alert.district) && (
                                <div>
                                  <h4 className="text-xs font-bold text-text-muted uppercase mb-2">Root Cause Hierarchy Grouping</h4>
                                  <div className="bg-bg-card border border-border rounded p-3 text-sm font-mono text-text-secondary">
                                    {alert.state && <div>{alert.state}</div>}
                                    {alert.district && <div className="ml-4 border-l border-border-accent pl-2">├── {alert.district}</div>}
                                    {alert.dealer && <div className="ml-8 border-l border-border-accent pl-2">└── {alert.dealer}</div>}
                                    {!alert.dealer && <div className="ml-8 text-text-muted italic">└── (Associated Dealers/Products)</div>}
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-4 text-xs text-text-muted pt-2 border-t border-border/50">
                                <span>Share: <strong className="text-text-primary">{alert.share ? `${alert.share}%` : '-'}</strong></span>
                                {alert.suppressedBy && <span>Suppressed By: <strong className="text-text-primary">{alert.suppressedBy}</strong></span>}
                                {alert.products && <span>Products: <strong className="text-text-primary">{alert.products}</strong></span>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
