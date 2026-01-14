/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */


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

// Custom font families
export const Fonts = {
  // Primary UI font (weight 400)
  sans: 'InstrumentSans-Regular',
  // Medium weight for semi-bold UI elements (weight 500)
  sansMedium: 'InstrumentSans-Medium',
  // Hero/display font - ultra-light for net worth display (weight 200)
  hero: 'InstrumentSans-ExtraLight',
  // Monospace for addresses and code
  mono: 'JetBrainsMono-Regular',
};
