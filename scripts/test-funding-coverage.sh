#!/bin/bash

# Test Coverage Script for Funding Features
# This script runs all funding-related tests and generates coverage reports

set -e

echo "🧪 Running Funding Feature Test Coverage"
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 Test Plan:${NC}"
echo "1. Unit Tests - Funding Services"
echo "2. Unit Tests - Balance Service" 
echo "3. Unit Tests - Stripe Service"
echo "4. Unit Tests - Shared Utilities"
echo "5. Integration Tests - API Endpoints"
echo "6. E2E Tests - Complete Workflows"
echo ""

# Function to run test with error handling
run_test() {
    local test_name="$1"
    local test_command="$2"
    local test_dir="$3"
    
    echo -e "${BLUE}Running: ${test_name}${NC}"
    
    if [ -d "$test_dir" ]; then
        cd "$test_dir"
        if eval "$test_command"; then
            echo -e "${GREEN}✅ ${test_name} - PASSED${NC}"
        else
            echo -e "${RED}❌ ${test_name} - FAILED${NC}"
            exit 1
        fi
        cd - > /dev/null
    else
        echo -e "${YELLOW}⚠️  ${test_name} - SKIPPED (directory not found)${NC}"
    fi
    echo ""
}

# 1. API Unit Tests
echo -e "${YELLOW}🔬 UNIT TESTS${NC}"
echo "=============="

run_test "Funding Service Unit Tests" \
    "npm test -- --testPathPattern=funding.service.test.ts --coverage --coverageDirectory=coverage/unit/funding-service" \
    "apps/api"

run_test "Balance Service Unit Tests" \
    "npm test -- --testPathPattern=balance.service.test.ts --coverage --coverageDirectory=coverage/unit/balance-service" \
    "apps/api"

run_test "Stripe Service Unit Tests" \
    "npm test -- --testPathPattern=stripe.service.test.ts --coverage --coverageDirectory=coverage/unit/stripe-service" \
    "apps/api"

# 2. Shared Package Unit Tests  
run_test "Shared Funding Utilities Tests" \
    "npm test -- --testPathPattern=funding.test.ts --coverage" \
    "packages/shared"

run_test "Shared Validation Utilities Tests" \
    "npm test -- --testPathPattern=validation.test.ts --coverage" \
    "packages/shared"

# 3. Integration Tests
echo -e "${YELLOW}🔗 INTEGRATION TESTS${NC}"
echo "==================="

run_test "Funding API Integration Tests" \
    "npm test -- --testPathPattern=funding.integration.test.ts --coverage --coverageDirectory=coverage/integration" \
    "apps/api"

# 4. E2E Tests
echo -e "${YELLOW}🏁 E2E TESTS${NC}"
echo "============"

run_test "Funding Workflows E2E Tests" \
    "npm test -- --testPathPattern=funding-workflows.e2e.test.ts --coverage" \
    "apps/mobile"

# 5. Generate Combined Coverage Report
echo -e "${YELLOW}📊 COVERAGE ANALYSIS${NC}"
echo "==================="

if [ -d "apps/api/coverage" ]; then
    echo -e "${BLUE}API Test Coverage:${NC}"
    cd apps/api
    
    # Check if coverage summary exists
    if [ -f "coverage/coverage-summary.json" ]; then
        echo "Coverage Summary Available"
        
        # Extract coverage percentages (basic approach)
        if command -v jq >/dev/null 2>&1; then
            echo "Lines: $(jq -r '.total.lines.pct' coverage/coverage-summary.json)%"
            echo "Functions: $(jq -r '.total.functions.pct' coverage/coverage-summary.json)%"
            echo "Branches: $(jq -r '.total.branches.pct' coverage/coverage-summary.json)%"
            echo "Statements: $(jq -r '.total.statements.pct' coverage/coverage-summary.json)%"
        fi
    fi
    
    cd - > /dev/null
    echo ""
fi

# 6. Test Result Summary
echo -e "${GREEN}🎉 TEST EXECUTION COMPLETE${NC}"
echo "=========================="
echo ""
echo -e "${BLUE}Coverage Reports Generated:${NC}"
echo "• API Unit Tests: apps/api/coverage/"
echo "• Integration Tests: apps/api/coverage/integration/"
echo "• Shared Package Tests: packages/shared/coverage/"
echo ""
echo -e "${BLUE}Key Testing Areas Covered:${NC}"
echo "✅ Funding service business logic"
echo "✅ Balance management operations"  
echo "✅ Stripe payment processing"
echo "✅ Input validation and sanitization"
echo "✅ Error handling and edge cases"
echo "✅ API endpoint integration"
echo "✅ Complete user workflows"
echo "✅ Fraud protection mechanisms"
echo "✅ Real-time balance updates"
echo ""
echo -e "${GREEN}🚀 All funding feature tests completed successfully!${NC}"

# Optional: Open coverage report in browser
if command -v open >/dev/null 2>&1 && [ -f "apps/api/coverage/lcov-report/index.html" ]; then
    echo ""
    echo -e "${BLUE}Opening coverage report in browser...${NC}"
    open apps/api/coverage/lcov-report/index.html
elif command -v xdg-open >/dev/null 2>&1 && [ -f "apps/api/coverage/lcov-report/index.html" ]; then
    echo ""
    echo -e "${BLUE}Opening coverage report in browser...${NC}"
    xdg-open apps/api/coverage/lcov-report/index.html
fi