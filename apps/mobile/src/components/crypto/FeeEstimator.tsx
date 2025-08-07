import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useCryptoStore } from '../../stores/crypto';

export interface FeeEstimatorProps {
  networkType: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP';
  onFeeEstimated?: (fee: number) => void;
  selectedLevel?: 'slow' | 'standard' | 'fast';
}

export const FeeEstimator: React.FC<FeeEstimatorProps> = ({
  networkType,
  onFeeEstimated,
  selectedLevel = 'standard'
}) => {
  const [selectedFeeLevel, setSelectedFeeLevel] = useState<'slow' | 'standard' | 'fast'>(selectedLevel);
  
  const { networkCongestion, getNetworkCongestion } = useCryptoStore();

  useEffect(() => {
    // Load network congestion data to get fee estimates
    loadFeeEstimates();
  }, [networkType]);

  useEffect(() => {
    // Notify parent component when fee level changes
    const congestion = networkCongestion[networkType];
    if (congestion?.feeEstimates) {
      const fee = congestion.feeEstimates[selectedFeeLevel];
      onFeeEstimated?.(fee);
    }
  }, [selectedFeeLevel, networkCongestion, networkType, onFeeEstimated]);

  const loadFeeEstimates = async () => {
    try {
      await getNetworkCongestion(networkType);
    } catch (error) {
      console.error('Failed to load fee estimates:', error);
    }
  };

  const congestion = networkCongestion[networkType];
  const feeEstimates = congestion?.feeEstimates;

  if (!feeEstimates) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading fee estimates...</Text>
      </View>
    );
  }

  const formatFee = (fee: number) => {
    return `$${(fee / 100).toFixed(2)}`;
  };

  const getEstimatedTime = (level: 'slow' | 'standard' | 'fast') => {
    const baseTimes = {
      BTC: { slow: '30-60min', standard: '10-30min', fast: '5-15min' },
      ETH: { slow: '3-8min', standard: '1-3min', fast: '15-60sec' },
      USDT: { slow: '3-8min', standard: '1-3min', fast: '15-60sec' },
      USDC: { slow: '3-8min', standard: '1-3min', fast: '15-60sec' },
      XRP: { slow: '5-10sec', standard: '3-5sec', fast: '1-3sec' }
    };

    // Adjust for network congestion
    if (congestion?.level === 'high') {
      const highCongestionTimes = {
        BTC: { slow: '60-120min', standard: '30-60min', fast: '15-30min' },
        ETH: { slow: '8-15min', standard: '3-8min', fast: '1-3min' },
        USDT: { slow: '8-15min', standard: '3-8min', fast: '1-3min' },
        USDC: { slow: '8-15min', standard: '3-8min', fast: '1-3min' },
        XRP: { slow: '10-20sec', standard: '5-10sec', fast: '3-5sec' }
      };
      return highCongestionTimes[networkType]?.[level] || baseTimes[networkType]?.[level];
    }

    return baseTimes[networkType]?.[level] || 'Unknown';
  };

  const getFeeColor = (level: 'slow' | 'standard' | 'fast') => {
    switch (level) {
      case 'slow':
        return '#28a745';
      case 'standard':
        return '#007AFF';
      case 'fast':
        return '#ff8c00';
      default:
        return '#6c757d';
    }
  };

  const getFeeDescription = (level: 'slow' | 'standard' | 'fast') => {
    switch (level) {
      case 'slow':
        return 'Economical choice for non-urgent transactions';
      case 'standard':
        return 'Balanced speed and cost for most transactions';
      case 'fast':
        return 'Priority processing for urgent transactions';
      default:
        return '';
    }
  };

  const feeOptions = [
    { level: 'slow' as const, label: 'Slow', icon: '🐢' },
    { level: 'standard' as const, label: 'Standard', icon: '⚡' },
    { level: 'fast' as const, label: 'Fast', icon: '🚀' }
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Network Fee Options</Text>
        <Text style={styles.subtitle}>
          Current network: {congestion.level.toUpperCase()} congestion
        </Text>
      </View>

      <View style={styles.optionsContainer}>
        {feeOptions.map(option => (
          <TouchableOpacity
            key={option.level}
            style={[
              styles.feeOption,
              selectedFeeLevel === option.level && styles.feeOptionSelected,
              {
                borderColor: selectedFeeLevel === option.level 
                  ? getFeeColor(option.level) 
                  : '#e9ecef'
              }
            ]}
            onPress={() => setSelectedFeeLevel(option.level)}
          >
            <View style={styles.optionHeader}>
              <View style={styles.optionLabelContainer}>
                <Text style={styles.optionIcon}>{option.icon}</Text>
                <Text style={[
                  styles.optionLabel,
                  selectedFeeLevel === option.level && styles.optionLabelSelected
                ]}>
                  {option.label}
                </Text>
              </View>
              <Text style={[
                styles.optionFee,
                { color: getFeeColor(option.level) }
              ]}>
                {formatFee(feeEstimates[option.level])}
              </Text>
            </View>

            <Text style={styles.estimatedTime}>
              Est. time: {getEstimatedTime(option.level)}
            </Text>

            <Text style={styles.feeDescription}>
              {getFeeDescription(option.level)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.selectedContainer}>
        <Text style={styles.selectedLabel}>Selected:</Text>
        <Text style={[
          styles.selectedValue,
          { color: getFeeColor(selectedFeeLevel) }
        ]}>
          {selectedFeeLevel.charAt(0).toUpperCase() + selectedFeeLevel.slice(1)} - {formatFee(feeEstimates[selectedFeeLevel])}
        </Text>
      </View>

      {congestion.level === 'high' && (
        <View style={styles.congestionWarning}>
          <Text style={styles.congestionWarningText}>
            ⚠️ High network congestion detected. Fees are elevated and confirmation times may be longer than usual.
          </Text>
        </View>
      )}

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          💡 Fee estimates are based on current network conditions and may change. 
          Higher fees increase the probability of faster confirmation but don't guarantee it.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginVertical: 8,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#666666',
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#666666',
  },
  optionsContainer: {
    marginBottom: 16,
  },
  feeOption: {
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  feeOptionSelected: {
    backgroundColor: '#ffffff',
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  optionLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  optionLabelSelected: {
    color: '#1a1a1a',
  },
  optionFee: {
    fontSize: 16,
    fontWeight: '700',
  },
  estimatedTime: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
  },
  feeDescription: {
    fontSize: 11,
    color: '#6c757d',
    fontStyle: 'italic',
    lineHeight: 14,
  },
  selectedContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  selectedLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#495057',
  },
  selectedValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  congestionWarning: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffd60a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  congestionWarningText: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 16,
  },
  disclaimer: {
    backgroundColor: '#e7f3ff',
    borderRadius: 8,
    padding: 12,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#0056b3',
    lineHeight: 15,
  },
});