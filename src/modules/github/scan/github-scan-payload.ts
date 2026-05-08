import type { SyncProjectDto } from '../../project/dto/sync-project.dto';
import { handlerSourceFingerprint } from './github-handler-fingerprint';

function requestBodyString(ep: {
  bodySample?: unknown;
  body?: { name: string; type?: string }[];
}): string {
  if (ep.bodySample !== undefined && ep.bodySample !== null) {
    return JSON.stringify(ep.bodySample, null, 2);
  }
  if (ep.body?.length) {
    const sample: Record<string, string> = {};
    for (const f of ep.body) {
      sample[f.name] = (f.type as string) || 'string';
    }
    return JSON.stringify(sample, null, 2);
  }
  return '';
}

function headersForSync(ep: { headers?: { name: string; type?: string; description?: string }[] }) {
  return (ep.headers ?? []).map((h) => ({
    key: h.name,
    value: [h.type, h.description].filter(Boolean).join(' · ') || '',
  }));
}

/** Build sync DTO from scanner ProjectScanResult (same mapping as CLI). */
export function scanResultToSyncPayload(result: {
  name: string;
  description?: string;
  framework: string;
  folderOverviews?: { name: string; description: string }[];
  routePrefix?: string;
  inferredBaseUrl?: string;
  endpoints: Array<{
    method: string;
    path: string;
    aiName?: string;
    folder: string;
    aiCategory?: string;
    sourceFile: string;
    description?: string;
    body?: { name: string; type?: string; required?: boolean; description?: string }[];
    params?: { name: string; type?: string; required?: boolean; description?: string }[];
    query?: { name: string; type?: string; required?: boolean; description?: string }[];
    headers?: { name: string; type?: string; description?: string }[];
    response?: string;
    syncAnchor?: string;
    handlerSource?: string;
    responseScenarios?: { status: number; description: string; data: unknown }[];
  }>;
}): SyncProjectDto {
  return {
    name: result.name,
    description: result.description || '',
    framework: result.framework,
    folderOverviews: result.folderOverviews ?? [],
    ...(result.routePrefix ? { routePrefix: result.routePrefix } : {}),
    ...(result.inferredBaseUrl ? { inferredBaseUrl: result.inferredBaseUrl } : {}),
    endpoints: result.endpoints.map((ep) => {
      const fp = handlerSourceFingerprint(ep.handlerSource);
      const base = {
        method: ep.method,
        path: ep.path,
        name: ep.aiName || ep.path,
        category: ep.aiCategory || ep.folder || 'General',
        sourceFile: ep.sourceFile,
        description: ep.description || '',
        body: requestBodyString(ep),
        params: ep.params || [],
        query: ep.query || [],
        headers: headersForSync(ep),
        response: ep.response || '',
        ...(ep.syncAnchor ? { syncAnchor: ep.syncAnchor } : {}),
        ...(fp ? { handlerFingerprint: fp } : {}),
      };
      if (!ep.responseScenarios?.length) {
        return base;
      }
      return {
        ...base,
        scenarios: ep.responseScenarios.map((s) => ({
          status: s.status,
          description: s.description,
          body: s.data,
        })),
      };
    }),
  };
}
