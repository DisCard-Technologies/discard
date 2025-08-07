import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useCryptoStore } from '../../stores/crypto';
import { DeFiPosition } from '../../types/defi.types';
import { formatCurrency, formatPercentage } from '../../utils/formatting';

interface DeFiIntegrationProps {
  userWalletAddress: string;
  onPositionSelect?: (position: DeFiPosition) => void;
}

export const DeFiIntegration: React.FC<DeFiIntegrationProps> = ({
  userWalletAddress,
  onPositionSelect
}) => {
  const {
    defiPositions,
    isLoadingDeFi,
    fetchDeFiPositions,
    syncDeFiPositions,
    fundFromDeFiPosition
  } = useCryptoStore();

  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    handleInitialLoad();
  }, [userWalletAddress]);

  const handleInitialLoad = async () => {
    if (!userWalletAddress) return;
    
    try {
      await fetchDeFiPositions();
      // Sync with blockchain on initial load
      await syncDeFiPositions(userWalletAddress);
    } catch (error) {
      console.error('Failed to load DeFi positions:', error);
      Alert.alert('Error', 'Failed to load DeFi positions. Please try again.');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await syncDeFiPositions(userWalletAddress);
    } catch (error) {
      Alert.alert('Sync Failed', 'Could not sync with blockchain. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handlePositionPress = (position: DeFiPosition) => {
    if (onPositionSelect) {
      onPositionSelect(position);
    } else {
      // Default behavior - show position details
      showPositionDetails(position);
    }
  };

  const showPositionDetails = (position: DeFiPosition) => {
    Alert.alert(
      `${position.protocolName} Position`,
      `Network: ${position.networkType}\n` +
      `Type: ${position.positionType.replace('_', ' ').toUpperCase()}\n` +
      `Yield: ${formatPercentage(position.currentYield)} APY\n` +
      `Total Value: ${formatCurrency(position.totalValueLocked)}\n` +
      `Available: ${formatCurrency(position.availableForFunding)}\n` +
      `Risk: ${position.riskLevel.toUpperCase()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Fund Card', onPress: () => handleFundFromPosition(position) }
      ]
    );
  };

  const handleFundFromPosition = (position: DeFiPosition) => {
    Alert.alert(
      'Fund Card',
      `Fund your card from ${position.protocolName} position?\n\nAvailable: ${formatCurrency(position.availableForFunding)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => executeFunding(position) }
      ]
    );
  };

  const executeFunding = async (position: DeFiPosition) => {
    try {
      // For demo purposes, fund with 50% of available amount
      const fundingAmount = (parseFloat(position.availableForFunding) * 0.5).toString();
      
      await fundFromDeFiPosition(position.positionId, fundingAmount, 'default-card');
      
      Alert.alert(
        'Funding Initiated',
        `Funding request submitted for ${formatCurrency(fundingAmount)} from ${position.protocolName}.`
      );
    } catch (error) {
      Alert.alert('Funding Failed', 'Could not initiate funding from DeFi position.');
    }
  };

  const togglePositionSelection = (positionId: string) => {
    setSelectedPositions(prev => 
      prev.includes(positionId)
        ? prev.filter(id => id !== positionId)
        : [...prev, positionId]
    );
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return '#10B981'; // Green
      case 'medium': return '#F59E0B'; // Amber
      case 'high': return '#EF4444'; // Red
      default: return '#6B7280'; // Gray
    }
  };

  const getProtocolIcon = (protocol: string) => {
    // In a real app, these would be proper protocol icons
    const icons: { [key: string]: string } = {
      'Aave': '🏛️',
      'Compound': '🏗️',
      'Uniswap': '🦄',
      'SushiSwap': '🍣'
    };
    return icons[protocol] || '💰';
  };

  const renderPositionItem = ({ item: position }: { item: DeFiPosition }) => {
    const isSelected = selectedPositions.includes(position.positionId);
    
    return (
      <TouchableOpacity
        style={{
          backgroundColor: isSelected ? '#EBF4FF' : '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? '#3B82F6' : '#E5E7EB',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 2
        }}
        onPress={() => handlePositionPress(position)}
        onLongPress={() => togglePositionSelection(position.positionId)}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, marginRight: 8 }}>
              {getProtocolIcon(position.protocolName)}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937' }}>
              {position.protocolName}
            </Text>
            <View
              style={{
                backgroundColor: getRiskColor(position.riskLevel),
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                marginLeft: 8
              }}
            >
              <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '500' }}>
                {position.riskLevel.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, color: '#6B7280' }}>
            {position.networkType}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <View>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>
              Yield (APY)
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#10B981' }}>
              {formatPercentage(position.currentYield)}%
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>
              Total Value
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1F2937' }}>
              {formatCurrency(position.totalValueLocked)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>
              Available for Funding
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#3B82F6' }}>
              {formatCurrency(position.availableForFunding)}
            </Text>
          </View>
          <Text style={{
            fontSize: 11,
            color: '#6B7280',
            textTransform: 'capitalize'
          }}>
            {position.positionType.replace('_', ' ')}
          </Text>
        </View>

        {/* Asset breakdown */}
        {position.underlyingAssets.length > 0 && (
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
              Assets:
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {position.underlyingAssets.map((asset, index) => (
                <View
                  key={index}
                  style={{
                    backgroundColor: '#F3F4F6',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                    marginRight: 6,
                    marginBottom: 4
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#374151' }}>
                    {asset.asset} ({asset.weight}%)
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
      <Text style={{ fontSize: 24, marginBottom: 16 }}>💰</Text>
      <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 8, textAlign: 'center' }}>
        No DeFi Positions Found
      </Text>
      <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24 }}>
        Connect your wallet and start earning yield on your crypto to fund your cards directly from DeFi protocols.
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
          Sync Positions
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#1F2937' }}>
          DeFi Positions
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
              🔄 Sync
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {defiPositions.length > 0 && (
        <View style={{
          backgroundColor: '#F9FAFB',
          padding: 16,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#E5E7EB'
        }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#1F2937', marginBottom: 4 }}>
            Portfolio Summary
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>
              Total Value: {formatCurrency(
                defiPositions.reduce((sum, pos) => sum + parseFloat(pos.totalValueLocked), 0).toString()
              )}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>
              {defiPositions.length} Position{defiPositions.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  if (isLoadingDeFi && defiPositions.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={{ marginTop: 16, fontSize: 16, color: '#6B7280' }}>
          Loading DeFi positions...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <FlatList
        data={defiPositions}
        renderItem={renderPositionItem}
        keyExtractor={(item) => item.positionId}
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