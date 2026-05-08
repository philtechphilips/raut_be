import { ArrayMinSize, IsArray, IsInt, IsString } from 'class-validator';

export class ReorderEndpointsDto {
  @IsInt()
  projectId!: number;

  @IsString()
  category!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  orderedEndpointIds!: number[];
}
