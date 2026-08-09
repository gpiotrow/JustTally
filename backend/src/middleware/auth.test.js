import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const queryMock = vi.fn();
vi.mock('../db/database.js', () => ({ default: { query: (...args) => queryMock(...args) } }));

const { signToken, requireAuth, requireAdmin } = await import('./auth.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const activeUser = {
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
  role: 'user',
  token_version: 0,
  disabled_at: null,
};

beforeEach(() => {
  queryMock.mockReset();
});

describe('signToken', () => {
  it('embeds only the identity and token version, not role/name/email', () => {
    const token = signToken(activeUser);
    const payload = jwt.decode(token);
    expect(payload).toMatchObject({ sub: 'user-1', tokenVersion: 0 });
    expect(payload.role).toBeUndefined();
    expect(payload.email).toBeUndefined();
  });

  it('defaults tokenVersion to 0 when the user row omits it', () => {
    const token = signToken({ id: 'user-2' });
    expect(jwt.decode(token)).toMatchObject({ sub: 'user-2', tokenVersion: 0 });
  });
});

describe('requireAuth', () => {
  it('rejects requests with no Authorization header', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed or forged token', async () => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } };
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const token = signToken(activeUser);
    queryMock.mockResolvedValueOnce({ rows: [] });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token for a disabled account even if not expired', async () => {
    const token = signToken(activeUser);
    queryMock.mockResolvedValueOnce({ rows: [{ ...activeUser, disabled_at: 1234567890 }] });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token whose version no longer matches the DB (revoked session)', async () => {
    const token = signToken(activeUser); // tokenVersion: 0
    queryMock.mockResolvedValueOnce({ rows: [{ ...activeUser, token_version: 1 }] });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid, active, current-version token and attaches fresh req.user', async () => {
    const token = signToken(activeUser);
    // DB now shows a promoted role — must win over anything in the token.
    queryMock.mockResolvedValueOnce({ rows: [{ ...activeUser, role: 'admin' }] });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toEqual({ sub: 'user-1', role: 'admin', name: 'Ada', email: 'ada@example.com' });
  });
});

describe('requireAdmin', () => {
  it('rejects a non-admin user', () => {
    const req = { user: { role: 'user' } };
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows an admin user through', () => {
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
