import { IsString, MinLength } from 'class-validator';

export class EnrichEndpointDto {
  @IsString()
  @MinLength(1)
  method!: string;

  @IsString()
  @MinLength(1)
  path!: string;

  @IsString()
  @MinLength(1)
  handlerSource!: string;
}
