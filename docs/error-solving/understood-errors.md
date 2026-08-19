# Understood Errors & Failure Modes

## Error Patterns

### 1. convertToFile Raw Text to Base64 Corruption
- **Cause**: Configuring `n8n-nodes-base.convertToFile` with `operation: "toBinary"` on a raw UTF-8 string (e.g. `$json.html`). The node expects Base64 input; attempting to decode raw text corrupts output to ~22 bytes.
- **Solution**: Use a native Function v1 node with `Buffer.from(str, 'utf8').toString('base64')` to create the binary payload directly in memory.
- **Prevention**: Never use `convertToFile` with `toBinary` for raw text without prior Base64 encoding.

### 2. n8n Task Runner IPC Timeout (`LocalTaskRequester.requestExpired`)
- **Cause**: `n8n-nodes-base.code` (v2) runs in an external task runner container. Under queue congestion or binary buffer transfers, the 60s IPC request expires.
- **Solution**: Use native Function node (`n8n-nodes-base.function` v1) running in-process inside the main Node.js engine.
- **Prevention**: For binary packaging, batch loops, or large data aggregation (>500 items), use Function v1 nodes.

### 3. Gotenberg Chromium Stripping Dark CSS Backgrounds (Blank White Screenshot)
- **Cause**: Gotenberg's `/forms/chromium/screenshot/html` defaults to `emulatedMediaType: "print"`, which strips background colors and dark theme CSS.
- **Solution**: Explicitly set `emulatedMediaType: "screen"` and `waitDelay: "1s"` in multipart request body parameters.
- **Prevention**: Always include `emulatedMediaType: "screen"` on all Gotenberg HTML screenshot requests.

## Known Invariants

### 1. Report Formatting Preservation
- **Invariant**: When fixing connections, timeouts, or binary forwarding, never modify HTML templates, CSS styles, fonts, or calculation logic inside report formatting nodes.

### 2. Test Mode Safety Protocol
- **Invariant**: Ensure `TEST_MODE = true` and `TEST_CHAT_ID` are active before triggering test webhooks or workflow tests.
