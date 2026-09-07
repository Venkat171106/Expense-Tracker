import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('should return user when user is present and no error', () => {
    const mockUser = { id: 'user-uuid-1234' };
    const result = guard.handleRequest(null, mockUser, null);
    expect(result).toBe(mockUser);
  });

  it('should throw UnauthorizedException when user is not present', () => {
    expect(() => guard.handleRequest(null, false, { message: 'jwt expired' })).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw original error if error is present', () => {
    const customErr = new Error('Custom auth error');
    expect(() => guard.handleRequest(customErr, null, null)).toThrow(customErr);
  });
});
