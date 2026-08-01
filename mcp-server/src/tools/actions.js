import { getData } from '../dataLoader.js';

export function getRecommendedActions({ priority } = {}, data) {
  const d = data || getData();
  const intel = d.intelligence || {};

  let actions = intel.recommended_actions || [];
  if (priority) {
    const want = String(priority).replace(/[\s_]/g, '').toUpperCase();
    actions = actions.filter(a => String(a.priority || '').replace(/[\s_]/g, '').toUpperCase() === want);
  }

  return {
    executiveSummary: intel.executive_summary ?? null,
    escalationFlags: intel.escalation_flags || [],
    dealerRisks: (intel.dealer_risks || []).map(r => ({
      dealer: r.dealer ?? null,
      district: r.district ?? null,
      state: r.state ?? null,
      riskType: r.risk_type ?? null,
      recommendedAction: r.recommended_action ?? null
    })),
    recommendedActions: actions.map(a => ({
      priority: a.priority ?? null,
      action: a.action ?? null,
      owner: a.owner ?? null,
      deadlineHint: a.deadline_hint ?? null
    }))
  };
}
