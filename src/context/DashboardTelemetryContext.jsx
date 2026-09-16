import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

  const [pageTelemetry, setPageTelemetry] = useState({});
  const telemetryRef = useRef({
    route: activeRoute,
    tabName: resolveRouteName(activeRoute),
    filters: {},
    selectedEntity: null,
    visibleKpis: null,
  });

  // Keep route updated when location changes
  useEffect(() => {
    telemetryRef.current = {
      ...telemetryRef.current,
      route: activeRoute,
      tabName: pageTelemetry.tabName || resolveRouteName(activeRoute),
    };
  }, [activeRoute, pageTelemetry.tabName]);

  const updateTelemetry = (data) => {
    setPageTelemetry((prev) => {
      const next = typeof data === 'function' ? data(prev) : { ...prev, ...data };
      telemetryRef.current = {
        route: activeRoute,
        tabName: next.tabName || resolveRouteName(activeRoute),
        filters: next.filters || {},
        selectedEntity: next.selectedEntity || null,
        visibleKpis: next.visibleKpis || next.kpis || null,
      };
      return next;
    });
  };

  const clearTelemetry = () => {
    setPageTelemetry({});
    telemetryRef.current = {
      route: activeRoute,
      tabName: resolveRouteName(activeRoute),
      filters: {},
      selectedEntity: null,
      visibleKpis: null,
    };
  };

  const getTelemetrySnapshot = () => ({
    route: telemetryRef.current.route,
    tab_name: telemetryRef.current.tabName,
    filters: telemetryRef.current.filters,
    selected_entity: telemetryRef.current.selectedEntity,
    visible_kpis: telemetryRef.current.visibleKpis,
  });

  const value = useMemo(
    () => ({
      telemetry: telemetryRef.current,
      updateTelemetry,
      clearTelemetry,
      getTelemetrySnapshot,
    }),
    [activeRoute, pageTelemetry]
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
 */
export function useDashboardTelemetry(data) {
  const ctx = useContext(DashboardTelemetryContext);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!ctx || !data) return;
    ctx.updateTelemetry(data);
  }, [
    ctx,
    data?.tabName,
    JSON.stringify(data?.filters || {}),
    JSON.stringify(data?.selectedEntity || null),
    JSON.stringify(data?.visibleKpis || data?.kpis || null),
  ]);
}

export function useGetDashboardTelemetry() {
  const ctx = useContext(DashboardTelemetryContext);
  return ctx?.getTelemetrySnapshot || (() => ({ route: window.location.pathname, tab_name: resolveRouteName(window.location.pathname) }));
}
