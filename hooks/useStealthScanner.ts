/**
 * Stealth Scanner Hook — Recipient-side discovery for private transfers
 *
 * Uses Convex reactive queries on privateTransferNotes table.
 * Decrypts notes using user's private key + ephemeral public key (NaCl ECDH).
 * Returns list of claimable transfers with amounts, token, timestamps.
 *
 * Claim flow: derives stealth keypair → sweeps funds to user's main wallet.
 */

import { useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth, getLocalSolanaKeypair } from "@/stores/authConvex";
import { sha256 as sha256Hash } from "@noble/hashes/sha2.js";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import bs58 from "bs58";
import { Keypair, Connection, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction as createSplTransferInstruction,
  createCloseAccountInstruction,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import type { Id } from "@/convex/_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

export interface ClaimableTransfer {
  noteId: Id<"privateTransferNotes">;
  stealthAddress: string;
  ephemeralPubKey: string;
  amount: number;
  token: string;
  tokenSymbol: string;
  createdAt: number;
  /** Decrypted memo (if any) */
  memo?: string;
}

interface UseStealthScannerReturn {
  /** List of claimable (unclaimed) private transfers */
  claimableTransfers: ClaimableTransfer[];
  /** Number of unclaimed transfers (for badge) */
  claimableCount: number;
  /** Whether the scanner is loading */
  isLoading: boolean;
  /** Claim a specific transfer (sweep stealth → main wallet) */
  claimTransfer: (noteId: Id<"privateTransferNotes">) => Promise<{ success: boolean; txSignature?: string; error?: string }>;
}

// ============================================================================
// Helpers
// ============================================================================

const RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL || "https://api.devnet.solana.com";

function sha256(data: Uint8Array | string): Uint8Array {
  const input = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return sha256Hash(input);
}

/**
 * Compute recipientHash = hex(SHA-256(publicKeyBase58))
 */
function computeRecipientHash(publicKeyBase58: string): string {
  const hash = sha256(new TextEncoder().encode(publicKeyBase58));
  return bs58.encode(hash);
}

/**
 * Derive the stealth keypair from ephemeral public key + recipient's private key.
 * Must match the derivation in ShadowWireService.generateStealthAddress().
 */
function deriveStealthKeypair(
  ephemeralPubKeyBase58: string,
  recipientPrivateKey: Uint8Array
): Keypair {
  const ephemeralPubKeyBytes = bs58.decode(ephemeralPubKeyBase58);

  // ECDH: shared secret = hash(recipientPrivate || ephemeralPublic)
  const sharedSecretInput = new Uint8Array([
    ...recipientPrivateKey.slice(0, 32),
    ...ephemeralPubKeyBytes.slice(0, 32),
  ]);
  const sharedSecret = sha256(sharedSecretInput);
  const stealthSeed = sha256(sharedSecret);

  return Keypair.fromSeed(stealthSeed.slice(0, 32));
}

/**
 * Try to decrypt an encrypted note using recipient's keypair and the ephemeral public key.
 */
function tryDecryptNote(
  encryptedNote: string,
  ephemeralPubKeyBase58: string,
  recipientPrivateKey: Uint8Array
): { amount: number; tokenMint?: string; memo?: string } | null {
  try {
    const ephemeralPubKey = bs58.decode(ephemeralPubKeyBase58);
    const fullCiphertext = bs58.decode(encryptedNote);
    const nonce = fullCiphertext.slice(0, nacl.box.nonceLength);
    const ciphertext = fullCiphertext.slice(nacl.box.nonceLength);

    const decrypted = nacl.box.open(
      ciphertext,
      nonce,
      ephemeralPubKey.slice(0, 32),
      recipientPrivateKey.slice(0, 32)
    );

    if (!decrypted) return null;

    const content = JSON.parse(naclUtil.encodeUTF8(decrypted));
    return {
      amount: content.amount,
      tokenMint: content.tokenMint,
      memo: content.memo,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useStealthScanner(): UseStealthScannerReturn {
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || null;

  // Compute recipientHash for reactive query
  const recipientHash = useMemo(() => {
    if (!walletAddress) return null;
    return computeRecipientHash(walletAddress);
  }, [walletAddress]);

  // Reactive query — auto-updates when new notes arrive or are claimed
  const rawNotes = useQuery(
    api.shadowwire.privateTransferNotes.getNotesForRecipient,
    recipientHash ? { recipientHash } : "skip"
  );

  const claimableCount = useQuery(
    api.shadowwire.privateTransferNotes.getClaimableCount,
    recipientHash ? { recipientHash } : "skip"
  );

  const markClaimed = useMutation(api.shadowwire.privateTransferNotes.markNoteClaimed);

  // Transform raw notes into ClaimableTransfer objects
  const claimableTransfers: ClaimableTransfer[] = useMemo(() => {
    if (!rawNotes) return [];

    return rawNotes.map((note) => ({
      noteId: note._id,
      stealthAddress: note.stealthAddress,
      ephemeralPubKey: note.ephemeralPubKey,
      amount: note.amount ?? 0,
      token: note.token ?? "native",
      tokenSymbol: note.tokenSymbol ?? "SOL",
      createdAt: note.createdAt,
    }));
  }, [rawNotes]);

  // Claim a transfer: derive stealth keypair, sweep funds to main wallet
  const claimTransfer = useCallback(
    async (noteId: Id<"privateTransferNotes">): Promise<{ success: boolean; txSignature?: string; error?: string }> => {
      if (!walletAddress) {
        return { success: false, error: "No wallet address" };
      }

      const note = claimableTransfers.find((n) => n.noteId === noteId);
      if (!note) {
        return { success: false, error: "Note not found" };
      }

      try {
        // Get user's local keypair for deriving the stealth key
        const localKeypair = await getLocalSolanaKeypair();
        if (!localKeypair) {
          return { success: false, error: "No signing key available" };
        }

        // Derive the stealth keypair (must match sender's derivation)
        const stealthKeypair = deriveStealthKeypair(
          note.ephemeralPubKey,
          localKeypair.secretKey
        );

        // Verify the stealth address matches
        if (stealthKeypair.publicKey.toBase58() !== note.stealthAddress) {
          return { success: false, error: "Stealth address mismatch — cannot claim" };
        }

        // Build sweep transaction: stealth → main wallet
        const connection = new Connection(RPC_URL, "confirmed");
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

        const isNativeSOL = !note.token || note.token === "native" || note.token === "So11111111111111111111111111111111111111112";
        const transaction = new Transaction();

        if (isNativeSOL) {
          // Native SOL sweep
          const balance = await connection.getBalance(stealthKeypair.publicKey);
          if (balance === 0) {
            return { success: false, error: "Stealth address has no balance" };
          }

          // Leave enough for fee (5000 lamports)
          const sweepAmount = balance - 5000;
          if (sweepAmount <= 0) {
            return { success: false, error: "Balance too low to cover transaction fee" };
          }

          transaction.add(
            SystemProgram.transfer({
              fromPubkey: stealthKeypair.publicKey,
              toPubkey: localKeypair.publicKey,
              lamports: sweepAmount,
            })
          );
        } else {
          // SPL token sweep
          const mintPubkey = new PublicKey(note.token);
          const stealthAta = await getAssociatedTokenAddress(mintPubkey, stealthKeypair.publicKey);
          const recipientAta = await getAssociatedTokenAddress(mintPubkey, localKeypair.publicKey);

          // Check stealth ATA balance
          let tokenBalance: bigint;
          try {
            const account = await getAccount(connection, stealthAta);
            tokenBalance = account.amount;
          } catch (err) {
            if (err instanceof TokenAccountNotFoundError) {
              return { success: false, error: "No token account found at stealth address" };
            }
            throw err;
          }

          if (tokenBalance === BigInt(0)) {
            return { success: false, error: "Stealth token account has zero balance" };
          }

          // Transfer all SPL tokens from stealth ATA → recipient ATA
          transaction.add(
            createSplTransferInstruction(
              stealthAta,
              recipientAta,
              stealthKeypair.publicKey,
              tokenBalance
            )
          );

          // Close the empty stealth ATA to reclaim rent (SOL goes to stealth keypair)
          transaction.add(
            createCloseAccountInstruction(
              stealthAta,
              stealthKeypair.publicKey, // rent destination
              stealthKeypair.publicKey  // authority
            )
          );

          // Sweep any remaining SOL from stealth address to main wallet
          const solBalance = await connection.getBalance(stealthKeypair.publicKey);
          // After close we'll have rent back; leave 5000 for fee
          const remainingSol = solBalance - 5000;
          if (remainingSol > 0) {
            transaction.add(
              SystemProgram.transfer({
                fromPubkey: stealthKeypair.publicKey,
                toPubkey: localKeypair.publicKey,
                lamports: remainingSol,
              })
            );
          }
        }

        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = stealthKeypair.publicKey;
        transaction.sign(stealthKeypair);

        const txSignature = await connection.sendRawTransaction(
          transaction.serialize(),
          { skipPreflight: false }
        );

        await connection.confirmTransaction(
          { signature: txSignature, blockhash, lastValidBlockHeight },
          "confirmed"
        );

        // Mark note as claimed in Convex
        await markClaimed({
          noteId,
          claimTxSignature: txSignature,
        });

        return { success: true, txSignature };
      } catch (error) {
        console.error("[StealthScanner] Claim failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Claim failed",
        };
      }
    },
    [walletAddress, claimableTransfers, markClaimed]
  );

  return {
    claimableTransfers,
    claimableCount: claimableCount ?? 0,
    isLoading: rawNotes === undefined,
    claimTransfer,
  };
}
