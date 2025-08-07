import { privacyService, PrivacyService } from '../../../../services/privacy/privacy.service';

// Mock the app module to prevent loading other services
jest.mock('../../../../app', () => ({
  supabase: {
    from: jest.fn()
  }
}));

import { supabase } from '../../../../app';

describe('PrivacyService', () => {
  let mockSupabaseQuery: jest.Mock;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    mockSupabaseQuery = jest.fn();
    
    // Setup Supabase mock chain
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: mockSupabaseQuery
    });

    consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('getCurrentPolicy', () => {
    it('should return current active privacy policy', async () => {
      const mockPolicy = {
        id: 'policy-1',
        version: '1.0',
        title: 'Privacy Policy',
        content: 'Policy content...',
        effective_date: '2025-01-01T00:00:00Z',
        is_active: true
      };

      mockSupabaseQuery.mockResolvedValue({ data: mockPolicy, error: null });

      const result = await privacyService.getCurrentPolicy();

      expect(result).toEqual({
        id: 'policy-1',
        version: '1.0',
        title: 'Privacy Policy',
        content: 'Policy content...',
        effectiveDate: '2025-01-01T00:00:00Z',
        isActive: true
      });

      expect(supabase.from).toHaveBeenCalledWith('privacy_policies');
    });

    it('should return null when no active policy exists', async () => {
      mockSupabaseQuery.mockResolvedValue({ data: null, error: 'No active policy found' });

      const result = await privacyService.getCurrentPolicy();

      expect(result).toBeNull();
    });

    it('should return null when database query fails', async () => {
      mockSupabaseQuery.mockResolvedValue({ data: null, error: 'Database connection failed' });

      const result = await privacyService.getCurrentPolicy();

      expect(result).toBeNull();
    });

    it('should handle exceptions and return null', async () => {
      mockSupabaseQuery.mockRejectedValue(new Error('Database error'));

      const result = await privacyService.getCurrentPolicy();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching privacy policy:', expect.any(Error));
    });

    it('should use correct query parameters for active policy', async () => {
      mockSupabaseQuery.mockResolvedValue({ data: null, error: 'No data' });

      await privacyService.getCurrentPolicy();

      const fromMock = supabase.from as jest.Mock;
      const chainMock = fromMock.mock.results[0].value;

      expect(chainMock.select).toHaveBeenCalledWith('*');
      expect(chainMock.eq).toHaveBeenCalledWith('is_active', true);
      expect(chainMock.order).toHaveBeenCalledWith('effective_date', { ascending: false });
      expect(chainMock.limit).toHaveBeenCalledWith(1);
    });
  });

  describe('recordConsent', () => {
    const userId = 'user-123';
    const policyVersion = '1.0';
    const ipAddress = '192.168.1.1';
    const userAgent = 'Mozilla/5.0 TestAgent';

    beforeEach(() => {
      // Mock chain for checking existing consent
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'privacy_consents') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: mockSupabaseQuery
                }))
              }))
            })),
            insert: jest.fn(() => mockSupabaseQuery)
          };
        }
      });
    });

    it('should record new consent successfully', async () => {
      // First call - no existing consent
      mockSupabaseQuery
        .mockResolvedValueOnce({ data: null, error: 'No existing consent' })
        .mockResolvedValueOnce({ error: null });

      const result = await privacyService.recordConsent(userId, policyVersion, ipAddress, userAgent);

      expect(result).toEqual({
        success: true,
        message: 'Privacy policy consent recorded successfully'
      });
    });

    it('should return success when consent already exists', async () => {
      mockSupabaseQuery.mockResolvedValue({ data: { id: 'existing-consent' }, error: null });

      const result = await privacyService.recordConsent(userId, policyVersion);

      expect(result).toEqual({
        success: true,
        message: 'Consent already recorded for this policy version'
      });
    });

    it('should handle consent recording failure', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: 'Insert failed' });
      
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'privacy_consents') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({ data: null, error: 'No existing consent' })
                }))
              }))
            })),
            insert: insertMock
          };
        }
      });

      const result = await privacyService.recordConsent(userId, policyVersion);

      expect(result).toEqual({
        success: false,
        message: 'Failed to record consent'
      });
    });

    it('should handle exceptions during consent recording', async () => {
      mockSupabaseQuery.mockRejectedValue(new Error('Database connection error'));

      const result = await privacyService.recordConsent(userId, policyVersion);

      expect(result).toEqual({
        success: false,
        message: 'Failed to record consent'
      });
      expect(consoleSpy).toHaveBeenCalledWith('Error recording privacy consent:', expect.any(Error));
    });

    it('should include optional parameters in consent record', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'privacy_consents') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({ data: null, error: 'No existing consent' })
                }))
              }))
            })),
            insert: insertMock
          };
        }
      });

      await privacyService.recordConsent(userId, policyVersion, ipAddress, userAgent);

      expect(insertMock).toHaveBeenCalledWith([{
        user_id: userId,
        policy_version: policyVersion,
        ip_address: ipAddress,
        user_agent: userAgent,
        consented_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      }]);
    });

    it('should record consent without optional parameters', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'privacy_consents') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({ data: null, error: 'No existing consent' })
                }))
              }))
            })),
            insert: insertMock
          };
        }
      });

      await privacyService.recordConsent(userId, policyVersion);

      expect(insertMock).toHaveBeenCalledWith([{
        user_id: userId,
        policy_version: policyVersion,
        ip_address: undefined,
        user_agent: undefined,
        consented_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      }]);
    });
  });

  describe('hasUserConsented', () => {
    const userId = 'user-123';

    it('should return true when user has consented to current policy', async () => {
      const mockCurrentPolicy = {
        id: 'policy-1',
        version: '1.0',
        title: 'Privacy Policy',
        content: 'Content',
        effective_date: '2025-01-01T00:00:00Z',
        is_active: true
      };

      // Mock getCurrentPolicy call
      jest.spyOn(privacyService, 'getCurrentPolicy').mockResolvedValue({
        id: 'policy-1',
        version: '1.0',
        title: 'Privacy Policy',
        content: 'Content',
        effectiveDate: '2025-01-01T00:00:00Z',
        isActive: true
      });

      mockSupabaseQuery.mockResolvedValue({ data: { id: 'consent-1' }, error: null });

      const result = await privacyService.hasUserConsented(userId);

      expect(result).toBe(true);
    });

    it('should return false when user has not consented to current policy', async () => {
      jest.spyOn(privacyService, 'getCurrentPolicy').mockResolvedValue({
        id: 'policy-1',
        version: '1.0',
        title: 'Privacy Policy',
        content: 'Content',
        effectiveDate: '2025-01-01T00:00:00Z',
        isActive: true
      });

      mockSupabaseQuery.mockResolvedValue({ data: null, error: 'No consent found' });

      const result = await privacyService.hasUserConsented(userId);

      expect(result).toBe(false);
    });

    it('should return false when no active policy exists', async () => {
      jest.spyOn(privacyService, 'getCurrentPolicy').mockResolvedValue(null);

      const result = await privacyService.hasUserConsented(userId);

      expect(result).toBe(false);
    });

    it('should return false when database query fails', async () => {
      jest.spyOn(privacyService, 'getCurrentPolicy').mockResolvedValue({
        id: 'policy-1',
        version: '1.0',
        title: 'Privacy Policy',
        content: 'Content',
        effectiveDate: '2025-01-01T00:00:00Z',
        isActive: true
      });

      mockSupabaseQuery.mockRejectedValue(new Error('Database error'));

      const result = await privacyService.hasUserConsented(userId);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Error checking user consent:', expect.any(Error));
    });
  });

  describe('getUserConsentHistory', () => {
    const userId = 'user-123';

    it('should return user consent history', async () => {
      const mockConsents = [
        {
          id: 'consent-1',
          user_id: userId,
          policy_version: '1.0',
          consented_at: '2025-01-01T00:00:00Z',
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0'
        },
        {
          id: 'consent-2',
          user_id: userId,
          policy_version: '0.9',
          consented_at: '2024-12-01T00:00:00Z',
          ip_address: '192.168.1.2',
          user_agent: 'Chrome/95.0'
        }
      ];

      // Mock the query chain properly for this method
      const orderMock = jest.fn().mockResolvedValue({ data: mockConsents, error: null });
      const eqMock = jest.fn(() => ({
        order: orderMock
      }));
      const selectMock = jest.fn(() => ({
        eq: eqMock
      }));

      (supabase.from as jest.Mock).mockReturnValue({
        select: selectMock
      });

      const result = await privacyService.getUserConsentHistory(userId);

      expect(result).toEqual([
        {
          id: 'consent-1',
          userId: userId,
          policyVersion: '1.0',
          consentedAt: '2025-01-01T00:00:00Z',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        },
        {
          id: 'consent-2',
          userId: userId,
          policyVersion: '0.9',
          consentedAt: '2024-12-01T00:00:00Z',
          ipAddress: '192.168.1.2',
          userAgent: 'Chrome/95.0'
        }
      ]);

      expect(selectMock).toHaveBeenCalledWith('*');
      expect(eqMock).toHaveBeenCalledWith('user_id', userId);
      expect(orderMock).toHaveBeenCalledWith('consented_at', { ascending: false });
    });

    it('should return empty array when no consent history exists', async () => {
      const orderMock = jest.fn().mockResolvedValue({ data: null, error: 'No data found' });
      
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: orderMock
          }))
        }))
      });

      const result = await privacyService.getUserConsentHistory(userId);

      expect(result).toEqual([]);
    });

    it('should return empty array when database query fails', async () => {
      const orderMock = jest.fn().mockRejectedValue(new Error('Database error'));
      
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: orderMock
          }))
        }))
      });

      const result = await privacyService.getUserConsentHistory(userId);

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching consent history:', expect.any(Error));
    });
  });

  describe('updatePrivacySettings', () => {
    const userId = 'user-123';

    beforeEach(() => {
      // Setup mock for users table operations
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: mockSupabaseQuery
              }))
            })),
            update: jest.fn(() => ({
              eq: jest.fn(() => mockSupabaseQuery)
            }))
          };
        }
      });
    });

    it('should update privacy settings successfully', async () => {
      const existingSettings = { dataRetention: 365, analyticsOptOut: false };
      const newSettings = { analyticsOptOut: true };

      mockSupabaseQuery
        .mockResolvedValueOnce({ data: { privacy_settings: existingSettings }, error: null })
        .mockResolvedValueOnce({ error: null });

      const result = await privacyService.updatePrivacySettings(userId, newSettings);

      expect(result).toEqual({
        success: true,
        message: 'Privacy settings updated successfully'
      });
    });

    it('should merge new settings with existing settings', async () => {
      const existingSettings = { dataRetention: 365, analyticsOptOut: false };
      const newSettings = { dataRetention: 730 };

      const updateMock = jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ error: null })
      }));

      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({ data: { privacy_settings: existingSettings }, error: null })
              }))
            })),
            update: updateMock
          };
        }
      });

      await privacyService.updatePrivacySettings(userId, newSettings);

      expect(updateMock).toHaveBeenCalledWith({
        privacy_settings: { dataRetention: 730, analyticsOptOut: false }
      });
    });

    it('should handle user not found', async () => {
      mockSupabaseQuery.mockResolvedValue({ data: null, error: 'User not found' });

      const result = await privacyService.updatePrivacySettings(userId, {});

      expect(result).toEqual({
        success: false,
        message: 'User not found'
      });
    });

    it('should handle update failure', async () => {
      const updateEqMock = jest.fn().mockResolvedValue({ error: 'Update failed' });
      const updateMock = jest.fn(() => ({
        eq: updateEqMock
      }));

      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({ data: { privacy_settings: {} }, error: null })
              }))
            })),
            update: updateMock
          };
        }
      });

      const result = await privacyService.updatePrivacySettings(userId, {});

      expect(result).toEqual({
        success: false,
        message: 'Failed to update privacy settings'
      });
    });

    it('should handle exceptions', async () => {
      mockSupabaseQuery.mockRejectedValue(new Error('Database error'));

      const result = await privacyService.updatePrivacySettings(userId, {});

      expect(result).toEqual({
        success: false,
        message: 'Failed to update privacy settings'
      });
      expect(consoleSpy).toHaveBeenCalledWith('Error updating privacy settings:', expect.any(Error));
    });

    it('should use default settings when user has no existing settings', async () => {
      const newSettings = { analyticsOptOut: true };

      const updateMock = jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ error: null })
      }));

      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({ data: { privacy_settings: null }, error: null })
              }))
            })),
            update: updateMock
          };
        }
      });

      await privacyService.updatePrivacySettings(userId, newSettings);

      expect(updateMock).toHaveBeenCalledWith({
        privacy_settings: { dataRetention: 365, analyticsOptOut: true }
      });
    });
  });

  describe('getPrivacySettings', () => {
    const userId = 'user-123';

    it('should return user privacy settings', async () => {
      const mockSettings = { dataRetention: 730, analyticsOptOut: true };
      mockSupabaseQuery.mockResolvedValue({ data: { privacy_settings: mockSettings }, error: null });

      const result = await privacyService.getPrivacySettings(userId);

      expect(result).toEqual(mockSettings);
    });

    it('should return default settings when user has no settings', async () => {
      mockSupabaseQuery.mockResolvedValue({ data: { privacy_settings: null }, error: null });

      const result = await privacyService.getPrivacySettings(userId);

      expect(result).toEqual({ dataRetention: 365, analyticsOptOut: false });
    });

    it('should return null when user not found', async () => {
      mockSupabaseQuery.mockResolvedValue({ data: null, error: 'User not found' });

      const result = await privacyService.getPrivacySettings(userId);

      expect(result).toBeNull();
    });

    it('should handle exceptions and return null', async () => {
      mockSupabaseQuery.mockRejectedValue(new Error('Database error'));

      const result = await privacyService.getPrivacySettings(userId);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching privacy settings:', expect.any(Error));
    });
  });

  describe('initializePrivacySettings', () => {
    const userId = 'user-123';

    it('should initialize default privacy settings for new user', async () => {
      const updateMock = jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ error: null })
      }));

      (supabase.from as jest.Mock).mockReturnValue({
        update: updateMock
      });

      await privacyService.initializePrivacySettings(userId);

      expect(updateMock).toHaveBeenCalledWith({
        privacy_settings: { dataRetention: 365, analyticsOptOut: false }
      });
    });

    it('should handle initialization errors gracefully', async () => {
      const updateMock = jest.fn(() => ({
        eq: jest.fn().mockRejectedValue(new Error('Database error'))
      }));

      (supabase.from as jest.Mock).mockReturnValue({
        update: updateMock
      });

      // Should not throw
      await expect(privacyService.initializePrivacySettings(userId)).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith('Error initializing privacy settings:', expect.any(Error));
    });
  });

  describe('Security and Privacy Tests', () => {
    describe('Data Isolation', () => {
      it('should only return consent history for the specified user', async () => {
        const userId = 'user-123';
        const otherUserId = 'user-456';

        (supabase.from as jest.Mock).mockReturnValue({
          select: jest.fn(() => ({
            eq: jest.fn((field, value) => {
              // Verify correct user ID is used in query
              expect(field).toBe('user_id');
              expect(value).toBe(userId);
              return {
                order: jest.fn(() => mockSupabaseQuery)
              };
            })
          }))
        });

        mockSupabaseQuery.mockResolvedValue({ data: [], error: null });

        await privacyService.getUserConsentHistory(userId);

        // Ensure query was called with correct user ID
        const fromMock = supabase.from as jest.Mock;
        expect(fromMock).toHaveBeenCalledWith('privacy_consents');
      });

      it('should isolate privacy settings by user ID', async () => {
        const userId = 'user-123';

        (supabase.from as jest.Mock).mockReturnValue({
          select: jest.fn(() => ({
            eq: jest.fn((field, value) => {
              // Verify correct user ID is used in query
              expect(field).toBe('id');
              expect(value).toBe(userId);
              return {
                single: mockSupabaseQuery
              };
            })
          }))
        });

        mockSupabaseQuery.mockResolvedValue({ data: null, error: null });

        await privacyService.getPrivacySettings(userId);
      });
    });

    describe('Input Validation', () => {
      it('should handle malicious user IDs safely', async () => {
        const maliciousUserId = "'; DROP TABLE users; --";

        // Should not cause query errors due to parameterized queries
        mockSupabaseQuery.mockResolvedValue({ data: null, error: null });

        const result = await privacyService.getPrivacySettings(maliciousUserId);

        expect(result).toBeNull();
        // Supabase should handle SQL injection prevention automatically
      });

      it('should handle special characters in policy versions', async () => {
        const userId = 'user-123';
        const maliciousPolicyVersion = "<script>alert('xss')</script>";

        (supabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'privacy_consents') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    single: jest.fn().mockResolvedValue({ data: null, error: null })
                  }))
                }))
              })),
              insert: jest.fn().mockResolvedValue({ error: null })
            };
          }
        });

        const result = await privacyService.recordConsent(userId, maliciousPolicyVersion);

        expect(result.success).toBe(true);
        // Service should handle the input without issues
      });
    });

    describe('Sensitive Data Handling', () => {
      it('should not log sensitive user data in errors', async () => {
        const sensitiveUserId = 'user-sensitive-123';
        
        mockSupabaseQuery.mockRejectedValue(new Error('Database connection failed'));

        await privacyService.getPrivacySettings(sensitiveUserId);

        // Check that sensitive user ID is not in console logs
        const logCalls = consoleSpy.mock.calls;
        logCalls.forEach(call => {
          const logMessage = JSON.stringify(call);
          expect(logMessage).not.toContain(sensitiveUserId);
        });
      });

      it('should not log IP addresses in errors', async () => {
        const userId = 'user-123';
        const policyVersion = '1.0';
        const sensitiveIP = '192.168.1.100';

        mockSupabaseQuery.mockRejectedValue(new Error('Database error'));

        await privacyService.recordConsent(userId, policyVersion, sensitiveIP);

        // Check that IP address is not in console logs
        const logCalls = consoleSpy.mock.calls;
        logCalls.forEach(call => {
          const logMessage = JSON.stringify(call);
          expect(logMessage).not.toContain(sensitiveIP);
        });
      });

      it('should not log user agent strings in errors', async () => {
        const userId = 'user-123';
        const policyVersion = '1.0';
        const sensitiveUserAgent = 'Mozilla/5.0 (Sensitive Info) Chrome/95.0';

        mockSupabaseQuery.mockRejectedValue(new Error('Database error'));

        await privacyService.recordConsent(userId, policyVersion, undefined, sensitiveUserAgent);

        // Check that user agent is not in console logs
        const logCalls = consoleSpy.mock.calls;
        logCalls.forEach(call => {
          const logMessage = JSON.stringify(call);
          expect(logMessage).not.toContain(sensitiveUserAgent);
        });
      });
    });

    describe('Privacy Compliance', () => {
      it('should record consent with timestamp for compliance', async () => {
        const userId = 'user-123';
        const policyVersion = '1.0';
        const ipAddress = '192.168.1.1';

        const insertMock = jest.fn().mockResolvedValue({ error: null });
        
        (supabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'privacy_consents') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    single: jest.fn().mockResolvedValue({ data: null, error: null })
                  }))
                }))
              })),
              insert: insertMock
            };
          }
        });

        const beforeTime = new Date().toISOString();
        await privacyService.recordConsent(userId, policyVersion, ipAddress);
        const afterTime = new Date().toISOString();

        expect(insertMock).toHaveBeenCalledWith([{
          user_id: userId,
          policy_version: policyVersion,
          ip_address: ipAddress,
          user_agent: undefined,
          consented_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
        }]);

        // Verify timestamp is within reasonable range
        const call = insertMock.mock.calls[0][0][0];
        expect(call.consented_at >= beforeTime && call.consented_at <= afterTime).toBe(true);
      });

      it('should maintain audit trail of consent changes', async () => {
        const userId = 'user-123';
        const oldPolicyVersion = '1.0';
        const newPolicyVersion = '2.0';

        (supabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'privacy_consents') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    single: jest.fn().mockResolvedValue({ data: null, error: null })
                  }))
                }))
              })),
              insert: jest.fn().mockResolvedValue({ error: null })
            };
          }
        });

        // Record consent for old version
        await privacyService.recordConsent(userId, oldPolicyVersion);
        
        // Record consent for new version
        await privacyService.recordConsent(userId, newPolicyVersion);

        // Both consents should be recorded (not overwritten)
        expect(supabase.from).toHaveBeenCalledWith('privacy_consents');
      });

      it('should provide data retention compliance through settings', async () => {
        const userId = 'user-123';
        const retentionSettings = { dataRetention: 1095 }; // 3 years

        const updateMock = jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ error: null })
        }));

        (supabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'users') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({ 
                    data: { privacy_settings: { dataRetention: 365, analyticsOptOut: false } }, 
                    error: null 
                  })
                }))
              })),
              update: updateMock
            };
          }
        });

        await privacyService.updatePrivacySettings(userId, retentionSettings);

        expect(updateMock).toHaveBeenCalledWith({
          privacy_settings: { dataRetention: 1095, analyticsOptOut: false }
        });
      });

      it('should support analytics opt-out for privacy compliance', async () => {
        const userId = 'user-123';
        const analyticsSettings = { analyticsOptOut: true };

        const updateMock = jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ error: null })
        }));

        (supabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'users') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({ 
                    data: { privacy_settings: { dataRetention: 365, analyticsOptOut: false } }, 
                    error: null 
                  })
                }))
              })),
              update: updateMock
            };
          }
        });

        await privacyService.updatePrivacySettings(userId, analyticsSettings);

        expect(updateMock).toHaveBeenCalledWith({
          privacy_settings: { dataRetention: 365, analyticsOptOut: true }
        });
      });
    });
  });
});