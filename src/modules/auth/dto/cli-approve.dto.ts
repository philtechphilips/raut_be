import { IsString, MinLength } from 'class-validator';

export class CliApproveDto {
  @IsString()
  @MinLength(4)
  user_code!: string;
}
