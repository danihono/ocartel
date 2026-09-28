"use client";

// A barbearia foi cadastrada e espera o super admin aprovar.
//
// Esta tela é o portão de verdade do fluxo de cadastro: quem se inscreve não entra no
// sistema sozinho. O painel inteiro fica atrás dela enquanto o status do tenant for
// `pendente` — e como a decisão é lida do doc do tenant em tempo real (o store já assina
// esse doc), no instante em que a aprovação acontece o painel aparece sozinho, sem a
// pessoa precisar recarregar nada.

import { useRouter } from "next/navigation";
import { c, font } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { Button } from "@/components/ui/Button";
import { signOutApp } from "@/lib/firebase/auth";

export function AguardandoAprovacao({ barbearia, email }: { barbearia: string; email?: string }) {
  const router = useRouter();

  async function sair() {
    await signOutApp();
    router.push("/login");
  }

  return (
    <div style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: "34px 32px", textAlign: "center", boxShadow: "0 8px 24px rgba(15,27,25,.12)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <Seal size={52} />
        </div>

        <div style={{ fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: c.brassDeep, fontWeight: 700 }}>
          Cadastro recebido
        </div>
        <h1 style={{ fontFamily: font.sans, fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", color: c.inkTitle, margin: "8px 0 10px" }}>
          {barbearia || "Sua barbearia"} está em análise
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: c.ink2, margin: "0 0 22px" }}>
          Estamos conferindo o cadastro. Assim que for aprovado, o painel libera sozinho
          nesta mesma tela — não precisa recarregar nem cadastrar de novo.
        </p>

        <div style={{ background: c.surfaceAlt, borderRadius: 11, padding: "13px 15px", textAlign: "left", marginBottom: 22 }}>
          <div style={{ fontSize: 11.5, color: c.ink3, fontWeight: 600 }}>Conta</div>
          <div style={{ fontSize: 13.5, color: c.inkTitle, fontWeight: 600, marginTop: 2, wordBreak: "break-all" }}>
            {email ?? "—"}
          </div>
        </div>

        <Button variant="ghost" onClick={sair} style={{ width: "100%" }}>
          Sair
        </Button>
      </div>
    </div>
  );
}
