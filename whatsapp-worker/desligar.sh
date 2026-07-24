#!/usr/bin/env bash
# Desliga o worker do WhatsApp: DELETA o serviço no Cloud Run -> para de cobrar.
#
# Fica OFF de verdade: não volta sozinho, nem quando chega mensagem. Só religa
# quando VOCÊ rodar ./ligar.sh. Não perde nada — a sessão do WhatsApp fica salva
# no Firestore (waAuth) e reconecta sem pedir QR de novo.
#
# Uso:  ./desligar.sh
# Ajuste opcional:  SERVICE=... REGION=... ./desligar.sh
set -euo pipefail

SERVICE="${SERVICE:-ocartel-whatsapp}"
REGION="${REGION:-southamerica-east1}"

echo "⏸  Desligando '$SERVICE' em '$REGION'…"
if gcloud run services describe "$SERVICE" --region "$REGION" >/dev/null 2>&1; then
  gcloud run services delete "$SERVICE" --region "$REGION" --quiet
  echo "✅ Worker desligado. Não cobra mais nada."
else
  echo "ℹ️  '$SERVICE' já não existe em '$REGION' — nada a fazer."
fi
echo "   Pra religar quando quiser:  ./ligar.sh"
