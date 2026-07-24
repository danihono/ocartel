#!/usr/bin/env bash
# Religa o worker do WhatsApp com a config obrigatória do Baileys: 1 instância
# única e CPU sempre alocada (ver README). Ao subir, o worker reidrata a sessão
# a partir do Firestore e reconecta o WhatsApp automaticamente — sem QR.
#
# Pré-requisito (só uma vez): o secret OPENAI_API_KEY já criado no projeto.
#   printf '%s' "sk-..." | gcloud secrets create OPENAI_API_KEY --data-file=-
#
# Uso:  ./ligar.sh
# Ajuste opcional:  PROJECT=... REGION=... OPENAI_MODEL=... ./ligar.sh
set -euo pipefail

SERVICE="${SERVICE:-ocartel-whatsapp}"
REGION="${REGION:-southamerica-east1}"
PROJECT="${PROJECT:-ocartel-497f8}"
OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"

# Roda a partir da pasta do worker (o deploy usa --source . com este Dockerfile).
cd "$(dirname "$0")"

echo "▶️  Religando '$SERVICE' em '$REGION' (projeto '$PROJECT')…"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --no-cpu-throttling \
  --min-instances 1 \
  --max-instances 1 \
  --no-allow-unauthenticated \
  --set-secrets OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT},OPENAI_MODEL=${OPENAI_MODEL}"

echo "✅ Worker no ar. O WhatsApp reconecta sozinho (reidrata do Firestore)."
echo "   ⚠️  Lembre: a partir de agora ele volta a cobrar 24/7 enquanto estiver ligado."
