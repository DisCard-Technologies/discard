#!/bin/bash
# DisCard Compliance Enclave Deployment Script
#
# Usage:
#   ./scripts/deploy-compliance-enclave.sh [local|phala]
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - For Phala deployment: Phala CLI (phala-cli) installed
#   - RANGE_API_KEY environment variable set

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENCLAVE_DIR="$PROJECT_ROOT/infra/phala-deployment/compliance-enclave"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Default to local deployment
DEPLOY_TARGET="${1:-local}"

echo ""
echo "=========================================="
echo "  DisCard Compliance Enclave Deployment"
echo "=========================================="
echo ""

log_info "Target: ${DEPLOY_TARGET}"
log_info "Enclave directory: ${ENCLAVE_DIR}"
echo ""

cd "$ENCLAVE_DIR"

# Check for Range API key
if [ -z "$RANGE_API_KEY" ]; then
    log_warn "RANGE_API_KEY not set - enclave will run with mock compliance checks"
fi

case "$DEPLOY_TARGET" in
    "local")
        log_step "Building and deploying locally with Docker Compose..."

        # Install npm dependencies first
        log_info "Installing npm dependencies..."
        npm install

        # Build TypeScript
        log_info "Compiling TypeScript..."
        npm run build

        # Build Docker image
        log_info "Building Docker image..."
        docker-compose build

        # Start services
        log_info "Starting compliance enclave..."
        docker-compose up -d

        # Wait for service to be healthy
        log_info "Waiting for service to be healthy..."
        sleep 5

        # Check health
        if curl -sf http://localhost:8095/health > /dev/null 2>&1; then
            log_info "Compliance enclave is healthy!"
        else
            log_warn "Health check failed - checking logs..."
            docker-compose logs --tail=20
        fi

        # Get MRENCLAVE (simulated in local mode)
        log_info ""
        log_info "Fetching enclave public key..."
        KEY_RESPONSE=$(curl -sf http://localhost:8093/key 2>/dev/null || echo '{"error": "not ready"}')
        echo "$KEY_RESPONSE" | head -c 200
        echo "..."

        echo ""
        log_info "=========================================="
        log_info "  Compliance Enclave deployed locally!"
        log_info "=========================================="
        echo ""
        log_info "Endpoints:"
        log_info "  - API:         http://localhost:8093"
        log_info "  - Attestation: http://localhost:8094"
        log_info "  - Health:      http://localhost:8095"
        echo ""
        log_info "Test compliance check:"
        log_info "  curl -X POST http://localhost:8093/check \\"
        log_info "    -H 'Content-Type: application/json' \\"
        log_info "    -d '{\"encryptedAddress\":\"...\",\"ephemeralPublicKey\":\"...\",\"nonce\":\"...\",\"chain\":\"solana\"}'"
        echo ""
        log_info "View logs:"
        log_info "  docker-compose logs -f"
        echo ""
        ;;

    "phala")
        log_step "Deploying to Phala Cloud..."

        # Check for Phala CLI
        if ! command -v phala &> /dev/null; then
            log_error "Phala CLI not found!"
            log_info "Install with: npm install -g @phala/sdk"
            exit 1
        fi

        # Check for Phala API key
        if [ -z "$PHALA_API_KEY" ]; then
            log_error "PHALA_API_KEY not set!"
            log_info "Get your API key from https://dashboard.phala.network"
            exit 1
        fi

        # Build Docker image
        log_info "Building Docker image for Phala..."
        IMAGE_NAME="ghcr.io/discard-technologies/compliance-enclave:latest"
        docker build -t "$IMAGE_NAME" .

        # Push to registry
        log_info "Pushing image to container registry..."
        docker push "$IMAGE_NAME"

        # Deploy to Phala Cloud
        log_info "Deploying to Phala Cloud..."
        phala deploy \
            --config cvm-config.yaml \
            --image "$IMAGE_NAME" \
            --env "RANGE_API_KEY=$RANGE_API_KEY" \
            --env "PHALA_ATTESTATION_ENABLED=true" \
            --env "NODE_ENV=production"

        # Get deployment info
        log_info "Fetching deployment status..."
        phala status --config cvm-config.yaml

        # Get MRENCLAVE
        log_info ""
        log_info "=========================================="
        log_info "  Compliance Enclave deployed to Phala!"
        log_info "=========================================="
        echo ""
        log_info "IMPORTANT: Record the MRENCLAVE hash for client verification!"
        log_info "Update EXPECTED_MR_ENCLAVE in phalaComplianceClient.ts"
        echo ""
        ;;

    "docker")
        log_step "Building Docker image only..."

        # Install and build
        npm install
        npm run build

        # Build image
        IMAGE_NAME="${2:-discard-compliance-enclave:latest}"
        log_info "Building image: $IMAGE_NAME"
        docker build -t "$IMAGE_NAME" .

        log_info "Docker image built: $IMAGE_NAME"
        log_info ""
        log_info "Run with:"
        log_info "  docker run -p 8093:8093 -p 8094:8094 -p 8095:8095 \\"
        log_info "    -e RANGE_API_KEY=your-key \\"
        log_info "    $IMAGE_NAME"
        ;;

    "stop")
        log_step "Stopping local deployment..."
        docker-compose down
        log_info "Compliance enclave stopped."
        ;;

    "logs")
        docker-compose logs -f
        ;;

    "status")
        log_info "Compliance enclave status:"
        docker-compose ps
        echo ""
        log_info "Health check:"
        curl -sf http://localhost:8095/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "Not running or unhealthy"
        ;;

    *)
        log_error "Unknown target: $DEPLOY_TARGET"
        echo ""
        echo "Usage: $0 [local|phala|docker|stop|logs|status]"
        echo ""
        echo "  local   - Deploy locally with Docker Compose (default)"
        echo "  phala   - Deploy to Phala Cloud (requires Phala CLI)"
        echo "  docker  - Build Docker image only"
        echo "  stop    - Stop local deployment"
        echo "  logs    - View local deployment logs"
        echo "  status  - Check deployment status"
        exit 1
        ;;
esac
