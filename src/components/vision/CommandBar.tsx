import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Keyboard, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
      Alert.alert('Command Received', `Processing: "${command.trim()}"`);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="camera-outline" size={22} color="#6B7280" />
        </TouchableOpacity>

        <TextInput
          value={command}
          onChangeText={setCommand}
          placeholder={placeholder}
          placeholderTextColor="#6B7280"
          style={styles.textInput}
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
        />

        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="mic-outline" size={22} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSubmit} style={styles.sendButton}>
          <Ionicons name="send" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(31, 41, 55, 0.6)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.5)',
    paddingHorizontal: 4,
    paddingVertical: 4,
    // Glassmorphism shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  iconButton: {
    padding: 10,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});

