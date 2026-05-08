import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/models/user.model';
import { AiModule } from '../ai/ai.module';
import { MailModule } from '../mail/mail.module';
import { ProjectModule } from '../project/project.module';
import { UserGithubConnection } from './models/user-github-connection.model';
import { GithubRepoSubscription } from './models/github-repo-subscription.model';
import { GithubAppInstallation } from './models/github-app-installation.model';
import { GithubAppAuthService } from './github-app-auth.service';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { GITHUB_SCAN_BULL_QUEUE } from './queue/github-scan.constants';
import {
  createGithubScanQueue,
  GithubScanQueueService,
} from './queue/github-scan-queue.service';
import { GithubScanWorkerService } from './queue/github-scan.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserGithubConnection,
      GithubRepoSubscription,
      GithubAppInstallation,
      User,
    ]),
    ProjectModule,
    AiModule,
    MailModule,
  ],
  controllers: [GithubController],
  providers: [
    GithubAppAuthService,
    GithubService,
    {
      provide: GITHUB_SCAN_BULL_QUEUE,
      useFactory: () => createGithubScanQueue(),
    },
    GithubScanQueueService,
    GithubScanWorkerService,
  ],
})
export class GithubModule {}
