import { createContext, useContext, useReducer, useEffect, useState, useMemo, useCallback } from 'react';
import { dataService } from '../services/dataService';

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
      const s = filters.selectedState;
      states = states.filter(st => st.state === s);
      districts = districts.filter(d => d.state === s);
      dealers = dealers.filter(d => d.state === s);
      alerts = alerts.filter(a => !a.data?.state || a.data.state === s);
    }
    if (filters.selectedDistrict) {
      const d = filters.selectedDistrict;
      districts = districts.filter(dist => dist.district === d);
      dealers = dealers.filter(dl => dl.district === d);
    }
    if (filters.selectedProduct) {
      const p = filters.selectedProduct;
      alerts = alerts.filter(a => !a.data?.product || a.data.product === p);
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

    return { ...rawData, states, districts, dealers, alerts };
  }, [rawData, filters]);

  // Unique options for filter dropdowns
  const filterOptions = useMemo(() => {
    if (!rawData) return { states: [], districts: [], products: [], severities: [] };
    return {
      states: [...new Set((rawData.states || []).map(s => s.state))].sort(),
      districts: [...new Set(
        (rawData.districts || [])
          .filter(d => !filters.selectedState || d.state === filters.selectedState)
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
