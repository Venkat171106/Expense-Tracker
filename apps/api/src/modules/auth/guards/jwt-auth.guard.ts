import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      const message = info?.message || 'Unauthorized access: Valid bearer token required';
      throw err || new UnauthorizedException(message);
    }
    return user;
  }
}
