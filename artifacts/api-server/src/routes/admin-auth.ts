import { Router, type IRouter, type Request, type Response } from 'express';
import crypto from 'crypto';

const router: IRouter = Router();

const COOKIE_NAME = 'admin_token';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo1234';

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

function verifyToken(token: string): { valid: boolean; expired: boolean; role: 'admin' | 'demo' | null } {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return { valid: false, expired: false, role: null };
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  try {
    const sigValid = crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    if (!sigValid) return { valid: false, expired: false, role: null };
  } catch {
    return { valid: false, expired: false, role: null };
  }

  const parts = payload.split(':');
  const role = parts[0] as 'admin' | 'demo';
  const ts = Number(parts[1]);
  if (isNaN(ts)) return { valid: false, expired: false, role: null };
  if (Date.now() - ts > COOKIE_MAX_AGE_MS) return { valid: false, expired: true, role: null };

  return { valid: true, expired: false, role };
}

export function isAdminTokenValid(req: Request): boolean {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || typeof token !== 'string') return false;
  const { valid } = verifyToken(token);
  return valid;
}

export function getAdminRole(req: Request): 'admin' | 'demo' | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || typeof token !== 'string') return null;
  const { valid, role } = verifyToken(token);
  return valid ? role : null;
}

export function isDemoAdmin(req: Request): boolean {
  return getAdminRole(req) === 'demo';
}

router.post('/admin/login', (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const isFullAdmin = username === getAdminUsername() && password === getAdminPassword();
  const isDemoLogin = username === DEMO_USERNAME && password === DEMO_PASSWORD;

  if (!isFullAdmin && !isDemoLogin) {
    setTimeout(() => {
      res.status(401).json({ error: 'Invalid credentials' });
    }, 400);
    return;
  }

  const role = isFullAdmin ? 'admin' : 'demo';
  const payload = `${role}:${Date.now()}`;
  const token = signToken(payload);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });

  res.json({ ok: true, role });
});

router.post('/admin/logout-admin', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/admin/session', (req: Request, res: Response) => {
  const role = getAdminRole(req);
  const hasReplitAdmin = (req as any).isAuthenticated?.() && ((req as any).user as any)?.isAdmin;
  if (hasReplitAdmin) {
    res.json({ authenticated: true, role: 'admin' });
  } else if (role) {
    res.json({ authenticated: true, role });
  } else {
    res.json({ authenticated: false, role: null });
  }
});

export default router;
