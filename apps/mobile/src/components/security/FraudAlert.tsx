import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCards } from '../../../lib/hooks/useCards';

interface FraudAlertProps {
  notification: {
    notificationId: string;
    cardId: string;
    type: 'fraud_alert';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
    actionRequired: boolean;
    actionButtons?: Array<{
      actionId: string;
      label: string;
      actionType: string;
      style: 'primary' | 'secondary' | 'danger';
    }>;
    metadata?: {
      eventId?: string;
      riskScore?: number;
      anomalies?: string[];
    };
  };
  onDismiss?: () => void;
  onActionPress?: (actionId: string) => void;
}

export const FraudAlert: React.FC<FraudAlertProps> = ({
  notification,
  onDismiss,
  onActionPress
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { reportFalsePositive, freezeCard } = useCards();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#DC2626'; // red-600
      case 'high':
        return '#EA580C'; // orange-600
      case 'medium':
        return '#F59E0B'; // amber-600
      case 'low':
        return '#3B82F6'; // blue-600
      default:
        return '#6B7280'; // gray-600
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'alert-circle';
      case 'high':
        return 'warning';
      case 'medium':
        return 'information-circle';
      case 'low':
        return 'information-circle-outline';
      default:
        return 'information-circle-outline';
    }
  };

  const handleActionPress = async (actionId: string, actionType: string) => {
    setIsLoading(true);

    try {
      switch (actionType) {
        case 'report_false_positive':
          // Report this was a legitimate transaction
          if (notification.metadata?.eventId) {
            await reportFalsePositive(
              notification.cardId,
              notification.metadata.eventId
            );
            Alert.alert(
              'Thank you',
              'Your feedback has been recorded. Our fraud detection will improve based on your input.',
              [{ text: 'OK', onPress: onDismiss }]
            );
          }
          break;

        case 'unfreeze_card': // Actually freezes the card in this context
          // Freeze the card
          const result = await freezeCard(notification.cardId, 'fraud_detected');
          if (result.success) {
            Alert.alert(
              'Card Frozen',
              'Your card has been frozen for security. You can unfreeze it anytime from your card settings.',
              [{ text: 'OK', onPress: onDismiss }]
            );
          }
          break;

        case 'view_details':
          // Navigate to transaction details or security dashboard
          if (onActionPress) {
            onActionPress(actionId);
          }
          break;

        default:
          if (onActionPress) {
            onActionPress(actionId);
          }
      }
    } catch (error) {
      Alert.alert(
        'Error',
        'An error occurred while processing your request. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const renderActionButton = (button: any, index: number) => {
    const buttonStyle = [
      styles.actionButton,
      button.style === 'primary' && styles.primaryButton,
      button.style === 'danger' && styles.dangerButton,
      button.style === 'secondary' && styles.secondaryButton
    ];

    const textStyle = [
      styles.actionButtonText,
      button.style === 'primary' && styles.primaryButtonText,
      button.style === 'danger' && styles.dangerButtonText
    ];

    return (
      <TouchableOpacity
        key={button.actionId}
        style={buttonStyle}
        onPress={() => handleActionPress(button.actionId, button.actionType)}
        disabled={isLoading}
      >
        <Text style={textStyle}>{button.label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { borderColor: getSeverityColor(notification.severity) }]}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={getSeverityIcon(notification.severity)}
            size={28}
            color={getSeverityColor(notification.severity)}
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{notification.title}</Text>
          <Text style={styles.severity}>
            {notification.severity.toUpperCase()} RISK
            {notification.metadata?.riskScore && ` (${notification.metadata.riskScore}/100)`}
          </Text>
        </View>
        {onDismiss && !notification.actionRequired && (
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.message}>{notification.message}</Text>

      {notification.metadata?.anomalies && notification.metadata.anomalies.length > 0 && (
        <View style={styles.anomaliesContainer}>
          <Text style={styles.anomaliesTitle}>Detected Issues:</Text>
          {notification.metadata.anomalies.map((anomaly, index) => (
            <View key={index} style={styles.anomalyItem}>
              <Ionicons name="chevron-forward" size={16} color="#6B7280" />
              <Text style={styles.anomalyText}>{anomaly}</Text>
            </View>
          ))}
        </View>
      )}

      {notification.actionButtons && notification.actionButtons.length > 0 && (
        <View style={styles.actionContainer}>
          {isLoading ? (
            <ActivityIndicator size="small" color={getSeverityColor(notification.severity)} />
          ) : (
            notification.actionButtons.map(renderActionButton)
          )}
        </View>
      )}

      {notification.actionRequired && (
        <View style={styles.requiredBadge}>
          <Text style={styles.requiredText}>ACTION REQUIRED</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  iconContainer: {
    marginRight: 12
  },
  headerText: {
    flex: 1
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2
  },
  severity: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280'
  },
  closeButton: {
    padding: 4
  },
  message: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 12
  },
  anomaliesContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12
  },
  anomaliesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8
  },
  anomalyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  anomalyText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 4,
    flex: 1
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryButton: {
    backgroundColor: '#3B82F6'
  },
  dangerButton: {
    backgroundColor: '#DC2626'
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280'
  },
  primaryButtonText: {
    color: '#FFFFFF'
  },
  dangerButtonText: {
    color: '#FFFFFF'
  },
  requiredBadge: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4
  },
  requiredText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF'
  }
});