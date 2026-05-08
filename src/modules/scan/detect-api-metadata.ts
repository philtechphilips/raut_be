import * as fs from 'fs';
import * as path from 'path';

/** Leading slash, no trailing slash; empty string if unset. */
export function normalizeRoutePrefix(prefix: string | undefined | null): string {
  if (!prefix?.trim()) return '';
  let p = prefix.trim();
  if (!p.startsWith('/')) p = '/' + p;
  return p.replace(/\/+$/, '');
}

/** Join global prefix with controller-relative path (dedupe slashes). */
export function prefixEndpointPath(routePrefix: string, endpointPath: string): string {
  const pre = normalizeRoutePrefix(routePrefix);
  let route = (endpointPath ?? '').trim() || '/';
  if (!route.startsWith('/')) route = '/' + route;
  if (!pre || pre === '/') return route.replace(/\/{2,}/g, '/') || '/';
  if (route === '/') return pre;
  return (pre + route).replace(/\/{2,}/g, '/');
}

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

const ENV_URL_KEYS = [
  'APP_URL',
  'API_URL',
  'BASE_URL',
  'PUBLIC_API_URL',
  'SERVER_URL',
  'VITE_API_URL',
  'NEXT_PUBLIC_API_URL',
  'NUXT_PUBLIC_API_URL',
  'REACT_APP_API_URL',
];

export function detectBaseUrlFromEnvFiles(directory: string): string | undefined {
  const names = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
    '.env.example',
  ];
  for (const name of names) {
    const fp = path.join(directory, name);
    if (!fs.existsSync(fp)) continue;
    try {
      const env = parseEnvFile(fs.readFileSync(fp, 'utf8'));
      for (const k of ENV_URL_KEYS) {
        const v = env[k]?.trim();
        if (v && /^https?:\/\//i.test(v)) return v.replace(/\/+$/, '');
      }
    } catch {
      /* skip unreadable env */
    }
  }
  return undefined;
}

function combinePrefixSegments(
  globalPrefix?: string,
  uriVersion?: string,
): string | undefined {
  const parts: string[] = [];
  if (globalPrefix?.trim())
    parts.push(globalPrefix.trim().replace(/^\/+|\/+$/g, ''));
  if (uriVersion?.trim()) {
    let v = uriVersion.trim().replace(/^\/+|\/+$/g, '');
    if (/^\d+$/.test(v)) v = `v${v}`;
    else if (!/^v\d+/i.test(v)) v = `v${v}`;
    parts.push(v);
  }
  if (!parts.length) return undefined;
  return '/' + parts.join('/');
}

function detectNestFromBootstrap(content: string): {
  globalPrefix?: string;
  uriVersion?: string;
} {
  const gp = content.match(/\.setGlobalPrefix\s*\(\s*['"]([^'"]+)['"]/);
  const globalPrefix = gp?.[1]?.trim();

  let uriVersion: string | undefined;
  if (/enableVersioning\s*\(/s.test(content)) {
    const isUri =
      /VersioningType\s*\.\s*URI\b/.test(content) ||
      /\btype\s*:\s*['"]uri['"]/i.test(content);
    if (isUri) {
      const dv =
        content.match(/defaultVersion\s*:\s*['"]([^'"]+)['"]/) ??
        content.match(/\bdefaultVersion\s*:\s*(\d+)/);
      if (dv?.[1]) uriVersion = dv[1].trim();
    }
  }
  return { globalPrefix, uriVersion };
}

function detectNestRoutePrefix(files: string[]): string | undefined {
  const candidateFile = (f: string) =>
    /(?:^|[\\/])(main|bootstrap)\.(ts|js|mts|cjs)$/i.test(f);

  let globalPrefix: string | undefined;
  let uriVersion: string | undefined;

  const prioritized = [
    ...files.filter(candidateFile),
    ...files.filter((f) => /([\\/])app\.module\.(ts|js)$/i.test(f)),
  ];

  const seen = new Set<string>();
  for (const fp of prioritized) {
    if (seen.has(fp)) continue;
    seen.add(fp);
    try {
      const content = fs.readFileSync(fp, 'utf8');
      const n = detectNestFromBootstrap(content);
      if (n.globalPrefix) globalPrefix = n.globalPrefix;
      if (n.uriVersion) uriVersion = n.uriVersion;
    } catch {
      /* skip */
    }
  }

  return combinePrefixSegments(globalPrefix, uriVersion);
}

function detectExpressMountPrefix(content: string): string | undefined {
  const re = /\b(?:app|application)\s*\.\s*use\s*\(\s*['"](\/[^'"]*)['"]\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const p = m[1];
    if (!p || p === '/' || /[*?]/.test(p)) continue;
    const restStart = m.index + m[0].length;
    const rest = content.slice(restStart, restStart + 120);
    if (/\bexpress\s*\.\s*static\b/i.test(rest)) continue;
    return normalizeRoutePrefix(p);
  }
  return undefined;
}

function detectExpressRoutePrefix(files: string[]): string | undefined {
  const entryPat = /(?:^|[\\/])(index|main|server|app)\.(ts|js)$/i;
  const ordered = [
    ...files.filter((f) => entryPat.test(f)),
    ...files.filter((f) => /\.(ts|js)$/.test(f)),
  ];
  const seen = new Set<string>();
  for (const fp of ordered) {
    if (seen.has(fp)) continue;
    seen.add(fp);
    try {
      const hit = detectExpressMountPrefix(fs.readFileSync(fp, 'utf8'));
      if (hit) return hit;
    } catch {
      /* skip */
    }
  }
  return undefined;
}

function detectLaravelRoutePrefix(files: string[]): string | undefined {
  const ordered = [
    ...files.filter((f) => /[\\/]routes[\\/]api\.php$/i.test(f)),
    ...files.filter((f) => /[\\/]routes[\\/].+\.php$/i.test(f)),
  ];
  const seen = new Set<string>();
  for (const fp of ordered) {
    if (seen.has(fp)) continue;
    seen.add(fp);
    try {
      const content = fs.readFileSync(fp, 'utf8');
      const m = content.match(/Route::prefix\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (m?.[1]?.trim()) return normalizeRoutePrefix(m[1].trim());
    } catch {
      /* skip */
    }
  }
  return undefined;
}

export function detectRoutePrefix(framework: string, files: string[]): string | undefined {
  const f = framework.trim();
  if (f === 'NestJS') return detectNestRoutePrefix(files);
  if (f === 'Express') return detectExpressRoutePrefix(files);
  if (f === 'Laravel') return detectLaravelRoutePrefix(files);
  return undefined;
}

export function detectApiMetadata(
  directory: string,
  framework: string,
  allFiles: string[],
): { routePrefix?: string; inferredBaseUrl?: string } {
  const inferredBaseUrl = detectBaseUrlFromEnvFiles(directory);
  const rawPrefix = detectRoutePrefix(framework, allFiles);
  const routePrefix = rawPrefix ? normalizeRoutePrefix(rawPrefix) : undefined;
  return {
    ...(routePrefix ? { routePrefix } : {}),
    ...(inferredBaseUrl ? { inferredBaseUrl } : {}),
  };
}
