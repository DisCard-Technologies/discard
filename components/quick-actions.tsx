import { StyleSheet, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

interface QuickAction {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  dashed?: boolean;
  onPress: () => void;
}

interface QuickActionsProps {
  onSend?: () => void;
  onReceive?: () => void;
  onSwap?: () => void;
  onScanQR?: () => void;
  onFund?: () => void;
}

export function QuickActions({
  onSend,
  onReceive,
  onSwap,
  onScanQR,
  onFund,
}: QuickActionsProps) {
  const borderColor = useThemeColor({}, 'border');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

  const actions: QuickAction[] = [
    {
      id: 'send',
      icon: 'arrow-up-outline',
      label: 'Send',
      onPress: onSend || (() => {}),
    },
    {
      id: 'receive',
      icon: 'arrow-down-outline',
      label: 'Receive',
      onPress: onReceive || (() => {}),
    },
    {
      id: 'scan',
      icon: 'qr-code-outline',
      label: 'Scan QR',
      onPress: onScanQR || (() => {}),
    },
    {
      id: 'swap',
      icon: 'swap-horizontal-outline',
      label: 'Swap',
      onPress: onSwap || (() => {}),
    },
    {
      id: 'fund',
      icon: 'card-outline',
      label: 'Fund',
      onPress: onFund || (() => {}),
    },
  ];

  const handlePress = (action: QuickAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action.onPress();
  };

  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
          ]}
          onPress={() => handlePress(action)}
        >
          <View
            style={[
              styles.iconContainer,
              {
                borderColor,
                borderStyle: action.dashed ? 'dashed' : 'solid',
              },
            ]}
          >
            <Ionicons name={action.icon} size={20} color={textColor} />
          </View>
          <ThemedText style={[styles.label, { color: mutedColor }]}>
            {action.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  actionButton: {
    alignItems: 'center',
    gap: 8,
  },
  actionButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
