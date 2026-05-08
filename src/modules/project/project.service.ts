import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Endpoint, Project } from './models/project.model';
import { SyncEndpointDto, SyncProjectDto } from './dto/sync-project.dto';
import { UpdateEndpointDto } from './dto/update-endpoint.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { DeleteFolderDto } from './dto/delete-folder.dto';
import { ReorderProjectsDto } from './dto/reorder-projects.dto';
import { ReorderFoldersDto } from './dto/reorder-folders.dto';
import { ReorderEndpointsDto } from './dto/reorder-endpoints.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CreateEndpointDto } from './dto/create-endpoint.dto';

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Endpoint)
    private readonly endpointRepository: Repository<Endpoint>,
  ) {}

  private mergeFolderOrder(
    previous: string[] | null | undefined,
    categoryNames: Set<string>,
  ): string[] | null {
    if (categoryNames.size === 0) {
      categoryNames = new Set(['General']);
    }
    const remaining = new Set(categoryNames);
    const out: string[] = [];
    for (const name of previous ?? []) {
      if (remaining.has(name)) {
        out.push(name);
        remaining.delete(name);
      }
    }
    for (const name of categoryNames) {
      if (remaining.has(name)) {
        out.push(name);
        remaining.delete(name);
      }
    }
    return out.length ? out : null;
  }

  private normalizeApiRoutePrefix(raw: string | undefined | null): string {
    if (!raw?.trim()) return '';
    let p = raw.trim();
    if (!p.startsWith('/')) p = `/${p}`;
    return p.replace(/\/+$/, '');
  }

  async sync(userId: number, dto: SyncProjectDto) {
    let project = await this.projectRepository.findOne({
      where: { name: dto.name, userId },
    });

    if (!project) {
      const maxRow = await this.projectRepository
        .createQueryBuilder('p')
        .select('MAX(p.sortOrder)', 'max')
        .where('p.userId = :uid', { uid: userId })
        .getRawOne<{ max: number | null }>();
      const nextOrder = Number(maxRow?.max ?? -1) + 1;

      project = this.projectRepository.create({
        name: dto.name,
        framework: dto.framework,
        description: dto.description ?? null,
        folderOverviews: dto.folderOverviews?.length ? dto.folderOverviews : null,
        userId,
        sortOrder: nextOrder,
      });
      project = await this.projectRepository.save(project);
    } else {
      project.framework = dto.framework;
      if (dto.description !== undefined) project.description = dto.description;
      if (dto.folderOverviews !== undefined) {
        project.folderOverviews = dto.folderOverviews?.length ? dto.folderOverviews : null;
      }
      await this.projectRepository.save(project);
    }

    let metaDirty = false;
    if (dto.routePrefix !== undefined) {
      const n = this.normalizeApiRoutePrefix(dto.routePrefix);
      project.apiRoutePrefix = n.length ? n : null;
      metaDirty = true;
    }
    if (dto.inferredBaseUrl !== undefined && dto.inferredBaseUrl.trim()) {
      const url = dto.inferredBaseUrl.trim().replace(/\/+$/, '');
      if (!project.docsBaseUrl?.trim()) {
        project.docsBaseUrl = url;
        metaDirty = true;
      }
    }
    if (metaDirty) {
      await this.projectRepository.save(project);
    }

    const existingEndpoints = await this.endpointRepository.find({
      where: { projectId: project.id },
    });

    const normCat = (c: string | undefined) =>
      (c || 'General').trim() || 'General';
    const normMethod = (m: string) => m.trim().toUpperCase();
    const normAnchor = (s: string | null | undefined) =>
      (s ?? '').trim().replace(/\\/g, '/');
    const tripleKey = (method: string, path: string, category: string) =>
      `${normMethod(method)}\t${path}\t${normCat(category)}`;

    const consumedIds = new Set<number>();

    const pickMatchingEndpoint = (
      ep: SyncEndpointDto,
    ): Endpoint | undefined => {
      const pool = existingEndpoints.filter((e) => !consumedIds.has(e.id));

      if (ep.id != null && Number.isFinite(ep.id)) {
        const byId = pool.find((e) => e.id === ep.id);
        if (byId) return byId;
      }

      const dtoAnchor = normAnchor(ep.syncAnchor);
      if (dtoAnchor.length > 0) {
        const byAnchor = pool.find((e) => normAnchor(e.syncAnchor) === dtoAnchor);
        if (byAnchor) return byAnchor;
      }

      const dtoFp = ep.handlerFingerprint?.trim().toLowerCase();
      if (dtoFp) {
        const byFp = pool.find(
          (e) => e.handlerFingerprint?.toLowerCase() === dtoFp,
        );
        if (byFp) return byFp;
      }

      const dtoTriple = tripleKey(ep.method, ep.path, ep.category);
      const tripleHit = pool.find(
        (e) => tripleKey(e.method, e.path, e.category) === dtoTriple,
      );
      if (tripleHit) return tripleHit;

      const sameMethodPath = pool.filter(
        (e) =>
          normMethod(e.method) === normMethod(ep.method) && e.path === ep.path,
      );
      if (sameMethodPath.length === 1) return sameMethodPath[0];

      const sameMethodFile = pool.filter(
        (e) =>
          normMethod(e.method) === normMethod(ep.method) &&
          e.sourceFile === ep.sourceFile,
      );
      if (sameMethodFile.length === 1) return sameMethodFile[0];

      return undefined;
    };

    const categoriesFromDto = new Set<string>();
    for (const ep of dto.endpoints ?? []) {
      categoriesFromDto.add(normCat(ep.category));
    }
    if (categoriesFromDto.size === 0) {
      categoriesFromDto.add('General');
    }

    const toPersist: Endpoint[] = [];
    let globalIdx = 0;

    for (const ep of dto.endpoints ?? []) {
      const matched = pickMatchingEndpoint(ep);
      const scenarios =
        ep.scenarios !== undefined && ep.scenarios !== null
          ? ep.scenarios
          : (matched?.scenarios ?? null);

      const syncAnchor =
        ep.syncAnchor != null && normAnchor(ep.syncAnchor).length > 0
          ? normAnchor(ep.syncAnchor)
          : (matched?.syncAnchor ?? null);
      const handlerFingerprint =
        ep.handlerFingerprint != null && ep.handlerFingerprint.trim() !== ''
          ? ep.handlerFingerprint.trim().toLowerCase()
          : (matched?.handlerFingerprint ?? null);

      if (matched) {
        consumedIds.add(matched.id);
        matched.method = ep.method;
        matched.path = ep.path;
        matched.name = ep.name;
        matched.category = ep.category;
        matched.sourceFile = ep.sourceFile;
        matched.syncAnchor = syncAnchor;
        matched.handlerFingerprint = handlerFingerprint;
        matched.description = ep.description ?? null;
        matched.body = ep.body ?? null;
        matched.scenarios = scenarios;
        matched.params = ep.params ?? null;
        matched.query = ep.query ?? null;
        matched.headers = ep.headers ?? null;
        matched.responseSummary = ep.response ?? null;
        toPersist.push(matched);
      } else {
        toPersist.push(
          this.endpointRepository.create({
            projectId: project!.id,
            method: ep.method,
            path: ep.path,
            name: ep.name,
            category: ep.category,
            sortOrder: globalIdx,
            sourceFile: ep.sourceFile,
            syncAnchor,
            handlerFingerprint,
            description: ep.description ?? null,
            body: ep.body ?? null,
            scenarios,
            params: ep.params ?? null,
            query: ep.query ?? null,
            headers: ep.headers ?? null,
            responseSummary: ep.response ?? null,
          }),
        );
      }
      globalIdx++;
    }

    const orphanIds = existingEndpoints
      .filter((e) => !consumedIds.has(e.id))
      .map((e) => e.id);
    if (orphanIds.length > 0) {
      await this.endpointRepository.delete({ id: In(orphanIds) });
    }

    if (toPersist.length > 0) {
      await this.endpointRepository.save(toPersist);
    }

    project.folderOrder = this.mergeFolderOrder(project.folderOrder, categoriesFromDto);
    await this.projectRepository.save(project);

    return {
      success: true,
      message: 'Project synced successfully',
      projectId: project.id,
    };
  }

  async getMyProjects(userId: number) {
    const projects = await this.projectRepository.find({
      where: { userId },
      relations: { endpoints: true },
    });
    projects.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id,
    );
    for (const p of projects) {
      if (p.endpoints?.length) {
        p.endpoints.sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id,
        );
      }
    }
    return { success: true, projects };
  }

  async updateEndpoint(userId: number, id: number, dto: UpdateEndpointDto) {
    const endpoint = await this.endpointRepository.findOne({
      where: { id, project: { userId } },
      relations: { project: true },
    });

    if (!endpoint) {
      throw new NotFoundException('Endpoint not found or unauthorized');
    }

    if (dto.name) endpoint.name = dto.name;
    if (dto.category) endpoint.category = dto.category;
    if (dto.path !== undefined) {
      const raw = dto.path.trim();
      if (!raw) {
        throw new BadRequestException('Path cannot be empty');
      }
      endpoint.path = raw.startsWith('/') ? raw : `/${raw}`;
    }
    if (dto.method !== undefined && dto.method.trim()) {
      endpoint.method = dto.method.trim().toUpperCase().slice(0, 10);
    }
    if (dto.scenarios !== undefined) endpoint.scenarios = dto.scenarios as unknown;

    await this.endpointRepository.save(endpoint);

    return { success: true, message: 'Endpoint updated', endpoint };
  }

  async renameFolder(userId: number, dto: RenameFolderDto) {
    const project = await this.projectRepository.findOne({
      where: { id: dto.projectId, userId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.endpointRepository.update(
      { projectId: dto.projectId, category: dto.oldCategory },
      { category: dto.newCategory },
    );

    let dirty = false;
    if (project.folderOrder?.length) {
      project.folderOrder = project.folderOrder.map((n) =>
        n === dto.oldCategory ? dto.newCategory : n,
      );
      dirty = true;
    }
    if (project.folderOverviews?.some((o) => o.name === dto.oldCategory)) {
      project.folderOverviews = project.folderOverviews.map((o) =>
        o.name === dto.oldCategory ? { ...o, name: dto.newCategory } : o,
      );
      dirty = true;
    }
    if (dirty) {
      await this.projectRepository.save(project);
    }

    return { success: true, message: 'Folder renamed successfully' };
  }

  async create(userId: number, dto: CreateProjectDto) {
    const maxRow = await this.projectRepository
      .createQueryBuilder('p')
      .select('MAX(p.sortOrder)', 'max')
      .where('p.userId = :uid', { uid: userId })
      .getRawOne<{ max: number | null }>();
    const nextOrder = Number(maxRow?.max ?? -1) + 1;

    const project = this.projectRepository.create({
      name: dto.name,
      framework: dto.framework ?? 'Manual',
      userId,
      sortOrder: nextOrder,
      folderOrder: ['General'],
    });
    await this.projectRepository.save(project);
    return {
      success: true,
      message: 'Collection created successfully',
      project,
    };
  }

  private normalizeCategory(raw: string | undefined | null): string {
    return (raw || 'General').trim() || 'General';
  }

  private folderNameKeys(project: Project): Set<string> {
    const keys = new Set<string>();
    for (const e of project.endpoints ?? []) {
      keys.add(this.normalizeCategory(e.category).toLowerCase());
    }
    for (const n of project.folderOrder ?? []) {
      keys.add(this.normalizeCategory(n).toLowerCase());
    }
    return keys;
  }

  async createFolder(userId: number, dto: CreateFolderDto) {
    const project = await this.projectRepository.findOne({
      where: { id: dto.projectId, userId },
      relations: { endpoints: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Folder name is required');
    }
    const newK = name.toLowerCase();
    if (this.folderNameKeys(project).has(newK)) {
      throw new BadRequestException('A folder with that name already exists');
    }

    const order: string[] = [];
    const seen = new Set<string>();
    const push = (display: string) => {
      const d = this.normalizeCategory(display);
      const k = d.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      order.push(d);
    };

    for (const n of project.folderOrder ?? []) push(n);
    for (const e of project.endpoints ?? []) push(e.category);
    push(name);
    project.folderOrder = order;
    await this.projectRepository.save(project);

    return { success: true, message: 'Folder created' };
  }

  async createEndpoint(userId: number, dto: CreateEndpointDto) {
    const project = await this.projectRepository.findOne({
      where: { id: dto.projectId, userId },
      relations: { endpoints: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const category = this.normalizeCategory(dto.category);
    const method = (dto.method || 'GET').toUpperCase();
    const path = dto.path.trim();
    const displayName = dto.name.trim();

    const inFolder = (project.endpoints ?? []).filter(
      (e) => this.normalizeCategory(e.category) === category,
    );
    let maxSort = -1;
    for (const e of inFolder) {
      maxSort = Math.max(maxSort, e.sortOrder ?? 0);
    }

    const ep = this.endpointRepository.create({
      projectId: dto.projectId,
      method,
      path,
      name: displayName,
      category,
      sortOrder: maxSort + 1,
      sourceFile: dto.sourceFile?.trim() || 'manual',
      description: dto.description?.trim() ? dto.description.trim() : null,
      body: dto.body ?? null,
      scenarios: null,
      params: null,
      query: null,
      headers: null,
      responseSummary: null,
    });
    const saved = await this.endpointRepository.save(ep);

    const catK = category.toLowerCase();
    const order = [...(project.folderOrder ?? [])];
    if (!order.some((n) => this.normalizeCategory(n).toLowerCase() === catK)) {
      order.push(category);
      project.folderOrder = order;
      await this.projectRepository.save(project);
    }

    return { success: true, endpoint: saved };
  }

  async update(userId: number, dto: UpdateProjectDto) {
    const project = await this.projectRepository.findOne({
      where: { id: dto.id, userId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (dto.description !== undefined) project.description = dto.description;
    if (dto.name) project.name = dto.name;
    if (dto.docsPublished !== undefined) {
      project.docsPublished = dto.docsPublished;
    }
    if (dto.docsBaseUrl !== undefined) {
      const t = dto.docsBaseUrl.trim();
      project.docsBaseUrl = t.length > 0 ? t : null;
    }
    if (dto.folderOverviews !== undefined) {
      if (!dto.folderOverviews.length) {
        project.folderOverviews = null;
      } else {
        const dtoKeys = new Set(
          dto.folderOverviews.map((r) => r.name.trim().toLowerCase()),
        );
        const merged = new Map<string, { name: string; description: string }>();
        for (const o of project.folderOverviews ?? []) {
          const k = o.name.trim().toLowerCase();
          if (!dtoKeys.has(k)) {
            merged.set(k, { name: o.name, description: o.description ?? '' });
          }
        }
        for (const row of dto.folderOverviews) {
          merged.set(row.name.trim().toLowerCase(), {
            name: row.name,
            description: row.description ?? '',
          });
        }
        project.folderOverviews = [...merged.values()];
      }
    }

    await this.projectRepository.save(project);
    return {
      success: true,
      message: 'Project updated successfully',
      project,
    };
  }

  async delete(userId: number, id: number) {
    const project = await this.projectRepository.findOne({
      where: { id, userId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.endpointRepository.delete({ projectId: id });
    await this.projectRepository.remove(project);

    return { success: true, message: 'Collection deleted successfully' };
  }

  async deleteFolder(userId: number, dto: DeleteFolderDto) {
    const project = await this.projectRepository.findOne({
      where: { id: dto.projectId, userId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.endpointRepository.delete({
      projectId: dto.projectId,
      category: dto.category,
    });

    let dirty = false;
    if (project.folderOrder?.length) {
      project.folderOrder = project.folderOrder.filter((n) => n !== dto.category);
      dirty = true;
    }
    if (project.folderOverviews?.length) {
      const next = project.folderOverviews.filter((o) => o.name !== dto.category);
      if (next.length !== project.folderOverviews.length) {
        project.folderOverviews = next.length ? next : null;
        dirty = true;
      }
    }
    if (dirty) {
      await this.projectRepository.save(project);
    }

    return { success: true, message: 'Folder deleted successfully' };
  }

  async deleteEndpoint(userId: number, id: number) {
    const endpoint = await this.endpointRepository.findOne({
      where: { id, project: { userId } },
      relations: { project: true },
    });

    if (!endpoint) {
      throw new NotFoundException('Endpoint not found or unauthorized');
    }

    await this.endpointRepository.remove(endpoint);

    return { success: true, message: 'Endpoint deleted' };
  }

  async reorderProjects(userId: number, dto: ReorderProjectsDto) {
    const projects = await this.projectRepository.find({ where: { userId } });
    const idSet = new Set(projects.map((p) => p.id));
    if (dto.orderedProjectIds.length !== idSet.size) {
      throw new BadRequestException(
        'orderedProjectIds must list every collection exactly once',
      );
    }
    for (const id of dto.orderedProjectIds) {
      if (!idSet.has(id)) {
        throw new BadRequestException('Invalid project id in orderedProjectIds');
      }
    }
    for (let i = 0; i < dto.orderedProjectIds.length; i++) {
      const p = projects.find((x) => x.id === dto.orderedProjectIds[i]);
      if (p) p.sortOrder = i;
    }
    await this.projectRepository.save(projects);
    return { success: true };
  }

  async reorderFolders(userId: number, dto: ReorderFoldersDto) {
    const project = await this.projectRepository.findOne({
      where: { id: dto.projectId, userId },
      relations: { endpoints: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const categories = new Set<string>();
    for (const e of project.endpoints ?? []) {
      categories.add((e.category || 'General').trim() || 'General');
    }
    for (const n of project.folderOrder ?? []) {
      categories.add((n || 'General').trim() || 'General');
    }
    if (categories.size === 0) {
      categories.add('General');
    }
    const expected = [...categories];
    const got = dto.orderedFolderNames;
    if (got.length !== expected.length) {
      throw new BadRequestException(
        'orderedFolderNames must list every folder exactly once',
      );
    }
    const gs = new Set(got);
    for (const x of expected) {
      if (!gs.has(x)) {
        throw new BadRequestException('orderedFolderNames must match project folders');
      }
    }
    project.folderOrder = [...got];
    await this.projectRepository.save(project);
    return { success: true };
  }

  async reorderEndpoints(userId: number, dto: ReorderEndpointsDto) {
    const project = await this.projectRepository.findOne({
      where: { id: dto.projectId, userId },
      relations: { endpoints: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const cat = (dto.category || 'General').trim() || 'General';
    const inFolder = (project.endpoints ?? []).filter(
      (e) => ((e.category || 'General').trim() || 'General') === cat,
    );
    const idSet = new Set(inFolder.map((e) => e.id));
    if (dto.orderedEndpointIds.length !== idSet.size) {
      throw new BadRequestException(
        'orderedEndpointIds must list every request in this folder exactly once',
      );
    }
    for (const id of dto.orderedEndpointIds) {
      if (!idSet.has(id)) {
        throw new BadRequestException('Invalid endpoint id for this folder');
      }
    }
    for (let i = 0; i < dto.orderedEndpointIds.length; i++) {
      const ep = inFolder.find((e) => e.id === dto.orderedEndpointIds[i]);
      if (ep) ep.sortOrder = i;
    }
    await this.endpointRepository.save(inFolder);
    return { success: true };
  }

  async getPublishedDocsSnapshot(projectId: number) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: { endpoints: true },
    });
    if (!project?.docsPublished) {
      throw new NotFoundException('Documentation is not available');
    }
    return this.buildPublishedDocsCollection(project);
  }

  /** Same payload as public docs, but allowed for the owner even when docs are not published yet (workspace preview). */
  async getWorkspaceDocsSnapshot(userId: number, projectId: number) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
      relations: { endpoints: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return this.buildPublishedDocsCollection(project);
  }

  private buildPublishedDocsCollection(project: Project) {
    const endpoints = [...(project.endpoints ?? [])].sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id,
    );

    const byCategory = new Map<string, Endpoint[]>();
    for (const ep of endpoints) {
      const cat = this.normalizeCategory(ep.category);
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(ep);
    }
    for (const folderName of project.folderOrder ?? []) {
      const n = (folderName || 'General').trim() || 'General';
      const exists = [...byCategory.keys()].some(
        (k) => k.trim().toLowerCase() === n.toLowerCase(),
      );
      if (!exists) byCategory.set(n, []);
    }

    const folderNames = this.orderedFolderNamesForDocs(project, byCategory);
    const folders = folderNames.map((name) => ({
      name,
      description: this.folderOverviewText(project, name),
      endpoints: (byCategory.get(name) ?? []).map((e) =>
        this.toPublishedEndpointDto(e),
      ),
    }));

    return {
      id: `col-${project.id}`,
      name: project.name,
      version: project.framework || 'API',
      baseUrl: project.docsBaseUrl?.trim() || 'https://api.example.com',
      description: project.description ?? '',
      folders,
    };
  }

  private orderedFolderNamesForDocs(
    project: Project,
    byCategory: Map<string, Endpoint[]>,
  ): string[] {
    const keys = [...byCategory.keys()];
    const order = project.folderOrder ?? [];
    if (!order.length) {
      return keys.sort((a, b) => a.localeCompare(b));
    }
    return this.sortFoldersByOrderPublished(keys, order);
  }

  private sortFoldersByOrderPublished(
    folderKeys: string[],
    folderOrder: string[],
  ): string[] {
    const out: string[] = [];
    const used = new Set<string>();
    const lowerToKey = new Map(
      folderKeys.map((k) => [k.trim().toLowerCase(), k] as const),
    );
    for (const name of folderOrder) {
      const canon = lowerToKey.get(name.trim().toLowerCase());
      if (canon && !used.has(canon.toLowerCase())) {
        out.push(canon);
        used.add(canon.toLowerCase());
      }
    }
    for (const k of folderKeys) {
      if (!used.has(k.trim().toLowerCase())) out.push(k);
    }
    return out;
  }

  private folderOverviewText(project: Project, folderName: string): string {
    const list = project.folderOverviews ?? [];
    const k = folderName.trim().toLowerCase();
    const row = list.find(
      (o) =>
        o &&
        typeof o.name === 'string' &&
        o.name.trim().toLowerCase() === k &&
        typeof o.description === 'string',
    );
    return row?.description?.trim() ?? '';
  }

  private toPublishedEndpointDto(ep: Endpoint) {
    return {
      id: `ep-${ep.id}`,
      method: (ep.method || 'GET').toUpperCase(),
      name: ep.name || ep.path,
      path: ep.path,
      description: ep.description ?? '',
      body: ep.body ?? undefined,
      params: this.parsePublishedParams(ep.params),
      query: this.parsePublishedParams(ep.query),
      headers: this.parsePublishedHeaders(ep.headers),
      scenarios: this.parsePublishedScenarios(ep.scenarios),
    };
  }

  private parsePublishedParams(raw: unknown): Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
    example?: string;
  }> {
    if (!Array.isArray(raw)) return [];
    const out: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
      example?: string;
    }> = [];
    for (const x of raw) {
      const o = x as Record<string, unknown>;
      const name = String(o.name ?? '');
      if (!name) continue;
      out.push({
        name,
        type: typeof o.type === 'string' ? o.type : 'string',
        required: Boolean(o.required),
        description: typeof o.description === 'string' ? o.description : '',
        example:
          o.value != null && String(o.value).length > 0
            ? String(o.value)
            : undefined,
      });
    }
    return out;
  }

  private parsePublishedHeaders(
    raw: unknown,
  ): Array<{ key: string; value: string; description?: string }> {
    if (!Array.isArray(raw)) return [];
    const out: Array<{ key: string; value: string; description?: string }> =
      [];
    for (const x of raw) {
      const o = x as Record<string, unknown>;
      const key = String(o.key ?? o.name ?? '');
      if (!key) continue;
      out.push({
        key,
        value: String(o.value ?? o.type ?? ''),
        description:
          typeof o.description === 'string' ? o.description : undefined,
      });
    }
    return out;
  }

  private parsePublishedScenarios(raw: unknown): Array<{
    status: number;
    description: string;
    body: unknown;
  }> {
    let arr: unknown[] = [];
    if (raw == null) {
      // empty
    } else if (Array.isArray(raw)) {
      arr = raw;
    } else if (typeof raw === 'string') {
      const t = raw.trim();
      if (t) {
        try {
          const v = JSON.parse(t) as unknown;
          if (Array.isArray(v)) arr = v;
        } catch {
          arr = [];
        }
      }
    }
    if (arr.length === 0) {
      return [
        {
          status: 200,
          description:
            'Example response — add scenarios from Rauts scan or the workspace.',
          body: {},
        },
      ];
    }
    return arr.map((item: unknown) => {
      const s = item as Record<string, unknown>;
      const status = typeof s.status === 'number' ? s.status : 200;
      const description =
        typeof s.description === 'string' ? s.description : '';
      const body =
        'body' in s && s.body !== undefined
          ? s.body
          : 'data' in s && s.data !== undefined
            ? s.data
            : {};
      return { status, description, body };
    });
  }
}
