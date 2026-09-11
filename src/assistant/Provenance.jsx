import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Info, SearchX } from 'lucide-react';

// The only plumbing worth showing.
//
// The old chat put a query trace above every answer — "2 queries · 4,812 rows
// · 380 ms" — and a full dealer-matching table inline. That is a query plan;
// a salesperson wants the number. All of it is gone except the one thing that
// changes whether a figure should be acted on: a dealer filter that quietly
// folded in a different company.
//
// It collapses to a chip, and expands itself when the match is actually
// suspect, because that one is a wrong-number guard rather than a footnote.
//
// A staleness chip used to live here too, warning when a source stopped before
// the period asked about. Removed at the product owner's request: the agent
// already states the data's end date in its own prose, so the chip was
// repeating what the answer says.

const CONFIDENCE_LABEL = {
  exact: 'exact match',
  spelling_variant: 'spelling variant',
  suffix_or_prefix: 'suffix or prefix',
  possible_mismatch: 'possible mismatch',
};

/**
 * One dealer filter and the stored names it matched.
 *
 * Dealer totals are deliberately inclusive: a filter folds in every stored
 * spelling that matches, which can pull in a genuinely different company.
 * When that happens the disclosure is amber and already open — it is the
 * difference between a right and a wrong number, not a detail.
 */
function DealerDisclosure({ disclosure }) {
  const matches = disclosure?.matches || [];
  const suspect = matches.filter((m) => m.confidence === 'possible_mismatch');
  const caution = suspect.length > 0;
  const [toggled, setToggled] = useState(null);

  // One match and no suspicion means nothing was folded together, so there is
  // nothing to disclose. "Includes 1 stored name" is just noise on the answer.
  if (matches.length < 2 && !caution) return null;

  const open = toggled ?? caution;

  return (
    <div
      className={`my-2 rounded-xl border ${
        caution
          ? 'border-severity-high/45 bg-severity-high/[0.07]'
          : 'border-border bg-bg-tertiary/60'
      }`}
    >
      <button
        type="button"
        onClick={() => setToggled(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {caution ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-severity-high" />
        ) : (
          <Info className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        )}
        <span
          className={`flex-1 text-[0.8rem] leading-snug ${
            caution ? 'font-semibold text-severity-high' : 'text-text-muted'
          }`}
        >
          {caution
            ? 'This total may include a different company'
            : `Includes ${matches.length} stored name${matches.length === 1 ? '' : 's'}`}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-text-dim transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="px-3 pb-2.5">
          {caution && (
            <p className="mb-2 text-[0.8rem] leading-relaxed text-text-secondary">
              The filter “{disclosure.input}” folded in{' '}
              {suspect.map((m, i) => {
                const name = m.matched_name || m.customer_name;
                return (
                  <span key={name}>
                    {i > 0 && ', '}
                    <strong className="font-semibold text-severity-high">{name}</strong>
                  </span>
                );
              })}
              , which may not be the dealer you meant.
            </p>
          )}
          <table className="w-full text-[0.78rem]">
            <tbody>
              {matches.map((m) => {
                const name = m.matched_name || m.customer_name;
                return (
                  <tr
                    key={name}
                    className={
                      m.confidence === 'possible_mismatch'
                        ? 'text-severity-high'
                        : 'text-text-muted'
                    }
                  >
                    <td className="py-[3px] pr-2 font-medium">
                      {name}
                      {m.customer_type && (
                        <span className="ml-2 inline-block rounded bg-bg-card/70 px-1 py-0.5 text-[0.68rem] text-text-muted">
                          {m.customer_type}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-[3px] text-right text-[0.72rem]">
                      {CONFIDENCE_LABEL[m.confidence] || m.confidence}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * A one-line note, not a paragraph.
 *
 * "Not found" and "no data" are different things, and conflating them tells a
 * salesperson their state does not exist when it simply had a quiet week.
 */
function MissNotice({ tools }) {
  const missed = tools.some((t) => t.notFound);
  const quiet = tools.some((t) => t.noData && !t.notFound);
  if (!missed && !quiet) return null;

  return (
    <div className="my-2 space-y-1">
      {missed && (
        <p className="flex items-start gap-1.5 text-[0.8rem] leading-relaxed text-severity-high">
          <SearchX className="mt-[2px] h-3.5 w-3.5 shrink-0" />
          A filter value was not found. Nothing was substituted for it.
        </p>
      )}
      {quiet && (
        <p className="flex items-start gap-1.5 text-[0.8rem] leading-relaxed text-text-muted">
          <Info className="mt-[2px] h-3.5 w-3.5 shrink-0" />
          The names matched, but there was no activity in that period.
        </p>
      )}
    </div>
  );
}

/**
 * The provenance for one answer. Renders above the prose, because a warning
 * about a figure is worth less after the figure has been read.
 */
export default function TurnProvenance({ tools = [], loadResult }) {
  const [fetched, setFetched] = useState({});

  // Disclosures live on the tool result, so they arrive with the rows rather
  // than on the stream event, which only flags that there is one.
  const needing = tools.filter((t) => t.hasDisclosure && !t.disclosure).map((t) => t.id);
  const key = needing.join(',');

  useEffect(() => {
    if (!key || !loadResult) return undefined;
    let cancelled = false;
    Promise.all(
      key.split(',').map((id) =>
        loadResult(id)
          .then((payload) => [id, payload?.dealer_disclosure])
          .catch(() => [id, null]),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setFetched(Object.fromEntries(pairs.filter(([, d]) => d)));
    });
    return () => {
      cancelled = true;
    };
  }, [key, loadResult]);

  // Rebuilt history carries its disclosure inline and needs no fetch.
  const inline = Object.fromEntries(
    tools.filter((t) => t.disclosure).map((t) => [t.id, t.disclosure]),
  );

  // One disclosure per distinct dealer input, suspect matches first.
  const unique = useMemo(() => {
    const all = { ...inline, ...fetched };
    const seen = new Set();
    return Object.values(all)
      .filter((d) => {
        if (!d?.input || seen.has(d.input)) return false;
        seen.add(d.input);
        return true;
      })
      .sort(
        (a, b) =>
          Number(b.matches?.some((m) => m.confidence === 'possible_mismatch')) -
          Number(a.matches?.some((m) => m.confidence === 'possible_mismatch')),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fetched, tools]);

  const worthShowing = unique.filter(
    (d) =>
      (d.matches || []).length > 1 ||
      (d.matches || []).some((m) => m.confidence === 'possible_mismatch'),
  );

  if (!worthShowing.length && !tools.some((t) => t.notFound || t.noData)) return null;

  return (
    <>
      {worthShowing.map((d) => (
        <DealerDisclosure key={d.input} disclosure={d} />
      ))}
      <MissNotice tools={tools} />
    </>
  );
}
