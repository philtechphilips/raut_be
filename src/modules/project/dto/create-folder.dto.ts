import { IsInt, IsString, MinLength } from 'class-validator';

export class CreateFolderDto {
  @IsInt()
  projectId!: number;

  @IsString()
  @MinLength(1, { message: 'Folder name is required' })
  name!: string;
}
