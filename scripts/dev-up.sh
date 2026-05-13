#!/bin/bash
set -e

echo "Levantando entorno de desarrollo UBER_BASE..."

# Verificar que Docker esta corriendo
if ! docker info > /dev/null 2>&1; then
  echo "Docker no esta corriendo. Inicialo y vuelve a intentar."
  exit 1
fi

# Levantar servicios
docker compose up -d

echo ""
echo "Servicios disponibles:"
echo "  PostgreSQL:  localhost:5432 (uber_user/uber_pass)"
echo "  Redis:       localhost:6379"
echo "  Bull Board:  http://localhost:3001"
echo "  Prometheus:  http://localhost:9090"
echo "  Grafana:     http://localhost:3000 (admin/admin)"
echo "  Jaeger:      http://localhost:16686"
echo ""
echo "  API Dev:     http://localhost:3333 (pnpm dev)"
