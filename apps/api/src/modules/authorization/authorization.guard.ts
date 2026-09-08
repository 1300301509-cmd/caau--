import {
  Injectable,
  SetMetadata,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuthorizationService,
  type AuthRequest,
} from './authorization.service.js';
export const Public = () => SetMetadata('caau.public', true);
export const Permission = (action: string) =>
  SetMetadata('caau.action', action);
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly service: AuthorizationService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.get<boolean>('caau.public', context.getHandler()))
      return true;
    if (!this.reflector.get<string>('caau.action', context.getHandler()))
      throw new ForbiddenException('No permission policy');
    await this.service.authenticate(
      context.switchToHttp().getRequest<AuthRequest>(),
    );
    return true;
  }
}
