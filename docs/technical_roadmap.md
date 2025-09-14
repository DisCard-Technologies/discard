
# Discard Protocol: Technical Roadmap

### 1. Introduction

This document outlines the technical roadmap for the Discard protocol. The vision is to build the most secure, private, and user-friendly bridge between crypto assets and real-world spending. 

This roadmap is a living document. Timelines and priorities are subject to change based on user feedback, market conditions, and new technological opportunities. The timeline is presented in months relative to the project's official start.

---

### **Phase 1: MVP Launch & Market Validation (Months 1-3)**

**Goal:** To launch a secure, compliant, and functional product that proves the core value proposition. The focus is on a streamlined user journey from crypto deposit to card spending.

| Category | Initiative | Key Deliverables |
| :--- | :--- | :--- |
| **Core Functionality** | User Onboarding & Wallet | - Secure sign-up and login with MFA.<br>- Integration with a third-party KYC provider.<br>- Ability to connect personal crypto wallets (read-only). |
| | Crypto-to-USD Conversion | - Execute conversions for major assets (BTC, ETH, USDC).<br>- Real-time exchange rate quotes.<br>- Internal USD ledger for user balances. |
| | Card Provisioning | - Provision one multi-use virtual card per user.<br>- View card number, CVV, and expiry securely.<br>- Basic transaction history view. |
| **Platform & Infra** | Production Environment | - Deploy core microservices to a production cloud environment.<br>- Establish a secure VPC with private subnets.<br>- Basic CI/CD pipeline for automated testing and deployment. |
| **Security & Compliance** | Foundational Compliance | - Achieve PCI-DSS Level 1 compliance for the Privacy Vault.<br>- Complete initial external penetration test before launch.<br>- Implement AML transaction monitoring for deposits. |

---

### **Phase 2: Scaling, Reliability & Hardening (Months 4-9)**

**Goal:** To handle a growing user base, enhance platform reliability, and deepen our security posture based on initial user activity.

| Category | Initiative | Key Deliverables |
| :--- | :--- | :--- |
| **Core Functionality** | Expanded Asset Support | - Integrate support for 5-10 new high-demand cryptocurrencies.<br>- More granular user controls (e.g., freeze/unfreeze card). |
| | Enhanced Privacy Options | - Introduce single-use "burner" virtual cards.<br>- Allow users to set custom spending limits per card. |
| | User Experience | - Richer transaction details (merchant logos, categories).<br>- In-app support and notification center. |
| **Platform & Infra** | Scalability & Performance | - Implement database read replicas to handle increased load.<br>- Introduce a message queue (e.g., SQS) for reliable asynchronous processing.<br>- Build out comprehensive monitoring, logging, and alerting dashboards. |
| **Security & Compliance** | Proactive Security | - Launch a public bug bounty program.<br>- Automate static and dynamic security scanning (SAST/DAST) in CI/CD.<br>- Conduct regular, quarterly security audits and threat modeling exercises. |

---

### **Phase 3: Feature Expansion & Ecosystem Growth (Months 10-18)**

**Goal:** To establish Discard as a market leader by introducing innovative features, expanding internationally, and building an ecosystem.

| Category | Initiative | Key Deliverables |
| :--- | :--- | :--- |
| **Core Functionality** | Physical Cards | - Design, produce, and ship physical Discard cards.<br>- Functionality for PIN setting and ATM withdrawals. |
| | DeFi & Web3 Integration | - Allow users to earn yield on their USD balance via regulated DeFi protocols.<br>- Explore direct spending from smart contracts or L2 networks. |
| | Internationalization | - Support for additional fiat currencies (e.g., EUR, GBP).<br>- Localized app experience for new regions. |
| | Advanced Card Controls | - Merchant-locked cards (card only works at one specified merchant).<br>- Time-based card rules (e.g., card is only active on weekends). |
| **Platform & Infra** | Developer Platform | - Launch a public API for third-party developers to build on Discard.<br>- Create comprehensive API documentation and SDKs. |
| | Data Analytics | - Build an internal data analytics platform for product and business insights. |
| **Security & Compliance** | Advanced Compliance | - Pursue additional certifications (e.g., SOC 2 Type 2, ISO 27001).<br>- Implement a machine learning-based fraud detection engine. |
