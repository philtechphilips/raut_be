import { IsInt, IsString } from 'class-validator';

export class RenameFolderDto {
  @IsInt()
  projectId: number;

  @IsString()
  oldCategory: string;

  @IsString()
  newCategory: string;
}
