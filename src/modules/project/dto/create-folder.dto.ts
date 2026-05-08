import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateFolderDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MinLength(1, { message: 'Folder name is required' })
  name!: string;
}
