import { IsString, IsUUID } from 'class-validator';

export class DeleteFolderDto {
  @IsUUID()
  projectId: string;

  @IsString()
  category: string;
}
