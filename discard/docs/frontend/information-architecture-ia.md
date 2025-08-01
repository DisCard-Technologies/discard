# Information Architecture (IA)

### Site Map / Screen Inventory

```mermaid
graph TD
    A[App Entry] --> B[Authentication]
    A --> C[Onboarding]
    B --> D[Dashboard]
    C --> D
    
    D --> E[Card Creation]
    D --> F[Card Details]
    D --> G[Transaction History]  
    D --> H[Funding]
    D --> I[Settings]
    
    E --> E1[Funding Source Selection]
    E --> E2[Card Customization]
    E --> E3[Privacy Settings]
    
    F --> F1[Card Management]
    F --> F2[Transaction List]  
    F --> F3[Card Deletion]
    
    H --> H1[Wallet Connection]
    H --> H2[Crypto Conversion]
    H --> H3[Funding Confirmation]
    
    I --> I1[Privacy Dashboard]
    I --> I2[Account Settings]
    I --> I3[Connected Wallets]
    I --> I4[Security Settings]
```

### Navigation Structure

**Primary Navigation:** Bottom tab bar (mobile) / sidebar (desktop) with Dashboard, Create Card, Funding, History, and Settings. Emphasizes card creation as primary action through prominent placement and visual weight.

**Secondary Navigation:** Contextual actions within each screen including card management options, privacy controls, and quick funding actions. Card-specific actions grouped logically within card detail views.

**Breadcrumb Strategy:** Minimal breadcrumbs focusing on context clarity - users should always know which card they're managing and what privacy protections are active. Privacy status indicators persistent across navigation.
