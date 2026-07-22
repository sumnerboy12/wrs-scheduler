import { Router } from 'express';
import { subscribe, unsubscribe } from '../lib/events.js';

const router = Router();

// One-way push (SSE) rather than WebSockets — every state change already
// goes through a normal REST write, so all the client needs is "something
// changed, refetch", not a bidirectional channel.
router.get('/', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  subscribe(res);

  // Keeps intermediary proxies/load balancers from timing out an idle
  // connection, and doubles as a way for the client to notice a dead
  // connection if it ever stops arriving.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe(res);
  });
});

export default router;
