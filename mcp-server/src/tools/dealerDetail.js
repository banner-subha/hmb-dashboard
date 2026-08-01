import { getData } from '../dataLoader.js';
import { summarizeDealer } from '../analysis.js';

export function getDealerDetail({ client } = {}, data) {
  const d = data || getData();
  if (!client) return { error: 'client parameter is required', dealer: null };

  const found = (d.dealers || []).find(dl =>
    String(dl.client || '').replace(/\s+/g, '').toUpperCase() ===
    String(client).replace(/\s+/g, '').toUpperCase()
  );
  if (!found) return { error: `No data found for dealer "${client}"`, dealer: null };

  const scored = (d.intel?.scoredDealers || []).find(x => x.client === found.client);
  const riskEntry = (d.intelligence?.dealer_risks || []).find(r => r.dealer === found.client);

  return {
    dealer: summarizeDealer(found),
    risk: scored
      ? {
          riskScore: scored.riskScore ?? 0,
          impactTier: scored.impactTier ?? null,
          trendDirection: scored.trendDirection ?? null,
          trendLabel: scored.trendLabel ?? null,
          isInactive: !!scored.isInactive,
          displayColor: scored.displayColor ?? null
        }
      : null,
    recommendedAction: riskEntry?.recommended_action ?? null
  };
}
