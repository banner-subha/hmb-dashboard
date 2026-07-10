# Regional Despatch Map Filter Fix & Prevention Guidelines

This document explains what caused the regional choropleth map filter to break for historical months (prior to May 2026), how it was fixed, and how to prevent similar regressions in the future.

---

## 1. What Caused the Issue?

Three separate technical discrepancies combined to break the historical despatch map:

### Issue A: Month Label String Mismatch (Abbreviation vs. Full)
* **The Dropdown**: The frontend month selector dropdown generates values using the 3-letter abbreviated month format: `"Jan 2026"`, `"Feb 2026"`, `"Mar 2026"`, `"Apr 2026"`, etc.
* **The Backend Payload**: The `availableMonths` property inside `latest.json` (produced by n8n) holds labels using the full month name: `"January 2026"`, `"February 2026"`, `"March 2026"`, `"April 2026"`, etc.
* **The Consequence**: A strict string equality check (`dropdownValue === backendLabel`) failed for every month except **May** (since both the abbreviation and full name for May are identical: `"May"`). Because it couldn't find a matching label, it returned `false` for `isMonthAvailable`, triggering the `"Historical Data Coming Soon"` blocker overlay and defaulting the data to `0.00 MT`.

### Issue B: State & District Casing Discrepancies
* **The GeoJSON & Dropdown**: The map visualization components use uppercase state and district identifiers: `"WEST BENGAL"`, `"JHARKHAND"`, `"NADIA"`.
* **The Backend Payload**: The historical slices in `latest.json` (`monthlyHistory['YYYY-MM']`) contain Title Case strings for state names and inconsistent casing for district names: `"West Bengal"`, `"Uttar Pradesh"`, `"Nadia"`, `"GORAKHPUR"`.
* **The Consequence**: Strict comparison (`hs.state === stateName`) failed, returning `0` values even when historical data was found, leaving the map grey.

### Issue C: Current-Period Filter Bias
* The frontend previously compiled map metrics by looping over `propSalesData` (which only contains states and districts active in the **current MTD** or **previous month**).
* If a state/district was active in January–April but had zero sales in June/July, it was completely left out of the loops, making old data slices empty.

---

## 2. What Files Were Changed?

### 📁 `src/pages/GeoIntelligence.jsx`
* **Added `findAvailableMonth`**: Introduced a robust month/year parsing helper that splits the dropdown string, extracts the month name prefix, maps it to a numerical index (e.g., `Apr` $\rightarrow$ `4`), and compares it numerically against the backend `year` and `month` fields.
* **Case-Insensitive Normalization**: Modified all `.find` statements to compare states and districts case-insensitively using `.toLowerCase()` (e.g., matching `"West Bengal"` to `"WEST BENGAL"`).
* **Historical Slices Iteration**: Rewrote `filteredSalesData` to loop over the states/districts present in the selected month's historical snapshot (`historySlice.states` / `historySlice.districts`) rather than `propSalesData`, ensuring all historically active regions show up.
* **Total Volume Scale**: Updated `totalVolume` calculation to dynamically sum product-filtered volumes for the active historical month, rendering correct tooltip shares and color scales.

---

## 3. How to Prevent This in the Future

Follow these guidelines when modifying the n8n data aggregation or React dashboard layout:

### Rule 1: Use Numerical Date/Month Matching
* **Never** rely on string matching for dates or period labels (e.g., `"Apr 2026"` vs. `"April 2026"`). 
* **Always** parse the date parts or match using numerical attributes (`month: 4, year: 2026`), or use a standardized ISO format (`"YYYY-MM"`).

### Rule 2: Enforce Case-Insensitive Geographic Matching
* State and district names entered in ERP systems often contain manual casing variations.
* Always compare geographical names case-insensitively in Javascript:
  ```javascript
  const match = array.find(item => item.state?.toLowerCase() === targetState.toLowerCase());
  ```

### Rule 3: Source Lists Dynamically from the Snapshot
* Avoid filtering state/district arrays based on a secondary subset of "currently active" entities. 
* If displaying historical snapshots, use the snapshot itself as the source of truth for which regions are active, rather than falling back to the current month's layout.
