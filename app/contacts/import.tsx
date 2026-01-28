/**
 * DisCard 2035 - Import Contacts Screen
 *
 * Selective phone contact import with:
 * - List of phone contacts with checkboxes
 * - Select all / deselect all
 * - Shows already imported contacts (disabled)
 * - Import selected button with count
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { PressableScale } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useContacts } from "@/hooks/useContacts";
import { ContactsStorage } from "@/lib/contacts-storage";

// ============================================================================
// Types
// ============================================================================

interface PhoneContact {
  id: string;
  name: string;
  phoneNumbers?: Array<{ number: string; label?: string }>;
  emails?: Array<{ email: string; label?: string }>;
}

interface DisplayContact extends PhoneContact {
  identifier: string;
  identifierType: "phone" | "email";
  isAlreadyImported: boolean;
}

// ============================================================================
// Contact Item Component
// ============================================================================

interface ContactItemProps {
  contact: DisplayContact;
  isSelected: boolean;
  onToggle: () => void;
}

function ContactItem({ contact, isSelected, onToggle }: ContactItemProps) {
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const primaryColor = useThemeColor({}, "tint");
  const cardBg = useThemeColor(
    { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.06)" },
    "background"
  );

  // Generate initials
  const initials = useMemo(() => {
    const parts = contact.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return contact.name.slice(0, 2).toUpperCase();
  }, [contact.name]);

  // Generate avatar color from name
  const avatarColor = useMemo(() => {
    const colors = [
      "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
      "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
    ];
    let hash = 0;
    for (let i = 0; i < contact.name.length; i++) {
      hash = contact.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }, [contact.name]);

  const isDisabled = contact.isAlreadyImported;

  return (
    <PressableScale
      onPress={onToggle}
      enabled={!isDisabled}
      style={[
        styles.contactItem,
        { backgroundColor: cardBg },
        isDisabled && styles.contactItemDisabled,
      ]}
    >
      {/* Checkbox */}
      <View
        style={[
          styles.checkbox,
          { borderColor: isDisabled ? mutedColor : primaryColor },
          isSelected && { backgroundColor: primaryColor, borderColor: primaryColor },
          isDisabled && styles.checkboxDisabled,
        ]}
      >
        {(isSelected || isDisabled) && (
          <Ionicons
            name="checkmark"
            size={14}
            color={isDisabled ? mutedColor : "#fff"}
          />
        )}
      </View>

      {/* Avatar */}
      <View
        style={[
          styles.avatar,
          { backgroundColor: avatarColor },
          isDisabled && styles.avatarDisabled,
        ]}
      >
        <ThemedText style={styles.avatarText}>{initials}</ThemedText>
      </View>

      {/* Info */}
      <View style={styles.contactInfo}>
        <ThemedText
          style={[styles.contactName, isDisabled && styles.textDisabled]}
          numberOfLines={1}
        >
          {contact.name}
        </ThemedText>
        <ThemedText
          style={[styles.contactIdentifier, { color: mutedColor }]}
          numberOfLines={1}
        >
          {contact.identifier}
        </ThemedText>
      </View>

      {/* Already imported badge */}
      {isDisabled && (
        <View style={[styles.importedBadge, { backgroundColor: `${primaryColor}15` }]}>
          <ThemedText style={[styles.importedBadgeText, { color: primaryColor }]}>
            Saved
          </ThemedText>
        </View>
      )}
    </PressableScale>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ImportContactsScreen() {
  const insets = useSafeAreaInsets();

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const inputBg = useThemeColor({ light: "#f5f5f5", dark: "#1c1c1e" }, "background");
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.08)", dark: "rgba(255,255,255,0.1)" },
    "background"
  );

  // Existing contacts
  const { contacts: existingContacts, refreshContacts } = useContacts();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [phoneContacts, setPhoneContacts] = useState<DisplayContact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Load phone contacts on mount
  useEffect(() => {
    loadPhoneContacts();
  }, [existingContacts]);

  const loadPhoneContacts = useCallback(async () => {
    try {
      setIsLoading(true);

      // Check if expo-contacts is available
      let Contacts;
      try {
        Contacts = require("expo-contacts");
      } catch {
        Alert.alert(
          "Not Available",
          "Contact import requires expo-contacts. Run: npx expo install expo-contacts",
          [{ text: "OK", onPress: () => router.back() }]
        );
        return;
      }

      // Request permission
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setPermissionDenied(true);
        setIsLoading(false);
        return;
      }

      // Get contacts from phone
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });

      // Build set of existing identifiers (lowercase for comparison)
      const existingIdentifiers = new Set(
        existingContacts.map((c) => c.identifier.toLowerCase())
      );

      // Filter and transform contacts
      const validContacts: DisplayContact[] = [];

      for (const contact of data) {
        if (!contact.name) continue;

        let identifier = "";
        let identifierType: "phone" | "email" = "phone";

        if (contact.phoneNumbers?.length) {
          const phone = (contact.phoneNumbers[0] as { number: string }).number;
          identifier = phone;
          identifierType = "phone";
        } else if (contact.emails?.length) {
          const email = (contact.emails[0] as { email: string }).email;
          identifier = email;
          identifierType = "email";
        }

        if (!identifier) continue;

        validContacts.push({
          id: contact.id as string,
          name: contact.name as string,
          phoneNumbers: contact.phoneNumbers as PhoneContact["phoneNumbers"],
          emails: contact.emails as PhoneContact["emails"],
          identifier,
          identifierType,
          isAlreadyImported: existingIdentifiers.has(identifier.toLowerCase()),
        });
      }

      // Sort alphabetically
      validContacts.sort((a, b) => a.name.localeCompare(b.name));

      setPhoneContacts(validContacts);
    } catch (err) {
      console.error("[ImportContacts] Error loading contacts:", err);
      Alert.alert("Error", "Failed to load phone contacts");
    } finally {
      setIsLoading(false);
    }
  }, [existingContacts]);

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return phoneContacts;
    const query = searchQuery.toLowerCase();
    return phoneContacts.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.identifier.toLowerCase().includes(query)
    );
  }, [phoneContacts, searchQuery]);

  // Selectable contacts (not already imported)
  const selectableContacts = useMemo(() => {
    return filteredContacts.filter((c) => !c.isAlreadyImported);
  }, [filteredContacts]);

  // Toggle selection
  const toggleSelection = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select all / deselect all
  const toggleSelectAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedIds.size === selectableContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableContacts.map((c) => c.id)));
    }
  }, [selectedIds.size, selectableContacts]);

  // Import selected contacts
  const handleImport = useCallback(async () => {
    if (selectedIds.size === 0) return;

    setIsImporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let imported = 0;

      for (const contact of phoneContacts) {
        if (!selectedIds.has(contact.id)) continue;

        await ContactsStorage.create({
          name: contact.name,
          identifier: contact.identifier,
          identifierType: contact.identifierType,
          resolvedAddress: contact.identifier, // Will be resolved when sending
          verified: false,
          importedFromPhone: true,
          phoneContactId: contact.id,
        });

        imported++;
      }

      // Refresh contacts list
      await refreshContacts();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        "Import Complete",
        `Successfully imported ${imported} contact${imported !== 1 ? "s" : ""}.`,
        [{ text: "Done", onPress: () => router.back() }]
      );
    } catch (err) {
      console.error("[ImportContacts] Import error:", err);
      Alert.alert("Error", "Failed to import contacts");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsImporting(false);
    }
  }, [selectedIds, phoneContacts, refreshContacts]);

  // Handle back
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/contacts");
    }
  }, []);

  // Render contact item
  const renderContact = useCallback(
    ({ item }: { item: DisplayContact }) => (
      <ContactItem
        contact={item}
        isSelected={selectedIds.has(item.id)}
        onToggle={() => toggleSelection(item.id)}
      />
    ),
    [selectedIds, toggleSelection]
  );

  // Permission denied state
  if (permissionDenied) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={{ height: insets.top }} />
        <View style={styles.header}>
          <PressableScale onPress={handleBack} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={mutedColor} />
          </PressableScale>
          <ThemedText style={styles.headerTitle}>Import Contacts</ThemedText>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.permissionDenied}>
          <Ionicons name="lock-closed-outline" size={48} color={mutedColor} />
          <ThemedText style={styles.permissionTitle}>
            Permission Required
          </ThemedText>
          <ThemedText style={[styles.permissionText, { color: mutedColor }]}>
            Please allow access to contacts in your device settings to import them.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Stats
  const alreadyImportedCount = phoneContacts.filter((c) => c.isAlreadyImported).length;
  const allSelected = selectedIds.size === selectableContacts.length && selectableContacts.length > 0;

  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={{ height: insets.top }} />

      {/* Header */}
      <Animated.View entering={FadeIn.duration(200)} style={styles.header}>
        <PressableScale onPress={handleBack} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={mutedColor} />
        </PressableScale>
        <ThemedText style={styles.headerTitle}>Import Contacts</ThemedText>
        <View style={styles.headerSpacer} />
      </Animated.View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
          <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
            Loading contacts...
          </ThemedText>
        </View>
      ) : phoneContacts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color={mutedColor} />
          <ThemedText style={styles.emptyTitle}>No Contacts Found</ThemedText>
          <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
            No contacts with phone numbers or emails were found on your device.
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <View style={[styles.searchBar, { backgroundColor: inputBg, borderColor }]}>
              <Ionicons name="search" size={18} color={mutedColor} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search contacts..."
                placeholderTextColor={mutedColor}
                style={[styles.searchInput, { color: textColor }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <PressableScale onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color={mutedColor} />
                </PressableScale>
              )}
            </View>
          </View>

          {/* Stats & Select All */}
          <View style={styles.statsBar}>
            <ThemedText style={[styles.statsText, { color: mutedColor }]}>
              {filteredContacts.length} contact{filteredContacts.length !== 1 ? "s" : ""}
              {alreadyImportedCount > 0 && ` (${alreadyImportedCount} already saved)`}
            </ThemedText>
            {selectableContacts.length > 0 && (
              <PressableScale onPress={toggleSelectAll}>
                <ThemedText style={[styles.selectAllText, { color: primaryColor }]}>
                  {allSelected ? "Deselect All" : "Select All"}
                </ThemedText>
              </PressableScale>
            )}
          </View>

          {/* Contact List */}
          <FlatList
            data={filteredContacts}
            renderItem={renderContact}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 100 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />

          {/* Import Button */}
          {selectedIds.size > 0 && (
            <Animated.View
              entering={FadeInUp.duration(200)}
              style={[
                styles.importBar,
                { backgroundColor: bgColor, paddingBottom: insets.bottom + 16 },
              ]}
            >
              <PressableScale
                onPress={handleImport}
                enabled={!isImporting}
                style={[
                  styles.importButton,
                  { backgroundColor: primaryColor },
                  isImporting && styles.importButtonDisabled,
                ]}
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-download-outline" size={20} color="#fff" />
                    <ThemedText style={styles.importButtonText}>
                      Import {selectedIds.size} Contact{selectedIds.size !== 1 ? "s" : ""}
                    </ThemedText>
                  </>
                )}
              </PressableScale>
            </Animated.View>
          )}
        </>
      )}
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
  },
  permissionDenied: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  permissionText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statsText: {
    fontSize: 12,
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    gap: 12,
  },
  contactItemDisabled: {
    opacity: 0.6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDisabled: {
    backgroundColor: "rgba(128,128,128,0.2)",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarDisabled: {
    opacity: 0.7,
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
  contactIdentifier: {
    fontSize: 13,
    marginTop: 2,
  },
  textDisabled: {
    opacity: 0.7,
  },
  importedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  importedBadgeText: {
    fontSize: 12,
    fontWeight: "500",
  },
  importBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.1)",
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  importButtonDisabled: {
    opacity: 0.6,
  },
  importButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
