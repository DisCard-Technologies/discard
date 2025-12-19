/**
 * Screen Tests for CardCreationScreen
 * Testing card creation form, validation, and user interactions
 */

import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CardCreationScreen from '../../../src/screens/cards/CardCreationScreen';
import { testDataFactory, mockFunctions, mockAlert, createMockCardsProvider } from '../../utils/test-helpers';

// Mock Alert
jest.spyOn(Alert, 'alert').mockImplementation(mockAlert.alert);

// Mock the cards context provider
const mockCardsProvider = createMockCardsProvider();

jest.mock('../../../src/stores/cards', () => ({
  useCards: () => mockCardsProvider,
  CardsProvider: ({ children }: any) => children,
}));

const TestCardCreationScreen = (props: any = {}) => {
  return (
    <CardCreationScreen 
      navigation={mockFunctions.navigation} 
      route={{ key: 'CardCreation', name: 'CardCreation', params: {} }}
      {...props}
    />
  );
};

describe('CardCreationScreen', () => {
  beforeEach(() => {
    mockFunctions.resetMocks();
    mockAlert.resetMocks();
    jest.clearAllMocks();
  });

  describe('Screen Rendering', () => {
    test('should render card creation form correctly', () => {
      render(<TestCardCreationScreen />);

      expect(screen.getByText('Create New Card')).toBeOnTheScreen();
      expect(screen.getByPlaceholderText('Enter spending limit')).toBeOnTheScreen();
      expect(screen.getByText('Spending Limit ($)')).toBeOnTheScreen();
      expect(screen.getByText('Create Card')).toBeOnTheScreen();
    });

    test('should render form fields with proper labels', () => {
      render(<TestCardCreationScreen />);

      // Check form field labels
      expect(screen.getByText('Spending Limit ($)')).toBeOnTheScreen();
      expect(screen.getByText('Expiration Date (Optional)')).toBeOnTheScreen();
      expect(screen.getByText('Merchant Restrictions (Optional)')).toBeOnTheScreen();
    });

    test('should have proper default values', () => {
      render(<TestCardCreationScreen />);

      const spendingLimitInput = screen.getByPlaceholderText('Enter spending limit');
      expect(spendingLimitInput.props.value).toBe('');
      
      const createButton = screen.getByText('Create Card');
      expect(createButton).toBeOnTheScreen();
    });
  });

  describe('Form Validation', () => {
    test('should validate required spending limit', async () => {
      render(<TestCardCreationScreen />);

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockAlert.alert).toHaveBeenCalledWith(
          'Validation Error',
          'Spending limit is required'
        );
      });
    });

    test('should validate minimum spending limit', async () => {
      render(<TestCardCreationScreen />);

      const spendingLimitInput = screen.getByPlaceholderText('Enter spending limit');
      fireEvent.changeText(spendingLimitInput, '0.50'); // Below minimum

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockAlert.alert).toHaveBeenCalledWith(
          'Validation Error',
          expect.stringContaining('minimum spending limit')
        );
      });
    });

    test('should validate maximum spending limit', async () => {
      render(<TestCardCreationScreen />);

      const spendingLimitInput = screen.getByPlaceholderText('Enter spending limit');
      fireEvent.changeText(spendingLimitInput, '10001'); // Above maximum

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockAlert.alert).toHaveBeenCalledWith(
          'Validation Error',
          expect.stringContaining('maximum spending limit')
        );
      });
    });

    test('should validate expiration date format', async () => {
      render(<TestCardCreationScreen />);

      const spendingLimitInput = screen.getByPlaceholderText('Enter spending limit');
      fireEvent.changeText(spendingLimitInput, '100');

      const expirationInput = screen.getByPlaceholderText('MM/YY');
      fireEvent.changeText(expirationInput, 'invalid-date');

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockAlert.alert).toHaveBeenCalledWith(
          'Validation Error',
          expect.stringContaining('expiration date format')
        );
      });
    });
  });

  describe('Card Creation', () => {
    test('should create card with valid data', async () => {
      mockCardsProvider.createCard.mockResolvedValue({
        success: true,
        card: testDataFactory.createActiveCard(),
      });

      render(<TestCardCreationScreen />);

      // Fill form with valid data
      const spendingLimitInput = screen.getByPlaceholderText('Enter spending limit');
      fireEvent.changeText(spendingLimitInput, '100');

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockCardsProvider.createCard).toHaveBeenCalledWith({
          spendingLimit: 10000, // $100 in cents
          expirationDate: undefined,
          merchantRestrictions: [],
        });
      });

      expect(mockFunctions.navigation.navigate).toHaveBeenCalledWith('CardDashboard');
    });

    test('should create card with all optional fields', async () => {
      mockCardsProvider.createCard.mockResolvedValue({
        success: true,
        card: testDataFactory.createCardWithRestrictions(),
      });

      render(<TestCardCreationScreen />);

      // Fill all form fields
      const spendingLimitInput = screen.getByPlaceholderText('Enter spending limit');
      fireEvent.changeText(spendingLimitInput, '500');

      const expirationInput = screen.getByPlaceholderText('MM/YY');
      fireEvent.changeText(expirationInput, '12/26');

      // Add merchant restrictions
      const addRestrictionButton = screen.getByText('Add Restriction');
      fireEvent.press(addRestrictionButton);

      const restrictionInput = screen.getByPlaceholderText('e.g., grocery, gas');
      fireEvent.changeText(restrictionInput, 'grocery');

      const confirmRestrictionButton = screen.getByText('Add');
      fireEvent.press(confirmRestrictionButton);

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockCardsProvider.createCard).toHaveBeenCalledWith({
          spendingLimit: 50000, // $500 in cents
          expirationDate: '1226', // MMYY format
          merchantRestrictions: ['grocery'],
        });
      });
    });

    test('should handle card creation errors', async () => {
      mockCardsProvider.createCard.mockRejectedValue(new Error('Network error'));

      render(<TestCardCreationScreen />);

      const spendingLimitInput = screen.getByPlaceholderText('Enter spending limit');
      fireEvent.changeText(spendingLimitInput, '100');

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockAlert.alert).toHaveBeenCalledWith(
          'Error',
          'Failed to create card. Please try again.'
        );
      });
    });
  });

  describe('Loading States', () => {
    test('should show loading state during card creation', async () => {
      let resolveCreateCard: () => void;
      mockCardsProvider.createCard.mockImplementation(() => new Promise(resolve => {
        resolveCreateCard = () => resolve({ success: true, card: testDataFactory.createActiveCard() });
      }));

      render(<TestCardCreationScreen />);

      const spendingLimitInput = screen.getByPlaceholderText('Enter spending limit');
      fireEvent.changeText(spendingLimitInput, '100');

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      // Should show loading state
      expect(screen.getByTestId('activity-indicator')).toBeOnTheScreen();
      expect(screen.getByText('Creating Card...')).toBeOnTheScreen();

      // Resolve the creation
      resolveCreateCard!();

      await waitFor(() => {
        expect(screen.queryByTestId('activity-indicator')).not.toBeOnTheScreen();
      });
    });

    test('should disable form during loading', async () => {
      mockCardsProvider.loading = true;

      render(<TestCardCreationScreen />);

      const spendingLimitInput = screen.getByPlaceholderText('Enter spending limit');
      const createButton = screen.getByText('Create Card');

      expect(spendingLimitInput).toBeDisabled();
      expect(createButton).toBeDisabled();
    });
  });

  describe('Merchant Restrictions', () => {
    test('should add merchant restrictions', () => {
      render(<TestCardCreationScreen />);

      const addRestrictionButton = screen.getByText('Add Restriction');
      fireEvent.press(addRestrictionButton);

      expect(screen.getByPlaceholderText('e.g., grocery, gas')).toBeOnTheScreen();
      expect(screen.getByText('Add')).toBeOnTheScreen();
      expect(screen.getByText('Cancel')).toBeOnTheScreen();
    });

    test('should remove merchant restrictions', () => {
      render(<TestCardCreationScreen />);

      // Add a restriction first
      const addRestrictionButton = screen.getByText('Add Restriction');
      fireEvent.press(addRestrictionButton);

      const restrictionInput = screen.getByPlaceholderText('e.g., grocery, gas');
      fireEvent.changeText(restrictionInput, 'grocery');

      const confirmButton = screen.getByText('Add');
      fireEvent.press(confirmButton);

      // Should show the added restriction
      expect(screen.getByText('grocery')).toBeOnTheScreen();

      // Remove the restriction
      const removeButton = screen.getByText('×'); // Remove button
      fireEvent.press(removeButton);

      expect(screen.queryByText('grocery')).not.toBeOnTheScreen();
    });

    test('should prevent duplicate merchant restrictions', () => {
      render(<TestCardCreationScreen />);

      // Add first restriction
      const addRestrictionButton = screen.getByText('Add Restriction');
      fireEvent.press(addRestrictionButton);

      const restrictionInput = screen.getByPlaceholderText('e.g., grocery, gas');
      fireEvent.changeText(restrictionInput, 'grocery');

      const confirmButton = screen.getByText('Add');
      fireEvent.press(confirmButton);

      // Try to add the same restriction again
      fireEvent.press(addRestrictionButton);
      fireEvent.changeText(restrictionInput, 'grocery');
      fireEvent.press(confirmButton);

      expect(mockAlert.alert).toHaveBeenCalledWith(
        'Duplicate Restriction',
        'This merchant category is already added'
      );
    });
  });

  describe('Navigation', () => {
    test('should navigate back when cancel is pressed', () => {
      render(<TestCardCreationScreen />);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.press(cancelButton);

      expect(mockFunctions.navigation.goBack).toHaveBeenCalledTimes(1);
    });

    test('should navigate to dashboard after successful creation', async () => {
      mockCardsProvider.createCard.mockResolvedValue({
        success: true,
        card: testDataFactory.createActiveCard(),
      });

      render(<TestCardCreationScreen />);

      const spendingLimitInput = screen.getByPlaceholderText('Enter spending limit');
      fireEvent.changeText(spendingLimitInput, '100');

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockFunctions.navigation.navigate).toHaveBeenCalledWith('CardDashboard');
      });
    });
  });

  describe('Accessibility', () => {
    test('should have proper accessibility labels', () => {
      render(<TestCardCreationScreen />);

      // All form elements should be accessible
      expect(screen.getByLabelText('Spending limit input')).toBeOnTheScreen();
      expect(screen.getByLabelText('Create card button')).toBeOnTheScreen();
      expect(screen.getByLabelText('Cancel button')).toBeOnTheScreen();
    });

    test('should announce validation errors', async () => {
      render(<TestCardCreationScreen />);

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockAlert.alert).toHaveBeenCalled();
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty form submission gracefully', async () => {
      render(<TestCardCreationScreen />);

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      expect(() => fireEvent.press(createButton)).not.toThrow();
    });

    test('should handle very long merchant restriction names', () => {
      render(<TestCardCreationScreen />);

      const addRestrictionButton = screen.getByText('Add Restriction');
      fireEvent.press(addRestrictionButton);

      const restrictionInput = screen.getByPlaceholderText('e.g., grocery, gas');
      const longName = 'a'.repeat(100);
      fireEvent.changeText(restrictionInput, longName);

      const confirmButton = screen.getByText('Add');
      fireEvent.press(confirmButton);

      expect(mockAlert.alert).toHaveBeenCalledWith(
        'Invalid Restriction',
        expect.stringContaining('too long')
      );
    });
  });
});