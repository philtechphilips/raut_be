import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class AnalyzeProjectDto {
  @IsString()
  @MinLength(1)
  framework!: string;

  @IsString()
  endpointSummary!: string;

  /** Folder/category names (from enriched endpoints); AI must use exact names in `folders[].name`. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryNames?: string[];
}
