/**
 * DisCard 2035 - AvatarPicker Component
 *
 * Profile avatar picker with:
 * - Current avatar display or placeholder
 * - Image picker integration
 * - Upload to Convex storage
 * - Loading states
 */

import { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { PressableScale } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";

// Lazy load expo-image-picker to handle Expo Go where native module isn't available
let ImagePicker: typeof import("expo-image-picker") | null = null;
try {
  ImagePicker = require("expo-image-picker");
} catch (e) {
  console.log("[AvatarPicker] expo-image-picker not available (Expo Go)");
}
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";

// ============================================================================
// Types
// ============================================================================

export interface AvatarPickerProps {
  /** Current avatar URL */
  avatarUrl?: string | null;
  /** Display name for fallback initials */
  displayName?: string | null;
  /** Size of the avatar */
  size?: number;
  /** User ID for the mutation */
  userId?: Id<"users"> | null;
  /** Called when avatar is successfully updated */
  onAvatarUpdated?: (url: string) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function AvatarPicker({
  avatarUrl,
  displayName,
  size = 80,
  userId,
  onAvatarUpdated,
  disabled = false,
}: AvatarPickerProps) {
  const [isUploading, setIsUploading] = useState(false);

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const cardBg = useThemeColor(
    { light: "rgba(0,0,0,0.05)", dark: "rgba(255,255,255,0.08)" },
    "background"
  );

  // Convex mutations
  const generateUploadUrl = useMutation(api.auth.passkeys.generateAvatarUploadUrl);
  const saveAvatar = useMutation(api.auth.passkeys.saveAvatar);

  // Get initials from display name
  const getInitials = useCallback((name?: string | null): string => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, []);

  // Handle image selection and upload
  const handlePickImage = useCallback(async () => {
    if (disabled || isUploading) return;

    // Check if ImagePicker is available
    if (!ImagePicker) {
      Alert.alert(
        "Not Available",
        "Image picker is not available in Expo Go. Please use a development build to change your avatar."
      );
      return;
    }

    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please allow access to your photo library to change your avatar."
        );
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      setIsUploading(true);

      const asset = result.assets[0];

      // Get upload URL from Convex
      const uploadUrl = await generateUploadUrl();

      // Fetch the image and convert to blob
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      // Upload to Convex storage
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": asset.mimeType || "image/jpeg",
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image");
      }

      const { storageId } = await uploadResponse.json();

      // Save avatar and update user profile
      const newAvatarUrl = await saveAvatar({
        userId: userId || undefined,
        storageId,
      });

      onAvatarUpdated?.(newAvatarUrl);
    } catch (error) {
      console.error("[AvatarPicker] Error:", error);
      Alert.alert(
        "Upload Failed",
        "Failed to upload your avatar. Please try again."
      );
    } finally {
      setIsUploading(false);
    }
  }, [disabled, isUploading, generateUploadUrl, saveAvatar, userId, onAvatarUpdated]);

  const borderRadius = size / 2;

  return (
    <PressableScale
      onPress={handlePickImage}
      enabled={!disabled && !isUploading}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: avatarUrl ? "transparent" : cardBg,
        },
        disabled && styles.disabled,
      ]}
    >
      {/* Avatar Image or Placeholder */}
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={[styles.image, { width: size, height: size, borderRadius }]}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              width: size,
              height: size,
              borderRadius,
              backgroundColor: `${primaryColor}30`,
            },
          ]}
        >
          <ThemedText
            style={[
              styles.initials,
              { fontSize: size * 0.35, color: primaryColor },
            ]}
          >
            {getInitials(displayName)}
          </ThemedText>
        </View>
      )}

      {/* Loading Overlay */}
      {isUploading && (
        <View style={[styles.loadingOverlay, { borderRadius }]}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}

      {/* Edit Badge */}
      {!isUploading && !disabled && (
        <View
          style={[
            styles.editBadge,
            { backgroundColor: primaryColor },
          ]}
        >
          <Ionicons name="camera" size={14} color="#fff" />
        </View>
      )}
    </PressableScale>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "visible",
  },
  image: {
    resizeMode: "cover",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontWeight: "600",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  disabled: {
    opacity: 0.5,
  },
});

export default AvatarPicker;
