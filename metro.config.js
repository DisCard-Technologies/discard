const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude native build directories from Metro's file watcher
// These directories are created during Android/iOS native builds and cause ENOENT errors
config.resolver.blockList = [
  /node_modules\/.*\/android\/\.cxx\/.*/,
  /node_modules\/.*\/\.cxx\/.*/,
  /android\/\.cxx\/.*/,
  /\.cxx\/.*/,
];

// Add sourceExts to ensure proper file resolution
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

// Handle Node.js built-in modules that Solana packages may try to use
config.resolver.extraNodeModules = {
  crypto: require.resolve('expo-crypto'),
  buffer: require.resolve('buffer'),
  fs: require.resolve('./shims/fs.js'),
};

// Disable package exports for problematic packages (rpc-websockets, @noble/hashes)
// This falls back to file-based resolution and suppresses the warnings
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
