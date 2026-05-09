// Sample data matching the exact n8n output structure
// This file is used as fallback during development

export const sampleData = {
  meta: { generatedAt: "2026-05-08T08:30:00.000Z", curPeriod: "8 Apr 2026 – 8 May 2026", prevPeriod: "8 Mar 2026 – 8 Apr 2026", rowsProcessed: 1247 },
  totalCur: 2847.5, totalPrev: 3101.2, totalMoM: -8, pendingTotal: 1203.4, targetTotal: 3500,
  alertCount: 22, hasAlert: true,
  products: [
    { product: "IG", label: "IG (Iron Gate)", cur: 633, prev: 722, mom: -12.3, share: 22 },
    { product: "GI", label: "GI (Galvanised Iron)", cur: 892, prev: 857, mom: 4.1, share: 31 },
    { product: "IGG", label: "IGG (Iron Gate — Heavy)", cur: 287, prev: 310, mom: -7.4, share: 10 },
    { product: "HGI", label: "HGI (Heavy GI)", cur: 412, prev: 507, mom: -18.7, share: 14 },
    { product: "P", label: "P (Pipe)", cur: 341, prev: 331, mom: 2.9, share: 12 },
    { product: "RS", label: "RS (Roofing Sheet)", cur: 0.5, prev: 2, mom: -75, share: 0 },
    { product: "SS", label: "SS (Stainless Steel)", cur: 282, prev: 362, mom: -22.1, share: 10 }
  ],
  states: [
    { state: "WEST BENGAL", cur: 541, prev: 688, mom: -21.4, share: 19, drop: 147, riskScore: 72, products: [{ product: "IG", cur: 180, prev: 250, mom: -28 }, { product: "GI", cur: 200, prev: 210, mom: -4.8 }, { product: "HGI", cur: 80, prev: 120, mom: -33.3 }, { product: "SS", cur: 81, prev: 108, mom: -25 }] },
    { state: "BIHAR", cur: 388, prev: 474, mom: -18.2, share: 14, drop: 86, riskScore: 65, products: [{ product: "IG", cur: 140, prev: 170, mom: -17.6 }, { product: "GI", cur: 120, prev: 130, mom: -7.7 }, { product: "HGI", cur: 68, prev: 94, mom: -27.7 }] },
    { state: "ODISHA", cur: 271, prev: 307, mom: -11.7, share: 10, drop: 36, riskScore: 48, products: [{ product: "IG", cur: 90, prev: 100, mom: -10 }, { product: "GI", cur: 100, prev: 110, mom: -9.1 }] },
    { state: "JHARKHAND", cur: 193, prev: 213, mom: -9.3, share: 7, drop: 20, riskScore: 42, products: [{ product: "IG", cur: 70, prev: 80, mom: -12.5 }, { product: "P", cur: 60, prev: 55, mom: 9.1 }] },
    { state: "ASSAM", cur: 147, prev: 157, mom: -6.1, share: 5, drop: 10, riskScore: 28, products: [{ product: "GI", cur: 80, prev: 85, mom: -5.9 }] },
    { state: "UTTAR PRADESH", cur: 420, prev: 380, mom: 10.5, share: 15, drop: -40, riskScore: 12, products: [{ product: "GI", cur: 200, prev: 170, mom: 17.6 }, { product: "P", cur: 120, prev: 110, mom: 9.1 }] },
    { state: "CHHATTISGARH", cur: 310, prev: 295, mom: 5.1, share: 11, drop: -15, riskScore: 15, products: [{ product: "IG", cur: 130, prev: 120, mom: 8.3 }] },
    { state: "MADHYA PRADESH", cur: 180, prev: 190, mom: -5.3, share: 6, drop: 10, riskScore: 30, products: [{ product: "SS", cur: 80, prev: 100, mom: -20 }] }
  ],
  districts: [
    { district: "KOLKATA", state: "WEST BENGAL", cur: 180, prev: 250, mom: -28, drop: 70, riskScore: 78, products: [{ product: "IG", cur: 60, prev: 90, mom: -33.3 }, { product: "HGI", cur: 40, prev: 70, mom: -42.9 }] },
    { district: "HOWRAH", state: "WEST BENGAL", cur: 120, prev: 160, mom: -25, drop: 40, riskScore: 65, products: [{ product: "GI", cur: 50, prev: 70, mom: -28.6 }] },
    { district: "PATNA", state: "BIHAR", cur: 140, prev: 190, mom: -26.3, drop: 50, riskScore: 68, products: [{ product: "IG", cur: 50, prev: 70, mom: -28.6 }, { product: "HGI", cur: 30, prev: 50, mom: -40 }] },
    { district: "MUZAFFARPUR", state: "BIHAR", cur: 90, prev: 110, mom: -18.2, drop: 20, riskScore: 50, products: [{ product: "GI", cur: 40, prev: 50, mom: -20 }] },
    { district: "CUTTACK", state: "ODISHA", cur: 85, prev: 100, mom: -15, drop: 15, riskScore: 45, products: [{ product: "IG", cur: 35, prev: 40, mom: -12.5 }] },
    { district: "RANCHI", state: "JHARKHAND", cur: 70, prev: 90, mom: -22.2, drop: 20, riskScore: 55, products: [{ product: "IG", cur: 30, prev: 40, mom: -25 }] },
    { district: "GUWAHATI", state: "ASSAM", cur: 60, prev: 65, mom: -7.7, drop: 5, riskScore: 25, products: [{ product: "GI", cur: 30, prev: 33, mom: -9.1 }] },
    { district: "LUCKNOW", state: "UTTAR PRADESH", cur: 150, prev: 130, mom: 15.4, drop: -20, riskScore: 10, products: [{ product: "GI", cur: 80, prev: 65, mom: 23.1 }] },
    { district: "RAIPUR", state: "CHHATTISGARH", cur: 140, prev: 130, mom: 7.7, drop: -10, riskScore: 12, products: [{ product: "IG", cur: 70, prev: 60, mom: 16.7 }] },
    { district: "BHOPAL", state: "MADHYA PRADESH", cur: 80, prev: 90, mom: -11.1, drop: 10, riskScore: 35, products: [{ product: "SS", cur: 30, prev: 40, mom: -25 }] }
  ],
  dealers: [
    { client: "Ramesh Traders", state: "WEST BENGAL", district: "KOLKATA", cur: 0, prev: 45, mom: -100, drop: 45, riskScore: 90, isInactive: true, products: [{ product: "IG", prev: 25, cur: 0, mom: -100 }, { product: "HGI", prev: 20, cur: 0, mom: -100 }] },
    { client: "Sharma Steel Mart", state: "BIHAR", district: "PATNA", cur: 12, prev: 38, mom: -68.4, drop: 26, riskScore: 78, isInactive: false, products: [{ product: "IG", cur: 5, prev: 18, mom: -72.2 }, { product: "HGI", cur: 7, prev: 20, mom: -65 }] },
    { client: "Gupta Iron Works", state: "JHARKHAND", district: "RANCHI", cur: 0, prev: 28, mom: -100, drop: 28, riskScore: 85, isInactive: true, products: [{ product: "IG", prev: 15, cur: 0, mom: -100 }] },
    { client: "Bengal Steel Hub", state: "WEST BENGAL", district: "HOWRAH", cur: 18, prev: 40, mom: -55, drop: 22, riskScore: 72, isInactive: false, products: [{ product: "GI", cur: 10, prev: 25, mom: -60 }] },
    { client: "Patna Steel Depot", state: "BIHAR", district: "PATNA", cur: 0, prev: 22, mom: -100, drop: 22, riskScore: 82, isInactive: true, products: [{ product: "IG", prev: 12, cur: 0, mom: -100 }] },
    { client: "Eastern Metals", state: "WEST BENGAL", district: "KOLKATA", cur: 85, prev: 90, mom: -5.6, drop: 5, riskScore: 20, isInactive: false, products: [{ product: "GI", cur: 50, prev: 52, mom: -3.8 }] },
    { client: "Odisha Iron House", state: "ODISHA", district: "CUTTACK", cur: 25, prev: 35, mom: -28.6, drop: 10, riskScore: 55, isInactive: false, products: [{ product: "IG", cur: 12, prev: 18, mom: -33.3 }] },
    { client: "Assam Steel Center", state: "ASSAM", district: "GUWAHATI", cur: 30, prev: 32, mom: -6.3, drop: 2, riskScore: 18, isInactive: false, products: [{ product: "GI", cur: 15, prev: 16, mom: -6.3 }] },
    { client: "UP Steel Solutions", state: "UTTAR PRADESH", district: "LUCKNOW", cur: 65, prev: 50, mom: 30, drop: -15, riskScore: 5, isInactive: false, products: [{ product: "GI", cur: 35, prev: 25, mom: 40 }] },
    { client: "Raipur Metal Works", state: "CHHATTISGARH", district: "RAIPUR", cur: 55, prev: 48, mom: 14.6, drop: -7, riskScore: 8, isInactive: false, products: [{ product: "IG", cur: 30, prev: 25, mom: 20 }] },
    { client: "Kolkata Iron Palace", state: "WEST BENGAL", district: "KOLKATA", cur: 42, prev: 55, mom: -23.6, drop: 13, riskScore: 52, isInactive: false, products: [{ product: "SS", cur: 20, prev: 30, mom: -33.3 }] },
    { client: "Bihar Metal House", state: "BIHAR", district: "MUZAFFARPUR", cur: 35, prev: 45, mom: -22.2, drop: 10, riskScore: 48, isInactive: false, products: [{ product: "GI", cur: 18, prev: 25, mom: -28 }] }
  ],
  alerts: [
    { severity: "CRITICAL", category: "DEALER", title: "Ramesh Traders — Kolkata, WB: 100% drop", detail: "8 Apr – 8 May: 0 MT | 8 Mar – 8 Apr: 45 MT | ▼ 45 MT lost", hasAlert: true, data: { client: "Ramesh Traders", cur: 0, prev: 45, mom: -100 } },
    { severity: "CRITICAL", category: "DEALER", title: "Gupta Iron Works — Ranchi, JH: 100% drop", detail: "8 Apr – 8 May: 0 MT | 8 Mar – 8 Apr: 28 MT | ▼ 28 MT lost", hasAlert: true, data: { client: "Gupta Iron Works", cur: 0, prev: 28, mom: -100 } },
    { severity: "CRITICAL", category: "DEALER", title: "Patna Steel Depot — Patna, BR: 100% drop", detail: "8 Apr – 8 May: 0 MT | 8 Mar – 8 Apr: 22 MT | ▼ 22 MT lost", hasAlert: true, data: { client: "Patna Steel Depot", cur: 0, prev: 22, mom: -100 } },
    { severity: "HIGH", category: "STATE", title: "WEST BENGAL: 21.4% MoM drop — 19% of total", detail: "Cur: 541 MT | Prev: 688 MT | ▼ 147 MT lost", hasAlert: true, data: { state: "WEST BENGAL", cur: 541, prev: 688, mom: -21.4 } },
    { severity: "HIGH", category: "PRODUCT", title: "SS (Stainless Steel): 22.1% drop", detail: "Cur: 282 MT | Prev: 362 MT | ▼ 80 MT lost | Share: 10%", hasAlert: true, data: { product: "SS", cur: 282, prev: 362, mom: -22.1 } },
    { severity: "HIGH", category: "PRODUCT", title: "HGI (Heavy GI): 18.7% drop", detail: "Cur: 412 MT | Prev: 507 MT | ▼ 95 MT lost | Share: 14%", hasAlert: true, data: { product: "HGI", cur: 412, prev: 507, mom: -18.7 } },
    { severity: "HIGH", category: "STATE", title: "BIHAR: 18.2% MoM drop — 14% of total", detail: "Cur: 388 MT | Prev: 474 MT | ▼ 86 MT lost", hasAlert: true, data: { state: "BIHAR", cur: 388, prev: 474, mom: -18.2 } },
    { severity: "HIGH", category: "DEALER", title: "Sharma Steel Mart — Patna, BR: 68.4% drop", detail: "Cur: 12 MT | Prev: 38 MT | ▼ 26 MT lost", hasAlert: true, data: { client: "Sharma Steel Mart", cur: 12, prev: 38, mom: -68.4 } },
    { severity: "HIGH", category: "DEALER", title: "Bengal Steel Hub — Howrah, WB: 55% drop", detail: "Cur: 18 MT | Prev: 40 MT | ▼ 22 MT lost", hasAlert: true, data: { client: "Bengal Steel Hub", cur: 18, prev: 40, mom: -55 } },
    { severity: "HIGH", category: "DISTRICT", title: "KOLKATA, WEST BENGAL: 28% MoM drop", detail: "Cur: 180 MT | Prev: 250 MT | ▼ 70 MT lost", hasAlert: true, data: { district: "KOLKATA", state: "WEST BENGAL", cur: 180, prev: 250, mom: -28 } },
    { severity: "MEDIUM", category: "PRODUCT", title: "IG (Iron Gate): 12.3% drop", detail: "Cur: 633 MT | Prev: 722 MT | ▼ 89 MT lost | Share: 22%", hasAlert: true, data: { product: "IG", cur: 633, prev: 722, mom: -12.3 } },
    { severity: "MEDIUM", category: "STATE", title: "ODISHA: 11.7% MoM drop", detail: "Cur: 271 MT | Prev: 307 MT | ▼ 36 MT lost", hasAlert: true, data: { state: "ODISHA", cur: 271, prev: 307, mom: -11.7 } }
  ],
  intelligence: {
    executive_summary: "May 2026 dispatch declined 8.0% MoM to 2,847.5 MT, driven primarily by SS product (-22.1%) and HGI (-18.7%) weakness concentrated in West Bengal and Bihar. Three dealers are flagged CRITICAL with zero activity this cycle. GI and Pipe segments show resilience with positive growth, partially offsetting the decline. Immediate intervention required in West Bengal channel where top-3 dealers represent 61% of state volume, creating dangerous concentration risk.",
    root_cause_analysis: [
      { dimension: "PRODUCT", finding: "SS segment supply allocation shortfall — 80 MT volume loss from 362 to 282 MT", impact_mt: 80, pct_of_total_decline: 31 },
      { dimension: "STATE", finding: "West Bengal region dropped 147 MT due to 3 inactive dealers and HGI product weakness", impact_mt: 147, pct_of_total_decline: 58 },
      { dimension: "DEALER", finding: "HGI dealer churn in Bihar corridor — Sharma Steel Mart and Patna Steel Depot combined loss of 48 MT", impact_mt: 48, pct_of_total_decline: 19 },
      { dimension: "DISTRICT", finding: "Kolkata district alone accounts for 70 MT drop with Ramesh Traders going fully inactive", impact_mt: 70, pct_of_total_decline: 28 }
    ],
    dealer_risks: [
      { dealer: "Ramesh Traders", district: "KOLKATA", state: "WEST BENGAL", risk_type: "INACTIVE", recommended_action: "RSM to call within 24 hours — confirm pipeline and reactivation plan" },
      { dealer: "Gupta Iron Works", district: "RANCHI", state: "JHARKHAND", risk_type: "INACTIVE", recommended_action: "ASM site visit this week — assess competitor switching risk" },
      { dealer: "Patna Steel Depot", district: "PATNA", state: "BIHAR", risk_type: "INACTIVE", recommended_action: "Immediate call by Bihar RSM — check credit/payment issues" },
      { dealer: "Sharma Steel Mart", district: "PATNA", state: "BIHAR", risk_type: "DECLINING", recommended_action: "Offer volume incentive — prevent full churn by end of cycle" },
      { dealer: "Bengal Steel Hub", district: "HOWRAH", state: "WEST BENGAL", risk_type: "DECLINING", recommended_action: "Sales Manager to review product mix — shift to GI/Pipe" }
    ],
    geographic_insights: "Eastern corridor (WB + Bihar + Jharkhand) accounts for 78% of total volume decline. West Bengal concentration risk is critical — top 3 dealers = 61% of state volume. Bihar HGI channel is destabilizing with 2 of top 5 dealers inactive or declining. Positive growth in UP (+10.5%) and Chhattisgarh (+5.1%) partially compensates but insufficient to offset eastern losses.",
    recommended_actions: [
      { priority: "IMMEDIATE", action: "Call all 3 CRITICAL dealers within 24hrs — confirm order pipeline status", owner: "RSM / Zonal Head", deadline_hint: "24h" },
      { priority: "IMMEDIATE", action: "Investigate SS product dispatch bottleneck — check plant allocation logs", owner: "Plant Operations", deadline_hint: "24h" },
      { priority: "HIGH", action: "Push 1,203 MT pending WB orders to dispatch — prioritize before month-end", owner: "Sales + Dispatch", deadline_hint: "48h" },
      { priority: "HIGH", action: "Onboard 2 backup dealers in Patna — reduce HGI concentration risk", owner: "Business Development", deadline_hint: "This week" },
      { priority: "MEDIUM", action: "Review Bihar territory allocation — consider ASM rotation for underperforming zones", owner: "Sales Manager", deadline_hint: "End of cycle" },
      { priority: "MEDIUM", action: "Analyze UP growth drivers — replicate successful GI strategy in other states", owner: "Strategy", deadline_hint: "End of cycle" }
    ],
    escalation_flags: [
      "3 CRITICAL dealers at zero dispatch — immediate RSM escalation required",
      "SS product dispatch -22.1% — check supply chain / allocation bottleneck",
      "WB region concentration risk: top-3 dealers = 61% of state volume"
    ]
  },
  intel: {
    inactiveDealers: [
      { client: "Ramesh Traders", district: "KOLKATA", state: "WEST BENGAL", prevVolume: 45, products: "IG, HGI" },
      { client: "Gupta Iron Works", district: "RANCHI", state: "JHARKHAND", prevVolume: 28, products: "IG" },
      { client: "Patna Steel Depot", district: "PATNA", state: "BIHAR", prevVolume: 22, products: "IG" }
    ],
    inactiveDealerCount: 3,
    top3DealerShare: 61,
    top3DealerNames: ["Eastern Metals", "Ramesh Traders", "UP Steel Solutions"],
    concentrationRisk: "HIGH",
    hasDispatchBottleneck: true,
    dispatchOrderGapPct: 42,
    totalDrop: 253.7,
    scoredStates: [
      { state: "WEST BENGAL", cur: 541, prev: 688, mom: -21.4, share: 19, drop: 147, riskScore: 72 },
      { state: "BIHAR", cur: 388, prev: 474, mom: -18.2, share: 14, drop: 86, riskScore: 65 },
      { state: "ODISHA", cur: 271, prev: 307, mom: -11.7, share: 10, drop: 36, riskScore: 48 }
    ],
    scoredDistricts: [
      { district: "KOLKATA", state: "WEST BENGAL", cur: 180, prev: 250, mom: -28, drop: 70, riskScore: 78 },
      { district: "PATNA", state: "BIHAR", cur: 140, prev: 190, mom: -26.3, drop: 50, riskScore: 68 },
      { district: "HOWRAH", state: "WEST BENGAL", cur: 120, prev: 160, mom: -25, drop: 40, riskScore: 65 }
    ],
    scoredDealers: [
      { client: "Ramesh Traders", state: "WEST BENGAL", district: "KOLKATA", cur: 0, prev: 45, mom: -100, riskScore: 90, isInactive: true },
      { client: "Gupta Iron Works", state: "JHARKHAND", district: "RANCHI", cur: 0, prev: 28, mom: -100, riskScore: 85, isInactive: true },
      { client: "Sharma Steel Mart", state: "BIHAR", district: "PATNA", cur: 12, prev: 38, mom: -68.4, riskScore: 78, isInactive: false }
    ],
    declineDrivers: [
      { type: "STATE", name: "WEST BENGAL", drop: 147, pctOfTotal: 58 },
      { type: "STATE", name: "BIHAR", drop: 86, pctOfTotal: 34 },
      { type: "DISTRICT", name: "KOLKATA, WEST BENGAL", drop: 70, pctOfTotal: 28 }
    ]
  }
};
