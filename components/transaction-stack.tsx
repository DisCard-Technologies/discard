import { useState, useEffect } from 'react';
import { StyleSheet, View, Image } from 'react-native';
import { PressableScale } from 'pressto';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Colors, primaryColor, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type TransactionType = 'send' | 'receive' | 'swap' | 'deposit' | 'withdrawal';

export interface StackTransaction {
  id: string;
  type: TransactionType;
  address: string;
  tokenAmount: string;
  fiatValue: string;
  fee?: string;
  estimatedTime?: string;
  tokenLogoUri?: string;
  status?: 'processing' | 'completed' | 'failed';
}

interface TransactionStackProps {
  transactions: StackTransaction[];
  onTransactionTap?: (transaction: StackTransaction) => void;
  maxVisible?: number;
  testID?: string;
}

const AnimatedSvgView = Animated.createAnimatedComponent(View);

/**
 * Rotating arc spinner that wraps around the transaction icon
 */
function ProcessingSpinner({ size = 40, color = primaryColor }: { size?: number; color?: string }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1200, easing: Easing.linear }),
      -1, // infinite
      false
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.3; // 30% of circle

  return (
    <AnimatedSvgView
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
        },
        animatedStyle,
      ]}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          strokeLinecap="round"
        />
      </Svg>
    </AnimatedSvgView>
  );
}

export function TransactionStack({
  transactions,
  onTransactionTap,
  maxVisible = 3,
  testID,
}: TransactionStackProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const borderColor = useThemeColor({}, 'border');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  if (transactions.length === 0) {
    return (
      <View style={styles.emptyContainer} testID={testID ? `${testID}-empty` : undefined}>
        <View style={[styles.emptyIconContainer, { borderColor }]}>
          <Ionicons name="receipt-outline" size={24} color={mutedColor} />
        </View>
        <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
          No recent transactions
        </ThemedText>
      </View>
    );
  }

  const getTransactionIcon = (type: TransactionType): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'send':
        return 'trending-up-outline';         // ↗ outbound send
      case 'receive':
        return 'trending-down-outline';       // ↙ inbound receive
      case 'swap':
        return 'swap-horizontal-outline';
      case 'deposit':
        return 'arrow-down-outline';          // ↓ deposit/fund
      case 'withdrawal':
        return 'arrow-up-outline';
      default:
        return 'ellipsis-horizontal';
    }
  };

  const getVisibleTransactions = () => {
    const result = [];
    for (let i = 0; i < Math.min(maxVisible, transactions.length); i++) {
      const index = (currentIndex + i) % transactions.length;
      result.push({ ...transactions[index], stackIndex: i });
    }
    return result;
  };

  const handleCardPress = (stackIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (stackIndex === 0) {
      setIsExpanded(!isExpanded);
    } else {
      setCurrentIndex((prev) => (prev + 1) % transactions.length);
    }
  };

  const handleTransactionTap = (tx: StackTransaction) => {
    if (onTransactionTap) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onTransactionTap(tx);
    }
  };

  const visibleTransactions = getVisibleTransactions();

  return (
    <View style={styles.container} testID={testID}>
      {visibleTransactions.map((tx, index) => {
        const stackIndex = tx.stackIndex;
        const isTop = stackIndex === 0;
        const scale = 1 - stackIndex * 0.03;
        const opacity = 1 - stackIndex * 0.15;
        const translateY = -stackIndex * 6;

        return (
          <Animated.View
            key={tx.id}
            style={[
              styles.cardWrapper,
              {
                zIndex: maxVisible - stackIndex,
                transform: [
                  { scale },
                  { translateY: isExpanded && isTop ? 0 : translateY },
                ],
                opacity,
              },
            ]}
          >
            <PressableScale onPress={() => handleCardPress(stackIndex)} style={{ flex: 1 }}>
            <ThemedView
              style={[
                styles.card,
                {
                  borderColor,
                  borderRadius: isTop && isExpanded ? 16 : 999,
                },
              ]}
              lightColor="#f4f4f5"
              darkColor="#1a1f25"
            >
              <View style={styles.cardContent}>
                <View style={[
                  styles.iconContainer,
                  {
                    borderColor: tx.status === 'failed' ? '#ef4444' :
                                 tx.status === 'completed' ? '#10b981' :
                                 borderColor,
                  },
                ]}>
                  {tx.status === 'processing' && (
                    <ProcessingSpinner size={42} color={primaryColor} />
                  )}
                  <Ionicons
                    name={
                      tx.status === 'completed' ? 'checkmark' :
                      tx.status === 'failed' ? 'close' :
                      getTransactionIcon(tx.type)
                    }
                    size={20}
                    color={
                      tx.status === 'completed' ? '#10b981' :
                      tx.status === 'failed' ? '#ef4444' :
                      colors.text
                    }
                  />
                </View>
                <View style={styles.txInfo}>
                  <ThemedText style={styles.txType}>
                    {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                  </ThemedText>
                  <View style={styles.addressRow}>
                    {tx.tokenLogoUri ? (
                      <Image
                        source={{ uri: tx.tokenLogoUri }}
                        style={styles.tokenLogo}
                      />
                    ) : (
                      <View style={styles.addressDot}>
                        <ThemedText style={[styles.diamond, { color: primaryColor }]}>◆</ThemedText>
                      </View>
                    )}
                    <ThemedText style={[styles.address, { color: mutedColor }]}>
                      {tx.address}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.amountContainer}>
                  <ThemedText style={styles.fiatValue}>{tx.fiatValue}</ThemedText>
                  <ThemedText style={[styles.tokenAmount, { color: mutedColor }]}>
                    {tx.tokenAmount}
                  </ThemedText>
                </View>
              </View>

              {isTop && isExpanded && (tx.fee || tx.estimatedTime) && (
                <View style={[styles.expandedContent, { borderTopColor: borderColor }]}>
                  {tx.fee && (
                    <View style={styles.feeRow}>
                      <Ionicons name="time-outline" size={14} color={mutedColor} />
                      <ThemedText style={[styles.feeText, { color: mutedColor }]}>
                        Fee: {tx.fee}
                      </ThemedText>
                    </View>
                  )}
                  {tx.estimatedTime && (
                    <ThemedText style={[styles.timeText, { color: mutedColor }]}>
                      {tx.estimatedTime}
                    </ThemedText>
                  )}
                </View>
              )}
            </ThemedView>
            </PressableScale>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    height: 100,
  },
  emptyContainer: {
    paddingHorizontal: 16,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  emptyIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
  },
  cardWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 16,
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
  },
  txType: {
    fontSize: 16,
    fontWeight: '600',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  addressDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenLogo: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  diamond: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  address: {
    fontSize: 14,
    fontFamily: Fonts.mono,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  tokenAmount: {
    fontSize: 14,
    marginTop: 2,
  },
  fiatValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  expandedContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  feeText: {
    fontSize: 14,
  },
  timeText: {
    fontSize: 14,
  },
});
