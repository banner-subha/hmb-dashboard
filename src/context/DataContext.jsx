import { createContext, useContext, useReducer, useEffect, useState, useMemo, useCallback } from 'react';
import { dataService } from '../services/dataService';
import { calculateMoM, formatTrend, getTrendColor, getBusinessImpact } from '../utils/trendEngine';

const DataContext = createContext(null);

// Filter reducer
const filterReducer = (state, action) => {
  switch (action.type) {
    case 'SET_STATE':    
      if (state.selectedState === action.payload) return state;
      return { ...state, selectedState: action.payload, selectedDistrict: null };
    case 'SET_DISTRICT': 
      if (state.selectedDistrict === action.payload) return state;
      return { ...state, selectedDistrict: action.payload };
    case 'SET_PRODUCT':  
      if (state.selectedProduct === action.payload) return state;
      return { ...state, selectedProduct: action.payload };
    case 'SET_SEVERITY': 
      if (state.selectedSeverity === action.payload) return state;
      return { ...state, selectedSeverity: action.payload };
    case 'SET_SEARCH':   
      if (state.searchQuery === action.payload) return state;
      return { ...state, searchQuery: action.payload };
    case 'RESET':        return initialFilters;
    default:             return state;
  }
};

const initialFilters = {
  selectedState: null,
  selectedDistrict: null,
  selectedProduct: null,
  selectedSeverity: null,
  searchQuery: '',
};

export function DataProvider({ children }) {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, dispatch] = useReducer(filterReducer, initialFilters);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    dataService.fetchDashboardData()
      .then(data => { if (mounted) { setRawData(data); setError(null); } })
      .catch(err => { if (mounted) setError(err.message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const refresh = useCallback(() => {
    dataService.clearCache();
    setLoading(true);
    dataService.fetchDashboardData()
      .then(data => { setRawData(data); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Filtered data derived from rawData + filters
  const filteredData = useMemo(() => {
    if (!rawData) return null;
    let { states = [], districts = [], dealers = [], alerts = [] } = rawData;

    if (filters.selectedState) {
      const s = filters.selectedState.replace(/\s+/g, '').toUpperCase();
      states = states.filter(st => st.state && st.state.replace(/\s+/g, '').toUpperCase() === s);
      districts = districts.filter(d => d.state && d.state.replace(/\s+/g, '').toUpperCase() === s);
      dealers = dealers.filter(d => d.state && d.state.replace(/\s+/g, '').toUpperCase() === s);
      alerts = alerts.filter(a => !a.data?.state || a.data.state.replace(/\s+/g, '').toUpperCase() === s);
    }
    if (filters.selectedDistrict) {
      const d = filters.selectedDistrict;
      districts = districts.filter(dist => dist.district === d);
      dealers = dealers.filter(dl => dl.district === d);
      
      const targetDist = rawData.districts?.find(dist => dist.district === d);
      if (targetDist) {
        states = states.filter(st => st.state === targetDist.state).map(st => ({
          ...st,
          cur: targetDist.cur,
          prev: targetDist.prev,
          mom: targetDist.mom,
          drop: targetDist.drop,
          products: targetDist.products,
          orderCur: targetDist.orderCur,
          orderPrev: targetDist.orderPrev,
          orderMoM: targetDist.orderMoM
        }));
      } else {
        states = [];
      }
    }
    if (filters.selectedProduct) {
      const p = filters.selectedProduct;
      alerts = alerts.filter(a => !a.data?.product || a.data.product === p);
      
      const filterAndMapByProduct = (items) => {
        return items
          .filter(item => item.products?.some(prod => prod.product === p))
          .map(item => {
            const prodData = item.products.find(prod => prod.product === p);
            const pCur = prodData.cur || 0;
            const pPrev = prodData.prev || 0;
            const pOrderCur = prodData.orderCur || 0;
            const pOrderPrev = prodData.orderPrev || 0;
            return {
              ...item,
              cur: pCur,
              prev: pPrev,
              mom: calculateMoM(pCur, pPrev),
              drop: pPrev - pCur,
              orderCur: pOrderCur,
              orderPrev: pOrderPrev,
              orderMoM: calculateMoM(pOrderCur, pOrderPrev)
            };
          });
      };

      states = filterAndMapByProduct(states);
      districts = filterAndMapByProduct(districts);
      dealers = filterAndMapByProduct(dealers);
    }
    if (filters.selectedSeverity) {
      alerts = alerts.filter(a => a.severity === filters.selectedSeverity);
    }
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      dealers = dealers.filter(dl =>
        dl.client?.toLowerCase().includes(q) ||
        dl.district?.toLowerCase().includes(q) ||
        dl.state?.toLowerCase().includes(q)
      );
    }

    const isFiltered = filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery;

    let dynamicTotalCur = rawData.totalCur;
    let dynamicTotalPrev = rawData.totalPrev;
    let dynamicTotalMoM = rawData.totalMoM;
    let dynamicProducts = rawData.products;

    if (isFiltered) {
      dynamicTotalCur = 0;
      dynamicTotalPrev = 0;
      const productMap = {};

      dealers.forEach(d => {
        dynamicTotalCur += (d.cur || 0);
        dynamicTotalPrev += (d.prev || 0);
        
        (d.products || []).forEach(p => {
          if (filters.selectedProduct && p.product !== filters.selectedProduct) return;
          if (!productMap[p.product]) {
            const baseProduct = rawData.products?.find(rp => rp.product === p.product) || {};
            productMap[p.product] = {
              product: p.product,
              label: baseProduct.label || p.product,
              cur_mt: 0,
              prev_mt: 0
            };
          }
          productMap[p.product].cur_mt += (p.cur || 0);
          productMap[p.product].prev_mt += (p.prev || 0);
        });
      });

      dynamicTotalMoM = calculateMoM(dynamicTotalCur, dynamicTotalPrev);

      dynamicProducts = Object.values(productMap).map(p => ({
        ...p,
        cur: p.cur_mt,
        prev: p.prev_mt,
        mom_pct: calculateMoM(p.cur_mt, p.prev_mt),
        share_pct: dynamicTotalCur > 0 ? Math.round((p.cur_mt / dynamicTotalCur) * 100) : 0
      })).sort((a, b) => b.cur_mt - a.cur_mt);
    }

    // Compute display values on frontend
    const dynamicTotalMoMDisplay = formatTrend(calculateMoM(dynamicTotalCur, dynamicTotalPrev));
    const dynamicTotalMoMColor = getTrendColor(calculateMoM(dynamicTotalCur, dynamicTotalPrev), dynamicTotalCur, dynamicTotalPrev);

    let dynamicPendingTotal = rawData.pendingTotal;
    if (filters.selectedDistrict) {
      dynamicPendingTotal = districts.reduce((sum, d) => sum + (d.orderCur || 0), 0);
    } else if (filters.selectedState) {
      dynamicPendingTotal = states.reduce((sum, s) => sum + (s.orderCur || 0), 0);
    } else if (filters.selectedProduct) {
      dynamicPendingTotal = states.reduce((sum, s) => sum + (s.orderCur || 0), 0);
    }

    // Recompute intel object based on filtered arrays
    const dynamicIntel = {
      ...rawData.intel,
      // 1. Filtered states, districts, and dealers sorted by impactScore
      scoredStates: [...states].map(s => {
        const { impactScore, severity, theme } = getBusinessImpact(s.cur, s.prev, s.share || 0, 'STATE', s.state);
        return {
          ...s,
          impactScore,
          impactTier: severity,
          healthStatus: severity,
          healthColor: theme.color,
          displayColor: theme.color
        };
      }).sort((a, b) => b.impactScore - a.impactScore),

      scoredDistricts: [...districts].map(dist => {
        const distShare = dynamicTotalCur > 0 ? (dist.cur / dynamicTotalCur) * 100 : 0;
        const { impactScore, severity, theme } = getBusinessImpact(dist.cur, dist.prev, distShare, 'DISTRICT', dist.state);
        return {
          ...dist,
          impactScore,
          impactTier: severity,
          healthStatus: severity,
          healthColor: theme.color,
          displayColor: theme.color
        };
      }).sort((a, b) => b.impactScore - a.impactScore),

      scoredDealers: [...dealers].map(dl => {
        const dealerShare = dynamicTotalCur > 0 ? (dl.cur / dynamicTotalCur) * 100 : 0;
        const { impactScore, severity, theme } = getBusinessImpact(dl.cur, dl.prev, dealerShare, 'DEALER', dl.state);
        return {
          ...dl,
          impactScore,
          impactTier: severity,
          healthStatus: severity,
          healthColor: theme.color,
          displayColor: theme.color
        };
      }).sort((a, b) => b.impactScore - a.impactScore),

      // 2. Filtered inactive dealers
      inactiveDealers: [...dealers]
        .filter(dl => dl.prev > 0 && dl.cur === 0)
        .map(dl => ({
          client: dl.client,
          state: dl.state,
          district: dl.district,
          prevVolume: dl.prev,
          products: (dl.products || []).filter(p => p.prev > 0).map(p => p.product).join(', ')
        }))
        .sort((a, b) => b.prevVolume - a.prevVolume),
    };

    dynamicIntel.inactiveDealerCount = dynamicIntel.inactiveDealers.length;

    // 3. Recompute top 3 dealer share and concentration risk
    const activeDealersSorted = [...dealers].filter(dl => dl.cur > 0).sort((a, b) => b.cur - a.cur);
    const top3Volume = activeDealersSorted.slice(0, 3).reduce((sum, dl) => sum + dl.cur, 0);
    const top3Share = dynamicTotalCur > 0 ? Math.round((top3Volume / dynamicTotalCur) * 100) : 0;
    
    dynamicIntel.top3DealerShare = top3Share;
    dynamicIntel.top3DealerNames = activeDealersSorted.slice(0, 3).map(dl => dl.client);
    dynamicIntel.concentrationRisk = top3Share >= 60 ? 'HIGH' : top3Share >= 40 ? 'MEDIUM' : 'LOW';

    const finalStates = dynamicIntel.scoredStates;
    const finalDistricts = dynamicIntel.scoredDistricts;
    const finalDealers = dynamicIntel.scoredDealers;

    return { 
      ...rawData, 
      states: finalStates, 
      districts: finalDistricts, 
      dealers: finalDealers, 
      alerts,
      totalCur: dynamicTotalCur,
      totalPrev: dynamicTotalPrev,
      totalMoM: dynamicTotalMoM,
      totalMoMDisplay: dynamicTotalMoMDisplay,
      totalMoMColor: dynamicTotalMoMColor,
      products: dynamicProducts,
      pendingTotal: dynamicPendingTotal,
      alertCount: alerts.length,
      intel: dynamicIntel
    };
  }, [rawData, filters]);

  // Unique options for filter dropdowns
  const filterOptions = useMemo(() => {
    if (!rawData) return { states: [], districts: [], products: [], severities: [] };
    return {
      states: [...new Set((rawData.states || []).map(s => s.state))].sort(),
      districts: [...new Set([
        ...(rawData.districts || []).map(d => ({ state: d.state, district: d.district })),
        ...(rawData.dealers || []).map(d => ({ state: d.state, district: d.district }))
      ]
        .filter(d => d.district && String(d.district).toLowerCase() !== 'nan' && String(d.district).trim() !== '')
        .filter(d => !filters.selectedState || (d.state && d.state.replace(/\s+/g, '').toUpperCase() === filters.selectedState.replace(/\s+/g, '').toUpperCase()))
        .map(d => d.district)
      )].sort(),
      products: (rawData.products || []).map(p => p.product),
      severities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    };
  }, [rawData, filters.selectedState]);

  const value = { rawData, data: filteredData, loading, error, filters, dispatch, filterOptions, refresh };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};
