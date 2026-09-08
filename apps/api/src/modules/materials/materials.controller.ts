import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Permission } from '../authorization/authorization.guard.js';
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
