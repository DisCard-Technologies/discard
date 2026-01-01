const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add sourceExts to ensure proper file resolution
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

// Handle Node.js built-in modules that Solana packages may try to use
config.resolver.extraNodeModules = {
  crypto: require.resolve('expo-crypto'),
  buffer: require.resolve('buffer'),
};

// Disable package exports for problematic packages (rpc-websockets, @noble/hashes)
// This falls back to file-based resolution and suppresses the warnings
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
