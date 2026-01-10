/**
 * DisCard 2035 - ProfileField Component
 *
 * Editable profile field with:
 * - Icon + label + value display
 * - Inline edit mode or tap to action
 * - Verified badge support
 * - Loading state
 */

import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";

// ============================================================================
// Types
// ============================================================================

export interface ProfileFieldProps {
  /** Ionicons name */
  icon: keyof typeof Ionicons.glyphMap;
  /** Field label */
  label: string;
  /** Current value */
  value?: string | null;
  /** Placeholder when no value */
  placeholder: string;
  /** Whether the field is verified (shows checkmark) */
  verified?: boolean;
  /** Keyboard type for inline editing */
  keyboardType?: "default" | "email-address" | "phone-pad";
  /** If true, show inline edit. If false, tap triggers onPress */
  inlineEdit?: boolean;
  /** Called when value is saved (for inline edit mode) */
  onSave?: (value: string) => Promise<void>;
  /** Called when field is tapped (for non-inline edit mode) */
  onPress?: () => void;
  /** Whether the field is currently loading */
  isLoading?: boolean;
  /** Disable the field */
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ProfileField({
  icon,
  label,
  value,
  placeholder,
  verified,
  keyboardType = "default",
  inlineEdit = false,
  onSave,
  onPress,
  isLoading = false,
  disabled = false,
}: ProfileFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const cardBg = useThemeColor(
    { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.06)" },
    "background"
  );
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.08)", dark: "rgba(255,255,255,0.1)" },
    "background"
  );
  const successColor = "#4CAF50";
  const errorColor = "#F44336";
  const textColor = useThemeColor({}, "text");

  // Handle tap
  const handlePress = useCallback(() => {
    if (disabled || isLoading) return;

    if (inlineEdit) {
      setEditValue(value || "");
      setIsEditing(true);
      setError(null);
    } else if (onPress) {
      onPress();
    }
  }, [disabled, isLoading, inlineEdit, value, onPress]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!onSave || !editValue.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      await onSave(editValue.trim());
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [editValue, onSave]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValue(value || "");
    setError(null);
  }, [value]);

  const hasValue = !!value;
  const showLoading = isLoading || isSaving;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || isEditing}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: cardBg, borderColor },
        pressed && !isEditing && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: `${primaryColor}15` }]}>
        <Ionicons name={icon} size={18} color={primaryColor} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <ThemedText style={[styles.label, { color: mutedColor }]}>
          {label}
        </ThemedText>

        {isEditing ? (
          <Animated.View entering={FadeIn.duration(150)} style={styles.editContainer}>
            <TextInput
              value={editValue}
              onChangeText={setEditValue}
              placeholder={placeholder}
              placeholderTextColor={mutedColor}
              keyboardType={keyboardType}
              autoFocus
              style={[styles.input, { borderColor: primaryColor, color: textColor }]}
              autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
              autoCorrect={false}
            />
            {error && (
              <ThemedText style={[styles.error, { color: errorColor }]}>
                {error}
              </ThemedText>
            )}
          </Animated.View>
        ) : (
          <ThemedText
            style={[
              styles.value,
              !hasValue && { color: mutedColor, fontStyle: "italic" },
            ]}
            numberOfLines={1}
          >
            {hasValue ? value : placeholder}
          </ThemedText>
        )}
      </View>

      {/* Right side: verified badge, loading, edit controls, or chevron */}
      <View style={styles.rightContainer}>
        {showLoading ? (
          <ActivityIndicator size="small" color={primaryColor} />
        ) : isEditing ? (
          <View style={styles.editActions}>
            <Pressable
              onPress={handleCancel}
              style={[styles.editButton, { borderColor: mutedColor }]}
            >
              <Ionicons name="close" size={16} color={mutedColor} />
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!editValue.trim()}
              style={[
                styles.editButton,
                styles.saveButton,
                { backgroundColor: primaryColor },
                !editValue.trim() && styles.disabled,
              ]}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <>
            {verified && (
              <View style={[styles.verifiedBadge, { backgroundColor: `${successColor}20` }]}>
                <Ionicons name="checkmark-circle" size={14} color={successColor} />
              </View>
            )}
            {!inlineEdit && onPress && (
              <Ionicons name="chevron-forward" size={18} color={mutedColor} />
            )}
            {inlineEdit && (
              <Ionicons name="pencil" size={16} color={mutedColor} />
            )}
          </>
        )}
      </View>
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 15,
    fontWeight: "500",
  },
  editContainer: {
    gap: 4,
  },
  input: {
    fontSize: 15,
    fontWeight: "500",
    padding: 8,
    borderWidth: 1.5,
    borderRadius: 8,
    marginTop: 4,
  },
  error: {
    fontSize: 11,
    marginTop: 2,
  },
  rightContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  verifiedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  editActions: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  saveButton: {
    borderWidth: 0,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
});

export default ProfileField;
