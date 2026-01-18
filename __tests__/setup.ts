/**
 * Jest Test Setup
 *
 * Global test configuration, mocks, and utilities.
 * Imported automatically before each test file via setupFilesAfterEnv.
 */
import '@testing-library/jest-native/extend-expect';
import { TextEncoder, TextDecoder } from 'util';

// Import mock implementations
import './mocks/expo/secure-store';
import './mocks/expo/crypto';
import './mocks/expo/camera';
import './mocks/convex';
import './mocks/solana';
import './mocks/jupiter';
import './mocks/turnkey';

// ============================================================================
// @noble/curves and @noble/hashes Mocks
// ============================================================================

// These are mocked via moduleNameMapper in jest.config.js

// ============================================================================
// React Native Core Mocks
// ============================================================================

// Mock React Native Gesture Handler
jest.mock('react-native-gesture-handler', () => ({
  Swipeable: 'Swipeable',
  DrawerLayout: 'DrawerLayout',
  State: {},
  ScrollView: 'ScrollView',
  Slider: 'Slider',
  Switch: 'Switch',
  TextInput: 'TextInput',
  ToolbarAndroid: 'ToolbarAndroid',
  ViewPagerAndroid: 'ViewPagerAndroid',
  DrawerLayoutAndroid: 'DrawerLayoutAndroid',
  WebView: 'WebView',
  NativeViewGestureHandler: 'NativeViewGestureHandler',
  TapGestureHandler: 'TapGestureHandler',
  FlingGestureHandler: 'FlingGestureHandler',
  ForceTouchGestureHandler: 'ForceTouchGestureHandler',
  LongPressGestureHandler: 'LongPressGestureHandler',
  PanGestureHandler: 'PanGestureHandler',
  PinchGestureHandler: 'PinchGestureHandler',
  RotationGestureHandler: 'RotationGestureHandler',
  RawButton: 'RawButton',
  BaseButton: 'BaseButton',
  RectButton: 'RectButton',
  BorderlessButton: 'BorderlessButton',
  FlatList: 'FlatList',
  gestureHandlerRootHOC: jest.fn((component) => component),
  Directions: {},
  GestureHandlerRootView: 'GestureHandlerRootView',
}));

// Mock React Native Reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = {
    default: {
      call: jest.fn(),
      createAnimatedComponent: (component: any) => component,
      Value: jest.fn(),
      event: jest.fn(),
      add: jest.fn(),
      eq: jest.fn(),
      set: jest.fn(),
      cond: jest.fn(),
      interpolate: jest.fn(),
      Extrapolate: { CLAMP: 'clamp' },
    },
    useAnimatedStyle: jest.fn(() => ({})),
    useSharedValue: jest.fn((initial) => ({ value: initial })),
    useAnimatedGestureHandler: jest.fn(() => ({})),
    withTiming: jest.fn((value) => value),
    withSpring: jest.fn((value) => value),
    withDecay: jest.fn((value) => value),
    withDelay: jest.fn((_, value) => value),
    withSequence: jest.fn((...values) => values[values.length - 1]),
    withRepeat: jest.fn((value) => value),
    cancelAnimation: jest.fn(),
    runOnJS: jest.fn((fn) => fn),
    runOnUI: jest.fn((fn) => fn),
    interpolate: jest.fn(),
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      poly: jest.fn(),
      sin: jest.fn(),
      circle: jest.fn(),
      exp: jest.fn(),
      elastic: jest.fn(),
      back: jest.fn(),
      bounce: jest.fn(),
      bezier: jest.fn(() => jest.fn()),
      in: jest.fn(),
      out: jest.fn(),
      inOut: jest.fn(),
    },
  };
  return Reanimated;
});

// ============================================================================
// Navigation Mocks
// ============================================================================

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      dispatch: jest.fn(),
      reset: jest.fn(),
      goBack: jest.fn(),
      isFocused: jest.fn(() => true),
      canGoBack: jest.fn(() => true),
      getParent: jest.fn(),
      setOptions: jest.fn(),
    }),
    useRoute: () => ({
      key: 'test-route-key',
      name: 'TestScreen',
      params: {},
    }),
    useIsFocused: () => true,
    useFocusEffect: jest.fn(),
  };
});

jest.mock('@react-navigation/stack', () => ({
  createStackNavigator: jest.fn(() => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: ({ children }: { children: React.ReactNode }) => children,
  })),
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: jest.fn(() => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: ({ children }: { children: React.ReactNode }) => children,
  })),
}));

// ============================================================================
// Expo Router Mock
// ============================================================================

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: {
    Screen: 'Screen',
  },
  Tabs: {
    Screen: 'Screen',
  },
}));

// ============================================================================
// Expo Module Mocks
// ============================================================================

jest.mock('expo-status-bar', () => ({
  StatusBar: 'StatusBar',
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialIcons: 'MaterialIcons',
  FontAwesome: 'FontAwesome',
  Feather: 'Feather',
  AntDesign: 'AntDesign',
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
  getStringAsync: jest.fn(() => Promise.resolve('')),
  hasStringAsync: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(() =>
    Promise.resolve({ success: true, error: null })
  ),
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([1, 2])),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

jest.mock('expo-contacts', () => ({
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' })
  ),
  getContactsAsync: jest.fn(() =>
    Promise.resolve({ data: [], hasNextPage: false })
  ),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(() => Promise.resolve()),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'cancel' })),
  openAuthSessionAsync: jest.fn(() =>
    Promise.resolve({ type: 'cancel', url: null })
  ),
}));

// ============================================================================
// TextEncoder/TextDecoder Polyfills
// ============================================================================

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// ============================================================================
// BigInt Serialization Fix for Jest Workers
// ============================================================================

// Jest workers can't serialize BigInt, so we need to handle this
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

// ============================================================================
// Crypto Polyfills
// ============================================================================

// Mock crypto.subtle for Node.js environment
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
    subtle: {
      digest: jest.fn(async (algorithm: string, data: ArrayBuffer) => {
        // Return a mock 32-byte hash
        return new Uint8Array(32).fill(0).buffer;
      }),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      sign: jest.fn(),
      verify: jest.fn(),
      generateKey: jest.fn(),
      importKey: jest.fn(),
      exportKey: jest.fn(),
      deriveBits: jest.fn(),
      deriveKey: jest.fn(),
    },
    randomUUID: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }),
  },
  writable: true,
});

// ============================================================================
// Global Test Utilities
// ============================================================================

// Increase timeout for async tests
jest.setTimeout(10000);

// Silence console warnings/errors during tests (optional)
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  // Optionally suppress specific warnings
  console.warn = (...args) => {
    // Suppress React Native warnings
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Animated') ||
        args[0].includes('useNativeDriver') ||
        args[0].includes('VirtualizedList'))
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };

  console.error = (...args) => {
    // Suppress act() warnings in tests
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: An update to')
    ) {
      return;
    }
    originalError.apply(console, args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

// Clean up between tests
afterEach(() => {
  jest.clearAllMocks();
});
