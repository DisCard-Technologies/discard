import { useState, useMemo, useCallback, useEffect } from 'react';
import { StyleSheet, View, ScrollView, ActivityIndicator } from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth, useAuthOperations } from '@/stores/authConvex';
import { ProfileField, PhoneVerificationModal, AvatarPicker } from '@/components/identity';
import { usePrivateIdentity } from '@/hooks/usePrivateIdentity';
import type { ZkProofType } from '@/services/privateIdentityClient';

const credentials = [
  { name: 'Proof of Humanity', issuer: 'WorldID', verified: true, icon: 'finger-print' as const },
  { name: 'KYC Verification', issuer: 'Verified Inc.', verified: true, icon: 'shield-checkmark' as const },
  { name: 'Credit Score', issuer: 'On-Chain Credit', verified: true, icon: 'checkmark-circle' as const },
  { name: 'ENS Domain', issuer: 'Ethereum', verified: true, icon: 'globe' as const },
];

const connectedApps = [
  { name: 'Uniswap', permissions: ['Read balance', 'Execute swaps'], lastUsed: '2h ago' },
  { name: 'Aave', permissions: ['Read balance', 'Lending'], lastUsed: '1d ago' },
];

export default function IdentityScreen() {
  const insets = useSafeAreaInsets();
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [selectedProofType, setSelectedProofType] = useState<ZkProofType | null>(null);
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);

  const primaryColor = useThemeColor({}, 'tint');

  // Mock private key for demo (in production, comes from Turnkey)
  const mockPrivateKey = useMemo(() => new Uint8Array(32), []);

  // Private identity hook for encrypted vault and ZK proofs
  const {
    state: identityState,
    isLoading: identityLoading,
    credentials: storedCredentials,
    recentProofs,
    availableProofTypes,
    quickProof,
    canProve,
    formatProofType,
    getCredentialStatusColor,
    isAvailable: isPrivateIdentityAvailable } = usePrivateIdentity(mockPrivateKey);
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.03)', dark: 'rgba(255,255,255,0.06)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.06)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const accentColor = '#a855f7'; // purple accent

  // Real data from auth
  const { user, userId } = useAuth();
  const { checkAuthStatus } = useAuthOperations();
  const fullAddress = user?.solanaAddress || '0x8f3A2B4C5D6E7F8901234567890ABCDEF7d4e';
  const walletAddress = fullAddress.length > 10 ? `${fullAddress.slice(0, 6)}...${fullAddress.slice(-4)}` : fullAddress;
  const displayName = user?.displayName || 'anonymous.user';

  // Profile mutations
  const updateProfileMutation = useMutation(api.auth.passkeys.updateProfile);

  // Handle profile field updates
  const handleUpdateDisplayName = useCallback(async (name: string) => {
    if (!userId) return;
    await updateProfileMutation({ userId, displayName: name });
    await checkAuthStatus();
  }, [updateProfileMutation, userId, checkAuthStatus]);

  const handleUpdateEmail = useCallback(async (email: string) => {
    if (!userId) return;
    await updateProfileMutation({ userId, email });
    await checkAuthStatus();
  }, [updateProfileMutation, userId, checkAuthStatus]);

  const handleUpdateUsername = useCallback(async (username: string) => {
    if (!userId) return;
    await updateProfileMutation({ userId, username });
    await checkAuthStatus();
  }, [updateProfileMutation, userId, checkAuthStatus]);

  const handleAvatarUpdated = useCallback(async () => {
    await checkAuthStatus();
  }, [checkAuthStatus]);

  // Format phone number for display
  const formatPhoneNumber = (phone: string): string => {
    if (phone.startsWith('+1') && phone.length === 12) {
      return `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`;
    }
    return phone;
  };

  const handleCopyAddress = async () => {
    await Clipboard.setStringAsync(fullAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle generating a ZK proof
  const handleGenerateProof = useCallback(async (proofType: ZkProofType) => {
    setIsGeneratingProof(true);
    setSelectedProofType(proofType);

    try {
      const proof = await quickProof(proofType, {}, {
        purpose: 'Identity verification',
        verifier: 'DisCard App' });

      if (proof) {
        console.log('[Identity] ZK proof generated:', {
          id: proof.id,
          claim: proof.publicInputs.claim });
      }
    } catch (error) {
      console.error('[Identity] Proof generation failed:', error);
    }

    setIsGeneratingProof(false);
    setSelectedProofType(null);
  }, [quickProof]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={{ height: insets.top }} />

      {/* Header */}
      <View style={styles.header}>
        <PressableScale
          onPress={handleBack}
          style={[styles.backButton]}
        >
          <Ionicons name="chevron-back" size={24} color={mutedColor} />
        </PressableScale>
        <ThemedText style={styles.headerTitle}>Identity</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity Card */}
        <ThemedView
          style={[styles.identityCard, { backgroundColor: cardBg, borderColor }]}
          lightColor="rgba(0,0,0,0.03)"
          darkColor="rgba(255,255,255,0.06)"
        >
          {/* Decorative glow */}
          <View style={[styles.cardGlow, { backgroundColor: `${primaryColor}10` }]} />

          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={styles.cardAvatar}>
                <AvatarPicker
                  avatarUrl={user?.avatarUrl}
                  displayName={displayName}
                  size={56}
                  userId={userId}
                  onAvatarUpdated={handleAvatarUpdated}
                />
              </View>
              <View style={styles.cardInfo}>
                <ThemedText style={styles.identityName}>{displayName}</ThemedText>
                {user?.username ? (
                  <ThemedText style={[styles.identityUsername, { color: primaryColor }]}>
                    @{user.username}
                  </ThemedText>
                ) : (
                  <ThemedText style={[styles.identitySubtitle, { color: mutedColor }]}>
                    Self-Sovereign Identity
                  </ThemedText>
                )}
              </View>
              <PressableScale
                onPress={() => setShowQR(!showQR)}
                style={[
                  styles.qrButton,
                  { backgroundColor: cardBg, borderColor }]}
              >
                <Ionicons name="qr-code" size={20} color={mutedColor} />
              </PressableScale>
            </View>

            {showQR ? (
              <View style={styles.qrContainer}>
                <View style={styles.qrPlaceholder}>
                  <View style={styles.qrInner}>
                    <ThemedText style={[styles.qrText, { color: mutedColor }]}>QR Code</ThemedText>
                  </View>
                </View>
                <ThemedText style={[styles.qrHint, { color: mutedColor }]}>
                  Scan to verify identity
                </ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, { backgroundColor: `${primaryColor}20` }]}>
                    <Ionicons name="shield-checkmark" size={12} color={primaryColor} />
                    <ThemedText style={[styles.badgeText, { color: primaryColor }]}>
                      Self-Custody
                    </ThemedText>
                  </View>
                  <View style={[styles.badge, { backgroundColor: `${accentColor}20` }]}>
                    <Ionicons name="key" size={12} color={accentColor} />
                    <ThemedText style={[styles.badgeText, { color: accentColor }]}>
                      ZK-Verified
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.addressRow}>
                  <ThemedText style={[styles.addressText, { color: mutedColor }]}>
                    {walletAddress}
                  </ThemedText>
                  <PressableScale onPress={handleCopyAddress} style={styles.addressAction}>
                    <Ionicons
                      name={copied ? 'checkmark' : 'copy-outline'}
                      size={16}
                      color={copied ? primaryColor : mutedColor}
                    />
                  </PressableScale>
                  <PressableScale style={styles.addressAction}>
                    <Ionicons name="open-outline" size={16} color={mutedColor} />
                  </PressableScale>
                </View>
              </>
            )}
          </View>
        </ThemedView>

        {/* Profile Edit Section */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            PROFILE
          </ThemedText>

          <ProfileField
            icon="person"
            label="Display Name"
            value={user?.displayName}
            placeholder="Add a name"
            inlineEdit
            onSave={handleUpdateDisplayName}
          />

          <ProfileField
            icon="at"
            label="Username"
            value={user?.username}
            placeholder="Choose a username"
            inlineEdit
            onSave={handleUpdateUsername}
          />

          <ProfileField
            icon="mail"
            label="Email"
            value={user?.email}
            placeholder="Add email"
            keyboardType="email-address"
            inlineEdit
            onSave={handleUpdateEmail}
          />

          <ProfileField
            icon="call"
            label="Phone"
            value={user?.phoneNumber ? formatPhoneNumber(user.phoneNumber) : undefined}
            placeholder="Add phone for P2P"
            verified={!!user?.phoneNumber}
            onPress={() => setShowPhoneModal(true)}
          />
        </View>

        {/* Privacy by Default */}
        <ThemedView
          style={[styles.privacyCard, { backgroundColor: cardBg, borderColor: `${primaryColor}30` }]}
          lightColor="rgba(0,0,0,0.03)"
          darkColor="rgba(255,255,255,0.06)"
        >
          <View style={[styles.privacyIcon, { backgroundColor: `${primaryColor}10` }]}>
            <Ionicons name="lock-closed" size={20} color={primaryColor} />
          </View>
          <View style={styles.privacyText}>
            <ThemedText style={styles.privacyTitle}>Cryptographic Isolation</ThemedText>
            <ThemedText style={[styles.privacySubtitle, { color: mutedColor }]}>
              Card context isolated by default
            </ThemedText>
          </View>
          <View style={[styles.pulseDot, { backgroundColor: primaryColor }]} />
        </ThemedView>

        {/* ZK Proofs Section */}
        {isPrivateIdentityAvailable && (
          <View style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
              ZERO-KNOWLEDGE PROOFS
            </ThemedText>
            <ThemedText style={[styles.sectionDesc, { color: mutedColor }]}>
              Prove claims without revealing data
            </ThemedText>

            <View style={styles.proofGrid}>
              {(['age_minimum', 'kyc_level', 'aml_cleared', 'sanctions_cleared'] as ZkProofType[]).map((proofType) => {
                const isAvailable = canProve(proofType);
                const isLoading = isGeneratingProof && selectedProofType === proofType;

                return (
                  <PressableScale
                    key={proofType}
                    onPress={() => isAvailable && handleGenerateProof(proofType)}
                    enabled={isAvailable && !isGeneratingProof}
                    style={[
                      styles.proofButton,
                      {
                        backgroundColor: isAvailable ? 'rgba(34,197,94,0.1)' : cardBg,
                        borderColor: isAvailable ? 'rgba(34,197,94,0.3)' : borderColor,
                        opacity: !isAvailable ? 0.5 : 1 }]}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#22c55e" />
                    ) : (
                      <Ionicons
                        name={isAvailable ? 'shield-checkmark' : 'shield-outline'}
                        size={20}
                        color={isAvailable ? '#22c55e' : mutedColor}
                      />
                    )}
                    <ThemedText style={[
                      styles.proofButtonText,
                      { color: isAvailable ? '#22c55e' : mutedColor }
                    ]}>
                      {formatProofType(proofType)}
                    </ThemedText>
                  </PressableScale>
                );
              })}
            </View>

            {/* Recent Proofs */}
            {recentProofs.length > 0 && (
              <View style={[styles.recentProofsCard, { backgroundColor: cardBg, borderColor }]}>
                <ThemedText style={[styles.recentProofsTitle, { color: mutedColor }]}>
                  Recent Proofs
                </ThemedText>
                {recentProofs.slice(0, 3).map((proof, i) => (
                  <View key={proof.id} style={styles.recentProofItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                    <ThemedText style={styles.recentProofText}>
                      {proof.publicInputs.claim}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Verifiable Credentials */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            VERIFIABLE CREDENTIALS
          </ThemedText>
          {credentials.map((cred, i) => (
            <PressableScale
              key={i}
              style={[
                styles.credentialItem,
                { backgroundColor: cardBg, borderColor }]}
            >
              <View style={styles.credentialLeft}>
                <View style={[styles.credentialIcon, { backgroundColor: `${primaryColor}10` }]}>
                  <Ionicons name={cred.icon} size={18} color={primaryColor} />
                </View>
                <View>
                  <ThemedText style={styles.credentialName}>{cred.name}</ThemedText>
                  <ThemedText style={[styles.credentialIssuer, { color: mutedColor }]}>
                    by {cred.issuer}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.credentialRight}>
                {cred.verified && (
                  <View style={[styles.verifiedBadge, { backgroundColor: `${primaryColor}20` }]}>
                    <Ionicons name="checkmark" size={12} color={primaryColor} />
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={mutedColor} />
              </View>
            </PressableScale>
          ))}
        </View>

        {/* Connected Apps */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
              CONNECTED APPS
            </ThemedText>
            <PressableScale>
              <ThemedText style={[styles.manageLink, { color: primaryColor }]}>Manage</ThemedText>
            </PressableScale>
          </View>
          {connectedApps.map((app, i) => (
            <ThemedView
              key={i}
              style={[styles.appItem, { backgroundColor: cardBg, borderColor }]}
              lightColor="rgba(0,0,0,0.03)"
              darkColor="rgba(255,255,255,0.06)"
            >
              <View style={styles.appHeader}>
                <ThemedText style={styles.appName}>{app.name}</ThemedText>
                <ThemedText style={[styles.appTime, { color: mutedColor }]}>{app.lastUsed}</ThemedText>
              </View>
              <View style={styles.permissionRow}>
                {app.permissions.map((perm, j) => (
                  <View key={j} style={[styles.permissionBadge, { backgroundColor: borderColor }]}>
                    <ThemedText style={[styles.permissionText, { color: mutedColor }]}>
                      {perm}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </ThemedView>
          ))}
        </View>
      </ScrollView>

      {/* Phone Verification Modal */}
      <PhoneVerificationModal
        visible={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        onSuccess={() => checkAuthStatus()}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)' },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center' },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600' },
  headerSpacer: {
    width: 40 },
  scrollView: {
    flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16 },
  identityCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    overflow: 'hidden' },
  cardGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 120,
    height: 120,
    borderRadius: 60 },
  cardContent: {
    position: 'relative',
    zIndex: 1 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16 },
  cardAvatar: {
    marginRight: 12 },
  avatarGradient: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center' },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 4 },
  identityName: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 2 },
  identitySubtitle: {
    fontSize: 12 },
  identityUsername: {
    fontSize: 14,
    fontWeight: '500' },
  qrButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1 },
  qrContainer: {
    alignItems: 'center',
    paddingVertical: 16 },
  qrPlaceholder: {
    width: 160,
    height: 160,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12 },
  qrInner: {
    flex: 1,
    backgroundColor: '#f4f4f5',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center' },
  qrText: {
    fontSize: 12 },
  qrHint: {
    fontSize: 12 },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20 },
  badgeText: {
    fontSize: 12,
    fontWeight: '500' },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 },
  addressText: {
    fontSize: 14,
    fontFamily: 'monospace' },
  addressAction: {
    padding: 4 },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12 },
  privacyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center' },
  privacyText: {
    flex: 1 },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2 },
  privacySubtitle: {
    fontSize: 12 },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4 },
  section: {
    gap: 10 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  sectionTitle: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '500' },
  manageLink: {
    fontSize: 12,
    fontWeight: '500' },
  credentialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1 },
  credentialLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12 },
  credentialIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center' },
  credentialName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2 },
  credentialIssuer: {
    fontSize: 10 },
  credentialRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 },
  verifiedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center' },
  appItem: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1 },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8 },
  appName: {
    fontSize: 14,
    fontWeight: '500' },
  appTime: {
    fontSize: 10 },
  permissionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6 },
  permissionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6 },
  permissionText: {
    fontSize: 10 },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }] },
  sectionDesc: {
    fontSize: 12,
    marginBottom: 12 },
  proofGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8 },
  proofButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1 },
  proofButtonText: {
    fontSize: 13,
    fontWeight: '500' },
  recentProofsCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10 },
  recentProofsTitle: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 4 },
  recentProofItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 },
  recentProofText: {
    fontSize: 13 } });

