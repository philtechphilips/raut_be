import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateEndpointDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsString()
  method?: string;

  /** Full scenario list (workspace examples); replaces stored scenarios when sent. */
  @IsOptional()
  @IsArray()
  scenarios?: unknown[];
}
