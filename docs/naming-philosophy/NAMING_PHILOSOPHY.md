# HMB Dashboard - Naming Philosophy

> **The RSM Test:** Every label must pass this check — if a senior Regional Sales Manager who has never touched a dashboard can read it and immediately know what it means for their business, it passes. If they need a glossary — it fails.

---

## The Core Principle

**Write for someone who sells steel, not someone who builds software.**

Users think in terms of:
- "Are we dispatching enough this month?"
- "Which areas are behind?"
- "Which dealers are going silent?"
- "What action do I take today?"

Every label, header, badge, and tooltip must speak in those terms.

---

## The Naming Balance: 70/30

**70% Business-Friendly** — words a sales manager uses daily.
**30% Slight Technical** — industry-standard terms like "Dispatch", "MT", "Clearance", "Backlog", "Daily Rate". These are acceptable because they are field-native, not software/math jargon.

---

## 4 Naming Laws

### Law 1 - No Storytelling in Titles
Titles must be nouns or noun phrases — not sentences or questions.
- Avoid: "What's Driving Performance", "How Fast We're Delivering", "What Went Wrong"
- Use: "Performance Drivers", "Delivery Speed", "Issue Breakdown"

### Law 2 - No Standalone Abbreviations
Never use `MoM`, `MTD`, `YTD`, `KPI`, `pct`, `vol` alone.
Always add context: "vs Last Month", "This Month So Far", "Year to Date".

### Law 3 - Numbers Must Explain Themselves
A number without a plain label is useless.
- Bad: `712 MT/day` labeled "Target Baseline"
- Good: `712 MT/day` labeled "Daily Target Dispatch"

### Law 4 - Lead With the Business Outcome
Users do not need to know how a number is calculated. They need to know what it means.
- "3-Month Historical Avg" becomes "Based on last 3 months"
- "Root Cause Analysis" becomes "Issue Breakdown"
- "Diagnostic Engine (4D)" becomes "AI Analysis Engine"

---

## Final Approved Label Map

### KPI Cards (Top Row)

| Label | Subtitle |
|---|---|
| Dispatched This Month | vs Last Month |
| Pending Orders | Awaiting dispatch / No active backlog |
| Avg Delivery Time | Order-to-dispatch avg |
| Active Alerts | Requires attention |
| Active Dealers | Transacting this month |

---

### Card Titles

| Old (Technical) | New (Approved) |
|---|---|
| Macro Volume Trajectory (8-Month) | 8-Month Dispatch History |
| Daily Pace Tracker | Today's Dispatch Pace |
| Order Backlog & Clearance | Pending Orders |
| Root Cause & Insights | Performance Drivers |
| Top Growth Leaders | Best Performing Areas |
| Order Turnaround & Velocity | Delivery Speed |
| MoM Volume Trend | Monthly Volume Trend |
| Product Performance | Volume by Product Type |
| Top Declining States | Regions Falling Behind |
| District Hotspots | Districts at Risk |
| Dealer Impact Alerts | Dealer Alerts |
| AI Executive Summary | AI Business Summary |
| Escalation Flags | Urgent Escalations |
| Recommended Actions | Action Plan |

---

### Stat / Section Labels (Inside Cards)

| Old | Approved |
|---|---|
| Peak Month | Best Month |
| Monthly Avg | Monthly Average |
| Jan-Jul Baseline | Based on Jan-Jul |
| Aug Pace | August So Far |
| Active MTD Cycle | Ongoing this month |
| YTD: X MT | This Year So Far: X MT |
| Q1 Avg Run-Rate | Q1 Monthly Average |
| Q2 Avg Run-Rate | Q2 Monthly Average |
| Enterprise Pipeline Run-Rate | Monthly Dispatch Summary |
| Current Daily Pace | Shipping Per Day (Now) |
| Target Baseline | Daily Target Dispatch |
| Predicted Month Target | This Month's Target |
| N% Reached | N% Done |
| Actual Dispatched | Shipped So Far |
| Monthly Goal | Month Target |
| Required Run Rate | Daily Rate Needed |
| Remaining Gap | Remaining Volume |
| Est. Pipeline Clearance | Est. Clearance Time |
| Burn Capacity | Daily Shipping Capacity |
| Backlog by Product Line | Waiting Orders by Product |
| Backlog Load Ratio | Queue Pressure Ratio |
| Active Backlog Lines | Product Types in Queue |
| Diagnostic Findings | Issue Breakdown |
| N Dimensions | N Areas Identified |
| Key Channel Intervention Flags | Dealers Needing Urgent Attention |
| Intervention: | Next Step: |
| Action: | Action: |
| Product Supply & Market Drivers | Volume Drivers by Product |
| Driver: | Why: |
| Supply Allocation Advisory: | Supply Note: |
| Diagnostic Engine (4D) | AI Analysis Engine |
| Avg Lead Time | Average Delivery Time |
| Order-to-dispatch cycle | From order to dispatch |
| Fulfillment Rate | Orders Cleared |
| Product Turnaround Speed | Delivery Time by Product |
| Fulfillment % | % Cleared |
| Nd avg | N days avg |
| Avg Dealer: N MT | Avg per Dealer: N MT |

---

### Badge / Status Labels

| Old | Approved |
|---|---|
| On Target Pace | On Track |
| Behind Target | Falling Behind |
| Critical Gap | Serious Shortfall |
| INACTIVE | Stopped Ordering |
| DECLINING | Dropping |
| Positive Momentum | Growing |
| N Causes | N Issues |
| N Dimensions | N Areas |
| N Priority Plans | N Actions Ready |
| Active MTD | This Month (MTD) |
| Coverage | Active States |
| vs 7-Mo Avg | vs 7-Month Average |

---

### Tooltip Labels

| Old | Approved |
|---|---|
| Total Dispatched: | Shipped: |
| Despatch Volume: | Shipped: |
| MoM Growth: | Change vs Last Month: |
| vs 7-Mo Avg: | vs 7-Month Average: |

---

### Button Text

| Old | Approved |
|---|---|
| Explore Geo Trajectory | View on Map |
| View AI Insights & Actions | See Full Analysis |
| View All Actions | See All Actions |
| Lead Times | Delivery Details |
| Explore All Growing States | See All Growing States |

---

## Banned Words and Replacements

| Avoid | Use Instead |
|---|---|
| What (in titles) | Use a noun: "Issue Breakdown" not "What Went Wrong" |
| How (in titles) | Use a noun: "Delivery Speed" not "How Fast We're Delivering" |
| We (in titles) | Remove — use direct nouns and metrics |
| Pipeline | Queue / Pending volume |
| Run-Rate | Daily Average / Daily Dispatch Rate |
| Trajectory | Trend / History |
| Baseline | Target / Normal |
| Delta | Difference / Gap |
| Throughput | Volume Shipped |
| Diagnostic | Analysis |
| Root Cause | Issue / Problem |
| Dimension | Area / Category |
| Velocity | Speed |
| At-Risk | Needs Attention |
| Intervention | Next Step |
| Turnaround | Delivery time |

---

## Naming Checklist for New Labels

Before shipping any new label:
1. Is it a noun or noun phrase? (No storytelling sentences)
2. Does it contain What / We / How? (If yes — rewrite)
3. Is it in the banned list?
4. Would an RSM read it and instantly know what metric it represents?
5. Does the number and the label together tell a complete story?

---

*Last updated: August 2026 | Owner: Product / Dashboard Team*
