import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useCryptoStore } from '../../stores/crypto';
import { YieldOptimization } from '../../types/defi.types';
import { formatCurrency, formatPercentage } from '../../utils/formatting';

interface YieldOptimizerProps {
  onOptimizationSelect?: (optimization: YieldOptimization) => void;
}

export const YieldOptimizer: React.FC<YieldOptimizerProps> = ({
  onOptimizationSelect
}) => {
  const {
    yieldOptimizations,
    isLoadingOptimizations,
    generateYieldOptimizations,
    acceptYieldOptimization,
    declineYieldOptimization
  } = useCryptoStore();

  const [selectedOptimizations, setSelectedOptimizations] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    handleInitialLoad();
  }, []);

  const handleInitialLoad = async () => {
    try {
      await generateYieldOptimizations();
    } catch (error) {
      console.error('Failed to generate yield optimizations:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await generateYieldOptimizations();
    } catch (error) {
      Alert.alert('Refresh Failed', 'Could not generate new optimizations. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleOptimizationPress = (optimization: YieldOptimization) => {
    if (onOptimizationSelect) {
      onOptimizationSelect(optimization);
    } else {
      showOptimizationDetails(optimization);
    }
  };

  const showOptimizationDetails = (optimization: YieldOptimization) => {
    const yieldDiff = parseFloat(optimization.yieldImprovement);
    const currentYield = parseFloat(optimization.sourcePosition.currentYield);
    const newYield = currentYield + yieldDiff;

    Alert.alert(
      'Yield Optimization Opportunity',
      `Move from ${optimization.sourcePosition.protocolName} to ${optimization.suggestedPosition.protocolName}\n\n` +
      `Current Yield: ${formatPercentage(currentYield.toString())}% APY\n` +
      `New Yield: ${formatPercentage(newYield.toString())}% APY\n` +
      `Improvement: +${formatPercentage(optimization.yieldImprovement)}%\n\n` +
      `Gas Costs: ${formatCurrency(optimization.gasSavings)}\n` +
      `Risk Change: ${optimization.riskAssessment.toUpperCase()}\n\n` +
      `Expires: ${new Date(optimization.expiresAt).toLocaleDateString()}`,
      [
        { text: 'Decline', style: 'destructive', onPress: () => handleDeclineOptimization(optimization) },
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', onPress: () => handleAcceptOptimization(optimization) }
      ]
    );
  };

  const handleAcceptOptimization = async (optimization: YieldOptimization) => {
    try {
      await acceptYieldOptimization(optimization.optimizationId);
      Alert.alert(
        'Optimization Accepted',
        'Your yield optimization has been initiated. You will receive updates on the progress.'
      );
    } catch (error) {
      Alert.alert('Failed', 'Could not accept yield optimization. Please try again.');
    }
  };

  const handleDeclineOptimization = async (optimization: YieldOptimization) => {
    try {
      await declineYieldOptimization(optimization.optimizationId);
    } catch (error) {
      Alert.alert('Error', 'Could not decline optimization.');
    }
  };

  const toggleOptimizationSelection = (optimizationId: string) => {
    setSelectedOptimizations(prev => 
      prev.includes(optimizationId)
        ? prev.filter(id => id !== optimizationId)
        : [...prev, optimizationId]
    );
  };

  const getRiskChangeColor = (riskAssessment: string) => {
    switch (riskAssessment) {
      case 'lower': return '#10B981'; // Green
      case 'same': return '#6B7280'; // Gray
      case 'higher': return '#EF4444'; // Red
      default: return '#6B7280';
    }
  };

  const getRiskChangeIcon = (riskAssessment: string) => {
    switch (riskAssessment) {
      case 'lower': return '⬇️';
      case 'same': return '➡️';
      case 'higher': return '⬆️';
      default: return '➡️';
    }
  };

  const getYieldImprovementColor = (improvement: string) => {
    const value = parseFloat(improvement);
    if (value > 2) return '#10B981'; // Significant improvement - Green
    if (value > 0.5) return '#F59E0B'; // Moderate improvement - Amber
    return '#6B7280'; // Small improvement - Gray
  };

  const isOptimizationExpired = (expiresAt: Date) => {
    return new Date() > new Date(expiresAt);
  };

  const renderOptimizationItem = ({ item: optimization }: { item: YieldOptimization }) => {
    const isSelected = selectedOptimizations.includes(optimization.optimizationId);
    const isExpired = isOptimizationExpired(optimization.expiresAt);
    const yieldImprovement = parseFloat(optimization.yieldImprovement);
    const currentYield = parseFloat(optimization.sourcePosition.currentYield);
    const newYield = currentYield + yieldImprovement;

    return (
      <TouchableOpacity
        style={{
          backgroundColor: isExpired ? '#FEF2F2' : (isSelected ? '#EBF4FF' : '#FFFFFF'),
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          borderWidth: isSelected ? 2 : 1,
          borderColor: isExpired ? '#FECACA' : (isSelected ? '#3B82F6' : '#E5E7EB'),
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 2,
          opacity: isExpired ? 0.7 : 1
        }}
        onPress={() => !isExpired && handleOptimizationPress(optimization)}
        onLongPress={() => !isExpired && toggleOptimizationSelection(optimization.optimizationId)}
        disabled={isExpired}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1F2937' }}>
              {optimization.sourcePosition.protocolName} → {optimization.suggestedPosition.protocolName}
            </Text>
          </View>
          {isExpired ? (
            <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '500' }}>
              EXPIRED
            </Text>
          ) : (
            <Text style={{ fontSize: 12, color: '#6B7280' }}>
              {Math.ceil((new Date(optimization.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60))}h left
            </Text>
          )}
        </View>

        {/* Networks */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>
            {optimization.sourcePosition.networkType} → {optimization.suggestedPosition.networkType}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 12,
                color: getRiskChangeColor(optimization.riskAssessment),
                fontWeight: '500'
              }}
            >
              {getRiskChangeIcon(optimization.riskAssessment)} Risk {optimization.riskAssessment}
            </Text>
          </View>
        </View>

        {/* Yield Improvement */}
        <View style={{
          backgroundColor: '#F0FDF4',
          padding: 12,
          borderRadius: 8,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: '#BBF7D0'
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#059669' }}>
              Yield Improvement
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '700',
                color: getYieldImprovementColor(optimization.yieldImprovement)
              }}
            >
              +{formatPercentage(optimization.yieldImprovement)}%
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: '#065F46' }}>
              Current: {formatPercentage(currentYield.toString())}%
            </Text>
            <Text style={{ fontSize: 12, color: '#065F46' }}>
              New: {formatPercentage(newYield.toString())}%
            </Text>
          </View>
        </View>

        {/* Financial Impact */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>
              Position Value
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#1F2937' }}>
              {formatCurrency(optimization.sourcePosition.totalValueLocked)}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>
              Est. Gas Cost
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#EF4444' }}>
              {formatCurrency(optimization.gasSavings)}
            </Text>
          </View>
        </View>

        {/* Expected Annual Gain */}
        <View style={{
          backgroundColor: '#FFFBEB',
          padding: 8,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: '#FDE68A'
        }}>
          <Text style={{ fontSize: 11, color: '#92400E', textAlign: 'center' }}>
            Expected additional annual return: {formatCurrency(
              (parseFloat(optimization.sourcePosition.totalValueLocked) * yieldImprovement / 100).toString()
            )}
          </Text>
        </View>

        {/* Action buttons for non-expired optimizations */}
        {!isExpired && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
            <TouchableOpacity
              style={{
                backgroundColor: '#F3F4F6',
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 6,
                flex: 1,
                marginRight: 8
              }}
              onPress={() => handleDeclineOptimization(optimization)}
            >
              <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: '500', color: '#6B7280' }}>
                Decline
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                backgroundColor: '#3B82F6',
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 6,
                flex: 1,
                marginLeft: 8
              }}
              onPress={() => handleAcceptOptimization(optimization)}
            >
              <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: '500', color: '#FFFFFF' }}>
                Accept
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
      <Text style={{ fontSize: 24, marginBottom: 16 }}>🎯</Text>
      <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 8, textAlign: 'center' }}>
        No Optimizations Available
      </Text>
      <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24 }}>
        We're constantly monitoring your DeFi positions for yield optimization opportunities. Check back later!
      </Text>
      <TouchableOpacity
        style={{
          backgroundColor: '#3B82F6',
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderRadius: 8
        }}
        onPress={handleRefresh}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>
          Check for Opportunities
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => {
    const activeOptimizations = yieldOptimizations.filter(opt => !isOptimizationExpired(opt.expiresAt));
    const totalPotentialImprovement = activeOptimizations.reduce((sum, opt) => 
      sum + (parseFloat(opt.sourcePosition.totalValueLocked) * parseFloat(opt.yieldImprovement) / 100), 0
    );

    return (
      <View style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#1F2937' }}>
            Yield Optimizer
          </Text>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={refreshing}
            style={{
              backgroundColor: refreshing ? '#F3F4F6' : '#3B82F6',
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center'
            }}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#6B7280" />
            ) : (
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '500' }}>
                🔄 Refresh
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {activeOptimizations.length > 0 && (
          <View style={{
            backgroundColor: '#F0FDF4',
            padding: 16,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#BBF7D0',
            marginBottom: 12
          }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#059669', marginBottom: 8 }}>
              💡 Optimization Summary
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#065F46' }}>
                {activeOptimizations.length} opportunities available
              </Text>
              <Text style={{ fontSize: 12, color: '#065F46', fontWeight: '500' }}>
                Potential: +{formatCurrency(totalPotentialImprovement.toString())}/year
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (isLoadingOptimizations && yieldOptimizations.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={{ marginTop: 16, fontSize: 16, color: '#6B7280' }}>
          Analyzing yield opportunities...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <FlatList
        data={yieldOptimizations}
        renderItem={renderOptimizationItem}
        keyExtractor={(item) => item.optimizationId}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};