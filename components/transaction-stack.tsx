import { useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Colors, primaryColor } from '@/constants/theme';
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
}

interface TransactionStackProps {
  transactions: StackTransaction[];
  onTransactionTap?: (transaction: StackTransaction) => void;
  maxVisible?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function TransactionStack({
  transactions,
  onTransactionTap,
  maxVisible = 3,
}: TransactionStackProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const borderColor = useThemeColor({}, 'border');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  if (transactions.length === 0) {
    return null;
  }

  const getTransactionIcon = (type: TransactionType): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'send':
        return 'arrow-up-outline';
      case 'receive':
        return 'arrow-down-outline';
      case 'swap':
        return 'swap-horizontal-outline';
      case 'deposit':
        return 'arrow-down-outline';
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
    <View style={styles.container}>
      {visibleTransactions.map((tx, index) => {
        const stackIndex = tx.stackIndex;
        const isTop = stackIndex === 0;
        const scale = 1 - stackIndex * 0.03;
        const opacity = 1 - stackIndex * 0.15;
        const translateY = -stackIndex * 6;

        return (
          <AnimatedPressable
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
            onPress={() => handleCardPress(stackIndex)}
          >
            <ThemedView
              style={[
                styles.card,
                { borderColor },
              ]}
              lightColor="#f4f4f5"
              darkColor="#1a1f25"
            >
              <View style={styles.cardContent}>
                <View style={[styles.iconContainer, { borderColor }]}>
                  <Ionicons
                    name={getTransactionIcon(tx.type)}
                    size={20}
                    color={colors.text}
                  />
                </View>
                <View style={styles.txInfo}>
                  <ThemedText style={styles.txType}>
                    {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                  </ThemedText>
                  <View style={styles.addressRow}>
                    <View style={styles.addressDot}>
                      <ThemedText style={[styles.diamond, { color: primaryColor }]}>◆</ThemedText>
                    </View>
                    <ThemedText style={[styles.address, { color: mutedColor }]}>
                      {tx.address}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.amountContainer}>
                  <ThemedText style={styles.tokenAmount}>{tx.tokenAmount}</ThemedText>
                  <ThemedText style={[styles.fiatValue, { color: mutedColor }]}>
                    {tx.fiatValue}
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
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    height: 100,
    marginTop: 8,
  },
  cardWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 16,
  },
  card: {
    borderRadius: 16,
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
  diamond: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  address: {
    fontSize: 14,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  tokenAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  fiatValue: {
    fontSize: 14,
    marginTop: 2,
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
