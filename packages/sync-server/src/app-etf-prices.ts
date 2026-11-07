// Fetches JSON from a user-configured price API for the German ETF Tax
// widget. Price APIs don't send CORS headers, so the browser can't call them
// directly. The response is passed through as is; the client picks the
// price out of it.
import express from 'express';
import rateLimit from 'express-rate-limit';
import { fetch } from 'undici';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from './util/middlewares';
import { assertUrlAllowed, createSsrfDispatcher } from './util/ssrf';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_000_000;

const dispatcher = createSsrfDispatcher({});

const app = express();
export { app as handlers };

app.use(requestLoggerMiddleware);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    legacyHeaders: false,
    standardHeaders: true,
  }),
);
app.use(express.json());
app.use(validateSessionMiddleware);

app.post('/fetch', async (req, res) => {
  const url: unknown = req.body?.url;
  if (typeof url !== 'string' || url === '') {
    res.status(400).send({ status: 'error', reason: 'missing-url' });
    return;
  }

  try {
    await assertUrlAllowed(url);
  } catch {
    res.status(403).send({ status: 'error', reason: 'url-not-allowed' });
    return;
  }

  let text: string;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      dispatcher,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      res.send({
        status: 'error',
        reason: 'upstream-status',
        details: { status: response.status },
      });
      return;
    }
    text = await response.text();
  } catch {
    res.send({ status: 'error', reason: 'upstream-unreachable' });
    return;
  }

  if (text.length > MAX_BYTES) {
    res.send({ status: 'error', reason: 'response-too-large' });
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    res.send({ status: 'error', reason: 'not-json' });
    return;
  }

  res.send({ status: 'ok', data: { json } });
});
