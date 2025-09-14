# Marqeta Webhook Configuration Guide

## Overview

This guide explains how to configure Marqeta webhooks to receive real-time notifications for card and transaction events in the DisCard application.

## Webhook Endpoint Details

### Production Endpoint
```
POST https://your-api-domain.com/api/v1/webhooks/marqeta
```

### Development/Staging Endpoint
```
POST https://your-staging-api-domain.com/api/v1/webhooks/marqeta
```

### Local Development (using ngrok or similar)
```
POST https://your-ngrok-domain.ngrok.io/api/v1/webhooks/marqeta
```

### Health Check Endpoint
```
GET https://your-api-domain.com/api/v1/webhooks/marqeta/health
```

## Marqeta Dashboard Configuration

1. **Log into Marqeta Dashboard**
   - Sandbox: https://sandbox-admin.marqeta.com
   - Production: https://admin.marqeta.com

2. **Navigate to Webhooks**
   - Go to `Developer` → `Webhooks`

3. **Create New Webhook**
   - Click "Create Webhook"
   - Fill in the following details:
     - **Name**: DisCard Transaction Webhook
     - **URL**: Your webhook endpoint URL (see above)
     - **Secret**: Generate a secure webhook secret (32+ characters)
     - **Active**: Yes

4. **Select Event Types**
   Choose the following events to receive:
   - **Transaction Events**:
     - `transaction.authorization`
     - `transaction.clearing`
     - `transaction.completion`
     - `transaction.declined`
   - **Card Events**:
     - `card.created`
     - `card.activated`
     - `card.suspended`
     - `card.terminated`

5. **Save Webhook**
   - Copy the webhook secret
   - Save the webhook configuration

## Environment Configuration

Add the following environment variables to your `.env` file:

```env
# Marqeta Webhook Configuration
MARQETA_WEBHOOK_SECRET=your-webhook-secret-from-marqeta-dashboard
```

## Webhook Security

### Signature Validation

All incoming webhooks are validated using HMAC SHA-256 signature verification:

1. Marqeta includes a signature in the `x-marqeta-signature` header
2. The signature is calculated using:
   - The webhook secret as the key
   - The raw request body as the message
   - HMAC SHA-256 algorithm

3. Our webhook handler validates this signature before processing any events

### Implementation Details

The signature validation is implemented in `MarqetaService.validateWebhookSignature()`:

```typescript
validateWebhookSignature(payload: string, signature: string): boolean {
  const webhookSecret = process.env.MARQETA_WEBHOOK_SECRET;
  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');
  
  const providedSignature = signature.replace('sha256=', '');
  
  // Constant-time comparison to prevent timing attacks
  return createHash('sha256')
    .update(expectedSignature)
    .digest('hex') === createHash('sha256')
    .update(providedSignature)
    .digest('hex');
}
```

## Testing Webhooks

### Local Development Testing

1. **Install ngrok** (if not already installed):
   ```bash
   npm install -g ngrok
   ```

2. **Start your API server**:
   ```bash
   cd apps/api
   npm run dev
   ```

3. **Expose local server with ngrok**:
   ```bash
   ngrok http 3001
   ```

4. **Update Marqeta webhook URL**:
   - Use the ngrok HTTPS URL + `/api/v1/webhooks/marqeta`
   - Example: `https://abc123.ngrok.io/api/v1/webhooks/marqeta`

### Testing with Marqeta Sandbox

1. **Create a test card** using the API or dashboard
2. **Simulate transactions** using Marqeta's simulation endpoints:
   ```bash
   # Authorization
   POST https://sandbox-api.marqeta.com/v3/simulations/authorization
   
   # Clearing
   POST https://sandbox-api.marqeta.com/v3/simulations/clearing
   ```

3. **Monitor webhook logs** in your application logs

### Health Check

Verify your webhook endpoint is accessible:

```bash
curl https://your-api-domain.com/api/v1/webhooks/marqeta/health
```

Expected response:
```json
{
  "status": "ok",
  "webhook": "marqeta",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Webhook Event Processing

### Transaction Events

1. **Authorization** (`transaction.authorization`)
   - Stores transaction record in database
   - Sends real-time WebSocket notification to connected clients
   - Updates card balance/limits if applicable

2. **Clearing** (`transaction.clearing`)
   - Updates transaction status to "settled"
   - Clears authorization holds
   - Updates final transaction amounts

3. **Completion** (`transaction.completion`)
   - Marks transaction as fully completed
   - Updates transaction history

4. **Declined** (`transaction.declined`)
   - Records declined transaction with reason
   - Notifies user of declined transaction

### Card Events

1. **Card Created** (`card.created`)
   - Confirms card creation in Marqeta network
   - Updates provisioning status

2. **Card Activated** (`card.activated`)
   - Updates card status to active
   - Enables transaction processing

3. **Card Suspended** (`card.suspended`)
   - Temporarily disables card
   - Blocks new transactions

4. **Card Terminated** (`card.terminated`)
   - Permanently disables card
   - Used for secure card deletion

## Monitoring and Debugging

### Webhook Logs

All webhook events are logged with the following information:
- Event type and timestamp
- Card context and transaction details
- Processing status and any errors

### Database Tables

Webhook data is stored in:
- `payment_transactions` - Transaction records
- `visa_card_details` - Card status updates
- `network_status_log` - Webhook health monitoring

### WebSocket Notifications

Real-time updates are sent via WebSocket to:
- Room: `card_{cardContext}`
- Event: `transaction_event`

## Troubleshooting

### Common Issues

1. **401 Invalid Signature**
   - Verify `MARQETA_WEBHOOK_SECRET` is correctly set
   - Ensure you're using the raw request body for signature validation
   - Check for any request body parsing middleware issues

2. **Webhook Not Received**
   - Verify webhook URL is publicly accessible
   - Check Marqeta webhook status in dashboard
   - Review Marqeta webhook logs for delivery attempts

3. **Processing Errors**
   - Check application logs for detailed error messages
   - Verify database connectivity
   - Ensure all required environment variables are set

### Network Connectivity

The webhook handler includes network monitoring:
- Periodic health checks to Marqeta API
- Fallback mechanisms for network outages
- Queuing for webhook replay when needed

## Production Considerations

1. **High Availability**
   - Deploy webhook handlers across multiple instances
   - Use load balancer with health checks
   - Implement webhook replay mechanism

2. **Performance**
   - Process webhooks asynchronously
   - Use database connection pooling
   - Monitor webhook processing times

3. **Security**
   - Always validate webhook signatures
   - Use HTTPS endpoints only
   - Implement rate limiting
   - Log but don't expose sensitive data

4. **Compliance**
   - Ensure PCI compliance for transaction data
   - Implement data retention policies
   - Audit webhook access and processing