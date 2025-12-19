# Store Migration Guide: Legacy to Convex

## Overview

This guide documents the migration from legacy Express/Supabase stores to Convex-based stores.

## Store Mappings

| Legacy Store | Convex Store | Notes |
|--------------|--------------|-------|
| `auth.tsx` | `authConvex.tsx` | JWT + TOTP → Passkey authentication |
| `cards.tsx` | `cardsConvex.tsx` | REST API → Convex mutations |
| `funding.tsx` | `fundingConvex.tsx` | REST API → Convex mutations + Stripe |
| `crypto.ts` | `cryptoConvex.tsx` | Zustand + polling → Convex subscriptions |

## Hook Mappings

### Authentication

```typescript
// Legacy
import { useAuth, useAuthOperations } from './auth';
const { user, isAuthenticated } = useAuth();
const { login, register, logout } = useAuthOperations();

// Convex
import { useConvexAuth } from './authConvex';
const { user, isAuthenticated, register, authenticate, signOut } = useConvexAuth();
```

### Cards

```typescript
// Legacy
import { useCards, useCardOperations } from './cards';
const { cards, selectedCard, isLoading } = useCards();
const { createCard, deleteCard, updateCardStatus } = useCardOperations();

// Convex
import { useConvexCards, useCardOperations } from './cardsConvex';
const { cards, selectedCard, isLoading } = useConvexCards();
const { createCard, deleteCard, pauseCard, unpauseCard, freezeCard } = useCardOperations();
```

### Funding

```typescript
// Legacy
import { useFunding, useFundingOperations } from './funding';
const { accountBalance, transactions, isLoading } = useFunding();
const { fundAccount, allocateToCard, transferBetweenCards } = useFundingOperations();

// Convex
import { useConvexFunding, useFundingOperations } from './fundingConvex';
const { accountBalance, transactions, isLoading } = useConvexFunding();
const { fundAccount, allocateToCard, transferBetweenCards } = useFundingOperations();
```

### Crypto / Wallets

```typescript
// Legacy (Zustand)
import { useCryptoStore } from './crypto';
const { connectedWallets, conversionRates, connectWallet, disconnectWallet } = useCryptoStore();

// Convex
import { useCrypto, useConversionOperations } from './cryptoConvex';
const { wallets, rates, isLoading } = useCrypto();
const { connectWallet, disconnectWallet, refreshBalance } = useWalletOperations();
```

## Key Differences

### 1. No Manual Token Management
```typescript
// Legacy - Manual token refresh
const { accessToken, refreshToken } = useAuth();
// Token passed to every API call

// Convex - Automatic
// Convex client handles authentication automatically
```

### 2. Real-Time Updates
```typescript
// Legacy - Manual polling/refresh
useEffect(() => {
  const interval = setInterval(fetchBalances, 30000);
  return () => clearInterval(interval);
}, []);

// Convex - Automatic subscriptions
const cards = useQuery(api.cards.cards.list);
// Automatically updates when data changes
```

### 3. Error Handling
```typescript
// Legacy - Try/catch on every call
try {
  await fundAccount(amount);
} catch (error) {
  setError(error.message);
}

// Convex - Centralized error handling
const { mutate, error, isLoading } = useMutation(api.funding.fundAccount);
// Error state provided automatically
```

### 4. Optimistic Updates
```typescript
// Legacy - Manual optimistic updates
setCards(prev => [...prev, optimisticCard]);
try {
  const newCard = await createCard(data);
  setCards(prev => prev.map(c => c.id === optimisticCard.id ? newCard : c));
} catch {
  setCards(prev => prev.filter(c => c.id !== optimisticCard.id));
}

// Convex - Built-in optimistic updates
// Convex handles this automatically with its reactive system
```

## Migration Checklist

- [ ] Replace `useAuth()` with `useConvexAuth()`
- [ ] Replace `useCards()` with `useConvexCards()`
- [ ] Replace `useFunding()` with `useConvexFunding()`
- [ ] Replace `useCryptoStore()` with `useCrypto()`
- [ ] Remove all `EXPO_PUBLIC_API_URL` references
- [ ] Remove polling intervals (Convex auto-syncs)
- [ ] Remove manual token refresh logic
- [ ] Update error handling to use Convex patterns

## Testing

After migration, verify:
1. User can register with passkey
2. User can authenticate with passkey
3. Cards load and display correctly
4. Card operations work (create, pause, delete)
5. Funding operations work (fund, allocate, transfer)
6. Wallet connections work
7. Real-time updates are received
8. Error states display correctly

## Deprecation Timeline

| Phase | Timeframe | Action |
|-------|-----------|--------|
| 1 | Now | Deprecation notices added |
| 2 | After cutover | Legacy stores marked as `@internal` |
| 3 | +30 days | Legacy stores removed |
| 4 | +60 days | Legacy API removed |
