"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { c, font } from "@/lib/theme";
import { tenantStatusMeta } from "@/lib/status";
import type { Tenant } from "@/lib/types";

export function TenantDrawer({ open, onClose, tenant }: { open: boolean; onClose: () => void; tenant: Tenant | null }) {
  const { actions } = useStore();
  const toast = useToast();

  if (!open || !tenant) return null;
  const sm = tenantStatusMeta[tenant.status];
  const ativo = tenant.status === "ativo";
  const pro = tenant.plano === "Pro";

  async function alternarStatus() {
    if (!tenant?.id) return;
    const novo = ativo ? "atrasado" : "ativo";
    try {
      await actions.tenants.update(tenant.id, { status: novo });
      toast(ativo ? "Barbearia suspensa." : "Barbearia reativada.");
    } catch {
      toast("Não foi possível atualizar a barbearia.", "error");
    }
  }

  async function alternarPlano() {
    if (!tenant?.id) return;
    const novoPlano = pro ? "Básico" : "Pro";
    const novoMrr = pro ? "R$ 129" : "R$ 249";
    try {
      await actions.tenants.update(tenant.id, { plano: novoPlano, mrr: tenant.status === "trial" ? "—" : novoMrr });
      toast(`Plano alterado para ${novoPlano}.`);
    } catch {
      toast("Não foi possível atualizar a barbearia.", "error");
    }
  }

  const linha = (rotulo: string, valor: string) => (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${c.darkLine}` }}>
      <span style={{ fontSize: 12.5, color: c.darkMuted, fontWeight: 600, width: 130, flex: "none" }}>{rotulo}</span>
      <span style={{ fontSize: 13.5, color: c.darkText, fontWeight: 600 }}>{valor}</span>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={tenant.nome} dark width={460}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 9, background: c.espressoLine, color: c.brass, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.cinzel, fontSize: 13, fontWeight: 700 }}>
          {tenant.monograma}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: c.darkMuted }}>{tenant.cidade}</div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 11px", borderRadius: 999, background: sm.bg, color: sm.fg }}>{sm.label}</span>
      </div>

      {linha("Plano", tenant.plano)}
      {linha("MRR", tenant.mrr)}
      {linha("Agendamentos/mês", tenant.agendamentosMes)}

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <Button variant="dark" onClick={alternarPlano}>{pro ? "Mudar para Básico" : "Mudar para Pro"}</Button>
        <div style={{ flex: 1 }} />
        <Button onClick={alternarStatus} style={ativo ? { background: c.red } : undefined}>
          {ativo ? "Suspender" : "Reativar"}
        </Button>
      </div>
    </Modal>
  );
}
