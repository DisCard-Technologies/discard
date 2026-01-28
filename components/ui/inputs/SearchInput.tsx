import React from 'react';
import { StyleSheet, View, TextInput, TextInputProps, ViewStyle, TextStyle } from 'react-native';
import { PressableOpacity } from 'pressto';
import { Ionicons } from '@expo/vector-icons';

import { useThemeColor } from '@/hooks/use-theme-color';

export interface SearchInputProps extends Omit<TextInputProps, 'style'> {
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
}

export const SearchInput = React.memo(function SearchInput({
  value,
  onChangeText,
  onClear,
  placeholder = 'Search...',
  containerStyle,
  inputStyle,
  ...props
}: SearchInputProps) {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  const handleClear = () => {
    onChangeText('');
    onClear?.();
  };

  return (
    <View style={[styles.container, { backgroundColor: cardBg, borderColor }, containerStyle]}>
      <Ionicons name="search" size={18} color={mutedColor} style={styles.icon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={mutedColor}
        style={[styles.input, { color: textColor }, inputStyle]}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        {...props}
      />
      {value.length > 0 && (
        <PressableOpacity onPress={handleClear} style={styles.clearButton}>
          <Ionicons name="close-circle" size={18} color={mutedColor} />
        </PressableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  clearButton: {
    marginLeft: 8,
    padding: 2,
  },
});
