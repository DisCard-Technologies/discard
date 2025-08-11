# Privacy Policy Updates for Security Features

## Overview

This document outlines the privacy policy updates required to incorporate DisCard's advanced security and fraud prevention features while maintaining our privacy-first approach.

## Privacy Policy Additions

### Section: Advanced Security & Fraud Protection

#### Data Collection for Security Purposes

**Transaction Analysis Data**

We collect and analyze the following data solely for fraud detection and security purposes for each individual card:

- **Transaction Information**: Amount, merchant name, merchant category code (MCC), transaction location, date and time
- **Behavioral Patterns**: Your individual spending habits, preferred merchants, typical transaction times, and common locations *for each card separately*
- **Device Information**: Device identifiers, IP addresses, and app usage patterns when you access your DisCard account
- **Location Data**: Geographic location of transactions and app access (when location services are enabled)

**Multi-Factor Authentication Data**

When you enable multi-factor authentication:

- **Authentication Secrets**: Encrypted TOTP secrets for authenticator apps
- **Biometric Templates**: Device-stored biometric data for verification (never transmitted to our servers)
- **Backup Codes**: Encrypted one-time use codes for account recovery
- **Authentication History**: Records of when and how you've verified your identity

#### How We Use Security Data

**Card-Specific Fraud Detection**

We use advanced algorithms to analyze each card's transaction patterns individually:

- **Individual Analysis Only**: Each card's fraud detection operates completely independently
- **No Cross-Card Correlation**: We never combine or compare data across your different cards
- **No User Profiling**: We don't build comprehensive profiles spanning multiple cards or accounts
- **Real-Time Protection**: Transaction analysis occurs within 200 milliseconds to protect you from fraud

**Machine Learning for Security**

Our fraud detection uses privacy-preserving machine learning:

- **Card-Isolated Models**: Each card has its own fraud detection model trained only on that card's data
- **No Shared Learning**: Models don't share insights or patterns across cards
- **Feedback Integration**: Your fraud reports improve detection accuracy for your specific card only
- **Model Versioning**: We maintain model versions to ensure consistent protection while incorporating improvements

**Automated Security Actions**

To protect you from fraud, we may automatically:

- **Freeze Cards**: Temporarily suspend cards showing signs of fraudulent activity
- **Generate Alerts**: Send notifications about suspicious transactions
- **Require Additional Verification**: Request multi-factor authentication for high-risk actions
- **Block Transactions**: Prevent potentially fraudulent transactions in real-time

#### Privacy Protection Measures

**Data Isolation Architecture**

- **Card Context Separation**: Every piece of security data is tagged with a unique card context identifier
- **Database Isolation**: Row-level security policies prevent access to other cards' data
- **Cache Isolation**: Temporary data storage uses card-specific keys and namespaces
- **API Isolation**: All security API calls require proof of card ownership

**No Cross-Card Data Sharing**

We explicitly do NOT:

- Analyze patterns across your multiple cards
- Build comprehensive spending profiles spanning different cards  
- Share fraud insights between your cards
- Create user-level risk assessments that combine multiple cards
- Correlate your DisCard activity with external financial accounts

**Privacy-Preserving Analytics**

When we analyze security data for system improvements:

- **Differential Privacy**: Any aggregated analytics use mathematical privacy protection
- **K-Anonymity**: Ensure individual transactions cannot be identified in aggregate data
- **Minimal Aggregation**: Most security analysis remains at the individual card level
- **Opt-Out Options**: You can disable participation in privacy-preserving analytics

#### Data Retention for Security

**Active Security Data**

- **Transaction Analysis Cache**: 5 minutes to 1 hour (automatically expires)
- **Behavioral Pattern Data**: 90 days for fraud detection optimization
- **Fraud Event Records**: 2 years (required for compliance and dispute resolution)
- **Security Notification History**: 1 year for your reference and support

**Model and Training Data**

- **Fraud Detection Models**: Current version plus 2 previous versions
- **Training Data**: 90 days of transaction history for model updates
- **False Positive Feedback**: Retained to improve your card's fraud detection accuracy
- **Performance Metrics**: Aggregated model performance data (privacy-protected)

**Multi-Factor Authentication Data**

- **TOTP Secrets**: Retained until you disable MFA
- **Backup Codes**: Retained until used or you generate new ones
- **Authentication Logs**: 1 year for security audit purposes
- **Biometric Data**: Stored only on your device, never on our servers

#### Your Privacy Rights for Security Data

**Access and Transparency**

- **Security Dashboard**: View all fraud detection activity for your cards
- **Algorithm Transparency**: Understand how fraud detection works for your cards
- **Data Export**: Download your security data in portable formats
- **Notification History**: Access complete history of security alerts and actions

**Control and Consent**

- **Fraud Detection Settings**: Adjust sensitivity and risk tolerance for each card
- **Notification Preferences**: Control how and when you receive security alerts
- **MFA Management**: Enable, disable, or reconfigure multi-factor authentication
- **Feedback Options**: Report false positives to improve your card's fraud detection

**Data Modification and Deletion**

- **Correction Rights**: Update or correct security-related information
- **Selective Deletion**: Remove specific security events or notifications
- **Card Closure**: Automatically delete all security data when you close a card
- **Account Deletion**: Complete removal of all security data when you delete your account

#### Third-Party Integration for Security

**Marqeta Card Processing**

For real-time card control, we integrate with Marqeta:

- **Data Shared**: Card tokens, freeze/unfreeze commands, transaction authorization decisions
- **Data Not Shared**: Your personal information, transaction history, or fraud analysis details
- **Purpose**: Execute card control actions (freeze/unfreeze) in real-time
- **Retention**: Marqeta retains data according to their privacy policy and regulatory requirements

**No Other Security Data Sharing**

We do NOT share your security data with:

- Credit bureaus or reporting agencies
- Other financial institutions
- Marketing or advertising companies
- Data brokers or analytics providers
- Government agencies (except as required by law with proper legal process)

#### Compliance and Regulatory Requirements

**Financial Industry Standards**

- **PCI DSS Compliance**: All security data handling meets payment card industry standards
- **SOC 2 Type II**: Annual audits verify our security and privacy controls
- **GDPR Compliance**: European users have full GDPR rights for security data
- **CCPA Compliance**: California residents have comprehensive privacy rights

**Regulatory Reporting**

In limited circumstances, we may need to report security incidents:

- **Anti-Money Laundering (AML)**: Suspicious activity reports as required by law
- **Fraud Reporting**: Aggregate fraud statistics to regulatory bodies (privacy-protected)
- **Security Incidents**: Data breach notifications as required by applicable laws
- **Law Enforcement**: Only with valid legal process and court orders

### Section: Your Choices and Controls

#### Security Feature Controls

**Fraud Detection Settings**

For each card, you can:

- Set risk tolerance levels (low, medium, high)
- Enable or disable automatic card freezing
- Adjust geographic anomaly thresholds
- Configure merchant category alerts
- Set transaction amount thresholds

**Notification Management**

Control how you receive security alerts:

- Push notifications, email, or SMS preferences
- Quiet hours to avoid nighttime alerts
- Severity level filtering
- Category-specific notification settings

**Multi-Factor Authentication Options**

Choose your preferred additional security:

- Authenticator apps (Google Authenticator, Authy, 1Password)
- Biometric verification (fingerprint, face recognition)
- Backup codes for emergency access
- Risk-based authentication triggers

#### Data Sharing Preferences

**Analytics Participation**

You can opt out of:

- Privacy-preserving system improvement analytics
- Aggregate fraud pattern analysis
- Model performance measurement
- Security research participation

**Communication Preferences**

Control security-related communications:

- Security update notifications
- Feature announcement emails  
- Privacy policy change notifications
- Security tips and best practices

### Section: Changes to Privacy Practices

#### Security System Updates

We may update our security systems to:

- Improve fraud detection accuracy
- Add new security features
- Enhance privacy protections
- Meet new regulatory requirements

**Notification of Changes**

We will notify you of significant security privacy changes through:

- In-app notifications for major updates
- Email notifications to your registered address
- Privacy policy updates with change summaries
- Blog posts explaining new security features

**Grandfathering and Opt-In**

For new security features:

- Existing cards maintain current privacy settings
- New features require explicit opt-in consent
- You can disable new security features individually
- No retroactive changes to data handling practices

### Section: Contact and Questions

#### Security Privacy Questions

For questions about security data handling:

- **In-App Support**: Real-time chat through the DisCard app
- **Privacy Team**: privacy@discard.com
- **Security Team**: security@discard.com (for security-specific questions)
- **Mailing Address**: [Physical address for written communications]

#### Privacy Rights Requests

To exercise your privacy rights regarding security data:

- Use the "Privacy Rights" section in your app settings
- Email privacy-requests@discard.com with specific requests
- Include your card IDs and specific data categories
- Response time: 30 days for most requests

#### Data Protection Officer

For complex privacy questions:

- **Contact**: dpo@discard.com
- **Role**: Independent privacy oversight and guidance
- **Availability**: Business days, response within 2 business days
- **Escalation**: For unresolved privacy concerns

---

## Implementation Notes

### Legal Review Requirements

This privacy policy update should be reviewed by:

- Privacy counsel for compliance verification
- Security team for technical accuracy
- Compliance team for regulatory requirements
- Product team for feature completeness

### User Communication Strategy

**Notification Timeline**:
1. 30 days before implementation: Email notification of privacy policy updates
2. 14 days before: In-app notification with summary of changes
3. Implementation day: Updated privacy policy goes live
4. 7 days after: Follow-up communication with FAQ and support options

**Key Messages**:
- Enhanced security features for better fraud protection
- Continued commitment to privacy-first design
- No change to fundamental privacy principles
- New controls and transparency features for users

### Regulatory Considerations

**GDPR Compliance**:
- Lawful basis for processing: Legitimate interest (fraud prevention) and contract performance
- Data minimization: Only collect necessary security data
- Purpose limitation: Use security data only for stated security purposes
- Storage limitation: Clear retention periods for all security data types

**CCPA Compliance**:
- Clear disclosure of security data collection and use
- Opt-out rights for sale of personal information (we don't sell data)
- Deletion rights with reasonable exceptions for fraud prevention
- Non-discrimination for exercising privacy rights

**Financial Regulations**:
- Compliance with anti-money laundering requirements
- Fraud reporting obligations to regulatory bodies
- Data retention requirements for dispute resolution
- Cross-border data transfer protections

---

*Privacy Policy Version: 2.1 | Effective Date: [To be determined] | Last Updated: January 2024*