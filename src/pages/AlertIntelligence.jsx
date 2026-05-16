import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { 
  AlertTriangle, 
  Search, 
  ChevronDown, 
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
  Activity,
  Target,
  Map,
  Layers,
  FileText,
  Briefcase
} from 'lucide-react';
import SeverityBadge from '../components/common/SeverityBadge';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { calculateMoM, getBusinessImpact } from '../utils/trendEngine';

// Helper to format numbers safely
const formatNum = (num, fallback = '-') => (typeof num === 'number' ? num.toFixed(1) : fallback);

function getImpactScoreColor(score) {
  if (score >= 75) {
    return '#ef4444'; // red
  }
  if (score >= 45) {
    return '#f97316'; // orange
  }
  return '#22c55e'; // green
}

// Dynamic Hierarchy Generator
const buildHierarchy = (alert, fullData) => {
  if (!fullData || !alert) return null;
  const level = (alert.level || alert.category || '').toUpperCase();
  const entityName = (alert.dealer || alert.district || alert.state || (alert.title ? alert.title.split(':')[0].trim() : '')).toUpperCase();
  const cleanName = (name) => name ? name.split('—')[0].trim() : '';

  if (level === 'STATE') {
    const districts = (fullData.districts || []).filter(d => d.state?.toUpperCase() === entityName);
    const stateObj = (fullData.states || []).find(s => s.state?.toUpperCase() === entityName);
    const products = stateObj?.products || [];
    
    if (districts.length === 0 && products.length === 0) return null;
    return {
      type: 'STATE',
      name: cleanName(alert.state || entityName),
      children: [
        ...districts.map(d => ({ type: 'DISTRICT', name: cleanName(d.district) })),
        ...products.map(p => ({ type: 'PRODUCT', name: cleanName(p.product) }))
      ]
    };
  }
  
  if (level === 'DISTRICT') {
    const matchName = entityName.split(',')[0].trim(); // Handle "KOLKATA, WEST BENGAL"
    const dealers = (fullData.dealers || []).filter(d => d.district?.toUpperCase() === matchName);
    const distObj = (fullData.districts || []).find(d => d.district?.toUpperCase() === matchName);
    const products = distObj?.products || [];
    
    if (dealers.length === 0 && products.length === 0) return null;
    return {
      type: 'DISTRICT',
      name: cleanName(alert.district || matchName),
      children: [
        ...dealers.map(d => ({ type: 'DEALER', name: cleanName(d.client) })),
        ...products.map(p => ({ type: 'PRODUCT', name: cleanName(p.product) }))
      ]
    };
  }
  
  if (level === 'DEALER') {
    const dealerObj = (fullData.dealers || []).find(d => d.client?.toUpperCase() === entityName);
    const products = dealerObj?.products || [];
    if (products.length === 0) return null;
    return {
      type: 'DEALER',
      name: cleanName(alert.dealer || entityName),
      children: products.map(p => ({ type: 'PRODUCT', name: cleanName(p.product) }))
    };
  }
  
  return null;
};

// Contextual Recommendation Generator
const generateRecommendation = (alert) => {
  const sev = (alert.severity || '').toUpperCase();
  const lvl = (alert.level || alert.category || '').toUpperCase();
  const mom = alert.mom || 0;
  
  if (sev === 'CRITICAL') {
    return "Escalate to regional leadership for immediate intervention. Verify supply lines and dealer operational status within 24 hours.";
  }
  if (lvl === 'STATE') {
    if (mom < -15) return "Review state-wide sales execution and major dealer inactivity trends. Re-allocate inventory if demand is structurally shifting.";
    return "Monitor state-level dispatch velocity and check for systemic logistics or pricing issues.";
  }
  if (lvl === 'DISTRICT') {
    return "Investigate district-level dispatch bottlenecks and local dealer performance anomalies.";
  }
  if (lvl === 'DEALER') {
    if (mom <= -50) return "Contact dealer immediately to verify operational or inventory issues. Prevent full churn.";
    return "Review dealer incentive alignment and competitor pricing pressure in the locality.";
  }
  if (lvl === 'PRODUCT') {
    return "Audit production allocation and regional supply chain pipelines for this product line.";
  }
  return "Review related operational metrics and investigate supply vs demand imbalances.";
};

export default function AlertIntelligence() {
  const { data, loading, error } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [expandedRows, setExpandedRows] = useState(new Set());

  if (loading) return <div className="text-center py-12">Loading Alert Intelligence...</div>;
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;

  const alerts = data?.alerts || [];

  // Extract unique states and products for filters
  const uniqueStates = useMemo(() => {
    const states = new Set(alerts.map(a => a.state || (a.data?.state)).filter(Boolean));
    return Array.from(states).sort();
  }, [alerts]);

  const uniqueProducts = useMemo(() => {
    const prods = new Set(alerts.map(a => a.product || a.products || (a.data?.product)).filter(Boolean));
    return Array.from(prods).sort();
  }, [alerts]);

  // 1. Alert Summary Chips counts
  const counts = useMemo(() => {
    return alerts.reduce((acc, alert) => {
      const cur = alert.data?.cur ?? alert.cur ?? 0;
      const prev = alert.data?.prev ?? alert.prev ?? 0;
      const sev = getBusinessImpact(cur, prev).severity;
      
      if (sev === 'CRITICAL') acc.critical++;
      if (sev === 'HIGH') acc.high++;
      if (sev === 'MEDIUM') acc.medium++;
      if (sev === 'LOW') acc.low++;
      return acc;
    }, { critical: 0, high: 0, medium: 0, low: 0 });
  }, [alerts]);

  // 2. Filter logic
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      // search
      const query = searchQuery.toLowerCase();
      const searchable = `${alert.dealer || ''} ${alert.district || ''} ${alert.state || ''} ${alert.products || alert.product || ''} ${alert.reason || alert.title || ''}`.toLowerCase();
      if (searchQuery && !searchable.includes(query)) return false;

      // severity
      const cur = alert.data?.cur ?? alert.cur ?? 0;
      const prev = alert.data?.prev ?? alert.prev ?? 0;
      const derivedSev = getBusinessImpact(cur, prev).severity;
      if (selectedSeverity !== 'ALL' && derivedSev !== selectedSeverity) return false;

      // level
      const level = alert.level || alert.category || 'OVERALL';
      if (selectedLevel !== 'ALL' && level.toUpperCase() !== selectedLevel) return false;

      // state filter
      const alertState = alert.state || alert.data?.state || '';
      if (selectedState !== 'ALL' && alertState !== selectedState) return false;

      // product filter
      const alertProd = alert.product || alert.products || alert.data?.product || '';
      if (selectedProduct !== 'ALL' && !alertProd.includes(selectedProduct)) return false;

      return true;
    });
  }, [alerts, searchQuery, selectedSeverity, selectedLevel, selectedState, selectedProduct]);

  // 3. Sorting
  const groupedAlerts = useMemo(() => {
    return [...filteredAlerts].sort((a, b) => {
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

      return 0;
    });
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


  const getIndentLevel = (alert) => {
    const lvl = (alert.level || alert.category || '').toUpperCase();
    if (lvl === 'DISTRICT') return 1;
    if (lvl === 'DEALER') return 2;
    return 0;
  };

  return (
    <div className="animate-fade-in max-w-6xl mx-auto space-y-6">
      
      {/* HEADER & CHIPS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-text-primary flex items-center gap-3 mb-2">
            <Activity className="w-6 h-6 text-accent-blue" />
            Alert Intelligence
          </h2>
          <p className="text-sm text-text-secondary">Enterprise operational explorer and root-cause investigation workspace</p>
        </div>
        
        {/* EXECUTIVE CHIPS — Glassmorphism severity-aware */}
        <div className="flex flex-wrap gap-3">
          {/* Active Alerts — neutral dark blue tint */}
          <div
            className="flex items-center gap-4 px-5 py-3 rounded-xl border transition-all"
            style={{
              background: 'rgba(59,130,246,0.07)',
              borderColor: 'rgba(59,130,246,0.2)',
              boxShadow: '0 0 16px rgba(59,130,246,0.06)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-accent-blue/70 uppercase tracking-widest mb-0.5">Active Alerts</span>
              <span className="text-2xl font-extrabold text-text-primary leading-none">{alerts.length}</span>
            </div>
            <Activity className="w-5 h-5 text-accent-blue/40" />
          </div>

          {/* Critical — soft red tint */}
          <button
            onClick={() => setSelectedSeverity(selectedSeverity === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
            className="flex items-center gap-4 px-5 py-3 rounded-xl border transition-all hover:scale-[1.02]"
            style={{
              background: selectedSeverity === 'CRITICAL'
                ? 'rgba(239,68,68,0.18)'
                : 'rgba(239,68,68,0.12)',
              borderColor: selectedSeverity === 'CRITICAL'
                ? 'rgba(239,68,68,0.6)'
                : 'rgba(239,68,68,0.35)',
              boxShadow: selectedSeverity === 'CRITICAL'
                ? '0 0 20px rgba(239,68,68,0.15)'
                : '0 0 10px rgba(239,68,68,0.05)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(239,68,68,0.7)' }}>Critical</span>
              <span className="text-2xl font-extrabold text-text-primary leading-none">{counts.critical}</span>
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-severity-critical animate-pulse-subtle"></div>
          </button>

          {/* High — orange tint */}
          <button
            onClick={() => setSelectedSeverity(selectedSeverity === 'HIGH' ? 'ALL' : 'HIGH')}
            className="flex items-center gap-4 px-5 py-3 rounded-xl border transition-all hover:scale-[1.02]"
            style={{
              background: selectedSeverity === 'HIGH'
                ? 'rgba(249,115,22,0.18)'
                : 'rgba(249,115,22,0.12)',
              borderColor: selectedSeverity === 'HIGH'
                ? 'rgba(249,115,22,0.6)'
                : 'rgba(249,115,22,0.35)',
              boxShadow: selectedSeverity === 'HIGH'
                ? '0 0 20px rgba(249,115,22,0.12)'
                : '0 0 10px rgba(249,115,22,0.04)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(249,115,22,0.7)' }}>High</span>
              <span className="text-2xl font-extrabold text-text-primary leading-none">{counts.high}</span>
            </div>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#f97316' }}></div>
          </button>

          {/* Medium — yellow tint */}
          <button
            onClick={() => setSelectedSeverity(selectedSeverity === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
            className="flex items-center gap-4 px-5 py-3 rounded-xl border transition-all hover:scale-[1.02]"
            style={{
              background: selectedSeverity === 'MEDIUM'
                ? 'rgba(234,179,8,0.18)'
                : 'rgba(234,179,8,0.12)',
              borderColor: selectedSeverity === 'MEDIUM'
                ? 'rgba(234,179,8,0.6)'
                : 'rgba(234,179,8,0.35)',
              boxShadow: selectedSeverity === 'MEDIUM'
                ? '0 0 20px rgba(234,179,8,0.12)'
                : '0 0 10px rgba(234,179,8,0.04)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(234,179,8,0.7)' }}>Medium</span>
              <span className="text-2xl font-extrabold text-text-primary leading-none">{counts.medium}</span>
            </div>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#eab308' }}></div>
          </button>


        </div>
      </div>

      {/* COMBINED FILTER BAR & TABLE MODULE */}
      <div className="glass-card overflow-hidden flex flex-col shadow-lg shadow-black/20">
        
        {/* SMART FILTER BAR */}
        <div className="p-4 flex flex-col lg:flex-row gap-4 items-center justify-between border-b border-border bg-bg-card">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto flex-1">
            <div className="relative flex-1 md:max-w-xs min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input 
                type="text" 
                placeholder="Search alerts, entities..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input w-full bg-bg-input border-border/50 focus:border-accent-blue"
              />
            </div>
            
            <select 
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="filter-select bg-bg-input border-border/50 text-xs w-32"
            >
              <option value="ALL">All Levels</option>
              <option value="STATE">State</option>
              <option value="DISTRICT">District</option>
              <option value="DEALER">Dealer</option>
              <option value="PRODUCT">Product</option>
            </select>

            <select 
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="filter-select bg-bg-input border-border/50 text-xs w-40"
            >
              <option value="ALL">All States</option>
              {uniqueStates.map(st => <option key={st} value={st}>{st}</option>)}
            </select>

            <select 
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="filter-select bg-bg-input border-border/50 text-xs w-40"
            >
              <option value="ALL">All Products</option>
              {uniqueProducts.map(pr => <option key={pr} value={pr}>{pr}</option>)}
            </select>
          </div>

        </div>

        {/* TABLE */}
        <div className="overflow-x-auto relative">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-bg-secondary/95 backdrop-blur-sm border-b border-border shadow-sm">
              <tr className="text-xs uppercase tracking-wider text-text-muted">
                <th className="p-4 font-bold w-12 text-center"></th>
                <th className="p-4 font-bold">Severity</th>
                <th className="p-4 font-bold">Level</th>
                <th className="p-4 font-bold">Entity</th>
                <th className="p-4 font-bold text-right">MoM %</th>
                <th className="p-4 font-bold text-right">MT Loss</th>
                <th className="p-4 font-bold text-center">Impact Score</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-border/30">
              {groupedAlerts.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-text-muted">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    No alerts match the selected filters.
                  </td>
                </tr>
              ) : (
                groupedAlerts.map((alert, idx) => {
                  const isExpanded = expandedRows.has(idx);
                  const indent = getIndentLevel(alert);
                  const entityName = alert.dealer || alert.district || alert.state || alert.product || alert.products || (alert.title ? alert.title.split(':')[0] : 'Unknown');
                  const lvl = (alert.level || alert.category || 'OVERALL').toUpperCase();
                  
                  return (
                    <React.Fragment key={idx}>
                      {/* ROW */}
                      <tr 
                        onClick={() => toggleRow(idx)}
                        className={`hover:bg-bg-secondary/60 cursor-pointer transition-colors group ${isExpanded ? 'bg-bg-secondary/40' : ''}`}
                      >
                        <td className="p-4 text-text-muted text-center">
                          {isExpanded ? <ChevronDown className="w-4 h-4 mx-auto text-accent-blue" /> : <ChevronRight className="w-4 h-4 mx-auto group-hover:text-text-primary transition-colors" />}
                        </td>
                        <td className="p-4">
                          {(() => {
                            const cur = alert.data?.cur ?? alert.cur ?? 0;
                            const prev = alert.data?.prev ?? alert.prev ?? 0;
                            const { theme: sev } = getBusinessImpact(cur, prev);
                            return <SeverityBadge severity={sev.severity} color={sev.color} />;
                          })()}
                        </td>
                        <td className="p-4">
                          <span className="text-xs font-bold text-text-muted">{lvl}</span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2" style={{ paddingLeft: `${indent * 1.25}rem` }}>
                            {indent > 0 && <div className="w-3 h-px bg-border-accent opacity-50"></div>}
                            {lvl === 'PRODUCT' && <Target className="w-3.5 h-3.5 text-text-muted" />}
                            {lvl === 'STATE' && <Map className="w-3.5 h-3.5 text-text-muted" />}
                            {lvl === 'DISTRICT' && <Map className="w-3.5 h-3.5 text-text-muted" />}
                            {lvl === 'DEALER' && <Search className="w-3.5 h-3.5 text-text-muted" />}
                            <span className="font-medium text-text-primary whitespace-nowrap">{entityName}</span>
                          </div>
                        </td>
                        <td className="p-4 text-right font-medium whitespace-nowrap">
                          <MoMIndicator cur={alert.data?.cur ?? alert.cur} prev={alert.data?.prev ?? alert.prev} />
                        </td>
                        <td className="p-4 text-right text-text-secondary whitespace-nowrap">
                          {alert.drop ? formatNum(alert.drop) : (alert.data?.drop ? formatNum(alert.data.drop) : '-')}
                        </td>
                        <td className="p-4 text-center">
                          <span
                            style={{
                              color: getImpactScoreColor(alert.impactScore || alert.data?.riskScore || alert.data?.impactScore || 0),
                              fontWeight: 700
                            }}
                          >
                            {alert.impactScore || alert.data?.riskScore || alert.data?.impactScore || 0}
                          </span>
                        </td>

                      </tr>

                      {/* EXPANDED DETAILS (2-COLUMN LAYOUT) */}
                      {isExpanded && (() => {
                        const hierarchy = buildHierarchy(alert, data);
                        const rec = generateRecommendation(alert);
                        
                        return (
                          <tr className="bg-bg-primary/40 shadow-inner">
                            <td colSpan="7" className="p-0 border-b border-border/50">
                              <div className="p-6 pl-14 border-l-2 border-accent-blue ml-5 my-2 space-y-6 animate-slide-up">
                                
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                  
                                  {/* LEFT COLUMN */}
                                  <div className="space-y-6">
                                    {/* Operational Context */}
                                    <div>
                                      <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                                        <FileText className="w-4 h-4" /> Operational Context
                                      </h4>
                                      <p className="text-sm text-text-secondary leading-relaxed bg-bg-card p-4 rounded-lg border border-border/50">
                                        {alert.reason || alert.detail || alert.title || "Contextual details unavailable for this alert entity."}
                                      </p>
                                    </div>

                                    {/* Dynamic Root Cause Hierarchy */}
                                    {hierarchy && (
                                      <div>
                                        <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                                          <Layers className="w-4 h-4" /> Root Cause Hierarchy
                                        </h4>
                                        <div className="bg-bg-card border border-border/50 rounded-lg p-4 text-sm font-mono">
                                          <div className="flex items-center gap-2 text-text-primary font-bold">
                                            {hierarchy.type === 'STATE' && <Map className="w-3.5 h-3.5 text-accent-blue" />}
                                            {hierarchy.type === 'DISTRICT' && <Map className="w-3.5 h-3.5 text-accent-blue" />}
                                            {hierarchy.type === 'DEALER' && <Search className="w-3.5 h-3.5 text-accent-blue" />}
                                            {hierarchy.name}
                                          </div>
                                          
                                          {hierarchy.children.map((child, i) => (
                                            <div key={i} className="flex items-center gap-2 mt-2 ml-4 relative">
                                              {/* Tree Connector */}
                                              <div className="absolute -left-4 top-0 w-4 h-1/2 border-l border-b border-border-accent rounded-bl"></div>
                                              
                                              {child.type === 'DISTRICT' && <Map className="w-3 h-3 text-text-muted z-10 bg-bg-card" />}
                                              {child.type === 'DEALER' && <Search className="w-3 h-3 text-text-muted z-10 bg-bg-card" />}
                                              {child.type === 'PRODUCT' && <Target className="w-3 h-3 text-text-muted z-10 bg-bg-card" />}
                                              
                                              <span className="text-text-secondary">{child.name}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* RIGHT COLUMN */}
                                  <div className="space-y-6">
                                    {/* Recommended Actions */}
                                    <div>
                                      <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                                        <Briefcase className="w-4 h-4" /> Recommended Actions
                                      </h4>
                                      <div className="bg-bg-card border border-border/50 rounded-lg p-4 text-sm">
                                        <div className="flex gap-3 items-start">
                                          <Activity className={`w-5 h-5 shrink-0 mt-0.5 ${alert.severity === 'CRITICAL' ? 'text-severity-critical' : 'text-accent-blue'}`} />
                                          <span className="text-text-primary leading-relaxed font-medium">
                                            {rec}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Escalation Metadata */}
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="bg-bg-card border border-border/50 rounded-lg p-3">
                                        <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Business Impact</div>
                                        <div className="text-sm font-medium text-text-primary">
                                          {alert.drop ? `${formatNum(alert.drop)} MT Lost` : 'Pending Assessment'}
                                        </div>
                                      </div>
                                      <div className="bg-bg-card border border-border/50 rounded-lg p-3">
                                        <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Product Portfolio</div>
                                        <div className="text-sm font-medium text-text-primary truncate" title={alert.products || alert.product || 'Multiple'}>
                                          {alert.products || alert.product || 'Multiple'}
                                        </div>
                                      </div>
                                    </div>

                                  </div>
                                </div>

                                {/* FOOTER METADATA */}
                                <div className="flex gap-4 text-xs text-text-muted pt-4 mt-4 border-t border-border/30">
                                  <span>Share: <strong className="text-text-primary">{alert.share ? `${alert.share}%` : '-'}</strong></span>
                                  {alert.suppressedBy && <span>Suppressed By: <strong className="text-text-primary">{alert.suppressedBy}</strong></span>}
                                  <span>Generated At: <strong className="text-text-primary">{data.meta?.generatedAt ? new Date(data.meta.generatedAt).toLocaleString() : 'N/A'}</strong></span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
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
