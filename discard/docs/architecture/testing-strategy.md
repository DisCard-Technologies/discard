# Testing Strategy

### Testing Pyramid

```
                  E2E Tests (Detox)
                 /              \
        API Integration Tests (Jest)
               /                    \
    Frontend Unit Tests    Backend Unit Tests
         (Jest + RTL)          (Jest + Supertest)
```

### Test Organization

#### Frontend Tests

```
apps/mobile/__tests__/
├── components/           # Component unit tests
│   ├── Card.test.tsx    # Card component testing
│   └── Privacy.test.tsx # Privacy indicator testing
├── screens/             # Screen integration tests
│   ├── Dashboard.test.tsx
│   └── CardCreation.test.tsx
├── services/            # API service testing
│   ├── api.test.ts
│   └── crypto.test.ts
└── e2e/                 # End-to-end tests
    ├── card-creation.e2e.ts
    └── privacy-flows.e2e.ts
```

#### Backend Tests

```
apps/api/tests/
├── unit/                # Unit tests
│   ├── services/
│   │   ├── cards.service.test.ts
│   │   └── crypto.service.test.ts
│   └── utils/
│       └── privacy.util.test.ts
├── integration/         # Integration tests
│   ├── auth.integration.test.ts
│   ├── cards.integration.test.ts
│   └── payments.integration.test.ts
└── fixtures/            # Test data and mocks
    ├── cards.fixture.ts
    └── users.fixture.ts
```

### Test Examples

#### Frontend Component Test

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CardComponent } from '../Card';
import { mockCard } from '../../__fixtures__/card.fixture';

describe('CardComponent', () => {
  it('should display card with privacy indicator', () => {
    const { getByText, getByTestId } = render(
      <CardComponent card={mockCard} />
    );
    
    expect(getByText('****1234')).toBeTruthy();
    expect(getByTestId('privacy-indicator')).toBeTruthy();
    expect(getByTestId('privacy-indicator')).toHaveProps({
      status: 'active'
    });
  });

  it('should handle card deletion with confirmation', async () => {
    const onDelete = jest.fn();
    const { getByText } = render(
      <CardComponent card={mockCard} onDelete={onDelete} />
    );
    
    fireEvent.press(getByText('Delete Card'));
    fireEvent.press(getByText('Confirm Deletion'));
    
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(mockCard.cardId);
    });
  });
});
```

#### Backend API Test

```typescript
import request from 'supertest';
import { app } from '../../../src/app';
import { createTestCard, cleanupTestData } from '../../fixtures/cards.fixture';

describe('Cards API', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  describe('POST /cards', () => {
    it('should create new disposable card with privacy isolation', async () => {
      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', 'Bearer valid_jwt_token')
        .send({
          spendingLimit: 50000, // $500.00
          expirationDate: '12/26'
        })
        .expect(201);

      expect(response.body).toMatchObject({
        cardId: expect.any(String),
        status: 'active',
        spendingLimit: 50000,
        currentBalance: 0
      });

      // Verify privacy isolation
      expect(response.body.cardNumber).toMatch(/^\d{16}$/);
      expect(response.body.cvv).toMatch(/^\d{3}$/);
    });

    it('should enforce spending limits', async () => {
      await request(app)
        .post('/api/v1/cards')
        .set('Authorization', 'Bearer valid_jwt_token')
        .send({
          spendingLimit: 50, // Too low
        })
        .expect(400);
    });
  });

  describe('DELETE /cards/:cardId', () => {
    it('should permanently delete card with cryptographic verification', async () => {
      const card = await createTestCard();

      const response = await request(app)
        .delete(`/api/v1/cards/${card.cardId}`)
        .set('Authorization', 'Bearer valid_jwt_token')
        .expect(200);

      expect(response.body).toMatchObject({
        deleted: true,
        deletionProof: expect.any(String),
        deletedAt: expect.any(String)
      });

      // Verify card is completely inaccessible
      await request(app)
        .get(`/api/v1/cards/${card.cardId}`)
        .set('Authorization', 'Bearer valid_jwt_token')
        .expect(404);
    });
  });
});
```
