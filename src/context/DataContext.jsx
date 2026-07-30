import { createContext, useContext, useReducer, useEffect, useState, useMemo, useCallback } from 'react';
import { dataService } from '../services/dataService';
import { calculateMoM, formatTrend, getTrendColor, getBusinessImpact } from '../utils/trendEngine';
import { isRealState, NORTH_BENGAL_DISTRICTS } from '../utils/constants';
import { useAuth } from './AuthContext';
import { getNormalizedDistrictSet, matchesAssignedDistrict } from '../utils/districtNormalizer';
import { syncClientUsers } from '../data/clientRegistry';

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
    case 'TOGGLE_NORTH_BENGAL':
      return { ...state, isNorthBengal: !state.isNorthBengal };
    case 'SET_NORTH_BENGAL':
      return { ...state, isNorthBengal: action.payload };
    case 'SYNC_FILTERS':
      return {
        ...initialFilters,
        selectedState: action.payload.state || null,
        selectedDistrict: action.payload.district || null,
        selectedProduct: action.payload.product || null,
        selectedSeverity: action.payload.severity || null,
        searchQuery: action.payload.searchQuery || action.payload.search || '',
        isNorthBengal: action.payload.isNorthBengal || false,
      };
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
  isNorthBengal: false,
};

function processData(rawData, filters, user) {
  if (!rawData) return null;
  let { states = [], districts = [], dealers = [], alerts = [] } = rawData;
  states = states.filter(st => st && isRealState(st.state));
  districts = districts.filter(d => d && isRealState(d.state));
  dealers = dealers.filter(dl => dl && isRealState(dl.state));

  // 0. User / Role Scope Filtering (KRM/KRO Client Locks)
  if (filters.isNorthBengal) {
    const nbSet = getNormalizedDistrictSet(NORTH_BENGAL_DISTRICTS);
    districts = districts.filter(d => matchesAssignedDistrict(d.district, nbSet));
    dealers = dealers.filter(dl => matchesAssignedDistrict(dl.district, nbSet));
    states = states.filter(st => st.state && st.state.replace(/\s+/g, '').toUpperCase() === 'WEST BENGAL');
  } else if (user && user.role === 'client') {
    const allowedStates = (user.states || []).map(s => s.replace(/\s+/g, '').toUpperCase());
    const assignedDistricts = user.districts || [];
    const assignedSet = getNormalizedDistrictSet(assignedDistricts);

    if (assignedSet.size > 0) {
      districts = districts.filter(d => matchesAssignedDistrict(d.district, assignedSet));
      dealers = dealers.filter(dl => matchesAssignedDistrict(dl.district, assignedSet));
      const distStateSet = new Set([
        ...districts.map(d => (d.state || '').replace(/\s+/g, '').toUpperCase()),
        ...dealers.map(dl => (dl.state || '').replace(/\s+/g, '').toUpperCase())
      ]);
      states = states.filter(st => distStateSet.has((st.state || '').replace(/\s+/g, '').toUpperCase()));
    } else if (allowedStates.length > 0) {
      districts = districts.filter(d => allowedStates.includes((d.state || '').replace(/\s+/g, '').toUpperCase()));
      dealers = dealers.filter(dl => allowedStates.includes((dl.state || '').replace(/\s+/g, '').toUpperCase()));
      states = states.filter(st => allowedStates.includes((st.state || '').replace(/\s+/g, '').toUpperCase()));
    }
  }

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
        orderMoM: targetDist.orderMoM,
        avgPeriod: targetDist.avgPeriod
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
          const pPendingQty = prodData.pendingQty !== undefined ? prodData.pendingQty : 0;
          return {
            ...item,
            cur: pCur,
            prev: pPrev,
            mom: calculateMoM(pCur, pPrev),
            drop: pPrev - pCur,
            orderCur: pOrderCur,
            orderPrev: pOrderPrev,
            orderMoM: calculateMoM(pOrderCur, pOrderPrev),
            pendingQty: pPendingQty
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

  const isFiltered = filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery || filters.isNorthBengal || (user && user.role === 'client');

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
            prev_mt: 0,
            pendingQty: 0
          };
        }
        productMap[p.product].cur_mt += (p.cur || 0);
        productMap[p.product].prev_mt += (p.prev || 0);
        productMap[p.product].pendingQty += (p.pendingQty || p.pending || 0);
      });
    });

    dynamicTotalMoM = calculateMoM(dynamicTotalCur, dynamicTotalPrev);

    dynamicProducts = Object.values(productMap).map(p => {
      const base = rawData.products?.find(rp => rp.product === p.product) || {};
      const pQty = p.pendingQty > 0
        ? Math.round(p.pendingQty * 100) / 100
        : (base.pendingQty || base.pending_qty || 0);
      return {
        ...p,
        cur: p.cur_mt,
        prev: p.prev_mt,
        pendingQty: pQty,
        pending_qty: pQty,
        mom_pct: calculateMoM(p.cur_mt, p.prev_mt),
        share_pct: dynamicTotalCur > 0 ? Math.round((p.cur_mt / dynamicTotalCur) * 100) : 0
      };
    }).sort((a, b) => b.cur_mt - a.cur_mt);
  }

  const dynamicTotalMoMDisplay = formatTrend(calculateMoM(dynamicTotalCur, dynamicTotalPrev));
  const dynamicTotalMoMColor = getTrendColor(calculateMoM(dynamicTotalCur, dynamicTotalPrev), dynamicTotalCur, dynamicTotalPrev);

  let dynamicPendingTotal = rawData.pendingTotal || 0;
  if (filters.selectedDistrict) {
    dynamicPendingTotal = districts.reduce((sum, d) => sum + (d.pendingQty || 0), 0);
  } else if (filters.selectedState) {
    dynamicPendingTotal = states.reduce((sum, s) => sum + (s.pendingQty || 0), 0);
  } else if (filters.selectedProduct) {
    dynamicPendingTotal = states.reduce((sum, s) => sum + (s.pendingQty || 0), 0);
  } else if (isFiltered) {
    dynamicPendingTotal = districts.reduce((sum, d) => sum + (d.pendingQty || 0), 0);
  }

  const dynamicIntel = {
    ...rawData.intel,
    scoredStates: [...states].map(s => {
      const { impactScore, severity, theme } = getBusinessImpact(s.cur, s.prev, s.share || 0, 'STATE', s.state, s.expectedMtd);
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
      const { impactScore, severity, theme } = getBusinessImpact(dist.cur, dist.prev, distShare, 'DISTRICT', dist.state, dist.expectedMtd);
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
      const { impactScore, severity, theme } = getBusinessImpact(dl.cur, dl.prev, dealerShare, 'DEALER', dl.state, dl.expectedMtd);
      return {
        ...dl,
        impactScore,
        impactTier: severity,
        healthStatus: severity,
        healthColor: theme.color,
        displayColor: theme.color
      };
    }).sort((a, b) => b.impactScore - a.impactScore),

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

  const activeDealersSorted = [...dealers].filter(dl => dl.cur > 0).sort((a, b) => b.cur - a.cur);
  const top3Volume = activeDealersSorted.slice(0, 3).reduce((sum, dl) => sum + dl.cur, 0);
  const top3Share = dynamicTotalCur > 0 ? Math.round((top3Volume / dynamicTotalCur) * 100) : 0;
  
  dynamicIntel.top3DealerShare = top3Share;
  dynamicIntel.top3DealerNames = activeDealersSorted.slice(0, 3).map(dl => dl.client);
  dynamicIntel.concentrationRisk = top3Share >= 60 ? 'HIGH' : top3Share >= 40 ? 'MEDIUM' : 'LOW';

  const finalStates = dynamicIntel.scoredStates;
  const finalDistricts = dynamicIntel.scoredDistricts;
  const finalDealers = dynamicIntel.scoredDealers;

  let healedIntelligence = rawData.intelligence;
  if (healedIntelligence) {
    const healedDealerRisks = healedIntelligence.dealer_risks
      ? healedIntelligence.dealer_risks.map(risk => {
          if (!risk.district || !risk.state) {
            const match = rawData.dealers?.find(
              d => d.client?.replace(/\s+/g, '').toUpperCase() === risk.dealer?.replace(/\s+/g, '').toUpperCase()
            );
            if (match) {
              return {
                ...risk,
                district: risk.district || match.district,
                state: risk.state || match.state
              };
            }
          }
          return risk;
        })
      : [];

    if (healedDealerRisks.length < 6 && rawData.dealers) {
      const existingNames = new Set(healedDealerRisks.map(r => r.dealer?.replace(/\s+/g, '').toUpperCase()));
      const decliningDealers = [...rawData.dealers]
        .filter(d => (d.mom < 0 || d.cur === 0) && !existingNames.has(d.client?.replace(/\s+/g, '').toUpperCase()))
        .sort((a, b) => (b.prev - b.cur) - (a.prev - a.cur));
      
      for (const d of decliningDealers) {
        if (healedDealerRisks.length >= 6) break;
        const drop = Math.max(0, (d.prev || 0) - (d.cur || 0));
        const riskType = d.cur === 0 ? 'INACTIVE' : 'DECLINING';
        healedDealerRisks.push({
          dealer: d.client,
          district: d.district || '',
          state: d.state || '',
          risk_type: riskType,
          recommended_action: `Area Sales Manager to prioritize visit within 48 hours to resolve pending orders and review sales strategy.`
        });
      }
    }

    const validatedProductInsights = (Array.isArray(healedIntelligence.product_insights)
      ? healedIntelligence.product_insights
      : [])
      .filter(item => {
        if (!item.product) return false;
        if (item.trend && item.trend !== 'DECLINING') return false;
        if (typeof item.mom_pct === 'number' && item.mom_pct >= 0) return false;
        return true;
      })
      .map(item => {
        const match = rawData.products?.find(p => p.product?.toUpperCase() === item.product?.toUpperCase());
        let realPending = (item.pending_qty && Number(item.pending_qty) > 0)
          ? Number(item.pending_qty)
          : (match?.pendingQty ?? match?.pending_qty ?? 0);
        
        if (realPending === 0 && rawData.dealers) {
          realPending = rawData.dealers.reduce((sum, dl) => {
            const pMatch = (dl.products || []).find(p => p.product?.toUpperCase() === item.product?.toUpperCase());
            return sum + (pMatch?.pendingQty || pMatch?.pending || 0);
          }, 0);
          realPending = Math.round(realPending * 100) / 100;
        }
        return {
          ...item,
          pending_qty: realPending
        };
      });

    const totalDecline = rawData.intel?.totalDrop || 1;

    if (rawData.products) {
      rawData.products.forEach(p => {
        const isDeclining = p.mom < 0;

        if (isDeclining) {
          const exists = validatedProductInsights.some(item => item.product?.toUpperCase() === p.product?.toUpperCase());
          if (!exists) {
            const drop = Math.max(0, p.prev - p.cur);
            const pctOfTotalDecline = Math.round((drop / totalDecline) * 100);
            const trend = 'DECLINING';
            
            let primary_driver = `We lost ${Math.round(drop)} MT of ${p.product} volume this period (a ${Math.abs(p.mom)}% MoM contraction), representing ${pctOfTotalDecline}% of our total volume drop.`;
            if (p.pendingQty > 0) {
              primary_driver += ` A significant backlog of ${p.pendingQty} MT remains open.`;
            }
            
            let recommended_action = '';
            if (p.pendingQty > 0) {
              recommended_action = `Regional Sales Manager to review the ${p.pendingQty} MT pending backlog for ${p.product} and coordinate with the Dispatch Team to clear delivery bottlenecks this week.`;
            } else {
              recommended_action = `Area Sales Managers to contact key accounts to investigate the demand drop for ${p.product} and report findings by the end of the cycle.`;
            }

            validatedProductInsights.push({
              product: p.product,
              label: p.label || p.product,
              cur_mt: p.cur,
              prev_mt: p.prev,
              mom_pct: p.mom,
              share_pct: p.share,
              pending_qty: p.pendingQty,
              trend,
              primary_driver,
              impact_mt: Math.round(drop),
              pct_of_total_decline: pctOfTotalDecline,
              recommended_action
            });
          }
        }
      });
    }

    validatedProductInsights.sort((a, b) => (b.impact_mt || 0) - (a.impact_mt || 0));

    healedIntelligence = {
      ...healedIntelligence,
      dealer_risks: healedDealerRisks,
      product_insights: validatedProductInsights
    };
  }

  return { 
    ...rawData, 
    intelligence: healedIntelligence,
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
}

export function DataProvider({ children }) {
  const { user } = useAuth();
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, dispatch] = useReducer(filterReducer, initialFilters);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const timeout = setTimeout(() => {
      if (mounted) {
        setError('Loading timed out. Please check your connection and try again.');
        setLoading(false);
      }
    }, 20000);

    dataService.fetchDashboardData()
      .then(data => {
        if (mounted) {
          clearTimeout(timeout);
          setRawData(data);
          setError(null);
          if (data && data.users && Array.isArray(data.users)) {
            syncClientUsers(data.users);
          }
        }
      })
      .catch(err => { if (mounted) { clearTimeout(timeout); setError(err.message); } })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; clearTimeout(timeout); };
  }, []);

  const refresh = useCallback(() => {
    dataService.clearCache();
    setLoading(true);
    dataService.fetchDashboardData()
      .then(data => {
        setRawData(data);
        setError(null);
        if (data && data.users && Array.isArray(data.users)) {
          syncClientUsers(data.users);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Filtered data derived from rawData + filters
  const filteredData = useMemo(() => {
    return processData(rawData, filters, user);
  }, [rawData, filters, user]);

  // Overall (unfiltered) data for Executive Overview and AI War Room
  const overallData = useMemo(() => {
    const isFiltered = filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.selectedSeverity || filters.searchQuery;
    if (!isFiltered) return filteredData;
    return processData(rawData, initialFilters, user);
  }, [rawData, filters, user, filteredData]);

  // Unique options for filter dropdowns
  const filterOptions = useMemo(() => {
    if (!rawData) return { states: [], districts: [], products: [], severities: [] };

    let baseStates = (rawData.states || []).filter(st => st && isRealState(st.state));
    let baseDistricts = [
      ...(rawData.districts || []).map(d => ({ state: d.state, district: d.district })),
      ...(rawData.dealers || []).map(d => ({ state: d.state, district: d.district }))
    ].filter(d => d.district && String(d.district).toLowerCase() !== 'nan' && String(d.district).trim() !== '' && isRealState(d.state));

    if (filters.isNorthBengal) {
      const nbSet = getNormalizedDistrictSet(NORTH_BENGAL_DISTRICTS);
      baseDistricts = baseDistricts.filter(d => matchesAssignedDistrict(d.district, nbSet));
      baseStates = baseStates.filter(st => (st.state || '').replace(/\s+/g, '').toUpperCase() === 'WEST BENGAL');
    } else if (user && user.role === 'client') {
      const allowedStates = (user.states || []).map(s => s.replace(/\s+/g, '').toUpperCase());
      const assignedDistricts = user.districts || [];
      const assignedSet = getNormalizedDistrictSet(assignedDistricts);

      if (assignedSet.size > 0) {
        baseDistricts = baseDistricts.filter(d => matchesAssignedDistrict(d.district, assignedSet));
        const distStateSet = new Set(baseDistricts.map(d => (d.state || '').replace(/\s+/g, '').toUpperCase()));
        baseStates = baseStates.filter(st => distStateSet.has((st.state || '').replace(/\s+/g, '').toUpperCase()));
      } else if (allowedStates.length > 0) {
        baseDistricts = baseDistricts.filter(d => allowedStates.includes((d.state || '').replace(/\s+/g, '').toUpperCase()));
        baseStates = baseStates.filter(st => allowedStates.includes((st.state || '').replace(/\s+/g, '').toUpperCase()));
      }
    }

    return {
      states: [...new Set(baseStates.map(s => s.state))].sort(),
      districts: [...new Set(baseDistricts
        .filter(d => !filters.selectedState || (d.state && d.state.replace(/\s+/g, '').toUpperCase() === filters.selectedState.replace(/\s+/g, '').toUpperCase()))
        .map(d => d.district)
      )].sort(),
      products: (rawData.products || []).map(p => p.product),
      severities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    };
  }, [rawData, filters.selectedState, filters.isNorthBengal, user]);

  // Auto-default selectedState for client users when scoped to a single state or when state is unselected
  useEffect(() => {
    if (user && user.role === 'client' && filterOptions.states.length > 0) {
      const currentSelectedUpper = (filters.selectedState || '').replace(/\s+/g, '').toUpperCase();
      const availableUpper = filterOptions.states.map(s => s.replace(/\s+/g, '').toUpperCase());
      
      if (!filters.selectedState || !availableUpper.includes(currentSelectedUpper)) {
        if (filterOptions.states.length === 1) {
          dispatch({ type: 'SET_STATE', payload: filterOptions.states[0] });
        }
      }
    }
  }, [user, filterOptions.states, filters.selectedState]);

  const value = useMemo(
    () => ({ rawData, data: filteredData, overallData, loading, error, filters, dispatch, filterOptions, refresh }),
    [rawData, filteredData, overallData, loading, error, filters, dispatch, filterOptions, refresh]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) {
    console.warn('useData hook accessed outside of DataProvider — returning fallback state.');
    return {
      rawData: null,
      data: null,
      overallData: null,
      loading: true,
      error: null,
      filters: { selectedState: null, selectedDistrict: null, selectedProduct: null, selectedSeverity: null, searchQuery: '', isNorthBengal: false },
      dispatch: () => {},
      filterOptions: { states: [], districts: [], products: [], severities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
      refresh: () => {},
    };
  }
  return ctx;
};
