# DisCard Strategy Engine - Docker Image
#
# Build:
#   docker build -t discard/strategy-engine .
#
# Run:
#   docker run -p 50053:50053 -e REDIS_URL=redis://redis:6379 discard/strategy-engine

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/grpc/proto ./src/grpc/proto

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

USER nodejs

# Environment
ENV NODE_ENV=production
ENV STRATEGY_ENGINE_PORT=50053
ENV STRATEGY_ENGINE_HOST=0.0.0.0

# Expose gRPC port
EXPOSE 50053

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('net').connect(50053, 'localhost', () => process.exit(0)).on('error', () => process.exit(1))"

# Start
CMD ["node", "dist/standalone.js"]
