/**
 * DisCard 2035 - RecipientInput Component
 *
 * Universal search input for transfer recipients with:
 * - Auto-detection of input type (address / .sol domain)
 * - Real-time SNS resolution
 * - Contact suggestions
 * - QR scan button
 * - Validation states
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  ActivityIndicator,
  FlatList,
  Keyboard,
} from "react-native";
import { PressableScale } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useAddressResolver, type ResolvedAddress } from "@/hooks/useAddressResolver";
import { useContacts, type Contact } from "@/hooks/useContacts";
import { formatAddress } from "@/lib/transfer/address-resolver";

// ============================================================================
// Types
// ============================================================================

export interface RecipientInputProps {
  /** Current input value */
  value?: string;
  /** Callback when recipient is selected/resolved */
  onSelect: (resolved: ResolvedAddress, contact?: Contact) => void;
  /** Callback to open QR scanner */
  onScanQR?: () => void;
  /** Callback when user wants to invite via SMS */
  onInvite?: (phoneNumber: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Auto focus on mount */
  autoFocus?: boolean;
  /** Disable input */
  disabled?: boolean;
}

interface ContactItemProps {
  contact: Contact;
  onPress: () => void;
  onToggleFavorite?: () => void;
  showFavoriteStar?: boolean;
}

// ============================================================================
// Components
// ============================================================================

function ContactItem({ contact, onPress, onToggleFavorite, showFavoriteStar = false }: ContactItemProps) {
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const primaryColor = useThemeColor({}, "tint");

  return (
    <PressableScale
      onPress={onPress}
      style={styles.contactItem}
    >
      <View
        style={[styles.contactAvatar, { backgroundColor: contact.avatarColor }]}
      >
        <ThemedText style={styles.avatarText}>
          {contact.avatarInitials}
        </ThemedText>
      </View>
      <View style={styles.contactInfo}>
        <ThemedText style={styles.contactName} numberOfLines={1}>
          {contact.name}
        </ThemedText>
        <ThemedText
          style={[styles.contactAddress, { color: mutedColor }]}
          numberOfLines={1}
        >
          {contact.identifierType === "sol_name"
            ? contact.identifier
            : formatAddress(contact.resolvedAddress, 6)}
        </ThemedText>
      </View>
      {contact.verified && (
        <Ionicons name="checkmark-circle" size={16} color="#4CAF50" style={styles.verifiedIcon} />
      )}
      {showFavoriteStar && onToggleFavorite && (
        <PressableScale
          onPress={onToggleFavorite}
          style={styles.favoriteButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={contact.isFavorite ? "star" : "star-outline"}
            size={18}
            color={contact.isFavorite ? "#FFD700" : mutedColor}
          />
        </PressableScale>
      )}
    </PressableScale>
  );
}

function TypeBadge({
  type,
  isValid,
}: {
  type: "address" | "sol_name" | "phone" | "email" | "unknown";
  isValid: boolean;
}) {
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");
  const warningColor = useThemeColor({ light: "#FF9800", dark: "#FFB74D" }, "text");
  const infoColor = useThemeColor({ light: "#2196F3", dark: "#64B5F6" }, "text");

  if (type === "unknown") return null;

  const labels: Record<string, string> = {
    address: "Address valid",
    sol_name: ".sol detected",
    phone: "Phone detected",
    email: "Email detected",
  };

  const label = labels[type];
  // Phone and email show info color when valid format but not yet resolved
  const color = isValid ? successColor : (type === "phone" || type === "email") ? infoColor : warningColor;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      style={[styles.badge, { backgroundColor: `${color}20` }]}
    >
      <Ionicons
        name={isValid ? "checkmark-circle" : (type === "phone" || type === "email") ? "search" : "alert-circle"}
        size={12}
        color={color}
      />
      <ThemedText style={[styles.badgeText, { color }]}>{label}</ThemedText>
    </Animated.View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function RecipientInput({
  value,
  onSelect,
  onScanQR,
  onInvite,
  placeholder = "Address, .sol, phone, email, or contact",
  autoFocus = false,
  disabled = false,
}: RecipientInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.1)", dark: "rgba(255,255,255,0.15)" },
    "background"
  );
  const inputBg = useThemeColor({ light: "#ffffff", dark: "#1c1c1e" }, "background");
  const textColor = useThemeColor({}, "text");
  const errorColor = useThemeColor({ light: "#F44336", dark: "#EF5350" }, "text");

  // Address resolver
  const {
    input,
    setInput,
    type,
    isResolving,
    resolved,
    isValidFormat,
    error,
    clear,
  } = useAddressResolver({
    onResolved: (result) => {
      if (result.isValid) {
        // Check if it matches a contact
        const contact = getContactByAddress(result.address);
        onSelect(result, contact || undefined);
      }
    },
  });

  // Contacts
  const {
    recentContacts,
    favoriteContacts,
    searchContacts,
    getContactByAddress,
    toggleFavorite,
  } = useContacts();

  // Sync external value
  useEffect(() => {
    if (value !== undefined && value !== input) {
      setInput(value);
    }
  }, [value]);

  // Search contacts based on input
  const matchedContacts = input.trim()
    ? searchContacts(input).slice(0, 5)
    : [];

  // Show suggestions when focused and no valid resolution yet
  useEffect(() => {
    if (isFocused && !resolved?.isValid) {
      setShowSuggestions(true);
    } else if (resolved?.isValid) {
      setShowSuggestions(false);
    }
  }, [isFocused, resolved?.isValid]);

  // Handle contact selection
  const handleContactSelect = useCallback(
    (contact: Contact) => {
      setInput(contact.identifier);
      Keyboard.dismiss();

      // Create resolved address from contact
      const resolved: ResolvedAddress = {
        input: contact.identifier,
        type: contact.identifierType,
        address: contact.resolvedAddress,
        displayName: contact.name,
        isValid: true,
      };

      onSelect(resolved, contact);
      setShowSuggestions(false);
    },
    [setInput, onSelect]
  );

  // Handle focus
  const handleFocus = () => {
    setIsFocused(true);
    setShowSuggestions(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Delay hiding suggestions to allow tap
    setTimeout(() => setShowSuggestions(false), 200);
  };

  // Clear input
  const handleClear = () => {
    clear();
    inputRef.current?.focus();
  };

  // Animated border style
  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(isFocused ? primaryColor : borderColor, {
      duration: 150,
    }),
  }));

  // Handle favorite toggle
  const handleToggleFavorite = useCallback(
    (contactId: string) => {
      toggleFavorite(contactId);
    },
    [toggleFavorite]
  );

  // Determine what to show in suggestions
  const showFavoriteContacts =
    showSuggestions && !input.trim() && favoriteContacts.length > 0;
  const showRecentContacts =
    showSuggestions && !input.trim() && recentContacts.length > 0;
  const showMatchedContacts =
    showSuggestions && input.trim() && matchedContacts.length > 0;

  return (
    <View style={styles.container}>
      {/* Input Container */}
      <Animated.View
        style={[
          styles.inputContainer,
          { backgroundColor: inputBg },
          animatedBorderStyle,
        ]}
      >
        <Ionicons name="search" size={20} color={mutedColor} />

        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={setInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={mutedColor}
          style={[styles.input, { color: textColor }]}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          editable={!disabled}
        />

        {/* Loading indicator */}
        {isResolving && (
          <ActivityIndicator size="small" color={primaryColor} />
        )}

        {/* Clear button */}
        {input.length > 0 && !isResolving && (
          <PressableScale
            onPress={handleClear}
            style={styles.clearButton}
          >
            <Ionicons name="close-circle" size={20} color={mutedColor} />
          </PressableScale>
        )}

        {/* QR Scan button */}
        {onScanQR && (
          <PressableScale
            onPress={onScanQR}
            style={styles.scanButton}
          >
            <Ionicons name="qr-code-outline" size={22} color={primaryColor} />
          </PressableScale>
        )}
      </Animated.View>

      {/* Type Badge */}
      {input.trim() && type !== "unknown" && (
        <View style={styles.badgeContainer}>
          <TypeBadge type={type} isValid={isValidFormat} />
        </View>
      )}

      {/* Error Message */}
      {error && !resolved?.canInvite && (
        <Animated.View
          entering={FadeIn.duration(150)}
          style={styles.errorContainer}
        >
          <Ionicons name="alert-circle" size={14} color={errorColor} />
          <ThemedText style={[styles.errorText, { color: errorColor }]}>
            {error}
          </ThemedText>
        </Animated.View>
      )}

      {/* Invite Button - shown when phone number not found */}
      {resolved?.canInvite && resolved.type === "phone" && onInvite && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.inviteCard, { backgroundColor: inputBg, borderColor }]}
        >
          <View style={styles.inviteContent}>
            <Ionicons name="person-add-outline" size={20} color={mutedColor} />
            <View style={styles.inviteTextContainer}>
              <ThemedText style={styles.inviteTitle}>Not on DisCard</ThemedText>
              <ThemedText style={[styles.inviteSubtitle, { color: mutedColor }]}>
                Send an SMS invite to join
              </ThemedText>
            </View>
          </View>
          <PressableScale
            onPress={() => onInvite(input)}
            style={[
              styles.inviteButton,
              { backgroundColor: primaryColor },
            ]}
          >
            <Ionicons name="send" size={14} color="#fff" />
            <ThemedText style={styles.inviteButtonText}>Invite</ThemedText>
          </PressableScale>
        </Animated.View>
      )}

      {/* Email not found message */}
      {resolved?.canInvite === false && resolved.type === "email" && error && (
        <Animated.View
          entering={FadeIn.duration(150)}
          style={styles.errorContainer}
        >
          <Ionicons name="mail-outline" size={14} color={mutedColor} />
          <ThemedText style={[styles.errorText, { color: mutedColor }]}>
            Email not found on DisCard
          </ThemedText>
        </Animated.View>
      )}

      {/* Valid Address Card - for direct wallet addresses */}
      {resolved?.isValid && resolved.type === "address" && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.resolvedCard, { backgroundColor: inputBg, borderColor }]}
        >
          <View style={styles.addressCardContent}>
            <View style={styles.addressCardLeft}>
              <View style={styles.resolvedHeader}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <ThemedText style={styles.resolvedLabel}>Valid address</ThemedText>
              </View>
              <ThemedText style={[styles.resolvedAddress, { color: mutedColor }]}>
                {formatAddress(resolved.address, 8)}
              </ThemedText>
            </View>
            <PressableScale
              onPress={() => {
                Keyboard.dismiss();
                onSelect(resolved, undefined);
              }}
              style={[
                styles.useAddressButton,
                { backgroundColor: primaryColor },
              ]}
            >
              <ThemedText style={styles.useAddressButtonText}>Use</ThemedText>
            </PressableScale>
          </View>
        </Animated.View>
      )}

      {/* Resolved Address Display - for .sol domains */}
      {resolved?.isValid && resolved.type === "sol_name" && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.resolvedCard, { backgroundColor: inputBg, borderColor }]}
        >
          <View style={styles.addressCardContent}>
            <View style={styles.addressCardLeft}>
              <View style={styles.resolvedHeader}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <ThemedText style={styles.resolvedLabel}>Resolved to</ThemedText>
              </View>
              <ThemedText style={[styles.resolvedAddress, { color: mutedColor }]}>
                {formatAddress(resolved.address, 8)}
              </ThemedText>
            </View>
            <PressableScale
              onPress={() => {
                Keyboard.dismiss();
                onSelect(resolved, undefined);
              }}
              style={[
                styles.useAddressButton,
                { backgroundColor: primaryColor },
              ]}
            >
              <ThemedText style={styles.useAddressButtonText}>Use</ThemedText>
            </PressableScale>
          </View>
        </Animated.View>
      )}

      {/* Resolved User Display - for phone/email */}
      {resolved?.isValid && (resolved.type === "phone" || resolved.type === "email") && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.resolvedCard, { backgroundColor: inputBg, borderColor }]}
        >
          <View style={styles.addressCardContent}>
            <View style={styles.addressCardLeft}>
              <View style={styles.resolvedHeader}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <ThemedText style={styles.resolvedLabel}>
                  DisCard user found
                </ThemedText>
              </View>
              {resolved.displayName && (
                <ThemedText style={styles.resolvedUserName}>
                  {resolved.displayName}
                </ThemedText>
              )}
              <ThemedText style={[styles.resolvedAddress, { color: mutedColor }]}>
                {formatAddress(resolved.address, 6)}
              </ThemedText>
            </View>
            <PressableScale
              onPress={() => {
                Keyboard.dismiss();
                onSelect(resolved, undefined);
              }}
              style={[
                styles.useAddressButton,
                { backgroundColor: primaryColor },
              ]}
            >
              <ThemedText style={styles.useAddressButtonText}>Use</ThemedText>
            </PressableScale>
          </View>
        </Animated.View>
      )}

      {/* Suggestions Dropdown */}
      {(showFavoriteContacts || showRecentContacts || showMatchedContacts) && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={[
            styles.suggestionsCard,
            { backgroundColor: inputBg, borderColor },
          ]}
        >
          {showFavoriteContacts && (
            <>
              <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>
                FAVORITES
              </ThemedText>
              <FlatList
                data={favoriteContacts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <ContactItem
                    contact={item}
                    onPress={() => handleContactSelect(item)}
                    showFavoriteStar
                    onToggleFavorite={() => handleToggleFavorite(item.id)}
                  />
                )}
                scrollEnabled={false}
              />
            </>
          )}

          {showRecentContacts && (
            <>
              <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>
                RECENT
              </ThemedText>
              <FlatList
                data={recentContacts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <ContactItem
                    contact={item}
                    onPress={() => handleContactSelect(item)}
                    showFavoriteStar
                    onToggleFavorite={() => handleToggleFavorite(item.id)}
                  />
                )}
                scrollEnabled={false}
              />
            </>
          )}

          {showMatchedContacts && (
            <>
              <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>
                CONTACTS
              </ThemedText>
              <FlatList
                data={matchedContacts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <ContactItem
                    contact={item}
                    onPress={() => handleContactSelect(item)}
                    showFavoriteStar
                    onToggleFavorite={() => handleToggleFavorite(item.id)}
                  />
                )}
                scrollEnabled={false}
              />
            </>
          )}
        </Animated.View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1.5,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  clearButton: {
    padding: 4,
  },
  scanButton: {
    padding: 8,
    borderRadius: 8,
  },
  badgeContainer: {
    marginTop: 8,
    flexDirection: "row",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "500",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 13,
  },
  resolvedCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  addressCardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addressCardLeft: {
    flex: 1,
  },
  resolvedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  resolvedLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  resolvedUserName: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 4,
    marginBottom: 2,
  },
  resolvedAddress: {
    fontSize: 12,
    fontFamily: "monospace",
  },
  useAddressButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  useAddressButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  inviteCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inviteContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  inviteTextContainer: {
    flex: 1,
  },
  inviteTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  inviteSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  inviteButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  suggestionsCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: 300,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: "500",
  },
  contactAddress: {
    fontSize: 12,
    marginTop: 2,
  },
  verifiedIcon: {
    marginRight: 4,
  },
  favoriteButton: {
    padding: 4,
  },
});

export default RecipientInput;
