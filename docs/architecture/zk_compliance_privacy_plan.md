# Architectural Plan: ZK-Proof Based Privacy & Compliance

## 1. Objective

To design and implement a system that allows users to fund their accounts directly from a self-custodied crypto wallet while:
1.  Preserving user privacy by preventing the service from linking user identities to on-chain wallet addresses and transaction history.
2.  Ensuring a clear and auditable path for compliance with lawful subpoenas.

This document outlines the proposed architecture and the phased plan for implementation.

## 2. Core Architecture

The system will be composed of three distinct components that segregate duties to ensure privacy:

1.  **The User's Client:** The user's browser or mobile app, responsible for generating the ZK-proof.
2.  **Our Service (The Verifier):** Our backend, which receives funds and verifies the ZK-proof without ever learning the user's wallet address.
3.  **The Compliance Oracle:** A trusted, independent entity (either built or partnered) that performs a one-time KYC check on the user and issues a signed attestation. This is the only component that can link a real-world identity to a wallet address.

## 3. Phased Implementation Plan

### Phase 1: Architectural Design & Feasibility (Current Phase)
*   **Goal:** Make key technology choices and produce a detailed technical specification.
*   **Action Items:**
    *   [ ] Research and select a ZK-proof system (e.g., Circom/snarkjs, ZoKrates, Halo2).
    *   [ ] Research and select a strategy for the Compliance Oracle (Build vs. Buy/Partner). - Partner/Buy w/ Alchemy.
    *   [ ] Develop a detailed threat model for the chosen architecture.
    *   [ ] Define the full API specifications for all components.

### Phase 2: Proof of Concept (PoC)
*   **Goal:** Build a minimal, standalone prototype to validate the core cryptographic flow.

### Phase 3: Integration & Development
*   **Goal:** Build the production-ready feature and integrate it into the application.

### Phase 4: Security Audit & Launch
*   **Goal:** Have the implementation audited by a third-party security firm before launch.

## 4. Key Open Questions

*   Which ZK-proof library offers the best trade-off between performance, security, and developer experience for our stack?
*   What is the estimated client-side computational cost for proof generation? How will this impact user experience?
*   Who are potential industry partners for the Compliance Oracle role (e.g., existing KYC/identity providers)?
