import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { ProjectService } from './project.service';
import { SyncProjectDto } from './dto/sync-project.dto';
import { UpdateEndpointDto } from './dto/update-endpoint.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { DeleteFolderDto } from './dto/delete-folder.dto';
import { ReorderProjectsDto } from './dto/reorder-projects.dto';
import { ReorderFoldersDto } from './dto/reorder-folders.dto';
import { ReorderEndpointsDto } from './dto/reorder-endpoints.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CreateEndpointDto } from './dto/create-endpoint.dto';
import { CliSyncQueueService } from './queue/cli-sync-queue.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly cliSyncQueue: CliSyncQueueService,
  ) {}

  @Post('sync')
  sync(@CurrentUser() user: CurrentUserPayload, @Body() dto: SyncProjectDto) {
    return this.cliSyncQueue.enqueueSync(user.id, dto);
  }

  @Get('sync/jobs/:jobId')
  syncJobStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
  ) {
    return this.cliSyncQueue.getJobForUser(user.id, jobId);
  }

  @Get('list')
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.projectService.getMyProjects(user.id);
  }

  @Get(':projectId/published-docs-snapshot')
  workspaceDocsSnapshot(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.projectService.getWorkspaceDocsSnapshot(user.id, projectId);
  }

  @Post('reorder/collections')
  reorderCollections(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReorderProjectsDto,
  ) {
    return this.projectService.reorderProjects(user.id, dto);
  }

  @Post('reorder/folders')
  reorderFolders(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReorderFoldersDto,
  ) {
    return this.projectService.reorderFolders(user.id, dto);
  }

  @Post('reorder/endpoints')
  reorderEndpoints(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReorderEndpointsDto,
  ) {
    return this.projectService.reorderEndpoints(user.id, dto);
  }

  @Patch('endpoint/:id')
  updateEndpoint(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEndpointDto,
  ) {
    return this.projectService.updateEndpoint(user.id, id, dto);
  }

  @Post('folder/rename')
  renameFolder(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RenameFolderDto,
  ) {
    return this.projectService.renameFolder(user.id, dto);
  }

  @Post('create')
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectService.create(user.id, dto);
  }

  @Post('folder/create')
  createFolder(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateFolderDto,
  ) {
    return this.projectService.createFolder(user.id, dto);
  }

  @Post('endpoint/create')
  createEndpoint(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateEndpointDto,
  ) {
    return this.projectService.createEndpoint(user.id, dto);
  }

  @Post('update')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectService.update(user.id, dto);
  }

  @Delete(':id')
  delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.projectService.delete(user.id, id);
  }

  @Post('folder/delete')
  deleteFolder(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: DeleteFolderDto,
  ) {
    return this.projectService.deleteFolder(user.id, dto);
  }

  @Delete('endpoint/:id')
  deleteEndpoint(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.projectService.deleteEndpoint(user.id, id);
  }
}
