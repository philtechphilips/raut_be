import * as crypto from 'crypto';

function secret(): string {
  return (
    process.env.GITHUB_OAUTH_STATE_SECRET ||
    process.env.JWT_SECRET ||
    'github_oauth_state_dev_only'
  );
}

export function signGithubOAuthState(userId: string): string {
  const payload = JSON.stringify({
    uid: userId,
    exp: Date.now() + 15 * 60 * 1000,
  });
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return Buffer.from(`${payload}::${sig}`).toString('base64url');
}

export function verifyGithubOAuthState(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const sep = raw.lastIndexOf('::');
    if (sep < 0) return null;
    const payload = raw.slice(0, sep);
    const sig = raw.slice(sep + 2);
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(payload) as { uid?: string; exp?: number };
    if (typeof parsed.uid !== 'string' || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}
