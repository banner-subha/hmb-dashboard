import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, ChevronDown, RotateCcw } from 'lucide-react';
import SearchInput from '../common/SearchInput';
import SkeletonLoader from '../common/SkeletonLoader';
import ExportDropdown from '../common/ExportDropdown';
import LeadTag, { LeadsToggle } from './LeadTag';
import { downloadCsv, getExportFilename } from '../../utils/csvExport';
import { fetchDistrictFabricators } from '../../services/visitService';
import { shapeDistrictFabricators } from '../../utils/districtFabricators';
import { REP_ROLES, classifyRep } from '../../utils/visits';
import { formatDayLabel } from '../../utils/formatters';
import { daysBetween } from '../../utils/visitRange';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

const PAGE = 100;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
// "All districts" reads a whole state and "All states" every state; the RPC
// allows either for 31 days at most (migrations 025, 027), because a state
// over longer spans is too big for anon's 3 s.
const ALL = 'ALL';
const STATE_MAX_DAYS = 31;
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

const ROLE_LABEL = { KRM: 'KRM', KRO: 'KRO' };
const roleLabel = r => ROLE_LABEL[r] || 'Field rep';

const VIEWS = [
  { key: 'fabricators', label: 'Fabricators' },
  { key: 'reps', label: 'By rep' },
];

function RoleTag({ role }) {
  const tag = role === 'KRM' || role === 'KRO' ? role : 'REP';
  return (
    <span data-role={tag} className="role-tag px-1.5 py-0.5 text-[10px]">
      {tag === 'REP' ? 'Field rep' : tag}
    </span>
  );
}

function Toggle({ options, value, onChange, label }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-0.5 p-1 bg-bg-secondary/60 rounded-xl border border-border/40 shrink-0"
    >
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={`inline-flex items-center justify-center min-h-11 md:min-h-0 px-2.5 py-1.5 rounded-lg text-[12.5px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            value === o.key
              ? 'bg-accent-blue text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The fabricators behind one row of the Districts & Fabricators table, and the
 * reps who visited them.
 *
 * Portalled for the same reason as DealerScorecardModal: the layout's scroll
 * container is transformed, so a fixed panel inside it would be positioned
 * against that container rather than the screen.
 *
 * `range` is inclusive { from, to } ('YYYY-MM-DD'). The page passes the running
 * month today; any range works, because the RPC reads field_visits directly.
 * The page keys this component on the district, so opening another district
 * starts from the full list instead of the last one's filters.
 *
 * `district` is the row that opened the panel and only seeds the State and
 * District selects; `districtOptions` ([{ state, district }]) is what they
 * offer, so another district, or every district of a state, can be read
 * without going back to the table.
 */
function DistrictFabricatorPanel({ district, districtOptions = [], range, roleIndex, onClose }) {
  const open = Boolean(district);
  useBodyScrollLock(open);

  const [view, setView] = useState('fabricators');
  const [role, setRole] = useState('ALL');
  const [query, setQuery] = useState('');
  const [leadsOnly, setLeadsOnly] = useState(false);
  // Rows shown so far, for one combination of view and filters; changing any
  // of them starts again from the first page.
  const [more, setMore] = useState({ sig: '', n: PAGE });
  const [expanded, setExpanded] = useState(() => new Set());
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const [retry, setRetry] = useState(0);
  const [place, setPlace] = useState(() => ({ state: district?.state || '', district: district?.district || '' }));

  const stateAllowed = open && daysBetween(range.from, range.to) <= STATE_MAX_DAYS;
  const byState = useMemo(() => {
    const map = new Map();
    const add = (st, dt) => {
      if (!st || !dt) return;
      if (!map.has(st)) map.set(st, new Set());
      map.get(st).add(dt);
    };
    districtOptions.forEach(o => add(o.state, o.district));
    if (district) add(district.state, district.district);
    return new Map([...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([st, set]) => [st, [...set].sort((a, b) => a.localeCompare(b))]));
  }, [districtOptions, district]);

  const pickState = st => setPlace({
    state: st,
    district: st === ALL || stateAllowed ? ALL : (byState.get(st) || [])[0] || '',
  });

  // With All states the district options carry their state ('STATE|District'),
  // so picking one also sets the State select.
  const pickDistrict = value => {
    if (value === ALL) {
      setPlace(p => ({ ...p, district: ALL }));
      return;
    }
    const cut = value.indexOf('|');
    setPlace(p => (cut >= 0
      ? { state: value.slice(0, cut), district: value.slice(cut + 1) }
      : { ...p, district: value }));
  };

  const allStates = place.state === ALL;
  const allDistricts = place.district === ALL;
  const where = f => [titleCase(f.district) || 'District not recorded', allStates && titleCase(f.state)]
    .filter(Boolean).join(', ');
  const key = open && place.state && place.district
    ? `${range.from}|${range.to}|${place.state}|${place.district}`
    : null;

  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  // Keyboard focus lives in the panel while it is open: it starts on the close
  // button, Tab and Shift+Tab wrap inside the panel instead of wandering into
  // the page behind the backdrop, and closing hands focus back to whatever
  // opened it (the district row).
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = e => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    fetchDistrictFabricators({ from: range.from, to: range.to, state: place.state, district: place.district })
      .then(data => { if (live) setResult({ key, data, error: null }); })
      .catch(err => { if (live) setResult({ key, data: null, error: err.message || 'Could not load fabricators' }); });
    return () => { live = false; };
  }, [key, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const sig = `${view}|${role}|${query}|${leadsOnly}`;
  const shown = more.sig === sig ? more.n : PAGE;

  const current = result.key === key ? result : { data: null, error: null };
  const loading = Boolean(key) && !current.data && !current.error;

  const shaped = useMemo(
    () => shapeDistrictFabricators(current.data, name => classifyRep(name, roleIndex), { role, query, leadsOnly }),
    [current.data, roleIndex, role, query, leadsOnly]
  );
  // The same list with no role filter or search, for "Export all".
  const shapedAll = useMemo(
    () => shapeDistrictFabricators(current.data, name => classifyRep(name, roleIndex)),
    [current.data, roleIndex]
  );
  // Base list with active role and query filters (unfiltered by leadsOnly)
  // to compute accurate available new leads for the current view
  const shapedBase = useMemo(
    () => shapeDistrictFabricators(current.data, name => classifyRep(name, roleIndex), { role, query, leadsOnly: false }),
    [current.data, roleIndex, role, query]
  );

  if (!open) return null;

  const period = range.from === range.to
    ? formatDayLabel(range.from)
    : `${formatDayLabel(range.from)} – ${formatDayLabel(range.to)}`;
  const list = view === 'fabricators' ? shaped.fabricators : shaped.reps;
  const filtered = role !== 'ALL' || query !== '' || leadsOnly;
  const leadCount = !current.data
    ? 0
    : view === 'reps'
      ? (shapedBase.reps || []).filter(r => (r.fabricators || []).some(f => f.new_lead_visits > 0)).length
      : (shapedBase.fabricators || []).filter(f => f.new_lead_visits > 0).length;

  // CSV of the view on screen. "Filtered" is what the role filter and search
  // leave; "all" is the whole list for the selected state and district. Both
  // carry the period, since the panel follows the page's date range.
  const periodCols = [
    { label: 'From', getValue: () => range.from },
    { label: 'To', getValue: () => range.to },
  ];
  const fabricatorCols = [
    { label: 'Fabricator', key: 'name' },
    { label: 'State', getValue: f => titleCase(f.state) },
    { label: 'District', getValue: f => titleCase(f.district) || 'Not recorded' },
    { label: 'City', getValue: f => f.city || '' },
    { label: 'Pincode', getValue: f => f.pincode || '' },
    { label: 'Visits', key: 'visits' },
    { label: 'First Visit', key: 'first_visit' },
    { label: 'Last Visit', key: 'last_visit' },
    { label: 'New Lead', getValue: f => (f.new_lead_visits > 0 ? 'Yes' : '') },
    { label: 'First New-Lead Visit', getValue: f => f.first_lead || '' },
    // One names column and one visits column per role, so a sheet can filter
    // or total by role. classifyRep counts a Jr. KRO as a KRO; OTHER is field
    // staff with no account in the Business Plan.
    ...[['KRM', 'KRM'], ['KRO', 'KRO / Jr. KRO'], ['OTHER', 'Field Rep']].flatMap(([key, name]) => {
      const of = f => f.reps.filter(r => (key === 'OTHER' ? !ROLE_LABEL[r.role] : r.role === key));
      return [
        { label: name, getValue: f => of(f).map(r => r.name).join('; ') },
        { label: `${name} Visits`, getValue: f => of(f).reduce((n, r) => n + r.visits, 0) || '' },
      ];
    }),
    ...periodCols,
  ];
  const repCols = [
    { label: 'Rep', key: 'rep' },
    { label: 'Role', getValue: row => roleLabel(row.role) },
    { label: 'Fabricator', key: 'name' },
    { label: 'State', getValue: row => titleCase(row.state) },
    { label: 'District', getValue: row => titleCase(row.district) || 'Not recorded' },
    { label: 'Visits', key: 'visits' },
    { label: 'Last Visit', key: 'last_visit' },
    { label: 'New Lead', getValue: row => (row.new_lead_visits > 0 ? 'Yes' : '') },
    ...periodCols,
  ];
  const repRows = reps => reps.flatMap(r => r.fabricators.map(f => ({ ...f, rep: r.name, role: r.role })));
  const exportName = [
    'fabricators',
    allStates ? 'all-states' : allDistricts ? place.state : place.district,
    view === 'reps' ? 'by-rep' : '',
  ].filter(Boolean).join('_');
  const exportCsv = which => {
    const set = which === 'filtered' ? shaped : shapedAll;
    if (view === 'fabricators') {
      downloadCsv(getExportFilename(exportName, which), fabricatorCols, set.fabricators);
    } else {
      downloadCsv(getExportFilename(exportName, which), repCols, repRows(set.reps));
    }
  };
  const allCount = view === 'fabricators' ? shapedAll.fabricators.length : shapedAll.reps.length;

  const toggleRep = name => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 flex justify-end"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="h-full w-full sm:max-w-xl lg:max-w-2xl bg-bg-card border-l border-border shadow-2xl flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Fabricators in ${allStates ? 'all states' : allDistricts ? place.state : place.district}`}
      >
        <div className="p-4 sm:p-5 border-b border-border/60 space-y-4 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-xl sm:text-2xl font-black text-text-primary leading-tight break-words">
                {allStates ? 'All states' : allDistricts ? 'All districts' : place.district}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[13px] text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {allStates ? 'Every state' : place.state}
                </span>
                <span>{period}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              ref={closeRef}
              aria-label="Close"
              className="w-11 h-11 md:w-8 md:h-8 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className="block text-[11px] font-bold text-text-muted uppercase tracking-wide mb-1">State</span>
              <select
                value={place.state}
                onChange={e => pickState(e.target.value)}
                className="filter-select w-full min-h-11 md:min-h-0"
              >
                <option value={ALL} disabled={!stateAllowed}>
                  {stateAllowed ? 'All states' : `All states (${STATE_MAX_DAYS} days or fewer)`}
                </option>
                {[...byState.keys()].map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="block text-[11px] font-bold text-text-muted uppercase tracking-wide mb-1">District</span>
              <select
                value={place.district}
                onChange={e => pickDistrict(e.target.value)}
                className="filter-select w-full min-h-11 md:min-h-0"
              >
                <option value={ALL} disabled={!stateAllowed}>
                  {stateAllowed ? 'All districts' : `All districts (${STATE_MAX_DAYS} days or fewer)`}
                </option>
                {allStates
                  ? [...byState.entries()].map(([st, dts]) => (
                      <optgroup key={st} label={st}>
                        {dts.map(dt => <option key={`${st}|${dt}`} value={`${st}|${dt}`}>{dt}</option>)}
                      </optgroup>
                    ))
                  : (byState.get(place.state) || []).map(dt => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </label>
          </div>

          {current.data && (
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Fabricators', shaped.totals.fabricators],
                ['Visits', shaped.totals.visits],
                ['Reps', shaped.totals.reps],
              ].map(([label, n]) => (
                <div key={label} className="rounded-lg bg-bg-secondary/60 border border-border/40 px-3 py-2">
                  <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide">{label}</div>
                  <div className="text-lg font-black text-text-primary tabular-nums leading-tight mt-0.5">
                    {n.toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Toggle options={VIEWS} value={view} onChange={setView} label="View" />
            <Toggle options={REP_ROLES} value={role} onChange={setRole} label="Filter by role" />
            <LeadsToggle on={leadsOnly} count={leadCount} onChange={setLeadsOnly} loading={loading && !current.data} />
            <div className="w-full sm:w-auto sm:flex-1 sm:min-w-[180px]">
              <SearchInput
                size="lg"
                value={query}
                onChange={setQuery}
                placeholder={view === 'fabricators' ? 'Search fabricator or rep' : 'Search rep or fabricator'}
              />
            </div>
            <ExportDropdown
              label="Export CSV"
              entityName={view === 'fabricators' ? 'Fabricators' : 'Reps'}
              filteredCount={list.length}
              rawCount={allCount}
              onExportFiltered={() => exportCsv('filtered')}
              onExportRaw={() => exportCsv('all')}
              disabled={!current.data}
              showChevron
              // Kept at the right end of the row: its menu opens leftwards
              // from the button's right edge, so on the left it spilled out
              // of the panel over the page.
              className="shrink-0 ml-auto"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading && <SkeletonLoader variant="table-row" count={8} />}

          {current.error && (
            <div className="text-center py-10 space-y-3">
              <p className="text-sm text-text-muted">{current.error}</p>
              <button
                type="button"
                onClick={() => setRetry(n => n + 1)}
                className="inline-flex items-center gap-1.5 min-h-11 md:min-h-0 px-3.5 py-2 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          )}

          {current.data && list.length === 0 && (
            <p className="text-center text-sm text-text-muted py-10">
              {filtered
                ? 'No fabricators match these filters.'
                : 'No fabricator visits recorded in this district for this period.'}
            </p>
          )}

          {current.data && view === 'fabricators' && list.length > 0 && (
            <ul className="divide-y divide-border/40">
              {list.slice(0, shown).map(f => (
                <li key={`${f.name}|${f.state}|${f.district}`} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-bold text-[15px] text-text-primary leading-tight break-words">{f.name}</span>
                        {f.new_lead_visits > 0 && <LeadTag visits={f.new_lead_visits} first={f.first_lead} />}
                      </div>
                      <div className="text-[12px] text-text-muted mt-1">
                        {[allDistricts && where(f), f.city, f.pincode]
                          .filter(Boolean).join(' · ') || 'Location not recorded'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-black text-[17px] text-text-primary tabular-nums leading-none">{f.visits}</div>
                      <div className="text-[11.5px] text-text-muted mt-1 whitespace-nowrap">
                        {f.visits === 1 ? 'visit' : 'visits'} · last {formatDayLabel(f.last_visit)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {f.reps.map(r => (
                      <span
                        key={r.name}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-bg-secondary/70 border border-border/40 text-[12px] text-text-secondary"
                      >
                        <span className="font-semibold">{r.name}</span>
                        <RoleTag role={r.role} />
                        <span className="tabular-nums text-text-muted">{r.visits}</span>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {current.data && view === 'reps' && list.length > 0 && (
            <ul className="space-y-2">
              {list.slice(0, shown).map(r => {
                const isOpen = expanded.has(r.name);
                return (
                  <li key={r.name} className="rounded-xl border border-border/50 bg-bg-secondary/40">
                    <button
                      type="button"
                      onClick={() => toggleRep(r.name)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[15px] text-text-primary break-words">{r.name}</span>
                          <RoleTag role={r.role} />
                        </div>
                        <div className="text-[12px] text-text-muted mt-1">
                          {r.visits.toLocaleString('en-IN')} {r.visits === 1 ? 'visit' : 'visits'} ·{' '}
                          {r.fabricators.length.toLocaleString('en-IN')}{' '}
                          {r.fabricators.length === 1 ? 'fabricator' : 'fabricators'}
                        </div>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isOpen && (
                      <ul className="border-t border-border/40 px-3.5 py-2 divide-y divide-border/30">
                        {r.fabricators.map(f => (
                          <li key={`${f.name}|${f.state}|${f.district}`} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                            <span className="text-text-primary break-words min-w-0">
                              {f.name}
                              {f.new_lead_visits > 0 && (
                                <>{' '}<LeadTag visits={f.new_lead_visits} first={f.first_lead} /></>
                              )}
                              {allDistricts && (
                                <span className="text-text-muted"> · {where(f)}</span>
                              )}
                            </span>
                            <span className="text-text-muted tabular-nums whitespace-nowrap shrink-0">
                              {f.visits} · last {formatDayLabel(f.last_visit)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {current.data && list.length > shown && (
            <div className="text-center pt-4">
              <button
                type="button"
                onClick={() => setMore({ sig, n: shown + PAGE })}
                className="min-h-11 md:min-h-0 px-4 py-2 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary cursor-pointer"
              >
                Show {Math.min(PAGE, list.length - shown)} more of {(list.length - shown).toLocaleString('en-IN')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default memo(DistrictFabricatorPanel);
