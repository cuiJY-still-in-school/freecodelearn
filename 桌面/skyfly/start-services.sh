#!/bin/bash
# Start all SkyFly services

echo "🚀 Starting SkyFly AI Automation Tool..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f "app.simple_service" 2>/dev/null
pkill -f "server.js" 2>/dev/null
pkill -f "vite" 2>/dev/null

# Start AI Service
echo "🤖 Starting AI Service..."
cd python-ai
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q fastapi uvicorn python-dotenv 2>/dev/null

nohup python -m app.simple_service > /tmp/ai_service.log 2>&1 &
AI_PID=$!
echo "${GREEN}✓ AI Service started (PID: $AI_PID)${NC}"
echo ""

# Start Backend Server
echo "🔧 Starting Backend Server..."
cd ../frontend/backend
npm install -q express cors body-parser 2>/dev/null
nohup npm start > /tmp/backend_server.log 2>&1 &
BACKEND_PID=$!
echo "${GREEN}✓ Backend Server started (PID: $BACKEND_PID)${NC}"
echo ""

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 3

# Check if services are running
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "${GREEN}✓ AI Service is healthy${NC}"
else
    echo "${RED}✗ AI Service failed to start${NC}"
    tail -20 /tmp/ai_service.log
fi

if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "${GREEN}✓ Backend Server is healthy${NC}"
else
    echo "${RED}✗ Backend Server failed to start${NC}"
    tail -20 /tmp/backend_server.log
fi

# Start Frontend Dev Server
echo "🎨 Starting Frontend Dev Server..."
cd ..
nohup npm run dev > /tmp/frontend_dev.log 2>&1 &
FRONTEND_PID=$!
echo "${GREEN}✓ Frontend Dev Server started (PID: $FRONTEND_PID)${NC}"
echo ""

echo "📊 Services Status:"
echo "  AI Service:     http://localhost:8000"
echo "  Backend Server: http://localhost:3000"  
echo "  Frontend UI:    http://localhost:5173"
echo ""

# Save PIDs for cleanup
echo "$AI_PID" > /tmp/skyfly_ai.pid
echo "$BACKEND_PID" > /tmp/skyfly_backend.pid
echo "$FRONTEND_PID" > /tmp/skyfly_frontend.pid

echo "${YELLOW}💡 To stop all services, run: ./stop-services.sh${NC}"
echo "${GREEN}✨ SkyFly is ready! Open http://localhost:5173 in your browser${NC}"
