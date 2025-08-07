/**
 * Test data factory for user session objects
 * Simplifies creation of user and session test data
 */

export interface UserFactoryOptions {
  userId?: string;
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  role?: 'user' | 'admin' | 'premium';
  isVerified?: boolean;
  isActive?: boolean;
  createdAt?: string;
  lastLogin?: string;
}

export interface SessionFactoryOptions {
  sessionId?: string;
  userId?: string;
  token?: string;
  refreshToken?: string;
  expiresAt?: string;
  createdAt?: string;
  deviceInfo?: {
    userAgent?: string;
    ipAddress?: string;
    deviceType?: string;
    browser?: string;
    os?: string;
  };
  isActive?: boolean;
}

export interface JWTPayloadOptions {
  userId?: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  sub?: string;
}

export class UserFactory {
  static create(overrides: UserFactoryOptions = {}) {
    const userId = overrides.userId || this.generateId();
    const username = overrides.username || `user${this.generateShortId()}`;
    
    return {
      userId,
      email: overrides.email || `${username}@test.com`,
      username,
      firstName: overrides.firstName || 'Test',
      lastName: overrides.lastName || 'User',
      role: overrides.role || 'user',
      isVerified: overrides.isVerified ?? true,
      isActive: overrides.isActive ?? true,
      createdAt: overrides.createdAt || new Date().toISOString(),
      lastLogin: overrides.lastLogin || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profile: {
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        preferences: {
          theme: 'light',
          language: 'en',
          notifications: true
        }
      }
    };
  }

  static createAdmin(overrides: UserFactoryOptions = {}) {
    return this.create({
      role: 'admin',
      username: 'admin',
      email: 'admin@test.com',
      firstName: 'Admin',
      lastName: 'User',
      ...overrides
    });
  }

  static createPremiumUser(overrides: UserFactoryOptions = {}) {
    return this.create({
      role: 'premium',
      username: 'premium',
      email: 'premium@test.com',
      ...overrides
    });
  }

  static createUnverifiedUser(overrides: UserFactoryOptions = {}) {
    return this.create({
      isVerified: false,
      lastLogin: undefined,
      ...overrides
    });
  }

  static createInactiveUser(overrides: UserFactoryOptions = {}) {
    return this.create({
      isActive: false,
      lastLogin: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days ago
      ...overrides
    });
  }

  private static generateId(): string {
    return `user-${Math.random().toString(36).substr(2, 9)}`;
  }

  private static generateShortId(): string {
    return Math.random().toString(36).substr(2, 6);
  }
}

export class SessionFactory {
  static create(overrides: SessionFactoryOptions = {}) {
    const sessionId = overrides.sessionId || this.generateId();
    const userId = overrides.userId || `user-${this.generateShortId()}`;
    
    return {
      sessionId,
      userId,
      token: overrides.token || this.generateJWTToken(userId),
      refreshToken: overrides.refreshToken || this.generateRefreshToken(),
      expiresAt: overrides.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      createdAt: overrides.createdAt || new Date().toISOString(),
      deviceInfo: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ipAddress: '192.168.1.100',
        deviceType: 'desktop',
        browser: 'Chrome',
        os: 'Windows',
        ...overrides.deviceInfo
      },
      isActive: overrides.isActive ?? true,
      lastAccessed: new Date().toISOString()
    };
  }

  static createExpiredSession(overrides: SessionFactoryOptions = {}) {
    return this.create({
      expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      isActive: false,
      ...overrides
    });
  }

  static createMobileSession(overrides: SessionFactoryOptions = {}) {
    return this.create({
      deviceInfo: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
        deviceType: 'mobile',
        browser: 'Safari',
        os: 'iOS',
        ...overrides.deviceInfo
      },
      ...overrides
    });
  }

  static createMultipleSessions(userId: string, count: number = 3) {
    return Array.from({ length: count }, (_, index) => 
      this.create({
        userId,
        createdAt: new Date(Date.now() - (index * 3600000)).toISOString(), // 1 hour apart
        deviceInfo: {
          userAgent: index === 0 ? 'Chrome/Desktop' : index === 1 ? 'Safari/iPhone' : 'Firefox/Android',
          deviceType: index === 0 ? 'desktop' : 'mobile'
        }
      })
    );
  }

  private static generateId(): string {
    return `session-${Math.random().toString(36).substr(2, 9)}`;
  }

  private static generateShortId(): string {
    return Math.random().toString(36).substr(2, 6);
  }

  private static generateJWTToken(userId: string): string {
    // Mock JWT structure (not a real JWT for testing)
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({ 
      userId, 
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 
    })).toString('base64');
    const signature = 'mock-signature';
    return `${header}.${payload}.${signature}`;
  }

  private static generateRefreshToken(): string {
    return `refresh-${Math.random().toString(36).substr(2, 32)}`;
  }
}

export class JWTFactory {
  static createPayload(overrides: JWTPayloadOptions = {}) {
    const now = Math.floor(Date.now() / 1000);
    const userId = overrides.userId || `user-${Math.random().toString(36).substr(2, 6)}`;
    
    return {
      userId,
      email: overrides.email || `${userId}@test.com`,
      role: overrides.role || 'user',
      iat: overrides.iat || now,
      exp: overrides.exp || (now + 3600), // 1 hour
      iss: overrides.iss || 'test-issuer',
      sub: overrides.sub || userId
    };
  }

  static createExpiredPayload(overrides: JWTPayloadOptions = {}) {
    const now = Math.floor(Date.now() / 1000);
    return this.createPayload({
      iat: now - 7200, // 2 hours ago
      exp: now - 3600, // 1 hour ago (expired)
      ...overrides
    });
  }

  static createAdminPayload(overrides: JWTPayloadOptions = {}) {
    return this.createPayload({
      role: 'admin',
      email: 'admin@test.com',
      ...overrides
    });
  }
}

export { UserFactory as User, SessionFactory as Session, JWTFactory as JWT };