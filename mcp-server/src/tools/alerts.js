import { getData } from '../dataLoader.js';
import { summarizeAlert } from '../analysis.js';

export function getAlerts({ severity } = {}, data) {
  const d = data || getData();
  let alerts = d.alerts || [];

  if (severity) {
    const s = String(severity).toUpperCase();
    alerts = alerts.filter(a => String(a.severity || '').toUpperCase() === s);
  }

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;
  const highCount = alerts.filter(a => a.severity === 'HIGH').length;
  const mediumCount = alerts.filter(a => a.severity === 'MEDIUM').length;

  return {
    totalAlerts: alerts.length,
    criticalCount,
    highCount,
    mediumCount,
    alerts: alerts.map(summarizeAlert)
  };
}
