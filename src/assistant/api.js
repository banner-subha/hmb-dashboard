// Client for the sales agent service.
//
// The browser calls Cloud Run directly. Do not route this through a Netlify
// proxy or redirect: Netlify buffers responses and the SSE stream dies.
//
// The assistant never talks to the sales Postgres itself. Every figure
// arrives through this API.

const AUTH_KEY = 'hmb_auth';

export class AgentError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AgentError';
    this.status = status;
  }
}

// Checked on use, not at import. Throwing at module load would take the whole
// dashboard down to a blank page over a missing build variable; failing on the
// first call surfaces the same problem as a readable message on the sign-in
// form. There is still no default and no fallback URL.
function base() {
  const url = import.meta.env.VITE_AGENT_URL;
  if (!url) {
    throw new AgentError(
      'VITE_AGENT_URL is not set. Point it at the agent service — ' +
        'http://localhost:8080 in development, the Cloud Run URL in production.',
      0,
    );
  }
  return url.replace(/\/+$/, '');
}

// Read the token fresh on every request. Caching it in a module variable is
// how the first question after a long idle ends up 401ing on a stale token.
export function readToken() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken) return null;
    return parsed.accessToken;
  } catch {
    return null;
  }
}

function authHeader() {
  const token = readToken();
  if (!token) {
    throw new AgentError('Your session has expired. Sign in again.', 401);
  }
  return { Authorization: `Bearer ${token}` };
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${base()}${path}`, {
    method,
    signal,
    headers: {
      ...authHeader(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('hmb:unauthorized'));
    throw new AgentError('Your session has expired. Sign in again.', 401);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new AgentError(detail || `${method} ${path} failed (${res.status})`, res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── auth ────────────────────────────────────────────────────────────────────

// How long to wait for a sign-in before giving up. The service answers in
// about a second warm; a cold instance can take several. Twenty is generous
// without leaving someone staring at a dead spinner.
const LOGIN_TIMEOUT_MS = 20000;

/**
 * Sign in.
 *
 * Retries once on a transport failure. A cold instance or a momentary network
 * blip is not a configuration problem, and telling someone to go and check
 * VITE_AGENT_URL when the answer is "try again" wastes their afternoon.
 *
 * An HTTP answer of any kind is never retried: 401 means the password is
 * wrong, and repeating it would only look like a brute-force attempt.
 */
export async function login(username, password) {
  const url = `${base()}/auth/login`;
  let transportError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
      });
    } catch (err) {
      transportError = err;
      continue;
    }

    if (res.status === 401) {
      throw new AgentError('Invalid username or password', 401);
    }
    if (!res.ok) {
      throw new AgentError(
        `The sign-in service answered ${res.status}. This is the service, not your password.`,
        res.status,
      );
    }
    return res.json();
  }

  const timedOut =
    transportError?.name === 'TimeoutError' || transportError?.name === 'AbortError';
  throw new AgentError(
    timedOut
      ? 'The sign-in service did not answer in time. It may be starting up — try again in a moment.'
      : `Could not reach the sign-in service: ${transportError?.message || 'network error'}. ` +
        'Check your connection, then that the agent is running.',
    timedOut ? 408 : -1,
  );
}

// ── sessions ────────────────────────────────────────────────────────────────

export const listSessions = () => request('/sessions');
export const getSession = (id) => request(`/sessions/${id}`);
export const renameSession = (id, title) =>
  request(`/sessions/${id}`, { method: 'PATCH', body: { title } });
export const deleteSession = (id) => request(`/sessions/${id}`, { method: 'DELETE' });
export const getResult = (toolCallId) => request(`/results/${toolCallId}`);
export const getFreshness = () => request('/freshness');

/**
 * Delete many sessions.
 *
 * The service has no range delete, so this is a throttled loop over the
 * single-session endpoint. It reports progress per settled request and never
 * throws: the caller needs to know which ids actually went, because a partial
 * result is the normal failure mode here rather than an exceptional one.
 *
 * A 401 stops the run immediately. Grinding through forty more requests on a
 * dead token would fire forty unauthorized events and log the user out mid-way
 * through a progress bar.
 */
export async function deleteSessions(ids, { onProgress, concurrency = 4 } = {}) {
  const queue = [...ids];
  const deleted = [];
  const failed = [];
  let settled = 0;
  let expired = false;

  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      try {
        await deleteSession(id);
        deleted.push(id);
      } catch (err) {
        failed.push({ id, message: err.message });
        if (err.status === 401) {
          expired = true;
          // Everything still queued is a failure, not an untried request.
          while (queue.length) failed.push({ id: queue.shift(), message: 'Not attempted' });
        }
      }
      settled += 1;
      onProgress?.(settled, ids.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, ids.length)) }, worker),
  );

  return { deleted, failed, expired };
}

// ── chat stream ─────────────────────────────────────────────────────────────

/**
 * POST /chat and dispatch each typed SSE event to onEvent(name, data).
 * The `session` event always arrives first, before any token.
 */
export async function streamChat({ message, sessionId, onEvent, signal }) {
  const res = await fetch(`${base()}/chat`, {
    method: 'POST',
    signal,
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId ?? null }),
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('hmb:unauthorized'));
    throw new AgentError('Your session has expired. Sign in again.', 401);
  }
  if (!res.ok) {
    throw new AgentError(await res.text(), res.status);
  }
  if (!res.body) {
    throw new AgentError('The agent returned no stream', 502);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    // SSE permits CRLF line endings, so normalise before framing.
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    // Frames are separated by a blank line.
    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      let name = 'message';
      const dataLines = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      try {
        onEvent(name, JSON.parse(dataLines.join('\n')));
      } catch {
        // A malformed frame is worth surfacing, not swallowing.
        onEvent('error', { message: `Unparseable ${name} event from the agent` });
      }
    }
  }
}
