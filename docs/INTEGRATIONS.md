# DisCard Integrations

This document details how DisCard integrates with various sponsors and third-party services to deliver its privacy-first features.

## Table of Contents

- [Privacy Layer](#privacy-layer)
  - [Privacy Cash](#privacy-cash)
  - [ShadowWire (Radr Labs)](#shadowwire-radr-labs)
  - [Light Protocol](#light-protocol)
  - [Anoncoin](#anoncoin)
  - [Arcium](#arcium)
  - [Aztec](#aztec)
  - [MagicBlock](#magicblock) (TEE-Secured Authorization)
  - [Sunspot](#sunspot) (On-Chain ZK Verification)
  - [Hush](#hush) (Stealth Addresses)
  - [Umbra](#umbra) (Shielded Pools)
- [Identity & Compliance](#identity--compliance)
  - [Civic](#civic)
  - [Range](#range)
- [Infrastructure](#infrastructure)
  - [Turnkey](#turnkey)
  - [Helius](#helius)
  - [Convex](#convex)
  - [Phala Network](#phala-network)
- [Payments & Cards](#payments--cards)
  - [Dual Card Provider Architecture](#dual-card-provider-architecture)
  - [Marqeta](#marqeta) (Reloadable Visa, KYC Required)
  - [Starpay](#starpay) (Prepaid Mastercard, No KYC)
  - [MoonPay](#moonpay)
  - [Stripe](#stripe)
- [DeFi & Trading](#defi--trading)
  - [Jupiter](#jupiter)
  - [DFlow](#dflow)
  - [PNP Exchange](#pnp-exchange)

---

## Privacy Layer

### Privacy Cash

**Purpose:** Shielded deposit/cashout pool for breaking the link between KYC identity and wallet activity.

**Features Used:**
- Auto-shield deposits from MoonPay
- Unshield to single-use addresses for cashout
- Anonymity set for privacy protection

**Integration Points:**
```
services/privacyCashClient.ts     # SDK client
convex/privacy/shield.ts          # Shield operations
convex/privacy/unshield.ts        # Unshield operations
convex/funding/autoShield.ts      # Auto-shield webhook handler
```

**Flow:**
1. User deposits via MoonPay to single-use Turnkey address
2. Helius webhook detects deposit
3. Auto-shield triggers → funds move to Privacy Cash pool
4. User sees shielded balance (no public address exposed)

**Environment Variables:**
```env
PRIVACY_CASH_API_KEY=your_api_key
PRIVACY_CASH_POOL_ADDRESS=pool_address
```

---

### ShadowWire (Radr Labs)

**Purpose:** Zero-knowledge proof private P2P transfers.

**Features Used:**
- ZK-proof generation for private transfers
- Recipient notification without exposing amounts
- No on-chain link between sender and receiver

**Integration Points:**
```
services/shadowWireClient.ts      # SDK client
convex/transfers/privateP2P.ts    # Private transfer logic
components/send-private.tsx       # UI component
```

**Flow:**
1. User initiates "Send $X to @recipient privately"
2. Generate ZK proof of sufficient shielded balance
3. ShadowWire executes transfer
4. Recipient receives notification + funds

**Environment Variables:**
```env
SHADOWWIRE_API_KEY=your_api_key
```

---

### Light Protocol

**Purpose:** ZK state compression for privacy-preserving wallet state on Solana.

**Features Used:**
- Compressed card state PDAs
- ZK proofs for state transitions
- Reduced on-chain footprint

**Integration Points:**
```
programs/discard-state/           # Anchor program for compressed state
services/lightProtocolClient.ts   # SDK client
convex/cards/compressedState.ts   # Card state management
```

**Flow:**
1. Card creation generates compressed PDA
2. State updates use ZK proofs
3. Verification happens on-chain without revealing data

---

### Anoncoin

**Purpose:** Confidential token swaps and RWA purchases with encrypted order execution.

**Features Used:**
- Encrypted swap amounts
- Confidential RWA purchase execution
- Private order books

**Integration Points:**
```
services/anoncoinClient.ts        # SDK client
convex/trading/confidentialSwap.ts # Swap logic
convex/trading/rwaPrivate.ts      # RWA purchase logic
```

**Flow:**
1. User requests "Swap 100 USDC for SOL"
2. Order amount encrypted before submission
3. Anoncoin executes with encrypted matching
4. User receives tokens without public amount visibility

**Environment Variables:**
```env
ANONCOIN_API_KEY=your_api_key
```

---

### Arcium

**Purpose:** MPC-encrypted DeFi positions, yield vaults, RWA storage, and credential storage.

**Features Used:**
- Shielded yield vault positions
- Encrypted RWA ownership records
- MPC-encrypted credential storage
- Confidential DeFi state

**Integration Points:**
```
services/arciumYieldClient.ts     # Yield vault client
services/arciumMXEClient.ts       # MXE credential storage
convex/defi/shieldedYield.ts      # Yield vault operations
convex/identity/credentialStore.ts # Credential storage
```

**Use Cases:**
- **Shielded Yield:** Deposit to yield protocols without exposing position size
- **RWA Vaults:** Store tokenized RWA ownership privately
- **Credentials:** Store KYC attestations encrypted (hide what verifications you have)

**Environment Variables:**
```env
ARCIUM_API_KEY=your_api_key
ARCIUM_MXE_ENDPOINT=your_endpoint
```

---

### Aztec

**Purpose:** Noir ZK circuits for private identity proofs and selective disclosure.

**Features Used:**
- ZK proofs for credential claims
- Selective disclosure (prove "over 21" without revealing birthdate)
- Private identity verification

**Integration Points:**
```
services/aztecNoirClient.ts       # Noir circuit client
convex/identity/zkProofs.ts       # ZK proof generation
lib/circuits/                     # Noir circuit definitions
```

**Flow:**
1. User completes KYC via Civic → attestations stored in Arcium
2. Service requests age verification
3. Aztec Noir circuit generates proof: "user is over 21"
4. Proof verified without revealing actual birthdate

**Circuits:**
- `ageVerification.nr` - Prove age threshold
- `residencyProof.nr` - Prove country without revealing address
- `accreditationProof.nr` - Prove investor status

---

### MagicBlock

**Purpose:** TEE-secured ephemeral rollups for sub-50ms card authorization decisions.

**Features Used:**
- Private Ephemeral Rollups (PER) in Intel TDX TEE
- Private velocity state (spending limits, patterns never on-chain)
- Batch settlement to Solana L1
- Sub-50ms authorization decisions

**Integration Points:**
```
lib/tee/magicblock-types.ts           # TypeScript types
services/magicblockClient.ts          # SDK wrapper + session management
convex/tee/magicblock.ts              # Convex actions for sessions
hooks/useMagicBlockAuth.ts            # React hook for authorization
```

**Architecture:**
```
Card Transaction Flow:
┌─────────────────────────────────────────┐
│ Merchant Authorization Request          │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│ MagicBlock Private Ephemeral Rollup     │
│ (Intel TDX TEE)                         │
│                                         │
│ • Velocity check (private state)        │
│ • Spending limit validation             │
│ • Fraud scoring                         │
│ • MCC/merchant rules                    │
│                                         │
│ Decision: APPROVE/DECLINE (<50ms)       │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│ Batch Commit to Solana L1               │
│ (Every 5 seconds)                       │
│ • Merkle root of decisions              │
│ • Audit trail for compliance            │
└─────────────────────────────────────────┘
```

**Privacy Advantages:**
- Spending limits/velocity state never exposed on-chain
- Authorization decisions processed in TEE isolation
- Only Merkle commitments published (not individual decisions)
- 80-90% reduction in L1 costs via batching

**Environment Variables:**
```env
MAGICBLOCK_API_URL=https://tee.magicblock.app
MAGICBLOCK_API_KEY=your_api_key
MAGICBLOCK_WEBHOOK_SECRET=your_secret
EXPO_PUBLIC_MAGICBLOCK_CLUSTER=devnet
```

---

### Sunspot

**Purpose:** On-chain zero-knowledge proof verification using Noir circuits and Groth16.

**Features Used:**
- Noir circuit compilation and proof generation
- Groth16 proof verification on Solana (~200k CU)
- Spending limit proofs (prove balance >= amount)
- Compliance proofs (prove not sanctioned)
- Balance threshold proofs

**Integration Points:**
```
lib/zk/circuits/spending-limit.nr     # Noir circuit for spending proofs
lib/zk/sunspot-client.ts              # Proof generation client
convex/privacy/zkProofs.ts            # Proof recording and verification
```

**Spending Limit Circuit:**
```noir
// Prove balance >= amount without revealing balance
fn main(
    balance: Field,           // Private: actual balance
    randomness: Field,        // Private: commitment randomness
    amount: pub Field,        // Public: transaction amount
    commitment: pub Field     // Public: balance commitment
) {
    assert(balance as u64 >= amount as u64);
    let computed = std::hash::pedersen_hash([balance, randomness]);
    assert(computed == commitment);
}
```

**Flow:**
1. User's balance stored as Pedersen commitment
2. Before transaction, client generates ZK proof
3. Proof submitted to Groth16 verifier program
4. If valid, transaction proceeds without revealing balance

**Proof Types:**
- `spending_limit` - Prove balance >= amount
- `compliance` - Prove not on sanctions list
- `balance_threshold` - Prove balance meets minimum
- `age_verification` - Prove age >= minimum
- `kyc_level` - Prove KYC level >= required

**Environment Variables:**
```env
# Sunspot uses Solana syscalls - no API key needed
# Requires HELIUS_RPC_URL for transaction submission
```

---

### Hush

**Purpose:** ECDH-based stealth addresses for privacy-preserving card funding.

**Features Used:**
- One-time stealth address generation
- ECDH key derivation
- Address pool management
- Per-card address isolation

**Integration Points:**
```
services/hushClient.ts                # Stealth address service
lib/stealth/address-generator.ts      # ECDH address derivation
convex/privacy/stealthAddresses.ts    # Address tracking
hooks/useStealthAddress.ts            # React hook
```

**Architecture:**
```
Stealth Address Flow:
┌─────────────────────────────────────────┐
│ User: Request card top-up               │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│ Hush: Generate stealth address          │
│                                         │
│ stealth = ECDH(user_pub, ephemeral)     │
│ Only user can derive private key        │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│ User: Unshield from Privacy Cash        │
│       to stealth address                │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│ Card: Funded via stealth address        │
│       Address discarded after use       │
└─────────────────────────────────────────┘
```

**Privacy Advantages:**
- Each top-up uses fresh, disposable address
- No link between user's main wallet and card funding
- Addresses derived deterministically from ephemeral keys
- Only recipient can spend from stealth address

**Key Functions:**
```typescript
// Generate stealth address for recipient
generateStealthAddress(recipientPubKey): StealthMeta

// Derive private key to spend from stealth address
deriveStealthKey(recipientPrivKey, ephemeralPubKey): DerivedKey

// Check if address belongs to user
isOwnStealthAddress(address, privKey, ephemeralPubKey): boolean
```

**Environment Variables:**
```env
# Hush is client-side only - no server config needed
```

---

### Umbra

**Purpose:** Shielded liquidity pools for large transfers and cross-card movements.

**Features Used:**
- ElGamal-encrypted deposit amounts
- Nullifier-based double-spend prevention
- ZK proof of ownership for withdrawals
- Cross-card private transfers

**Integration Points:**
```
services/umbraClient.ts               # Shielded pool service
convex/privacy/umbra.ts               # Pool operations
hooks/useUmbraPool.ts                 # React hook
```

**Architecture:**
```
Shielded Pool Flow:
┌─────────────────────────────────────────┐
│ User: Transfer $10,000 to card          │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│ Umbra: Deposit to shielded pool         │
│                                         │
│ • Amount encrypted (ElGamal)            │
│ • Mixed with other deposits             │
│ • Commitment + nullifier generated      │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│ Withdrawal: ZK proof of ownership       │
│                                         │
│ • Nullifier published (prevents reuse)  │
│ • Proof verified on-chain               │
│ • No link to deposit amount/source      │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│ Card: Receives funds                    │
│       No public link to deposit         │
└─────────────────────────────────────────┘
```

**Use Cases:**
- **Large card reloads** - Hide amounts in liquidity pool
- **Cross-card transfers** - Move funds between cards privately
- **Institutional cards** - Corporate spending privacy

**Key Concepts:**
- **Deposit Note:** Commitment + nullifier + encrypted amount
- **Commitment:** `Pedersen(amount, randomness)` - binds to amount
- **Nullifier:** `Hash(noteId, secret)` - prevents double-spend
- **Withdrawal Proof:** ZK proof that user owns the note

**Pool Settings:**
- Minimum deposit: 0.001 SOL
- Maximum deposit: 1000 SOL
- Pool fee: 0.3% (30 basis points)

**Environment Variables:**
```env
UMBRA_PROGRAM_ID=your_program_id
UMBRA_RELAYER_URL=https://umbra-relayer.arcium.com
```

---

## Identity & Compliance

### Civic

**Purpose:** KYC verification with document and liveness checks.

**Features Used:**
- Document verification (passport, ID, driver's license)
- Liveness detection
- Attestation issuance
- DID integration

**Integration Points:**
```
services/civicClient.ts           # SDK client
convex/identity/kyc.ts            # KYC flow logic
app/identity.tsx                  # KYC UI screen
```

**Flow:**
1. User initiates KYC in app
2. Civic SDK handles document capture + liveness
3. Verification results returned
4. Attestations issued and stored in Arcium (encrypted)

**Environment Variables:**
```env
CIVIC_API_KEY=your_api_key
CIVIC_GATEKEEPER_NETWORK=your_network
```

---

### Range

**Purpose:** Wallet screening and OFAC compliance.

**Features Used:**
- Pre-transfer wallet screening
- OFAC/sanctions list checking
- Compliance reporting

**Integration Points:**
```
services/rangeClient.ts           # SDK client
convex/compliance/walletScreen.ts # Screening logic
convex/transfers/preCheck.ts      # Pre-transfer compliance
```

**Flow:**
1. Before any transfer, check recipient wallet via Range
2. If flagged → block transfer, notify user
3. If clear → proceed with transfer
4. Log compliance check for audit

**Environment Variables:**
```env
RANGE_API_KEY=your_api_key
```

---

## Infrastructure

### Turnkey

**Purpose:** Non-custodial wallet infrastructure with passkey authentication.

**Features Used:**
- Passkey-derived wallet addresses
- Single-use deposit/cashout addresses
- Policy-limited session keys
- Social recovery

**Integration Points:**
```
lib/tee/turnkeyClient.ts          # SDK client
convex/auth/passkey.ts            # Passkey authentication
convex/wallets/singleUse.ts       # Single-use address generation
convex/wallets/sessionKeys.ts     # Session key management
```

**Key Concepts:**
- **Single-use addresses:** Generated for each deposit/cashout to break correlation
- **Policy-limited keys:** Session keys that can ONLY transfer to specific destinations
- **Non-custodial:** User's passkey derives all addresses; we never hold keys

**Environment Variables:**
```env
TURNKEY_ORGANIZATION_ID=your_org_id
TURNKEY_API_PRIVATE_KEY=your_private_key
TURNKEY_API_PUBLIC_KEY=your_public_key
EXPO_PUBLIC_TURNKEY_RP_ID=your_domain
```

---

### Helius

**Purpose:** Solana RPC and webhook infrastructure.

**Features Used:**
- Enhanced RPC for transaction submission
- Webhooks for deposit detection
- Transaction history queries

**Integration Points:**
```
lib/solana/heliusRpc.ts           # RPC client
convex/http.ts                    # Webhook handlers
convex/funding/depositWebhook.ts  # Deposit detection
```

**Webhooks:**
- Deposit detection → triggers auto-shield
- Transaction confirmation → updates UI
- Failed transaction → retry logic

**Environment Variables:**
```env
HELIUS_API_KEY=your_api_key
HELIUS_RPC_URL=your_rpc_url
HELIUS_WEBHOOK_SECRET=your_secret
```

---

### Convex

**Purpose:** Real-time database and serverless backend.

**Features Used:**
- Real-time data subscriptions
- Serverless functions
- Scheduled jobs (crons)
- HTTP webhooks

**Integration Points:**
```
convex/schema.ts                  # Database schema
convex/*.ts                       # All backend functions
convex/http.ts                    # HTTP endpoints
convex/crons.ts                   # Scheduled jobs
```

**Key Tables:**
- `users` - Passkey credentials, KYC status
- `cards` - Virtual card data
- `shieldedBalances` - Privacy Cash balances
- `credentials` - Encrypted attestations
- `transfers` - Transaction records

---

### Phala Network

**Purpose:** TEE (Trusted Execution Environment) infrastructure for dual AI (Brain + Soul).

**Features Used:**
- Secure AI execution environment
- Redpill LLM access
- Confidential computation

**Integration Points:**
```
packages/plugin-brain-orchestrator/  # Brain AI plugin
packages/plugin-financial-armor/     # Soul AI plugin
services/brainClient.ts              # Brain communication
```

**Dual AI Architecture:**
- **Brain:** Parses user intents, plans operations
- **Soul:** Executes financial operations, validates Brain decisions
- **TEE:** Both run in isolated environment, mutual verification

**Environment Variables:**
```env
REDPILL_API_KEY=your_key
PHALA_TEE_ENDPOINT=your_endpoint
```

---

## Payments & Cards

### Dual Card Provider Architecture

DisCard supports two card providers to offer users flexibility based on their needs:

| Feature | Marqeta | Starpay |
|---------|---------|---------|
| **Card Network** | Visa | Mastercard |
| **KYC Required** | Yes | No |
| **Card Type** | Reloadable | Prepaid (Black) / Reloadable (Platinum) |
| **Funding Model** | JIT (funds stay shielded until spend) | Pre-funded |
| **Best For** | Power users, recurring spending | Quick anonymous cards, one-time purchases |
| **Privacy Risk** | Low (funds in privacy pool until spent) | Medium (pre-funding visible) |

**Provider Abstraction Layer:**
```
services/cardProviders/
├── types.ts              # Shared CardProvider interface
├── index.ts              # Provider factory + configuration checks
├── marqetaProvider.ts    # Marqeta implementation
└── starpayProvider.ts    # Starpay implementation
```

**Interface:**
```typescript
interface CardProvider {
  readonly name: 'marqeta' | 'starpay';
  readonly requiresKyc: boolean;
  readonly fundingModel: 'jit' | 'prepaid';

  createCard(userId: string, options: CardOptions): Promise<CardResult>;
  activateCard(cardToken: string): Promise<void>;
  freezeCard(cardToken: string): Promise<void>;
  unfreezeCard(cardToken: string): Promise<void>;
  closeCard(cardToken: string): Promise<void>;
  getCardDetails(cardToken: string): Promise<CardDetails>;
  fundCard?(request: FundingRequest): Promise<FundingResult>;  // Starpay only
  processAuthorization?(request: AuthRequest): Promise<AuthResponse>;  // Marqeta only
}
```

**User Selection Flow:**
1. User taps "Create Card"
2. Modal presents provider choice:
   - **Standard Card** (Marqeta): "Reloadable Visa. Requires verification. Funds stay in wallet until you spend."
   - **Instant Card** (Starpay): "Prepaid Mastercard. No verification. Load funds upfront for immediate use."
3. Based on selection, card routed to appropriate provider

---

### Marqeta

**Purpose:** Reloadable virtual Visa card issuing with JIT (Just-In-Time) funding. Requires KYC.

**Why Marqeta:**
- Funds remain in shielded balance until actual spend (better privacy)
- Reloadable cards for recurring use
- Full card controls (freeze, limits, MCC blocking)
- Sub-800ms authorization decisions

**Features Used:**
- Virtual Visa card creation
- JIT funding authorization
- Card controls (freeze, limits)
- Transaction webhooks

**Integration Points:**
```
services/cardProviders/marqetaProvider.ts  # Provider implementation
convex/cards/marqeta.ts                    # Marqeta API client
convex/http.ts                             # JIT authorization webhook
convex/cards/controls.ts                   # Card control logic
```

**Flow:**
1. User completes KYC verification
2. User creates card → Marqeta provisions virtual Visa
3. User spends → Marqeta sends JIT authorization
4. DisCard unshields exact amount, approves in <800ms
5. Transaction settles → webhook updates records

**Privacy Advantage:**
- Funds stay in Privacy Cash pool until spend
- Only exact transaction amount leaves shielded balance
- No pre-funding correlation

**Environment Variables:**
```env
MARQETA_BASE_URL=https://sandbox-api.marqeta.com/v3
MARQETA_APPLICATION_TOKEN=your_token
MARQETA_ACCESS_TOKEN=your_token
```

---

### Starpay

**Purpose:** No-KYC prepaid virtual Mastercard issuing. Instant card creation without identity verification.

**Why Starpay:**
- No KYC required - instant card creation
- Prepaid model for privacy-conscious users
- Mastercard network for wide acceptance
- Two card types for different use cases

**Card Types:**

| Feature | Black Card | Platinum Card |
|---------|------------|---------------|
| KYC Required | No | No |
| Network | Mastercard | Mastercard |
| Reloadable | No (one-time use) | Yes |
| Issuance Fee | 0.2% (min $5, max $500) | None |
| Token Requirement | None | 10M $STARPAY |
| Best For | One-time purchases, anonymous spending | Regular use without KYC |

**Features Used:**
- Black cards: One-time prepaid, no top-ups
- Platinum cards: Reloadable with $STARPAY token holding
- Crypto-backed balances
- Apple Pay / Google Pay support
- Privacy-preserving balance commitments

**Integration Points:**
```
services/cardProviders/starpayProvider.ts  # Provider implementation
convex/cards/starpay.ts                    # Convex actions (provision, fund, freeze)
convex/cards/cardFunding.ts                # Privacy-preserving funding
convex/cards/cards.ts                      # Unified card creation routing
```

**Privacy-Preserving Funding Flow:**

Since prepaid cards require pre-funding (unlike JIT), we implement privacy measures:

```
[User Shielded Balance]
         │
         ▼
[Generate Single-Use Address] ← Turnkey creates fresh address
         │
         ▼
[Unshield to Address] ← Privacy Cash unshield
         │
         ▼
[Starpay Funding API] ← Session key restricted to this endpoint
         │
         ▼
[Card Loaded]
         │
         ▼
[Balance Commitment Created] ← SHA256(cardId || amount || timestamp || randomness)
         │
         ▼
[Address Discarded] ← Single-use, no reuse
```

**Balance Commitments:**
- Card balance stored as cryptographic commitment
- `commitment = SHA256(cardId || amount || timestamp || randomness)`
- Verifiable without revealing actual balance
- Randomness stored encrypted for verification

**Funding Request System:**
```typescript
// cardFundingRequests table
{
  cardId: Id<"cards">,
  userId: Id<"users">,
  singleUseAddress: string,      // Fresh Turnkey address
  requestedAmount: number,        // Cents
  status: "pending" | "deposited" | "funded" | "expired" | "failed",
  expiresAt: number,              // 30 minute expiry
}
```

**Limits:**
- Max 3 pending funding requests per user
- Single top-up max: $1,000 (configurable)
- Daily top-up limit: $5,000 (configurable)
- Request expiry: 30 minutes

**Flow:**
1. User selects "Instant Card" during creation
2. Chooses Black (one-time) or Platinum (reloadable)
3. Enters initial funding amount
4. Single-use address generated
5. User confirms unshield from Privacy Cash
6. Starpay provisions card with balance
7. Balance commitment stored, address discarded
8. Card ready for immediate use

**Environment Variables:**
```env
STARPAY_API_URL=https://api.starpay.cards/v1
STARPAY_API_KEY=your_api_key
STARPAY_WEBHOOK_SECRET=your_secret
```

---

### MoonPay

**Purpose:** Fiat on-ramp and off-ramp.

**Features Used:**
- Buy crypto with card/bank
- Sell crypto to bank account
- Webhook notifications

**Integration Points:**
```
convex/funding/moonpay.ts         # MoonPay integration
app/buy-crypto.tsx                # Buy UI
app/sell-crypto.tsx               # Sell UI
```

**Privacy Integration:**
- Deposits go to single-use Turnkey addresses
- Auto-shield breaks KYC → wallet link
- Cashout from unshielded single-use addresses

**Environment Variables:**
```env
MOONPAY_API_KEY=your_api_key
MOONPAY_SECRET_KEY=your_secret_key
EXPO_PUBLIC_MOONPAY_API_KEY=your_public_key
```

---

### Stripe

**Purpose:** Fiat funding and Treasury for virtual IBANs.

**Features Used:**
- Card payments for funding
- Treasury for virtual IBAN issuance
- Direct bank deposit support

**Integration Points:**
```
convex/funding/stripe.ts          # Stripe payments
convex/funding/treasury.ts        # IBAN management
convex/http.ts                    # Webhooks
```

**Environment Variables:**
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## DeFi & Trading

### Jupiter

**Purpose:** DEX aggregation for token swaps.

**Features Used:**
- Token price data
- Swap routing
- Quote generation

**Integration Points:**
```
services/jupiterTokensClient.ts   # Token data client
services/jupiterUltraClient.ts    # Swap client
convex/trading/swap.ts            # Swap logic
components/explore-view.tsx       # Token explorer UI
```

**Environment Variables:**
```env
# Jupiter uses public API, no key required
```

---

### DFlow

**Purpose:** MEV-protected order flow for best execution.

**Features Used:**
- Order flow auctions
- MEV protection
- Best execution routing

**Integration Points:**
```
services/dflowClient.ts           # DFlow client
services/dflowSwapClient.ts       # Swap execution
convex/trading/mevProtected.ts    # MEV-protected swap logic
```

**Flow:**
1. User initiates swap
2. Order routed through DFlow auction
3. Market makers compete for order
4. Best price executed with MEV protection

---

### PNP Exchange

**Purpose:** Private prediction markets with encrypted bet amounts.

**Features Used:**
- Private bet placement
- Encrypted position tracking
- Local bet history

**Integration Points:**
```
services/pnpClient.ts             # PNP client
convex/predictions/privateBet.ts  # Bet logic
app/predictions.tsx               # Predictions UI
```

**Privacy Features:**
- Bet amounts encrypted before submission
- Position sizes not visible on-chain
- Local tracking for user's own history

**Environment Variables:**
```env
PNP_API_KEY=your_api_key
```

---

## Integration Patterns

### Non-Custodial Pattern

All integrations follow the non-custodial principle:

1. **User owns keys** via Turnkey passkey derivation
2. **Session keys are policy-limited** (can only do specific actions)
3. **We never hold funds** - only orchestrate

### Privacy-First Pattern

Privacy integrations follow this pattern:

1. **Generate single-use address** for external interaction
2. **Execute operation** through privacy protocol
3. **Break correlation** between identity and activity
4. **Store encrypted** if persistence needed

### Compliance Pattern

All transfers include compliance checks:

1. **Pre-check** recipient via Range
2. **Block** if sanctioned
3. **Proceed** if clear
4. **Log** for audit

---

## Adding New Integrations

To add a new integration:

1. Create service client in `services/`
2. Add Convex functions in `convex/`
3. Add environment variables to `.env.example`
4. Update this documentation
5. Add tests

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.
