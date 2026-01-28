/**
 * DisCard 2035 - Contacts Management Screen
 *
 * Full contacts management with:
 * - View all saved contacts
 * - Delete individual or multiple contacts
 * - Toggle favorites
 * - Import contacts from phone
 * - Search functionality
 */

import { useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { PressableScale, PressableOpacity } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useContacts, Contact } from "@/hooks/useContacts";
import { formatAddress } from "@/lib/transfer/address-resolver";
import { Toast } from "@/components/ui/Toast";

// ============================================================================
// Contact Item Component
// ============================================================================

interface ContactItemProps {
  contact: Contact;
  isSelected: boolean;
  selectionMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onToggleFavorite: () => void;
  onSend: () => void;
  onSwipeDelete: () => void;
}

const SWIPE_THRESHOLD = 80;

function ContactItem({
  contact,
  isSelected,
  selectionMode,
  onPress,
  onLongPress,
  onToggleFavorite,
  onSend,
  onSwipeDelete,
}: ContactItemProps) {
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const primaryColor = useThemeColor({}, "tint");
  const dangerColor = "#ef4444";
  const cardBg = useThemeColor(
    { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.06)" },
    "background"
  );

  // Swipe animation
  const translateX = useSharedValue(0);
  const isDeleting = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      // Only allow swipe left and not in selection mode
      if (selectionMode) return;
      translateX.value = Math.min(0, Math.max(e.translationX, -120));
    })
    .onEnd((e) => {
      if (selectionMode) return;
      if (e.translationX < -SWIPE_THRESHOLD) {
        // Trigger delete
        translateX.value = withTiming(-400, { duration: 200 });
        isDeleting.value = true;
        runOnJS(onSwipeDelete)();
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
      }
    });

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedDeleteBgStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(translateX.value) / SWIPE_THRESHOLD),
  }));

  const rowContent = (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.contactItem,
        { backgroundColor: cardBg },
        isSelected && styles.contactSelected,
        isSelected && { borderColor: primaryColor },
      ]}
    >
      {selectionMode && (
        <View
          style={[
            styles.checkbox,
            { borderColor: mutedColor },
            isSelected && { backgroundColor: primaryColor, borderColor: primaryColor },
          ]}
        >
          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      )}

      <View style={[styles.avatar, { backgroundColor: contact.avatarColor }]}>
        <ThemedText style={styles.avatarText}>{contact.avatarInitials}</ThemedText>
      </View>

      <View style={styles.contactInfo}>
        <View style={styles.nameRow}>
          <ThemedText style={styles.contactName} numberOfLines={1}>
            {contact.name}
          </ThemedText>
          {contact.verified && (
            <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
          )}
          {contact.importedFromPhone && (
            <Ionicons name="phone-portrait-outline" size={12} color={mutedColor} />
          )}
        </View>
        <ThemedText style={[styles.contactIdentifier, { color: mutedColor }]} numberOfLines={1}>
          {contact.identifierType === "sol_name"
            ? contact.identifier
            : contact.identifierType === "phone"
            ? contact.identifier
            : contact.identifierType === "email"
            ? contact.identifier
            : formatAddress(contact.resolvedAddress, 8)}
        </ThemedText>
        {contact.transferCount > 0 && (
          <ThemedText style={[styles.transferCount, { color: mutedColor }]}>
            {contact.transferCount} transfer{contact.transferCount !== 1 ? "s" : ""}
          </ThemedText>
        )}
      </View>

      {!selectionMode && (
        <View style={styles.actions}>
          <PressableScale
            onPress={onToggleFavorite}
            style={styles.actionButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={contact.isFavorite ? "star" : "star-outline"}
              size={20}
              color={contact.isFavorite ? "#FFD700" : mutedColor}
            />
          </PressableScale>
          <PressableScale
            onPress={onSend}
            style={styles.actionButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="send" size={18} color={primaryColor} />
          </PressableScale>
        </View>
      )}
    </PressableScale>
  );

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      layout={LinearTransition.springify()}
    >
      <View style={styles.swipeContainer}>
        {/* Delete background */}
        <Animated.View style={[styles.deleteBackground, animatedDeleteBgStyle]}>
          <Ionicons name="trash" size={24} color="#fff" />
        </Animated.View>

        {/* Swipeable row */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={animatedRowStyle}>
            {rowContent}
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

// ============================================================================
// Section Header Component
// ============================================================================

function SectionHeader({ title }: { title: string }) {
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");

  return (
    <View style={styles.sectionHeader}>
      <ThemedText style={[styles.sectionHeaderText, { color: mutedColor }]}>
        {title}
      </ThemedText>
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const {
    contacts,
    favoriteContacts,
    isLoading,
    deleteContact,
    deleteMultipleContacts,
    toggleFavorite,
    refreshContacts,
  } = useContacts();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  // Toast state for undo delete
  const [toastVisible, setToastVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [deletedContacts, setDeletedContacts] = useState<Contact[]>([]);

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.08)" },
    "background"
  );
  const inputBg = useThemeColor({ light: "#ffffff", dark: "#1c1c1e" }, "background");
  const textColor = useThemeColor({}, "text");
  const dangerColor = "#ef4444";

  // Check if primary color is white (for dark mode button text)
  const isWhitePrimary = primaryColor === "#fff" || primaryColor === "#ffffff" || primaryColor.toLowerCase() === "white";
  const buttonTextColor = isWhitePrimary ? "#000" : "#fff";

  // Set of deleted contact IDs (for optimistic UI)
  const deletedIds = useMemo(() => new Set(deletedContacts.map((c) => c.id)), [deletedContacts]);

  // Filter contacts by search and exclude pending deletes
  const filteredContacts = useMemo(() => {
    let result = contacts.filter((c) => !deletedIds.has(c.id));
    if (!searchQuery.trim()) return result;
    const query = searchQuery.toLowerCase();
    return result.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.identifier.toLowerCase().includes(query) ||
        c.resolvedAddress.toLowerCase().includes(query)
    );
  }, [contacts, searchQuery, deletedIds]);

  // Filter favorites by search and exclude pending deletes
  const filteredFavorites = useMemo(() => {
    let result = favoriteContacts.filter((c) => !deletedIds.has(c.id));
    if (!searchQuery.trim()) return result;
    const query = searchQuery.toLowerCase();
    return result.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.identifier.toLowerCase().includes(query) ||
        c.resolvedAddress.toLowerCase().includes(query)
    );
  }, [favoriteContacts, searchQuery, deletedIds]);

  // Non-favorite contacts (excluding favorites from main list)
  const nonFavoriteContacts = useMemo(() => {
    const favoriteIds = new Set(favoriteContacts.map((c) => c.id));
    return filteredContacts.filter((c) => !favoriteIds.has(c.id));
  }, [filteredContacts, favoriteContacts]);

  // Handlers
  const handleBack = useCallback(() => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [selectionMode]);

  const handleContactPress = useCallback(
    (contact: Contact) => {
      if (selectionMode) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(contact.id)) {
            next.delete(contact.id);
          } else {
            next.add(contact.id);
          }
          return next;
        });
      }
    },
    [selectionMode]
  );

  const handleContactLongPress = useCallback((contact: Contact) => {
    setSelectionMode(true);
    setSelectedIds(new Set([contact.id]));
  }, []);

  // Swipe-delete handler with undo support
  const handleSwipeDelete = useCallback(
    (contact: Contact) => {
      // Store the contact for potential undo
      setPendingDelete(contact);
      setDeletedContacts((prev) => [...prev, contact]);
      setToastVisible(true);
    },
    []
  );

  // Actually delete the contact (called after toast dismisses without undo)
  const confirmDelete = useCallback(async () => {
    if (pendingDelete) {
      try {
        await deleteContact(pendingDelete.id);
      } catch (err) {
        console.error("[Contacts] Failed to delete:", err);
      }
      setPendingDelete(null);
    }
    setToastVisible(false);
  }, [pendingDelete, deleteContact]);

  // Undo delete
  const handleUndoDelete = useCallback(() => {
    if (pendingDelete) {
      // Remove from deleted list to restore visibility
      setDeletedContacts((prev) => prev.filter((c) => c.id !== pendingDelete.id));
      setPendingDelete(null);
    }
    setToastVisible(false);
  }, [pendingDelete]);

  // Toast dismiss handler
  const handleToastDismiss = useCallback(() => {
    confirmDelete();
  }, [confirmDelete]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    Alert.alert(
      "Delete Contacts",
      `Are you sure you want to delete ${selectedIds.size} contact${selectedIds.size !== 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMultipleContacts(Array.from(selectedIds));
              setSelectionMode(false);
              setSelectedIds(new Set());
            } catch (err) {
              Alert.alert("Error", "Failed to delete contacts");
            }
          },
        },
      ]
    );
  }, [selectedIds, deleteMultipleContacts]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
    }
  }, [selectedIds.size, filteredContacts]);

  const handleImportContacts = useCallback(async () => {
    try {
      // Check if expo-contacts is available
      let Contacts;
      try {
        Contacts = require("expo-contacts");
      } catch {
        Alert.alert(
          "Not Available",
          "Contact import requires expo-contacts. Run: npx expo install expo-contacts"
        );
        return;
      }

      // Request permission
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please allow access to contacts in your device settings."
        );
        return;
      }

      setIsImporting(true);

      // Get contacts from phone
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });

      if (data.length === 0) {
        Alert.alert("No Contacts", "No contacts found on your device.");
        setIsImporting(false);
        return;
      }

      // Filter contacts that have phone or email
      const validContacts = data.filter(
        (c: { name?: string; phoneNumbers?: unknown[]; emails?: unknown[] }) =>
          c.name && (c.phoneNumbers?.length || c.emails?.length)
      );

      if (validContacts.length === 0) {
        Alert.alert("No Valid Contacts", "No contacts with phone numbers or emails found.");
        setIsImporting(false);
        return;
      }

      // Show selection dialog
      Alert.alert(
        "Import Contacts",
        `Found ${validContacts.length} contacts with phone/email. Import them to your contact list?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setIsImporting(false) },
          {
            text: "Import All",
            onPress: async () => {
              try {
                let imported = 0;
                let skipped = 0;

                // Get existing contact identifiers to avoid duplicates
                const existingIdentifiers = new Set(
                  contacts.map((c) => c.identifier.toLowerCase())
                );

                const ContactsStorage = await import("@/lib/contacts-storage").then(
                  (m) => m.ContactsStorage
                );

                for (const contact of validContacts) {
                  const name = contact.name as string;

                  // Try phone first, then email
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

                  if (!identifier) {
                    skipped++;
                    continue;
                  }

                  // Skip if already exists
                  if (existingIdentifiers.has(identifier.toLowerCase())) {
                    skipped++;
                    continue;
                  }

                  await ContactsStorage.create({
                    name,
                    identifier,
                    identifierType,
                    resolvedAddress: identifier, // Will be resolved when actually sending
                    verified: false,
                    importedFromPhone: true,
                    phoneContactId: contact.id as string,
                  });

                  existingIdentifiers.add(identifier.toLowerCase());
                  imported++;
                }

                // Refresh the contacts list
                await refreshContacts();

                Alert.alert(
                  "Import Complete",
                  `Imported: ${imported}\nAlready saved: ${skipped}`
                );
              } catch (err) {
                console.error("[Contacts] Import error:", err);
                Alert.alert("Error", "Failed to import contacts");
              } finally {
                setIsImporting(false);
              }
            },
          },
        ]
      );
    } catch (err) {
      console.error("[Contacts] Import error:", err);
      Alert.alert("Error", "Failed to access contacts");
      setIsImporting(false);
    }
  }, [contacts, refreshContacts]);

  const handleToggleFavorite = useCallback(
    async (contactId: string) => {
      try {
        await toggleFavorite(contactId);
      } catch (err) {
        Alert.alert("Error", "Failed to update favorite status");
      }
    },
    [toggleFavorite]
  );

  // Navigate to transfer with contact pre-filled
  const handleSendToContact = useCallback((contact: Contact) => {
    router.push({
      pathname: "/(tabs)/transfer",
      params: {
        prefillContactId: contact.id,
        prefillAddress: contact.resolvedAddress,
        prefillName: contact.name,
      },
    });
  }, []);

  // Empty state
  if (!isLoading && contacts.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={{ height: insets.top }} />

        {/* Header */}
        <View style={styles.header}>
          <PressableScale
            onPress={handleBack}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color={mutedColor} />
          </PressableScale>
          <ThemedText style={styles.headerTitle}>Contacts</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        {/* Empty State */}
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: `${primaryColor}15` }]}>
            <Ionicons name="people-outline" size={48} color={primaryColor} />
          </View>
          <ThemedText style={styles.emptyTitle}>No Contacts Yet</ThemedText>
          <ThemedText style={[styles.emptyDescription, { color: mutedColor }]}>
            Add contacts manually or import them from your phone.
          </ThemedText>
          <View style={styles.emptyActions}>
            <PressableScale
              onPress={() => router.push("/contacts/add")}
              style={[
                styles.emptyActionButton,
                { backgroundColor: primaryColor },
              ]}
            >
              <Ionicons name="add" size={20} color={buttonTextColor} />
              <ThemedText style={[styles.emptyActionButtonText, { color: buttonTextColor }]}>
                Add Contact
              </ThemedText>
            </PressableScale>
            <PressableScale
              onPress={handleImportContacts}
              enabled={!isImporting}
              style={[
                styles.emptyActionButton,
                styles.emptyActionButtonOutline,
                { borderColor: primaryColor },
              ]}
            >
              {isImporting ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={20} color={primaryColor} />
                  <ThemedText style={[styles.emptyActionButtonText, { color: primaryColor }]}>
                    Import from Phone
                  </ThemedText>
                </>
              )}
            </PressableScale>
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={{ height: insets.top }} />

      {/* Header */}
      <View style={styles.header}>
        <PressableScale
          onPress={handleBack}
          style={styles.backButton}
        >
          <Ionicons
            name={selectionMode ? "close" : "chevron-back"}
            size={24}
            color={mutedColor}
          />
        </PressableScale>
        <ThemedText style={styles.headerTitle}>
          {selectionMode ? `${selectedIds.size} Selected` : "Contacts"}
        </ThemedText>
        {selectionMode ? (
          <PressableScale
            onPress={handleSelectAll}
            style={styles.headerButton}
          >
            <ThemedText style={[styles.headerButtonText, { color: primaryColor }]}>
              {selectedIds.size === filteredContacts.length ? "Deselect All" : "Select All"}
            </ThemedText>
          </PressableScale>
        ) : (
          <View style={styles.headerActions}>
            <PressableScale
              onPress={handleImportContacts}
              enabled={!isImporting}
              style={styles.headerButton}
            >
              {isImporting ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <Ionicons name="cloud-download-outline" size={22} color={primaryColor} />
              )}
            </PressableScale>
            <PressableScale
              onPress={() => router.push("/contacts/add")}
              style={styles.headerButton}
            >
              <Ionicons name="add" size={26} color={primaryColor} />
            </PressableScale>
          </View>
        )}
      </View>

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
            <PressableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={mutedColor} />
            </PressableOpacity>
          )}
        </View>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <ThemedText style={[styles.statsText, { color: mutedColor }]}>
          {filteredContacts.length} contact{filteredContacts.length !== 1 ? "s" : ""}
          {favoriteContacts.length > 0 && ` • ${favoriteContacts.length} favorite${favoriteContacts.length !== 1 ? "s" : ""}`}
        </ThemedText>
      </View>

      {/* Contact List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={primaryColor} />
          </View>
        ) : filteredContacts.length === 0 && filteredFavorites.length === 0 ? (
          <View style={styles.noResults}>
            <Ionicons name="search-outline" size={32} color={mutedColor} />
            <ThemedText style={[styles.noResultsText, { color: mutedColor }]}>
              No contacts match "{searchQuery}"
            </ThemedText>
          </View>
        ) : (
          <>
            {/* Favorites Section */}
            {filteredFavorites.length > 0 && (
              <>
                <SectionHeader title="FAVORITES" />
                {filteredFavorites.map((contact) => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedIds.has(contact.id)}
                    selectionMode={selectionMode}
                    onPress={() => handleContactPress(contact)}
                    onLongPress={() => handleContactLongPress(contact)}
                    onToggleFavorite={() => handleToggleFavorite(contact.id)}
                    onSend={() => handleSendToContact(contact)}
                    onSwipeDelete={() => handleSwipeDelete(contact)}
                  />
                ))}
              </>
            )}

            {/* All Contacts Section */}
            {nonFavoriteContacts.length > 0 && (
              <>
                <SectionHeader title={filteredFavorites.length > 0 ? "ALL CONTACTS" : "CONTACTS"} />
                {nonFavoriteContacts.map((contact) => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedIds.has(contact.id)}
                    selectionMode={selectionMode}
                    onPress={() => handleContactPress(contact)}
                    onLongPress={() => handleContactLongPress(contact)}
                    onToggleFavorite={() => handleToggleFavorite(contact.id)}
                    onSend={() => handleSendToContact(contact)}
                    onSwipeDelete={() => handleSwipeDelete(contact)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Selection Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={[
            styles.selectionBar,
            { backgroundColor: inputBg, borderColor, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <PressableScale
            onPress={handleDeleteSelected}
            style={[
              styles.deleteSelectedButton,
              { backgroundColor: dangerColor },
            ]}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <ThemedText style={styles.deleteSelectedText}>
              Delete {selectedIds.size} Contact{selectedIds.size !== 1 ? "s" : ""}
            </ThemedText>
          </PressableScale>
        </Animated.View>
      )}

      {/* Undo Delete Toast */}
      <Toast
        visible={toastVisible}
        message={pendingDelete ? `"${pendingDelete.name}" deleted` : "Contact deleted"}
        actionLabel="UNDO"
        onAction={handleUndoDelete}
        onDismiss={handleToastDismiss}
        duration={4000}
        icon="trash-outline"
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
  },
  backButton: {
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
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: "500",
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
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statsText: {
    fontSize: 12,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    gap: 8,
  },
  loadingContainer: {
    paddingTop: 60,
    alignItems: "center",
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  contactSelected: {
    borderWidth: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  contactInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactName: {
    fontSize: 15,
    fontWeight: "500",
  },
  contactIdentifier: {
    fontSize: 13,
    marginTop: 2,
  },
  transferCount: {
    fontSize: 11,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 4,
  },
  actionButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyActions: {
    gap: 12,
    width: "100%",
    maxWidth: 280,
  },
  emptyActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyActionButtonOutline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
  },
  emptyActionButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  noResults: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  noResultsText: {
    fontSize: 14,
  },
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  swipeContainer: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 16,
  },
  deleteBackground: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 120,
    backgroundColor: "#ef4444",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingRight: 20,
  },
  selectionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  deleteSelectedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  deleteSelectedText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
