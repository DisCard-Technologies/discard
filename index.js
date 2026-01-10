// Polyfills must be loaded before expo-router to ensure they're available
// during route discovery when Solana packages are imported
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

// Import expo-router entry point
import 'expo-router/entry';
