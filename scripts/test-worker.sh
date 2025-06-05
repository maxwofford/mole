#!/bin/bash

# Test script for quick worker validation
# Allows testing without hitting real APIs or Airtable

set -e

echo "🧪 Testing mole-worker with sample data..."

# Ensure we're using mock mode for testing
export AI_PROVIDER=mock
export NODE_ENV=development
export USE_TEST_FIXTURES=true
export ENABLE_BROWSER_USE=false

cd mole-worker

echo "Testing with real project fixture..."
bun run worker.js

echo ""
echo "✅ Worker test complete!"
echo ""
echo "💡 To test with different project types, modify TEST_PROJECTS in test-fixtures.js"
