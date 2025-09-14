
# Discard Protocol: Security & Compliance

### 1. Overview

Security is the foundation of the Discard protocol. Our approach is built on the principle of **Defense-in-Depth**, layering multiple security controls to protect user data and funds. This document outlines the key pillars of our security program: encryption, key management, infrastructure security, and regulatory compliance.

We adhere to the **Principle of Least Privilege**, ensuring that any component, system, or employee has only the minimum level of access required to perform their function.

### 2. Data Encryption

All data within the Discard ecosystem is encrypted, both when it is moving (in transit) and when it is stored (at rest).

#### 2.1. Encryption in Transit

-   **External Communication:** All traffic between user clients (web, mobile) and the Discard API Gateway is enforced to use **TLS 1.3** with strong, industry-standard cipher suites.
-   **Internal Communication:** All service-to-service communication within our backend occurs over a private network and is secured with **mutual TLS (mTLS)**. This ensures that only authenticated and authorized services can communicate with each other, preventing spoofing or man-in-the-middle attacks within our infrastructure.

#### 2.2. Encryption at Rest

-   **Database Encryption:** Our primary databases and data ledgers are encrypted at rest using **AES-256**. This is managed by our cloud provider's key management service (e.g., AWS KMS), which protects the underlying data files from unauthorized access.
-   **Application-Layer Encryption:** In addition to the baseline storage encryption, personally identifiable information (PII) and other sensitive data fields within the database are encrypted at the application layer before being written to the database. This means that even if the database itself were compromised, the sensitive data would remain in an encrypted, unreadable format.
-   **Storage and Backups:** All object storage (e.g., for document uploads) and automated backups are also encrypted at rest with AES-256.

### 3. Key Management

Cryptographic keys are the most critical component of our security posture. Their management is handled with extreme care.

-   **Key Storage:** All cryptographic keys are generated, stored, and managed within a FIPS 140-2 Level 3 validated **Hardware Security Module (HSM)** or a cloud-native equivalent (e.g., AWS CloudHSM or Google Cloud KMS). Keys never exist in plaintext on developer machines or application servers.
-   **Key Hierarchy:** We employ an envelope encryption strategy. A master **Root Key** is stored in the HSM. This key is used to encrypt **Data Encryption Keys (DEKs)**, which are then used to encrypt the actual data. This limits the exposure of the most critical key.
-   **Access Control:** Access to the key management system is strictly controlled via IAM policies, requiring multi-factor authentication and granted only to a minimal number of automated systems. Human access is prohibited unless under audited, break-glass emergency procedures.
-   **Key Rotation:** We have a strict policy for key rotation. Root Keys are rotated annually, and Data Encryption Keys are automatically rotated on a much more frequent basis (e.g., every 90 days).
-   **Auditing:** Every single operation involving a key (creation, use, rotation, deletion) is logged and monitored for anomalous activity.

### 4. Infrastructure & Network Security

-   **Virtual Private Cloud (VPC):** All services are deployed within an isolated VPC, preventing any public internet access to our core application and database servers.
-   **Firewalls & Security Groups:** We employ a multi-layered firewall strategy. Network ACLs and Security Groups are configured with a default-deny policy, only allowing traffic from known, authorized sources on specific ports.
-   **Web Application Firewall (WAF):** All requests to our API Gateway pass through a WAF, which provides real-time protection against common web exploits such as SQL injection, Cross-Site Scripting (XSS), and denial-of-service (DoS) attacks.
-   **Hardening:** All servers and containers are built from hardened, minimal base images and are regularly scanned for vulnerabilities.

### 5. Compliance Measures

Discard is designed to comply with all relevant financial and data privacy regulations.

#### 5.1. PCI-DSS (Payment Card Industry Data Security Standard)

We have architected our system to drastically minimize the scope of PCI-DSS compliance.
-   **Data Isolation:** As detailed in our architecture, all Cardholder Data (CHD), including the full Primary Account Number (PAN), is exclusively stored and processed within the isolated **Privacy Vault**. This vault is built and maintained in a dedicated, PCI-DSS Level 1 compliant environment.
-   **No Direct Handling:** The vast majority of our services **never** see or store the full PAN. They operate on non-sensitive tokens, effectively removing them from the scope of a PCI audit.

#### 5.2. KYC/AML (Know Your Customer / Anti-Money Laundering)

To comply with financial regulations and prevent illicit activity, we have a robust KYC/AML program:
-   **Identity Verification:** All users must undergo identity verification through a trusted, third-party provider before they can access core financial features.
-   **Transaction Monitoring:** We integrate with leading on-chain analytics firms (e.g., Chainalysis) to monitor for suspicious deposit addresses or funds originating from sanctioned entities.
-   **Reporting:** We have internal procedures for filing Suspicious Activity Reports (SARs) as required by law.

#### 5.3. GDPR (General Data Protection Regulation)

Our privacy architecture directly supports GDPR principles:
-   **Data Minimization:** We only collect the data that is strictly necessary for the functioning of the service.
-   **Right to Erasure:** Our architecture allows for the complete deletion of a user's PII upon request, in compliance with their "right to be forgotten."
-   **Data Portability:** Users can request an export of their personal data in a machine-readable format.

### 6. Incident Response

-   **Plan:** We maintain a documented incident response plan that is regularly reviewed and tested.
-   **Audits:** Our systems undergo regular internal and external penetration testing and security audits.
-   **Bug Bounty:** We run a private bug bounty program to encourage the responsible disclosure of security vulnerabilities by independent researchers.
