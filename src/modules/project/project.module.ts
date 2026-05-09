import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Endpoint, Project } from './models/project.model';
import { ProjectController } from './project.controller';
import { PublicDocsController } from './public-docs.controller';
import { ProjectService } from './project.service';
import { PROJECT_CLI_SYNC_BULL_QUEUE } from './queue/cli-sync.constants';
import {
  CliSyncQueueService,
  createCliSyncQueue,
} from './queue/cli-sync-queue.service';
import { CliSyncWorkerService } from './queue/cli-sync.worker';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Endpoint]), AuthModule],
  controllers: [ProjectController, PublicDocsController],
  providers: [
    ProjectService,
    {
      provide: PROJECT_CLI_SYNC_BULL_QUEUE,
      useFactory: () => createCliSyncQueue(),
    },
    CliSyncQueueService,
    CliSyncWorkerService,
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
