// Minimal Server-Sent Events hub: any open `/api/events` connection gets a
// line whenever another session mutates schedule data, so pages can refetch
// and stay in sync without polling. Broadcast payloads carry a `type` purely
// for server-side log readability — the client currently just refetches
// whatever it has loaded on any message, no per-type filtering.
const clients = new Set();

export function subscribe(res) {
  clients.add(res);
}

export function unsubscribe(res) {
  clients.delete(res);
}

export function broadcast(type) {
  const payload = `data: ${JSON.stringify({ type, at: Date.now() })}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}
