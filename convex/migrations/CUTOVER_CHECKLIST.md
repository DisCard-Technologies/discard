# DisCard Production Cutover Checklist

## Pre-Cutover (T-7 Days)

### Infrastructure Setup
- [ ] Convex production deployment created
- [ ] Convex environment variables configured in dashboard
- [ ] Marqeta production credentials obtained
- [ ] Stripe production credentials obtained
- [ ] Anthropic API key with production quota
- [ ] Solana mainnet RPC endpoint configured
- [ ] DNS configured for new API endpoints (if any)

### Testing
- [ ] All Convex functions tested in staging
- [ ] Marqeta webhook integration tested
- [ ] Stripe webhook integration tested
- [ ] Passkey authentication flow tested on real devices
- [ ] Intent parsing with Claude tested
- [ ] Card creation and authorization flow tested
- [ ] DeFi position sync tested

### Data Migration Prep
- [ ] Export script tested on production-like data
- [ ] Transform script validated
- [ ] Import script dry-run completed
- [ ] Data reconciliation queries prepared
- [ ] Rollback plan documented

---

## Cutover Day (T-0)

### Phase 1: Pre-Migration (T-4 hours)
- [ ] Notify users of scheduled maintenance
- [ ] Enable maintenance mode on mobile app
- [ ] Pause all Marqeta webhooks (Marqeta dashboard)
- [ ] Pause Stripe webhooks (Stripe dashboard)
- [ ] Stop all cron jobs in legacy API
- [ ] Take final Supabase backup

### Phase 2: Data Export (T-3 hours)
- [ ] Run `export-supabase.ts`
- [ ] Verify export file integrity
- [ ] Verify record counts match Supabase
- [ ] Save export files to secure backup

### Phase 3: Data Transform (T-2.5 hours)
- [ ] Run `transform-data.ts`
- [ ] Verify transformed data format
- [ ] Spot-check critical records (users, cards with balances)

### Phase 4: Data Import (T-2 hours)
- [ ] Run Convex import mutations in order:
  1. [ ] `importUsers`
  2. [ ] `importCards`
  3. [ ] `importWallets`
  4. [ ] `importAuthorizations`
  5. [ ] `importAuthorizationHolds`
  6. [ ] `importFraud`
  7. [ ] `importDefi`
  8. [ ] `importCompliance`
  9. [ ] `importFundingTransactions`
  10. [ ] `importCryptoRates`

### Phase 5: Verification (T-1 hour)
- [ ] Total user count matches
- [ ] Total card count matches
- [ ] Sum of card balances matches Supabase
- [ ] Active authorization holds preserved
- [ ] Sample user can log in with existing session
- [ ] Sample card shows correct balance
- [ ] Marqeta card tokens resolve correctly

### Phase 6: Webhook Cutover (T-30 min)
- [ ] Update Marqeta webhook URL to Convex HTTP endpoint
- [ ] Update Stripe webhook URL to Convex HTTP endpoint
- [ ] Test Marqeta webhook with test transaction
- [ ] Test Stripe webhook with test payment

### Phase 7: App Release (T-0)
- [ ] Deploy new mobile app build to stores
- [ ] Or enable OTA update via Expo
- [ ] Disable maintenance mode
- [ ] Monitor error rates

---

## Post-Cutover (T+1 to T+7 Days)

### Day 1 Monitoring
- [ ] Authorization response times < 800ms
- [ ] No webhook failures
- [ ] No authentication errors
- [ ] Cron jobs running successfully
- [ ] Real-time subscriptions working

### Week 1 Tasks
- [ ] Monitor fraud detection accuracy
- [ ] Check DeFi position sync accuracy
- [ ] Verify crypto rate updates
- [ ] Address any user-reported issues
- [ ] Keep Supabase in read-only mode for reference

### Week 2+ (Cleanup)
- [ ] Archive legacy API code
- [ ] Delete deprecated environment variables
- [ ] Remove Supabase client code from mobile app
- [ ] Update documentation
- [ ] Schedule Supabase instance termination (T+30 days)

---

## Rollback Plan

If critical issues are detected during cutover:

### Immediate Rollback (< 1 hour into cutover)
1. Stop Convex imports
2. Restore Supabase from backup
3. Re-enable legacy webhooks
4. Push legacy app build
5. Investigate and reschedule

### Post-Import Rollback (> 1 hour)
1. Disable Convex webhooks
2. Re-enable legacy webhooks
3. Keep Convex data for analysis
4. Push legacy app build
5. Full investigation required

---

## Emergency Contacts

| Role | Contact |
|------|---------|
| Convex Support | support@convex.dev |
| Marqeta Support | (your account rep) |
| Stripe Support | (your account rep) |
| On-Call Engineer | (team contact) |

---

## Verification Queries

### User Count
```typescript
// Convex
const userCount = await ctx.db.query("users").collect();
console.log("Users:", userCount.length);
```

### Card Balance Sum
```typescript
// Convex
const cards = await ctx.db.query("cards").collect();
const totalBalance = cards.reduce((sum, c) => sum + c.currentBalance, 0);
console.log("Total card balance:", totalBalance / 100, "USD");
```

### Active Holds
```typescript
// Convex
const holds = await ctx.db
  .query("authorizationHolds")
  .withIndex("by_status", q => q.eq("status", "active"))
  .collect();
console.log("Active holds:", holds.length);
```

---

## Sign-Off

| Phase | Completed By | Time | Signature |
|-------|--------------|------|-----------|
| Pre-Migration | | | |
| Data Export | | | |
| Data Transform | | | |
| Data Import | | | |
| Verification | | | |
| Webhook Cutover | | | |
| App Release | | | |
| Post-Cutover Day 1 | | | |
