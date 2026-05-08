import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ProjectService } from './project.service';

@Controller('public')
export class PublicDocsController {
  constructor(private readonly projectService: ProjectService) {}

  @Get('docs/:projectId')
  publishedDocs(@Param('projectId', new ParseUUIDPipe()) projectId: string) {
    return this.projectService.getPublishedDocsSnapshot(projectId);
  }
}
