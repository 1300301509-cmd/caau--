import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
} from '@nestjs/swagger';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Permission } from '../authorization/authorization.guard.js';
import type { AuthRequest } from '../authorization/authorization.service.js';
import {
  CreateEventSupplyItemDto,
  CreateEventSupplyPhotoDto,
  EventSupplyHistoryDto,
  EventSupplyItemViewDto,
  EventSupplyPhotoViewDto,
  MutateEventSupplyPhotoDto,
  UpdateEventSupplyItemDto,
} from './event-supplies.dto.js';
import { EventSuppliesService } from './event-supplies.service.js';

@ApiBearerAuth()
@ApiCookieAuth('webSession')
@Controller()
export class EventSuppliesController {
  constructor(private readonly supplies: EventSuppliesService) {}

  @Get('events/:eventId/supplies')
  @Permission('event-supplies')
  @ApiOperation({
    operationId: 'listEventSupplies',
    summary: 'listEventSupplies',
  })
  @ApiOkResponse({ type: EventSupplyItemViewDto, isArray: true })
  list(@Param('eventId') eventId: string, @Req() request: AuthRequest) {
    return this.supplies.list(request.token ?? '', eventId);
  }

  @Post('events/:eventId/supplies')
  @Permission('event-supplies')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'createEventSupply',
    summary: 'createEventSupply',
  })
  @ApiOkResponse({ type: EventSupplyItemViewDto })
  create(
    @Param('eventId') eventId: string,
    @Req() request: AuthRequest,
    @Body() body: CreateEventSupplyItemDto,
  ) {
    return this.supplies.create(request.token ?? '', eventId, body);
  }

  @Put('events/:eventId/supplies/:id')
  @Permission('event-supplies')
  @ApiOperation({
    operationId: 'updateEventSupply',
    summary: 'updateEventSupply',
  })
  @ApiOkResponse({ type: EventSupplyItemViewDto })
  update(
    @Param('eventId') eventId: string,
    @Param('id') id: string,
    @Req() request: AuthRequest,
    @Body() body: UpdateEventSupplyItemDto,
  ) {
    return this.supplies.update(request.token ?? '', eventId, id, body);
  }

  @Get('events/:eventId/supplies/:id/history')
  @Permission('event-supplies')
  @ApiOperation({
    operationId: 'getEventSupplyHistory',
    summary: 'getEventSupplyHistory',
  })
  @ApiOkResponse({ type: EventSupplyHistoryDto, isArray: true })
  history(
    @Param('eventId') eventId: string,
    @Param('id') id: string,
    @Req() request: AuthRequest,
  ) {
    return this.supplies.history(request.token ?? '', eventId, id);
  }

  @Post('events/:eventId/supplies/:id/photos')
  @Permission('event-supplies')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'createEventSupplyPhoto',
    summary: 'createEventSupplyPhoto',
  })
  @ApiOkResponse({ type: EventSupplyPhotoViewDto })
  createPhoto(
    @Param('eventId') eventId: string,
    @Param('id') id: string,
    @Req() request: AuthRequest,
    @Body() body: CreateEventSupplyPhotoDto,
  ) {
    return this.supplies.createPhoto(request.token ?? '', eventId, id, body);
  }

  @Put('event-supply-photos/:id/content')
  @Permission('event-supplies')
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' } },
    },
  })
  upload(
    @Param('id') id: string,
    @Req() request: IncomingMessage & AuthRequest,
  ) {
    return this.supplies.uploadContent(request.token ?? '', id, request);
  }

  @Post('event-supply-photos/:id/confirm')
  @Permission('event-supplies')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'confirmEventSupplyPhoto',
    summary: 'confirmEventSupplyPhoto',
  })
  @ApiOkResponse({ type: EventSupplyPhotoViewDto })
  confirm(
    @Param('id') id: string,
    @Req() request: AuthRequest,
    @Body() body: MutateEventSupplyPhotoDto,
  ) {
    return this.supplies.mutatePhoto(request.token ?? '', id, 'confirm', body);
  }

  @Post('event-supply-photos/:id/remove')
  @Permission('event-supplies')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'removeEventSupplyPhoto',
    summary: 'removeEventSupplyPhoto',
  })
  @ApiOkResponse({ type: EventSupplyPhotoViewDto })
  remove(
    @Param('id') id: string,
    @Req() request: AuthRequest,
    @Body() body: MutateEventSupplyPhotoDto,
  ) {
    return this.supplies.mutatePhoto(request.token ?? '', id, 'remove', body);
  }

  @Get('event-supply-photos/:id/content')
  @Permission('event-supplies')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(
    @Param('id') id: string,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const file = await this.supplies.download(request.token ?? '', id);
    response.setHeader(
      'content-type',
      `image/${file.info.extension === 'jpg' ? 'jpeg' : file.info.extension}`,
    );
    response.setHeader(
      'content-disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.info.originalName)}`,
    );
    return new StreamableFile(file.data);
  }
}
