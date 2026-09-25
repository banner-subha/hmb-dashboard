/**
 * Comprehensive CSV Export utility for HMB Ispat Intelligence Platform.
 *
 * Implements:
 * - RFC 4180 compliant CSV string generation
 * - Formula injection prevention (guarding =, +, -, @ with ')
 * - UTF-8 Byte Order Mark (\uFEFF) for seamless Microsoft Excel compatibility
 * - Clean commercial formatting (plain business names, 1-decimal tonnages/percentages)
 */

/**
 * Escapes a single cell value for CSV output.
 * Prevents formula injection and quotes strings containing commas, quotes, or newlines.
 */
export function escapeCsvValue(val) {
  if (val == null) return '';
  const str = String(val).trim();
  // Protect against formula injection in spreadsheet applications. A plain
  // negative number (a credit note's amount) cannot run as a formula, and
  // guarding it would turn it into text in Excel.
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(str);
  const guarded = /^[=+\-@]/.test(str) && !isPlainNumber ? `'${str}` : str;
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/**
 * Builds a valid RFC 4180 CSV string with UTF-8 BOM.
 * @param {Array<{ label: string, key?: string, getValue?: (row: any) => any }>} columns
 * @param {Array<any>} rows
 * @returns {string} CSV content prefixed with UTF-8 BOM
 */
export function generateCsv(columns, rows) {
  const headers = columns.map(c => escapeCsvValue(c.label)).join(',');
  const lines = [headers];

  for (const row of rows) {
    const line = columns
      .map(col => {
        const val = col.getValue ? col.getValue(row) : (col.key ? row[col.key] : '');
        return escapeCsvValue(val);
      })
      .join(',');
    lines.push(line);
  }

  // Windows standard CRLF line breaks + UTF-8 BOM for Excel
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Initiates a browser download for generated CSV content.
 * @param {string} filename - Target filename (e.g. "hmb_dealers_filtered_2026-09-16.csv")
 * @param {Array<{ label: string, key?: string, getValue?: (row: any) => any }>} columns
 * @param {Array<any>} rows
 */
export function downloadCsv(filename, columns, rows) {
  const csvContent = generateCsv(columns, rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates an ISO-date-stamped filename with a descriptive slug.
 * Example: `hmb-dealers-filtered-2026-09-16.csv`
 */
export function getExportFilename(prefix, type = 'filtered') {
  const dateStr = new Date().toISOString().slice(0, 10);
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return `hmb_${safePrefix}_${type}_${dateStr}.csv`;
}
