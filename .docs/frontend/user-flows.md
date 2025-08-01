# User Flows

### Card Creation Flow

**User Goal:** Create a new disposable card for a specific purchase or use case

**Entry Points:** Dashboard quick action, primary navigation, post-transaction suggestion

**Success Criteria:** User successfully creates funded card with appropriate privacy settings and spending limits

#### Flow Diagram

```mermaid
graph TD
    A[Dashboard] --> B[Create Card Action]
    B --> C[Card Purpose Selection]
    C --> D[Funding Source Selection]
    D --> E[Amount & Limits Setup]
    E --> F[Privacy Settings]
    F --> G[Review & Confirm]
    G --> H[Card Created Successfully]
    
    D --> D1[Connect New Wallet]
    D --> D2[Use Existing Balance]
    D1 --> E
    D2 --> E
    
    F --> F1[Basic Privacy Default]
    F --> F2[Advanced Privacy Options]
    F1 --> G
    F2 --> G
    
    H --> I[Copy Card Details]
    H --> J[Go to Dashboard]
    H --> K[Create Another Card]
```

#### Edge Cases & Error Handling:
- Insufficient crypto balance: Clear explanation with funding options
- Wallet connection failures: Retry options and alternative funding methods
- Network congestion: Fee estimation and delay warnings
- Rate fluctuation: Slippage protection with re-confirmation options

**Notes:** Flow emphasizes speed for frequent users while providing educational moments for new users. Privacy settings default to maximum protection with option to customize.

### Crypto Funding Flow

**User Goal:** Add cryptocurrency funds to account or specific card with confidence in conversion rates

**Entry Points:** Card creation, low balance notifications, manual funding action

**Success Criteria:** User successfully funds card with clear understanding of conversion rates and fees

#### Flow Diagram

```mermaid
graph TD
    A[Funding Trigger] --> B[Wallet Selection]
    B --> C[Currency Selection]
    C --> D[Amount Input]
    D --> E[Rate & Fee Display]
    E --> F[Slippage Protection]
    F --> G[Transaction Preview]
    G --> H[Wallet Confirmation]
    H --> I[Processing Status]
    I --> J[Completion Confirmation]
    
    B --> B1[Connect New Wallet]
    B1 --> C
    
    E --> E1[Rate Refresh]
    E1 --> E
    
    I --> I1[Transaction Failed]
    I1 --> K[Error Explanation]
    K --> L[Retry Options]
    L --> G
```

#### Edge Cases & Error Handling:
- Rate changes during transaction: Re-confirmation with new rates
- Network failures: Clear status updates and retry mechanisms
- Wallet connection timeouts: Alternative connection methods
- Insufficient gas fees: Automatic fee calculation and funding suggestions

**Notes:** Flow prioritizes transparency in costs and timing while maintaining simplicity. Rate changes communicated clearly with user control over acceptance.

### Card Deletion Flow

**User Goal:** Permanently delete disposable card with confidence in data destruction

**Entry Points:** Card detail view, bulk management, post-transaction cleanup

**Success Criteria:** User deletes card with clear understanding of permanence and privacy benefits

#### Flow Diagram

```mermaid
graph TD
    A[Delete Card Action] --> B[Deletion Warning]
    B --> C[Confirmation Dialog]
    C --> D[Permanent Deletion]
    D --> E[Cryptographic Verification]
    E --> F[Deletion Confirmed]
    
    B --> B1[Explain Benefits]
    B1 --> C
    
    C --> C1[Cancel Action]
    C1 --> G[Return to Card]
    
    E --> E1[Verification Failed]
    E1 --> H[Technical Error]
    H --> I[Support Options]
    
    F --> J[Privacy Status Update]
    J --> K[Dashboard Return]
```

#### Edge Cases & Error Handling:
- Active transactions: Warning about pending charges with delayed deletion option
- Network connectivity issues: Offline deletion queuing with confirmation when reconnected
- Verification failures: Technical support escalation with user privacy protection

**Notes:** Flow emphasizes the privacy benefits of deletion while ensuring users understand the irreversible nature. Clear visual feedback confirms successful data destruction.
