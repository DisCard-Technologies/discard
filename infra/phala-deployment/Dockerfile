# DisCard Financial Armor - Phala TEE Dockerfile
#
# Optimized for Phala Cloud CVM (Confidential Virtual Machine)
# Based on the official Phala offchain rollup image

FROM ghcr.io/phatoffchain/phat-offchain-rollup:v0.2.0 AS base

# Install Node.js 20.x LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@9

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml ./
COPY packages/plugin-financial-armor/package.json ./packages/plugin-financial-armor/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY packages/plugin-financial-armor ./packages/plugin-financial-armor
COPY characters/alex_sovereign.json ./characters/

# Build the plugin
WORKDIR /app/packages/plugin-financial-armor
RUN pnpm build

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

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8090/health || exit 1

# Start the Financial Armor service
CMD ["node", "packages/plugin-financial-armor/dist/index.js"]
