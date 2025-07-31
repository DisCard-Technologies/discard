# Contributing to DisCard

Welcome! This guide will help you get started with contributing to DisCard.

## 🔧 Development Setup

### Required Tools

- **Cursor AI** - Our primary IDE for AI-assisted development
- **Linear** - Project management (invite required)
- **Docker Desktop** - Local services
- **Node.js 18+** - JavaScript runtime
- **Git** - Version control

### Initial Setup

1. **Accept invitations**
   - GitHub repository access
   - Linear workspace access
   - Any shared credentials (1Password/Bitwarden)

2. **Clone and setup**
   ```bash
   git clone https://github.com/[org]/discard.git
   cd discard
   npm run setup  # Installs all dependencies
   ```

3. **Configure Cursor AI**
   - Open project in Cursor
   - Install recommended extensions (ESLint, Prettier, Solidity)
   - Configure AI rules file (`.cursorrules` in repo)

## 📋 Workflow

### Linear Integration

1. **Pick a ticket** from Linear
2. **Move to "In Progress"** when starting
3. **Create branch** with Linear ticket ID:
   ```bash
   git checkout -b feature/DIS-123-implement-card-deletion
   ```

### Development Process

1. **Update from main**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/DIS-123-description
   ```

2. **Make changes**
   - Follow existing code patterns
   - Add tests for new features
   - Update documentation as needed

3. **Commit with Linear reference**
   ```bash
   git commit -m "feat(cards): implement auto-deletion logic [DIS-123]"
   ```

4. **Push and create PR**
   ```bash
   git push origin feature/DIS-123-description
   ```
   - PR title: `[DIS-123] Implement card auto-deletion`
   - Linear will auto-link the PR

### Cursor AI Best Practices

- Use AI for boilerplate generation
- Review all AI suggestions carefully
- Keep `.cursorrules` updated with project patterns
- Use cursor's chat for architecture decisions

## 🏗️ Architecture Guidelines

### Backend Services

- **Microservice boundaries**: Each service has single responsibility
- **API patterns**: RESTful with consistent error handling
- **Database**: Use migrations for all schema changes
- **Security**: All endpoints require authentication

### Smart Contracts

- **Gas optimization**: Priority for all contracts
- **Upgradeability**: Use proxy pattern where needed
- **Testing**: 100% coverage required
- **Auditing**: External audit before mainnet

### Frontend

- **Component structure**: Atomic design principles
- **State management**: Context API for global state
- **Navigation**: React Navigation v6
- **Styling**: Styled-components with theme

## 🧪 Testing Requirements

### Before submitting PR:

```bash
# Run all tests
npm test

# Check linting
npm run lint

# Type checking
npm run type-check

# Smart contract tests
cd contracts && npx hardhat test
```

### Test Coverage

- Backend: Minimum 80% coverage
- Frontend: Minimum 70% coverage
- Smart Contracts: 100% coverage required

## 🔒 Security Guidelines

1. **Never commit**:
   - API keys (use `.env`)
   - Private keys or mnemonics
   - User data or PII

2. **Always**:
   - Validate input data
   - Use parameterized queries
   - Implement rate limiting
   - Log security events

3. **Card Data**:
   - Encrypt at rest
   - Minimal retention
   - Auto-purge after expiry

## 📝 Code Style

### JavaScript/TypeScript

```javascript
// Good: Clear, self-documenting
async function createDisposableCard(userId, amount, currency) {
  validateInput(amount, currency);
  const card = await cardService.create({
    userId,
    amount,
    currency,
    expiresAt: Date.now() + CARD_LIFETIME
  });
  return maskCardDetails(card);
}

// Bad: Unclear naming, no validation
async function makeCard(u, a, c) {
  return await cs.create({u, a, c});
}
```

### Commit Messages

Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Formatting
- `refactor:` Code restructuring
- `test:` Tests
- `chore:` Maintenance

Always include Linear ticket: `[DIS-123]`

## 🚀 Deployment

### Staging

- Auto-deploys from `develop` branch
- URL: `https://staging.discard.app`
- Test all features here first

### Production

- Requires PR approval
- Deploys from `main` branch
- Automated via GitHub Actions

## 📞 Communication

- **Daily standup**: Update Linear tickets
- **Code reviews**: Within 24 hours
- **Questions**: Slack #discard-dev channel
- **Urgent**: Direct message

## 🎯 Current Priorities

1. **Sprint 1**: Core infrastructure
   - Wallet integration
   - Basic card creation
   - Smart contract deployment

2. **Sprint 2**: Card issuing
   - Marqeta integration
   - Auto-deletion logic
   - Privacy features

3. **Sprint 3**: Off-ramp
   - USD conversion
   - Multiple provider support
   - Rate optimization

## 🆘 Getting Help

- **Architecture questions**: Review `/docs/architecture.md`
- **API documentation**: Run locally at `/api-docs`
- **Linear workflow**: Check workspace settings
- **Cursor AI tips**: See `.cursorrules` file

Welcome to the team! 🚀