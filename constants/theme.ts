/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// Primary brand color - teal/emerald (ambient design)
export const primaryColor = '#10B981';
export const accentColor = '#a855f7';

// Semantic colors
export const positiveColor = '#10B981';
export const negativeColor = '#ef4444';
export const warningColor = '#f59e0b';

const tintColorLight = '#10B981';
const tintColorDark = '#10B981';

export const Colors = {
  light: {
    text: '#11181C',
    textMuted: '#687076',
    background: '#ffffff',
    card: '#f4f4f5',
    tint: tintColorLight,
    border: '#e4e4e7',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    positive: positiveColor,
    negative: negativeColor,
  },
  dark: {
    text: '#ECEDEE',
    textMuted: '#9BA1A6',
    background: '#0f1419',
    card: '#1a1f25',
    tint: tintColorDark,
    border: '#2d3640',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    positive: positiveColor,
    negative: negativeColor,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS \`UIFontDescriptorSystemDesignDefault\` */
    sans: 'system-ui',
    /** iOS \`UIFontDescriptorSystemDesignSerif\` */
    serif: 'ui-serif',
    /** iOS \`UIFontDescriptorSystemDesignRounded\` */
    rounded: 'ui-rounded',
    /** iOS \`UIFontDescriptorSystemDesignMonospaced\` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
