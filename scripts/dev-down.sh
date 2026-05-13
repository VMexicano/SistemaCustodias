#!/bin/bash
set -e

echo "Deteniendo entorno de desarrollo..."
docker compose down

echo "Servicios detenidos. Los volumenes se conservan."
echo "   Para eliminar volumenes tambien: docker compose down -v"
