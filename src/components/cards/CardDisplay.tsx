/**
 * Visual Card Display Component with Flip Animation
 * Shows card front/back with secure CVV display
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { formatUSD } from '../../types';

interface CardDisplayProps {
  cardNumber?: string;
  cvv?: string;
  expirationDate?: string;
  cardholderName?: string;
  balance?: number;
  spendingLimit?: number;
  lastFourDigits?: string;
  cardNetwork?: string;
  provisioningStatus?: string;
  onShowFullNumber?: () => void;
  onShowCVV?: () => void;
}

const { width: screenWidth } = Dimensions.get('window');
const cardWidth = screenWidth - 32;
const cardHeight = (cardWidth * 5.4) / 8.56; // Standard credit card aspect ratio

export const CardDisplay: React.FC<CardDisplayProps> = ({
  cardNumber,
  cvv,
  expirationDate,
  cardholderName = 'CARDHOLDER',
  balance = 0,
  spendingLimit = 0,
  lastFourDigits,
  cardNetwork = 'VISA',
  provisioningStatus = 'active',
  onShowFullNumber,
  onShowCVV,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnimation = useRef(new Animated.Value(0)).current;

  const flipCard = () => {
    if (isFlipped) {
      // Flip to front
      Animated.timing(flipAnimation, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start();
    } else {
      // Flip to back
      Animated.timing(flipAnimation, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
    setIsFlipped(!isFlipped);
  };

  const frontInterpolate = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const formatCardNumber = (number?: string): string => {
    if (!number) {
      return lastFourDigits ? `•••• •••• •••• ${lastFourDigits}` : '•••• •••• •••• ••••';
    }
    
    // Format as groups of 4
    return number.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiration = (date?: string): string => {
    if (!date) return 'MM/YY';
    
    // Handle different date formats
    if (date.includes('/')) return date;
    if (date.length === 4) return `${date.substring(0, 2)}/${date.substring(2)}`;
    
    // Parse ISO date
    const d = new Date(date);
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear().toString().substring(2);
    return `${month}/${year}`;
  };

  const getNetworkLogo = (network: string): string => {
    switch (network.toUpperCase()) {
      case 'VISA':
        return 'VISA';
      case 'MASTERCARD':
        return 'MC';
      default:
        return network.substring(0, 4).toUpperCase();
    }
  };

  const getCardStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'active':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      case 'suspended':
        return '#EF4444';
      case 'terminated':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  const handleShowFullNumber = () => {
    if (onShowFullNumber) {
      Alert.alert(
        'Show Full Card Number',
        'Card number will be temporarily visible for copying. Make sure no one is looking at your screen.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Show', onPress: onShowFullNumber },
        ]
      );
    }
  };

  const handleShowCVV = () => {
    if (onShowCVV) {
      Alert.alert(
        'Show CVV',
        'CVV will be temporarily visible for copying. Make sure no one is looking at your screen.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Show', onPress: onShowCVV },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      {/* Card Front */}
      <Animated.View
        style={[
          styles.card,
          styles.cardFront,
          { transform: [{ rotateY: frontInterpolate }] },
        ]}
      >
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <Text style={styles.networkLogo}>{getNetworkLogo(cardNetwork)}</Text>
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: getCardStatusColor(provisioningStatus) },
              ]}
            />
            <Text style={styles.statusText}>{provisioningStatus.toUpperCase()}</Text>
          </View>
        </View>

        {/* Card Number */}
        <TouchableOpacity
          style={styles.cardNumberContainer}
          onPress={handleShowFullNumber}
          disabled={!onShowFullNumber}
        >
          <Text style={styles.cardNumber}>{formatCardNumber(cardNumber)}</Text>
          {!cardNumber && onShowFullNumber && (
            <Text style={styles.tapToReveal}>Tap to reveal</Text>
          )}
        </TouchableOpacity>

        {/* Card Details Row */}
        <View style={styles.cardDetailsRow}>
          <View style={styles.cardDetail}>
            <Text style={styles.cardDetailLabel}>VALID THRU</Text>
            <Text style={styles.cardDetailValue}>{formatExpiration(expirationDate)}</Text>
          </View>
          
          <View style={styles.cardDetail}>
            <Text style={styles.cardDetailLabel}>CVV</Text>
            <TouchableOpacity onPress={handleShowCVV} disabled={!onShowCVV}>
              <Text style={styles.cardDetailValue}>
                {cvv ? cvv : '•••'}
                {!cvv && onShowCVV && (
                  <Text style={styles.tapToRevealSmall}> (tap)</Text>
                )}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cardholder Name */}
        <View style={styles.cardholderContainer}>
          <Text style={styles.cardholderLabel}>CARDHOLDER</Text>
          <Text style={styles.cardholderName}>{cardholderName}</Text>
        </View>

        {/* Balance Information */}
        <View style={styles.balanceContainer}>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Available</Text>
            <Text style={styles.balanceValue}>{formatUSD(balance)}</Text>
          </View>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Limit</Text>
            <Text style={styles.balanceLimitValue}>{formatUSD(spendingLimit)}</Text>
          </View>
        </View>

        {/* Flip Indicator */}
        <TouchableOpacity style={styles.flipButton} onPress={flipCard}>
          <Text style={styles.flipButtonText}>Flip to see CVV</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Card Back */}
      <Animated.View
        style={[
          styles.card,
          styles.cardBack,
          { transform: [{ rotateY: backInterpolate }] },
        ]}
      >
        {/* Magnetic Stripe */}
        <View style={styles.magneticStripe} />

        {/* CVV Area */}
        <View style={styles.cvvArea}>
          <View style={styles.signaturePanel}>
            <Text style={styles.signaturePanelText}>NOT VALID WITHOUT SIGNATURE</Text>
          </View>
          
          <View style={styles.cvvContainer}>
            <Text style={styles.cvvLabel}>CVV</Text>
            <TouchableOpacity
              style={styles.cvvBox}
              onPress={handleShowCVV}
              disabled={!onShowCVV}
            >
              <Text style={styles.cvvValue}>
                {cvv ? cvv : '•••'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Security Features Text */}
        <View style={styles.securityTextContainer}>
          <Text style={styles.securityText}>
            This card is protected by advanced cryptographic privacy isolation.
            Use only for intended purchases. Report unauthorized use immediately.
          </Text>
        </View>

        {/* Network Logo */}
        <View style={styles.backNetworkContainer}>
          <Text style={styles.backNetworkLogo}>{getNetworkLogo(cardNetwork)}</Text>
        </View>

        {/* Flip Back Button */}
        <TouchableOpacity style={styles.flipButton} onPress={flipCard}>
          <Text style={styles.flipButtonText}>Flip to front</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: cardWidth,
    height: cardHeight,
    alignSelf: 'center',
  },

  card: {
    position: 'absolute',
    width: cardWidth,
    height: cardHeight,
    borderRadius: 16,
    padding: 20,
    backfaceVisibility: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },

  cardFront: {
    backgroundColor: '#1F2937',
    background: 'linear-gradient(135deg, #1F2937 0%, #374151 100%)',
  },

  cardBack: {
    backgroundColor: '#374151',
    background: 'linear-gradient(135deg, #374151 0%, #4B5563 100%)',
  },

  // Front Card Elements
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },

  networkLogo: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },

  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },

  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#E5E7EB',
    letterSpacing: 0.5,
  },

  cardNumberContainer: {
    marginBottom: 20,
  },

  cardNumber: {
    fontSize: 22,
    fontFamily: 'Monaco', // Monospace font for card numbers
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'center',
  },

  tapToReveal: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },

  tapToRevealSmall: {
    fontSize: 10,
    color: '#9CA3AF',
  },

  cardDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  cardDetail: {
    alignItems: 'flex-start',
  },

  cardDetailLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 4,
    letterSpacing: 1,
  },

  cardDetailValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Monaco',
    letterSpacing: 1,
  },

  cardholderContainer: {
    marginBottom: 16,
  },

  cardholderLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 4,
    letterSpacing: 1,
  },

  cardholderName: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 2,
  },

  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  balanceItem: {
    alignItems: 'flex-start',
  },

  balanceLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 4,
    letterSpacing: 1,
  },

  balanceValue: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '700',
  },

  balanceLimitValue: {
    fontSize: 14,
    color: '#E5E7EB',
    fontWeight: '600',
  },

  flipButton: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },

  flipButtonText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // Back Card Elements
  magneticStripe: {
    height: 40,
    backgroundColor: '#000000',
    marginHorizontal: -20,
    marginTop: 20,
    marginBottom: 16,
  },

  cvvArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },

  signaturePanel: {
    flex: 1,
    height: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginRight: 12,
  },

  signaturePanelText: {
    fontSize: 8,
    color: '#1F2937',
    textAlign: 'center',
  },

  cvvContainer: {
    alignItems: 'center',
  },

  cvvLabel: {
    fontSize: 8,
    color: '#9CA3AF',
    marginBottom: 4,
  },

  cvvBox: {
    width: 40,
    height: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },

  cvvValue: {
    fontSize: 12,
    color: '#1F2937',
    fontFamily: 'Monaco',
    fontWeight: '600',
  },

  securityTextContainer: {
    marginTop: 20,
    marginBottom: 16,
  },

  securityText: {
    fontSize: 8,
    color: '#D1D5DB',
    lineHeight: 12,
    textAlign: 'left',
  },

  backNetworkContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
  },

  backNetworkLogo: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
});

export default CardDisplay;