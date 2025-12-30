import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

interface TopBarProps {
  walletAddress: string;
  onIdentityTap: () => void;
  onHistoryTap: () => void;
  onSettingsTap: () => void;
}

export function TopBar({ walletAddress, onIdentityTap, onHistoryTap, onSettingsTap }: TopBarProps) {
  const [copied, setCopied] = useState(false);

  const truncatedAddress = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

  const handleCopyAddress = async () => {
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View className="flex-row items-center justify-between px-4 py-3 pt-2">
      {/* Left side: Fingerprint + Wallet Address Pill */}
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={onIdentityTap}
          className="relative w-11 h-11 rounded-full items-center justify-center"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
            shadowColor: '#2DD4BF',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 15,
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="finger-print" size={20} color="#10B981" />
          {/* Ambient glow ring */}
          <View 
            className="absolute inset-0 rounded-full"
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
            }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleCopyAddress}
          className="flex-row items-center gap-2 px-4 py-2 rounded-full"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
            minHeight: 44,
          }}
          activeOpacity={0.7}
        >
          <Text className="text-sm font-mono text-foreground/70">
            {truncatedAddress}
          </Text>
          {copied ? (
            <Ionicons name="checkmark" size={16} color="#10B981" />
          ) : (
            <Ionicons name="copy-outline" size={16} color="rgba(255, 255, 255, 0.4)" />
          )}
        </TouchableOpacity>
      </View>

      {/* Right side: History + Settings */}
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={onHistoryTap}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="time-outline" size={20} color="#8B9299" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSettingsTap}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={20} color="#8B9299" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

