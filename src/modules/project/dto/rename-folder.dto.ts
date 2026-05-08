import { IsString, IsUUID } from 'class-validator';

export class RenameFolderDto {
  @IsUUID()
  projectId: string;

  @IsString()
  oldCategory: string;

  @IsString()
  newCategory: string;
}
