# Future Vision: Dual AI Intent System

> This document describes the long-term vision for DisCard's AI architecture. The current implementation uses a simplified single-LLM approach for cost efficiency. This architecture will be activated for high-value transactions and advanced use cases.

## Overview

The Dual AI system consists of two specialized agents running in separate Trusted Execution Environments (TEEs):

```
User Intent
    ↓
┌─────────────────────────────────────────────────────────────┐
│                     BRAIN ORCHESTRATOR                       │
│              (Phala Cloud TEE - Intent Parsing)              │
│                                                              │
│  - Natural language understanding                            │
│  - Multi-turn conversation management                        │
│  - Intent classification and extraction                      │
│  - Execution planning (multi-step operations)                │
│  - Context awareness (user history, preferences)             │
└─────────────────────────────────────────────────────────────┘
                    ↓ Parsed Intent
┌─────────────────────────────────────────────────────────────┐
│                     SOUL (FINANCIAL ARMOR)                   │
│              (Phala Cloud TEE - Verification)                │
│                                                              │
│  - Intent verification (validate Brain's parsing)           │
│  - Velocity limit enforcement                                │
│  - Merchant risk scoring                                     │
│  - Fraud detection signals                                   │
│  - Policy compliance checks                                  │
│  - Cryptographic signing of approved intents                 │
└─────────────────────────────────────────────────────────────┘
                    ↓ Signed Approval
              Transaction Execution
```

## Why Dual AI?

### 1. Mutual Verification
Each AI validates the other's decisions, preventing single points of failure:
- Brain parses "Send $5000 to alice.sol" → Soul verifies this matches user limits
- Soul flags unusual merchant → Brain asks user for confirmation
- Neither can approve high-risk transactions alone

### 2. Separation of Concerns
- **Brain:** Optimized for NLU, conversation, and planning
- **Soul:** Optimized for security, compliance, and risk assessment

### 3. TEE Isolation
Both agents run in hardware-isolated enclaves:
- Private keys never leave the TEE
- Attestation proves code integrity
- User data protected from operators

### 4. Defense in Depth
Even if one AI is compromised or manipulated:
- The other provides a security checkpoint
- Cryptographic audit trail for all decisions
- Rate limiting at both layers

## Architecture Components

### Brain Orchestrator

**Location:** `packages/plugin-brain-orchestrator/`

**Responsibilities:**
- Parse natural language into structured intents
- Manage conversation context across sessions
- Generate multi-step execution plans
- Coordinate tool calls and API integrations
- Handle clarification dialogs

**Key Services:**
```
services/
├── llmService.ts        # LLM API wrapper (Phala RedPill)
├── intentParser.ts      # NL → structured intent
├── contextManager.ts    # Session/conversation state
├── planningEngine.ts    # Multi-step plan generation
└── toolOrchestrator.ts  # Tool coordination
```

**Character Config:** `characters/neutral_orchestrator.json`
- Pure functional orchestration
- No personality, just accuracy
- Optimized prompts for intent extraction

### Soul (Financial Armor)

**Location:** `packages/plugin-financial-armor/`

**Responsibilities:**
- Verify parsed intents before execution
- Enforce spending limits and velocity checks
- Validate merchants against registry
- Generate TEE attestation for decisions
- Sign approved transactions

**Key Services:**
```
services/
├── verificationService.ts   # Intent verification logic
├── velocityChecker.ts       # Spending limit enforcement
├── merchantValidator.ts     # On-chain merchant registry
├── attestationProvider.ts   # TEE quote generation
└── policyEngine.ts          # Compliance rules
```

**Character Config:** `characters/alex_sovereign.json`
- Security-first persona
- Conservative risk tolerance
- Explains decisions to user

### Communication Protocol

Brain and Soul communicate via gRPC:

```protobuf
// Brain → Soul
message VerifyIntentRequest {
  string intent_id = 1;
  ParsedIntent parsed_intent = 2;
  string brain_signature = 3;
  bytes brain_attestation = 4;
}

// Soul → Brain
message VerifyIntentResponse {
  bool approved = 1;
  string reason = 2;
  RiskAssessment risk = 3;
  bytes soul_signature = 4;
  bytes soul_attestation = 5;
}
```

## Activation Triggers

The Dual AI system activates for:

| Trigger | Threshold | Rationale |
|---------|-----------|-----------|
| High-value transactions | > $1,000 | Financial risk |
| New recipients | First transfer | Prevent scams |
| Cross-chain operations | Any | Complexity risk |
| Card creation | Any | Identity verification |
| DeFi interactions | Any | Smart contract risk |
| Unusual patterns | ML-detected | Fraud prevention |

Low-risk operations (balance checks, small transfers to known recipients) use the simplified single-LLM path.

## Trust Chain

```
1. User authenticates via passkey (Turnkey TEE)
       ↓
2. Brain parses intent in Phala TEE
   └── Brain attestation proves code integrity
       ↓
3. Soul verifies in separate Phala TEE
   └── Soul attestation proves verification integrity
   └── Soul verifies Brain's attestation
       ↓
4. Soul signs approval with TEE-protected key
       ↓
5. Turnkey executes with Soul's signature
   └── Turnkey verifies Soul's attestation
```

## Failure Modes

| Scenario | Behavior |
|----------|----------|
| Brain unavailable | Fallback to local regex parser |
| Soul unavailable | Queue request, notify user |
| Attestation invalid | Reject transaction, alert user |
| Disagreement (Brain vs Soul) | Default to Soul's decision |
| Both unavailable | Read-only mode (balance checks only) |

## Implementation Status

### Current (MVP)
- [x] Brain LLM service (llmService.ts)
- [x] Basic intent parser (intentParser.ts)
- [x] Context manager (contextManager.ts)
- [x] Soul verification stub (soulClient.ts)
- [ ] Full Soul implementation
- [ ] gRPC communication
- [ ] Attestation verification
- [ ] Multi-step planning

### Phase 2 (Post-MVP)
- [ ] Production Soul deployment in Phala Cloud
- [ ] Real TEE attestation chain
- [ ] Merchant registry integration
- [ ] Velocity limit enforcement
- [ ] ML-based anomaly detection

### Phase 3 (Future)
- [ ] Model fine-tuning on DisCard intents
- [ ] Multi-language support
- [ ] Voice intent parsing
- [ ] Proactive suggestions based on patterns

## Configuration

```env
# Brain Orchestrator
PHALA_AI_API_KEY=sk-rp-...
PHALA_AI_MODEL=meta-llama/llama-3.3-70b-instruct
PHALA_AI_BASE_URL=https://api.redpill.ai/v1
BRAIN_GRPC_PORT=50052

# Soul (Financial Armor)
SOUL_GRPC_URL=localhost:50051
SOUL_ATTESTATION_ENABLED=true
SOUL_VERIFICATION_TIMEOUT_MS=5000

# Dual AI Activation
DUAL_AI_THRESHOLD_USD=1000
DUAL_AI_NEW_RECIPIENT=true
DUAL_AI_DEFI_OPERATIONS=true
```

## Security Considerations

1. **Key Isolation:** Neither Brain nor Soul has access to user's signing keys
2. **Attestation Freshness:** Attestations expire after 60 seconds
3. **Replay Protection:** Nonces prevent request replay
4. **Audit Logging:** All decisions logged with attestations
5. **Rate Limiting:** Both layers enforce independent limits

## References

- [Phala Network TEE Documentation](https://docs.phala.network)
- [elizaOS Plugin Architecture](https://elizaos.dev)
- [Turnkey TEE Signing](https://docs.turnkey.com)
- [gRPC Protocol Buffers](https://grpc.io)

---

*Last updated: January 2026*
*Status: Future Vision (Single-LLM MVP in production)*
