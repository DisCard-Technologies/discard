import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Keyboard, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { colors } from '../../lib/utils';

interface CommandBarProps {
  onSubmit?: (command: string) => void;
  placeholder?: string;
}

export function CommandBar({ 
  onSubmit, 
  placeholder = "What would you like to do?" 
}: CommandBarProps) {
  const [command, setCommand] = useState('');

  const handleSubmit = () => {
    if (command.trim()) {
      onSubmit?.(command.trim());
      setCommand('');
      Keyboard.dismiss();
      // For now, show an alert since we don't have the intent system fully wired
      Alert.alert('Command Received', `Processing: "${command.trim()}"`);
    }
  };

  return (
    <View className="px-4 pb-4">
      <GlassCard className="flex-row items-center">
        <TouchableOpacity className="p-2">
          <Ionicons name="camera-outline" size={24} color={colors.muted} />
        </TouchableOpacity>

        <TextInput
          value={command}
          onChangeText={setCommand}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          className="flex-1 text-foreground px-2 text-base"
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
        />

        <TouchableOpacity className="p-2">
          <Ionicons name="mic-outline" size={24} color={colors.muted} />
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={handleSubmit}
          className="w-10 h-10 rounded-full bg-primary items-center justify-center ml-2"
        >
          <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
}

