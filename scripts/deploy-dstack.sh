#!/bin/bash
# DisCard dstack Deployment Script
#
# Usage:
#   ./scripts/deploy-dstack.sh [staging|production]
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - .env.dstack file configured (copy from .env.dstack.example)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Default to staging
ENVIRONMENT="${1:-staging}"

log_info "Deploying DisCard to ${ENVIRONMENT}..."

cd "$PROJECT_ROOT"

# Check for .env file
if [ ! -f ".env.dstack" ]; then
    log_error ".env.dstack file not found!"
    log_info "Copy .env.dstack.example to .env.dstack and configure it:"
    log_info "  cp .env.dstack.example .env.dstack"
    exit 1
fi

# Validate required environment variables
source .env.dstack
REQUIRED_VARS=("PHALA_AI_API_KEY" "SOLANA_RPC_URL" "TURNKEY_API_PUBLIC_KEY" "TURNKEY_API_PRIVATE_KEY" "TURNKEY_ORGANIZATION_ID")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ] || [ "${!var}" == "your-"* ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    log_error "Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        log_error "  - $var"
    done
    exit 1
fi

# Build images
log_info "Building Docker images..."
docker-compose -f docker-compose.dstack.yaml build

# Deploy based on environment
if [ "$ENVIRONMENT" == "production" ]; then
    log_info "Deploying with production overrides..."

    # Check for TLS certificates in production
    if [ "$ENABLE_TLS" == "true" ] && [ ! -d "certs" ]; then
        log_warn "TLS is enabled but certs/ directory not found"
        log_info "Create certs/ directory with cert.pem, key.pem, and ca.pem"
    fi

    docker-compose -f docker-compose.dstack.yaml -f docker-compose.prod.yaml \
        --env-file .env.dstack up -d
else
    log_info "Deploying staging environment..."
    docker-compose -f docker-compose.dstack.yaml \
        --env-file .env.dstack up -d
fi

# Wait for services to be healthy
log_info "Waiting for services to be healthy..."
sleep 10

# Check service status
log_info "Checking service status..."
docker-compose -f docker-compose.dstack.yaml ps

# Health check
log_info "Running health checks..."

check_service() {
    local name=$1
    local port=$2
    if nc -z localhost "$port" 2>/dev/null; then
        log_info "  $name (port $port): ${GREEN}healthy${NC}"
        return 0
    else
        log_warn "  $name (port $port): ${RED}unhealthy${NC}"
        return 1
    fi
}

HEALTHY=true
check_service "Soul (Financial Armor)" 50051 || HEALTHY=false
check_service "Brain Orchestrator" 50052 || HEALTHY=false
check_service "Strategy Engine" 50053 || HEALTHY=false

if [ "$HEALTHY" == "true" ]; then
    log_info ""
    log_info "=========================================="
    log_info "  DisCard deployed successfully!"
    log_info "=========================================="
    log_info ""
    log_info "Service endpoints:"
    log_info "  - Brain gRPC:     localhost:50052"
    log_info "  - Brain HTTP:     localhost:8092"
    log_info "  - Soul gRPC:      localhost:50051"
    log_info "  - Strategy gRPC:  localhost:50053"
    log_info ""
    log_info "View logs:"
    log_info "  docker-compose -f docker-compose.dstack.yaml logs -f"
    log_info ""
else
    log_warn "Some services may not be fully healthy yet."
    log_info "Check logs with: docker-compose -f docker-compose.dstack.yaml logs"
fi
