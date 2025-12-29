# DisCard Financial Armor - Phala TEE Dockerfile
#
# Optimized for Phala Cloud CVM (Confidential Virtual Machine)
# Based on the official Phala offchain rollup image

FROM node:20-slim AS base

# Install dependencies
RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*


# Install npm
RUN # npm already installed

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./
COPY packages/plugin-financial-armor/package.json ./packages/plugin-financial-armor/

# Install dependencies
RUN npm install --frozen-lockfile --prod=false

# Copy source code
COPY packages/plugin-financial-armor ./packages/plugin-financial-armor
COPY characters/alex_sovereign.json ./characters/

# Build the plugin
WORKDIR /app/packages/plugin-financial-armor
RUN npm install && npm run build

# Return to app root
WORKDIR /app

# Create non-root user for security
RUN useradd -m -s /bin/bash discard && \
    chown -R discard:discard /app

USER discard

# Expose ports
# gRPC service
EXPOSE 50051
# Attestation endpoint
EXPOSE 8090
# Metrics (optional)
EXPOSE 9090

# Environment variables
ENV NODE_ENV=production
ENV GRPC_PORT=50051
ENV LOG_LEVEL=info

# Health check (using port 8091 to avoid conflict with Phala's attestation on 8090)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8091/health || exit 1

# Start the Financial Armor standalone server
CMD ["node", "packages/plugin-financial-armor/dist/standalone.js"]
