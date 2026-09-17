import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import {
  AuthorizationService,
  type AuthRequest,
} from './authorization.service.js';
import { Permission, Public } from './authorization.guard.js';
import {
  AccessDto,
  AccountSummaryDto,
  ActiveDto,
  AuditDto,
  AuthenticationSessionDto,
  ChangePasswordDto,
  CreateAccountDto,
  GrantDto,
  IdDto,
  LocalIdentityChoiceDto,
  LocalSessionDto,
  LocalSessionRequestDto,
  LoginRequestDto,
  MemberDto,
  OrganizationDto,
  ResetPasswordDto,
  ReviewerDto,
  TaskDto,
  UserDto,
} from './authorization.dto.js';

type CookieResponse = {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
};

@Controller('authentication')
@ApiResponse({ status: 400, description: 'Invalid input' })
@ApiResponse({ status: 401, description: 'Authentication required or failed' })
@ApiResponse({ status: 403, description: 'Origin, CSRF or access denied' })
@ApiResponse({ status: 429, description: 'Sign-in temporarily unavailable' })
@ApiResponse({ status: 503, description: 'Authentication unavailable' })
export class AuthenticationController {
  constructor(private readonly service: AuthorizationService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ operationId: 'passwordLogin' })
  @ApiBody({ type: LoginRequestDto })
  @ApiOkResponse({ type: AuthenticationSessionDto })
  @Header('Cache-Control', 'no-store')
  async login(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: CookieResponse,
    @Body() body: LoginRequestDto,
  ) {
    const result = await this.service.login(body, request);
    response.cookie(
      this.service.cookieName,
      result.token,
      this.service.cookieOptions,
    );
    return result.response;
  }

  @Get('session')
  @Permission('session.status')
  @ApiCookieAuth('webSession')
  @ApiOperation({ operationId: 'getAuthenticationSession' })
  @ApiOkResponse({ type: AuthenticationSessionDto })
  @Header('Cache-Control', 'no-store')
  session(@Req() request: AuthRequest) {
    return this.service.sessionStatus(request.token!);
  }

  @Post('logout')
  @Permission('session.logout')
  @ApiCookieAuth('webSession')
  @HttpCode(200)
  @ApiOperation({ operationId: 'passwordLogout' })
  @ApiOkResponse({ type: IdDto })
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.service.execute(request.token!, 'session.logout');
    response.clearCookie(this.service.cookieName, {
      httpOnly: true,
      secure: this.service.cookieOptions.secure,
      sameSite: this.service.cookieOptions.sameSite,
      path: this.service.cookieOptions.path,
    });
    return result;
  }

  @Post('change-password')
  @Permission('session.password.change')
  @ApiCookieAuth('webSession')
  @HttpCode(200)
  @ApiOperation({ operationId: 'changePassword' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ type: AuthenticationSessionDto })
  async changePassword(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: CookieResponse,
    @Body() body: ChangePasswordDto,
  ) {
    const result = await this.service.changePassword(request.token!, body);
    response.cookie(
      this.service.cookieName,
      result.token,
      this.service.cookieOptions,
    );
    return result.response;
  }
}

@Controller('local-test-identities')
@ApiResponse({ status: 400, description: 'Invalid fixed identity' })
@ApiResponse({ status: 403, description: 'Fixed identity is inactive' })
@ApiResponse({ status: 503, description: 'Local test mode unavailable' })
export class LocalTestIdentityController {
  constructor(private readonly service: AuthorizationService) {}

  @Get()
  @Public()
  @ApiOperation({ operationId: 'listLocalTestIdentities' })
  @ApiOkResponse({ type: LocalIdentityChoiceDto, isArray: true })
  @Header('Cache-Control', 'no-store')
  choices() {
    return this.service.localIdentityOptions();
  }

  @Post('sessions')
  @Public()
  @HttpCode(200)
  @ApiOperation({ operationId: 'createLocalTestSession' })
  @ApiBody({ type: LocalSessionRequestDto })
  @ApiOkResponse({ type: LocalSessionDto })
  @Header('Cache-Control', 'no-store')
  session(@Body() body: LocalSessionRequestDto) {
    return this.service.issueLocalTestSession(body);
  }
}

@Controller('authorization')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Invalid input' })
@ApiResponse({
  status: 401,
  description: 'Missing, expired or revoked local session',
})
@ApiResponse({ status: 403, description: 'Access denied' })
@ApiResponse({
  status: 409,
  description: 'Constraint or concurrent change conflict',
})
@ApiResponse({
  status: 503,
  description: 'Identity, database or audit unavailable',
})
export class AuthorizationController {
  constructor(private readonly service: AuthorizationService) {}
  @Get('me')
  @Permission('session.me')
  @ApiOperation({ operationId: 'getIdentity' })
  @ApiOkResponse({ type: IdDto })
  @Header('Cache-Control', 'no-store')
  me(@Req() r: AuthRequest) {
    return this.service.execute(r.token!, 'session.me');
  }

  @Post('logout')
  @HttpCode(200)
  @Permission('session.logout')
  @ApiOperation({ operationId: 'logout' })
  @ApiOkResponse({ type: IdDto })
  logout(@Req() r: AuthRequest) {
    return this.service.execute(r.token!, 'session.logout');
  }

  @Get('accounts')
  @Permission('admin.account.read')
  @ApiOperation({ operationId: 'listAccounts' })
  @ApiOkResponse({ type: AccountSummaryDto, isArray: true })
  accounts(@Req() request: AuthRequest) {
    return this.service.listAccounts(request.token!);
  }

  @Post('accounts')
  @HttpCode(200)
  @Permission('admin.account.create')
  @ApiOperation({ operationId: 'createAccount' })
  @ApiBody({ type: CreateAccountDto })
  @ApiOkResponse({ type: IdDto })
  account(@Req() request: AuthRequest, @Body() body: CreateAccountDto) {
    return this.service.createAccount(request.token!, body);
  }

  @Post('accounts/:id/reset-password')
  @HttpCode(200)
  @Permission('admin.account.password.reset')
  @ApiOperation({ operationId: 'resetAccountPassword' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ type: IdDto })
  resetAccountPassword(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body() body: ResetPasswordDto,
  ) {
    return this.service.resetAccountPassword(request.token!, id, body);
  }

  @Post('users')
  @HttpCode(200)
  @Permission('admin.user.create')
  @ApiOperation({ operationId: 'createInternalUser' })
  @ApiBody({ type: UserDto })
  @ApiOkResponse({ type: IdDto })
  user(@Req() r: AuthRequest, @Body() b: UserDto) {
    return this.service.execute(r.token!, 'admin.user.create', undefined, b);
  }

  @Patch('users/:id')
  @Permission('admin.user.active')
  @ApiOperation({ operationId: 'setUserActive' })
  @ApiBody({ type: ActiveDto })
  @ApiOkResponse({ type: IdDto })
  userActive(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: ActiveDto,
  ) {
    return this.service.execute(r.token!, 'admin.user.active', id, b);
  }

  @Post('organizations')
  @HttpCode(200)
  @Permission('admin.organization.create')
  @ApiOperation({ operationId: 'createOrganization' })
  @ApiBody({ type: OrganizationDto })
  @ApiOkResponse({ type: IdDto })
  organization(@Req() r: AuthRequest, @Body() b: OrganizationDto) {
    return this.service.execute(
      r.token!,
      'admin.organization.create',
      undefined,
      b,
    );
  }

  @Post('members')
  @HttpCode(200)
  @Permission('admin.member.create')
  @ApiOperation({ operationId: 'createOrganizationMember' })
  @ApiBody({ type: MemberDto })
  @ApiOkResponse({ type: IdDto })
  member(@Req() r: AuthRequest, @Body() b: MemberDto) {
    return this.service.execute(r.token!, 'admin.member.create', undefined, b);
  }

  @Patch('members/:id')
  @Permission('admin.member.active')
  @ApiOperation({ operationId: 'setMemberActive' })
  @ApiBody({ type: ActiveDto })
  @ApiOkResponse({ type: IdDto })
  memberActive(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: ActiveDto,
  ) {
    return this.service.execute(r.token!, 'admin.member.active', id, b);
  }

  @Post('event-scopes')
  @HttpCode(200)
  @Permission('event.create')
  @ApiOperation({ operationId: 'createEventScope' })
  @ApiOkResponse({ type: IdDto })
  event(@Req() r: AuthRequest) {
    return this.service.execute(r.token!, 'event.create');
  }

  @Get('event-scopes/:id')
  @Permission('event.read')
  @ApiOperation({ operationId: 'getEventScope' })
  @ApiOkResponse({ type: IdDto })
  readEvent(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'event.read', id);
  }

  @Post('event-grants')
  @HttpCode(200)
  @Permission('admin.grant.create')
  @ApiOperation({ operationId: 'createEventGrant' })
  @ApiBody({ type: GrantDto })
  @ApiOkResponse({ type: IdDto })
  grant(@Req() r: AuthRequest, @Body() b: GrantDto) {
    return this.service.execute(r.token!, 'admin.grant.create', undefined, b);
  }

  @Delete('event-grants/:id')
  @Permission('admin.grant.delete')
  @ApiOperation({ operationId: 'deleteEventGrant' })
  @ApiOkResponse({ type: IdDto })
  deleteGrant(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'admin.grant.delete', id);
  }

  @Post('task-scopes')
  @HttpCode(200)
  @Permission('task.create')
  @ApiOperation({ operationId: 'createTaskScope' })
  @ApiBody({ type: TaskDto })
  @ApiOkResponse({ type: IdDto })
  task(@Req() r: AuthRequest, @Body() b: TaskDto) {
    return this.service.execute(r.token!, 'task.create', undefined, b);
  }

  @Patch('task-scopes/:id/reviewer')
  @Permission('task.reviewer.assign')
  @ApiOperation({ operationId: 'assignTaskReviewer' })
  @ApiBody({ type: ReviewerDto })
  @ApiOkResponse({ type: IdDto })
  reviewer(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: ReviewerDto,
  ) {
    return this.service.execute(r.token!, 'task.reviewer.assign', id, b);
  }

  @Get('task-scopes/:id')
  @Permission('task.read')
  @ApiOperation({ operationId: 'getTaskScope' })
  @ApiOkResponse({ type: IdDto })
  readTask(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.execute(r.token!, 'task.read', id);
  }

  @Post('task-scopes/:id/access')
  @HttpCode(200)
  @Permission('task.access')
  @ApiOperation({
    operationId: 'checkTaskAccess',
    description:
      'Policy probe only; does not read or change material or transfer files.',
  })
  @ApiBody({ type: AccessDto })
  @ApiOkResponse({ type: IdDto })
  access(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: AccessDto) {
    return this.service.execute(r.token!, 'task.access', id, b);
  }

  @Get('audit')
  @Permission('admin.audit.read')
  @ApiOperation({ operationId: 'getSecurityAudit' })
  @ApiOkResponse({ type: AuditDto, isArray: true })
  audit(@Req() r: AuthRequest) {
    return this.service.execute(r.token!, 'admin.audit.read');
  }
}
