import request from 'supertest';
import * as undici from 'undici';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handlers as app } from './app-etf-prices';
import { assertUrlAllowed } from './util/ssrf';

vi.mock('undici', async importOriginal => ({
  ...(await importOriginal<object>()),
  fetch: vi.fn(),
}));

vi.mock('./util/middlewares', () => ({
  requestLoggerMiddleware: (_req, _res, next) => next(),
  validateSessionMiddleware: (req, res, next) => {
    if (req.get('X-Actual-Token') !== 'valid') {
      res.status(401).send({ status: 'error', reason: 'unauthorized' });
      return;
    }
    next();
  },
}));

vi.mock('./util/ssrf', () => ({
  assertUrlAllowed: vi.fn(),
  createSsrfDispatcher: vi.fn(() => ({})),
}));

vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (_req, _res, next) => next()),
}));

const URL = 'https://quotes.example/api/IE00EXAMPLE1';

function mockResponse(body: string, status = 200) {
  vi.mocked(undici.fetch).mockResolvedValue(
    new undici.Response(status === 404 ? null : body, { status }),
  );
}

function post(body: Record<string, unknown>, token = 'valid') {
  return request(app).post('/fetch').set('X-Actual-Token', token).send(body);
}

describe('app-etf-prices', () => {
  beforeEach(() => {
    vi.mocked(undici.fetch).mockReset();
    vi.mocked(assertUrlAllowed).mockReset();
    vi.mocked(assertUrlAllowed).mockResolvedValue(undefined);
  });

  it('passes the JSON through', async () => {
    mockResponse('{"latestQuote":{"raw":127.24}}');
    const res = await post({ url: URL });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: { json: { latestQuote: { raw: 127.24 } } },
    });
    expect(vi.mocked(undici.fetch).mock.calls[0][0]).toBe(URL);
  });

  it('requires a session', async () => {
    const res = await post({ url: URL }, 'wrong');
    expect(res.status).toBe(401);
    expect(undici.fetch).not.toHaveBeenCalled();
  });

  it('requires a url', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('missing-url');
  });

  it('rejects urls the SSRF guard blocks', async () => {
    vi.mocked(assertUrlAllowed).mockRejectedValue(new Error('private'));
    const res = await post({ url: 'http://127.0.0.1/' });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('url-not-allowed');
    expect(undici.fetch).not.toHaveBeenCalled();
  });

  it('reports a response that is not JSON', async () => {
    mockResponse('<html></html>');
    const res = await post({ url: URL });
    expect(res.body).toEqual({ status: 'error', reason: 'not-json' });
  });

  it('reports an upstream error status', async () => {
    mockResponse('', 404);
    const res = await post({ url: URL });
    expect(res.body).toEqual({
      status: 'error',
      reason: 'upstream-status',
      details: { status: 404 },
    });
  });

  it('reports an unreachable upstream', async () => {
    vi.mocked(undici.fetch).mockRejectedValue(new Error('timeout'));
    const res = await post({ url: URL });
    expect(res.body).toEqual({
      status: 'error',
      reason: 'upstream-unreachable',
    });
  });
});
