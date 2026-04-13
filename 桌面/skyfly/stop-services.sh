#!/bin/bash
# Stop all SkyFly services

echo "🛑 Stopping SkyFly services..."

# Stop services by PID if PID files exist
if [ -f /tmp/skyfly_ai.pid ]; then
    AI_PID=$(cat /tmp/skyfly_ai.pid)
    kill $AI_PID 2>/dev/null && echo "✓ AI Service stopped (PID: $AI_PID)"
    rm /tmp/skyfly_ai.pid
fi

if [ -f /tmp/skyfly_backend.pid ]; then
    BACKEND_PID=$(cat /tmp/skyfly_backend.pid)
    kill $BACKEND_PID 2>/dev/null && echo "✓ Backend Server stopped (PID: $BACKEND_PID)"
    rm /tmp/skyfly_backend.pid
fi

if [ -f /tmp/skyfly_frontend.pid ]; then
    FRONTEND_PID=$(cat /tmp/skyfly_frontend.pid)
    kill $FRONTEND_PID 2>/dev/null && echo "✓ Frontend Server stopped (PID: $FRONTEND_PID)"
    rm /tmp/skyfly_frontend.pid
fi

# Also kill any remaining processes
pkill -f "app.simple_service" 2>/dev/null
pkill -f "server.js" 2>/dev/null  
pkill -f "vite" 2>/dev/null

echo "✨ All SkyFly services stopped"
