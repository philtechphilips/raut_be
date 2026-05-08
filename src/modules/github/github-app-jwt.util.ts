import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function base64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
    
/**
 * PEM from disk (`GITHUB_APP_PRIVATE_KEY_PATH`) or env (`GITHUB_APP_PRIVATE_KEY`):
 * quoted single-line with `\n`, or raw base64 of full PEM file.
 */
export function loadGithubAppPrivateKey(): string {
  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH?.trim();
  if (keyPath) {
    const resolved = path.isAbsolute(keyPath)
      ? keyPath
      : path.resolve(process.cwd(), keyPath);
    try {
      return fs.readFileSync(resolved, 'utf8').replace(/\r\n/g, '\n').trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Could not read GITHUB_APP_PRIVATE_KEY_PATH (${resolved}): ${msg}`,
      );
    }
  }

  let raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      'Set GITHUB_APP_PRIVATE_KEY_PATH (path to .pem file) or GITHUB_APP_PRIVATE_KEY (inline/base64)',
    );
  }
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1).trim();
  }
  raw = raw.replace(/^\uFEFF/, '');
  if (raw.includes('BEGIN')) {
    return raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  }
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (decoded.includes('BEGIN')) {
      return decoded.replace(/\r\n/g, '\n').trim();
    }
  } catch {
    /* ignore */
  }
  return raw.replace(/\r\n/g, '\n').trim();
}

/** RS256 JWT for GitHub App installation API (iat/exp/iss only). */
export function createGithubAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID?.trim();
  if (!appId) {
    throw new Error('GITHUB_APP_ID is not set');
  }
  const keyPem = loadGithubAppPrivateKey();
  let privateKey: crypto.KeyObject;
  try {
    privateKey = crypto.createPrivateKey({ key: keyPem, format: 'pem' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `GITHUB_APP_PRIVATE_KEY is not valid PEM (JWT signing failed: ${msg}). ` +
        'Put the GitHub App key in .env as one quoted line with \\n between PEM lines, ' +
        'or set GITHUB_APP_PRIVATE_KEY to the base64 encoding of the full .pem file. ' +
        'See README (GitHub App env vars).',
    );
  }
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
  const sig = sign.sign(privateKey);
  const sigB64 = Buffer.from(sig)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signInput}.${sigB64}`;
}

export function isGithubAppConfigured(): boolean {
  const id = process.env.GITHUB_APP_ID?.trim();
  const inlineKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  const pathKey = process.env.GITHUB_APP_PRIVATE_KEY_PATH?.trim();
  return Boolean(id && (inlineKey || pathKey));
}
