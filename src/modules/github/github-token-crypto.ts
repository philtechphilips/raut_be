import * as crypto from 'crypto';

const IV_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.GITHUB_TOKEN_ENCRYPTION_KEY || '';
  if (raw.length >= 32) {
    return crypto.scryptSync(raw, 'routiq-github-salt', 32);
  }
  return crypto.scryptSync(
    process.env.JWT_SECRET || 'routiq_github_fallback',
    'routiq-github-salt',
    32,
  );
}

export function encryptGithubToken(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptGithubToken(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const data = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
