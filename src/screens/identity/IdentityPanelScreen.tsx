import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AmbientBackground,
  GlassCard,
  StatusDot,
  CommandBar,
} from '../../components/vision';
import { useAuth, useAuthOperations } from '../../stores/authConvex';

// Mock data
const credentials = [
  { name: 'Proof of Humanity', issuer: 'WorldID', verified: true, icon: 'finger-print' },
  { name: 'KYC Verification', issuer: 'Verified Inc.', verified: true, icon: 'shield-checkmark' },
  { name: 'Credit Score', issuer: 'On-Chain Credit', verified: true, icon: 'checkmark-circle' },
  { name: 'ENS Domain', issuer: 'Ethereum', verified: true, icon: 'globe' },
];

const connectedApps = [
  { name: 'Uniswap', permissions: ['Read balance', 'Execute swaps'], lastUsed: '2h ago' },
];

const colors = {
  primary: '#10B981',
  accent: '#10B981',
  foreground: '#FFFFFF',
  muted: '#6B7280',
  surface: 'rgba(255, 255, 255, 0.05)',
  destructive: '#EF4444',
};

export default function IdentityPanelScreen() {
  const auth = useAuth();
  const { logout } = useAuthOperations();
  const [showQR, setShowQR] = useState(false);

  const walletAddress = '0x8f3 ... 7d4e';
  const username = 'alex.sovereign';

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: async () => {
            await logout();
          }
        },
      ]
    );
  };

  const handleCopy = () => {
    Alert.alert('Copied', 'Address copied to clipboard');
  };

  return (
    <AmbientBackground>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Identity Card */}
          <View style={styles.section}>
            <GlassCard>
              {/* Ambient gradient overlay */}
              <View style={styles.gradientOverlay}>
                <LinearGradient
                  colors={[colors.primary, 'transparent']}
                  style={styles.gradientCircle}
                />
              </View>

              <View style={styles.cardContent}>
                {/* Header Row */}
                <View style={styles.headerRow}>
                  <View style={styles.profileRow}>
                    {/* Avatar */}
                    <View style={styles.avatar}>
                      <Ionicons name="finger-print" size={28} color={colors.primary} />
                    </View>
                    {/* Name */}
                    <View>
                      <Text style={styles.username}>{username}</Text>
                      <Text style={styles.subtitle}>Self-Sovereign Identity</Text>
                    </View>
                  </View>
                  {/* QR Button */}
                  <TouchableOpacity 
                    onPress={() => setShowQR(!showQR)}
                    style={styles.qrButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="qr-code" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                </View>

                {showQR ? (
                  <View style={styles.qrContainer}>
                    <View style={styles.qrOuter}>
                      <View style={styles.qrInner}>
                        <Ionicons name="qr-code" size={80} color={colors.foreground} />
                      </View>
                    </View>
                    <Text style={styles.qrText}>Scan to verify identity</Text>
                  </View>
                ) : (
                  <>
                    {/* Badges */}
                    <View style={styles.badgeRow}>
                      <View style={[styles.badge, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                        <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
                        <Text style={[styles.badgeText, { color: colors.primary }]}>Self-Custody</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.4)' }]}>
                        <Ionicons name="key" size={12} color={colors.accent} />
                        <Text style={[styles.badgeText, { color: colors.accent }]}>ZK-Verified</Text>
                      </View>
                    </View>

                    {/* Wallet Address */}
                    <View style={styles.addressRow}>
                      <Text style={styles.addressText}>{walletAddress}</Text>
                      <TouchableOpacity onPress={handleCopy} style={styles.iconButton}>
                        <Ionicons name="copy-outline" size={16} color={colors.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconButton}>
                        <Ionicons name="open-outline" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </GlassCard>
          </View>

          {/* Privacy Status Card */}
          <View style={styles.section}>
            <GlassCard style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
              <View style={styles.privacyRow}>
                <View style={styles.privacyIcon}>
                  <Ionicons name="lock-closed" size={20} color={colors.primary} />
                </View>
                <View style={styles.privacyContent}>
                  <Text style={styles.privacyTitle}>Cryptographic Isolation</Text>
                  <Text style={styles.privacySubtitle}>Card context isolated by default</Text>
                </View>
                <StatusDot />
              </View>
            </GlassCard>
          </View>

          {/* Verifiable Credentials */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>VERIFIABLE CREDENTIALS</Text>
            <View style={styles.credentialsList}>
              {credentials.map((cred, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.credentialItem}
                  activeOpacity={0.7}
                >
                  <View style={styles.credentialIcon}>
                    <Ionicons name={cred.icon as any} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.credentialContent}>
                    <Text style={styles.credentialName}>{cred.name}</Text>
                    <Text style={styles.credentialIssuer}>by {cred.issuer}</Text>
                  </View>
                  {cred.verified && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark" size={12} color={colors.primary} />
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Connected Apps */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>CONNECTED APPS</Text>
              <TouchableOpacity>
                <Text style={styles.manageLink}>Manage</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.appsList}>
              {connectedApps.map((app, index) => (
                <GlassCard key={index}>
                  <View style={styles.appHeader}>
                    <Text style={styles.appName}>{app.name}</Text>
                    <Text style={styles.appLastUsed}>{app.lastUsed}</Text>
                  </View>
                  <View style={styles.permissionsRow}>
                    {app.permissions.map((perm, j) => (
                      <View key={j} style={styles.permissionBadge}>
                        <Text style={styles.permissionText}>{perm}</Text>
                      </View>
                    ))}
                  </View>
                </GlassCard>
              ))}
            </View>
          </View>

          {/* Bottom spacing */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Command Bar */}
        <CommandBar placeholder="What would you like to do?" />
      </SafeAreaView>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 128,
    height: 128,
    opacity: 0.2,
  },
  gradientCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 64,
  },
  cardContent: {
    position: 'relative',
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  username: {
    fontSize: 18,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  qrButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  qrContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  qrOuter: {
    width: 160,
    height: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  qrInner: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrText: {
    fontSize: 12,
    color: '#6B7280',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 6,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  iconButton: {
    marginLeft: 8,
    padding: 4,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  privacyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  privacyContent: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  privacySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    color: '#6B7280',
    letterSpacing: 2,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  manageLink: {
    fontSize: 12,
    color: '#10B981',
  },
  credentialsList: {
    gap: 4,
  },
  credentialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  credentialIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  credentialContent: {
    flex: 1,
  },
  credentialName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  credentialIssuer: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  verifiedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  appsList: {
    gap: 8,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  appName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  appLastUsed: {
    fontSize: 10,
    color: '#6B7280',
  },
  permissionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  permissionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  permissionText: {
    fontSize: 10,
    color: '#6B7280',
  },
});
