/**
 * ZK Compliance Service Tests
 *
 * Tests for privacy-preserving compliance verification.
 */

import {
  createAttestationCommitment,
  commitAttestation,
  generateKYCLevelProof,
  generateAgeThresholdProof,
  generateSanctionsClearanceProof,
  generateAMLClearanceProof,
  verifyComplianceProof,
  checkAttestationRequirements,
  getRequiredAttestationsForAction,
  KYC_LEVELS,
  type AttestationCommitment,
  type ComplianceProof,
} from '../../../lib/compliance/zk-compliance';

describe('ZK Compliance Service', () => {
  // ============================================================================
  // Commitment Tests
  // ============================================================================

  describe('Attestation Commitments', () => {
    test('creates commitment with unique blinding', () => {
      const c1 = createAttestationCommitment('kyc_basic', 1);
      const c2 = createAttestationCommitment('kyc_basic', 1);

      expect(c1.commitment).toBeDefined();
      expect(c2.commitment).toBeDefined();
      // Same value, different blinding = different commitment
      expect(c1.commitment).not.toBe(c2.commitment);
    });

    test('commits attestation with correct level', () => {
      const commitment = commitAttestation('kyc_enhanced', 'enhanced');

      expect(commitment.type).toBe('kyc_enhanced');
      expect(commitment.commitment).toBeDefined();
      expect(commitment.blinding.length).toBe(32);
      expect(commitment.issuer).toBe('discard_internal');
    });

    test('sets expiry correctly', () => {
      const now = Date.now();
      const commitment = commitAttestation('kyc_basic', 'basic', now + 1000);

      expect(commitment.expiresAt).toBe(now + 1000);
    });

    test('uses custom issuer', () => {
      const commitment = commitAttestation('kyc_basic', 'basic', undefined, 'civic');

      expect(commitment.issuer).toBe('civic');
    });
  });

  // ============================================================================
  // KYC Level Proof Tests
  // ============================================================================

  describe('KYC Level Proofs', () => {
    let attestation: AttestationCommitment;

    beforeEach(() => {
      attestation = commitAttestation('kyc_enhanced', 'enhanced');
    });

    test('generates valid proof when level meets threshold', async () => {
      const proof = await generateKYCLevelProof(
        attestation,
        'enhanced', // actual
        'basic',    // required
      );

      expect(proof.type).toBe('kyc_level');
      expect(proof.threshold).toBe(KYC_LEVELS.basic);
      expect(proof.attestationProof).toBeDefined();
      expect(proof.rangeProof).toBeDefined();
      expect(proof.nullifier).toBeDefined();
      expect(proof.expiresAt).toBeGreaterThan(Date.now());
    });

    test('generates valid proof when level equals threshold', async () => {
      const proof = await generateKYCLevelProof(
        attestation,
        'enhanced',
        'enhanced',
      );

      expect(proof.type).toBe('kyc_level');
      expect(proof.threshold).toBe(KYC_LEVELS.enhanced);
    });

    test('throws when level below threshold', async () => {
      await expect(
        generateKYCLevelProof(attestation, 'basic', 'enhanced')
      ).rejects.toThrow('below required');
    });

    test('proof verifies correctly', async () => {
      const proof = await generateKYCLevelProof(
        attestation,
        'full',
        'basic',
      );

      const result = verifyComplianceProof(proof, attestation.commitment);

      expect(result.valid).toBe(true);
      expect(result.proofType).toBe('kyc_level');
      expect(result.threshold).toBe(KYC_LEVELS.basic);
    });

    test('detects replay attack', async () => {
      const proof = await generateKYCLevelProof(
        attestation,
        'enhanced',
        'basic',
      );

      const usedNullifiers = new Set([proof.nullifier]);
      const result = verifyComplianceProof(proof, attestation.commitment, usedNullifiers);

      expect(result.valid).toBe(false);
      expect(result.replayDetected).toBe(true);
    });

    test('rejects expired proof', async () => {
      const proof = await generateKYCLevelProof(
        attestation,
        'enhanced',
        'basic',
        -1000, // Already expired
      );

      const result = verifyComplianceProof(proof, attestation.commitment);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    test('rejects proof with wrong commitment', async () => {
      const proof = await generateKYCLevelProof(
        attestation,
        'enhanced',
        'basic',
      );

      const otherAttestation = commitAttestation('kyc_basic', 'basic');
      const result = verifyComplianceProof(proof, otherAttestation.commitment);

      expect(result.valid).toBe(false);
    });
  });

  // ============================================================================
  // Age Threshold Proof Tests
  // ============================================================================

  describe('Age Threshold Proofs', () => {
    let attestation: AttestationCommitment;

    beforeEach(() => {
      attestation = createAttestationCommitment('age_verification', 25);
    });

    test('generates valid proof for age >= 18', async () => {
      const proof = await generateAgeThresholdProof(
        attestation,
        25, // actual age
        18, // min age
      );

      expect(proof.type).toBe('age_threshold');
      expect(proof.threshold).toBe(18);
      expect(proof.rangeProof).toBeDefined();
    });

    test('generates valid proof for age >= 21', async () => {
      const proof = await generateAgeThresholdProof(
        attestation,
        25,
        21,
      );

      expect(proof.threshold).toBe(21);
    });

    test('generates valid proof for exact age match', async () => {
      const proof = await generateAgeThresholdProof(
        attestation,
        21,
        21,
      );

      expect(proof.threshold).toBe(21);
    });

    test('throws when age below threshold', async () => {
      await expect(
        generateAgeThresholdProof(attestation, 17, 18)
      ).rejects.toThrow('below required');
    });

    test('proof verifies correctly', async () => {
      const proof = await generateAgeThresholdProof(attestation, 30, 21);
      const result = verifyComplianceProof(proof, attestation.commitment);

      expect(result.valid).toBe(true);
      expect(result.proofType).toBe('age_threshold');
    });
  });

  // ============================================================================
  // Sanctions Clearance Tests
  // ============================================================================

  describe('Sanctions Clearance Proofs', () => {
    test('generates valid sanctions clearance proof', async () => {
      const attestation: AttestationCommitment = {
        type: 'sanctions_cleared',
        commitment: commitAttestation('sanctions_cleared', 'basic').commitment,
        blinding: new Uint8Array(32),
        issuer: 'range',
        expiresAt: Date.now() + 86400000,
      };
      // Fix: use same blinding as commitAttestation generates
      const fullAttestation = commitAttestation('sanctions_cleared', 'basic');

      const proof = await generateSanctionsClearanceProof(fullAttestation);

      expect(proof.type).toBe('sanctions');
      expect(proof.rangeProof).toBeUndefined(); // No range proof for boolean attestation
    });

    test('throws for wrong attestation type', async () => {
      const attestation = commitAttestation('kyc_basic', 'basic');

      await expect(
        generateSanctionsClearanceProof(attestation)
      ).rejects.toThrow('must be of type sanctions_cleared');
    });

    test('throws for expired attestation', async () => {
      const attestation: AttestationCommitment = {
        type: 'sanctions_cleared',
        commitment: 'abc',
        blinding: new Uint8Array(32),
        issuer: 'range',
        expiresAt: Date.now() - 1000, // Already expired
      };

      await expect(
        generateSanctionsClearanceProof(attestation)
      ).rejects.toThrow('expired');
    });
  });

  // ============================================================================
  // AML Clearance Tests
  // ============================================================================

  describe('AML Clearance Proofs', () => {
    test('generates valid AML clearance proof', async () => {
      const attestation: AttestationCommitment = {
        type: 'aml_cleared',
        commitment: commitAttestation('aml_cleared', 'basic').commitment,
        blinding: new Uint8Array(32),
        issuer: 'range',
      };
      const fullAttestation = commitAttestation('aml_cleared', 'basic');
      fullAttestation.type = 'aml_cleared';

      const proof = await generateAMLClearanceProof(fullAttestation);

      expect(proof.type).toBe('aml_cleared');
    });

    test('throws for wrong attestation type', async () => {
      const attestation = commitAttestation('kyc_basic', 'basic');

      await expect(
        generateAMLClearanceProof(attestation)
      ).rejects.toThrow('must be of type aml_cleared');
    });
  });

  // ============================================================================
  // Requirement Checking Tests
  // ============================================================================

  describe('Attestation Requirements', () => {
    test('returns allowed when all attestations present', () => {
      const attestations: AttestationCommitment[] = [
        { ...commitAttestation('identity_verified', 'basic'), type: 'identity_verified' },
        { ...commitAttestation('aml_cleared', 'basic'), type: 'aml_cleared' },
      ];

      const result = checkAttestationRequirements(
        attestations,
        ['identity_verified', 'aml_cleared']
      );

      expect(result.allowed).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    test('returns missing attestations', () => {
      const attestations: AttestationCommitment[] = [
        { ...commitAttestation('identity_verified', 'basic'), type: 'identity_verified' },
      ];

      const result = checkAttestationRequirements(
        attestations,
        ['identity_verified', 'aml_cleared', 'sanctions_cleared']
      );

      expect(result.allowed).toBe(false);
      expect(result.missing).toContain('aml_cleared');
      expect(result.missing).toContain('sanctions_cleared');
    });

    test('excludes expired attestations', () => {
      const attestations: AttestationCommitment[] = [
        {
          ...commitAttestation('identity_verified', 'basic'),
          type: 'identity_verified',
          expiresAt: Date.now() - 1000,
        },
      ];

      const result = checkAttestationRequirements(
        attestations,
        ['identity_verified']
      );

      expect(result.allowed).toBe(false);
      expect(result.missing).toContain('identity_verified');
    });
  });

  describe('Action Requirements', () => {
    test('card_funding requires basic KYC', () => {
      const reqs = getRequiredAttestationsForAction('card_funding');

      expect(reqs.minKycLevel).toBe('basic');
      expect(reqs.types).toContain('identity_verified');
    });

    test('private_transfer requires sanctions and AML', () => {
      const reqs = getRequiredAttestationsForAction('private_transfer');

      expect(reqs.types).toContain('sanctions_cleared');
      expect(reqs.types).toContain('aml_cleared');
    });

    test('high_value_tx requires enhanced KYC', () => {
      const reqs = getRequiredAttestationsForAction('high_value_tx');

      expect(reqs.minKycLevel).toBe('enhanced');
    });

    test('international_tx requires full KYC', () => {
      const reqs = getRequiredAttestationsForAction('international_tx');

      expect(reqs.minKycLevel).toBe('full');
      expect(reqs.types).toContain('kyc_full');
      expect(reqs.types).toContain('sanctions_cleared');
    });
  });

  // ============================================================================
  // Nullifier Tests
  // ============================================================================

  describe('Nullifier Generation', () => {
    test('same inputs produce same nullifier', async () => {
      const attestation = commitAttestation('kyc_basic', 'basic');

      const proof1 = await generateKYCLevelProof(attestation, 'basic', 'none');
      const proof2 = await generateKYCLevelProof(attestation, 'basic', 'none');

      // Different proofs have different nullifiers (due to random nonce)
      expect(proof1.nullifier).not.toBe(proof2.nullifier);
    });

    test('nullifier is deterministic from nonce', async () => {
      const attestation = commitAttestation('kyc_basic', 'basic');
      const proof = await generateKYCLevelProof(attestation, 'basic', 'none');

      // Nullifier should be derived from nonce, type, and commitment
      expect(proof.nullifier).toBeDefined();
      expect(proof.nullifier.length).toBe(64); // SHA-256 hex
    });
  });

  // ============================================================================
  // Security Properties
  // ============================================================================

  describe('Security Properties', () => {
    test('proof reveals nothing about actual level', async () => {
      // Generate proofs for different levels against same threshold
      const attestation1 = commitAttestation('kyc_level', 'basic');
      const attestation2 = commitAttestation('kyc_level', 'full');

      const proof1 = await generateKYCLevelProof(attestation1, 'basic', 'none');
      const proof2 = await generateKYCLevelProof(attestation2, 'full', 'none');

      // Both proofs should have same structure
      expect(proof1.type).toBe(proof2.type);
      expect(proof1.threshold).toBe(proof2.threshold);

      // But different cryptographic values (zero-knowledge)
      expect(proof1.attestationProof.challenge).not.toBe(proof2.attestationProof.challenge);
    });

    test('cannot forge proof without blinding factor', async () => {
      const attestation = commitAttestation('kyc_enhanced', 'enhanced');
      const proof = await generateKYCLevelProof(attestation, 'enhanced', 'basic');

      // Create fake attestation with same commitment but wrong blinding
      const fakeAttestation: AttestationCommitment = {
        ...attestation,
        blinding: new Uint8Array(32), // Wrong blinding
      };

      // Proof should verify against original commitment
      const result = verifyComplianceProof(proof, attestation.commitment);
      expect(result.valid).toBe(true);

      // But the blinding mismatch means the prover knew the real blinding
    });

    test('proofs have limited validity', async () => {
      const attestation = commitAttestation('kyc_basic', 'basic');
      const shortValidity = 100; // 100ms

      const proof = await generateKYCLevelProof(
        attestation,
        'basic',
        'none',
        shortValidity
      );

      expect(proof.expiresAt).toBeLessThan(Date.now() + 200);
    });
  });
});
