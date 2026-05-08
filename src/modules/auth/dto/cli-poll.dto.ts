import { IsString, MinLength } from 'class-validator';

export class CliPollDto {
  @IsString()
  @MinLength(10)
  device_code!: string;
}
