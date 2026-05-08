import type { SyncProjectDto } from '../project/dto/sync-project.dto';

export type GithubApiEndpoint = {
  id: string;
  method: string;
  path: string;
  category: string;
  sourceFile: string;
  syncAnchor?: string | null;
  handlerFingerprint?: string | null;
};

function normalizeAnchor(s: string | null | undefined) {
  return (s ?? '').trim().replace(/\\/g, '/');
}

function normalizeCategory(c: string | undefined) {
  return (c || 'General').trim() || 'General';
}

function normMethod(m: string) {
  return m.trim().toUpperCase();
}

function tripleKey(method: string, path: string, category: string) {
  return `${normMethod(method)}\t${path}\t${normalizeCategory(category)}`;
}

/**
 * Attach endpoint ids before sync (same heuristics as CLI) so re-scans update rows.
 */
export function mergeSyncPayloadWithEndpointIds(
  projects: { name: string; endpoints?: GithubApiEndpoint[] }[],
  payload: SyncProjectDto,
): SyncProjectDto {
  const proj = projects.find((p) => p.name === payload.name);
  const apiEps = proj?.endpoints;
  if (!apiEps?.length) return payload;

  const consumed = new Set<string>();
  const pickId = (ep: SyncProjectDto['endpoints'][number]): string | undefined => {
    const pool = apiEps.filter((e) => !consumed.has(e.id));

    const dtoAnchor = normalizeAnchor(ep.syncAnchor);
    if (dtoAnchor.length > 0) {
      const byAnchor = pool.find(
        (e) => normalizeAnchor(e.syncAnchor) === dtoAnchor,
      );
      if (byAnchor) {
        consumed.add(byAnchor.id);
        return byAnchor.id;
      }
    }

    const dtoFp = ep.handlerFingerprint?.trim().toLowerCase() ?? '';
    if (dtoFp) {
      const byFp = pool.find(
        (e) => (e.handlerFingerprint ?? '').toLowerCase() === dtoFp,
      );
      if (byFp) {
        consumed.add(byFp.id);
        return byFp.id;
      }
    }

    const dtoTriple = tripleKey(ep.method, ep.path, ep.category);
    const tripleHit = pool.find(
      (e) => tripleKey(e.method, e.path, e.category) === dtoTriple,
    );
    if (tripleHit) {
      consumed.add(tripleHit.id);
      return tripleHit.id;
    }

    const sameMethodPath = pool.filter(
      (e) => normMethod(e.method) === normMethod(ep.method) && e.path === ep.path,
    );
    if (sameMethodPath.length === 1) {
      consumed.add(sameMethodPath[0].id);
      return sameMethodPath[0].id;
    }

    const sameMethodFile = pool.filter(
      (e) =>
        normMethod(e.method) === normMethod(ep.method) &&
        e.sourceFile === ep.sourceFile,
    );
    if (sameMethodFile.length === 1) {
      consumed.add(sameMethodFile[0].id);
      return sameMethodFile[0].id;
    }

    return undefined;
  };

  return {
    ...payload,
    endpoints: payload.endpoints.map((ep) => {
      const id = pickId(ep);
      return id != null ? { ...ep, id } : ep;
    }),
  };
}
