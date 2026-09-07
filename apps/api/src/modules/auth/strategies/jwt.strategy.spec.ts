import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configService: Partial<ConfigService>;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('test-jwt-access-secret-32-chars-long'),
    };
    strategy = new JwtStrategy(configService as ConfigService);
  });

  it('should validate and return authenticated user object for valid access token payload', async () => {
    const payload: JwtPayload = {
      sub: 'user-uuid-1234',
      type: 'access',
    };

    const result = await strategy.validate(payload);
    expect(result).toEqual({ id: 'user-uuid-1234' });
  });

  it('should throw UnauthorizedException if payload type is not access', async () => {
    const invalidPayload: any = {
      sub: 'user-uuid-1234',
      type: 'refresh',
    };

    await expect(strategy.validate(invalidPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if sub is missing', async () => {
    const invalidPayload: any = {
      type: 'access',
    };

    await expect(strategy.validate(invalidPayload)).rejects.toThrow(UnauthorizedException);
  });
});
