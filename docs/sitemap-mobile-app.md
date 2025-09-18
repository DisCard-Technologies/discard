### Discard Mobile App Sitemap


  1. Onboarding & Authentication
     1.1. Welcome Carousel:* A series of screens highlighting the app's core benefits (Privacy, Instant Cards, Spend Crypto).
     1.2. Wallet Gateway:*
      *   Create a New Secure Wallet: For new users.
      *   Import Existing Wallet: For users recovering or moving their wallet.
     1.3. Wallet Creation Flow:*
         1.3.1. Secure Phrase Generation:* Displays the 12 or 24-word seed phrase.
         1.3.2. Secure Phrase Backup:* A verification step to ensure the user has saved their phrase.
         1.3.3. Set PIN Code:* For quick, secure access.
         1.3.4. Enable Biometrics:* Prompt to enable Face ID or Touch ID for login and confirmations.
     1.4. Login Screen:*
      *   PIN Pad or Biometric Prompt.
      *   Forgot PIN? link leading to wallet import/recovery.
     1.5. KYC (Know Your Customer) Flow:*
         1.5.1. Introduction:* Explains why minimal KYC is required for compliance.
         1.5.2. Information Form:* Secure form for submitting required data.
         1.5.3. Verification Status:* A screen showing if KYC is Pending, Approved, or Rejected with next steps.

  ---


  2. Main Dashboard (Home Tab)
     2.1. Portfolio Overview:* A top-level summary of the total crypto balance in the user's preferred fiat currency.
     2.2. Active Cards:* A scrollable list or carousel of all currently active virtual cards.
      *   Each card displays: Nickname, Remaining Balance, and Spending Limit.
      *   Tapping a card navigates to the Card Details screen.
     2.3. Primary CTA:* A prominent (+) Create New Card button.
     2.4. Quick Actions:*
      *   Fund Wallet: Navigates to the Receive Crypto screen.
      *   Send: Navigates to the Send Crypto flow.
     2.5. Recent Activity Feed:* A high-level, privacy-preserving log (e.g., "Card 'Online Shopping' created," "Card
  'Subscription' deleted"). *No specific transaction amounts or merchant names are shown here.*

  ---


  3. Card Management
     3.1. Create Card Flow:*
         3.1.1. Select Crypto:* Choose which asset (USDC, BTC, etc.) to fund the card with.
         3.1.2. Set Amount:* An input field to define the card's value, showing a real-time conversion rate and any fees.
         3.1.3. Configure Limits:* Set a total spending limit and optional merchant restrictions.
         3.1.4. Confirmation:* A final review of the card's value, source, and limits before creation. Requires biometric or
  PIN approval.
         3.1.5. Card Created:* A screen displaying the full card details (Number, CVV, Expiry) with easy copy-to-clipboard
  buttons.
     3.2. Card Details Screen:*
      *   Displays full, unobscured card information (with a tap-to-reveal option for security).
      *   Shows remaining balance and spending limits.
         Card Actions:*
          *   Freeze / Unfreeze Card toggle.
          *   Add Funds: A streamlined flow to top up the card.
          *   Delete Card: A confirmation flow that explains any remaining funds will be refunded to the source wallet.

  ---


  4. Wallet (Tab)
     4.1. Asset List:* A detailed breakdown of all cryptocurrencies held in the wallet, showing the balance for each in both
  crypto and fiat.
     4.2. Receive Crypto:*
      *   Select a cryptocurrency.
      *   Displays the public wallet address and a corresponding QR code.
     4.3. Send Crypto:*
      *   Standard crypto sending interface: Recipient Address, Amount, Network Fee estimation, and Confirmation.

  ---


  5. Security Center (Tab)
     5.1. Security Dashboard:* An overview screen with a security score or status and a log of security-related events (e.g.,
  "New login from unrecognized device," "MFA enabled").
     5.2. Multi-Factor Authentication (MFA):*
      *   Manage TOTP (Time-based One-Time Password) authenticators.
      *   View and manage backup codes.
      *   Enable/disable biometrics.
     5.3. Active Sessions Management:* A list of all devices currently logged into the account, with the ability to remotely
  log them out.
     5.4. Fraud & Risk Settings:*
      *   View the status of real-time fraud detection.
      *   (Optional) Adjust the sensitivity of risk-based authentication.

  ---


  6. Settings (Tab)
     6.1. Profile:* View user information provided during KYC.
     6.2. Privacy & Data:*
      *   Request Data Export: For GDPR/CCPA data portability.
      *   Request Account Deletion: To permanently delete user data.
     6.3. Preferences:*
      *   Appearance: Choose between Light, Dark, or System theme.
      *   Default Currency: Set the preferred fiat currency for display (e.g., USD, EUR, GBP).
      *   Notifications: Manage push notification settings.
     6.4. Help & Support:*
      *   FAQ: A searchable list of frequently asked questions.
      *   Contact Support: A form to submit a support ticket.
     6.5. About:*
      *   Terms of Service and Privacy Policy.
      *   App version number.
     6.6. Logout:* Securely log out of the app.