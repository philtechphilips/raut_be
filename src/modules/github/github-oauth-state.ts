import * as crypto from 'crypto';

/** Match `JwtModule` / `JwtStrategy` default so dev setups behave consistently. */
function secret(): string {
  return (
    process.env.GITHUB_OAUTH_STATE_SECRET ||
    process.env.JWT_SECRET ||
    'routiq_super_secret_key'
  );
}

export function signGithubOAuthState(userId: string): string {
  const payload = JSON.stringify({
    uid: userId,
    exp: Date.now() + 30 * 60 * 1000,
  });
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return Buffer.from(`${payload}::${sig}`).toString('base64url');
}

export type GithubOAuthStateVerify =
  | { ok: true; userId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyGithubOAuthState(token: string): GithubOAuthStateVerify {
  const normalized = typeof token === 'string' ? token.trim() : '';
  if (!normalized) {
    return { ok: false, reason: 'malformed' };
  }

  let raw: string;
  try {
    raw = Buffer.from(normalized, 'base64url').toString('utf8');
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const sep = raw.lastIndexOf('::');
  if (sep < 0) {
    return { ok: false, reason: 'malformed' };
  }
  const payload = raw.slice(0, sep);
  const sig = raw.slice(sep + 2).trim();
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex');

  let parsed: { uid?: string; exp?: number };
  try {
    parsed = JSON.parse(payload) as { uid?: string; exp?: number };
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof parsed.uid !== 'string' || typeof parsed.exp !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (Date.now() > parsed.exp) {
    return { ok: false, reason: 'expired' };
  }

  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  return { ok: true, userId: parsed.uid };
}
