# DisCard Compliance Enclave - Phala TEE Dockerfile
#
# This enclave performs Range API sanctions checks inside a TEE.
# The address is protected by SGX encryption and RA-TLS attestation
# proves code integrity to clients.
#
# Based on the Financial Armor Dockerfile pattern

FROM node:20-slim AS base

# Install dependencies
RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --frozen-lockfile --prod=false 2>/dev/null || npm install

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src ./src

# Build the enclave
RUN npm run build

# Create non-root user for security
RUN useradd -m -s /bin/bash enclave && \
    chown -R enclave:enclave /app

USER enclave

# Expose ports
# HTTP API for compliance checks
EXPOSE 8093
# Attestation endpoint
EXPOSE 8094
# Health check
EXPOSE 8095

# Environment variables
ENV NODE_ENV=production
ENV HTTP_PORT=8093
ENV ATTESTATION_PORT=8094
ENV HEALTH_PORT=8095
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8095/health || exit 1

# Start the compliance enclave
CMD ["node", "dist/main.js"]
