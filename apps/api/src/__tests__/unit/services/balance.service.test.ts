import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { balanceService } from '../../../services/funding/balance.service';
import { supabase } from '../../../app';
import { 
  AccountBalance, 
  CardBalance, 
  BalanceNotificationThreshold 
} from '@discard/shared/src/types/funding';
import { FUNDING_CONSTANTS } from '@discard/shared/src/constants/funding';

// Mock Supabase
const mockBalanceQuery = {
  insert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn()
};

jest.mock('../../../app', () => ({
  supabase: {
    from: jest.fn(() => mockBalanceQuery)
  }
}));

const mockSupabaseClient = supabase as jest.Mocked<typeof supabase>;

describe('BalanceService', () => {
  const mockUserId = 'test-user-id';
  const mockCardId = 'test-card-id';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock query methods
    Object.values(mockBalanceQuery).forEach(mock => {
      if (typeof mock === 'function' && mock.mockReset) {
        mock.mockReset();
        mock.mockReturnThis && mock.mockReturnThis();
      }
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getAccountBalance', () => {
    test('should return existing account balance', async () => {
      // Arrange
      const mockBalance = {
        user_id: mockUserId,
        total_balance: 20000,
        allocated_balance: 8000,
        available_balance: 12000,
        last_updated: '2024-01-01T00:00:00.000Z'
      };

      mockBalanceQuery.single.mockResolvedValue({ data: mockBalance, error: null });

      // Act
      const result = await balanceService.getAccountBalance(mockUserId);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('account_balances');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(result).toEqual({
        userId: mockUserId,
        totalBalance: 20000,
        allocatedBalance: 8000,
        availableBalance: 12000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      });
    });

    test('should create new account balance if none exists', async () => {
      // Arrange
      const mockCreatedBalance = {
        user_id: mockUserId,
        total_balance: 0,
        allocated_balance: 0,
        available_balance: 0,
        last_updated: '2024-01-01T00:00:00.000Z'
      };

      const mockQuery = mockSupabaseClient.from('account_balances');
      mockQuery.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // Not found
        .mockResolvedValueOnce({ data: mockCreatedBalance, error: null }); // Created

      // Act
      const result = await balanceService.getAccountBalance(mockUserId);

      // Assert
      expect(mockQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: mockUserId,
        total_balance: 0,
        allocated_balance: 0
      }));
      expect(result.totalBalance).toBe(0);
      expect(result.allocatedBalance).toBe(0);
      expect(result.availableBalance).toBe(0);
    });

    test('should handle database fetch error', async () => {
      // Arrange
      const mockQuery = mockSupabaseClient.from('account_balances');
      mockQuery.single.mockResolvedValue({ 
        data: null, 
        error: { message: 'Database error', code: 'OTHER_ERROR' } 
      });

      // Act & Assert
      await expect(balanceService.getAccountBalance(mockUserId))
        .rejects.toThrow('Failed to fetch account balance');
    });

    test('should handle database creation error', async () => {
      // Arrange
      const mockQuery = mockSupabaseClient.from('account_balances');
      mockQuery.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: null, error: { message: 'Creation failed' } });

      // Act & Assert
      await expect(balanceService.getAccountBalance(mockUserId))
        .rejects.toThrow('Failed to create account balance');
    });
  });

  describe('updateAccountBalance', () => {
    test('should update account balance successfully', async () => {
      // Arrange
      const currentBalance = {
        userId: mockUserId,
        totalBalance: 10000,
        allocatedBalance: 5000,
        availableBalance: 5000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      const updatedBalance = {
        user_id: mockUserId,
        total_balance: 15000,
        allocated_balance: 7000,
        available_balance: 8000,
        last_updated: '2024-01-01T01:00:00.000Z'
      };

      // Mock getAccountBalance
      jest.spyOn(balanceService, 'getAccountBalance').mockResolvedValue(currentBalance);

      const mockQuery = mockSupabaseClient.from('account_balances');
      mockQuery.single.mockResolvedValue({ data: updatedBalance, error: null });

      // Act
      const result = await balanceService.updateAccountBalance(mockUserId, 5000, 2000);

      // Assert
      expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
        total_balance: 15000,
        allocated_balance: 7000
      }));
      expect(result.totalBalance).toBe(15000);
      expect(result.allocatedBalance).toBe(7000);
      expect(result.availableBalance).toBe(8000);
    });

    test('should reject update that would make allocated balance exceed total', async () => {
      // Arrange
      const currentBalance = {
        userId: mockUserId,
        totalBalance: 10000,
        allocatedBalance: 8000,
        availableBalance: 2000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      jest.spyOn(balanceService, 'getAccountBalance').mockResolvedValue(currentBalance);

      // Act & Assert
      await expect(balanceService.updateAccountBalance(mockUserId, 0, 5000))
        .rejects.toThrow('Allocated balance cannot exceed total balance');
    });

    test('should reject update that would make total balance negative', async () => {
      // Arrange
      const currentBalance = {
        userId: mockUserId,
        totalBalance: 5000,
        allocatedBalance: 2000,
        availableBalance: 3000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      jest.spyOn(balanceService, 'getAccountBalance').mockResolvedValue(currentBalance);

      // Act & Assert
      await expect(balanceService.updateAccountBalance(mockUserId, -6000, 0))
        .rejects.toThrow('Total balance cannot be negative');
    });

    test('should reject update that would make allocated balance negative', async () => {
      // Arrange
      const currentBalance = {
        userId: mockUserId,
        totalBalance: 10000,
        allocatedBalance: 3000,
        availableBalance: 7000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      jest.spyOn(balanceService, 'getAccountBalance').mockResolvedValue(currentBalance);

      // Act & Assert
      await expect(balanceService.updateAccountBalance(mockUserId, 0, -4000))
        .rejects.toThrow('Allocated balance cannot be negative');
    });
  });

  describe('getCardBalance', () => {
    test('should return card balance successfully', async () => {
      // Arrange
      const mockCard = {
        current_balance: 5000,
        updated_at: '2024-01-01T00:00:00.000Z'
      };

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({ data: mockCard, error: null });

      // Act
      const result = await balanceService.getCardBalance(mockCardId);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('cards');
      expect(mockQuery.eq).toHaveBeenCalledWith('card_id', mockCardId);
      expect(result).toEqual({
        cardId: mockCardId,
        balance: 5000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      });
    });

    test('should throw error for non-existent card', async () => {
      // Arrange
      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      // Act & Assert
      await expect(balanceService.getCardBalance(mockCardId))
        .rejects.toThrow('Failed to fetch card balance');
    });
  });

  describe('updateCardBalance', () => {
    test('should update card balance successfully', async () => {
      // Arrange
      const currentBalance = {
        cardId: mockCardId,
        balance: 3000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      const updatedCard = {
        current_balance: 5000,
        updated_at: '2024-01-01T01:00:00.000Z'
      };

      jest.spyOn(balanceService, 'getCardBalance').mockResolvedValue(currentBalance);

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({ data: updatedCard, error: null });

      // Act
      const result = await balanceService.updateCardBalance(mockCardId, 2000);

      // Assert
      expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
        current_balance: 5000
      }));
      expect(result.balance).toBe(5000);
    });

    test('should reject update that would make balance negative', async () => {
      // Arrange
      const currentBalance = {
        cardId: mockCardId,
        balance: 1000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      jest.spyOn(balanceService, 'getCardBalance').mockResolvedValue(currentBalance);

      // Act & Assert
      await expect(balanceService.updateCardBalance(mockCardId, -2000))
        .rejects.toThrow('Card balance cannot be negative');
    });
  });

  describe('getNotificationThresholds', () => {
    test('should return existing notification thresholds', async () => {
      // Arrange
      const mockThreshold = {
        user_id: mockUserId,
        account_threshold: 2000,
        card_threshold: 1000,
        enable_notifications: true,
        notification_methods: JSON.stringify(['email', 'push'])
      };

      const mockQuery = mockSupabaseClient.from('balance_notification_thresholds');
      mockQuery.single.mockResolvedValue({ data: mockThreshold, error: null });

      // Act
      const result = await balanceService.getNotificationThresholds(mockUserId);

      // Assert
      expect(result).toEqual({
        userId: mockUserId,
        accountThreshold: 2000,
        cardThreshold: 1000,
        enableNotifications: true,
        notificationMethods: ['email', 'push']
      });
    });

    test('should create default thresholds if none exist', async () => {
      // Arrange
      const mockDefaultThreshold = {
        user_id: mockUserId,
        account_threshold: FUNDING_CONSTANTS.DEFAULT_ACCOUNT_THRESHOLD,
        card_threshold: FUNDING_CONSTANTS.DEFAULT_CARD_THRESHOLD,
        enable_notifications: true,
        notification_methods: JSON.stringify(['email'])
      };

      const mockQuery = mockSupabaseClient.from('balance_notification_thresholds');
      mockQuery.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: mockDefaultThreshold, error: null });

      // Act
      const result = await balanceService.getNotificationThresholds(mockUserId);

      // Assert
      expect(mockQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: mockUserId,
        account_threshold: FUNDING_CONSTANTS.DEFAULT_ACCOUNT_THRESHOLD,
        card_threshold: FUNDING_CONSTANTS.DEFAULT_CARD_THRESHOLD,
        enable_notifications: true
      }));
      expect(result.accountThreshold).toBe(FUNDING_CONSTANTS.DEFAULT_ACCOUNT_THRESHOLD);
      expect(result.cardThreshold).toBe(FUNDING_CONSTANTS.DEFAULT_CARD_THRESHOLD);
    });
  });

  describe('updateNotificationThresholds', () => {
    test('should update notification thresholds successfully', async () => {
      // Arrange
      const currentThresholds = {
        userId: mockUserId,
        accountThreshold: 1000,
        cardThreshold: 500,
        enableNotifications: true,
        notificationMethods: ['email']
      };

      const updatedThreshold = {
        user_id: mockUserId,
        account_threshold: 2000,
        card_threshold: 750,
        enable_notifications: false,
        notification_methods: JSON.stringify(['email', 'sms'])
      };

      jest.spyOn(balanceService, 'getNotificationThresholds').mockResolvedValue(currentThresholds);

      const mockQuery = mockSupabaseClient.from('balance_notification_thresholds');
      mockQuery.single.mockResolvedValue({ data: updatedThreshold, error: null });

      // Act
      const result = await balanceService.updateNotificationThresholds(mockUserId, {
        accountThreshold: 2000,
        cardThreshold: 750,
        enableNotifications: false,
        notificationMethods: ['email', 'sms']
      });

      // Assert
      expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
        account_threshold: 2000,
        card_threshold: 750,
        enable_notifications: false,
        notification_methods: JSON.stringify(['email', 'sms'])
      }));
      expect(result.accountThreshold).toBe(2000);
      expect(result.cardThreshold).toBe(750);
      expect(result.enableNotifications).toBe(false);
    });
  });

  describe('checkLowBalanceNotification', () => {
    test('should identify low account balance', async () => {
      // Arrange
      const mockThresholds = {
        userId: mockUserId,
        accountThreshold: 5000,
        cardThreshold: 1000,
        enableNotifications: true,
        notificationMethods: ['email']
      };

      const mockAccountBalance = {
        userId: mockUserId,
        totalBalance: 8000,
        allocatedBalance: 6000,
        availableBalance: 2000, // Below threshold of 5000
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      const mockCards = [
        { card_id: 'card-1', current_balance: 1500 }, // Above threshold
        { card_id: 'card-2', current_balance: 500 }   // Below threshold
      ];

      jest.spyOn(balanceService, 'getNotificationThresholds').mockResolvedValue(mockThresholds);
      jest.spyOn(balanceService, 'getAccountBalance').mockResolvedValue(mockAccountBalance);

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.eq.mockReturnThis();
      mockQuery.eq.mockResolvedValue({ data: mockCards, error: null });

      // Act
      const result = await balanceService.checkLowBalanceNotification(mockUserId);

      // Assert
      expect(result.shouldNotifyAccount).toBe(true);
      expect(result.shouldNotifyCards).toEqual(['card-2']);
    });

    test('should return no notifications when disabled', async () => {
      // Arrange
      const mockThresholds = {
        userId: mockUserId,
        accountThreshold: 5000,
        cardThreshold: 1000,
        enableNotifications: false, // Disabled
        notificationMethods: ['email']
      };

      jest.spyOn(balanceService, 'getNotificationThresholds').mockResolvedValue(mockThresholds);

      // Act
      const result = await balanceService.checkLowBalanceNotification(mockUserId);

      // Assert
      expect(result.shouldNotifyAccount).toBe(false);
      expect(result.shouldNotifyCards).toEqual([]);
    });

    test('should handle cards query error gracefully', async () => {
      // Arrange
      const mockThresholds = {
        userId: mockUserId,
        accountThreshold: 5000,
        cardThreshold: 1000,
        enableNotifications: true,
        notificationMethods: ['email']
      };

      const mockAccountBalance = {
        userId: mockUserId,
        totalBalance: 10000,
        allocatedBalance: 5000,
        availableBalance: 5000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      jest.spyOn(balanceService, 'getNotificationThresholds').mockResolvedValue(mockThresholds);
      jest.spyOn(balanceService, 'getAccountBalance').mockResolvedValue(mockAccountBalance);

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.eq.mockReturnThis();
      mockQuery.eq.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      // Act
      const result = await balanceService.checkLowBalanceNotification(mockUserId);

      // Assert
      expect(result.shouldNotifyAccount).toBe(false); // Account balance above threshold
      expect(result.shouldNotifyCards).toEqual([]); // Empty due to error
    });
  });

  describe('transferCardBalance (deprecated)', () => {
    test('should throw error for deprecated method', async () => {
      // Act & Assert
      await expect(balanceService.transferCardBalance('card1', 'card2', 1000))
        .rejects.toThrow('Card balance transfers should be handled through funding transactions');
    });
  });
});