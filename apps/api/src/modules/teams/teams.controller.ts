import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Req,
  HttpCode,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { Permission } from '../authorization/authorization.guard.js';
import type { AuthRequest } from '../authorization/authorization.service.js';
import { TeamsService } from './teams.service.js';
import {
  TeamViewDto,
  TeamOrganizationDto,
  CreateTeamDto,
  UpdateTeamDto,
  AddEventTeamDto,
} from './teams.dto.js';
@ApiBearerAuth()
@ApiCookieAuth('webSession')
@Controller()
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}
  @Get('teams/organizations')
  @Permission('teams')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'listTeamOrganizations',
    summary: 'listTeamOrganizations',
  })
  @ApiOkResponse({ type: TeamOrganizationDto, isArray: true })
  listTeamOrganizations(@Req() request: AuthRequest) {
    return this.teams.organizationsList(request.token ?? '');
  }
  @Get('teams')
  @Permission('teams')
  @HttpCode(200)
  @ApiOperation({ operationId: 'listTeams', summary: 'listTeams' })
  @ApiOkResponse({ type: TeamViewDto, isArray: true })
  listTeams(@Req() request: AuthRequest) {
    return this.teams.list(request.token ?? '');
  }
  @Post('teams')
  @Permission('teams')
  @HttpCode(200)
  @ApiOperation({ operationId: 'createTeam', summary: 'createTeam' })
  @ApiOkResponse({ type: TeamViewDto, isArray: false })
  createTeam(@Req() request: AuthRequest, @Body() body: CreateTeamDto) {
    return this.teams.create(request.token ?? '', body);
  }
  @Put('teams/:id')
  @Permission('teams')
  @HttpCode(200)
  @ApiOperation({ operationId: 'updateTeam', summary: 'updateTeam' })
  @ApiOkResponse({ type: TeamViewDto, isArray: false })
  updateTeam(
    @Param('id') id: string,
    @Req() request: AuthRequest,
    @Body() body: UpdateTeamDto,
  ) {
    return this.teams.update(request.token ?? '', id, body);
  }
  @Get('events/:eventId/teams')
  @Permission('teams')
  @HttpCode(200)
  @ApiOperation({ operationId: 'listEventTeams', summary: 'listEventTeams' })
  @ApiOkResponse({ type: TeamViewDto, isArray: true })
  listEventTeams(
    @Param('eventId') eventId: string,
    @Req() request: AuthRequest,
  ) {
    return this.teams.listEvent(request.token ?? '', eventId);
  }
  @Post('events/:eventId/teams')
  @Permission('teams')
  @HttpCode(200)
  @ApiOperation({ operationId: 'addEventTeam', summary: 'addEventTeam' })
  @ApiOkResponse({ type: TeamViewDto, isArray: false })
  addEventTeam(
    @Param('eventId') eventId: string,
    @Req() request: AuthRequest,
    @Body() body: AddEventTeamDto,
  ) {
    return this.teams.add(request.token ?? '', eventId, body);
  }
  @Put('events/:eventId/teams/:id')
  @Permission('teams')
  @HttpCode(200)
  @ApiOperation({ operationId: 'updateEventTeam', summary: 'updateEventTeam' })
  @ApiOkResponse({ type: TeamViewDto, isArray: false })
  updateEventTeam(
    @Param('eventId') eventId: string,
    @Param('id') id: string,
    @Req() request: AuthRequest,
    @Body() body: UpdateTeamDto,
  ) {
    return this.teams.updateEvent(request.token ?? '', eventId, id, body);
  }
}
