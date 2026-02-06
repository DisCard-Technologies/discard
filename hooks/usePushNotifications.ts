/**
 * Push Notifications Hook
 *
 * Handles push notification setup, permissions, token registration,
 * preference management, and notification listeners.
 *
 * Features:
 * - Permission request flow
 * - Token registration with Convex
 * - Notification preference management
 * - Foreground notification handling
 * - Deep link routing on notification tap
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, AppState, AppStateStatus } from "react-native";
import { useQuery, useMutation } from "convex/react";
import { useRouter, type Router } from "expo-router";
import Constants from "expo-constants";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// Dynamic imports for expo-notifications and expo-device
// These are optional dependencies that must be installed separately
import type { NotificationBehavior } from "expo-notifications";
// @ts-ignore - Optional package, may not be installed
let Notifications: typeof import("expo-notifications") | null = null;
// @ts-ignore - Optional package, may not be installed
let Device: typeof import("expo-device") | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require("expo-notifications");
} catch {
  console.warn("[PushNotifications] expo-notifications not installed. Install with: npx expo install expo-notifications");
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Device = require("expo-device");
} catch {
  console.warn("[PushNotifications] expo-device not installed. Install with: npx expo install expo-device");
}

// ============================================================================
// Types
// ============================================================================

interface NotificationPreferences {
  cryptoReceipts: boolean;
  goalMilestones: boolean;
  agentActivity: boolean;
  fraudAlerts: boolean;
}

type PermissionStatus = "granted" | "denied" | "undetermined";

interface PushNotificationState {
  isRegistered: boolean;
  isLoading: boolean;
  permissionStatus: PermissionStatus | null;
  expoPushToken: string | null;
  deviceId: string | null;
  preferences: NotificationPreferences | null;
  error: string | null;
}

interface UsePushNotificationsReturn extends PushNotificationState {
  // Actions
  requestPermission: () => Promise<boolean>;
  registerToken: () => Promise<void>;
  updatePreferences: (preferences: Partial<NotificationPreferences>) => Promise<void>;
  revoke: () => Promise<void>;
}

// ============================================================================
// Configuration
// ============================================================================

// Configure notification handler for foreground notifications
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async (_notification: unknown): Promise<NotificationBehavior> => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get a unique device identifier
 */
async function getDeviceId(): Promise<string> {
  // Use installation ID from Expo Constants if available
  const installationId = (Constants as { installationId?: string }).installationId;
  if (installationId) {
    return installationId;
  }

  // Fallback to a generated ID stored in secure storage
  // For simplicity, we'll use a combination of device info
  const deviceInfo = [
    Device?.brand,
    Device?.modelName,
    Device?.osVersion,
    Platform.OS,
  ].filter(Boolean).join("-");

  // Create a hash-like string
  let hash = 0;
  for (let i = 0; i < deviceInfo.length; i++) {
    const char = deviceInfo.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return `device-${Math.abs(hash).toString(36)}`;
}

/**
 * Register for push notifications and get Expo push token
 */
async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Notifications || !Device) {
    console.log("[PushNotifications] Required packages not installed");
    return null;
  }

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log("[PushNotifications] Must use physical device for push notifications");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[PushNotifications] Permission not granted");
    return null;
  }

  // Get Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: projectId ?? undefined,
    });
    return tokenResponse.data;
  } catch (error) {
    console.error("[PushNotifications] Failed to get push token:", error);
    return null;
  }
}

/**
 * Set up Android notification channels
 */
async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android" || !Notifications) return;

  // Default channel for regular notifications
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    description: "Default notifications",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0A0A0A",
  });

  // High priority channel for fraud alerts
  await Notifications.setNotificationChannelAsync("fraud_alerts", {
    name: "Security Alerts",
    description: "Important security and fraud alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500],
    lightColor: "#FF0000",
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// ============================================================================
// Hook
// ============================================================================

export function usePushNotifications(
  userId: Id<"users"> | null
): UsePushNotificationsReturn {
  const router = useRouter();

  // State
  const [state, setState] = useState<PushNotificationState>({
    isRegistered: false,
    isLoading: true,
    permissionStatus: null,
    expoPushToken: null,
    deviceId: null,
    preferences: null,
    error: null,
  });

  // Refs for notification listeners
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Convex queries and mutations
  const registerMutation = useMutation(api.notifications.tokens.register);
  const updatePreferencesMutation = useMutation(api.notifications.tokens.updatePreferences);
  const revokeMutation = useMutation(api.notifications.tokens.revoke);

  // Query existing token for this device
  const existingToken = useQuery(
    api.notifications.tokens.getByDevice,
    state.deviceId ? { deviceId: state.deviceId } : "skip"
  );

  // ============================================================================
  // Effects
  // ============================================================================

  // Initialize device ID and check permissions on mount
  useEffect(() => {
    async function initialize() {
      try {
        // Get device ID
        const deviceId = await getDeviceId();

        // Check current permission status
        let status: PermissionStatus = "undetermined";
        if (Notifications) {
          const result = await Notifications.getPermissionsAsync();
          status = result.status as PermissionStatus;
        }

        // Set up Android channels
        await setupAndroidChannels();

        setState((prev) => ({
          ...prev,
          deviceId,
          permissionStatus: status,
          isLoading: false,
        }));
      } catch (error) {
        console.error("[PushNotifications] Initialization error:", error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Failed to initialize notifications",
        }));
      }
    }

    initialize();
  }, []);

  // Update state when existing token loads
  useEffect(() => {
    if (existingToken) {
      setState((prev) => ({
        ...prev,
        isRegistered: existingToken.status === "active",
        expoPushToken: existingToken.expoPushToken,
        preferences: existingToken.preferences,
      }));
    }
  }, [existingToken]);

  // Set up notification listeners
  useEffect(() => {
    if (!Notifications) return;

    // Foreground notification listener
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification: unknown) => {
        console.log("[PushNotifications] Received foreground notification:", notification);
        // Notifications will be shown automatically based on handler config
      }
    );

    // Notification response listener (when user taps notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response: unknown) => {
        console.log("[PushNotifications] User tapped notification:", response);
        handleNotificationTap(response as NotificationResponse, router);
      }
    );

    // App state listener for refreshing token when app comes to foreground
    const appStateSubscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          // App has come to foreground - check if we need to refresh token
          if (Notifications) {
            const result = await Notifications.getPermissionsAsync();
            setState((prev) => ({
              ...prev,
              permissionStatus: result.status as PermissionStatus,
            }));
          }
        }
        appStateRef.current = nextAppState;
      }
    );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      appStateSubscription.remove();
    };
  }, [router]);

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Request notification permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!Notifications) {
      console.error("[PushNotifications] expo-notifications not installed");
      return false;
    }

    try {
      const result = await Notifications.requestPermissionsAsync();
      setState((prev) => ({
        ...prev,
        permissionStatus: result.status as PermissionStatus,
      }));
      return result.status === "granted";
    } catch (error) {
      console.error("[PushNotifications] Permission request error:", error);
      setState((prev) => ({
        ...prev,
        error: "Failed to request permission",
      }));
      return false;
    }
  }, []);

  /**
   * Register push token with Convex
   */
  const registerToken = useCallback(async (): Promise<void> => {
    if (!userId) {
      throw new Error("User not authenticated");
    }

    if (!state.deviceId) {
      throw new Error("Device ID not available");
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Get push token from Expo
      const expoPushToken = await registerForPushNotificationsAsync();

      if (!expoPushToken) {
        throw new Error("Failed to get push token - ensure you're on a physical device");
      }

      // Register with Convex
      await registerMutation({
        expoPushToken,
        deviceId: state.deviceId,
        platform: Platform.OS as "ios" | "android",
        deviceName: Device?.deviceName ?? undefined,
        appVersion: Constants.expoConfig?.version ?? undefined,
      });

      setState((prev) => ({
        ...prev,
        isRegistered: true,
        expoPushToken,
        isLoading: false,
        preferences: {
          cryptoReceipts: true,
          goalMilestones: true,
          agentActivity: true,
          fraudAlerts: true,
        },
      }));

      console.log("[PushNotifications] Token registered successfully");
    } catch (error) {
      console.error("[PushNotifications] Registration error:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Registration failed",
      }));
      throw error;
    }
  }, [userId, state.deviceId, registerMutation]);

  /**
   * Update notification preferences
   */
  const updatePreferences = useCallback(
    async (preferences: Partial<NotificationPreferences>): Promise<void> => {
      if (!state.deviceId) {
        throw new Error("Device ID not available");
      }

      try {
        await updatePreferencesMutation({
          deviceId: state.deviceId,
          preferences,
        });

        setState((prev) => ({
          ...prev,
          preferences: prev.preferences
            ? { ...prev.preferences, ...preferences }
            : null,
        }));

        console.log("[PushNotifications] Preferences updated");
      } catch (error) {
        console.error("[PushNotifications] Update preferences error:", error);
        throw error;
      }
    },
    [state.deviceId, updatePreferencesMutation]
  );

  /**
   * Revoke/disable notifications for this device
   */
  const revoke = useCallback(async (): Promise<void> => {
    if (!state.deviceId) {
      throw new Error("Device ID not available");
    }

    try {
      await revokeMutation({
        deviceId: state.deviceId,
      });

      setState((prev) => ({
        ...prev,
        isRegistered: false,
      }));

      console.log("[PushNotifications] Token revoked");
    } catch (error) {
      console.error("[PushNotifications] Revoke error:", error);
      throw error;
    }
  }, [state.deviceId, revokeMutation]);

  return {
    ...state,
    requestPermission,
    registerToken,
    updatePreferences,
    revoke,
  };
}

// ============================================================================
// Types for notification response
// ============================================================================

interface NotificationResponse {
  notification: {
    request: {
      content: {
        data?: Record<string, unknown>;
      };
    };
  };
}

// ============================================================================
// Notification Tap Handler
// ============================================================================

/**
 * Handle notification tap and route to appropriate screen
 */
function handleNotificationTap(
  response: NotificationResponse,
  router: Router
): void {
  const data = response.notification.request.content.data;

  if (!data || typeof data !== "object") {
    return;
  }

  const { screen, ...params } = data as Record<string, unknown>;

  // Route based on notification screen target
  switch (screen) {
    case "wallet":
      router.push("/(tabs)/wallet" as never);
      break;

    case "goal-detail":
      if (params.goalId) {
        // Navigate to goals tab - could add deep linking to specific goal
        router.push("/(tabs)/goals" as never);
      }
      break;

    case "fraud-alert":
      if (params.cardId) {
        // Navigate to card detail or fraud review screen
        router.push("/(tabs)/cards" as never);
      }
      break;

    case "activity":
      router.push("/(tabs)" as never);
      break;

    case "transaction":
      if (params.signature) {
        router.push("/history" as never);
      }
      break;

    case "claim":
      // Deep link to claim screen for incoming private transfers
      router.push("/(tabs)" as never);
      break;

    default:
      // Default to home
      router.push("/(tabs)" as never);
  }
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Check if push notifications are supported on this device
 */
export function isPushNotificationSupported(): boolean {
  return Boolean(Device?.isDevice) && (Platform.OS === "ios" || Platform.OS === "android");
}

/**
 * Get the last notification response (for handling cold start)
 */
export async function getLastNotificationResponse(): Promise<NotificationResponse | null> {
  if (!Notifications) return null;
  return await Notifications.getLastNotificationResponseAsync() as NotificationResponse | null;
}
