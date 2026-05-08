import * as crypto from 'crypto';

function base64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** PEM from env: literal multiline or `\n`-escaped or base64-encoded PEM. */
export function loadGithubAppPrivateKey(): string {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error('GITHUB_APP_PRIVATE_KEY is not set');
  }
  if (raw.includes('BEGIN')) {
    return raw.replace(/\\n/g, '\n');
  }
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (decoded.includes('BEGIN')) return decoded;
  } catch {
    /* ignore */
  }
  return raw;
}

/** RS256 JWT for GitHub App installation API (iat/exp/iss only). */
export function createGithubAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID?.trim();
  if (!appId) {
    throw new Error('GITHUB_APP_ID is not set');
  }
  const keyPem = loadGithubAppPrivateKey();
  const header = base64urlJson({ alg: 'RS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64urlJson({
    iat: now - 60,
    exp: now + 10 * 60,
    iss: appId,
  });
  const signInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  sign.end();
  const sig = sign.sign(keyPem);
  const sigB64 = Buffer.from(sig)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signInput}.${sigB64}`;
}

export function isGithubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID?.trim() &&
      process.env.GITHUB_APP_PRIVATE_KEY?.trim(),
  );
}
