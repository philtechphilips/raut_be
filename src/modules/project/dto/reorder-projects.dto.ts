import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class ReorderProjectsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  orderedProjectIds!: number[];
}
