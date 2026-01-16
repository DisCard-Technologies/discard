# Contributing to DisCard

Thank you for your interest in contributing to DisCard! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

Be respectful and inclusive. We welcome contributors from all backgrounds and experience levels.

- Be patient and welcoming
- Be considerate and respectful
- Focus on what's best for the community
- Show empathy towards others

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/discard.git
   cd discard
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_ORG/discard.git
   ```

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Convex CLI (`npm install -g convex`)
- iOS Simulator (macOS) or Android Emulator

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start Convex development server
npx convex dev

# In another terminal, start Expo
npm start
```

### Development Build

For features requiring native modules (Turnkey passkeys, biometrics):

```bash
# Create development build
npx expo prebuild

# Run on iOS
npx expo run:ios

# Run on Android
npx expo run:android
```

## Project Structure

```
discard/
├── app/                    # Expo Router screens
├── components/             # React Native components
├── convex/                 # Backend (Convex functions + schema)
├── services/               # External API clients
├── programs/               # Solana smart contracts (Anchor)
├── packages/               # elizaOS plugins
├── hooks/                  # React hooks
├── stores/                 # State management
├── lib/                    # Utilities
└── docs/                   # Documentation
```

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `app/` | Screen components using Expo Router file-based routing |
| `components/` | Reusable UI components |
| `convex/` | Backend functions, schema, and webhooks |
| `services/` | API clients for external services (Jupiter, Privacy Cash, etc.) |
| `programs/` | Anchor smart contracts for on-chain logic |
| `packages/` | elizaOS plugins for AI (Brain + Soul) |

## Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-private-p2p` - New features
- `fix/deposit-flow-bug` - Bug fixes
- `docs/update-readme` - Documentation
- `refactor/card-service` - Code refactoring

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Formatting, no code change
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Examples:**
```
feat(cards): add self-healing card reissue
fix(deposit): handle MoonPay webhook timeout
docs(readme): add identity verification section
refactor(privacy): extract Privacy Cash client
```

## Submitting Changes

### Pull Request Process

1. **Update your fork**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes** and commit

4. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request** with:
   - Clear title describing the change
   - Description of what changed and why
   - Screenshots/videos for UI changes
   - Link to related issue (if applicable)

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] No new TypeScript errors
- [ ] Convex schema changes are backward compatible

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use explicit types for function parameters
- Avoid `any` - use proper types or `unknown`

### React Native

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use `StyleSheet.create()` for styles

### Convex

- Use validators for all function arguments
- Handle errors gracefully
- Keep functions focused and composable
- Use proper types from schema

### Formatting

We use ESLint and Prettier. Run before committing:

```bash
npm run lint
npm run format
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run type-check
```

### Writing Tests

- Test files go in `__tests__/` directories or use `.test.ts` suffix
- Focus on behavior, not implementation
- Mock external services appropriately
- Aim for meaningful coverage, not 100%

## Documentation

### When to Update Docs

- Adding new features
- Changing existing behavior
- Adding new environment variables
- Modifying API endpoints
- Updating setup instructions

### Documentation Locations

| Type | Location |
|------|----------|
| User-facing | `README.md` |
| Technical architecture | `docs/architecture/` |
| API reference | `docs/api/` |
| Integration guides | `docs/INTEGRATIONS.md` |
| Stories/epics | `docs/stories/` |

## Questions?

- Open a [GitHub Discussion](https://github.com/YOUR_ORG/discard/discussions) for questions
- Check existing [Issues](https://github.com/YOUR_ORG/discard/issues) before creating new ones
- Join our community channels (if available)

---

Thank you for contributing to DisCard!
