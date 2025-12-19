/**
 * FeeBreakdownDisplay Component for React Native
 * Comprehensive fee display for cryptocurrency conversion transactions
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  Animated,
} from 'react-native';
import { ConversionQuote } from '../../types';

interface FeeBreakdownDisplayProps {
  quote: ConversionQuote;
  showDetailed?: boolean;
  style?: ViewStyle;
}

interface FeeDetail {
  label: string;
  amount: number;
  description: string;
  color: string;
  percentage: number;
}

const FeeBreakdownDisplay: React.FC<FeeBreakdownDisplayProps> = ({
  quote,
  showDetailed = false,
  style,
}) => {
  const [isExpanded, setIsExpanded] = useState(showDetailed);
  const [animatedHeight] = useState(new Animated.Value(showDetailed ? 1 : 0));

  const formatUsdAmount = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(1)}%`;
  };

  const calculateFeePercentage = (feeAmount: number, totalAmount: number): number => {
    return totalAmount > 0 ? (feeAmount / totalAmount) * 100 : 0;
  };

  const getFeeDetails = (): FeeDetail[] => {
    const totalTransactionAmount = quote.toAmount + quote.fees.totalFee;

    return [
      {
        label: 'Network Fee',
        amount: quote.fees.networkFee,
        description: 'Blockchain transaction cost',
        color: '#F59E0B',
        percentage: calculateFeePercentage(quote.fees.networkFee, totalTransactionAmount),
      },
      {
        label: 'Conversion Fee',
        amount: quote.fees.conversionFee,
        description: 'Currency exchange service fee',
        color: '#8B5CF6',
        percentage: calculateFeePercentage(quote.fees.conversionFee, totalTransactionAmount),
      },
      {
        label: 'Platform Fee',
        amount: quote.fees.platformFee,
        description: 'Service and maintenance fee',
        color: '#06B6D4',
        percentage: calculateFeePercentage(quote.fees.platformFee, totalTransactionAmount),
      },
    ];
  };

  const toggleExpansion = () => {
    setIsExpanded(!isExpanded);
    Animated.timing(animatedHeight, {
      toValue: isExpanded ? 0 : 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const renderSimpleFeeDisplay = () => (
    <View style={styles.simpleFeeContainer}>
      <View style={styles.simpleFeeRow}>
        <Text style={styles.simpleFeeLabel}>Total Fees</Text>
        <Text style={styles.simpleFeeAmount}>
          {formatUsdAmount(quote.fees.totalFee)}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.expandButton}
        onPress={toggleExpansion}
      >
        <Text style={styles.expandButtonText}>
          {isExpanded ? 'Hide Details' : 'Show Breakdown'}
        </Text>
        <Text style={[
          styles.expandButtonIcon,
          isExpanded && styles.expandButtonIconRotated,
        ]}>
          ▼
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderDetailedFeeDisplay = () => {
    const feeDetails = getFeeDetails();
    const totalTransactionAmount = quote.toAmount + quote.fees.totalFee;
    const totalFeePercentage = calculateFeePercentage(quote.fees.totalFee, totalTransactionAmount);

    return (
      <Animated.View
        style={[
          styles.detailedFeeContainer,
          {
            opacity: animatedHeight,
            maxHeight: animatedHeight.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 400],
            }),
          },
        ]}
      >
        <Text style={styles.detailedTitle}>Fee Breakdown</Text>
        
        {/* Visual Fee Breakdown */}
        <View style={styles.feeVisualization}>
          <View style={styles.feeBar}>
            {feeDetails.map((fee, index) => {
              const width = fee.percentage > 0 ? Math.max(fee.percentage, 2) : 0;
              return (
                <View
                  key={index}
                  style={[
                    styles.feeSegment,
                    {
                      backgroundColor: fee.color,
                      width: `${width}%`,
                    },
                  ]}
                />
              );
            })}
          </View>
          <Text style={styles.feeVisualizationLabel}>
            {formatPercentage(totalFeePercentage)} of total transaction
          </Text>
        </View>

        {/* Individual Fee Details */}
        <View style={styles.feeDetailsList}>
          {feeDetails.map((fee, index) => (
            <View key={index} style={styles.feeDetailItem}>
              <View style={styles.feeDetailHeader}>
                <View style={styles.feeDetailLabelContainer}>
                  <View style={[styles.feeColorIndicator, { backgroundColor: fee.color }]} />
                  <Text style={styles.feeDetailLabel}>{fee.label}</Text>
                </View>
                <View style={styles.feeDetailAmountContainer}>
                  <Text style={styles.feeDetailAmount}>
                    {formatUsdAmount(fee.amount)}
                  </Text>
                  <Text style={styles.feeDetailPercentage}>
                    {formatPercentage(fee.percentage)}
                  </Text>
                </View>
              </View>
              <Text style={styles.feeDetailDescription}>{fee.description}</Text>
            </View>
          ))}
        </View>

        {/* Total Summary */}
        <View style={styles.feeSummary}>
          <View style={styles.feeSummaryRow}>
            <Text style={styles.feeSummaryLabel}>Funding Amount</Text>
            <Text style={styles.feeSummaryValue}>
              {formatUsdAmount(quote.toAmount)}
            </Text>
          </View>
          <View style={styles.feeSummaryRow}>
            <Text style={styles.feeSummaryLabel}>Total Fees</Text>
            <Text style={styles.feeSummaryValue}>
              + {formatUsdAmount(quote.fees.totalFee)}
            </Text>
          </View>
          <View style={[styles.feeSummaryRow, styles.feeSummaryTotal]}>
            <Text style={styles.feeSummaryTotalLabel}>Total Cost</Text>
            <Text style={styles.feeSummaryTotalValue}>
              {formatUsdAmount(totalTransactionAmount)}
            </Text>
          </View>
        </View>

        {/* Fee Comparison */}
        <View style={styles.feeComparison}>
          <Text style={styles.feeComparisonTitle}>Fee Analysis</Text>
          <View style={styles.feeComparisonContent}>
            {totalFeePercentage < 2 ? (
              <View style={styles.feeIndicatorGood}>
                <Text style={styles.feeIndicatorIcon}>✓</Text>
                <Text style={styles.feeIndicatorText}>
                  Low fees ({formatPercentage(totalFeePercentage)})
                </Text>
              </View>
            ) : totalFeePercentage < 5 ? (
              <View style={styles.feeIndicatorMedium}>
                <Text style={styles.feeIndicatorIcon}>⚠</Text>
                <Text style={styles.feeIndicatorText}>
                  Moderate fees ({formatPercentage(totalFeePercentage)})
                </Text>
              </View>
            ) : (
              <View style={styles.feeIndicatorHigh}>
                <Text style={styles.feeIndicatorIcon}>!</Text>
                <Text style={styles.feeIndicatorText}>
                  High fees ({formatPercentage(totalFeePercentage)})
                </Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, style]}>
      {renderSimpleFeeDisplay()}
      {renderDetailedFeeDisplay()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Simple Fee Display
  simpleFeeContainer: {
    padding: 16,
    gap: 12,
  },

  simpleFeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  simpleFeeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },

  simpleFeeAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF4444',
  },

  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },

  expandButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3B82F6',
  },

  expandButtonIcon: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '600',
    transform: [{ rotate: '0deg' }],
  },

  expandButtonIconRotated: {
    transform: [{ rotate: '180deg' }],
  },

  // Detailed Fee Display
  detailedFeeContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    overflow: 'hidden',
  },

  detailedTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
    textAlign: 'center',
  },

  // Fee Visualization
  feeVisualization: {
    marginBottom: 20,
  },

  feeBar: {
    flexDirection: 'row',
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },

  feeSegment: {
    height: '100%',
  },

  feeVisualizationLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },

  // Fee Details List
  feeDetailsList: {
    gap: 12,
    marginBottom: 20,
  },

  feeDetailItem: {
    gap: 4,
  },

  feeDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  feeDetailLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },

  feeColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  feeDetailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },

  feeDetailAmountContainer: {
    alignItems: 'flex-end',
    gap: 2,
  },

  feeDetailAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },

  feeDetailPercentage: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
  },

  feeDetailDescription: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 20,
    lineHeight: 16,
  },

  // Fee Summary
  feeSummary: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 8,
    gap: 8,
    marginBottom: 16,
  },

  feeSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  feeSummaryLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },

  feeSummaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },

  feeSummaryTotal: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
    marginTop: 4,
  },

  feeSummaryTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },

  feeSummaryTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },

  // Fee Comparison
  feeComparison: {
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },

  feeComparisonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },

  feeComparisonContent: {
    alignItems: 'center',
  },

  feeIndicatorGood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  feeIndicatorMedium: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  feeIndicatorHigh: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  feeIndicatorIcon: {
    fontSize: 14,
    fontWeight: '700',
  },

  feeIndicatorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
});

export default FeeBreakdownDisplay;