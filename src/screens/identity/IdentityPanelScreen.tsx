import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
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
import { useWallets } from '../../stores/walletsConvex';
import { colors, truncateAddress } from '../../lib/utils';

// Mock data
const credentials = [
  { name: 'Proof of Humanity', issuer: 'WorldID', verified: true, icon: 'finger-print' },
  { name: 'KYC Verification', issuer: 'Verified Inc.', verified: true, icon: 'shield-checkmark' },
  { name: 'Credit Score', issuer: 'On-Chain Credit', verified: true, icon: 'checkmark-circle' },
  { name: 'ENS Domain', issuer: 'Ethereum', verified: true, icon: 'globe' },
];

const connectedApps = [
  { name: 'Uniswap', permissions: ['Read balance', 'Execute swaps'], lastUsed: '2h ago' },
  { name: 'Aave', permissions: ['Read balance', 'Lending'], lastUsed: '1d ago' },
];

export default function IdentityPanelScreen() {
  const auth = useAuth();
  const { logout } = useAuthOperations();
  const [showQR, setShowQR] = useState(false);

  const walletAddress = '0x8f3...7d4e';
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
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* Identity Card */}
          <View className="px-6 pt-12 pb-6">
            <GlassCard className="relative overflow-hidden">
              {/* Ambient gradient */}
              <View className="absolute top-0 right-0 w-32 h-32 opacity-20">
                <LinearGradient
                  colors={[colors.primary, 'transparent']}
                  className="w-full h-full rounded-full"
                />
              </View>

              <View className="relative z-10">
                <View className="flex-row items-start justify-between mb-6">
                  <View className="flex-row items-center">
                    <View className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 items-center justify-center mr-4">
                      <Ionicons name="finger-print" size={28} color={colors.primary} />
                    </View>
                    <View>
                      <Text className="text-lg font-medium text-foreground">{username}</Text>
                      <Text className="text-xs text-muted-foreground">Self-Sovereign Identity</Text>
                    </View>
                  </View>
                  <TouchableOpacity 
                    onPress={() => setShowQR(!showQR)}
                    className="p-2 rounded-xl bg-surface/30"
                    activeOpacity={0.7}
                  >
                    <Ionicons name="qr-code" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                </View>

                {showQR ? (
                  <View className="items-center py-4">
                    <View className="w-40 h-40 bg-foreground rounded-2xl p-3 mb-3">
                      <View className="w-full h-full bg-background rounded-lg items-center justify-center">
                        <Ionicons name="qr-code" size={80} color={colors.foreground} />
                      </View>
                    </View>
                    <Text className="text-xs text-muted-foreground">Scan to verify identity</Text>
                  </View>
                ) : (
                  <>
                    <View className="flex-row items-center mb-4 flex-wrap gap-2">
                      <View className="flex-row items-center px-3 py-1.5 rounded-full bg-primary/20">
                        <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
                        <Text className="text-xs font-medium text-primary ml-1.5">Self-Custody</Text>
                      </View>
                      <View className="flex-row items-center px-3 py-1.5 rounded-full bg-accent/20">
                        <Ionicons name="key" size={12} color={colors.accent} />
                        <Text className="text-xs font-medium text-accent ml-1.5">ZK-Verified</Text>
                      </View>
                    </View>

                    <View className="flex-row items-center">
                      <Text className="text-sm text-muted-foreground font-mono">{walletAddress}</Text>
                      <TouchableOpacity onPress={handleCopy} className="ml-2">
                        <Ionicons name="copy-outline" size={16} color={colors.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity className="ml-2">
                        <Ionicons name="open-outline" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </GlassCard>
          </View>

          {/* Privacy Status */}
          <View className="px-6 pb-6">
            <GlassCard className="border-primary/20">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
                  <Ionicons name="lock-closed" size={20} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-medium text-sm text-foreground">Cryptographic Isolation</Text>
                  <Text className="text-xs text-muted-foreground">Card context isolated by default</Text>
                </View>
                <StatusDot />
              </View>
            </GlassCard>
          </View>

          {/* Verifiable Credentials */}
          <View className="px-6 pb-6">
            <Text className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
              Verifiable Credentials
            </Text>
            <View className="gap-1">
              {credentials.map((cred, index) => (
                <TouchableOpacity
                  key={index}
                  className="flex-row items-center p-3 rounded-xl bg-surface/20 active:bg-surface/40"
                  activeOpacity={0.7}
                >
                  <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center mr-3">
                    <Ionicons name={cred.icon as any} size={20} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-medium text-sm text-foreground">{cred.name}</Text>
                    <Text className="text-[10px] text-muted-foreground">by {cred.issuer}</Text>
                  </View>
                  {cred.verified && (
                    <View className="w-5 h-5 rounded-full bg-primary/20 items-center justify-center mr-2">
                      <Ionicons name="checkmark" size={12} color={colors.primary} />
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Connected Apps */}
          <View className="px-6 pb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs text-muted-foreground uppercase tracking-widest">
                Connected Apps
              </Text>
              <TouchableOpacity>
                <Text className="text-xs text-primary">Manage</Text>
              </TouchableOpacity>
            </View>
            <View className="gap-2">
              {connectedApps.map((app, index) => (
                <GlassCard key={index}>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="font-medium text-sm text-foreground">{app.name}</Text>
                    <Text className="text-[10px] text-muted-foreground">{app.lastUsed}</Text>
                  </View>
                  <View className="flex-row flex-wrap gap-1">
                    {app.permissions.map((perm, j) => (
                      <View key={j} className="px-2 py-0.5 rounded-md bg-surface/40">
                        <Text className="text-[10px] text-muted-foreground">{perm}</Text>
                      </View>
                    ))}
                  </View>
                </GlassCard>
              ))}
            </View>
          </View>

          {/* Logout */}
          <View className="px-6 pb-6">
            <TouchableOpacity
              onPress={handleLogout}
              className="py-4 rounded-2xl bg-destructive/20 border border-destructive/30 items-center justify-center flex-row"
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
              <Text className="text-base font-medium text-destructive ml-2">Logout</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Command Bar */}
        <CommandBar placeholder="What would you like to do?" />
      </SafeAreaView>
    </AmbientBackground>
  );
}

