import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class FolderOverviewDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;
}

export class SyncEndpointDto {
  /** When set and owned by this project, sync updates this row (survives path/category renames). */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  method: string;

  @IsString()
  path: string;

  @IsString()
  name: string;

  @IsString()
  category: string;

  @IsString()
  sourceFile: string;

  /** Scanner-derived symbol anchor (see Endpoint.syncAnchor). */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  syncAnchor?: string;

  /** SHA-256 hex of handler source from CLI/scanner. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  handlerFingerprint?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  scenarios?: unknown;

  @IsOptional()
  @IsArray()
  params?: unknown[];

  @IsOptional()
  @IsArray()
  query?: unknown[];

  @IsOptional()
  @IsArray()
  headers?: unknown[];

  @IsOptional()
  @IsString()
  response?: string;
}

export class SyncProjectDto {
  @IsString()
  name: string;

  @IsString()
  framework: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Detected global prefix; persisted and used so paths match runtime (e.g. `/api/v1`). */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  routePrefix?: string;

  /** From `.env` / similar; fills `docsBaseUrl` when the project has none yet. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  inferredBaseUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FolderOverviewDto)
  folderOverviews?: FolderOverviewDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncEndpointDto)
  endpoints: SyncEndpointDto[];
}
