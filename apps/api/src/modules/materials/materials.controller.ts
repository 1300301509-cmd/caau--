import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Header,
  StreamableFile,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiProduces,
} from '@nestjs/swagger';
import { Permission } from '../authorization/authorization.guard.js';
import { IdDto } from '../authorization/authorization.dto.js';
import type { AuthRequest } from '../authorization/authorization.service.js';
import {
  ConfigureTaskDto,
  CreateTaskDto,
  DirectoryDto,
  EventInputDto,
  EventViewDto,
  RevisionDto,
  TaskViewDto,
  UpdateAssignmentDto,
  WorkspaceIdentityDto,
} from './materials.dto.js';
import {
  TemplateFileDto,
  TemplateUploadDto,
  TemplateUploadViewDto,
} from './template.dto.js';
import { downloadDisposition } from '../workflow/filename.js';
import { UploadCapabilitiesDto } from '../workflow/capabilities.dto.js';
import { FILE_EXTENSIONS, MAX_FILE_BYTES } from '../workflow/private-store.js';
import { MaterialsService } from './materials.service.js';
@Controller()
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Invalid configuration or revision' })
@ApiResponse({ status: 401, description: 'Invalid local session' })
@ApiResponse({ status: 403, description: 'Resource not accessible' })
@ApiResponse({
  status: 409,
  description: 'Concurrent change or published task protected',
})
@ApiResponse({ status: 503, description: 'Database or audit unavailable' })
export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}
  @Get('workspace/upload-capabilities')
  @Permission('workspace.capabilities')
  @ApiOperation({ operationId: 'getUploadCapabilities' })
  @ApiOkResponse({ type: UploadCapabilitiesDto })
  capabilities() {
    return { formats: FILE_EXTENSIONS, maxBytes: MAX_FILE_BYTES };
  }
  @Get('workspace/identity')
  @Permission('workspace.identity')
  @ApiOperation({ operationId: 'getWorkspaceIdentity' })
  @ApiOkResponse({ type: WorkspaceIdentityDto })
  identity(@Req() r: AuthRequest) {
    return this.service.execute(r.token!, 'workspace.identity');
  }
  @Get('workspace/directory')
  @Permission('workspace.directory')
  @ApiOperation({ operationId: 'getWorkspaceDirectory' })
  @ApiOkResponse({ type: DirectoryDto })
  directory(@Req() r: AuthRequest) {
    return this.service.execute(r.token!, 'workspace.directory');
  }
  @Post('events')
  @HttpCode(200)
  @Permission('events.create')
  @ApiOperation({ operationId: 'createEvent' })
  @ApiBody({ type: EventInputDto })
  @ApiOkResponse({ type: EventViewDto })
  createEvent(@Req() r: AuthRequest, @Body() b: EventInputDto) {
    return this.service.execute(r.token!, 'events.create', undefined, b);
  }
  @Get('events')
  @Permission('events.list')
  @ApiOperation({ operationId: 'listEvents' })
  @ApiOkResponse({ type: [EventViewDto] })
  events(@Req() r: AuthRequest) {
    return this.service.execute(r.token!, 'events.list');
  }
  @Get('events/:id')
  @Permission('events.read')
  @ApiOperation({ operationId: 'getEvent' })
  @ApiOkResponse({ type: EventViewDto })
  event(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'events.read', id);
  }
  @Post('material-tasks')
  @HttpCode(200)
  @Permission('materials.create')
  @ApiOperation({ operationId: 'createMaterialTask' })
  @ApiBody({ type: CreateTaskDto })
  @ApiOkResponse({ type: TaskViewDto })
  createTask(@Req() r: AuthRequest, @Body() b: CreateTaskDto) {
    return this.service.execute(r.token!, 'materials.create', undefined, b);
  }
  @Get('material-tasks')
  @Permission('materials.list')
  @ApiOperation({ operationId: 'listMaterialTasks' })
  @ApiOkResponse({ type: [TaskViewDto] })
  tasks(@Req() r: AuthRequest) {
    return this.service.execute(r.token!, 'materials.list');
  }
  @Get('material-tasks/:id')
  @Permission('materials.read')
  @ApiOperation({ operationId: 'getMaterialTask' })
  @ApiOkResponse({ type: TaskViewDto })
  task(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'materials.read', id);
  }
  @Patch('material-tasks/:id/requirements')
  @Permission('materials.configure')
  @ApiOperation({ operationId: 'configureMaterialTask' })
  @ApiBody({ type: ConfigureTaskDto })
  @ApiOkResponse({ type: TaskViewDto })
  configure(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: ConfigureTaskDto,
  ) {
    return this.service.execute(r.token!, 'materials.configure', id, b);
  }
  @Post('material-tasks/:id/templates')
  @HttpCode(200)
  @Permission('template.create')
  @ApiOperation({ operationId: 'createTemplateUploadIntent' })
  @ApiBody({ type: TemplateUploadDto })
  @ApiOkResponse({ type: TemplateUploadViewDto })
  templateIntent(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: TemplateUploadDto,
  ) {
    return this.service.execute(r.token!, 'template.create', id, b);
  }
  @Post('templates/:id/content')
  @HttpCode(200)
  @Permission('template.content')
  @ApiOperation({ operationId: 'uploadTemplateContent' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiOkResponse({ type: IdDto })
  templateContent(
    @Req() r: IncomingMessage & AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.execute(r.token!, 'template.content', id, undefined, r);
  }
  @Post('templates/:id/confirm')
  @HttpCode(200)
  @Permission('template.confirm')
  @ApiOperation({ operationId: 'confirmTemplateUpload' })
  @ApiOkResponse({ type: TemplateUploadViewDto })
  templateConfirm(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'template.confirm', id);
  }
  @Patch('templates/:id/remove')
  @Permission('template.remove')
  @ApiOperation({ operationId: 'removeDraftTemplate' })
  @ApiOkResponse({ type: IdDto })
  templateRemove(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'template.remove', id);
  }
  @Get('templates/:id/info')
  @Permission('template.info')
  @ApiOperation({ operationId: 'getTemplateInfo' })
  @ApiOkResponse({ type: TemplateFileDto })
  templateInfo(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'template.info', id);
  }
  @Get('templates/:id/content')
  @Permission('template.download')
  @ApiOperation({ operationId: 'downloadTemplateContent' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Header('X-Content-Type-Options', 'nosniff')
  async templateDownload(@Req() r: AuthRequest, @Param('id') id: string) {
    const { data, info } = (await this.service.execute(
      r.token!,
      'template.download',
      id,
    )) as { data: Buffer; info: TemplateFileDto };
    return new StreamableFile(data, {
      type: 'application/octet-stream',
      disposition: downloadDisposition(info.name, info.extension),
      length: data.length,
    });
  }
  @Patch('material-tasks/:id/assignment')
  @Permission('materials.assign')
  @ApiOperation({ operationId: 'assignMaterialTask' })
  @ApiBody({ type: UpdateAssignmentDto })
  @ApiOkResponse({ type: TaskViewDto })
  assign(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: UpdateAssignmentDto,
  ) {
    return this.service.execute(r.token!, 'materials.assign', id, b);
  }
  @Post('material-tasks/:id/publish')
  @HttpCode(200)
  @Permission('materials.publish')
  @ApiOperation({ operationId: 'publishMaterialTask' })
  @ApiBody({ type: RevisionDto })
  @ApiOkResponse({ type: TaskViewDto })
  publish(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: RevisionDto,
  ) {
    return this.service.execute(r.token!, 'materials.publish', id, b);
  }
}
