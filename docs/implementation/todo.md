# Implementation Tasks — Despatch WB Report v12 Migration

- [x] Phase 0: Research node parameters & large file limits (Extract From File xlsx, Dropbox download, Execute Workflow)
- [x] Phase 1: Reconnaissance & ground truth inspection of `NEW DASHBOARD REPORT FORMAT-V2.xlsx` on Dropbox
- [x] Phase 2: Build & configure shared sub-workflow `Despatch Raw MTD Aggregator` (`5kQvT1brZG8eRJq7`)
- [x] Phase 3: Validate MTD row count and spot check rows against legacy `summary_export.csv` (exact 928-row match)
- [x] Phase 4: Wire `Get MTD Despatch Data` into `Despatch WB Report v12` (`4QbgfUVQbo4R5YKw`), disable legacy fetch nodes, patch Code node references
- [x] Phase 5: Validate and verify workflow integrity (0 errors, 100% compliant)
- [x] Phase 6: Session handoff & final report
