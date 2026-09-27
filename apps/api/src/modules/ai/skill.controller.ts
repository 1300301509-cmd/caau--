import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthRequest } from '../authorization/authorization.service.js';
import { Permission } from '../authorization/authorization.guard.js';
import { AgentSkillService } from './skill.service.js';
import {
  AgentSkillInputDto,
  AgentSkillVersionDto,
  AgentToolDefinitionDto,
} from './skill.dto.js';

@ApiTags('governance')
@ApiBearerAuth()
@ApiCookieAuth('webSession')
@Controller('observability/agent/skills')
export class AgentSkillController {
  constructor(private readonly skills: AgentSkillService) {}

  @Get('tools/catalog')
  @Permission('agent.tool.catalog')
  @ApiOperation({ operationId: 'listAgentToolCatalog' })
  @ApiOkResponse({ type: [AgentToolDefinitionDto] })
  tools(@Req() request: AuthRequest) {
    return this.skills.tools(request.token ?? '');
  }

  @Get()
  @Permission('agent.skill.list')
  @ApiOperation({ operationId: 'listAgentSkillVersions' })
  @ApiOkResponse({ type: [AgentSkillVersionDto] })
  list(@Req() request: AuthRequest) {
    return this.skills.list(request.token ?? '');
  }

  @Post()
  @HttpCode(200)
  @Permission('agent.skill.create')
  @ApiOperation({ operationId: 'createAgentSkillVersion' })
  @ApiOkResponse({ type: AgentSkillVersionDto })
  create(@Req() request: AuthRequest, @Body() body: AgentSkillInputDto) {
    return this.skills.create(request.token ?? '', body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Permission('agent.skill.activate')
  @ApiOperation({ operationId: 'activateAgentSkillVersion' })
  @ApiOkResponse({ type: AgentSkillVersionDto })
  activate(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.skills.activate(request.token ?? '', id);
  }
}
