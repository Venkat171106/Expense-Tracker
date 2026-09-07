import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: { user: { findFirst: jest.Mock } };

  const mockDbUser = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    passwordHash: '=19=65536,t=3,p=1',
    firstName: 'Amrutha',
    lastName: 'K R',
    baseCurrency: 'INR',
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-09-07T10:00:00.000Z'),
    updatedAt: new Date('2026-09-07T10:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should return user profile without passwordHash for existing active user', async () => {
    prisma.user.findFirst.mockResolvedValue(mockDbUser);

    const result = await service.findById('user-uuid-1');

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'user-uuid-1',
        isActive: true,
        deletedAt: null,
      },
    });

    expect(result.id).toBe('user-uuid-1');
    expect(result.email).toBe('user@example.com');
    expect(result.firstName).toBe('Amrutha');
    expect(result.lastName).toBe('K R');
    expect(result.baseCurrency).toBe('INR');
    expect(result.isActive).toBe(true);
    expect((result as any).passwordHash).toBeUndefined();
  });

  it('should throw UnauthorizedException if user is not found or inactive', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.findById('non-existent-or-inactive')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
