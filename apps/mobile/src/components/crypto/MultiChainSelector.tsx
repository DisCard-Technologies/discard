import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useCryptoStore } from '../../stores/crypto';
import { BridgeEstimate, BridgeOption } from '../../types/defi.types';
import { formatCurrency, formatDuration } from '../../utils/formatting';

interface MultiChainSelectorProps {
  selectedFromChain?: 'ETH' | 'POLYGON' | 'ARBITRUM';
  selectedToChain?: 'ETH' | 'POLYGON' | 'ARBITRUM';
  selectedAsset?: string;
  amount?: string;
  onBridgeSelect?: (estimate: BridgeEstimate) => void;
  onChainChange?: (fromChain: string, toChain: string) => void;
}

const SUPPORTED_CHAINS = [
  { id: 'ETH', name: 'Ethereum', icon: '⚡', color: '#627EEA' },
  { id: 'POLYGON', name: 'Polygon', icon: '🟣', color: '#8247E5' },
  { id: 'ARBITRUM', name: 'Arbitrum', icon: '🔵', color: '#28A0F0' }
];

const SUPPORTED_ASSETS = [
  { symbol: 'USDC', name: 'USD Coin', icon: '💵' },
  { symbol: 'USDT', name: 'Tether USD', icon: '💰' },
  { symbol: 'ETH', name: 'Ethereum', icon: '⚡' },
  { symbol: 'WBTC', name: 'Wrapped BTC', icon: '₿' },
  { symbol: 'DAI', name: 'Dai', icon: '🟡' }
];

export const MultiChainSelector: React.FC<MultiChainSelectorProps> = ({
  selectedFromChain = 'ETH',
  selectedToChain = 'POLYGON',
  selectedAsset = 'USDC',
  amount = '1000',
  onBridgeSelect,
  onChainChange
}) => {
  const { estimateBridge, isEstimatingBridge } = useCryptoStore();
  
  const [fromChain, setFromChain] = useState<'ETH' | 'POLYGON' | 'ARBITRUM'>(selectedFromChain);
  const [toChain, setToChain] = useState<'ETH' | 'POLYGON' | 'ARBITRUM'>(selectedToChain);
  const [asset, setAsset] = useState(selectedAsset);
  const [bridgeAmount, setBridgeAmount] = useState(amount);
  const [bridgeEstimate, setBridgeEstimate] = useState<BridgeEstimate | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>('');

  useEffect(() => {
    if (fromChain !== toChain && asset && bridgeAmount) {
      handleEstimateBridge();
    }
  }, [fromChain, toChain, asset, bridgeAmount]);

  useEffect(() => {
    if (onChainChange) {
      onChainChange(fromChain, toChain);
    }
  }, [fromChain, toChain, onChainChange]);

  const handleEstimateBridge = async () => {
    if (fromChain === toChain) {
      setBridgeEstimate(null);
      return;
    }

    try {
      const estimate = await estimateBridge(fromChain, toChain, asset, asset, bridgeAmount);
      setBridgeEstimate(estimate);
      setSelectedOption(estimate.bestProvider);
    } catch (error) {
      console.error('Failed to estimate bridge:', error);
      Alert.alert('Estimation Failed', 'Could not estimate bridge costs. Please try again.');
    }
  };

  const handleChainSelection = (chainId: 'ETH' | 'POLYGON' | 'ARBITRUM', isFromChain: boolean) => {
    if (isFromChain) {
      if (chainId !== toChain) {
        setFromChain(chainId);
      } else {
        Alert.alert('Invalid Selection', 'Source and destination chains cannot be the same.');
      }
    } else {
      if (chainId !== fromChain) {
        setToChain(chainId);
      } else {
        Alert.alert('Invalid Selection', 'Source and destination chains cannot be the same.');
      }
    }
  };

  const handleSwapChains = () => {
    const temp = fromChain;
    setFromChain(toChain);
    setToChain(temp);
  };

  const handleBridgeOptionSelect = (option: BridgeOption) => {
    setSelectedOption(option.provider);
    
    if (bridgeEstimate && onBridgeSelect) {
      const updatedEstimate: BridgeEstimate = {
        ...bridgeEstimate,
        bestProvider: option.provider,
        estimatedTime: option.estimatedTime,
        bridgeFee: option.bridgeFee,
        gasEstimate: option.gasEstimate
      };
      onBridgeSelect(updatedEstimate);
    }
  };

  const handleExecuteBridge = () => {
    if (bridgeEstimate && onBridgeSelect) {
      const selectedBridgeOption = [
        { ...bridgeEstimate, provider: bridgeEstimate.bestProvider },
        ...bridgeEstimate.alternatives
      ].find(opt => opt.provider === selectedOption);

      if (selectedBridgeOption) {
        const finalEstimate: BridgeEstimate = {
          ...bridgeEstimate,
          bestProvider: selectedBridgeOption.provider,
          estimatedTime: selectedBridgeOption.estimatedTime,
          bridgeFee: selectedBridgeOption.bridgeFee,
          gasEstimate: selectedBridgeOption.gasEstimate
        };
        onBridgeSelect(finalEstimate);
      }
    }
  };

  const getChainInfo = (chainId: string) => {
    return SUPPORTED_CHAINS.find(chain => chain.id === chainId);
  };

  const getAssetInfo = (symbol: string) => {
    return SUPPORTED_ASSETS.find(asset => asset.symbol === symbol);
  };

  const getReliabilityColor = (reliability: string) => {
    switch (reliability) {
      case 'high': return '#10B981';
      case 'medium': return '#F59E0B';
      case 'low': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const renderChainSelector = (title: string, selectedChain: string, isFromChain: boolean) => (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, fontWeight: '500' }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {SUPPORTED_CHAINS.map((chain) => {
          const isSelected = selectedChain === chain.id;
          const isDisabled = !isFromChain && chain.id === fromChain;
          
          return (
            <TouchableOpacity
              key={chain.id}
              style={{
                backgroundColor: isSelected ? chain.color : '#F3F4F6',
                borderRadius: 8,
                padding: 12,
                alignItems: 'center',
                minWidth: 80,
                opacity: isDisabled ? 0.5 : 1,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? chain.color : '#E5E7EB'
              }}
              onPress={() => !isDisabled && handleChainSelection(chain.id as any, isFromChain)}
              disabled={isDisabled}
            >
              <Text style={{ fontSize: 16, marginBottom: 4 }}>
                {chain.icon}
              </Text>
              <Text style={{
                fontSize: 10,
                fontWeight: '500',
                color: isSelected ? '#FFFFFF' : '#374151'
              }}>
                {chain.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderAssetSelector = () => (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, fontWeight: '500' }}>
        Asset
      </Text>
      <FlatList
        data={SUPPORTED_ASSETS}
        horizontal
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => {
          const isSelected = asset === item.symbol;
          return (
            <TouchableOpacity
              style={{
                backgroundColor: isSelected ? '#3B82F6' : '#F3F4F6',
                borderRadius: 8,
                padding: 12,
                marginRight: 8,
                alignItems: 'center',
                minWidth: 70,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? '#3B82F6' : '#E5E7EB'
              }}
              onPress={() => setAsset(item.symbol)}
            >
              <Text style={{ fontSize: 14, marginBottom: 4 }}>
                {item.icon}
              </Text>
              <Text style={{
                fontSize: 10,
                fontWeight: '500',
                color: isSelected ? '#FFFFFF' : '#374151'
              }}>
                {item.symbol}
              </Text>
            </TouchableOpacity>
          );
        }}
        keyExtractor={(item) => item.symbol}
      />
    </View>
  );

  const renderBridgeOptions = () => {
    if (!bridgeEstimate) return null;

    const allOptions = [
      {
        provider: bridgeEstimate.bestProvider,
        estimatedTime: bridgeEstimate.estimatedTime,
        bridgeFee: bridgeEstimate.bridgeFee,
        gasEstimate: bridgeEstimate.gasEstimate,
        totalCost: (parseFloat(bridgeEstimate.bridgeFee) + parseFloat(bridgeEstimate.gasEstimate)).toString(),
        reliability: 'high' as const
      },
      ...bridgeEstimate.alternatives
    ];

    return (
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 12 }}>
          Bridge Options
        </Text>
        {allOptions.map((option, index) => {
          const isSelected = selectedOption === option.provider;
          const isBest = option.provider === bridgeEstimate.bestProvider;
          
          return (
            <TouchableOpacity
              key={option.provider}
              style={{
                backgroundColor: isSelected ? '#EBF4FF' : '#FFFFFF',
                borderRadius: 8,
                padding: 16,
                marginBottom: 8,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? '#3B82F6' : '#E5E7EB'
              }}
              onPress={() => setSelectedOption(option.provider)}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1F2937' }}>
                    {option.provider.replace('_', ' ')}
                  </Text>
                  {isBest && (
                    <View style={{
                      backgroundColor: '#10B981',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      marginLeft: 8
                    }}>
                      <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '500' }}>
                        RECOMMENDED
                      </Text>
                    </View>
                  )}
                </View>
                <View
                  style={{
                    backgroundColor: getReliabilityColor(option.reliability),
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4
                  }}
                >
                  <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '500' }}>
                    {option.reliability.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <View>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>Time</Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#1F2937' }}>
                    {formatDuration(option.estimatedTime)}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>Bridge Fee</Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#1F2937' }}>
                    {formatCurrency(option.bridgeFee)}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>Gas</Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#1F2937' }}>
                    {formatCurrency(option.gasEstimate)}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>Total</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444' }}>
                    {formatCurrency(option.totalCost)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const fromChainInfo = getChainInfo(fromChain);
  const toChainInfo = getChainInfo(toChain);
  const assetInfo = getAssetInfo(asset);

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB', padding: 16 }}>
      {/* Header */}
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#1F2937', marginBottom: 8 }}>
          Multi-Chain Bridge
        </Text>
        <Text style={{ fontSize: 14, color: '#6B7280' }}>
          Move assets across chains for optimal DeFi funding
        </Text>
      </View>

      {/* Chain Selection */}
      <View style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          {renderChainSelector('From Chain', fromChain, true)}
          
          <TouchableOpacity
            style={{
              backgroundColor: '#3B82F6',
              borderRadius: 20,
              width: 40,
              height: 40,
              justifyContent: 'center',
              alignItems: 'center',
              marginHorizontal: 16
            }}
            onPress={handleSwapChains}
          >
            <Text style={{ fontSize: 16, color: '#FFFFFF' }}>⇄</Text>
          </TouchableOpacity>
          
          {renderChainSelector('To Chain', toChain, false)}
        </View>

        {renderAssetSelector()}

        {/* Amount Input */}
        <View>
          <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, fontWeight: '500' }}>
            Amount ({asset})
          </Text>
          <View style={{
            backgroundColor: '#F3F4F6',
            borderRadius: 8,
            padding: 12,
            borderWidth: 1,
            borderColor: '#E5E7EB'
          }}>
            <Text style={{ fontSize: 16, color: '#1F2937' }}>
              {bridgeAmount} {asset}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
              ≈ {formatCurrency(bridgeAmount)}
            </Text>
          </View>
        </View>
      </View>

      {/* Bridge Estimation */}
      {isEstimatingBridge && (
        <View style={{ alignItems: 'center', padding: 20 }}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>
            Calculating bridge options...
          </Text>
        </View>
      )}

      {bridgeEstimate && renderBridgeOptions()}

      {/* Execute Button */}
      {bridgeEstimate && (
        <TouchableOpacity
          style={{
            backgroundColor: '#3B82F6',
            borderRadius: 12,
            padding: 16,
            alignItems: 'center',
            marginTop: 20
          }}
          onPress={handleExecuteBridge}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
            Execute Bridge
          </Text>
          <Text style={{ color: '#DBEAFE', fontSize: 12, marginTop: 4 }}>
            Bridge {bridgeAmount} {asset} from {fromChainInfo?.name} to {toChainInfo?.name}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};