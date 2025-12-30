const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Add sourceExts to ensure proper file resolution
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];


// Handle Node.js built-in modules that Solana packages may try to use
config.resolver.extraNodeModules = {
  crypto: require.resolve('expo-crypto'),
  buffer: require.resolve('buffer'),
};


module.exports = withNativeWind(config, { input: './global.css' });
