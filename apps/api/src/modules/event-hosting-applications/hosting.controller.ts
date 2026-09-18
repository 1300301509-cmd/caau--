import {
  Body,
  Controller,
  Get,
  createParamDecorator,
  ExecutionContext,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Permission } from '../authorization/authorization.guard.js';
import {
  CreateHostingApplicationDto,
  HostingJourneyDto,
  ConfirmHostingPermitDto,
  HostingPermitDto,
  CreateEventMaterialsDto,
  HostingApplicationDetailDto,
  HostingApplicationListItemDto,
  HostingGrantActiveDto,
  HostingGrantInputDto,
  HostingGrantViewDto,
  HostingReasonCommandDto,
  HostingReviewCommandDto,
  HostingSubmitDto,
  HostingUploadInputDto,
  HostingUploadMutationDto,
  HostingUploadViewDto,
  SaveHostingDraftDto,
} from './hosting.dto.js';
import { HostingService } from './hosting.service.js';

const SessionToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<{ token?: string }>().token ?? '',
);
const token = (value: string | undefined) => value ?? '';
@ApiTags('event-hosting-applications')
@ApiBearerAuth()
@ApiCookieAuth('webSession')
@ApiForbiddenResponse({ description: 'No active application permission' })
@ApiConflictResponse({
  description: 'Revision, state, or idempotency conflict',
})
@Controller()
export class HostingController {
  constructor(private readonly hosting: HostingService) {}

  @Post('admin/hosting-application-handler-grants')
  @Permission('hosting')
  @HttpCode(200)
  @ApiOperation({ summary: 'Grant application handling permission' })
  @ApiOkResponse({ type: HostingGrantViewDto })
  handlerGrant(
    @SessionToken() identity: string | undefined,
    @Body() body: HostingGrantInputDto,
  ) {
    return this.hosting.manageGrant(
      token(identity),
      'handler',
      undefined,
      body,
    );
  }
  @Patch('admin/hosting-application-handler-grants/:id')
  @Permission('hosting')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: HostingGrantViewDto })
  handlerGrantActive(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: HostingGrantActiveDto,
  ) {
    return this.hosting.manageGrant(token(identity), 'handler', id, body);
  }
  @Post('admin/hosting-application-review-grants')
  @Permission('hosting')
  @HttpCode(200)
  @ApiOkResponse({ type: HostingGrantViewDto })
  reviewGrant(
    @SessionToken() identity: string | undefined,
    @Body() body: HostingGrantInputDto,
  ) {
    return this.hosting.manageGrant(token(identity), 'review', undefined, body);
  }
  @Patch('admin/hosting-application-review-grants/:id')
  @Permission('hosting')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: HostingGrantViewDto })
  reviewGrantActive(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: HostingGrantActiveDto,
  ) {
    return this.hosting.manageGrant(token(identity), 'review', id, body);
  }
  @Get('hosting-journeys')
  @Permission('hosting')
  @ApiOkResponse({ type: HostingJourneyDto, isArray: true })
  journeys(@SessionToken() identity: string | undefined) {
    return this.hosting.journeys(token(identity));
  }
  @Post('event-materials/:id/confirm-permit')
  @Permission('hosting')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: HostingPermitDto })
  confirmPermit(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: ConfirmHostingPermitDto,
  ) {
    return this.hosting.confirmPermit(token(identity), id, body);
  }
  @Post('event-materials')
  @Permission('hosting')
  @HttpCode(200)
  @ApiOkResponse({ type: HostingApplicationListItemDto })
  createMaterials(
    @SessionToken() identity: string | undefined,
    @Body() body: CreateEventMaterialsDto,
  ) {
    return this.hosting.create(token(identity), body, true);
  }
  @Get('event-materials')
  @Permission('hosting')
  @ApiOkResponse({ type: HostingApplicationListItemDto, isArray: true })
  listMaterials(@SessionToken() identity: string | undefined) {
    return this.hosting.list(token(identity), true);
  }
  @Post('hosting-applications')
  @Permission('hosting')
  @HttpCode(200)
  @ApiOkResponse({ type: HostingApplicationListItemDto })
  create(
    @SessionToken() identity: string | undefined,
    @Body() body: CreateHostingApplicationDto,
  ) {
    return this.hosting.create(token(identity), body);
  }
  @Get('hosting-applications')
  @Permission('hosting')
  @ApiOkResponse({ type: HostingApplicationListItemDto, isArray: true })
  list(@SessionToken() identity: string | undefined) {
    return this.hosting.list(token(identity));
  }
  @Get('hosting-applications/:id')
  @Permission('hosting')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: HostingApplicationDetailDto })
  detail(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
  ) {
    return this.hosting.detail(token(identity), id);
  }
  @Put('hosting-applications/:id/draft')
  @Permission('hosting')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: HostingApplicationDetailDto })
  @ApiBadRequestResponse({ description: 'Invalid draft form' })
  save(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: SaveHostingDraftDto,
  ) {
    return this.hosting.save(token(identity), id, body);
  }
  @Post('hosting-applications/:id/uploads')
  @Permission('hosting')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: HostingUploadViewDto })
  uploadIntent(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: HostingUploadInputDto,
  ) {
    return this.hosting.createUpload(token(identity), id, body);
  }
  @Put('hosting-uploads/:id/content')
  @Permission('hosting')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' } },
    },
  })
  uploadContent(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Req() request: IncomingMessage,
  ) {
    return this.hosting.uploadContent(token(identity), id, request);
  }
  @Post('hosting-uploads/:id/confirm')
  @Permission('hosting')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: HostingUploadViewDto })
  confirmUpload(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: HostingUploadMutationDto,
  ) {
    return this.hosting.mutateUpload(token(identity), id, 'confirm', body);
  }
  @Post('hosting-uploads/:id/remove')
  @Permission('hosting')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: HostingUploadViewDto })
  removeUpload(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: HostingUploadMutationDto,
  ) {
    return this.hosting.mutateUpload(token(identity), id, 'remove', body);
  }
  @Get('hosting-uploads/:id/content')
  @Permission('hosting')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const file = await this.hosting.download(token(identity), id);
    response.setHeader('content-type', 'application/octet-stream');
    response.setHeader(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.info.originalName)}`,
    );
    return new StreamableFile(file.data);
  }
  @Post('hosting-applications/:id/submit')
  @Permission('hosting')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  submit(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: HostingSubmitDto,
  ) {
    return this.hosting.submit(token(identity), id, body);
  }
  @Post('hosting-applications/:id/start-review')
  @Permission('hosting')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  startReview(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: HostingReviewCommandDto,
  ) {
    return this.hosting.review(token(identity), id, 'start', body);
  }
  @Post('hosting-applications/:id/request-supplement')
  @Permission('hosting')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  supplement(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: HostingReasonCommandDto,
  ) {
    return this.hosting.review(token(identity), id, 'supplement', body);
  }
  @Post('hosting-applications/:id/reject')
  @Permission('hosting')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  reject(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: HostingReasonCommandDto,
  ) {
    return this.hosting.review(token(identity), id, 'reject', body);
  }
  @Post('hosting-applications/:id/approve')
  @Permission('hosting')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  approve(
    @SessionToken() identity: string | undefined,
    @Param('id') id: string,
    @Body() body: HostingReviewCommandDto,
  ) {
    return this.hosting.review(token(identity), id, 'approve', body);
  }
}
