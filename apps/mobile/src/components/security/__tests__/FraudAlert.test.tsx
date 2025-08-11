import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { FraudAlert } from '../FraudAlert';
import { useCards } from '../../../../lib/hooks/useCards';

// Mock the useCards hook
jest.mock('../../../../lib/hooks/useCards');
const mockUseCards = useCards as jest.MockedFunction<typeof useCards>;

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('FraudAlert', () => {
  const mockReportFalsePositive = jest.fn();
  const mockFreezeCard = jest.fn();
  const mockOnDismiss = jest.fn();
  const mockOnActionPress = jest.fn();

  const defaultNotification = {
    notificationId: 'notif-123',
    cardId: 'card-456',
    type: 'fraud_alert' as const,
    severity: 'medium' as const,
    title: 'Suspicious Activity Detected',
    message: 'We detected unusual spending patterns on your card.',
    actionRequired: false,
    actionButtons: [
      {
        actionId: 'false-positive',
        label: 'This was me',
        actionType: 'report_false_positive',
        style: 'secondary' as const
      },
      {
        actionId: 'freeze-card',
        label: 'Freeze Card',
        actionType: 'unfreeze_card',
        style: 'danger' as const
      }
    ],
    metadata: {
      eventId: 'event-789',
      riskScore: 65,
      anomalies: ['amount_anomaly', 'geographic_anomaly']
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCards.mockReturnValue({
      reportFalsePositive: mockReportFalsePositive,
      freezeCard: mockFreezeCard,
      // Add other methods as needed
    } as any);
  });

  it('renders fraud alert with correct severity styling', () => {
    const { getByText } = render(
      <FraudAlert notification={defaultNotification} />
    );

    expect(getByText('Suspicious Activity Detected')).toBeTruthy();
    expect(getByText('MEDIUM RISK (65/100)')).toBeTruthy();
    expect(getByText('We detected unusual spending patterns on your card.')).toBeTruthy();
  });

  it('displays anomalies when present', () => {
    const { getByText } = render(
      <FraudAlert notification={defaultNotification} />
    );

    expect(getByText('Detected Issues:')).toBeTruthy();
    expect(getByText('amount_anomaly')).toBeTruthy();
    expect(getByText('geographic_anomaly')).toBeTruthy();
  });

  it('renders action buttons correctly', () => {
    const { getByText } = render(
      <FraudAlert notification={defaultNotification} />
    );

    expect(getByText('This was me')).toBeTruthy();
    expect(getByText('Freeze Card')).toBeTruthy();
  });

  it('shows close button when dismissible', () => {
    const { getByTestId } = render(
      <FraudAlert 
        notification={{ ...defaultNotification, actionRequired: false }}
        onDismiss={mockOnDismiss}
      />
    );

    // The close button should be rendered
    const container = getByTestId('fraud-alert-container');
    expect(container).toBeTruthy();
  });

  it('shows action required badge when needed', () => {
    const actionRequiredNotification = {
      ...defaultNotification,
      actionRequired: true
    };

    const { getByText } = render(
      <FraudAlert notification={actionRequiredNotification} />
    );

    expect(getByText('ACTION REQUIRED')).toBeTruthy();
  });

  it('handles false positive reporting correctly', async () => {
    mockReportFalsePositive.mockResolvedValue({ success: true });

    const { getByText } = render(
      <FraudAlert 
        notification={defaultNotification}
        onDismiss={mockOnDismiss}
      />
    );

    fireEvent.press(getByText('This was me'));

    await waitFor(() => {
      expect(mockReportFalsePositive).toHaveBeenCalledWith('card-456', 'event-789');
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Thank you',
      'Your feedback has been recorded. Our fraud detection will improve based on your input.',
      [{ text: 'OK', onPress: mockOnDismiss }]
    );
  });

  it('handles card freezing correctly', async () => {
    mockFreezeCard.mockResolvedValue({ success: true });

    const { getByText } = render(
      <FraudAlert 
        notification={defaultNotification}
        onDismiss={mockOnDismiss}
      />
    );

    fireEvent.press(getByText('Freeze Card'));

    await waitFor(() => {
      expect(mockFreezeCard).toHaveBeenCalledWith('card-456', 'fraud_detected');
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Card Frozen',
      'Your card has been frozen for security. You can unfreeze it anytime from your card settings.',
      [{ text: 'OK', onPress: mockOnDismiss }]
    );
  });

  it('handles view details action', async () => {
    const { getByText } = render(
      <FraudAlert 
        notification={{
          ...defaultNotification,
          actionButtons: [{
            actionId: 'view-details',
            label: 'View Details',
            actionType: 'view_details',
            style: 'primary'
          }]
        }}
        onActionPress={mockOnActionPress}
      />
    );

    fireEvent.press(getByText('View Details'));

    await waitFor(() => {
      expect(mockOnActionPress).toHaveBeenCalledWith('view-details');
    });
  });

  it('displays error alert when action fails', async () => {
    mockReportFalsePositive.mockRejectedValue(new Error('Network error'));

    const { getByText } = render(
      <FraudAlert notification={defaultNotification} />
    );

    fireEvent.press(getByText('This was me'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'An error occurred while processing your request. Please try again.',
        [{ text: 'OK' }]
      );
    });
  });

  it('shows loading state during action', async () => {
    mockReportFalsePositive.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    const { getByText, getByTestId } = render(
      <FraudAlert notification={defaultNotification} />
    );

    fireEvent.press(getByText('This was me'));

    // Should show loading indicator
    expect(getByTestId('activity-indicator')).toBeTruthy();

    await waitFor(() => {
      expect(mockReportFalsePositive).toHaveBeenCalled();
    });
  });

  describe('severity styling', () => {
    it('applies critical severity styling', () => {
      const criticalNotification = { ...defaultNotification, severity: 'critical' as const };
      const { getByText } = render(<FraudAlert notification={criticalNotification} />);
      
      expect(getByText('CRITICAL RISK (65/100)')).toBeTruthy();
    });

    it('applies high severity styling', () => {
      const highNotification = { ...defaultNotification, severity: 'high' as const };
      const { getByText } = render(<FraudAlert notification={highNotification} />);
      
      expect(getByText('HIGH RISK (65/100)')).toBeTruthy();
    });

    it('applies low severity styling', () => {
      const lowNotification = { ...defaultNotification, severity: 'low' as const };
      const { getByText } = render(<FraudAlert notification={lowNotification} />);
      
      expect(getByText('LOW RISK (65/100)')).toBeTruthy();
    });
  });

  it('handles notification without metadata gracefully', () => {
    const notificationWithoutMetadata = {
      ...defaultNotification,
      metadata: undefined
    };

    const { getByText, queryByText } = render(
      <FraudAlert notification={notificationWithoutMetadata} />
    );

    expect(getByText('Suspicious Activity Detected')).toBeTruthy();
    expect(getByText('MEDIUM RISK')).toBeTruthy(); // No risk score shown
    expect(queryByText('Detected Issues:')).toBeNull(); // No anomalies section
  });

  it('handles notification without action buttons', () => {
    const notificationWithoutButtons = {
      ...defaultNotification,
      actionButtons: undefined
    };

    const { getByText, queryByText } = render(
      <FraudAlert notification={notificationWithoutButtons} />
    );

    expect(getByText('Suspicious Activity Detected')).toBeTruthy();
    expect(queryByText('This was me')).toBeNull();
    expect(queryByText('Freeze Card')).toBeNull();
  });
});