import * as crypto from 'crypto';

const MIN_SOURCE_LENGTH = 12;

export function handlerSourceFingerprint(
  source: string | undefined,
): string | undefined {
  if (!source || source.length < MIN_SOURCE_LENGTH) return undefined;
  const normalized = source.replace(/\r\n/g, '\n').trimEnd();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}
