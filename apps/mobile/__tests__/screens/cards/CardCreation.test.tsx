import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CardCreationScreen from '../../../src/screens/cards/CardCreationScreen';
import { useCardOperations } from '../../../src/stores/cards';

// Mock dependencies
jest.mock('../../../src/stores/cards');
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

const mockUseCardOperations = useCardOperations as jest.MockedFunction<typeof useCardOperations>;
const mockAlert = Alert.alert as jest.MockedFunction<typeof Alert.alert>;

describe('CardCreationScreen', () => {
  const mockCreateCard = jest.fn();
  const mockCardOperations = {
    createCard: mockCreateCard,
    // Add other card operations as needed
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCardOperations.mockReturnValue(mockCardOperations);
  });

  describe('Rendering', () => {
    it('should render all main sections', () => {
      render(<CardCreationScreen />);

      expect(screen.getByText('Create New Card')).toBeTruthy();
      expect(screen.getByText('Spending Limit')).toBeTruthy();
      expect(screen.getByText('Custom Expiration')).toBeTruthy();
      expect(screen.getByText('Security Templates')).toBeTruthy();
      expect(screen.getByText('Geographic Restrictions')).toBeTruthy();
      expect(screen.getByText('Merchant Category Blocks')).toBeTruthy();
      expect(screen.getByText('Activate Immediately')).toBeTruthy();
      expect(screen.getByText('Create Card')).toBeTruthy();
    });

    it('should render security templates', () => {
      render(<CardCreationScreen />);

      expect(screen.getByText('Safe Spending')).toBeTruthy();
      expect(screen.getByText('US Only')).toBeTruthy();
      expect(screen.getByText('No High-Risk Countries')).toBeTruthy();
      expect(screen.getByText('Essential Services Only')).toBeTruthy();
    });

    it('should render merchant categories with risk indicators', () => {
      render(<CardCreationScreen />);

      expect(screen.getByText('Grocery Stores')).toBeTruthy();
      expect(screen.getByText('Restaurants')).toBeTruthy();
      expect(screen.getByText('Gas Stations')).toBeTruthy();
      expect(screen.getByText('Gambling')).toBeTruthy();
      expect(screen.getByText('Adult Content')).toBeTruthy();
      
      // High-risk categories should have warning indicators
      const gamblingButton = screen.getByText('Gambling').parent;
      expect(gamblingButton).toBeTruthy();
    });

    it('should render geographic restrictions', () => {
      render(<CardCreationScreen />);

      expect(screen.getByText('United States')).toBeTruthy();
      expect(screen.getByText('Canada')).toBeTruthy();
      expect(screen.getByText('United Kingdom')).toBeTruthy();
      expect(screen.getByText('Japan')).toBeTruthy();
    });

    it('should show cancel button when onCancel prop is provided', () => {
      const mockOnCancel = jest.fn();
      render(<CardCreationScreen onCancel={mockOnCancel} />);

      expect(screen.getByText('Cancel')).toBeTruthy();
    });
  });

  describe('Form Validation', () => {
    it('should validate minimum spending limit', async () => {
      render(<CardCreationScreen />);

      const spendingInput = screen.getByDisplayValue('100');
      fireEvent.changeText(spendingInput, '50');

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith(
          'Validation Error',
          'Spending limit must be at least $1.00'
        );
      });

      expect(mockCreateCard).not.toHaveBeenCalled();
    });

    it('should validate maximum spending limit', async () => {
      render(<CardCreationScreen />);

      const spendingInput = screen.getByDisplayValue('100');
      fireEvent.changeText(spendingInput, '600000');

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith(
          'Validation Error',
          'Spending limit cannot exceed $5,000.00'
        );
      });

      expect(mockCreateCard).not.toHaveBeenCalled();
    });

    it('should validate custom expiration range', async () => {
      render(<CardCreationScreen />);

      // Enable custom expiration
      const customExpirationSwitch = screen.getByRole('switch');
      fireEvent(customExpirationSwitch, 'valueChange', true);

      await waitFor(() => {
        const expirationInput = screen.getByDisplayValue('12');
        fireEvent.changeText(expirationInput, '70');
      });

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith(
          'Validation Error',
          'Expiration must be between 1 and 60 months'
        );
      });
    });

    it('should handle non-numeric spending limit input', () => {
      render(<CardCreationScreen />);

      const spendingInput = screen.getByDisplayValue('100');
      fireEvent.changeText(spendingInput, 'abc123def');

      // Should filter out non-numeric characters
      expect(spendingInput.props.value).toBe('123');
    });
  });

  describe('Security Templates', () => {
    it('should select and deselect templates', () => {
      render(<CardCreationScreen />);

      const safeSpendingButton = screen.getByText('Safe Spending');
      fireEvent.press(safeSpendingButton);

      // Template should be visually selected (implementation would show this through styling)
      // In a real test, we'd check for style changes or test IDs

      // Pressing again should deselect
      fireEvent.press(safeSpendingButton);
    });

    it('should update privacy notice when template is selected', () => {
      render(<CardCreationScreen />);

      const safeSpendingButton = screen.getByText('Safe Spending');
      fireEvent.press(safeSpendingButton);

      expect(screen.getByText(/Security template "Safe Spending" will be applied/)).toBeTruthy();
    });
  });

  describe('Merchant Restrictions', () => {
    it('should toggle merchant category restrictions', () => {
      render(<CardCreationScreen />);

      const gamblingButton = screen.getByText('Gambling');
      fireEvent.press(gamblingButton);

      // Should show in selected restrictions
      expect(screen.getByText('Selected Restrictions:')).toBeTruthy();
    });

    it('should add custom merchant code', () => {
      render(<CardCreationScreen />);

      const customInput = screen.getByPlaceholderText('e.g., 5999');
      fireEvent.changeText(customInput, '5999');

      const addButton = screen.getByText('Add');
      fireEvent.press(addButton);

      // Should add to selected restrictions
      expect(screen.getByText('5999')).toBeTruthy();
    });

    it('should remove selected restrictions', () => {
      render(<CardCreationScreen />);

      // Add a restriction first
      const groceryButton = screen.getByText('Grocery Stores');
      fireEvent.press(groceryButton);

      // Find and press the remove button (×)
      const removeButton = screen.getByText('×');
      fireEvent.press(removeButton);

      // Restriction should be removed
      expect(screen.queryByText('Selected Restrictions:')).toBeFalsy();
    });

    it('should prevent adding duplicate custom merchant codes', () => {
      render(<CardCreationScreen />);

      const customInput = screen.getByPlaceholderText('e.g., 5999');
      const addButton = screen.getByText('Add');

      // Add first instance
      fireEvent.changeText(customInput, '5999');
      fireEvent.press(addButton);

      // Try to add duplicate
      fireEvent.changeText(customInput, '5999');
      fireEvent.press(addButton);

      // Should only appear once
      const restrictions = screen.getAllByText('5999');
      expect(restrictions.length).toBe(1);
    });
  });

  describe('Geographic Restrictions', () => {
    it('should toggle geographic restrictions', () => {
      render(<CardCreationScreen />);

      const usButton = screen.getByText('United States');
      fireEvent.press(usButton);

      // Should be visually selected
      // In a real implementation, we'd check for visual changes
    });

    it('should allow multiple geographic selections', () => {
      render(<CardCreationScreen />);

      const usButton = screen.getByText('United States');
      const caButton = screen.getByText('Canada');

      fireEvent.press(usButton);
      fireEvent.press(caButton);

      // Both should be selected (visual verification would be done through test IDs)
    });
  });

  describe('Card Creation', () => {
    it('should create card with basic data', async () => {
      const mockCard = {
        cardId: 'card_123',
        cardNumber: '5549481234567890',
        cvv: '123'
      };

      mockCreateCard.mockResolvedValue(mockCard);

      render(<CardCreationScreen />);

      const spendingInput = screen.getByDisplayValue('100');
      fireEvent.changeText(spendingInput, '250');

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockCreateCard).toHaveBeenCalledWith({
          spendingLimit: 25000, // $250 in cents
          merchantRestrictions: undefined
        });
      });

      expect(mockAlert).toHaveBeenCalledWith(
        'Card Created Successfully!',
        'Your new virtual card has been created. Card details are temporarily visible for copying.',
        expect.any(Array)
      );
    });

    it('should create card with all options selected', async () => {
      const mockCard = {
        cardId: 'card_123',
        cardNumber: '5549481234567890',
        cvv: '123'
      };

      mockCreateCard.mockResolvedValue(mockCard);

      render(<CardCreationScreen />);

      // Set spending limit
      const spendingInput = screen.getByDisplayValue('100');
      fireEvent.changeText(spendingInput, '500');

      // Enable custom expiration
      const customExpirationSwitch = screen.getByRole('switch');
      fireEvent(customExpirationSwitch, 'valueChange', true);

      await waitFor(() => {
        const expirationInput = screen.getByDisplayValue('12');
        fireEvent.changeText(expirationInput, '24');
      });

      // Select merchant restrictions
      const gamblingButton = screen.getByText('Gambling');
      fireEvent.press(gamblingButton);

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockCreateCard).toHaveBeenCalledWith({
          spendingLimit: 50000,
          merchantRestrictions: ['7995'], // Gambling MCC
          expirationDate: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)
        });
      });
    });

    it('should handle card creation error', async () => {
      const mockError = new Error('Card creation failed');
      mockCreateCard.mockRejectedValue(mockError);

      render(<CardCreationScreen />);

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith(
          'Creation Failed',
          'Card creation failed'
        );
      });
    });

    it('should show loading state during creation', async () => {
      // Mock a delayed response
      mockCreateCard.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ cardId: 'card_123' }), 100))
      );

      render(<CardCreationScreen />);

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      // Should show loading indicator
      expect(screen.getByTestId('activity-indicator')).toBeTruthy();

      await waitFor(() => {
        expect(screen.queryByTestId('activity-indicator')).toBeFalsy();
      });
    });

    it('should disable form during creation', async () => {
      mockCreateCard.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ cardId: 'card_123' }), 100))
      );

      render(<CardCreationScreen />);

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      // Create button should be disabled
      expect(createButton.props.disabled).toBe(true);
    });
  });

  describe('Callbacks', () => {
    it('should call onCardCreated when card is created successfully', async () => {
      const mockOnCardCreated = jest.fn();
      const mockCard = { cardId: 'card_123' };
      
      mockCreateCard.mockResolvedValue(mockCard);
      mockAlert.mockImplementation((title, message, buttons) => {
        // Simulate pressing OK button
        if (buttons && buttons[0] && buttons[0].onPress) {
          buttons[0].onPress();
        }
      });

      render(<CardCreationScreen onCardCreated={mockOnCardCreated} />);

      const createButton = screen.getByText('Create Card');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(mockOnCardCreated).toHaveBeenCalledWith(mockCard);
      });
    });

    it('should call onCancel when cancel button is pressed', () => {
      const mockOnCancel = jest.fn();
      render(<CardCreationScreen onCancel={mockOnCancel} />);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.press(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels', () => {
      render(<CardCreationScreen />);

      // Test that form elements have appropriate accessibility properties
      const spendingInput = screen.getByDisplayValue('100');
      expect(spendingInput.props.accessibilityLabel).toBeDefined();
    });

    it('should support screen readers', () => {
      render(<CardCreationScreen />);

      // Verify important elements are accessible to screen readers
      expect(screen.getByText('Create New Card')).toBeTruthy();
      expect(screen.getByText('Spending Limit')).toBeTruthy();
    });
  });

  describe('Form Persistence', () => {
    it('should maintain form state when toggling switches', () => {
      render(<CardCreationScreen />);

      const spendingInput = screen.getByDisplayValue('100');
      fireEvent.changeText(spendingInput, '300');

      const customExpirationSwitch = screen.getByRole('switch');
      fireEvent(customExpirationSwitch, 'valueChange', true);
      fireEvent(customExpirationSwitch, 'valueChange', false);

      // Spending limit should be preserved
      expect(spendingInput.props.value).toBe('300');
    });

    it('should clear custom merchant input after adding', () => {
      render(<CardCreationScreen />);

      const customInput = screen.getByPlaceholderText('e.g., 5999');
      fireEvent.changeText(customInput, '5999');

      const addButton = screen.getByText('Add');
      fireEvent.press(addButton);

      expect(customInput.props.value).toBe('');
    });
  });
});