import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LinkGithubAppInstallationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(/^\d+$/)
  installationId!: string;
}
