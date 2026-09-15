import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import type { AuthRequest } from '../authorization/authorization.service.js';
import { Permission } from '../authorization/authorization.guard.js';
import { IdDto } from '../authorization/authorization.dto.js';
import { downloadDisposition } from '../workflow/filename.js';
import { IndividualService } from './individual.service.js';
import {
  ActivateIndividualDto,
  CreateIndividualDto,
  CreateIndividualTaskDto,
  IndividualCommandDto,
  IndividualConflictDto,
  IndividualGrantDto,
  IndividualHistoryDto,
  IndividualResultDto,
  IndividualSnapshotDto,
  IndividualUploadDto,
  IndividualUploadInputDto,
  SaveIndividualDto,
} from './individual.dto.js';
@Controller()
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Invalid input' })
@ApiResponse({ status: 401, description: 'Session expired or revoked' })
@ApiResponse({ status: 403, description: 'Access denied' })
@ApiResponse({
  status: 409,
  type: IndividualConflictDto,
  description:
    'State, revision, deadline or command conflict; current only when authorized',
})
@ApiResponse({
  status: 503,
  description: 'Database, audit or storage unavailable',
})
export class IndividualController {
  constructor(private readonly service: IndividualService) {}
  @Post('individual-material-tasks')
  @HttpCode(200)
  @Permission('individual.create-task')
  @ApiOperation({ operationId: 'createIndividualMaterialTask' })
  @ApiBody({ type: CreateIndividualTaskDto })
  @ApiOkResponse({ type: IdDto })
  createTask(@Req() r: AuthRequest, @Body() b: CreateIndividualTaskDto) {
    return this.service.manage(r.token!, 'create-task', undefined, b);
  }
  @Post('material-tasks/:id/individual-channel')
  @HttpCode(200)
  @Permission('individual.activate')
  @ApiOperation({ operationId: 'activateIndividualChannel' })
  @ApiBody({ type: ActivateIndividualDto })
  @ApiOkResponse({ type: IdDto })
  activate(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: ActivateIndividualDto,
  ) {
    return this.service.manage(r.token!, 'activate', id, b);
  }
  @Patch('event-grants/:id/active')
  @Permission('individual.grant')
  @ApiOperation({ operationId: 'setEventGrantActive' })
  @ApiBody({ type: IndividualGrantDto })
  @ApiOkResponse({ type: IdDto })
  grant(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: IndividualGrantDto,
  ) {
    return this.service.manage(r.token!, 'grant', id, b);
  }
  @Get('individual-materials/snapshot')
  @Permission('individual.snapshot')
  @ApiOperation({ operationId: 'getIndividualSnapshot' })
  @ApiOkResponse({ type: IndividualSnapshotDto })
  @ApiQuery({ name: 'taskId', required: false, type: String })
  @ApiQuery({ name: 'selectedId', required: false, type: String })
  @ApiQuery({ name: 'state', required: false, type: String })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  snapshot(@Req() r: AuthRequest, @Query() q: Record<string, string>) {
    return this.service.snapshot(r.token!, q);
  }
  @Get('individual-materials/:id/history')
  @Permission('individual.history')
  @ApiOperation({ operationId: 'getIndividualHistory' })
  @ApiOkResponse({ type: IndividualHistoryDto })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  history(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Query() q: Record<string, string>,
  ) {
    return this.service.history(r.token!, id, q);
  }
  @Post('individual-materials')
  @HttpCode(200)
  @Permission('individual.create')
  @ApiOperation({ operationId: 'createIndividualMaterial' })
  @ApiBody({ type: CreateIndividualDto })
  @ApiOkResponse({ type: IndividualResultDto })
  create(@Req() r: AuthRequest, @Body() b: CreateIndividualDto) {
    return this.service.execute(r.token!, 'create', b?.id, b);
  }
  @Patch('individual-materials/:id/draft')
  @Permission('individual.save')
  @ApiOperation({ operationId: 'saveIndividualDraft' })
  @ApiBody({ type: SaveIndividualDto })
  @ApiOkResponse({ type: IndividualResultDto })
  save(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: SaveIndividualDto,
  ) {
    return this.service.execute(r.token!, 'save', id, b);
  }
  @Post('individual-materials/:id/submit')
  @HttpCode(200)
  @Permission('individual.submit')
  @ApiOperation({ operationId: 'submitIndividualMaterial' })
  @ApiBody({ type: IndividualCommandDto })
  @ApiOkResponse({ type: IndividualResultDto })
  submit(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: IndividualCommandDto,
  ) {
    return this.service.execute(r.token!, 'submit', id, b);
  }
  @Post('individual-materials/:id/start-review')
  @HttpCode(200)
  @Permission('individual.start')
  @ApiOperation({ operationId: 'startIndividualReview' })
  @ApiBody({ type: IndividualCommandDto })
  @ApiOkResponse({ type: IndividualResultDto })
  start(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: IndividualCommandDto,
  ) {
    return this.service.execute(r.token!, 'start', id, b);
  }
  @Post('individual-materials/:id/approve')
  @HttpCode(200)
  @Permission('individual.approve')
  @ApiOperation({ operationId: 'approveIndividualMaterial' })
  @ApiBody({ type: IndividualCommandDto })
  @ApiOkResponse({ type: IndividualResultDto })
  approve(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: IndividualCommandDto,
  ) {
    return this.service.execute(r.token!, 'approve', id, b);
  }
  @Post('individual-materials/:id/return')
  @HttpCode(200)
  @Permission('individual.return')
  @ApiOperation({ operationId: 'returnIndividualMaterial' })
  @ApiBody({ type: IndividualCommandDto })
  @ApiOkResponse({ type: IndividualResultDto })
  returnMaterial(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: IndividualCommandDto,
  ) {
    return this.service.execute(r.token!, 'return', id, b);
  }
  @Post('individual-materials/:id/uploads')
  @HttpCode(200)
  @Permission('individual.file.intent')
  @ApiOperation({ operationId: 'createIndividualUpload' })
  @ApiBody({ type: IndividualUploadInputDto })
  @ApiOkResponse({ type: IndividualUploadDto })
  intent(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: IndividualUploadInputDto,
  ) {
    return this.service.file(r.token!, 'intent', id, b);
  }
  @Post('individual-uploads/:id/content')
  @HttpCode(200)
  @Permission('individual.file.content')
  @ApiOperation({ operationId: 'uploadIndividualContent' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiOkResponse({ type: IdDto })
  content(@Req() r: IncomingMessage & AuthRequest, @Param('id') id: string) {
    return this.service.file(r.token!, 'content', id, undefined, r);
  }
  @Post('individual-uploads/:id/confirm')
  @HttpCode(200)
  @Permission('individual.file.confirm')
  @ApiOperation({ operationId: 'confirmIndividualUpload' })
  @ApiOkResponse({ type: IndividualUploadDto })
  confirm(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.file(r.token!, 'confirm', id);
  }
  @Get('individual-uploads/:id/info')
  @Permission('individual.file.info')
  @ApiOperation({ operationId: 'getIndividualFileInfo' })
  @ApiOkResponse({ type: IndividualUploadDto })
  info(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.file(r.token!, 'info', id);
  }
  @Get('individual-uploads/:id/content')
  @Permission('individual.file.download')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ operationId: 'downloadIndividualContent' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(@Req() r: AuthRequest, @Param('id') id: string) {
    const result = (await this.service.file(r.token!, 'download', id)) as {
      data: Buffer;
      info: IndividualUploadDto;
    };
    return new StreamableFile(result.data, {
      type: 'application/octet-stream',
      length: result.data.length,
      disposition: downloadDisposition(
        result.info.originalName,
        result.info.extension,
      ),
    });
  }
}
