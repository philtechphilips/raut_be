export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'OPTIONS'
  | 'HEAD';

export interface FieldInfo {
  name: string;
  type?: string;
  required: boolean;
  description?: string;
}

export interface Endpoint {
  method: HttpMethod;
  path: string;
  params?: FieldInfo[];
  query?: FieldInfo[];
  body?: FieldInfo[];
  headers?: FieldInfo[];
  response?: string;
  description?: string;
  confidence: 'high' | 'medium' | 'low';
  sourceFile: string;
  folder: string;
  handlerSource?: string;
  /** Stable route-handler identity (file + class + method); survives HTTP path / folder / AI label changes. */
  syncAnchor?: string;
  bodySample?: unknown;
  responseScenarios?: { status: number; description: string; data: unknown }[];
  /** Set by AI enrichment */
  aiName?: string;
  aiCategory?: string;
}

export interface ProjectScanResult {
  name: string;
  description?: string;
  folderOverviews?: { name: string; description: string }[];
  framework: string;
  endpoints: Endpoint[];
  totalFilesScanned: number;
  routePrefix?: string;
  inferredBaseUrl?: string;
}

export interface IProjectScanner {
  scan(directory: string): Promise<ProjectScanResult>;
}
