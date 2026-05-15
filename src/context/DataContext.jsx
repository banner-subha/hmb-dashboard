import { createContext, useContext, useReducer, useEffect, useState, useMemo, useCallback } from 'react';
import { dataService } from '../services/dataService';
import { calculateMoM, formatTrend, getTrendColor } from '../utils/trendEngine';

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
    }
    if (filters.selectedProduct) {
      const p = filters.selectedProduct;
      alerts = alerts.filter(a => !a.data?.product || a.data.product === p);
      
      const filterAndMapByProduct = (items) => {
        return items
          .filter(item => item.products?.some(prod => prod.product === p))
          .map(item => {
            const prodData = item.products.find(prod => prod.product === p);
            return {
              ...item,
              cur: prodData.cur || 0,
              prev: prodData.prev || 0,
              mom: prodData.mom || 0,
              drop: (prodData.prev || 0) - (prodData.cur || 0)
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

    return { 
      ...rawData, 
      states, 
      districts, 
      dealers, 
      alerts,
      totalCur: dynamicTotalCur,
      totalPrev: dynamicTotalPrev,
      totalMoM: dynamicTotalMoM,
      totalMoMDisplay: dynamicTotalMoMDisplay,
      totalMoMColor: dynamicTotalMoMColor,
      products: dynamicProducts
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
