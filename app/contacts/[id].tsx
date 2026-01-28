/**
 * DisCard 2035 - Contact Detail Screen
 *
 * View and edit contact details with:
 * - Full contact information display
 * - Edit mode for name
 * - Quick actions (send, favorite, delete)
 * - Transfer history stats
 */

import { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { PressableScale } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useContact } from "@/hooks/useContacts";
import { ContactsStorage } from "@/lib/contacts-storage";
import { formatAddress } from "@/lib/transfer/address-resolver";
import { Toast } from "@/components/ui/Toast";

// ============================================================================
// Info Row Component
// ============================================================================

interface InfoRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onCopy?: () => void;
  mutedColor: string;
  textColor: string;
}

function InfoRow({ icon, label, value, onCopy, mutedColor, textColor }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={mutedColor} style={styles.infoIcon} />
      <View style={styles.infoContent}>
        <ThemedText style={[styles.infoLabel, { color: mutedColor }]}>
          {label}
        </ThemedText>
        <ThemedText style={[styles.infoValue, { color: textColor }]} numberOfLines={1}>
          {value}
        </ThemedText>
      </View>
      {onCopy && (
        <PressableScale onPress={onCopy} style={styles.copyButton}>
          <Ionicons name="copy-outline" size={18} color={mutedColor} />
        </PressableScale>
      )}
    </View>
  );
}

// ============================================================================
// Stat Card Component
// ============================================================================

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}

function StatCard({ icon, label, value, color, bgColor }: StatCardProps) {
  return (
    <View style={[styles.statCard, { backgroundColor: bgColor }]}>
      <Ionicons name={icon} size={24} color={color} />
      <ThemedText style={[styles.statValue, { color }]}>{value}</ThemedText>
      <ThemedText style={[styles.statLabel, { color }]}>{label}</ThemedText>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const cardBg = useThemeColor(
    { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.06)" },
    "background"
  );
  const inputBg = useThemeColor({ light: "#f5f5f5", dark: "#1c1c1e" }, "background");
  const dangerColor = "#ef4444";

  // Load contact
  const { contact, isLoading } = useContact(id || null);

  // State
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Update edited name when contact loads
  useEffect(() => {
    if (contact) {
      setEditedName(contact.name);
    }
  }, [contact]);

  // Handle back
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/contacts");
    }
  }, []);

  // Handle edit toggle
  const handleEditToggle = useCallback(() => {
    if (isEditing) {
      // Cancel editing
      setEditedName(contact?.name || "");
    }
    setIsEditing(!isEditing);
  }, [isEditing, contact]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!contact || !editedName.trim()) return;

    setIsSaving(true);
    try {
      await ContactsStorage.update(contact.id, { name: editedName.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditing(false);
      setToastMessage("Contact updated");
      setToastVisible(true);
    } catch (err) {
      console.error("[ContactDetail] Save failed:", err);
      Alert.alert("Error", "Failed to save changes");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  }, [contact, editedName]);

  // Handle favorite toggle
  const handleToggleFavorite = useCallback(async () => {
    if (!contact) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await ContactsStorage.toggleFavorite(contact.id);
      setToastMessage(contact.isFavorite ? "Removed from favorites" : "Added to favorites");
      setToastVisible(true);
    } catch (err) {
      console.error("[ContactDetail] Toggle favorite failed:", err);
    }
  }, [contact]);

  // Handle send
  const handleSend = useCallback(() => {
    if (!contact) return;

    router.push({
      pathname: "/(tabs)/transfer",
      params: {
        prefillContactId: contact.id,
        prefillAddress: contact.resolvedAddress,
        prefillName: contact.name,
      },
    });
  }, [contact]);

  // Handle delete
  const handleDelete = useCallback(() => {
    if (!contact) return;

    Alert.alert(
      "Delete Contact",
      `Are you sure you want to delete "${contact.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await ContactsStorage.delete(contact.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (err) {
              console.error("[ContactDetail] Delete failed:", err);
              Alert.alert("Error", "Failed to delete contact");
            }
          },
        },
      ]
    );
  }, [contact]);

  // Handle copy address
  const handleCopyAddress = useCallback(async () => {
    if (!contact) return;

    await Clipboard.setStringAsync(contact.resolvedAddress);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setToastMessage("Address copied");
    setToastVisible(true);
  }, [contact]);

  // Handle copy identifier
  const handleCopyIdentifier = useCallback(async () => {
    if (!contact) return;

    await Clipboard.setStringAsync(contact.identifier);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setToastMessage("Copied to clipboard");
    setToastVisible(true);
  }, [contact]);

  // Loading state
  if (isLoading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={{ height: insets.top }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
      </ThemedView>
    );
  }

  // Not found state
  if (!contact) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={{ height: insets.top }} />
        <View style={styles.header}>
          <PressableScale onPress={handleBack} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={24} color={mutedColor} />
          </PressableScale>
          <ThemedText style={styles.headerTitle}>Contact</ThemedText>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.notFoundContainer}>
          <Ionicons name="person-outline" size={48} color={mutedColor} />
          <ThemedText style={styles.notFoundText}>Contact not found</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Format dates
  const createdDate = new Date(contact.createdAt).toLocaleDateString();
  const lastUsedDate = contact.lastUsedAt
    ? new Date(contact.lastUsedAt).toLocaleDateString()
    : "Never";

  // Get identifier type label
  const identifierTypeLabels: Record<string, string> = {
    address: "Wallet Address",
    sol_name: ".sol Domain",
    phone: "Phone Number",
    email: "Email Address",
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={{ height: insets.top }} />

      {/* Header */}
      <Animated.View entering={FadeIn.duration(200)} style={styles.header}>
        <PressableScale onPress={handleBack} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={mutedColor} />
        </PressableScale>
        <ThemedText style={styles.headerTitle}>Contact</ThemedText>
        <PressableScale onPress={handleEditToggle} style={styles.headerButton}>
          <ThemedText style={[styles.editButtonText, { color: primaryColor }]}>
            {isEditing ? "Cancel" : "Edit"}
          </ThemedText>
        </PressableScale>
      </Animated.View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar & Name */}
        <Animated.View
          entering={FadeInUp.delay(100).duration(300)}
          style={styles.profileSection}
        >
          <View style={[styles.avatar, { backgroundColor: contact.avatarColor }]}>
            <ThemedText style={styles.avatarText}>{contact.avatarInitials}</ThemedText>
          </View>

          {isEditing ? (
            <View style={styles.editNameContainer}>
              <TextInput
                value={editedName}
                onChangeText={setEditedName}
                style={[styles.nameInput, { backgroundColor: inputBg, color: textColor }]}
                autoFocus
                selectTextOnFocus
              />
              <PressableScale
                onPress={handleSave}
                enabled={!isSaving && editedName.trim().length > 0}
                style={[
                  styles.saveNameButton,
                  { backgroundColor: primaryColor },
                  (!editedName.trim() || isSaving) && styles.saveNameButtonDisabled,
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </PressableScale>
            </View>
          ) : (
            <ThemedText style={styles.name}>{contact.name}</ThemedText>
          )}

          {/* Badges */}
          <View style={styles.badges}>
            {contact.verified && (
              <View style={[styles.badge, { backgroundColor: `${primaryColor}15` }]}>
                <Ionicons name="checkmark-circle" size={14} color={primaryColor} />
                <ThemedText style={[styles.badgeText, { color: primaryColor }]}>
                  Verified
                </ThemedText>
              </View>
            )}
            {contact.importedFromPhone && (
              <View style={[styles.badge, { backgroundColor: `${mutedColor}20` }]}>
                <Ionicons name="phone-portrait-outline" size={14} color={mutedColor} />
                <ThemedText style={[styles.badgeText, { color: mutedColor }]}>
                  From Phone
                </ThemedText>
              </View>
            )}
            {contact.isFavorite && (
              <View style={[styles.badge, { backgroundColor: "#FFD70020" }]}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <ThemedText style={[styles.badgeText, { color: "#B8860B" }]}>
                  Favorite
                </ThemedText>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Quick Actions */}
        <Animated.View
          entering={FadeInUp.delay(200).duration(300)}
          style={styles.actionsRow}
        >
          <PressableScale
            onPress={handleSend}
            style={[styles.actionButton, { backgroundColor: primaryColor }]}
          >
            <Ionicons name="send" size={22} color="#fff" />
            <ThemedText style={styles.actionButtonText}>Send</ThemedText>
          </PressableScale>

          <PressableScale
            onPress={handleToggleFavorite}
            style={[styles.actionButton, { backgroundColor: cardBg }]}
          >
            <Ionicons
              name={contact.isFavorite ? "star" : "star-outline"}
              size={22}
              color={contact.isFavorite ? "#FFD700" : textColor}
            />
            <ThemedText style={[styles.actionButtonTextDark, { color: textColor }]}>
              {contact.isFavorite ? "Unfavorite" : "Favorite"}
            </ThemedText>
          </PressableScale>

          <PressableScale
            onPress={handleDelete}
            style={[styles.actionButton, { backgroundColor: `${dangerColor}15` }]}
          >
            <Ionicons name="trash-outline" size={22} color={dangerColor} />
            <ThemedText style={[styles.actionButtonTextDark, { color: dangerColor }]}>
              Delete
            </ThemedText>
          </PressableScale>
        </Animated.View>

        {/* Stats */}
        {contact.transferCount > 0 && (
          <Animated.View
            entering={FadeInUp.delay(300).duration(300)}
            style={styles.statsSection}
          >
            <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
              TRANSFER HISTORY
            </ThemedText>
            <View style={styles.statsRow}>
              <StatCard
                icon="swap-horizontal"
                label="Transfers"
                value={contact.transferCount.toString()}
                color={primaryColor}
                bgColor={`${primaryColor}15`}
              />
              <StatCard
                icon="cash-outline"
                label="Total Sent"
                value={`$${contact.totalAmountSent.toFixed(2)}`}
                color="#10B981"
                bgColor="rgba(16, 185, 129, 0.15)"
              />
            </View>
          </Animated.View>
        )}

        {/* Contact Info */}
        <Animated.View
          entering={FadeInUp.delay(400).duration(300)}
          style={[styles.infoSection, { backgroundColor: cardBg }]}
        >
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            CONTACT INFO
          </ThemedText>

          <InfoRow
            icon={
              contact.identifierType === "phone"
                ? "call-outline"
                : contact.identifierType === "email"
                ? "mail-outline"
                : contact.identifierType === "sol_name"
                ? "globe-outline"
                : "wallet-outline"
            }
            label={identifierTypeLabels[contact.identifierType]}
            value={contact.identifier}
            onCopy={handleCopyIdentifier}
            mutedColor={mutedColor}
            textColor={textColor}
          />

          {contact.identifierType !== "address" && (
            <InfoRow
              icon="wallet-outline"
              label="Resolved Address"
              value={formatAddress(contact.resolvedAddress, 12)}
              onCopy={handleCopyAddress}
              mutedColor={mutedColor}
              textColor={textColor}
            />
          )}

          {contact.identifierType === "address" && (
            <InfoRow
              icon="wallet-outline"
              label="Wallet Address"
              value={formatAddress(contact.resolvedAddress, 12)}
              onCopy={handleCopyAddress}
              mutedColor={mutedColor}
              textColor={textColor}
            />
          )}
        </Animated.View>

        {/* Metadata */}
        <Animated.View
          entering={FadeInUp.delay(500).duration(300)}
          style={[styles.infoSection, { backgroundColor: cardBg }]}
        >
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            DETAILS
          </ThemedText>

          <InfoRow
            icon="calendar-outline"
            label="Added"
            value={createdDate}
            mutedColor={mutedColor}
            textColor={textColor}
          />

          <InfoRow
            icon="time-outline"
            label="Last Used"
            value={lastUsedDate}
            mutedColor={mutedColor}
            textColor={textColor}
          />
        </Animated.View>
      </ScrollView>

      {/* Toast */}
      <Toast
        visible={toastVisible}
        message={toastMessage}
        onDismiss={() => setToastVisible(false)}
        duration={2000}
        icon="checkmark-circle"
        type="success"
      />
    </ThemedView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  notFoundContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  notFoundText: {
    fontSize: 16,
    opacity: 0.6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
  },
  headerButton: {
    minWidth: 60,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  headerSpacer: {
    width: 60,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 24,
  },
  profileSection: {
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "600",
  },
  name: {
    fontSize: 28,
    fontWeight: "700",
  },
  editNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameInput: {
    fontSize: 20,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 200,
    textAlign: "center",
  },
  saveNameButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  saveNameButtonDisabled: {
    opacity: 0.5,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 4,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  actionButtonTextDark: {
    fontSize: 13,
    fontWeight: "600",
  },
  statsSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    gap: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.8,
  },
  infoSection: {
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
  },
  infoIcon: {
    width: 32,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "500",
  },
  copyButton: {
    padding: 8,
  },
});
