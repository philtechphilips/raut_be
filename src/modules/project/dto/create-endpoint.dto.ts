import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const ALLOWED_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
] as const;

export class CreateEndpointDto {
  @IsUUID()
  projectId!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsIn([...ALLOWED_METHODS])
  method!: string;

  @IsString()
  @MinLength(1)
  path!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  sourceFile?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  body?: string;
}
