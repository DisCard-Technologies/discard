/**
 * Privacy Indicator Component for React Native
 * Displays privacy and security status indicators for card data
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export interface PrivacyStatus {
  level: 'high' | 'medium' | 'low';
  encrypted: boolean;
  isolated: boolean;
  deletionReady: boolean;
}

export interface PrivacyIndicatorProps {
  status: PrivacyStatus;
  size?: 'small' | 'medium' | 'large';
  showDetails?: boolean;
  onPress?: () => void;
  style?: any;
}

const PrivacyIndicator: React.FC<PrivacyIndicatorProps> = ({
  status,
  size = 'medium',
  showDetails = false,
  onPress,
  style,
}) => {
  const getPrivacyColor = () => {
    switch (status.level) {
      case 'high':
        return '#22C55E'; // Green
      case 'medium':
        return '#F59E0B'; // Orange
      case 'low':
        return '#EF4444'; // Red
      default:
        return '#6B7280'; // Gray
    }
  };

  const getPrivacyIcon = () => {
    switch (status.level) {
      case 'high':
        return '🔒';
      case 'medium':
        return '🔐';
      case 'low':
        return '🔓';
      default:
        return '❓';
    }
  };

  const getPrivacyLabel = () => {
    switch (status.level) {
      case 'high':
        return 'High Privacy';
      case 'medium':
        return 'Medium Privacy';
      case 'low':
        return 'Low Privacy';
      default:
        return 'Unknown';
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          container: styles.smallContainer,
          icon: styles.smallIcon,
          text: styles.smallText,
        };
      case 'large':
        return {
          container: styles.largeContainer,
          icon: styles.largeIcon,
          text: styles.largeText,
        };
      default:
        return {
          container: styles.mediumContainer,
          icon: styles.mediumIcon,
          text: styles.mediumText,
        };
    }
  };

  const sizeStyles = getSizeStyles();
  const privacyColor = getPrivacyColor();

  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={[
        styles.container,
        sizeStyles.container,
        { borderColor: privacyColor },
        style,
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.indicatorHeader}>
        <Text style={[sizeStyles.icon]}>{getPrivacyIcon()}</Text>
        <Text style={[sizeStyles.text, { color: privacyColor }]}>
          {getPrivacyLabel()}
        </Text>
      </View>

      {showDetails && (
        <View style={styles.detailsContainer}>
          <PrivacyDetailItem 
            label="Encrypted" 
            value={status.encrypted} 
            size={size}
          />
          <PrivacyDetailItem 
            label="Isolated" 
            value={status.isolated} 
            size={size}
          />
          <PrivacyDetailItem 
            label="Deletion Ready" 
            value={status.deletionReady} 
            size={size}
          />
        </View>
      )}
    </Container>
  );
};

interface PrivacyDetailItemProps {
  label: string;
  value: boolean;
  size: 'small' | 'medium' | 'large';
}

const PrivacyDetailItem: React.FC<PrivacyDetailItemProps> = ({ label, value, size }) => {
  const getDetailTextSize = () => {
    switch (size) {
      case 'small':
        return styles.smallDetailText;
      case 'large':
        return styles.largeDetailText;
      default:
        return styles.mediumDetailText;
    }
  };

  return (
    <View style={styles.detailItem}>
      <Text style={[styles.detailLabel, getDetailTextSize()]}>{label}</Text>
      <Text style={[styles.detailValue, getDetailTextSize(), { color: value ? '#22C55E' : '#EF4444' }]}>
        {value ? '✓' : '✗'}
      </Text>
    </View>
  );
};

// Helper function to get privacy status from card data
export const getCardPrivacyStatus = (card: any): PrivacyStatus => {
  // Basic privacy assessment based on card properties
  let level: 'high' | 'medium' | 'low' = 'high';
  let encrypted = true;
  let isolated = true;
  let deletionReady = true;

  // Assess privacy level based on card status and properties
  if (card.status === 'deleted') {
    level = 'low';
    encrypted = false;
    isolated = false;
    deletionReady = false;
  } else if (card.status === 'paused') {
    level = 'medium';
  }

  // Check if sensitive data is exposed (temporary after creation)
  if (card.cardNumber || card.cvv) {
    level = 'medium';
  }

  return {
    level,
    encrypted,
    isolated,
    deletionReady,
  };
};

// Helper component for privacy status summary
export const PrivacyStatusSummary: React.FC<{
  cards: any[];
  style?: any;
}> = ({ cards, style }) => {
  const activeCards = cards.filter(card => card.status === 'active');
  const encryptedCards = activeCards.filter(card => !card.cardNumber && !card.cvv);
  
  const overallStatus: PrivacyStatus = {
    level: encryptedCards.length === activeCards.length ? 'high' : 'medium',
    encrypted: encryptedCards.length > 0,
    isolated: activeCards.length > 0,
    deletionReady: true,
  };

  return (
    <View style={[styles.summaryContainer, style]}>
      <Text style={styles.summaryTitle}>Privacy Overview</Text>
      <PrivacyIndicator 
        status={overallStatus} 
        size="medium" 
        showDetails={true}
      />
      <Text style={styles.summaryText}>
        {encryptedCards.length} of {activeCards.length} cards fully encrypted
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  
  // Size variations
  smallContainer: {
    padding: 4,
    borderRadius: 4,
  },
  mediumContainer: {
    padding: 8,
    borderRadius: 8,
  },
  largeContainer: {
    padding: 12,
    borderRadius: 12,
  },

  // Indicator header
  indicatorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Icon sizes
  smallIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  mediumIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  largeIcon: {
    fontSize: 20,
    marginRight: 8,
  },

  // Text sizes
  smallText: {
    fontSize: 10,
    fontWeight: '600',
  },
  mediumText: {
    fontSize: 12,
    fontWeight: '600',
  },
  largeText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Details container
  detailsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },

  // Detail item
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  detailLabel: {
    color: '#6B7280',
  },
  detailValue: {
    fontWeight: '600',
  },

  // Detail text sizes
  smallDetailText: {
    fontSize: 8,
  },
  mediumDetailText: {
    fontSize: 10,
  },
  largeDetailText: {
    fontSize: 12,
  },

  // Summary styles
  summaryContainer: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    margin: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    color: '#1F2937',
  },
  summaryText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
});

export default PrivacyIndicator;