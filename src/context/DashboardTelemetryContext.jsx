import { createContext, useContext, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

const ROUTE_NAMES = {
  '/': 'Executive Overview',
  '/overview': 'Executive Overview',
  '/states': 'State Intelligence',
  '/districts': 'District Intelligence',
  '/dealers': 'Dealer Network',
  '/visits': 'Field Visits & Tracker',
  '/business-plan': 'Business Plan',
  '/war-room': 'AI War Room',
  '/alerts': 'Alert Intelligence',
  '/geo': 'Geo Intelligence',
  '/chat': 'Assistant Full Screen',
};

export const resolveRouteName = (pathname) => {
  if (!pathname) return 'Dashboard';
  if (ROUTE_NAMES[pathname]) return ROUTE_NAMES[pathname];
  for (const [route, name] of Object.entries(ROUTE_NAMES)) {
    if (route !== '/' && pathname.startsWith(route)) return name;
  }
  return 'Dashboard';
};

const DashboardTelemetryContext = createContext(null);

export function DashboardTelemetryProvider({ children }) {
  const location = useLocation();
  const activeRoute = location.pathname;

  const telemetryRef = useRef({
    route: activeRoute,
    tabName: resolveRouteName(activeRoute),
    filters: {},
    selectedEntity: null,
    visibleKpis: null,
  });

  // Keep route & default tab name updated when location changes
  useEffect(() => {
    telemetryRef.current.route = activeRoute;
    telemetryRef.current.tabName = resolveRouteName(activeRoute);
  }, [activeRoute]);

  const updateTelemetry = useCallback((data) => {
    if (!data) return;
    const current = telemetryRef.current;
    const next = typeof data === 'function' ? data(current) : data;
    telemetryRef.current = {
      route: window.location.pathname,
      tabName: next.tabName || resolveRouteName(window.location.pathname),
      filters: next.filters || {},
      selectedEntity: next.selectedEntity || null,
      visibleKpis: next.visibleKpis || next.kpis || null,
    };
  }, []);

  const clearTelemetry = useCallback(() => {
    telemetryRef.current = {
      route: window.location.pathname,
      tabName: resolveRouteName(window.location.pathname),
      filters: {},
      selectedEntity: null,
      visibleKpis: null,
    };
  }, []);

  const getTelemetrySnapshot = useCallback(() => ({
    route: telemetryRef.current.route || window.location.pathname,
    tab_name: telemetryRef.current.tabName || resolveRouteName(window.location.pathname),
    filters: telemetryRef.current.filters || {},
    selected_entity: telemetryRef.current.selectedEntity || null,
    visible_kpis: telemetryRef.current.visibleKpis || null,
  }), []);

  // Perfectly stable context value that NEVER triggers re-renders on consumers
  const value = useMemo(
    () => ({
      updateTelemetry,
      clearTelemetry,
      getTelemetrySnapshot,
    }),
    [updateTelemetry, clearTelemetry, getTelemetrySnapshot]
  );

  return (
    <DashboardTelemetryContext.Provider value={value}>
      {children}
    </DashboardTelemetryContext.Provider>
  );
}

/**
 * Hook for pages and modal components to broadcast their active view,
 * filters, inspected entity, and headline KPIs to the sales assistant.
 * 
 * Silently stores telemetry in a ref without triggering any React re-render cycles.
 */
export function useDashboardTelemetry(data) {
  const ctx = useContext(DashboardTelemetryContext);
  const dataRef = useRef(data);
  dataRef.current = data;

  const serialized = useMemo(() => {
    try {
      return JSON.stringify({
        tabName: data?.tabName,
        filters: data?.filters,
        selectedEntity: data?.selectedEntity,
        visibleKpis: data?.visibleKpis || data?.kpis,
      });
    } catch {
      return '';
    }
  }, [
    data?.tabName,
    data?.filters,
    data?.selectedEntity,
    data?.visibleKpis,
    data?.kpis,
  ]);

  useEffect(() => {
    if (!ctx || !dataRef.current) return;
    ctx.updateTelemetry(dataRef.current);
  }, [ctx, serialized]);
}

export function useGetDashboardTelemetry() {
  const ctx = useContext(DashboardTelemetryContext);
  return ctx?.getTelemetrySnapshot || (() => ({
    route: window.location.pathname,
    tab_name: resolveRouteName(window.location.pathname),
  }));
}
