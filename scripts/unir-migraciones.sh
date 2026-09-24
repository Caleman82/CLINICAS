#!/usr/bin/env bash
# Genera supabase/instalacion_completa.sql uniendo todas las migraciones en orden,
# para instalar la base pegando un solo archivo en el SQL Editor de Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=supabase/instalacion_completa.sql
{
  echo "-- ============================================================================="
  echo "-- INSTALACIÓN COMPLETA DE LA BASE (todas las migraciones juntas, en orden)."
  echo "-- Para pegar UNA sola vez en el SQL Editor de un proyecto Supabase NUEVO."
  echo "-- Archivo generado con scripts/unir-migraciones.sh: no editar a mano."
  echo "-- ============================================================================="
  for f in supabase/migrations/*.sql; do
    echo
    echo "-- ----- $(basename "$f") -----"
    cat "$f"
  done
} > "$OUT"
echo "Generado $OUT"
