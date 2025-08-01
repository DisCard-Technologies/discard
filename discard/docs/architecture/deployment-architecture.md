# Deployment Architecture

### Deployment Strategy

**Frontend Deployment:**
- **Platform:** Vercel (web), AWS S3 + CloudFront (mobile web fallback)
- **Build Command:** `nx build web` for Next.js optimization
- **Output Directory:** `dist/apps/web/`
- **CDN/Edge:** Global CDN with edge caching for static assets and API responses

**Backend Deployment:**
- **Platform:** AWS ECS Fargate with Application Load Balancer
- **Build Command:** `nx build api` with Docker containerization
- **Deployment Method:** Blue-green deployment with health checks and automatic rollback

### CI/CD Pipeline

```yaml
name: DisCard CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'
      
      - name: Install dependencies
        run: yarn install --frozen-lockfile
      
      - name: Lint and type check
        run: |
          nx run-many --target=lint --all
          nx run-many --target=type-check --all
      
      - name: Run tests
        run: |
          nx run-many --target=test --all --coverage
          nx run mobile:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/discard_test
          REDIS_URL: redis://localhost:6379

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: |
          nx build api
          aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker build -t $ECR_REGISTRY/discard-api:staging .
          docker push $ECR_REGISTRY/discard-api:staging
          aws ecs update-service --cluster discard-staging --service api --force-new-deployment

  deploy-production:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          nx build api
          nx build web
          # Deploy web to Vercel
          vercel --prod --token $VERCEL_TOKEN
          # Deploy API to production ECS
          aws ecs update-service --cluster discard-prod --service api --force-new-deployment
```

### Environments

| Environment | Frontend URL | Backend URL | Purpose |
|-------------|--------------|-------------|---------|
| Development | http://localhost:3000 | http://localhost:3001 | Local development and testing |
| Staging | https://staging.discard.app | https://staging-api.discard.app | Pre-production testing and validation |
| Production | https://discard.app | https://api.discard.app | Live customer-facing environment |
