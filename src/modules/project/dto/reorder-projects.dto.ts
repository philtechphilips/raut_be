import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ReorderProjectsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  orderedProjectIds!: string[];
}
