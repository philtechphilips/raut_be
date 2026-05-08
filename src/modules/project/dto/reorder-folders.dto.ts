import { ArrayMinSize, IsArray, IsInt, IsString } from 'class-validator';

export class ReorderFoldersDto {
  @IsInt()
  projectId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedFolderNames!: string[];
}
