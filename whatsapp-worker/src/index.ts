// Ponto de entrada do worker. Processo SEMPRE-LIGADO (ver README): inicia os
// listeners do Firestore, reidrata as sessões conectadas e mantém o processo vivo.
// No SIGTERM/deploy: fecha os sockets com end() (mantém os aparelhos vinculados).

import http from "node:http";
import { watchTenants } from "./control.js";
import { endAllSessions, log } from "./session.js";

async function main() {
  log.info("iniciando ocartel-whatsapp-worker…");
  watchTenants(); // liga listeners por tenant (comandos + reidratação + confirmações)

  // Health check simples (Cloud Run espera uma porta escutando).
  const port = Number(process.env.PORT ?? 8080);
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    })
    .listen(port, () => log.info({ port }, "health check ouvindo"));
}

// Desligamento correto: end() fecha o WebSocket mas MANTÉM o device vinculado.
function shutdown(signal: string) {
  log.info({ signal }, "encerrando — sock.end() (mantém device)");
  endAllSessions();
  setTimeout(() => process.exit(0), 2000); // deixa writes em voo concluírem
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((err) => {
  log.error({ err }, "falha fatal ao iniciar");
  process.exit(1);
});
