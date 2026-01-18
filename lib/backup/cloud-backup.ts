/**
 * Cloud Backup - Platform-Specific Cloud Storage Integration
 *
 * Provides abstraction for cloud backup across platforms:
 * - iOS: iCloud Documents (via react-native-cloud-store)
 * - Android: Google Drive App Data (via @react-native-google-signin/google-signin)
 * - Web: File download/upload (via expo-document-picker)
 */

import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { EncryptedBackup, serializeBackup, parseBackup, createBackupFilename } from './backup-encryption';

/**
 * Cloud provider types
 */
export type CloudProvider = 'icloud' | 'google_drive' | 'local_file';

/**
 * Cloud backup result
 */
export interface CloudBackupResult {
  success: boolean;
  provider: CloudProvider;
  backupId?: string;
  error?: string;
  timestamp?: number;
}

/**
 * Cloud restore result
 */
export interface CloudRestoreResult {
  success: boolean;
  provider: CloudProvider;
  backup?: EncryptedBackup;
  error?: string;
}

/**
 * Platform availability info
 */
export interface PlatformAvailability {
  icloud: boolean;
  googleDrive: boolean;
  localFile: boolean;
}

// Native module availability flags
let iCloudModule: any = null;
let googleSignInModule: any = null;

// Try to load native modules (won't work in Expo Go)
try {
  // @ts-ignore - Optional dependency
  iCloudModule = require('react-native-cloud-store');
} catch {
  console.log('[CloudBackup] iCloud module not available');
}

try {
  // @ts-ignore - Optional dependency
  googleSignInModule = require('@react-native-google-signin/google-signin');
} catch {
  console.log('[CloudBackup] Google Sign-In module not available');
}

/**
 * Check which cloud providers are available on this platform
 */
export function getAvailableProviders(): PlatformAvailability {
  return {
    icloud: Platform.OS === 'ios' && iCloudModule !== null,
    googleDrive: Platform.OS === 'android' && googleSignInModule !== null,
    localFile: true, // Always available
  };
}

/**
 * Get the default provider for the current platform
 */
export function getDefaultProvider(): CloudProvider {
  const availability = getAvailableProviders();

  if (Platform.OS === 'ios' && availability.icloud) {
    return 'icloud';
  }
  if (Platform.OS === 'android' && availability.googleDrive) {
    return 'google_drive';
  }
  return 'local_file';
}

// ============================================================================
// iCloud Implementation (iOS)
// ============================================================================

async function uploadToICloud(backup: EncryptedBackup): Promise<CloudBackupResult> {
  if (!iCloudModule) {
    return {
      success: false,
      provider: 'icloud',
      error: 'iCloud not available. Please use a development build.',
    };
  }

  try {
    const filename = createBackupFilename('discard-seed-backup');
    const content = serializeBackup(backup);

    // iCloud Documents API
    await iCloudModule.writeFile(`Documents/${filename}`, content, 'utf8');

    return {
      success: true,
      provider: 'icloud',
      backupId: filename,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      provider: 'icloud',
      error: error instanceof Error ? error.message : 'iCloud upload failed',
    };
  }
}

async function downloadFromICloud(): Promise<CloudRestoreResult> {
  if (!iCloudModule) {
    return {
      success: false,
      provider: 'icloud',
      error: 'iCloud not available. Please use a development build.',
    };
  }

  try {
    // List files in iCloud Documents
    const files = await iCloudModule.readDir('Documents');
    const backupFiles = files.filter((f: any) =>
      f.name.startsWith('discard-') && f.name.endsWith('.json')
    );

    if (backupFiles.length === 0) {
      return {
        success: false,
        provider: 'icloud',
        error: 'No backup found in iCloud',
      };
    }

    // Get most recent backup
    const mostRecent = backupFiles.sort((a: any, b: any) => b.modTime - a.modTime)[0];
    const content = await iCloudModule.readFile(`Documents/${mostRecent.name}`, 'utf8');
    const backup = parseBackup(content);

    return {
      success: true,
      provider: 'icloud',
      backup,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'icloud',
      error: error instanceof Error ? error.message : 'iCloud download failed',
    };
  }
}

// ============================================================================
// Google Drive Implementation (Android)
// ============================================================================

async function uploadToGoogleDrive(backup: EncryptedBackup): Promise<CloudBackupResult> {
  if (!googleSignInModule) {
    return {
      success: false,
      provider: 'google_drive',
      error: 'Google Drive not available. Please use a development build.',
    };
  }

  try {
    // Ensure user is signed in
    const { GoogleSignin } = googleSignInModule;
    await GoogleSignin.hasPlayServices();

    const isSignedIn = await GoogleSignin.isSignedIn();
    if (!isSignedIn) {
      await GoogleSignin.signIn();
    }

    const tokens = await GoogleSignin.getTokens();
    const accessToken = tokens.accessToken;

    const filename = createBackupFilename('discard-seed-backup');
    const content = serializeBackup(backup);

    // Upload to Google Drive App Data folder (private to app)
    const metadata = {
      name: filename,
      mimeType: 'application/json',
      parents: ['appDataFolder'],
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'application/json' }));

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      }
    );

    if (!response.ok) {
      throw new Error(`Google Drive upload failed: ${response.status}`);
    }

    const result = await response.json();

    return {
      success: true,
      provider: 'google_drive',
      backupId: result.id,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      provider: 'google_drive',
      error: error instanceof Error ? error.message : 'Google Drive upload failed',
    };
  }
}

async function downloadFromGoogleDrive(): Promise<CloudRestoreResult> {
  if (!googleSignInModule) {
    return {
      success: false,
      provider: 'google_drive',
      error: 'Google Drive not available. Please use a development build.',
    };
  }

  try {
    const { GoogleSignin } = googleSignInModule;
    await GoogleSignin.hasPlayServices();

    const isSignedIn = await GoogleSignin.isSignedIn();
    if (!isSignedIn) {
      await GoogleSignin.signIn();
    }

    const tokens = await GoogleSignin.getTokens();
    const accessToken = tokens.accessToken;

    // List files in app data folder
    const listResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name contains 'discard-'`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!listResponse.ok) {
      throw new Error('Failed to list Google Drive files');
    }

    const listResult = await listResponse.json();
    const files = listResult.files || [];

    if (files.length === 0) {
      return {
        success: false,
        provider: 'google_drive',
        error: 'No backup found in Google Drive',
      };
    }

    // Get most recent file
    const mostRecent = files[0];

    // Download file content
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${mostRecent.id}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!downloadResponse.ok) {
      throw new Error('Failed to download backup from Google Drive');
    }

    const content = await downloadResponse.text();
    const backup = parseBackup(content);

    return {
      success: true,
      provider: 'google_drive',
      backup,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'google_drive',
      error: error instanceof Error ? error.message : 'Google Drive download failed',
    };
  }
}

// ============================================================================
// Local File Implementation (All Platforms)
// ============================================================================

/**
 * Save backup as a local file (triggers download on web, share sheet on native)
 */
async function saveToLocalFile(backup: EncryptedBackup): Promise<CloudBackupResult> {
  try {
    const filename = createBackupFilename('discard-seed-backup');
    const content = serializeBackup(backup);

    if (Platform.OS === 'web') {
      // Web: Trigger download
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return {
        success: true,
        provider: 'local_file',
        backupId: filename,
        timestamp: Date.now(),
      };
    } else {
      // Native: Save to cache and share
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Save Backup File',
          UTI: 'public.json',
        });
      }

      return {
        success: true,
        provider: 'local_file',
        backupId: filename,
        timestamp: Date.now(),
      };
    }
  } catch (error) {
    return {
      success: false,
      provider: 'local_file',
      error: error instanceof Error ? error.message : 'Failed to save backup file',
    };
  }
}

/**
 * Load backup from a local file (file picker)
 */
async function loadFromLocalFile(): Promise<CloudRestoreResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return {
        success: false,
        provider: 'local_file',
        error: 'File selection cancelled',
      };
    }

    const file = result.assets[0];
    if (!file || !file.uri) {
      return {
        success: false,
        provider: 'local_file',
        error: 'No file selected',
      };
    }

    let content: string;

    if (Platform.OS === 'web') {
      // Web: Read from blob URL
      const response = await fetch(file.uri);
      content = await response.text();
    } else {
      // Native: Read from file system
      content = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    const backup = parseBackup(content);

    return {
      success: true,
      provider: 'local_file',
      backup,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'local_file',
      error: error instanceof Error ? error.message : 'Failed to load backup file',
    };
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Upload encrypted backup to cloud storage
 */
export async function uploadBackup(
  backup: EncryptedBackup,
  provider?: CloudProvider
): Promise<CloudBackupResult> {
  const targetProvider = provider || getDefaultProvider();

  switch (targetProvider) {
    case 'icloud':
      return uploadToICloud(backup);
    case 'google_drive':
      return uploadToGoogleDrive(backup);
    case 'local_file':
      return saveToLocalFile(backup);
    default:
      return {
        success: false,
        provider: targetProvider,
        error: `Unsupported provider: ${targetProvider}`,
      };
  }
}

/**
 * Download and restore backup from cloud storage
 */
export async function downloadBackup(
  provider?: CloudProvider
): Promise<CloudRestoreResult> {
  const targetProvider = provider || getDefaultProvider();

  switch (targetProvider) {
    case 'icloud':
      return downloadFromICloud();
    case 'google_drive':
      return downloadFromGoogleDrive();
    case 'local_file':
      return loadFromLocalFile();
    default:
      return {
        success: false,
        provider: targetProvider,
        error: `Unsupported provider: ${targetProvider}`,
      };
  }
}

/**
 * Check if backup exists in cloud storage
 */
export async function hasCloudBackup(provider?: CloudProvider): Promise<boolean> {
  const targetProvider = provider || getDefaultProvider();

  // For local file, we can't check automatically
  if (targetProvider === 'local_file') {
    return false;
  }

  const result = await downloadBackup(targetProvider);
  return result.success;
}

/**
 * Get display name for provider
 */
export function getProviderDisplayName(provider: CloudProvider): string {
  switch (provider) {
    case 'icloud':
      return 'iCloud';
    case 'google_drive':
      return 'Google Drive';
    case 'local_file':
      return 'Local File';
    default:
      return 'Unknown';
  }
}

/**
 * Get icon name for provider
 */
export function getProviderIcon(provider: CloudProvider): string {
  switch (provider) {
    case 'icloud':
      return 'cloud';
    case 'google_drive':
      return 'logo-google';
    case 'local_file':
      return 'download';
    default:
      return 'cloud-offline';
  }
}
