import { Router, type IRouter, type Request, type Response } from 'express';
import crypto from 'crypto';

const router: IRouter = Router();

const COOKIE_NAME = 'admin_token';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function getSecret(): string {
  return process.env.ADMIN_COOKIE_SECRET ?? 'default-admin-secret-change-me';
}

function getAdminUsername(): string {
  return process.env.ADMIN_USERNAME ?? 'admin';
}

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? 'admin123';
}

function signToken(payload: string): string {
  const hmac = crypto.createHmac('sha256', getSecret());
  hmac.update(payload);
  return `${payload}.${hmac.digest('hex')}`;
}

function verifyToken(token: string): { valid: boolean; expired: boolean } {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return { valid: false, expired: false };
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  try {
    const sigValid = crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    if (!sigValid) return { valid: false, expired: false };
  } catch {
    return { valid: false, expired: false };
  }

  const parts = payload.split(':');
  const ts = Number(parts[1]);
  if (isNaN(ts)) return { valid: false, expired: false };
  if (Date.now() - ts > COOKIE_MAX_AGE_MS) return { valid: false, expired: true };

  return { valid: true, expired: false };
}

export function isAdminTokenValid(req: Request): boolean {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || typeof token !== 'string') return false;
  const { valid } = verifyToken(token);
  return valid;
}

router.post('/admin/login', (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const validUser = username === getAdminUsername();
  const validPass = password === getAdminPassword();

  if (!validUser || !validPass) {
    setTimeout(() => {
      res.status(401).json({ error: 'Invalid credentials' });
    }, 400);
    return;
  }

  const payload = `admin:${Date.now()}`;
  const token = signToken(payload);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });

  res.json({ ok: true });
});

router.post('/admin/logout-admin', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/admin/session', (req: Request, res: Response) => {
  res.json({ authenticated: isAdminTokenValid(req) });
});

export default router;
