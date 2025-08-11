import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CardFreezeControl } from '../CardFreezeControl';
import { useCards } from '../../../../lib/hooks/useCards';

// Mock the useCards hook
jest.mock('../../../../lib/hooks/useCards');
const mockUseCards = useCards as jest.MockedFunction<typeof useCards>;

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('CardFreezeControl', () => {
  const mockFreezeCard = jest.fn();
  const mockUnfreezeCard = jest.fn();
  const mockGetCardStatus = jest.fn();
  const mockOnStatusChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCards.mockReturnValue({
      freezeCard: mockFreezeCard,
      unfreezeCard: mockUnfreezeCard,
      getCardStatus: mockGetCardStatus,
    } as any);

    mockGetCardStatus.mockResolvedValue({ isFrozen: false });
  });

  it('renders in normal mode with active card', async () => {
    const { getByText, getByTestId } = render(
      <CardFreezeControl cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Card Security Control')).toBeTruthy();
      expect(getByText('ACTIVE')).toBeTruthy();
      expect(getByText('Freeze Card')).toBeTruthy();
    });
  });

  it('renders in compact mode', async () => {
    const { getByText } = render(
      <CardFreezeControl cardId="card-123" compact={true} />
    );

    await waitFor(() => {
      expect(getByText('Card Active')).toBeTruthy();
    });
  });

  it('shows frozen state correctly', async () => {
    mockGetCardStatus.mockResolvedValue({ isFrozen: true });

    const { getByText } = render(
      <CardFreezeControl cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('FROZEN')).toBeTruthy();
      expect(getByText('Unfreeze Card')).toBeTruthy();
      expect(getByText('All transactions are blocked while your card is frozen')).toBeTruthy();
    });
  });

  it('loads card status on mount', async () => {
    render(<CardFreezeControl cardId="card-123" />);

    await waitFor(() => {
      expect(mockGetCardStatus).toHaveBeenCalledWith('card-123');
    });
  });

  it('handles freeze card action', async () => {
    mockFreezeCard.mockResolvedValue({ success: true });

    const { getByText } = render(
      <CardFreezeControl cardId="card-123" onStatusChange={mockOnStatusChange} />
    );

    await waitFor(() => {
      expect(getByText('Freeze Card')).toBeTruthy();
    });

    fireEvent.press(getByText('Freeze Card'));

    // Confirm the alert
    expect(Alert.alert).toHaveBeenCalledWith(
      'Freeze Card',
      'Are you sure you want to freeze this card? All transactions will be blocked until you unfreeze it.',
      expect.any(Array)
    );

    // Get the alert buttons and press "Freeze"
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Freeze');
    
    await confirmButton.onPress();

    await waitFor(() => {
      expect(mockFreezeCard).toHaveBeenCalledWith('card-123', 'manual_freeze');
      expect(mockOnStatusChange).toHaveBeenCalledWith(true);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Success',
      'Your card has been frozen successfully.',
      [{ text: 'OK' }]
    );
  });

  it('handles unfreeze card action', async () => {
    mockGetCardStatus.mockResolvedValue({ isFrozen: true });
    mockUnfreezeCard.mockResolvedValue({ success: true });

    const { getByText } = render(
      <CardFreezeControl cardId="card-123" onStatusChange={mockOnStatusChange} />
    );

    await waitFor(() => {
      expect(getByText('Unfreeze Card')).toBeTruthy();
    });

    fireEvent.press(getByText('Unfreeze Card'));

    // Confirm the alert
    expect(Alert.alert).toHaveBeenCalledWith(
      'Unfreeze Card',
      'Are you sure you want to unfreeze this card? It will be immediately available for transactions.',
      expect.any(Array)
    );

    // Get the alert buttons and press "Unfreeze"
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Unfreeze');
    
    await confirmButton.onPress();

    await waitFor(() => {
      expect(mockUnfreezeCard).toHaveBeenCalledWith('card-123');
      expect(mockOnStatusChange).toHaveBeenCalledWith(false);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Success',
      'Your card has been unfrozen successfully.',
      [{ text: 'OK' }]
    );
  });

  it('handles compact mode toggle', async () => {
    mockFreezeCard.mockResolvedValue({ success: true });

    const { getByTestId } = render(
      <CardFreezeControl cardId="card-123" compact={true} />
    );

    const freezeSwitch = getByTestId('freeze-switch');
    fireEvent(freezeSwitch, 'valueChange', true);

    // Should trigger confirmation alert
    expect(Alert.alert).toHaveBeenCalledWith(
      'Freeze Card',
      'Are you sure you want to freeze this card? All transactions will be blocked until you unfreeze it.',
      expect.any(Array)
    );
  });

  it('shows error when freeze action fails', async () => {
    mockFreezeCard.mockResolvedValue({ success: false, error: 'Network error' });

    const { getByText } = render(
      <CardFreezeControl cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Freeze Card')).toBeTruthy();
    });

    fireEvent.press(getByText('Freeze Card'));

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Freeze');
    
    await confirmButton.onPress();

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to freeze card. Please try again later.',
        [{ text: 'OK' }]
      );
    });
  });

  it('shows error when unfreeze action fails', async () => {
    mockGetCardStatus.mockResolvedValue({ isFrozen: true });
    mockUnfreezeCard.mockRejectedValue(new Error('Network error'));

    const { getByText } = render(
      <CardFreezeControl cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Unfreeze Card')).toBeTruthy();
    });

    fireEvent.press(getByText('Unfreeze Card'));

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Unfreeze');
    
    await confirmButton.onPress();

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to unfreeze card. Please try again later.',
        [{ text: 'OK' }]
      );
    });
  });

  it('shows loading state during action', async () => {
    mockFreezeCard.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    const { getByText, getByTestId } = render(
      <CardFreezeControl cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Freeze Card')).toBeTruthy();
    });

    fireEvent.press(getByText('Freeze Card'));

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Freeze');
    
    confirmButton.onPress();

    // Should show loading indicator
    await waitFor(() => {
      expect(getByTestId('activity-indicator')).toBeTruthy();
    });
  });

  it('handles cancel action', async () => {
    const { getByText } = render(
      <CardFreezeControl cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Freeze Card')).toBeTruthy();
    });

    fireEvent.press(getByText('Freeze Card'));

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const cancelButton = alertCall[2].find((btn: any) => btn.text === 'Cancel');
    
    cancelButton.onPress();

    // Should not call freeze function
    expect(mockFreezeCard).not.toHaveBeenCalled();
  });

  it('uses initial frozen state prop', () => {
    const { getByText } = render(
      <CardFreezeControl cardId="card-123" initialFrozenState={true} />
    );

    // Should show frozen state immediately without waiting for API
    expect(getByText('FROZEN')).toBeTruthy();
    expect(getByText('Unfreeze Card')).toBeTruthy();
  });

  it('handles card status loading error gracefully', async () => {
    mockGetCardStatus.mockRejectedValue(new Error('Network error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    render(<CardFreezeControl cardId="card-123" />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load card status:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('shows security tips in normal mode', async () => {
    const { getByText } = render(
      <CardFreezeControl cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('When to freeze your card:')).toBeTruthy();
      expect(getByText('You\'ve lost your card')).toBeTruthy();
      expect(getByText('You suspect fraudulent activity')).toBeTruthy();
      expect(getByText('You want to temporarily disable spending')).toBeTruthy();
    });
  });

  it('does not show security tips in compact mode', () => {
    const { queryByText } = render(
      <CardFreezeControl cardId="card-123" compact={true} />
    );

    expect(queryByText('When to freeze your card:')).toBeNull();
  });
});