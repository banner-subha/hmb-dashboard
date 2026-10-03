#!/usr/bin/env node
/**
 * HMB-DASHBOARD EVAL HARNESS
 *
 * Automated regression & accuracy evaluation runner for frontend math,
 * financial formatting, aging buckets, and data normalizers.
 *
 * Usage:
 *   node eval/run_eval.js                  # Run full eval suite
 *   node eval/run_eval.js --suite=aging    # Run specific suite (aging|outstanding|geo|trends|formatters|weeks|signals)
 *   node eval/run_eval.js --verbose        # Show detailed assertion-by-assertion logs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Utilities under evaluation
import * as agingUtil from '../src/utils/backlogAging.js';
import * as outstandingUtil from '../src/utils/outstanding.js';
import * as geoUtil from '../src/utils/districtNormalizer.js';
import * as trendUtil from '../src/utils/trendEngine.js';
import * as formatUtil from '../src/utils/formatters.js';
import * as weekUtil from '../src/utils/visitWeeks.js';
import * as account360Util from '../src/utils/account360.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Terminal color helpers
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// Parse command line arguments
const args = process.argv.slice(2);
const suiteFilter = (args.find(a => a.startsWith('--suite=')) || '').replace('--suite=', '').toLowerCase();
const isVerbose = args.includes('--verbose') || args.includes('-v');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${colors.bold}HMB Dashboard Eval Harness${colors.reset}
Usage:
  node eval/run_eval.js [options]

Options:
  --suite=<name>    Run specific suite: aging | outstanding | geo | trends | formatters | weeks | signals
  --verbose, -v     Print all passed assertions
  --help, -h        Show this help message
`);
  process.exit(0);
}

// Load benchmark fixtures
const fixturesPath = path.join(__dirname, 'fixtures.json');
let fixtures;
try {
  fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
} catch (err) {
  console.error(`${colors.red}Failed to read fixtures.json: ${err.message}${colors.reset}`);
  process.exit(1);
}

// Test runner state
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function assert(condition, name, got, expected, suiteName) {
  totalTests++;
  if (condition) {
    passedTests++;
    if (isVerbose) {
      console.log(`  ${colors.green}✔${colors.reset} ${colors.gray}${name}${colors.reset}`);
    }
  } else {
    failedTests++;
    const detail = { suiteName, name, got, expected };
    failureDetails.push(detail);
    console.log(`  ${colors.red}✖${colors.reset} ${colors.bold}${name}${colors.reset}`);
    console.log(`    ${colors.red}Got:     ${JSON.stringify(got)}${colors.reset}`);
    console.log(`    ${colors.green}Expected:${JSON.stringify(expected)}${colors.reset}`);
  }
}

function assertDeepEqual(got, expected, name, suiteName) {
  const g = JSON.stringify(got);
  const e = JSON.stringify(expected);
  assert(g === e, name, got, expected, suiteName);
}

// ============================================================================
// SUITE 1: BACKLOG AGING
// ============================================================================
function runAgingSuite() {
  console.log(`\n${colors.cyan}${colors.bold}▶ Suite: Backlog Aging & Buckets${colors.reset}`);
  const { bucket_days, history_to_aging, entity_aggregation } = fixtures.backlog_aging;

  // 1. Day-to-bucket classification
  for (const tc of bucket_days) {
    const got = agingUtil.bucketForAgeDays(tc.days);
    assert(got === tc.expected, `bucketForAgeDays(${tc.days}) → ${tc.expected}`, got, tc.expected, 'Aging');
  }

  // 2. Month-end offset derived aging
  for (const tc of history_to_aging) {
    const got = agingUtil.agingFromPendingHistory(tc.pendingHistory, tc.asOfDate);
    assertDeepEqual(got, tc.expected, tc.description, 'Aging');
  }

  // 3. Multi-entity aggregation
  for (const tc of entity_aggregation) {
    const got = agingUtil.aggregateAging(tc.entities);
    assertDeepEqual(got, tc.expectedTotal, 'aggregateAging() multi-entity rollup', 'Aging');
  }
}

// ============================================================================
// SUITE 2: OUTSTANDING RECEIVABLES
// ============================================================================
function runOutstandingSuite() {
  console.log(`\n${colors.cyan}${colors.bold}▶ Suite: Outstanding Receivables & Currency Math${colors.reset}`);
  const { format_inr, format_inr_full, state_normalization, severity_age, book_invariants } = fixtures.outstanding_receivables;

  // 1. INR formatting (crores, lakhs, thousands, negatives)
  for (const tc of format_inr) {
    const got = outstandingUtil.formatINR(tc.input);
    assert(got === tc.expected, `formatINR(${tc.input}) → ${tc.expected}`, got, tc.expected, 'Outstanding');
  }

  // 2. Full Indian numbering grouping
  for (const tc of format_inr_full) {
    const got = outstandingUtil.formatINRFull(tc.input);
    assert(got === tc.expected, `formatINRFull(${tc.input}) → ${tc.expected}`, got, tc.expected, 'Outstanding');
  }

  // 3. State name normalization
  for (const tc of state_normalization) {
    const got = outstandingUtil.normalizeState(tc.input);
    assert(got === tc.expected, `normalizeState("${tc.input}") → "${tc.expected}"`, got, tc.expected, 'Outstanding');
  }

  // 4. Overdue severity brackets
  for (const tc of severity_age) {
    const got = outstandingUtil.getOverdueSeverity(tc.days).key;
    assert(got === tc.expectedKey, `getOverdueSeverity(${tc.days}).key → ${tc.expectedKey}`, got, tc.expectedKey, 'Outstanding');
  }

  // 5. Book preparation and invariant checks (paisa-exact ledger math)
  const prepared = outstandingUtil.prepareBook(book_invariants.dealers);
  const summary = outstandingUtil.summarizeBook(prepared);
  const exp = book_invariants.expectedSummary;

  assert(summary.total === exp.total, 'summarizeBook: exact total ledger balance', summary.total, exp.total, 'Outstanding');
  assert(summary.credit === exp.credit, 'summarizeBook: credit balance sum', summary.credit, exp.credit, 'Outstanding');
  assert(summary.bills === exp.bills, 'summarizeBook: bills = net - credit invariant', summary.bills, exp.bills, 'Outstanding');
  assert(summary.bills90 === exp.bills90, 'summarizeBook: bills overdue >90d', summary.bills90, exp.bills90, 'Outstanding');
  assert(summary.dealerCount === exp.dealerCount, 'summarizeBook: dealer count', summary.dealerCount, exp.dealerCount, 'Outstanding');
  assert(summary.voucherCount === exp.voucherCount, 'summarizeBook: voucher count', summary.voucherCount, exp.voucherCount, 'Outstanding');
  assert(summary.creditCount === exp.creditCount, 'summarizeBook: credit count', summary.creditCount, exp.creditCount, 'Outstanding');
}

// ============================================================================
// SUITE 3: DISTRICT & STATE NORMALIZATION
// ============================================================================
function runGeoSuite() {
  console.log(`\n${colors.cyan}${colors.bold}▶ Suite: District & Entity Geo Normalization${colors.reset}`);
  const { slugs, aliases } = fixtures.district_normalization;

  // 1. Slug generator
  for (const tc of slugs) {
    const got = geoUtil.distSlug(tc.input);
    assert(got === tc.expected, `distSlug("${tc.input}") → "${tc.expected}"`, got, tc.expected, 'Geo');
  }

  // 2. Canonical district alias mapping & typo correction
  for (const tc of aliases) {
    const got = geoUtil.normalizeDistrict(tc.input);
    assert(got === tc.expected, `normalizeDistrict("${tc.input}") → "${tc.expected}"`, got, tc.expected, 'Geo');
  }
}

// ============================================================================
// SUITE 4: TRENDS & MOM CALCULATIONS
// ============================================================================
function runTrendSuite() {
  console.log(`\n${colors.cyan}${colors.bold}▶ Suite: Trend Engine & MoM Calculations${colors.reset}`);
  const { mom_calculations, severity_thresholds } = fixtures.trends_and_mom;

  // 1. MoM change percentage with clamping
  for (const tc of mom_calculations) {
    const got = trendUtil.calculateMoM(tc.cur, tc.prev);
    assert(got === tc.expected, `calculateMoM(${tc.cur}, ${tc.prev}) → ${tc.expected}%`, got, tc.expected, 'Trends');
  }

  // 2. Severity tier mapping
  for (const tc of severity_thresholds) {
    const got = trendUtil.getSeverityFromImpactScore(tc.score);
    assert(got === tc.expected, `getSeverityFromImpactScore(${tc.score}) → ${tc.expected}`, got, tc.expected, 'Trends');
  }
}

// ============================================================================
// SUITE 5: FORMATTERS
// ============================================================================
function runFormattersSuite() {
  console.log(`\n${colors.cyan}${colors.bold}▶ Suite: Display & Metric Formatters${colors.reset}`);
  const { tonnage, dates } = fixtures.formatters;

  // 1. Tonnage formatting with precision
  for (const tc of tonnage) {
    const got = formatUtil.formatMT(tc.input, tc.decimals);
    assert(got === tc.expected, `formatMT(${tc.input}, ${tc.decimals}) → "${tc.expected}"`, got, tc.expected, 'Formatters');
  }

  // 2. Date label formatting
  for (const tc of dates) {
    const got = formatUtil.formatDayLabel(tc.input);
    assert(got === tc.expected, `formatDayLabel("${tc.input}") → "${tc.expected}"`, got, tc.expected, 'Formatters');
  }
}

// ============================================================================
// SUITE 6: VISIT WEEKS
// ============================================================================
function runWeeksSuite() {
  console.log(`\n${colors.cyan}${colors.bold}▶ Suite: Visit Calendar & Week Windowing${colors.reset}`);
  const { spans, week_indices } = fixtures.visit_weeks;

  // 1. Calendar week blocks
  for (const tc of spans) {
    const got = weekUtil.monthWeeks(tc.ym).map(x => `${x.from.slice(8)}-${x.to.slice(8)}`);
    assertDeepEqual(got, tc.expected, `monthWeeks("${tc.ym}") blocks`, 'Weeks');
  }

  // 2. Date to week index
  for (const tc of week_indices) {
    const got = weekUtil.monthWeekOf(tc.date).idx;
    assert(got === tc.expectedIdx, `monthWeekOf("${tc.date}").idx → ${tc.expectedIdx}`, got, tc.expectedIdx, 'Weeks');
  }
}

// ============================================================================
// SUITE 7: ACCOUNT 360 SIGNALS
// ============================================================================
function runSignalsSuite() {
  console.log(`
${colors.cyan}${colors.bold}▶ Suite: Account 360 Signals${colors.reset}`);
  for (const tc of fixtures.account360_signals) {
    const got = account360Util.computeSignal(tc.record)?.key ?? null;
    assert(got === tc.expected, `computeSignal: ${tc.name} → ${tc.expected}`, got, tc.expected, 'Signals');
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================
const startTime = performance.now();

console.log(`${colors.bold}======================================================${colors.reset}`);
console.log(`${colors.bold}       HMB-DASHBOARD ACCURACY & EVAL HARNESS          ${colors.reset}`);
console.log(`${colors.bold}======================================================${colors.reset}`);

const suites = [
  { id: 'aging', fn: runAgingSuite },
  { id: 'outstanding', fn: runOutstandingSuite },
  { id: 'geo', fn: runGeoSuite },
  { id: 'trends', fn: runTrendSuite },
  { id: 'formatters', fn: runFormattersSuite },
  { id: 'weeks', fn: runWeeksSuite },
  { id: 'signals', fn: runSignalsSuite },
];

for (const suite of suites) {
  if (!suiteFilter || suiteFilter === suite.id) {
    suite.fn();
  }
}

const duration = (performance.now() - startTime).toFixed(1);
const accuracyPct = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;

console.log(`\n${colors.bold}======================================================${colors.reset}`);
console.log(`${colors.bold}EVAL SUMMARY${colors.reset}`);
console.log(`------------------------------------------------------`);
console.log(`Total Assertions: ${totalTests}`);
console.log(`Passed:           ${colors.green}${passedTests}${colors.reset}`);
console.log(`Failed:           ${failedTests > 0 ? colors.red : colors.gray}${failedTests}${colors.reset}`);
console.log(`Accuracy:         ${failedTests === 0 ? colors.green : colors.yellow}${accuracyPct}%${colors.reset}`);
console.log(`Execution Time:   ${duration} ms`);
console.log(`${colors.bold}======================================================${colors.reset}`);

if (failedTests > 0) {
  console.log(`\n${colors.red}${colors.bold}❌ EVAL HARNESS FAILED (${failedTests} defects detected)${colors.reset}\n`);
  process.exit(1);
} else {
  console.log(`\n${colors.green}${colors.bold}✔ ALL EVAL CHECKS PASSED (100% data integrity verified)${colors.reset}\n`);
  process.exit(0);
}
