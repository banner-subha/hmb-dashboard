import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api';

let uid = 0;
const nextId = () => `m${(uid += 1)}`;

// Rebuild the UI's view of a conversation from the persisted message list.
// Tool messages carry their own rows, so charts and tables render on reload
// without re-querying anything.
function fromHistory(messages) {
  const out = [];
  const resultsById = {};
  let pendingTools = [];

  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ id: nextId(), role: 'user', text: m.text || '' });
      pendingTools = [];
    } else if (m.role === 'assistant') {
      const tools = (m.tool_calls || []).map((c) => ({
        id: c.id,
        tool: c.name,
        args: c.args,
        state: 'done',
      }));
      if (tools.length) {
        pendingTools = pendingTools.concat(tools);
      } else {
        out.push({
          id: nextId(),
          role: 'assistant',
          text: m.text || '',
          tools: pendingTools,
          charts: [],
          state: 'done',
        });
        pendingTools = [];
      }
    } else if (m.role === 'tool') {
      const result = m.tool_result || {};
      resultsById[m.tool_call_id] = { ...result, tool: m.tool_name };
      const hit = pendingTools.find((t) => t.id === m.tool_call_id);
      if (hit) {
        hit.rows = result.row_count ?? (result.rows || []).length;
        hit.disclosure = result.dealer_disclosure;
        hit.notFound = Boolean(result.not_found);
        hit.noData = Boolean(result.no_data);
        hit.error = result.error;
      }
    }
  }

  // An assistant turn that ended on tool calls with no closing text.
  if (pendingTools.length) {
    out.push({
      id: nextId(),
      role: 'assistant',
      text: '',
      tools: pendingTools,
      charts: [],
      state: 'done',
    });
  }

  return { messages: out, resultsById };
}

/**
 * Owns one conversation.
 *
 * The session id is passed in and never derived from the URL here. The panel
 * opens over any dashboard page and has no URL of its own, so the caller — the
 * provider — is the single owner of which session is open, and the /chat page
 * merely mirrors it.
 *
 * Nothing in here renders. It reports what it is doing as a log of phases and
 * leaves the wording, and the timing of the wording, to statusPhrases.
 */
export default function useAssistantStream({ sessionId, onSessionCreated }) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  // An append-only log of what the assistant has been doing this turn, not a
  // single "current activity".
  //
  // Two SSE frames delivered in one network chunk are dispatched in the same
  // tick, so React batches them and only the last value ever renders. With a
  // single current-activity value, a query that starts and finishes inside one
  // chunk is invisible — and that is exactly the phase whose phrase is worth
  // reading. Appending cannot lose an entry to batching, so the caption engine
  // gets the full sequence and decides what is worth showing.
  const [phases, setPhases] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [results, setResults] = useState({});

  const abortRef = useRef(null);
  // The session we created during this very stream. Its history must not be
  // reloaded on top of the answer still arriving.
  const justCreatedRef = useRef(null);
  // Tool calls in flight, newest last, so a phrase can name whichever query
  // is still outstanding when one of several finishes.
  const runningRef = useRef([]);
  // The last question asked, so a failed answer can be retried.
  const lastQuestionRef = useRef(null);
  // Monotonic, so equal phases are still distinct entries in the log.
  const seqRef = useRef(0);

  const pushPhase = useCallback((phase) => {
    seqRef.current += 1;
    const entry = { ...phase, seq: seqRef.current };
    // Capped: a long chain of fast queries must not grow this without bound.
    setPhases((prev) => (prev.length > 23 ? [...prev.slice(-23), entry] : [...prev, entry]));
  }, []);

  useEffect(() => {
    if (!sessionId) {
      // A fresh conversation. Do not wipe a stream that is mid-flight: the
      // session it is about to mint arrives as an event, and clearing here
      // would delete the answer being written.
      if (!abortRef.current) {
        setMessages([]);
        setResults({});
        setPhases([]);
        setLoadError(null);
      }
      return undefined;
    }
    if (justCreatedRef.current === sessionId) return undefined;

    let cancelled = false;
    setLoadingHistory(true);
    setLoadError(null);
    api
      .getSession(sessionId)
      .then((data) => {
        if (cancelled) return;
        const { messages: rebuilt, resultsById } = fromHistory(data.messages || []);
        setMessages(rebuilt);
        setResults(resultsById);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = [];
    setStreaming(false);
    setPhases([]);
    // Whatever arrived is the answer now. Leaving the turn in 'streaming'
    // would keep a caret blinking under text that has stopped growing.
    setMessages((prev) =>
      prev.map((m) => (m.state === 'streaming' ? { ...m, state: 'done', stopped: true } : m)),
    );
  }, []);

  const send = useCallback(
    async (text) => {
      const question = String(text || '').trim();
      if (!question || streaming) return;

      lastQuestionRef.current = question;
      runningRef.current = [];

      const assistantId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', text: question },
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          tools: [],
          charts: [],
          state: 'streaming',
        },
      ]);
      setStreaming(true);
      seqRef.current += 1;
      setPhases([{ kind: 'opening', seq: seqRef.current }]);

      const patch = (fn) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await api.streamChat({
          message: question,
          sessionId: sessionId ?? null,
          signal: controller.signal,
          onEvent: (name, data) => {
            switch (name) {
              case 'session':
                if (data.is_new) {
                  justCreatedRef.current = data.session_id;
                  onSessionCreated?.(data.session_id);
                }
                break;

              case 'tool_start':
                // data.status is deliberately ignored. See statusPhrases.
                runningRef.current = [
                  ...runningRef.current,
                  { id: data.id, tool: data.tool },
                ];
                pushPhase({
                  kind: 'tool',
                  tool: data.tool,
                  running: runningRef.current.length,
                });
                patch((m) => ({
                  ...m,
                  tools: [
                    ...m.tools,
                    { id: data.id, tool: data.tool, args: data.args, state: 'running' },
                  ],
                }));
                break;

              case 'tool_result': {
                runningRef.current = runningRef.current.filter((t) => t.id !== data.id);
                const still = runningRef.current;
                if (data.error) {
                  pushPhase({ kind: 'recovering' });
                } else if (still.length) {
                  const last = still[still.length - 1];
                  pushPhase({ kind: 'tool', tool: last.tool, running: still.length });
                } else {
                  pushPhase({ kind: 'reading' });
                }
                patch((m) => ({
                  ...m,
                  tools: m.tools.map((t) =>
                    t.id === data.id
                      ? {
                          ...t,
                          state: data.error ? 'error' : 'done',
                          rows: data.rows,
                          possibleMismatch: data.possible_mismatch,
                          hasDisclosure: data.has_disclosure,
                          notFound: data.not_found,
                          noData: data.no_data,
                          error: data.error,
                        }
                      : t,
                  ),
                }));
                break;
              }

              case 'token':
                // The answer itself has started. It replaces the indicator.
                setPhases([]);
                patch((m) => ({ ...m, text: m.text + data.text }));
                break;

              case 'chart':
                patch((m) => ({ ...m, charts: [...m.charts, data] }));
                break;

              case 'done':
                patch((m) => ({ ...m, state: 'done', meta: data }));
                setPhases([]);
                break;

              case 'error':
                patch((m) => ({ ...m, state: 'error', error: data.message }));
                setPhases([]);
                break;

              default:
                break;
            }
          },
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          patch((m) => ({ ...m, state: 'error', error: err.message }));
        }
      } finally {
        abortRef.current = null;
        runningRef.current = [];
        setStreaming(false);
        setPhases([]);
      }
    },
    [sessionId, streaming, onSessionCreated, pushPhase],
  );

  /** Ask the last question again, dropping the turn that failed. */
  const retry = useCallback(() => {
    const question = lastQuestionRef.current;
    if (!question || streaming) return;
    // Drop the failed assistant turn and the user turn that prompted it; send
    // re-adds both. Without this the conversation grows a dead end per retry.
    setMessages((prev) => {
      const cut = [...prev];
      if (cut[cut.length - 1]?.role === 'assistant') cut.pop();
      if (cut[cut.length - 1]?.role === 'user') cut.pop();
      return cut;
    });
    send(question);
  }, [send, streaming]);

  // Fetch rows for a tool call on demand. Charts and tables both read from
  // here, so rows have exactly one source.
  const loadResult = useCallback(
    async (toolCallId) => {
      if (results[toolCallId]) return results[toolCallId];
      const payload = await api.getResult(toolCallId);
      setResults((prev) => ({ ...prev, [toolCallId]: payload }));
      return payload;
    },
    [results],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    messages,
    send,
    stop,
    retry,
    streaming,
    phases,
    loadError,
    loadingHistory,
    results,
    loadResult,
  };
}
