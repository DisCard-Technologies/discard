import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useCryptoStore } from '../../stores/crypto';

export interface NetworkCongestionIndicatorProps {
  networkType: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP';
  showDetails?: boolean;
}

export const NetworkCongestionIndicator: React.FC<NetworkCongestionIndicatorProps> = ({
  networkType,
  showDetails = false
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  
  const { networkCongestion, getNetworkCongestion, isLoading } = useCryptoStore();

  useEffect(() => {
    // Load network congestion data
    loadCongestionData();
    
    // Set up periodic refresh every 30 seconds
    const interval = setInterval(loadCongestionData, 30000);
    
    return () => clearInterval(interval);
  }, [networkType]);

  const loadCongestionData = async () => {
    try {
      await getNetworkCongestion(networkType);
    } catch (error) {
      console.error('Failed to load network congestion:', error);
    }
  };

  const congestion = networkCongestion[networkType];

  if (!congestion) {
    return (
      <View style={styles.unknownContainer}>
        <View style={styles.unknownDot} />
        <Text style={styles.unknownText}>Unknown</Text>
      </View>
    );
  }

  const getCongestionColor = (level: string) => {
    switch (level) {
      case 'low':
        return '#28a745';
      case 'medium':
        return '#ffc107';
      case 'high':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const getCongestionIcon = (level: string) => {
    switch (level) {
      case 'low':
        return '🟢';
      case 'medium':
        return '🟡';
      case 'high':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getWaitTimeText = (level: string) => {
    const baseTimes = {
      BTC: { low: '10-20min', medium: '20-40min', high: '40-90min' },
      ETH: { low: '1-2min', medium: '2-5min', high: '5-15min' },
      USDT: { low: '1-2min', medium: '2-5min', high: '5-15min' },
      USDC: { low: '1-2min', medium: '2-5min', high: '5-15min' },
      XRP: { low: '3-5sec', medium: '5-10sec', high: '10-30sec' }
    };

    return baseTimes[networkType]?.[level] || 'Unknown';
  };

  const formatFee = (fee: number) => {
    return `$${(fee / 100).toFixed(2)}`;
  };

  const handlePress = () => {
    if (showDetails) {
      setIsModalVisible(true);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.container, showDetails && styles.containerClickable]}
        onPress={handlePress}
        disabled={!showDetails}
      >
        <View style={styles.indicator}>
          <View 
            style={[
              styles.dot, 
              { backgroundColor: getCongestionColor(congestion.level) }
            ]} 
          />
          <Text style={styles.levelText}>
            {congestion.level.charAt(0).toUpperCase() + congestion.level.slice(1)}
          </Text>
        </View>
        
        {showDetails && (
          <View style={styles.detailsContainer}>
            <Text style={styles.detailText}>
              ~{getWaitTimeText(congestion.level)}
            </Text>
            <Text style={styles.detailText}>
              {congestion.feeEstimates ? formatFee(congestion.feeEstimates.standard) : 'N/A'}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {showDetails && (
        <Modal
          visible={isModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {networkType} Network Status
                </Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setIsModalVisible(false)}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.statusContainer}>
                <Text style={styles.statusIcon}>
                  {getCongestionIcon(congestion.level)}
                </Text>
                <Text style={[
                  styles.statusLevel,
                  { color: getCongestionColor(congestion.level) }
                ]}>
                  {congestion.level.toUpperCase()} CONGESTION
                </Text>
              </View>

              <View style={styles.metricsContainer}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Expected Wait Time</Text>
                  <Text style={styles.metricValue}>
                    {getWaitTimeText(congestion.level)}
                  </Text>
                </View>

                {congestion.feeEstimates && (
                  <>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Slow Fee</Text>
                      <Text style={styles.metricValue}>
                        {formatFee(congestion.feeEstimates.slow)}
                      </Text>
                    </View>

                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Standard Fee</Text>
                      <Text style={styles.metricValue}>
                        {formatFee(congestion.feeEstimates.standard)}
                      </Text>
                    </View>

                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Fast Fee</Text>
                      <Text style={styles.metricValue}>
                        {formatFee(congestion.feeEstimates.fast)}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.recommendationContainer}>
                <Text style={styles.recommendationTitle}>Recommendation</Text>
                <Text style={styles.recommendationText}>
                  {congestion.level === 'low' && 
                    'Good time to transact! Network is running smoothly with low fees.'}
                  {congestion.level === 'medium' && 
                    'Moderate network activity. Consider using standard or fast fees for quicker confirmation.'}
                  {congestion.level === 'high' && 
                    'High network congestion detected. Transactions may take longer and cost more. Consider waiting or using acceleration options.'}
                </Text>
              </View>

              <Text style={styles.lastUpdated}>
                Last updated: {new Date(congestion.lastUpdated).toLocaleTimeString()}
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  containerClickable: {
    padding: 4,
    borderRadius: 8,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#495057',
  },
  detailsContainer: {
    marginLeft: 12,
    alignItems: 'flex-end',
  },
  detailText: {
    fontSize: 10,
    color: '#6c757d',
    lineHeight: 12,
  },
  unknownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unknownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6c757d',
    marginRight: 6,
  },
  unknownText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6c757d',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#495057',
    fontWeight: '600',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  statusIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  statusLevel: {
    fontSize: 16,
    fontWeight: '700',
  },
  metricsContainer: {
    marginBottom: 20,
  },
  metricItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  metricLabel: {
    fontSize: 14,
    color: '#495057',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  recommendationContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  recommendationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  recommendationText: {
    fontSize: 13,
    color: '#495057',
    lineHeight: 18,
  },
  lastUpdated: {
    fontSize: 11,
    color: '#6c757d',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});