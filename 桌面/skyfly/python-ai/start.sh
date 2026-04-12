#!/bin/bash
# Start Python AI Service

cd "$(dirname "$0")"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install -q -r requirements.txt

# Start the service
echo "Starting SkyFly AI Service on http://localhost:8000"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload