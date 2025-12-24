/**
 * DisCard 2035 - Convex DID Functions
 *
 * Server-side functions for managing DID documents and commitments.
 * Integrates with Light Protocol for on-chain anchoring.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
  internalAction,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Validators
// ============================================================================

const verificationMethodValidator = v.object({
  id: v.string(),
  type: v.string(),
  publicKeyJwk: v.optional(
    v.object({
      kty: v.string(),
      crv: v.string(),
      x: v.string(),
      y: v.string(),
    })
  ),
  publicKeyMultibase: v.optional(v.string()),
  controller: v.string(),
});

const recoveryGuardianValidator = v.object({
  guardianDid: v.string(),
  attestationHash: v.string(),
  addedAt: v.number(),
  status: v.union(v.literal("active"), v.literal("revoked")),
});

const serviceValidator = v.object({
  id: v.string(),
  type: v.string(),
  serviceEndpoint: v.string(),
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get a DID document by DID string
 */
export const getByDid = query({
  args: { did: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("didDocuments")
      .withIndex("by_did", (q) => q.eq("did", args.did))
      .first();
  },
});

/**
 * Get a DID document by user ID
 */
export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("didDocuments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

/**
 * Get all DID documents for a user (in case of multiple personas)
 */
export const getAllByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("didDocuments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Verify a commitment hash exists on-chain
 */
export const verifyCommitment = query({
  args: { commitmentHash: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("didDocuments")
      .withIndex("by_commitment", (q) => q.eq("commitmentHash", args.commitmentHash))
      .first();

    return {
      exists: doc !== null,
      did: doc?.did,
      status: doc?.status,
    };
  },
});

/**
 * Get recovery guardians for a DID
 */
export const getRecoveryGuardians = query({
  args: { didDocumentId: v.id("didDocuments") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.didDocumentId);
    if (!doc) return [];

    return doc.recoveryGuardians.filter((g) => g.status === "active");
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

export const getByIdInternal = internalQuery({
  args: { id: v.id("didDocuments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new DID document
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    did: v.string(),
    documentHash: v.string(),
    commitmentHash: v.string(),
    verificationMethods: v.array(verificationMethodValidator),
    authentication: v.array(v.string()),
    assertionMethod: v.optional(v.array(v.string())),
    keyAgreement: v.optional(v.array(v.string())),
    recoveryThreshold: v.number(),
    services: v.optional(v.array(serviceValidator)),
  },
  handler: async (ctx, args) => {
    // Check if DID already exists
    const existing = await ctx.db
      .query("didDocuments")
      .withIndex("by_did", (q) => q.eq("did", args.did))
      .first();

    if (existing) {
      throw new Error(`DID already exists: ${args.did}`);
    }

    const now = Date.now();

    const id = await ctx.db.insert("didDocuments", {
      userId: args.userId,
      did: args.did,
      documentHash: args.documentHash,
      commitmentHash: args.commitmentHash,
      verificationMethods: args.verificationMethods,
      authentication: args.authentication,
      assertionMethod: args.assertionMethod,
      keyAgreement: args.keyAgreement,
      recoveryThreshold: args.recoveryThreshold,
      recoveryGuardians: [],
      services: args.services,
      status: "creating",
      keyRotationCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Activate a DID document (after on-chain anchoring)
 */
export const activate = mutation({
  args: {
    id: v.id("didDocuments"),
    merkleRoot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("DID document not found");
    }

    await ctx.db.patch(args.id, {
      status: "active",
      merkleRoot: args.merkleRoot,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update the commitment hash (after document update)
 */
export const updateCommitment = mutation({
  args: {
    id: v.id("didDocuments"),
    documentHash: v.string(),
    commitmentHash: v.string(),
    merkleRoot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      documentHash: args.documentHash,
      commitmentHash: args.commitmentHash,
      merkleRoot: args.merkleRoot,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Add a recovery guardian
 */
export const addRecoveryGuardian = mutation({
  args: {
    id: v.id("didDocuments"),
    guardian: recoveryGuardianValidator,
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("DID document not found");
    }

    // Check if guardian already exists
    const existing = doc.recoveryGuardians.find(
      (g) => g.guardianDid === args.guardian.guardianDid
    );
    if (existing && existing.status === "active") {
      throw new Error("Guardian already exists");
    }

    const updatedGuardians = existing
      ? doc.recoveryGuardians.map((g) =>
          g.guardianDid === args.guardian.guardianDid
            ? { ...args.guardian, status: "active" as const }
            : g
        )
      : [...doc.recoveryGuardians, args.guardian];

    await ctx.db.patch(args.id, {
      recoveryGuardians: updatedGuardians,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Revoke a recovery guardian
 */
export const revokeRecoveryGuardian = mutation({
  args: {
    id: v.id("didDocuments"),
    guardianDid: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("DID document not found");
    }

    const updatedGuardians = doc.recoveryGuardians.map((g) =>
      g.guardianDid === args.guardianDid
        ? { ...g, status: "revoked" as const }
        : g
    );

    await ctx.db.patch(args.id, {
      recoveryGuardians: updatedGuardians,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Add a verification method (key rotation)
 */
export const addVerificationMethod = mutation({
  args: {
    id: v.id("didDocuments"),
    verificationMethod: verificationMethodValidator,
    setAsAuthentication: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("DID document not found");
    }

    const updatedMethods = [...doc.verificationMethods, args.verificationMethod];
    const updates: Record<string, unknown> = {
      verificationMethods: updatedMethods,
      keyRotationCount: doc.keyRotationCount + 1,
      lastKeyRotationAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (args.setAsAuthentication) {
      updates.authentication = [args.verificationMethod.id];
    }

    await ctx.db.patch(args.id, updates);
  },
});

/**
 * Add a service endpoint
 */
export const addService = mutation({
  args: {
    id: v.id("didDocuments"),
    service: serviceValidator,
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("DID document not found");
    }

    const updatedServices = [...(doc.services ?? []), args.service];

    await ctx.db.patch(args.id, {
      services: updatedServices,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Remove a service endpoint
 */
export const removeService = mutation({
  args: {
    id: v.id("didDocuments"),
    serviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("DID document not found");
    }

    const updatedServices = (doc.services ?? []).filter(
      (s) => s.id !== args.serviceId
    );

    await ctx.db.patch(args.id, {
      services: updatedServices,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Suspend a DID document
 */
export const suspend = mutation({
  args: { id: v.id("didDocuments") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "suspended",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Revoke a DID document (permanent)
 */
export const revoke = mutation({
  args: { id: v.id("didDocuments") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "revoked",
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

export const updateMerkleRoot = internalMutation({
  args: {
    id: v.id("didDocuments"),
    merkleRoot: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      merkleRoot: args.merkleRoot,
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// Recovery Attestations
// ============================================================================

/**
 * Create a recovery attestation request
 */
export const createRecoveryAttestation = mutation({
  args: {
    didDocumentId: v.id("didDocuments"),
    guardianDid: v.string(),
    guardianUserId: v.optional(v.id("users")),
    attestationType: v.union(
      v.literal("sas_recovery"),
      v.literal("manual_verification"),
      v.literal("social_vouching")
    ),
    newKeyCommitment: v.optional(v.string()),
    recoveryReason: v.optional(v.string()),
    expiresInHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + (args.expiresInHours ?? 72) * 60 * 60 * 1000; // Default 72 hours

    const id = await ctx.db.insert("recoveryAttestations", {
      didDocumentId: args.didDocumentId,
      guardianDid: args.guardianDid,
      guardianUserId: args.guardianUserId,
      attestationType: args.attestationType,
      newKeyCommitment: args.newKeyCommitment,
      recoveryReason: args.recoveryReason,
      status: "pending",
      requestedAt: now,
      expiresAt,
    });

    return id;
  },
});

/**
 * Approve a recovery attestation
 */
export const approveRecoveryAttestation = mutation({
  args: {
    id: v.id("recoveryAttestations"),
    zkProof: v.optional(v.bytes()),
    zkProofPublicInputs: v.optional(v.array(v.string())),
    sasAttestationId: v.optional(v.string()),
    sasAttestationAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attestation = await ctx.db.get(args.id);
    if (!attestation) {
      throw new Error("Attestation not found");
    }

    if (attestation.status !== "pending") {
      throw new Error(`Cannot approve attestation in ${attestation.status} status`);
    }

    if (Date.now() > attestation.expiresAt) {
      await ctx.db.patch(args.id, { status: "expired" });
      throw new Error("Attestation has expired");
    }

    await ctx.db.patch(args.id, {
      status: "approved",
      zkProof: args.zkProof,
      zkProofPublicInputs: args.zkProofPublicInputs,
      sasAttestationId: args.sasAttestationId,
      sasAttestationAddress: args.sasAttestationAddress,
      respondedAt: Date.now(),
    });
  },
});

/**
 * Reject a recovery attestation
 */
export const rejectRecoveryAttestation = mutation({
  args: { id: v.id("recoveryAttestations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "rejected",
      respondedAt: Date.now(),
    });
  },
});

/**
 * Get pending recovery attestations for a guardian
 */
export const getPendingAttestationsForGuardian = query({
  args: { guardianDid: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("recoveryAttestations")
      .withIndex("by_guardian", (q) => q.eq("guardianDid", args.guardianDid))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

/**
 * Get approved attestations for a DID document
 */
export const getApprovedAttestations = query({
  args: { didDocumentId: v.id("didDocuments") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("recoveryAttestations")
      .withIndex("by_document", (q) => q.eq("didDocumentId", args.didDocumentId))
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();
  },
});
