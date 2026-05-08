import { ArrayMinSize, IsArray, IsString, IsUUID } from 'class-validator';

export class ReorderEndpointsDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  category!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  orderedEndpointIds!: string[];
}
