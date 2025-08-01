# DisCard Database

This directory contains the database schema, migrations, and seed data for the DisCard application.

## Structure

- `schema.sql` - Complete database schema with all tables, indexes, and constraints
- `migrations/` - Database migration files (numbered sequentially)
- `seeds/` - Seed data for development and testing

## Database Setup

### 1. Supabase Project Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key
3. Add them to your environment variables:
   ```bash
   SUPABASE_URL=your_project_url
   SUPABASE_ANON_KEY=your_anon_key
   ```

### 2. Schema Installation

Run the schema in your Supabase SQL editor:

```sql
-- Copy and paste the contents of schema.sql
```

Or use the migration approach:

```sql
-- Run migrations in order
-- 001_initial_schema.sql
```

### 3. Development Data

For development and testing, run the seed data:

```sql
-- Copy and paste the contents of seeds/001_development_data.sql
```

## Database Features

### Tables

- **users** - User accounts with KYC status
- **cards** - Virtual and physical cards with balances and limits
- **transactions** - Purchase/refund/fee transactions
- **funding_sources** - Crypto wallets and exchange connections
- **card_funding** - Crypto-to-USD funding transactions

### Security Features

- **Row Level Security (RLS)** - Users can only access their own data
- **Encrypted card numbers** - Sensitive data is encrypted at rest
- **UUID primary keys** - No sequential IDs that could be guessed
- **Input validation** - Database-level constraints and checks

### Performance Optimizations

- **Indexes** - Optimized for common query patterns
- **Triggers** - Automatic timestamp updates
- **Efficient queries** - Designed for fast user-specific lookups

## Environment Variables

Required environment variables:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT Configuration (for auth)
JWT_SECRET=your-jwt-secret

# Database URL (for migrations)
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
```

## Test Data

The seed data includes:

- 4 test users with different verification statuses
- 4 test cards (virtual/physical, active/frozen)
- 5 sample transactions from various merchants
- 4 funding sources (Bitcoin, Ethereum, USDC wallets)
- 4 card funding transactions showing crypto-to-USD conversions

### Test User Credentials

All test users have password: `password123`

- `john.doe@example.com` / `johndoe` - Verified, approved KYC
- `alice.smith@example.com` / `alicesmith` - Verified, approved KYC  
- `bob.wilson@example.com` / `bobwilson` - Unverified, pending KYC
- `test.user@example.com` / `testuser` - Verified, approved KYC

## Development

When making schema changes:

1. Create a new migration file: `migrations/002_your_change.sql`
2. Update the main `schema.sql` file
3. Test the migration on a development database
4. Update seed data if necessary

## Production Deployment

For production:

1. Enable Row Level Security on all tables
2. Set up proper backup schedules
3. Monitor query performance
4. Use environment-specific encryption keys
5. Enable database logging and monitoring