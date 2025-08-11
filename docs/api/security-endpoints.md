# Security API Endpoints Documentation

## Overview

This document describes the REST API endpoints for DisCard's security and fraud detection system. All endpoints require authentication and follow card-level access control policies.

## Base URL

```
https://api.discard.com/v1/security
```

## Authentication

All endpoints require Bearer token authentication:

```http
Authorization: Bearer <jwt_token>
```

## Rate Limiting

Global rate limits apply to all security endpoints:

- **Standard endpoints**: 100 requests per 15 minutes per IP
- **Analysis endpoints**: 20 requests per 5 minutes per IP  
- **Card control endpoints**: 10 requests per hour per card
- **MFA endpoints**: 15 attempts per 5 minutes per card

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Fraud Detection Endpoints

### Get Fraud Status

Retrieve current fraud detection status for a card.

```http
GET /fraud/status/{cardId}
```

**Parameters:**
- `cardId` (path, required): Card identifier

**Response:**
```json
{
  "cardId": "card_123",
  "currentRiskLevel": "low",
  "riskScore": 15,
  "lastAnalysis": "2024-01-15T14:30:00Z",
  "activeAlerts": 0,
  "modelVersion": "v1.2.3",
  "analysisCount24h": 12,
  "settings": {
    "riskTolerance": "medium",
    "autoFreezeEnabled": true,
    "alertThreshold": 50,
    "freezeThreshold": 75
  }
}
```

**Error Responses:**
- `403 Forbidden`: Card access denied
- `404 Not Found`: Card not found
- `429 Too Many Requests`: Rate limit exceeded

---

### Analyze Transaction

Perform real-time fraud analysis on a transaction.

```http
POST /fraud/analyze
```

**Request Body:**
```json
{
  "transaction": {
    "transactionId": "txn_abc123",
    "cardId": "card_123",
    "amount": 250.00,
    "merchant": {
      "name": "GROCERY STORE",
      "mcc": "5411",
      "location": {
        "lat": 37.7749,
        "lon": -122.4194
      }
    },
    "timestamp": "2024-01-15T14:30:00Z",
    "location": {
      "lat": 37.7749,
      "lon": -122.4194
    }
  },
  "context": {
    "deviceId": "device_456",
    "ipAddress": "192.168.1.1",
    "userAgent": "DisCard iOS/1.0"
  }
}
```

**Response:**
```json
{
  "eventId": "fraud_event_789",
  "riskScore": 35,
  "riskLevel": "medium",
  "actionRecommended": "alert",
  "analysisTime": 145,
  "anomalies": [
    {
      "type": "amount_anomaly",
      "severity": "low",
      "description": "Transaction amount 1.5x higher than recent average",
      "contribution": 10
    },
    {
      "type": "geographic_anomaly", 
      "severity": "medium",
      "description": "Transaction 25 miles from home location",
      "contribution": 15
    }
  ],
  "modelScores": {
    "velocity": 5,
    "amount": 15,
    "geographic": 10,
    "merchant": 0,
    "pattern": 5,
    "ml": 12
  },
  "actionTaken": "alert_generated",
  "confidence": 0.85
}
```

---

## Card Control Endpoints

### Freeze Card

Freeze a card for security reasons.

```http
POST /fraud/cards/{cardId}/freeze
```

**Request Body:**
```json
{
  "reason": "fraud_detected",
  "metadata": {
    "eventId": "fraud_event_789",
    "riskScore": 85,
    "userInitiated": false
  },
  "mfaToken": "mfa_token_if_required"
}
```

**Response:**
```json
{
  "success": true,
  "cardId": "card_123",
  "frozenAt": "2024-01-15T14:31:00Z",
  "reason": "fraud_detected",
  "canUnfreeze": true,
  "autoUnfreezeAt": "2024-01-16T14:31:00Z",
  "marqetaResponse": {
    "status": "SUSPENDED",
    "transitionTime": "2024-01-15T14:31:00Z"
  }
}
```

**MFA Required Response:**
```json
{
  "requiresMFA": true,
  "challenge": {
    "challengeId": "mfa_challenge_456",
    "method": "totp",
    "expiresAt": "2024-01-15T14:36:00Z"
  },
  "riskAssessment": {
    "riskScore": 75,
    "requiresMFA": true,
    "factors": ["high_risk_action", "unusual_device"]
  }
}
```

---

### Unfreeze Card  

Unfreeze a previously frozen card.

```http
POST /fraud/cards/{cardId}/unfreeze
```

**Request Body:**
```json
{
  "reason": "false_positive",
  "mfaToken": "mfa_token_if_required"
}
```

**Response:**
```json
{
  "success": true,
  "cardId": "card_123", 
  "unfrozenAt": "2024-01-15T14:35:00Z",
  "reason": "false_positive",
  "marqetaResponse": {
    "status": "ACTIVE",
    "transitionTime": "2024-01-15T14:35:00Z"
  }
}
```

---

## Feedback Endpoints

### Submit Fraud Feedback

Report whether a fraud detection was accurate or a false positive.

```http
POST /fraud/feedback
```

**Request Body:**
```json
{
  "cardId": "card_123",
  "eventId": "fraud_event_789",
  "feedback": "false_positive",
  "reason": "legitimate_large_purchase",
  "details": "Monthly grocery shopping at Costco",
  "confidence": "high"
}
```

**Response:**
```json
{
  "success": true,
  "feedbackId": "feedback_101",
  "recordedAt": "2024-01-15T14:40:00Z",
  "modelImpact": "immediate",
  "message": "Thank you for your feedback. This will improve future fraud detection for your card."
}
```

**Feedback Types:**
- `false_positive`: Transaction was legitimate
- `true_positive`: Transaction was actually fraudulent
- `unclear`: Uncertain about transaction legitimacy

---

## Security Incidents

### Get Security Incidents

Retrieve security incident history for a card.

```http
GET /fraud/incidents/{cardId}?limit=50&offset=0&severity=high
```

**Query Parameters:**
- `limit` (optional): Number of incidents to return (max 100, default 50)
- `offset` (optional): Pagination offset (default 0)
- `severity` (optional): Filter by severity level
- `dateFrom` (optional): Start date filter (ISO 8601)
- `dateTo` (optional): End date filter (ISO 8601)

**Response:**
```json
{
  "cardId": "card_123",
  "incidents": [
    {
      "incidentId": "incident_456",
      "eventId": "fraud_event_789",
      "severity": "high",
      "eventType": "velocity_exceeded",
      "detectedAt": "2024-01-15T14:30:00Z",
      "riskScore": 78,
      "actionTaken": "card_frozen",
      "resolved": true,
      "resolvedAt": "2024-01-15T14:35:00Z",
      "falsePositive": false,
      "transactionInfo": {
        "amount": 500.00,
        "merchant": "ELECTRONICS_STORE",
        "location": "San Francisco, CA"
      }
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

---

## Notifications

### Get Security Notifications

Retrieve security notifications for a card.

```http
GET /fraud/notifications/{cardId}?unread_only=true
```

**Query Parameters:**
- `unread_only` (optional): Return only unread notifications (default false)
- `limit` (optional): Number of notifications to return (default 20)

**Response:**
```json
{
  "cardId": "card_123",
  "notifications": [
    {
      "notificationId": "notif_789",
      "type": "fraud_alert",
      "severity": "medium",
      "title": "Unusual Transaction Detected",
      "message": "We detected a transaction that's unusual for your spending patterns.",
      "createdAt": "2024-01-15T14:30:00Z",
      "read": false,
      "actionRequired": true,
      "actionButtons": [
        {
          "actionId": "report_false_positive",
          "label": "This was me",
          "actionType": "report_false_positive",
          "style": "secondary"
        },
        {
          "actionId": "freeze_card",
          "label": "Freeze Card",
          "actionType": "unfreeze_card",
          "style": "danger"
        }
      ],
      "metadata": {
        "eventId": "fraud_event_789",
        "riskScore": 65,
        "anomalies": ["amount_anomaly", "geographic_anomaly"]
      }
    }
  ]
}
```

---

### Mark Notification as Read

Mark a security notification as read.

```http
PUT /fraud/notifications/{cardId}/{notificationId}/read
```

**Response:**
```json
{
  "success": true,
  "notificationId": "notif_789",
  "markedReadAt": "2024-01-15T14:45:00Z"
}
```

---

### Get Notification Preferences

Retrieve notification preferences for a card.

```http
GET /fraud/notifications/{cardId}/preferences
```

**Response:**
```json
{
  "cardId": "card_123",
  "preferences": {
    "pushNotifications": true,
    "emailAlerts": false,
    "smsAlerts": false,
    "quietHours": {
      "enabled": true,
      "startTime": "22:00",
      "endTime": "07:00",
      "timezone": "America/Los_Angeles"
    },
    "severityThreshold": "medium",
    "categories": {
      "fraud_alerts": true,
      "card_controls": true,
      "system_updates": false
    }
  }
}
```

---

### Update Notification Preferences

Update notification preferences for a card.

```http
PUT /fraud/notifications/{cardId}/preferences
```

**Request Body:**
```json
{
  "pushNotifications": true,
  "emailAlerts": true,
  "quietHours": {
    "enabled": true,
    "startTime": "23:00",
    "endTime": "06:00",
    "timezone": "America/New_York"
  },
  "severityThreshold": "low"
}
```

**Response:**
```json
{
  "success": true,
  "updatedAt": "2024-01-15T14:50:00Z",
  "preferences": {
    "pushNotifications": true,
    "emailAlerts": true,
    "smsAlerts": false,
    "quietHours": {
      "enabled": true,
      "startTime": "23:00",
      "endTime": "06:00",
      "timezone": "America/New_York"
    },
    "severityThreshold": "low"
  }
}
```

---

## Multi-Factor Authentication Endpoints

### Setup MFA

Initialize MFA setup for a card.

```http
POST /mfa/{cardId}/setup
```

**Request Body:**
```json
{
  "appName": "DisCard"
}
```

**Response:**
```json
{
  "qrCodeUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "manualEntrySecret": "JBSWY3DPEHPK3PXP",
  "setupToken": "setup_token_123",
  "backupCodes": [
    "12345678",
    "87654321",
    "11223344",
    "44332211",
    "55667788",
    "88776655",
    "99887766",
    "66778899"
  ],
  "instructions": {
    "step1": "Scan the QR code with your authenticator app",
    "step2": "Enter the 6-digit verification code from your app", 
    "step3": "Save your backup codes in a secure location"
  }
}
```

---

### Verify MFA Setup

Complete MFA setup by verifying the configuration.

```http
POST /mfa/{cardId}/verify-setup
```

**Request Body:**
```json
{
  "setupToken": "setup_token_123",
  "verificationCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "MFA setup completed successfully",
  "mfaEnabled": true,
  "enabledAt": "2024-01-15T15:00:00Z"
}
```

---

### Create MFA Challenge

Create an MFA challenge for a high-risk action.

```http
POST /mfa/{cardId}/challenge
```

**Request Body:**
```json
{
  "action": "freeze_card",
  "amount": 500.00,
  "metadata": {
    "deviceId": "device_456",
    "location": "San Francisco, CA"
  }
}
```

**Response:**
```json
{
  "requiresMFA": true,
  "challenge": {
    "challengeId": "mfa_challenge_789",
    "method": "totp",
    "createdAt": "2024-01-15T15:05:00Z",
    "expiresAt": "2024-01-15T15:10:00Z",
    "attemptsRemaining": 3
  },
  "riskAssessment": {
    "riskScore": 85,
    "factors": ["high_value_action", "unusual_location"],
    "requiresMFA": true,
    "recommendedMethod": "totp"
  },
  "instructions": {
    "title": "Authenticator App Verification",
    "description": "Open your authenticator app and enter the 6-digit code",
    "inputLabel": "Verification Code",
    "inputPlaceholder": "000000"
  }
}
```

---

### Verify MFA Challenge

Verify an MFA challenge with the provided code.

```http
POST /mfa/{cardId}/verify
```

**Request Body:**
```json
{
  "challengeId": "mfa_challenge_789",
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "verified": true,
  "verifiedAt": "2024-01-15T15:06:00Z",
  "token": "mfa_verified_token_456",
  "expiresAt": "2024-01-15T15:16:00Z",
  "message": "MFA verification successful"
}
```

**Failed Verification:**
```json
{
  "success": false,
  "verified": false,
  "error": "invalid_code",
  "attemptsRemaining": 2,
  "message": "Invalid verification code. Please try again."
}
```

---

## Model Performance (Admin/Monitoring)

### Get Model Performance

Retrieve fraud detection model performance metrics.

```http
GET /fraud/model/performance?cardId=card_123&days=30
```

**Query Parameters:**
- `cardId` (optional): Specific card performance
- `days` (optional): Time period for metrics (default 7)

**Response:**
```json
{
  "timeRange": {
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-30T23:59:59Z",
    "days": 30
  },
  "overallMetrics": {
    "totalTransactions": 1250,
    "fraudDetected": 15,
    "falsePositives": 8,
    "truePositives": 12,
    "falseNegatives": 2,
    "precision": 0.6,
    "recall": 0.857,
    "f1Score": 0.706,
    "accuracy": 0.992
  },
  "cardSpecificMetrics": {
    "card_123": {
      "transactions": 125,
      "fraudDetected": 2,
      "falsePositiveRate": 0.008,
      "modelVersion": "v1.2.3",
      "lastTraining": "2024-01-29T02:00:00Z"
    }
  },
  "performanceTrends": [
    {
      "date": "2024-01-29",
      "precision": 0.65,
      "recall": 0.85,
      "falsePositiveRate": 0.01
    }
  ]
}
```

---

## Error Codes

### Standard HTTP Status Codes

- `200 OK`: Request successful
- `201 Created`: Resource created successfully  
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Access denied to resource
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (e.g., MFA already enabled)
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

### Security-Specific Error Codes

```json
{
  "error": "insufficient_privileges",
  "code": "SEC_001",
  "message": "You don't have access to this card's security data",
  "details": {
    "cardId": "card_123",
    "requiredRole": "card_owner"
  }
}
```

**Error Code Reference:**
- `SEC_001`: Insufficient privileges
- `SEC_002`: MFA required but not provided
- `SEC_003`: Invalid MFA token
- `SEC_004`: MFA setup already completed
- `SEC_005`: Card already frozen
- `SEC_006`: Card not frozen
- `SEC_007`: Invalid risk threshold values
- `SEC_008`: Fraud analysis failed
- `SEC_009`: External service unavailable (Marqeta)
- `SEC_010`: Rate limit exceeded for security operations

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { DisCardAPI } from '@discard/sdk';

const api = new DisCardAPI({
  baseUrl: 'https://api.discard.com/v1',
  apiKey: 'your_api_key'
});

// Get fraud status
const fraudStatus = await api.security.getFraudStatus('card_123');

// Freeze card
const freezeResult = await api.security.freezeCard('card_123', {
  reason: 'fraud_detected',
  mfaToken: 'mfa_token_if_required'
});

// Submit feedback
await api.security.submitFeedback({
  cardId: 'card_123',
  eventId: 'fraud_event_789',
  feedback: 'false_positive',
  reason: 'legitimate_purchase'
});
```

### cURL Examples

```bash
# Get fraud status
curl -X GET \
  https://api.discard.com/v1/security/fraud/status/card_123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Freeze card
curl -X POST \
  https://api.discard.com/v1/security/fraud/cards/card_123/freeze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "fraud_detected",
    "metadata": {
      "riskScore": 85
    }
  }'

# Setup MFA
curl -X POST \
  https://api.discard.com/v1/security/mfa/card_123/setup \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"appName": "DisCard"}'
```

---

*API Version: 1.0 | Last Updated: January 2024*