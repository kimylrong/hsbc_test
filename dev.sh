#!/bin/bash
set -e

export MODEL_API_URL="http://localhost:8010"
export PY_BACKEND_URL="http://localhost:8020"
export JAVA_BACKEND_URL="http://localhost:8030"

ROOT="$(cd "$(dirname "$0")" && pwd)"

PORTS=(8000 8010 8020 8030)

kill_by_port() {
  for port in "${PORTS[@]}"; do
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "  Killing port $port: $pids"
      kill -9 $pids 2>/dev/null || true
    fi
  done
}

cleanup() {
  echo ""
  echo "Stopping all services..."
  kill_by_port
  echo "Done."
  exit 0
}
trap cleanup SIGINT SIGTERM

kill_by_port

echo ""
echo "=== HSBC Challenge - Developer Mode ==="
echo ""
echo "  Portal:                    http://localhost:8000"
echo "  ml-predictor-api:          http://localhost:8010/docs"
echo "  property-value-estimator:  http://localhost:8020/docs"
echo "  property-market-analysis:  http://localhost:8030/swagger-ui.html"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

echo "Starting ml-predictor-api (port 8010)..."
cd "$ROOT/service_house_price_predictor"
.venv/bin/python -m uvicorn src.main:app --host 0.0.0.0 --port 8010 --reload &

echo "Starting property-value-estimator (port 8020)..."
cd "$ROOT/service_property_value_estimator"
.venv/bin/python -m uvicorn src.main:app --host 0.0.0.0 --port 8020 --reload &

echo "Starting property-market-analysis (port 8030)..."
cd "$ROOT/service_property_market_analysis"
mvn spring-boot:run -Dspring-boot.run.arguments="--server.port=8030" &

echo "Starting web-portal (port 8000)..."
cd "$ROOT/web_portal"
npm run dev -- -p 8000 &

wait
