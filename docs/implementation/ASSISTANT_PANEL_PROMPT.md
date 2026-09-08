# Execution prompt — Sales Assistant panel rebuild

Paste the block below as a single task. It is self-contained: it names the
files, the constraints that are easy to get wrong, and the definition of done.
The full reasoning lives in `ASSISTANT_PANEL_REBUILD.md`.

---

Rebuild the chat feature in this repo as a **Sales Assistant slide-over panel**.
Read `docs/implementation/ASSISTANT_PANEL_REBUILD.md` first and follow it; the
notes below are the parts that must not be improvised.

**Goal.** Today `src/chat/` is a standalone full-page chat that looks and feels
like ChatGPT. Replace it with a right-hand slide-over panel that opens over any
dashboard page and reads as a sales assistant sitting beside the data — not a
general-purpose chatbot. Build it in a new `src/assistant/` folder and delete
`src/chat/` at the end. Carry over `Markdown.jsx`, `ChartBlock.jsx` and
`ResultTable.jsx` (restyled for a narrow column); rewrite everything else.

**Scope of the change outside the new folder.** Only `src/App.jsx` (mount the
provider and panel) and `src/utils/constants.js` (remove `/chat` from
`NAV_ITEMS` and `CLIENT_NAV_ITEMS`). Do not touch the dashboard pages, the data
context, or the trend engine.

**Constraints — verified, do not work around them.**

- The agent service is **not in this repo**. It is Cloud Run behind
  `VITE_AGENT_URL`. The available endpoints are exactly: `POST /chat` (SSE),
  `GET /sessions`, `GET /sessions/:id`, `PATCH /sessions/:id`,
  `DELETE /sessions/:id`, `GET /results/:toolCallId`, `GET /freshness`,
  `POST /auth/login`. Every change is client-side. Do not invent an endpoint.
- Bulk delete is a throttled loop of `DELETE /sessions/:id` at concurrency 4.
- Keep the direct Cloud Run fetch in `api.js`. Routing `/chat` through a
  Netlify proxy buffers the response and kills the SSE stream.
- Keep `Markdown.jsx` building React elements. Never introduce
  `dangerouslySetInnerHTML`.
- Style only with the existing CSS variables and Tailwind token classes
  (`bg-bg-card`, `text-text-muted`, `border-border`, `--gradient-accent`, the
  `severity-*` scale). The app has a light theme as well as dark: every surface
  must be correct in both. No new hex values.

**Architecture — get this right first.** Conversation state must survive
dashboard navigation, so it lives above `<Routes>`:

```jsx
<BrowserRouter>
  <AssistantProvider>
    <Routes>…</Routes>
    <AssistantPanel />
  </AssistantProvider>
</BrowserRouter>
```

`AssistantProvider` owns `sessionId` as state and holds the single
`useAssistantStream` instance. The URL mirrors that state only while the
`/chat` page is mounted. A session minted during a panel conversation must
**not** call `navigate` — that remounts the dashboard page behind the panel.
Land this step and verify a stream keeps running across a page change before
building any UI on top of it.

**The thinking indicator is the visible centrepiece.** Delete the hardcoded
`"Consulting sales database…"` at `src/chat/Message.jsx:139` and stop rendering
the backend's `data.status` string from `tool_start`. Instead derive the phrase
client-side from `data.tool`, per the `statusPhrases.js` table in the plan:
`Thinking` while nothing has started, `Pulling despatch numbers` /
`Reviewing the order backlog` / `Matching names` and so on per tool,
`Reading through it` after results land, `Trying another way` on a tool error.
Hold each phrase at least 900ms so fast events cannot flicker; crossfade 150ms;
shimmer the text with a swept `background-clip: text` gradient, degrading to
static text plus one pulsing dot under `useReducedMotion()`. It renders inline
where the answer will appear, not under the composer. Never surface row counts,
milliseconds, tool names or SQL.

**Remove:** `ToolTrace.jsx` entirely; the composer footer strings
`Enter to send · Shift+Enter for a new line` and `Figures come from SQL, not
the model`; the mobile `Ask` header; the sidebar's "Back to dashboard", user
card and sign-out (the dashboard shell already has them); the `EmptyState`
explainer paragraph; the two prose paragraphs in `NotFoundNotice`.

**Keep, but as compact expandable chips:** stale-data warnings (an amber dot in
the panel header) and dealer-match disclosures ("Includes 3 stored name
variants"). A `possible_mismatch` disclosure stays amber and expanded by
default — a salesperson acting on a total that folded in the wrong company is a
real cost, and that is the one piece of plumbing worth showing.

**History pane** (a view switch inside the panel, with a back arrow — not a
nested drawer): a `7 days | 30 days | All` segmented control defaulting to
30 days and filtering `updated_at` client-side; a title search box; Today /
Yesterday / Previous 7 days / Previous 30 days groups; the existing inline
rename and per-row delete; and an overflow menu with **Delete last 7 days (N)**
and **Delete older than 30 days (N)**, live counts in the labels, a two-step
inline confirm that repeats the count, a "Deleting 5 of 12…" progress line, no
optimistic removal, and a partial-failure summary with retry. If the open
session is deleted, clear the panel to its empty state.

**Panel mechanics.** Portal into `document.body`. Desktop: 420px default,
drag-resizable 380–720px, width persisted in `localStorage`, overlay rather
than push, `aria-modal="false"` so the dashboard stays operable. Mobile
(<640px): full-screen `h-dvh` sheet with `env(safe-area-inset-bottom)`,
`aria-modal="true"`, focus trap, and `useBodyScrollLock(true)` — that lock must
never apply on desktop. Escape closes unless the composer is mid-IME
composition. `Cmd/Ctrl+K` toggles. Focus moves to the composer on open and back
to the launcher on close. Persist open state and `sessionId` in
`sessionStorage`. Show an unread dot on the launcher when an answer finished
while the panel was closed. `React.lazy` the panel body so recharts stays out
of the dashboard's initial bundle, and wrap it in an error boundary with a
"Restart assistant" action (extend `src/components/common/ErrorBoundary.jsx` to
accept a `fallback` prop). Animate with the existing framer-motion
`LazyMotion` / `domAnimation` setup, skipping the slide under reduced motion.

**Done means:** `npm run build` passes, `npm run lint` adds no new errors of
substance over the 29 already on `main`, `src/chat/`
is gone, and you have walked the verification matrix in section 9 of the plan —
in particular a deep-linked `/chat/:id`, a refresh mid-stream, the panel
streaming across a page navigation without the dashboard reloading, a bulk
delete with a forced partial failure, 375px mobile with the keyboard up, and
both light and dark themes. Report what you verified and what you could not.
