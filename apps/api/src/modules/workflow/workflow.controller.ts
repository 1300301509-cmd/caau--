import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
} from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import type { AuthRequest } from '../authorization/authorization.service.js';
import { Permission } from '../authorization/authorization.guard.js';
import { IdDto } from '../authorization/authorization.dto.js';
import {
  CloseDto,
  DeadlineHistoryDto,
  DraftEditViewDto,
  DraftViewDto,
  ExecutionViewDto,
  ExtendDto,
  HandoverDto,
  ReviewDto,
  ReviewViewDto,
  SaveDraftDto,
  SubmissionViewDto,
  SubmitDto,
  UploadDto,
  UploadViewDto,
  FileInfoDto,
} from './workflow.dto.js';
import { downloadDisposition } from './filename.js';
import { WorkflowService } from './workflow.service.js';
@Controller()
@ApiBearerAuth()
@ApiCookieAuth('webSession')
@ApiResponse({
  status: 400,
  description: 'Invalid material, upload, review or deadline input',
})
@ApiResponse({ status: 401, description: 'Invalid session' })
@ApiResponse({
  status: 403,
  description: 'Current task/organization/assignment does not allow access',
})
@ApiResponse({
  status: 409,
  description:
    'Deadline, revision, state, idempotency or concurrent change conflict',
})
@ApiResponse({
  status: 503,
  description: 'Database, private storage or audit unavailable',
})
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}
  @Get('material-tasks/:id/execution')
  @Permission('workflow.read')
  @ApiOperation({ operationId: 'getTaskExecution' })
  @ApiOkResponse({ type: ExecutionViewDto })
  execution(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'workflow.read', id);
  }
  @Get('material-tasks/:id/draft')
  @Permission('draft.read')
  @ApiOperation({ operationId: 'getMaterialDraft' })
  @ApiOkResponse({ type: DraftViewDto })
  draft(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'draft.read', id);
  }
  @Patch('material-tasks/:id/draft')
  @Permission('draft.save')
  @ApiOperation({ operationId: 'saveMaterialDraft' })
  @ApiBody({ type: SaveDraftDto })
  @ApiOkResponse({ type: DraftViewDto })
  save(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: SaveDraftDto,
  ) {
    return this.service.execute(r.token!, 'draft.save', id, b);
  }
  @Get('material-tasks/:id/draft-history')
  @Permission('draft.history')
  @ApiOperation({ operationId: 'getDraftHistory' })
  @ApiOkResponse({ type: [DraftEditViewDto] })
  draftHistory(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'draft.history', id);
  }
  @Post('material-tasks/:id/uploads')
  @HttpCode(200)
  @Permission('upload.create')
  @ApiOperation({ operationId: 'createUploadIntent' })
  @ApiBody({ type: UploadDto })
  @ApiOkResponse({ type: UploadViewDto })
  intent(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: UploadDto) {
    return this.service.execute(r.token!, 'upload.create', id, b);
  }
  @Post('uploads/:id/content')
  @HttpCode(200)
  @Permission('file.content')
  @ApiOperation({ operationId: 'uploadPrivateContent' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiOkResponse({ type: IdDto })
  upload(@Req() r: IncomingMessage & AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'file.content', id, undefined, r);
  }
  @Post('uploads/:id/confirm')
  @HttpCode(200)
  @Permission('file.confirm')
  @ApiOperation({ operationId: 'confirmPrivateUpload' })
  @ApiOkResponse({ type: UploadViewDto })
  confirm(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'file.confirm', id);
  }
  @Get('uploads/:id/info')
  @Permission('file.info')
  @ApiOperation({ operationId: 'getPrivateFileInfo' })
  @ApiOkResponse({ type: FileInfoDto })
  info(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'file.info', id);
  }
  @Get('uploads/:id/content')
  @Permission('file.download')
  @ApiOperation({ operationId: 'downloadPrivateContent' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@Req() r: AuthRequest, @Param('id') id: string) {
    const { data, info } = (await this.service.execute(
      r.token!,
      'file.download',
      id,
    )) as { data: Buffer; info: FileInfoDto };
    return new StreamableFile(data, {
      type: 'application/octet-stream',
      disposition: downloadDisposition(info.name, info.extension),
      length: data.length,
    });
  }
  @Post('material-tasks/:id/submissions')
  @HttpCode(200)
  @Permission('submission.create')
  @ApiOperation({ operationId: 'submitMaterialPackage' })
  @ApiBody({ type: SubmitDto })
  @ApiOkResponse({ type: SubmissionViewDto })
  submit(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: SubmitDto) {
    return this.service.execute(r.token!, 'submission.create', id, b);
  }
  @Get('material-tasks/:id/submissions')
  @Permission('submission.list')
  @ApiOperation({ operationId: 'listSubmissionVersions' })
  @ApiOkResponse({ type: [SubmissionViewDto] })
  submissions(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'submission.list', id);
  }
  @Post('material-tasks/:id/reviews')
  @HttpCode(200)
  @Permission('review.create')
  @ApiOperation({ operationId: 'reviewMaterialPackage' })
  @ApiBody({ type: ReviewDto })
  @ApiOkResponse({ type: ReviewViewDto })
  review(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: ReviewDto) {
    return this.service.execute(r.token!, 'review.create', id, b);
  }
  @Post('material-tasks/:id/extensions')
  @HttpCode(200)
  @Permission('deadline.extend')
  @ApiOperation({ operationId: 'extendTaskDeadline' })
  @ApiBody({ type: ExtendDto })
  @ApiOkResponse({ type: ExecutionViewDto })
  extend(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: ExtendDto) {
    return this.service.execute(r.token!, 'deadline.extend', id, b);
  }
  @Get('material-tasks/:id/extensions')
  @Permission('deadline.history')
  @ApiOperation({ operationId: 'listDeadlineExtensions' })
  @ApiOkResponse({ type: [DeadlineHistoryDto] })
  extensions(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'deadline.history', id);
  }
  @Post('material-tasks/:id/handover')
  @HttpCode(200)
  @Permission('task.handover')
  @ApiOperation({ operationId: 'handoverTaskHandler' })
  @ApiBody({ type: HandoverDto })
  @ApiOkResponse({ type: ExecutionViewDto })
  handover(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: HandoverDto,
  ) {
    return this.service.execute(r.token!, 'task.handover', id, b);
  }
  @Post('material-tasks/:id/close')
  @HttpCode(200)
  @Permission('task.close')
  @ApiOperation({ operationId: 'closeMaterialTask' })
  @ApiBody({ type: CloseDto })
  @ApiOkResponse({ type: ExecutionViewDto })
  close(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: CloseDto) {
    return this.service.execute(r.token!, 'task.close', id, b);
  }
}
