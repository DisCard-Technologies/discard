# Fraud Detection Algorithms & Thresholds

## Overview

This document describes the fraud detection algorithms implemented in DisCard's security system. All algorithms operate within strict privacy isolation boundaries, ensuring no cross-card correlation or user profiling.

## Privacy-First Design Principles

### Transaction Isolation
- **Card Context Isolation**: Every fraud analysis operates within a specific card context hash
- **No Cross-Card Correlation**: Algorithms cannot access data from other cards
- **Row-Level Security**: Database queries are restricted by RLS policies
- **Redis Isolation**: Cache keys are card-specific to prevent data leakage

### Data Minimization
- **Single-Card Analysis**: Behavioral patterns are built from individual card history only
- **Temporal Limits**: Analysis considers only recent transaction history (configurable windows)
- **Feature Isolation**: ML features are extracted from card-specific data only

## Anomaly Detection Algorithms

### 1. Velocity Anomaly Detection

**Purpose**: Detect unusually high transaction frequency

**Algorithm**:
```typescript
// Configurable thresholds
const VELOCITY_THRESHOLDS = {
  transactions_per_5min: 5,
  transactions_per_hour: 20,
  transactions_per_day: 100
};

// Detection logic
function detectVelocityAnomaly(cardId: string, currentTransaction: Transaction): boolean {
  const recent5min = getTransactionCount(cardId, '5min');
  const recentHour = getTransactionCount(cardId, '1hour'); 
  const recentDay = getTransactionCount(cardId, '24hour');

  return recent5min > VELOCITY_THRESHOLDS.transactions_per_5min ||
         recentHour > VELOCITY_THRESHOLDS.transactions_per_hour ||
         recentDay > VELOCITY_THRESHOLDS.transactions_per_day;
}
```

**Risk Score Impact**: 
- 5-minute threshold exceeded: +30 points
- Hourly threshold exceeded: +20 points  
- Daily threshold exceeded: +15 points

**Privacy Protection**: Uses card-specific Redis counters with TTL

### 2. Amount Anomaly Detection

**Purpose**: Detect transactions significantly larger than historical patterns

**Algorithm**:
```typescript
// Statistical analysis of card-specific spending
function detectAmountAnomaly(cardId: string, amount: number): AnomalyResult {
  const history = getCardTransactionHistory(cardId, '30days');
  const stats = calculateStatistics(history);
  
  const zScore = (amount - stats.mean) / stats.standardDeviation;
  const percentile = calculatePercentile(amount, history);
  
  return {
    isAnomaly: zScore > 2.5 || percentile > 95,
    severity: getSeverity(zScore, percentile),
    confidence: calculateConfidence(history.length, zScore)
  };
}
```

**Thresholds**:
- Z-score > 2.5: High anomaly
- Z-score > 2.0: Medium anomaly
- 95th percentile: High anomaly
- 90th percentile: Medium anomaly

**Risk Score Impact**: 
- High amount anomaly: +25 points
- Medium amount anomaly: +15 points

### 3. Geographic Anomaly Detection

**Purpose**: Detect transactions far from established location patterns

**Algorithm**:
```typescript
function detectGeographicAnomaly(
  cardId: string, 
  transactionLocation: Location
): GeographicAnomalyResult {
  const locationHistory = getCardLocationHistory(cardId, '90days');
  const homeLocation = calculateHomeLocation(locationHistory);
  const frequentLocations = identifyFrequentLocations(locationHistory);
  
  const distanceFromHome = calculateDistance(transactionLocation, homeLocation);
  const nearestFrequent = findNearestFrequentLocation(transactionLocation, frequentLocations);
  
  return {
    isAnomaly: distanceFromHome > 100 && nearestFrequent.distance > 50,
    distanceFromHome,
    distanceFromNearestFrequent: nearestFrequent.distance,
    riskLevel: calculateGeographicRisk(distanceFromHome, nearestFrequent.distance)
  };
}
```

**Thresholds**:
- Distance from home > 500 miles: High risk (+20 points)
- Distance from home > 100 miles AND no frequent locations nearby: Medium risk (+15 points)
- Distance from home > 50 miles: Low risk (+5 points)

### 4. Merchant Category Anomaly

**Purpose**: Detect transactions at unusual merchant types

**Algorithm**:
```typescript
function detectMerchantAnomaly(cardId: string, merchantInfo: MerchantInfo): MerchantAnomalyResult {
  const merchantHistory = getCardMerchantHistory(cardId, '60days');
  const categoryFrequency = calculateCategoryFrequency(merchantHistory);
  const riskyCategoryList = HIGH_RISK_MERCHANT_CATEGORIES;
  
  const categoryRisk = riskyCategoryList.includes(merchantInfo.mcc) ? 'high' : 'low';
  const frequencyRisk = categoryFrequency[merchantInfo.mcc] || 0 < 0.05 ? 'unusual' : 'normal';
  
  return {
    isAnomaly: categoryRisk === 'high' || frequencyRisk === 'unusual',
    categoryRisk,
    frequencyRisk,
    merchantReputation: lookupMerchantReputation(merchantInfo.name)
  };
}
```

**High-Risk Merchant Categories**:
- 7995: Gambling
- 5993: Cigar stores
- 7273: Dating services
- 5122: Drugs and pharmaceuticals
- 6051: Cryptocurrency

**Risk Score Impact**:
- High-risk category: +20 points
- Unusual category (< 5% of transactions): +10 points
- New merchant with poor reputation: +15 points

### 5. Pattern Anomaly Detection

**Purpose**: Detect deviations from established behavioral patterns

**Algorithm**:
```typescript
function detectPatternAnomaly(cardId: string, transaction: Transaction): PatternAnomalyResult {
  const patterns = getCardBehavioralPatterns(cardId);
  
  // Time-based patterns
  const timeScore = analyzeTimePattern(transaction.timestamp, patterns.timeDistribution);
  
  // Day-of-week patterns
  const dayScore = analyzeDayPattern(transaction.dayOfWeek, patterns.dayDistribution);
  
  // Amount patterns by time/merchant
  const contextualAmountScore = analyzeContextualAmount(
    transaction.amount, 
    transaction.merchant.category,
    transaction.timeOfDay,
    patterns.contextualAmounts
  );
  
  return {
    overallScore: Math.max(timeScore, dayScore, contextualAmountScore),
    timeAnomaly: timeScore > 0.7,
    dayAnomaly: dayScore > 0.7,
    contextualAmountAnomaly: contextualAmountScore > 0.7
  };
}
```

**Pattern Thresholds**:
- Overall pattern score > 0.8: High anomaly (+15 points)
- Overall pattern score > 0.6: Medium anomaly (+10 points)
- Specific pattern anomalies: +5 points each

## Machine Learning Fraud Scoring

### Rule-Based Model Architecture

Our ML system uses a rule-based approach with weighted scoring to avoid external dependencies while maintaining privacy isolation.

```typescript
interface FraudRule {
  name: string;
  weight: number;
  evaluate: (features: TransactionFeatures) => boolean;
}

const FRAUD_RULES: FraudRule[] = [
  {
    name: 'high_velocity',
    weight: 0.20,
    evaluate: (features) => features.transactionCount5min > 3
  },
  {
    name: 'large_amount',
    weight: 0.25,
    evaluate: (features) => features.amount > features.avgAmount30d * 3
  },
  {
    name: 'geographic_distance',
    weight: 0.15,
    evaluate: (features) => features.distanceFromHome > 500
  },
  {
    name: 'risky_merchant',
    weight: 0.15,
    evaluate: (features) => HIGH_RISK_MCCS.includes(features.merchantMcc)
  },
  {
    name: 'unusual_time',
    weight: 0.10,
    evaluate: (features) => features.timeOfDay < 6 || features.timeOfDay > 23
  },
  {
    name: 'new_merchant_category',
    weight: 0.10,
    evaluate: (features) => !features.historicalMccs.includes(features.merchantMcc)
  },
  {
    name: 'round_amount',
    weight: 0.03,
    evaluate: (features) => features.amount % 100 === 0 && features.amount >= 1000
  },
  {
    name: 'weekend_large_amount',
    weight: 0.02,
    evaluate: (features) => features.isWeekend && features.amount > features.avgAmount30d * 2
  }
];
```

### Model Training and Updates

**Training Frequency**: Daily per card (privacy-preserving)

**Training Data**: 
- Last 90 days of card-specific transactions
- False positive feedback integration
- Card-specific feature importance weighting

**Model Versioning**:
```typescript
interface ModelVersion {
  cardId: string;
  version: string;
  trainedAt: Date;
  ruleWeights: Record<string, number>;
  performanceMetrics: {
    falsePositiveRate: number;
    truePositiveRate: number;
    precision: number;
    recall: number;
  };
}
```

### Feature Extraction

All features are extracted from card-specific data only:

```typescript
interface TransactionFeatures {
  // Amount features
  amount: number;
  avgAmount30d: number;
  maxAmount30d: number;
  amountPercentile: number;

  // Velocity features
  transactionCount5min: number;
  transactionCount1hour: number;
  transactionCount24hour: number;

  // Geographic features
  distanceFromHome: number;
  distanceFromLastTransaction: number;
  isInFrequentLocation: boolean;

  // Merchant features
  merchantMcc: string;
  merchantName: string;
  isNewMerchant: boolean;
  historicalMccs: string[];

  // Temporal features
  timeOfDay: number;
  dayOfWeek: number;
  isWeekend: boolean;
  isHoliday: boolean;

  // Behavioral features
  timePattern: number; // 0-1 score based on historical patterns
  dayPattern: number;
  merchantPattern: number;
}
```

## Risk Score Calculation

### Overall Score Formula

```typescript
function calculateOverallRiskScore(
  velocityScore: number,
  amountScore: number, 
  geoScore: number,
  merchantScore: number,
  patternScore: number,
  mlScore: number
): number {
  const weights = {
    velocity: 0.20,
    amount: 0.25,
    geographic: 0.15,
    merchant: 0.15,
    pattern: 0.10,
    ml: 0.15
  };

  const weightedScore = 
    velocityScore * weights.velocity +
    amountScore * weights.amount +
    geoScore * weights.geographic +
    merchantScore * weights.merchant +
    patternScore * weights.pattern +
    mlScore * weights.ml;

  return Math.min(100, Math.max(0, weightedScore));
}
```

### Risk Score Thresholds

| Risk Level | Score Range | Action Recommended |
|------------|-------------|-------------------|
| Low        | 0-25        | None              |
| Medium     | 26-50       | Alert             |
| High       | 51-75       | Alert + Review    |
| Critical   | 76-100      | Freeze Card       |

### Action Determination

```typescript
function determineAction(riskScore: number, cardSettings: CardSettings): RecommendedAction {
  const thresholds = cardSettings.riskThresholds || DEFAULT_THRESHOLDS;
  
  if (riskScore >= thresholds.freeze) {
    return { action: 'freeze', reason: 'Critical risk detected' };
  }
  
  if (riskScore >= thresholds.alert) {
    return { action: 'alert', reason: 'Suspicious activity detected' };
  }
  
  return { action: 'none', reason: 'Transaction appears legitimate' };
}
```

## Performance Requirements

### Response Time Targets
- **Fraud Analysis**: < 200ms per transaction
- **Card Freeze**: < 1 second including Marqeta API call
- **ML Scoring**: < 50ms per transaction
- **Database Queries**: < 100ms per query

### Accuracy Targets
- **False Positive Rate**: < 2%
- **True Positive Rate**: > 85%
- **Precision**: > 90%
- **Recall**: > 80%

## Configuration and Tuning

### Configurable Parameters

```typescript
interface FraudDetectionConfig {
  velocityThresholds: {
    transactions5min: number;
    transactions1hour: number;
    transactions24hour: number;
  };
  
  amountThresholds: {
    zScoreThreshold: number;
    percentileThreshold: number;
    absoluteThreshold: number;
  };
  
  geographicThresholds: {
    homeDistanceHigh: number;
    homeDistanceMedium: number;
    frequentLocationRadius: number;
  };
  
  riskThresholds: {
    alertThreshold: number;
    freezeThreshold: number;
  };
  
  mlModelConfig: {
    ruleWeights: Record<string, number>;
    trainingWindowDays: number;
    minTrainingTransactions: number;
  };
}
```

### Per-Card Customization

Cards can have individual risk tolerance settings:

```typescript
interface CardRiskSettings {
  cardId: string;
  riskTolerance: 'low' | 'medium' | 'high';
  customThresholds?: Partial<FraudDetectionConfig>;
  disabledRules?: string[];
  alertMethods: ('push' | 'sms' | 'email')[];
}
```

## Privacy Compliance

### Data Retention
- **Transaction Analysis Data**: 90 days
- **Fraud Events**: 2 years (for compliance)
- **ML Models**: Current version + 2 previous versions
- **Redis Cache**: TTL-based (5 minutes to 1 hour)

### Data Access Controls
- **Card Context Enforcement**: All queries include card context hash
- **RLS Policies**: Enforce card-level data isolation
- **API Access**: Requires card ownership verification
- **Audit Logging**: All fraud detection events logged with privacy protection

### Compliance Features
- **Right to Deletion**: Card deletion removes all associated fraud data
- **Data Portability**: Export fraud detection history in standardized format
- **Consent Management**: Users can adjust detection sensitivity
- **Transparency**: Users can view detection algorithms and reasoning

## Monitoring and Alerting

### System Metrics
- **Analysis Latency**: P95 response time monitoring
- **Accuracy Metrics**: Daily false positive/negative rates
- **System Load**: Redis memory usage, database query performance
- **Model Performance**: Per-card model accuracy tracking

### Operational Alerts
- **High False Positive Rate**: > 3% for any card
- **Performance Degradation**: Response time > 300ms
- **System Errors**: Failed analyses or card freeze operations
- **Model Drift**: Significant performance degradation

## Security Considerations

### Algorithm Security
- **No Hardcoded Thresholds**: All parameters are configurable
- **Regular Model Updates**: Daily retraining with feedback incorporation
- **Adversarial Resistance**: Multiple independent checks prevent gaming
- **Graceful Degradation**: System continues operating if individual components fail

### Infrastructure Security
- **Encrypted Data**: All fraud data encrypted at rest and in transit
- **Secure APIs**: Rate limiting and authentication on all endpoints
- **Redis Security**: Password protection and network isolation
- **Database Security**: Connection encryption and access logging