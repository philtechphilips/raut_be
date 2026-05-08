import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ProjectService } from './project.service';

@Controller('public')
export class PublicDocsController {
  constructor(private readonly projectService: ProjectService) {}

  @Get('docs/:projectId')
  publishedDocs(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectService.getPublishedDocsSnapshot(projectId);
  }
}
