import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../auth/models/user.model';
import { Project, Endpoint } from '../project/models/project.model';
import { UserRequestHistory } from '../request-history/models/request-history.model';
import { GithubAppInstallation } from '../github/models/github-app-installation.model';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Project,
      Endpoint,
      UserRequestHistory,
      GithubAppInstallation,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
