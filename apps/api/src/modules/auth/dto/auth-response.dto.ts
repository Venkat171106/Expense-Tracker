export interface UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  baseCurrency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // in seconds
  tokenType: string;
}

export interface AuthResponseDto {
  user: UserResponseDto;
  tokens: AuthTokensDto;
}
