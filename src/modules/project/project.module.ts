import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Endpoint, Project } from './models/project.model';
import { ProjectController } from './project.controller';
import { PublicDocsController } from './public-docs.controller';
import { ProjectService } from './project.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Endpoint]), AuthModule],
  controllers: [ProjectController, PublicDocsController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
