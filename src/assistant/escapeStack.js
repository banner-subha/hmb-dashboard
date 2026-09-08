// Who owns Escape.
//
// The panel closes on Escape, but so should a dropdown or a delete
// confirmation sitting inside it — innermost first, and only one per press.
// Doing that with event phases does not work: every listener here is on
// `window`, and when the event's target IS window, capture and bubble
// listeners fire in registration order rather than by phase. The panel
// registers first, so it would always win and stopPropagation would arrive too
// late.
//
// So ordering is made explicit instead of inferred. Layers register on open,
// the topmost is dismissed on Escape, and the panel closes only when the stack
// is empty.

const layers = [];

/**
 * Register a dismissible layer. Returns the unregister function, so it drops
 * straight into a useEffect cleanup:
 *
 *   useEffect(() => (open ? pushLayer(close) : undefined), [open, close]);
 */
export function pushLayer(dismiss) {
  layers.push(dismiss);
  return () => {
    const i = layers.lastIndexOf(dismiss);
    if (i !== -1) layers.splice(i, 1);
  };
}

/**
 * Dismiss the innermost layer. Returns true when it handled the press, which
 * is the caller's signal to leave the surface beneath it alone.
 */
export function dismissTop() {
  const dismiss = layers[layers.length - 1];
  if (!dismiss) return false;
  dismiss();
  return true;
}
