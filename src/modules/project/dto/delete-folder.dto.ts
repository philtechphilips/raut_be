import { IsInt, IsString } from 'class-validator';

export class DeleteFolderDto {
  @IsInt()
  projectId: number;

  @IsString()
  category: string;
}
