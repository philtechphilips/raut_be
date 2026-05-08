import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export class AppendRequestHistoryDto {
  @IsString()
  @MaxLength(80)
  id!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  at!: number;

  @IsString()
  @IsIn(METHODS as unknown as string[])
  method!: string;

  @IsString()
  @MaxLength(8192)
  pathDraft!: string;

  @IsString()
  @MaxLength(8192)
  resolvedUrl!: string;

  @Type(() => Number)
  @IsNumber()
  status!: number;

  @IsString()
  @MaxLength(256)
  statusText!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ms!: number;

  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  @IsIn(['network'])
  error?: 'network';

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(128)
  endpointId!: string | null;

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(512)
  endpointName!: string | null;
}
