# DisCard Financial Armor (Soul) - Docker Image
#
# Multi-stage build for optimal image size and security.
# Designed for Phala dstack TEE execution.

# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Add non-root user for security
RUN addgroup -g 1001 -S discard && \
    adduser -S discard -u 1001 -G discard

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R discard:discard /app

# Switch to non-root user
USER discard

# Environment variables
ENV NODE_ENV=production
ENV SOUL_GRPC_PORT=50051
ENV SOUL_HOST=0.0.0.0

# Expose ports
EXPOSE 50051

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('net').connect(process.env.SOUL_GRPC_PORT || 50051, 'localhost', () => process.exit(0)).on('error', () => process.exit(1))"

# Start the service
CMD ["node", "dist/standalone.js"]
