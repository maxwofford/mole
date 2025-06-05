#!/bin/bash

# Setup script for local development
# Makes it easy for multiple agents to work on the codebase

set -e

echo "🚀 Setting up Mole for local development..."

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ Created .env file - edit it with your settings"
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."

# Install server dependencies
if [ -d "mole-nexus" ]; then
    echo "Installing mole-nexus dependencies..."
    cd mole-nexus && bun install && cd ..
fi

# Install worker dependencies  
if [ -d "mole-worker" ]; then
    echo "Installing mole-worker dependencies..."
    cd mole-worker && bun install && cd ..
    
    # Install Python dependencies if requirements.txt exists
    if [ -f "mole-worker/requirements.txt" ]; then
        echo "Installing Python dependencies..."
        cd mole-worker && uv pip install -r requirements.txt && cd ..
    fi
fi

# Build worker docker image for browser automation
echo "🐳 Building worker docker image..."
cd mole-worker && docker build -t mole-worker . && cd ..

echo ""
echo "🎉 Setup complete! You can now:"
echo ""
echo "  For development with mocks (no API costs):"
echo "    ./start.sh"
echo ""
echo "  To test a single project:"
echo "    cd mole-worker && bun run worker.js"
echo ""
echo "  To use with real AI APIs:"
echo "    1. Edit .env and set AI_PROVIDER=gemini"
echo "    2. Add your API keys to .env" 
echo "    3. ./start.sh"
echo ""
echo "  With local Ollama:"
echo "    1. Edit .env and set AI_PROVIDER=ollama"
echo "    2. docker-compose --profile ollama up -d"
echo "    3. ./start.sh"
echo ""
echo "💡 Multiple agents can now work simultaneously using mock mode!"
