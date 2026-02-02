/**
 * DisCard 2035 - Seed Vault Connection Modal
 *
 * Modal for connecting Seed Vault via Mobile Wallet Adapter.
 * Shows benefits, handles authorization flow, and option to set as default.
 */

import { useState } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useMWA } from '@/providers/MWAProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';

// ============================================================================
// Types
// ============================================================================

interface SeedVaultConnectionModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected: () => void;
}

interface FeatureItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  iconColor: string;
}

// ============================================================================
// Component
// ============================================================================

export default function SeedVaultConnectionModal({
  visible,
  onClose,
  onConnected,
}: SeedVaultConnectionModalProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const mwa = useMWA();

  // State
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theme colors
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.03)', dark: 'rgba(255,255,255,0.06)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');
  const backgroundColor = useThemeColor({ light: '#fff', dark: '#0a0a0a' }, 'background');
  const dangerColor = '#ef4444';

  // Handlers
  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const success = await mwa.connect(setAsDefault);

      if (success) {
        onConnected();
      } else {
        setError(mwa.error ?? 'Failed to connect to Seed Vault');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleClose = () => {
    if (!isConnecting) {
      setError(null);
      onClose();
    }
  };

  // Feature item component
  const FeatureItem = ({ icon, title, description, iconColor }: FeatureItemProps) => (
    <View style={styles.featureItem}>
      <View style={[styles.featureIcon, { backgroundColor: `${iconColor}20` }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.featureInfo}>
        <ThemedText style={styles.featureTitle}>{title}</ThemedText>
        <ThemedText style={[styles.featureDescription, { color: mutedColor }]}>
          {description}
        </ThemedText>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <BlurView
          intensity={80}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      </Pressable>

      <View style={[styles.modalContainer, { paddingBottom: insets.bottom }]}>
        <ThemedView style={[styles.modalContent, { backgroundColor }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <Ionicons name="hardware-chip" size={32} color="#f59e0b" />
            </View>
            <ThemedText style={styles.title}>Connect Seed Vault</ThemedText>
            <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
              Use your Seeker's hardware wallet for maximum security
            </ThemedText>
          </View>

          {/* Features */}
          <View style={[styles.featuresContainer, { backgroundColor: cardBg, borderColor }]}>
            <FeatureItem
              icon="shield-checkmark"
              iconColor="#10b981"
              title="Hardware Security"
              description="Keys never leave the secure element"
            />
            <View style={[styles.featureDivider, { backgroundColor: borderColor }]} />
            <FeatureItem
              icon="eye-off"
              iconColor="#8b5cf6"
              title="Private Signing"
              description="Biometric confirmation for every transaction"
            />
            <View style={[styles.featureDivider, { backgroundColor: borderColor }]} />
            <FeatureItem
              icon="flash"
              iconColor="#3b82f6"
              title="Seamless Experience"
              description="One-tap authorization from DisCard"
            />
          </View>

          {/* Set as Default Toggle */}
          <PressableScale
            onPress={() => setSetAsDefault(!setAsDefault)}
            style={[styles.toggleRow, { backgroundColor: cardBg, borderColor }]}
          >
            <View style={styles.toggleInfo}>
              <ThemedText style={styles.toggleLabel}>Set as default signer</ThemedText>
              <ThemedText style={[styles.toggleDescription, { color: mutedColor }]}>
                Use Seed Vault for all transactions
              </ThemedText>
            </View>
            <View
              style={[
                styles.toggle,
                {
                  backgroundColor: setAsDefault ? primaryColor : cardBg,
                  borderColor: setAsDefault ? primaryColor : borderColor,
                },
              ]}
            >
              {setAsDefault && (
                <Ionicons name="checkmark" size={14} color="#000" />
              )}
            </View>
          </PressableScale>

          {/* Error Message */}
          {error && (
            <View style={[styles.errorContainer, { backgroundColor: `${dangerColor}10` }]}>
              <Ionicons name="alert-circle" size={18} color={dangerColor} />
              <ThemedText style={[styles.errorText, { color: dangerColor }]}>
                {error}
              </ThemedText>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <PressableScale
              onPress={isConnecting ? undefined : handleClose}
              style={[styles.cancelButton, { borderColor }, isConnecting && styles.buttonDisabled]}
            >
              <ThemedText style={[styles.cancelButtonText, { color: mutedColor }]}>
                Cancel
              </ThemedText>
            </PressableScale>

            <PressableScale
              onPress={isConnecting ? undefined : handleConnect}
              style={[
                styles.connectButton,
                { backgroundColor: '#f59e0b' },
                isConnecting && styles.buttonDisabled,
              ]}
            >
              {isConnecting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Ionicons name="link" size={18} color="#000" />
                  <ThemedText style={styles.connectButtonText}>Connect</ThemedText>
                </>
              )}
            </PressableScale>
          </View>

          {/* Info Note */}
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={14} color={mutedColor} />
            <ThemedText style={[styles.infoNoteText, { color: mutedColor }]}>
              This will open Seed Vault to authorize DisCard
            </ThemedText>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  featuresContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureInfo: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  featureDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  featureDivider: {
    height: 1,
    marginVertical: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  toggle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  connectButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  connectButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  infoNoteText: {
    fontSize: 12,
  },
});
