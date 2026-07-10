# Walkthrough — Risk Tab Overhaul & Filter Isolation

We have successfully rebuilt the **Alert Intelligence Risk Tab** logic, separated the filters between the tabs, and resolved the Vite compile/transform issue caused by leftover code chunks.

## Changes Implemented

### 1. Pending Order Risk Scoring Engine
- Implemented `computePendingRiskScore()` inside [AlertIntelligence.jsx](file:///c:/Users/admin/Documents/AntiGravity%20Agent/hmb-dashboard/src/pages/AlertIntelligence.jsx).
- Custom business-grade scoring metrics:
  - **Backlog Age (35% weight)**: Days since the oldest pending order month.
  - **Fulfillment Ratio (25% weight)**: Pending volume relative to monthly dispatch capacity.
  - **Dispatch Inactivity (20% weight)**: Zero dispatch activity with pending volume defaults to higher score floor.
  - **Pending Volume Absolute (10% weight)**: MT size of pending order backlog.
  - **Multi-month Accumulation (10% weight)**: Months of consecutive pending orders.
- Dynamic severity thresholds map scores to **CRITICAL**, **HIGH**, **MEDIUM**, or **LOW** levels.

### 2. Isolated Severity Filters
- Split `selectedSeverity` state into:
  - `dispatchSeverityFilter` for the **Dispatch** tab (filtering by MoM drop).
  - `riskSeverityFilter` for the **Risk** tab (filtering by pending risk severity).
- Selecting a filter in one tab does not cross-contaminate or filter the data on the other tab.
- Integrated independent counting lists (`dispatchCounts` and `riskCounts`).
- Resolved a `NaN` calculation bug on the "Risk Dealers" total active count chip by changing the summation calculation from `riskCounts.stable` to the sum of all four valid severity levels (`critical` + `high` + `medium` + `low`).

### 3. Expanded Dealer Risk Detail Panel
- Completely redesigned `renderRiskDetail()` to focus solely on pending metrics:
  - **Fulfillment Ratio**, **Months Pending**, **Clearance Estimates (in days)**, and **Risk Score**.
  - **Order Aging Breakdown**: Month-by-month bar segments showing exactly when order accumulation started.
  - **Business-grade Recommendation text**: Operational advice tailored to backlog age and volume.
- Removed the old `"White dot = this dealer · Position relative to all risk dealers"` text label.
- Larger scatter chart (**height: 360px** instead of 220px) plotted against pending-specific axes: **Backlog Age (X)** and **Pending Volume (Y)**.

---

## Visual & Functional Verification

### 1. Main Dashboard & Risk Tab
The dashboard loads successfully, and the independent filter counts are shown dynamically on the KPI cards.
![Main Alerts Page Loaded](/c:\Users\admin\.gemini\antigravity-ide\brain\31ec79ca-8401-4639-b8ab-976da5ef2822\alerts_page_loaded_1783663951833.png)

### 2. Expanded Dealer Risk Profile
Expanding a dealer under the Risk tab displays the new Pending Order Risk Profile, Clearance Estimates, Month-by-Month Order Aging Breakdown, and the updated scatter plot.
![Dealer Risk Expanded Details](/c:\Users\admin\.gemini\antigravity-ide\brain\31ec79ca-8401-4639-b8ab-976da5ef2822\dealer_risk_expanded_1783664020369.png)

### 3. Second Dealer Check (RAHMAN ENTERPRISE)
Verification of multiple accordion selections confirming clean layout expansion, notes, and recommendation integration.
![RAHMAN ENTERPRISE Expanded](/c:\Users\admin\.gemini\antigravity-ide\brain\31ec79ca-8401-4639-b8ab-976da5ef2822\second_dealer_risk_expanded_1783664047649.png)

---

## Verification Summary
- **Vite Build**: Successfully completed production compile verification (`npm run build`).
- **Functional Testing**: Verified tab switching, pagination, location searches, note saving/deleting, and isolated severity selectors in Chrome.
