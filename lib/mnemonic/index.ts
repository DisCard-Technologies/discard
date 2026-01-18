/**
 * Mnemonic Module
 *
 * BIP39 seed phrase generation and secure storage
 */

export {
  // BIP39 Wallet
  generateMnemonic,
  generateMnemonic24,
  validateMnemonic,
  deriveKeypairFromMnemonic,
  deriveMultipleAccounts,
  getMnemonicFingerprint,
  getWordlist,
  suggestWords,
  splitMnemonic,
  joinMnemonic,
  SOLANA_DERIVATION_PATH,
  type MnemonicValidation,
  type MnemonicWallet,
} from './bip39-wallet';

export {
  // Mnemonic Storage
  storeMnemonicLocally,
  getMnemonicLocally,
  hasMnemonicWallet,
  getWalletType,
  setWalletType,
  getMnemonicMetadata,
  updateBackupStatus,
  getBackupStatus,
  deleteMnemonicLocally,
  clearAllMnemonicStorage,
  migrateToMnemonicWallet,
  verifyMnemonicFingerprint,
  type WalletType,
  type BackupStatus,
  type MnemonicMetadata,
} from './mnemonic-storage';
