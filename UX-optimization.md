# Discard UX Optimization Specification

> **Vision:** A wallet that replaces the need for a traditional bank account. Trustworthy and familiar for blockchain newcomers ("normies"), yet capable enough for crypto natives and power users. The goal is user retention - once users align in knowledge and trust, the app handles their needs for using crypto like cash everyday.

---

## Table of Contents

1. [User Personas](#user-personas)
2. [Core Design Principles](#core-design-principles)
3. [The Coinbase-Inspired "Soft Friction" Model](#the-coinbase-inspired-soft-friction-model)
4. [Portfolio Screen Specification](#portfolio-screen-specification)
5. [Trust Signals](#trust-signals)
6. [Progressive Disclosure](#progressive-disclosure)
7. [Send Flow Specification](#send-flow-specification)
8. [Language & Terminology](#language--terminology)
9. [Implementation Checklist](#implementation-checklist)

---

## User Personas

### Sarah (The Normie)
- **Age:** 34
- **Background:** Uses Venmo, heard about crypto from her nephew
- **Inner voice:** "Please don't make me feel stupid. Please look like my bank app. Please don't lose my money."
- **Needs:** Guardrails disguised as simplicity, familiar icons, "Send money" not "Transfer tokens", balances in dollars first

### Marcus (The Power User)
- **Background:** Mass across 4 wallets, checks gas fees before breakfast
- **Inner voice:** "Show me I'm not limited here. Give me the controls. Don't baby me."
- **Needs:** Depth on demand, advanced settings, network selection, transaction details

---

## Core Design Principles

### 1. Make Blockchain Invisible
The most successful "crypto for normies" products don't teach crypto - they hide it entirely. Users should be able to send money to a friend without ever seeing "blockchain," "wallet," or "transaction hash."

### 2. Trust Through Familiarity
Trust comes from familiar banking patterns with crypto capabilities hidden underneath - like a luxury car that looks elegant but has a turbo mode.

### 3. Progressive Disclosure
The interface greets Sarah with warm simplicity. Marcus can access power tools through subtle toggles or gestures without cluttering Sarah's calm space.

### 4. Balance = Daily Habit
What brings someone back to their bank app daily? Checking their balance. The home screen's #1 job is making that check instant, clear, and reassuring.

---

## The Coinbase-Inspired "Soft Friction" Model

Based on competitive research (Coinbase, MetaMask), we adopt a **soft friction** approach:

### Asset Categorization

| Category | Assets | Behavior |
|----------|--------|----------|
| **Cash** | USDC only | Default for sending, no warnings, instant feel |
| **Investments** | Everything else (including other stablecoins like USDT) | Can be sent with soft friction warnings |

### Why USDC Only for "Cash"?
- Most liquid stablecoin
- Most trusted (Circle, regulated)
- Best integrations
- Coinbase model: USDC = 0% fee, other crypto = 2.49% fee

### Soft Friction Ladder (Send Flow)

1. **USDC selected:** Straight to amount → recipient → confirm → done. Zero friction.

2. **Other stablecoin selected (USDT, DAI):**
   ```
   ┌─────────────────────────────────┐
   │  Quick tip                      │
   │                                 │
   │  USDC is your primary Cash.    │
   │  Sending USDT works, but       │
   │  swapping to USDC first means  │
   │  lower fees.                   │
   │                                 │
   │  [Swap to USDC]  [Send USDT →] │
   └─────────────────────────────────┘
   ```
   Dismissible. Not blocking. Just informing.

3. **Volatile asset selected (SOL, ETH):**
   ```
   ┌─────────────────────────────────┐
   │  Heads up                       │
   │                                 │
   │  SOL's value changes with the  │
   │  market. You're sending $847   │
   │  worth right now, but that     │
   │  could be different by the     │
   │  time it arrives.              │
   │                                 │
   │  [ ] Don't show this again     │
   │                                 │
   │  [Swap to USDC]  [Send SOL →]  │
   └─────────────────────────────────┘
   ```
   Explains risk. Offers escape hatch. Checkbox for power users.

---

## Portfolio Screen Specification

### Visual Structure

```
┌─────────────────────────────────┐
│         Your Portfolio          │
│           $4,231.87             │
│        +2.3% ($97.12) Today     │
│          Funds secured          │
│                                 │
│  ┌─────────────────────────────┐│
│  │  Cash         │  Investments ││
│  │   $1,500      │    $2,731    ││
│  │   USDC        │   4 assets   ││
│  └─────────────────────────────┘│
│                                 │
│  ████████████░░░░░░░░░░░░░░░░░ │
│  35% cash           65% invested│
└─────────────────────────────────┘
┌─────────────────────────────────┐
│     Draggable Drawer            │
│  ═══════════ (handle)           │
│                                 │
│  (filter pills) (All) (SOL)...  │
│  $X,XXX  +X.XX% date            │
│  ~~~~ chart ~~~~                │
│  [H] [D] [W] [M] [Y] [Max]      │
│                                 │
│  Cash                    $1,500 │
│  ├─ USDC    1,500.00    $1,500  │
│  │  Primary spending asset      │
│                                 │
│  Investments             $2,731 │
│  ├─ SOL        4.21       $847  │
│  ├─ ETH        0.50     $1,384  │
│  ├─ USDT     300.00       $300  │
│  └─ JUP      100.00       $200  │
└─────────────────────────────────┘
```

### Key Design Decisions

1. **"Cash" = USDC only** - Simple, opinionated, Coinbase-style
2. **Other stablecoins in "Investments"** - They're stable but not primary spending rail
3. **Progress bar** - Visual representation of cash % vs invested %
4. **"Primary spending asset" label** - Reinforces USDC as THE spending token
5. **Security badge** - "Funds secured" visible in hero
6. **Predictions hidden** - No "$0.00" teasers for unready features

### Removed Elements (vs Current Implementation)

- `TabType` type definition
- `activeTab` state
- `predictionsValue` calculation
- Predictions tab toggle UI
- Predictions placeholder content

---

## Trust Signals

### Visual Familiarity ("This looks like my bank")
- Use "balance" not "holdings" or "portfolio"
- Show "Available" - banks do this, crypto apps don't
- Clean sans-serif fonts (not techy/futuristic)
- Muted, professional colors
- Whitespace. Lots of it.

### Confirmation Theater ("The app is careful with my money")
- Repeat transaction details back to user
- Use real names not addresses (contacts integration)
- Two-step confirm for large amounts
- Warning icons that say "We're being careful too"

### Receipt Culture ("I have proof")
- Confirmation screen after every transaction
- Save/share receipt options
- Timestamps and reference numbers

### The Safety Corners
- Persistent "Funds secured" badge
- Small, always visible security indicators
- Social proof ("Trusted by X people")

### Balance Change Reassurance
When balance drops due to market:
```
$2,847.32
↓ $12.40 today (market change)
Your funds are safe
```

---

## Progressive Disclosure

### Layer 1: The Calm Surface (Default)
- Big balance number
- Simple "Send" and "Receive" buttons
- Recent activity with human names

### Layer 2: The Gentle Pull (Swipe/Scroll)
- Asset breakdown appears
- Still in dollars, familiar terms

### Layer 3: The Curious Tap (Asset Detail)
- Token symbols introduced
- "Swap" action available
- "Advanced options" door visible

### Layer 4: The Power Unlock (Pro Mode)
- Network selection
- Custom RPC endpoints
- Priority fee controls
- Full token addresses

**Key insight:** Each layer requires intentional action to reveal. Nobody stumbles into complexity accidentally.

---

## Send Flow Specification

### Token Selection Screen

```
┌─────────────────────────────────┐
│  Select asset to send           │
│                                 │
│  RECOMMENDED                    │
│  ┌─────────────────────────────┐│
│  │ USDC        $1,500          ││
│  │ Instant / No fees           ││
│  └─────────────────────────────┘│
│                                 │
│  OTHER ASSETS                   │
│  ┌─────────────────────────────┐│
│  │ USDT          $300          ││
│  │ SOL           $847          ││
│  │ ETH         $1,384          ││
│  └─────────────────────────────┘│
└─────────────────────────────────┘
```

### Flow Logic

```typescript
if (selectedToken === 'USDC') {
  // Zero friction - proceed directly
  proceedToSend();
} else if (isStablecoin(selectedToken)) {
  // Soft tip about USDC (dismissible)
  showUSDCTip();
} else {
  // Volatility warning (dismissible, with "don't show again")
  showVolatilityWarning();
}
```

---

## Language & Terminology

### Never Say → Always Say

| Avoid | Use Instead |
|-------|-------------|
| Transaction broadcast to network | Payment sent! |
| Pending confirmation (2/12 blocks) | Processing... usually takes a few seconds |
| Gas fee: 0.00042 SOL | Network fee: $0.02 |
| Holdings | Balance |
| Transfer tokens | Send money |
| Wallet address | Account |
| Private key | Secret passphrase |
| Encrypted | Locked in a vault only you can open |

### Microcopy Tone
- "You're all set!" (not "Transaction complete")
- "We'll keep this safe for you" (not "Stored in wallet")
- "Need help? We're here." (not "Contact support")

---

## Implementation Checklist

### Portfolio Screen (`app/(tabs)/portfolio.tsx`)

| Task | Action | Details |
|------|--------|---------|
| Remove `TabType` type | Delete | Line 39 |
| Remove `activeTab` state | Delete | Line 120 |
| Remove `predictionsValue` | Delete | Line 133 |
| Add USDC categorization | Add | After line 117 - filter USDC as "Cash", everything else as "Investments" |
| Replace summaryPill content | Replace | Lines 303-324 - "Cash \| Investments" instead of "All Tokens \| Predictions" |
| Remove tab toggle UI | Delete | Lines 347-380 |
| Remove predictions placeholder | Delete | Lines 560-571 |
| Remove conditional render | Simplify | Line 382 - remove `activeTab === 'tokens' ?` ternary |
| Add progress bar | Add | After summaryPill - shows cash % vs invested % |
| Add security indicator | Add | After changeContainer - "Funds secured" badge |
| Group holdings by category | Modify | Lines 480-558 - separate sections for Cash and Investments |
| Add "Primary spending asset" | Add | Label under USDC in holdings list |
| Add new styles | Add | End of StyleSheet |

### Categorization Logic

```typescript
// USDC only = Cash (Coinbase model)
const { cashTotal, investmentsTotal, cashHoldings, investmentHoldings } = useMemo(() => {
  if (!tokenHoldings || tokenHoldings.length === 0) {
    return { cashTotal: 0, investmentsTotal: 0, cashHoldings: [], investmentHoldings: [] };
  }

  const cash = tokenHoldings.filter(h => h.symbol.toUpperCase() === 'USDC');
  const investments = tokenHoldings.filter(h => h.symbol.toUpperCase() !== 'USDC');

  return {
    cashTotal: cash.reduce((sum, h) => sum + h.valueUsd, 0),
    investmentsTotal: investments.reduce((sum, h) => sum + h.valueUsd, 0),
    cashHoldings: cash,
    investmentHoldings: investments,
  };
}, [tokenHoldings]);
```

### Future: Feature Flag for Predictions

```typescript
// constants/features.ts
export const FEATURES = {
  PREDICTIONS_ENABLED: false,
};

// In components:
{FEATURES.PREDICTIONS_ENABLED && <PredictionsSection />}
```

---

## References

- [Coinbase P2P USDC Payments](https://www.pymnts.com/digital-payments/2025/coinbase-app-enables-peer-to-peer-payments-with-usdc-stablecoin/)
- [Coinbase Base App Launch](https://www.cnbc.com/2025/07/16/coinbase-steps-into-consumer-market-with-stablecoin-powered-everything-app-that-goes-beyond-trading.html)
- [MetaMask Send + Swap](https://metamask.io/news/latest/how-to-send-and-swap-crypto-at-the-same-time/)
- [MetaMask 2025 Roadmap](https://metamask.io/news/metamask-roadmap-2025)
- [Coinbase Card](https://help.coinbase.com/en/coinbase/trading-and-funding/coinbase-card/cb-card)

---

*Document created: January 2026*
*Last updated: January 26, 2026*
