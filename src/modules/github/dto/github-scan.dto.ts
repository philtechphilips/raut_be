import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GithubScanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  owner!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  repo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  collectionName?: string;

  /** When true, register this repo for push-triggered rescans (GitHub App webhooks). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  syncOnPush?: boolean;
}
