/**
 * Component Tests for CardComponent
 * Testing card display, privacy indicators, and secure actions
 */

import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CardComponent from '../../../src/components/cards/CardComponent';
import { CardClipboard } from '@discard/shared';
import { testDataFactory, mockFunctions, mockAlert, mockClipboard } from '../../utils/test-helpers';

// Mock Alert
jest.spyOn(Alert, 'alert').mockImplementation(mockAlert.alert);

// Mock CardClipboard from shared package
jest.mock('@discard/shared', () => ({
  formatUSD: jest.fn((amount) => `$${amount.toFixed(2)}`),
  maskCardNumber: jest.fn(() => '**** **** **** 1234'),
  copySecurely: jest.fn(),
  CardClipboard: {
    copyCardNumber: mockClipboard.copyCardNumber,
    copyCVV: mockClipboard.copyCVV,
  },
}));

// Mock PrivacyIndicator
jest.mock('../../../src/components/privacy/PrivacyIndicator', () => {
  const MockPrivacyIndicator = ({ status, size }: any) => {
    const MockedComponent = require('react-native').Text;
    return <MockedComponent testID="privacy-indicator">{`Privacy: ${status.status}`}</MockedComponent>;
  };
  return {
    __esModule: true,
    default: MockPrivacyIndicator,
    getCardPrivacyStatus: jest.fn(() => ({ status: 'secure', privacyIsolated: true })),
  };
});

describe('CardComponent', () => {
  beforeEach(() => {
    mockFunctions.resetMocks();
    mockAlert.resetMocks();
    mockClipboard.resetMocks();
  });

  describe('Basic Rendering', () => {
    test('should render active card correctly', () => {
      const card = testDataFactory.createActiveCard();
      
      render(<CardComponent card={card} />);

      expect(screen.getByText('ACTIVE')).toBeOnTheScreen();
      expect(screen.getByText('4111 1111 1111 1111')).toBeOnTheScreen();
      expect(screen.getByText('123')).toBeOnTheScreen();
      expect(screen.getByText('$50.00')).toBeOnTheScreen(); // Balance
      expect(screen.getByText('$100.00')).toBeOnTheScreen(); // Limit
      expect(screen.getByTestId('privacy-indicator')).toBeOnTheScreen();
    });

    test('should render paused card correctly', () => {
      const card = testDataFactory.createPausedCard();
      
      render(<CardComponent card={card} />);

      expect(screen.getByText('PAUSED')).toBeOnTheScreen();
      expect(screen.getByText('Activate')).toBeOnTheScreen();
    });

    test('should render deleted card correctly', () => {
      const card = testDataFactory.createDeletedCard();
      
      render(<CardComponent card={card} />);

      expect(screen.getByText('DELETED')).toBeOnTheScreen();
      expect(screen.queryByText('Pause')).not.toBeOnTheScreen();
      expect(screen.queryByText('Delete')).not.toBeOnTheScreen();
    });

    test('should render compact card when compact prop is true', () => {
      const card = testDataFactory.createActiveCard();
      
      render(<CardComponent card={card} compact={true} />);

      expect(screen.getByText('Card test-car')).toBeOnTheScreen(); // Shortened ID
      expect(screen.getByText('$50.00')).toBeOnTheScreen();
      expect(screen.queryByText('4111 1111 1111 1111')).not.toBeOnTheScreen();
    });
  });

  describe('Card Actions', () => {
    test('should call onPress when card is pressed', () => {
      const card = testDataFactory.createActiveCard();
      const onPress = mockFunctions.cardActions.onPress;
      
      render(<CardComponent card={card} onPress={onPress} />);

      fireEvent.press(screen.getByTestId('card-container') || screen.getByText('ACTIVE').parent!);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    test('should handle status toggle from active to paused', async () => {
      const card = testDataFactory.createActiveCard();
      const onStatusChange = mockFunctions.cardActions.onStatusChange;
      
      render(<CardComponent card={card} onStatusChange={onStatusChange} />);

      fireEvent.press(screen.getByText('Pause'));
      
      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith('test-card-id', 'paused');
      });
    });

    test('should handle status toggle from paused to active', async () => {
      const card = testDataFactory.createPausedCard();
      const onStatusChange = mockFunctions.cardActions.onStatusChange;
      
      render(<CardComponent card={card} onStatusChange={onStatusChange} />);

      fireEvent.press(screen.getByText('Activate'));
      
      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith('test-card-id', 'active');
      });
    });

    test('should show confirmation dialog for card deletion', () => {
      const card = testDataFactory.createActiveCard();
      const onDelete = mockFunctions.cardActions.onDelete;
      
      render(<CardComponent card={card} onDelete={onDelete} />);

      fireEvent.press(screen.getByText('Delete'));

      expect(mockAlert.alert).toHaveBeenCalledWith(
        'Delete Card',
        expect.stringContaining('permanently delete this card'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
          expect.objectContaining({ text: 'Delete', style: 'destructive' }),
        ])
      );
    });

    test('should execute deletion when confirmed', () => {
      const card = testDataFactory.createActiveCard();
      const onDelete = mockFunctions.cardActions.onDelete;
      
      render(<CardComponent card={card} onDelete={onDelete} />);

      fireEvent.press(screen.getByText('Delete'));

      // Simulate user confirming deletion
      const alertCall = mockAlert.alert.mock.calls[0];
      const confirmButton = alertCall[2].find((button: any) => button.text === 'Delete');
      confirmButton.onPress();

      expect(onDelete).toHaveBeenCalledWith('test-card-id');
    });
  });

  describe('Secure Clipboard Actions', () => {
    test('should copy card number securely', async () => {
      const card = testDataFactory.createActiveCard();
      
      render(<CardComponent card={card} />);

      fireEvent.press(screen.getAllByText('📋')[0]); // First copy button (card number)

      await waitFor(() => {
        expect(mockClipboard.copyCardNumber).toHaveBeenCalledWith('4111111111111111');
      });

      expect(mockAlert.alert).toHaveBeenCalledWith('Copied', 'Card number copied!');
    });

    test('should copy CVV securely', async () => {
      const card = testDataFactory.createActiveCard();
      
      render(<CardComponent card={card} />);

      fireEvent.press(screen.getAllByText('📋')[1]); // Second copy button (CVV)

      await waitFor(() => {
        expect(mockClipboard.copyCVV).toHaveBeenCalledWith('123');
      });

      expect(mockAlert.alert).toHaveBeenCalledWith('Copied', 'CVV copied!');
    });

    test('should handle clipboard errors gracefully', async () => {
      const card = testDataFactory.createActiveCard();
      mockClipboard.copyCardNumber.mockRejectedValue(new Error('Clipboard error'));
      
      render(<CardComponent card={card} />);

      fireEvent.press(screen.getAllByText('📋')[0]);

      await waitFor(() => {
        expect(mockAlert.alert).toHaveBeenCalledWith('Error', 'Failed to copy card number');
      });
    });

    test('should not show copy buttons when card credentials are not available', () => {
      const card = testDataFactory.createCard({
        cardNumber: undefined,
        cvv: undefined,
      });
      
      render(<CardComponent card={card} />);

      expect(screen.queryByText('📋')).not.toBeOnTheScreen();
    });
  });

  describe('Loading States', () => {
    test('should show loading overlay when card is loading', () => {
      const card = testDataFactory.createLoadingCard();
      
      render(<CardComponent card={card} />);

      expect(screen.getByTestId('activity-indicator')).toBeOnTheScreen();
    });

    test('should disable buttons during status change', async () => {
      const card = testDataFactory.createActiveCard();
      let resolveStatusChange: () => void;
      const onStatusChange = jest.fn(() => new Promise(resolve => {
        resolveStatusChange = resolve;
      }));
      
      render(<CardComponent card={card} onStatusChange={onStatusChange} />);

      fireEvent.press(screen.getByText('Pause'));

      // Button should be disabled during operation
      expect(screen.getByTestId('activity-indicator')).toBeOnTheScreen();
      
      // Resolve the promise to complete the operation
      resolveStatusChange!();
      
      await waitFor(() => {
        expect(screen.queryByTestId('activity-indicator')).not.toBeOnTheScreen();
      });
    });
  });

  describe('Error Handling', () => {
    test('should display error message when card has error', () => {
      const card = testDataFactory.createCardWithError();
      
      render(<CardComponent card={card} />);

      expect(screen.getByText('Failed to load card')).toBeOnTheScreen();
    });

    test('should handle status change errors', async () => {
      const card = testDataFactory.createActiveCard();
      const onStatusChange = jest.fn().mockRejectedValue(new Error('Network error'));
      
      render(<CardComponent card={card} onStatusChange={onStatusChange} />);

      fireEvent.press(screen.getByText('Pause'));

      await waitFor(() => {
        expect(mockAlert.alert).toHaveBeenCalledWith('Error', 'Failed to pausing card');
      });
    });

    test('should handle deletion errors', async () => {
      const card = testDataFactory.createActiveCard();
      const onDelete = jest.fn().mockRejectedValue(new Error('Network error'));
      
      render(<CardComponent card={card} onDelete={onDelete} />);

      fireEvent.press(screen.getByText('Delete'));
      
      // Confirm deletion
      const alertCall = mockAlert.alert.mock.calls[0];
      const confirmButton = alertCall[2].find((button: any) => button.text === 'Delete');
      await confirmButton.onPress();

      await waitFor(() => {
        expect(mockAlert.alert).toHaveBeenCalledWith('Error', 'Failed to delete card');
      });
    });
  });

  describe('Merchant Restrictions', () => {
    test('should display merchant restrictions when present', () => {
      const card = testDataFactory.createCardWithRestrictions();
      
      render(<CardComponent card={card} />);

      expect(screen.getByText('Merchant Restrictions:')).toBeOnTheScreen();
      expect(screen.getByText('grocery, gas, restaurants')).toBeOnTheScreen();
    });

    test('should not display merchant restrictions section when none', () => {
      const card = testDataFactory.createActiveCard();
      
      render(<CardComponent card={card} />);

      expect(screen.queryByText('Merchant Restrictions:')).not.toBeOnTheScreen();
    });
  });

  describe('Privacy Integration', () => {
    test('should display privacy indicator', () => {
      const card = testDataFactory.createActiveCard();
      
      render(<CardComponent card={card} />);

      expect(screen.getByTestId('privacy-indicator')).toBeOnTheScreen();
      expect(screen.getByText('Privacy: secure')).toBeOnTheScreen();
    });
  });

  describe('Accessibility', () => {
    test('should be accessible with proper test IDs', () => {
      const card = testDataFactory.createActiveCard();
      
      render(<CardComponent card={card} />);

      // All interactive elements should be accessible
      expect(screen.getByText('Pause')).toBeOnTheScreen();
      expect(screen.getByText('Delete')).toBeOnTheScreen();
      expect(screen.getAllByText('📋')[0]).toBeOnTheScreen();
    });

    test('should work without action props', () => {
      const card = testDataFactory.createActiveCard();
      
      expect(() => {
        render(<CardComponent card={card} showActions={false} />);
      }).not.toThrow();

      expect(screen.queryByText('Pause')).not.toBeOnTheScreen();
      expect(screen.queryByText('Delete')).not.toBeOnTheScreen();
    });
  });
});