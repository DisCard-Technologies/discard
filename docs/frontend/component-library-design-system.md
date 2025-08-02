# Component Library / Design System

### Design System Approach

**Custom Design System** built specifically for DisCard's privacy-first financial application, incorporating established fintech patterns while introducing unique visual language for disposable cards and privacy protection. System emphasizes trust, security, and user empowerment through thoughtful typography, color, and interaction patterns.

### Core Components

#### DisposableCard Component

**Purpose:** Visual representation of virtual cards emphasizing their temporary nature while maintaining professional fintech aesthetics

**Variants:** 
- Active (fully funded and ready to use)
- Low Balance (needs funding with visual warning indicators)
- Expired (past expiration date with clear inactive state)
- Deleted (ghost state for recent deletions with privacy benefits messaging)

**States:** Default, Hover, Selected, Loading (during funding), Error (funding or network issues)

**Usage Guidelines:** Cards should feel substantial enough to convey trust while visually suggesting their ephemeral nature through design elements like subtle fade effects, dashed borders for expiring cards, and smooth deletion animations.

#### PrivacyIndicator Component

**Purpose:** Consistent visual communication of privacy protection status and transaction isolation

**Variants:**
- Active Protection (bright green with shield icon indicating full privacy)
- Partial Protection (amber with information icon for limited privacy scenarios)
- No Protection (red with warning icon for traditional payment method comparisons)
- Verification Status (blue with checkmark showing cryptographic deletion confirmation)

**States:** Loading, Active, Warning, Success, Error

**Usage Guidelines:** Always visible during card interactions, with hover/tap states providing detailed explanations of current privacy protections and benefits.

#### CryptoConverter Component

**Purpose:** Real-time cryptocurrency to USD conversion with transparent fee display

**Variants:**
- Compact (dashboard widget showing basic rates)
- Detailed (full conversion interface with fee breakdown)
- Historical (rate trends and timing information)

**States:** Loading rates, Current rates, Rate changed, Error loading, Network congestion warning

**Usage Guidelines:** Updates every 30 seconds with visual indicators when rates change significantly. Always shows total cost including all fees before user confirmation.

#### SecureDeletion Component

**Purpose:** Card deletion interface emphasizing privacy benefits and permanent nature

**Variants:**
- Warning Dialog (initial deletion confirmation with benefit explanation)
- Progress Indicator (cryptographic deletion in progress)
- Confirmation Display (successful deletion with privacy improvement messaging)

**States:** Warning, Processing, Success, Error, Verification Failed

**Usage Guidelines:** Multi-step confirmation process with clear privacy benefit messaging. Success state emphasizes improved privacy protection through permanent data destruction.
