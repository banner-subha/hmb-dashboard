# Sales Assistant — panel rebuild plan

Rebuilds `src/chat/` (a standalone ChatGPT-lookalike page) into a **right-hand
slide-over Sales Assistant** that opens over any dashboard page, with the
existing `/chat` route demoted to an "expand to full page" surface.

Decisions locked with the product owner:

1. **Panel is the assistant.** Right slide-over, full conversation inside it,
   dashboard stays visible behind, state survives page navigation. `/chat`
   remains for deep links and wide tables.
2. **History gets a range filter + bulk delete** (7d / 30d / All, plus
   "delete last 7 days" and "delete older than 30 days" with a counted confirm).
3. **Correctness guards stay, plumbing goes.** No row/ms counters, no "Figures
   come from SQL" footer. Dealer-match disclosures and stale-data warnings
   survive as compact chips that expand on click.

---

## 1. What exists today (audit)

| File | Lines | Fate |
| --- | --- | --- |
| `ChatLayout.jsx` | 208 | Split into `AssistantPanel` + `AssistantPage` + `ConversationView` |
| `ChatSidebar.jsx` | 259 | Replaced by `HistoryPane` (drops nav/user/logout footer) |
| `useChatStream.js` | 273 | Rewritten as `useAssistantStream` (status engine changes) |
| `api.js` | 164 | Kept, + `deleteSessions()` bulk helper |
| `Composer.jsx` | 99 | Rewritten, meta row removed |
| `Message.jsx` | 167 | Rewritten as `MessageTurn` |
| `ToolTrace.jsx` | 120 | **Deleted** — never carried over; goes with the folder in step 6 |
| `EmptyState.jsx` | 37 | Rewritten, 6 chips to 4, paragraph to one line |
| `DealerDisclosure.jsx` | 90 | Folded into `Provenance.jsx` as an expandable chip |
| `FreshnessBanner.jsx` | 76 | Folded into `Provenance.jsx`, becomes a header dot |
| `Markdown.jsx` | 267 | Carried over unchanged (no HTML injection — keep it) |
| `ChartBlock.jsx` | 286 | Carried over, restyled for a 420px column |
| `ResultTable.jsx` | 260 | Carried over, restyled + horizontal scroll in panel |

Hard constraints discovered during the audit:

- **The agent service is not in this repo.** It is a Cloud Run app reached via
  `VITE_AGENT_URL`. The only endpoints available are `POST /chat` (SSE),
  `GET /sessions`, `GET /sessions/:id`, `PATCH /sessions/:id`,
  `DELETE /sessions/:id`, `GET /results/:toolCallId`, `GET /freshness`,
  `POST /auth/login`. **Every change below is client-side.**
- Bulk delete is therefore a throttled loop of `DELETE /sessions/:id`. A
  `DELETE /sessions?before=…` endpoint would make it atomic — logged as a
  follow-up, not a blocker.
- The `tool_start` SSE event carries a backend-written `status` string (this is
  where "Consulting sales database" comes from). The backend cannot be changed
  from here, so the client must **ignore `data.status`** and derive its own
  phrase from `data.tool`.
- Netlify must not proxy `/chat` — it buffers and kills the SSE stream. Keep
  the direct Cloud Run call.

## 2. Target structure

New folder `src/assistant/`; `src/chat/` is deleted. Only two files outside it
change: `src/App.jsx` (mount the provider + panel) and
`src/utils/constants.js` (drop `/chat` from both nav lists).

```
src/assistant/
  AssistantProvider.jsx    open/close state, sessionId, one stream instance
  useAssistantStream.js    SSE to messages, drives the status engine
  statusPhrases.js         tool to sales-friendly phrase map + rotation timing
  api.js                   transport (+ deleteSessions bulk helper)
  AssistantPanel.jsx       portal, slide-over shell, resize, focus, a11y
  AssistantLauncher.jsx    trigger button + Cmd/Ctrl+K binding + unread dot
  AssistantPage.jsx        /chat full-page surface (same ConversationView)
  ConversationView.jsx     message list, scroll pinning, empty state
  Composer.jsx             textarea + send/stop
  MessageTurn.jsx          user bubble / assistant prose
  ThinkingIndicator.jsx    shimmer + rotating phrase
  HistoryPane.jsx          range filter, search, groups, bulk delete
  Provenance.jsx           stale-data + dealer-match chips
  Markdown.jsx  ChartBlock.jsx  ResultTable.jsx
```

### Why a provider

The panel must keep streaming while the user clicks through State Overview to
Dealer Network. So conversation state lives **above** `<Routes>`:

```jsx
<BrowserRouter>
  <AssistantProvider>
    <Routes>…</Routes>
    <AssistantPanel />   {/* sibling of Routes, not a child of any page */}
  </AssistantProvider>
</BrowserRouter>
```

`AssistantProvider` owns `sessionId` as state. The URL is a *mirror*, not the
source, and only while `/chat` is the active surface:

- `AssistantPage` mounts and pushes its `:sessionId` param into the provider.
- A session minted mid-panel-conversation sets provider state and **does not
  navigate** — navigating would remount the dashboard page behind the panel.
- `AssistantPage` navigates on session change only while it is mounted.

This is the one piece of real architecture in the rebuild. Get it wrong and
either the panel resets on navigation, or opening the panel reloads the
dashboard underneath it.

## 3. The thinking indicator

Remove the hardcoded `Consulting sales database…` in `Message.jsx:139` and the
backend `data.status` passthrough. Replace with a client-side phrase engine.

```js
// statusPhrases.js
export const TOOL_PHRASES = {
  query_despatch:          ['Pulling despatch numbers', 'Adding up tonnage'],
  query_dia_wise:          ['Checking size-wise rates', 'Working through revenue'],
  query_pending:           ['Reviewing the order backlog', 'Ageing the backlog'],
  query_dealer_targets:    ['Looking up targets'],
  query_dealer_vs_actual:  ['Comparing against target'],
  query_kro_performance:   ['Checking field-force numbers'],
  resolve_dimension_value: ['Matching names'],
  explain_dealer_match:    ['Confirming the dealer'],
};
export const OPENING    = ['Thinking', 'Working out the numbers', 'Still on it'];
export const READING    = ['Reading through it', 'Cross-checking'];
export const RECOVERING = ['Trying another way'];
```

Rules:

- No tool started yet: walk `OPENING` at 0s / 2.5s / 6s.
- `tool_start`: phrase from `TOOL_PHRASES[data.tool]`, fallback
  `'Checking the numbers'`. Two tools running at once: `'Checking a few things'`.
- `tool_result` ok: `READING`. `tool_result` with `error`: `RECOVERING`.
- First `token`: the indicator unmounts and prose takes over.
- **Minimum hold of 900ms per phrase**, so fast events cannot flicker.
  Crossfade 150ms.

**Revised in step 2, after testing against the live agent.** A single
"current activity" value does not survive contact with reality:

- Two SSE frames delivered in one network chunk are dispatched in the same
  tick, so React batches them and only the last value ever renders. A query
  that starts and finishes inside one chunk was therefore invisible — and the
  live agent does exactly that, so the tool phrase never appeared at all.
- So `useAssistantStream` exposes `phases`, an **append-only log** of what
  happened this turn, capped at 24 entries and cleared on the first token.
  Appending cannot lose an entry to batching.
- `useStatusPhrase(phases)` treats that log as a playlist: each entry gets at
  least `HOLD_MS` of airtime; entries still queued may be **skipped in favour
  of a more informative one**; and a more informative phase arriving
  **interrupts** a duller one already on screen. Rank is
  `tool = recovering > reading > opening` (`rankOf`).
- Net effect, verified with both frames in a single chunk: the tool phrase
  still shows, for 905ms against a 900ms target.
- Render as a Claude-style shimmer: a `background-clip: text` gradient sweeping
  left to right over the phrase, 2s linear infinite. Under `useReducedMotion()`,
  static text plus a single pulsing dot.
- Never show elapsed ms, row counts, tool names, or SQL.
- It lives **in the message stream** where the answer will appear, not under the
  composer.

## 4. Panel mechanics (the production-ready part)

- `createPortal` into `document.body`; z-index above the dashboard header.
- Desktop >=640px: 420px default, drag handle on the left edge, clamped
  380–720px, width persisted in `localStorage` (`hmb_assistant_width`).
  Overlay, not push — no dashboard reflow, no chart re-measure storm.
  `role="dialog" aria-modal="false"` so the dashboard stays operable.
- Mobile <640px: full-screen sheet, `h-dvh`, `env(safe-area-inset-bottom)`,
  `aria-modal="true"`, focus trap, `useBodyScrollLock(true)` — **only in this
  mode**, never on desktop.
- Escape closes, unless the composer is mid-IME composition
  (`e.nativeEvent.isComposing`). Focus moves to the composer on open and back
  to the launcher on close.
- Toggle with `Cmd/Ctrl+K`, and `Cmd/Ctrl+J` as an alternate — K is the
  address-bar shortcut in some browsers. Launcher button in the dashboard
  header, plus a floating action button on mobile. Both triggers stay mounted
  while the panel is open, because one of them is where focus returns on close.
- Focus the composer **directly**, not inside a `requestAnimationFrame`: rAF
  does not run in a hidden tab, so a panel restored open in a background tab
  would never take focus.
- Open state and `sessionId` in `sessionStorage`, so a refresh keeps context.
- The stream keeps running while the panel is closed; the launcher shows an
  unread dot when an answer completed while it was shut.
- `React.lazy` the panel body — recharts must not enter the dashboard's initial
  bundle. Extend `ErrorBoundary` to accept a `fallback` prop and wrap the panel
  with a "Restart assistant" recovery.
- Slide-in through the existing `LazyMotion` / `domAnimation` setup, 200ms
  ease-out, `x: '100%'` to `0`; skipped under reduced motion.

## 5. Chat history

A view switch inside the panel (back arrow), not a nested drawer — 420px is too
narrow for two columns.

- Segmented control `7 days | 30 days | All`, default **30 days**, filtering
  `session.updated_at` client-side. Persist the choice.
- Title search box above the list.
- Groups inside the active range: Today / Yesterday / Previous 7 days /
  Previous 30 days.
- Per-row rename and delete keep the current inline, non-modal pattern — it is
  already good.
- Overflow menu offers **Delete last 7 days (12)** and **Delete older than
  30 days (34)**, counts computed live and shown in the label. Two-step inline
  confirm repeating the count. Then:
  - `deleteSessions(ids)` issues `DELETE` at concurrency 4;
  - a progress line reads "Deleting 5 of 12…";
  - **no optimistic removal** — a row disappears when its 204 lands;
  - partial failure shows "9 deleted, 3 could not be deleted" plus a retry;
  - if the open session was deleted, the panel clears to the empty state.
- Empty range: "No conversations in the last 7 days." with a link to widen it —
  or "Clear search" when a query is what emptied it, since widening the range
  would not help.

**Added in step 5.** Escape has to be layered, and event phases cannot do it:
every listener here is on `window`, and when the event's target *is* window,
capture and bubble listeners fire in **registration order** rather than by
phase. The panel registers first, so it always won and `stopPropagation` from a
dropdown arrived too late — one Escape closed the whole assistant instead of
the menu. `escapeStack.js` makes the ordering explicit: layers register on
open, `dismissTop()` dismisses the innermost, and the panel closes only when
the stack is empty. Verified: Escape peels the bulk menu, then a pending
confirmation (deleting nothing), then the panel.

Closing the panel also resets the view to the conversation. It exists to be
asked things, so reopening should land on the composer rather than wherever the
history list was left.

## 6. Removals (explicit)

Delete outright:

- `ToolTrace.jsx` — the whole `2 queries · 4,812 rows · 380 ms` disclosure.
- Composer footer: `Enter to send · Shift+Enter for a new line` and
  `Figures come from SQL, not the model` (keep only as `title` / `aria-label`).
- The mobile `Ask` header and hamburger in `ChatLayout`.
- Sidebar footer: "Back to dashboard", the user card with role, the sign-out
  button — all already exist in the dashboard shell one layer out.
- `EmptyState`'s two-sentence explainer paragraph.
- `NotFoundNotice`'s two prose paragraphs, replaced by one-line inline notes.

Demote, do not delete:

- Stale data becomes an amber dot in the panel header; clicking expands the
  per-table detail. Still auto-expands once per session when something is stale.
- Dealer disclosure becomes a chip, "Includes 3 stored names", expanding to the
  existing table. The `possible_mismatch` variant stays amber and **expanded by
  default** — that one is a wrong-number guard, not decoration.
- **Added in step 4:** a disclosure with exactly one match and no suspicion is
  not rendered at all. Nothing was folded together, so there is nothing to
  disclose, and "Includes 1 stored name" is noise on the answer. Found by
  asking the live agent about a real dealer.
- The two miss cases stay distinct and stay one line each: "A filter value was
  not found. Nothing was substituted for it." versus "The names matched, but
  there was no activity in that period." Conflating them tells a salesperson
  their state does not exist when it merely had a quiet week.

## 7. Copy and naming

- Panel title: **"Sales Assistant"** (alternatives: "HMB Assistant", "Ask
  Sales"). The `/chat` nav entry is removed; the launcher replaces it.
- Empty state: `Ask me about despatch, backlog, targets or rates.` plus four
  chips: *Top states this month* · *Backlog over 30 days* · *Dealers behind
  target* · *10mm vs 12mm*.
- Composer placeholder: `Ask about despatch, backlog, targets or rates`.
- Error: `That answer did not finish.` plus a one-line reason and Retry.

## 8. Order of work

1. `AssistantProvider` + `useAssistantStream` + `statusPhrases` + the `api`
   move. Provider mounted in `App.jsx`, panel rendering a bare message list.
   Verify streaming survives page navigation. **Riskiest step — land it first.**
2. `AssistantPanel` shell: portal, animation, resize, a11y, mobile sheet,
   launcher and shortcut.
3. `ConversationView` + `MessageTurn` + `Composer` + `ThinkingIndicator`.
4. `Provenance` (stale chip + dealer chip); delete `ToolTrace`.
5. `HistoryPane` with range filter, search, groups, bulk delete.
6. `AssistantPage` for `/chat`; carry `ChartBlock` / `ResultTable` / `Markdown`;
   remove `/chat` from `constants.js`; delete `src/chat/`.
7. Verification pass (section 9).

**Step 6 as built.** `/chat` renders `AssistantPage`, and it is the only
surface that touches the URL: it mirrors the provider's `sessionId` both ways
while mounted, adopting the URL when the URL moves and replacing the URL when
the conversation moves. On wide screens the page carries a permanent history
sidebar; narrower ones reuse the panel's view switch. The panel gained an
"Open full page" button, which needs to hand over nothing but the URL, because
the page reads the same conversation out of the provider.

`/chat` was removed from both nav lists — a nav row pointing at the full-page
view would be a second, worse door to a thing that already opens with a header
button and Ctrl+K. `MessageSquare` came out of `NAV_ICON_MAP` with it.

`ResultTable` stays collapsed behind "Show N rows" in the panel: a
twelve-column table in a 420px column is worth offering, not imposing. The
full-page view is where it is comfortable.

Bundling after the split: `index` (initial) 78 kB, unchanged — nothing leaked
into the dashboard's first load. The assistant is three lazy chunks totalling
~52 kB (`AssistantSurface` 7.6 kB, `AssistantPage` 3.8 kB, shared 40 kB), and
recharts stays its own 355 kB chunk pulled only when a chart arrives.

## 9. Verification

`npm run build` must pass. `npm run lint` is already red on `main` — 29 errors,
mostly `react-hooks/set-state-in-effect` and `react-refresh/only-export-components`
in existing files — so the bar is **no new errors of substance**, not a clean run.
Matching the codebase's existing provider convention (a hook plus a component
exported from one file, as `AuthContext` does) counts as no new error.

Manual matrix — all of these are known-fragile in this codebase:

- Deep link `/chat/:id` cold; refresh mid-stream; back button after a new
  session is minted.
- Panel open, then navigate States to Dealers: still streaming, same
  conversation, and the dashboard did not reload.
- Stop mid-stream, then ask again in the same session.
- Token expiry mid-stream: `hmb:unauthorized` fires and redirects to `/login`
  (`AuthContext.jsx:63` already listens).
- Bulk delete with one forced failure: partial summary correct, list correct.
- 375px width: composer visible above the keyboard, no double scrollbar, no
  horizontal page scroll. `h-dvh` is load-bearing here.
- Light **and** dark theme (`ThemeContext`), reduced motion on, keyboard-only
  navigation, and a real label on every icon button.
- A chart inside a 420px panel: no overflow, readable axis, and the table
  scrolls horizontally rather than widening the panel.

## 10. Follow-ups for the agent service (out of scope here)

- `DELETE /sessions?before=<iso>&after=<iso>` for atomic bulk delete.
- `GET /sessions?since=<iso>&limit=` so history does not grow unbounded.
- Drop the human-readable `status` string from `tool_start`, or rename it to
  `tool_phase`; the client no longer renders it.
