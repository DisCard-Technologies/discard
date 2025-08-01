# Technical Assumptions

### Repository Structure: Monorepo
Monorepo structure using Nx workspace management to coordinate mobile applications, web application, backend services, and shared libraries. This enables shared TypeScript interfaces, crypto utilities, and privacy-preserving components across all platforms while maintaining clear service boundaries.

### Service Architecture
**Microservices architecture within monorepo** implementing privacy-by-design principles with separate services for user management, card lifecycle, transaction processing, cryptocurrency integration, and compliance monitoring. Each service maintains data isolation preventing cross-service correlation while enabling necessary compliance monitoring.

### Testing Requirements
**Comprehensive testing pyramid** including unit tests (90%+ coverage), integration tests for cryptocurrency and payment processing, end-to-end privacy validation tests, and security penetration testing. Automated testing for privacy preservation including verification that deleted cards cannot be recovered and transactions cannot be correlated across cards.

### Additional Technical Assumptions and Requests
**Cryptocurrency Integration:** Real-time integration with major blockchain networks and cryptocurrency exchanges for conversion rates, requiring robust error handling for network congestion and rate fluctuations.

**Privacy-Preserving Architecture:** Implementation of zero-knowledge principles where internal systems cannot correlate user activities across cards, requiring careful database design and access controls.

**Compliance Integration:** Automated compliance monitoring and reporting systems that satisfy regulatory requirements while minimizing data collection and retention.

**Performance Optimization:** Caching strategies for cryptocurrency rates and card processing that maintain real-time accuracy while ensuring high availability during market volatility.
