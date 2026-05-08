import { ArrayMinSize, IsArray, IsString, IsUUID } from 'class-validator';

export class ReorderFoldersDto {
  @IsUUID()
  projectId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedFolderNames!: string[];
}
