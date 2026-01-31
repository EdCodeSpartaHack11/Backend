#!/bin/bash

# Function to kill processes on exit
cleanup() {
    echo "Stopping servers..."
    kill $(jobs -p) 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

echo "Starting EdCode..."

# Start Backend
echo "Starting Backend on port 8000..."
cd Backend
python3 -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 2

# Start Frontend
echo "Starting Frontend on port 5173..."
cd ../Frontend
npm run dev -- --host &
FRONTEND_PID=$!

echo "------------------------------------------------"
echo "EdCode is running!"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8000"
echo "------------------------------------------------"
echo "Press Ctrl+C to stop."

wait
