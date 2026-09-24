"use client";

// Cadastro de cartão pelo BALCÃO: a atendente digita o cartão do cliente presente.
//
// ATENÇÃO, para quem mexer aqui: este é o único formulário do produto que recebe número
// de cartão. Regras que não podem ser relaxadas:
//
//   - nada do cartão vai para `localStorage`, para o store, para a URL ou para log;
//   - os campos são limpos ao fechar o modal, inclusive quando dá erro;
//   - `autoComplete="off"` em tudo: cartão de cliente salvo no navegador da barbearia
//     seria o mesmo dado vazando por outra porta;
//   - o número NUNCA volta do servidor. A resposta traz bandeira e quatro dígitos.
//
// O caminho sem esse ônus é o link da página hospedada do Asaas (`/cartao/[codigo]`), que
// continua existindo e é o que se usa fora do balcão.

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/firebase/auth";
import { validarCamposCartao } from "@/lib/cartao-campos";
import { formatBRL } from "@/lib/selectors";
import { hojeLocalISO } from "@/lib/date";
import { c } from "@/lib/theme";
import { acaoCadastrarCartaoNoBalcao } from "@/app/(admin)/clientes/actions";
import type { Cliente } from "@/lib/types";

const VAZIO = {
  titular: "",
  numero: "",
  mesValidade: "",
  anoValidade: "",
  ccv: "",
  cpfTitular: "",
  cep: "",
  numeroEndereco: "",
};

export function CadastrarCartaoModal({
  open,
  onClose,
  cliente,
  valorMensalidade,
  diaVencimento,
  onSalvo,
}: {
  open: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  valorMensalidade: number;
  diaVencimento: number;
  onSalvo?: () => void;
}) {
  const { user, tenantId } = useAuth();
  const toast = useToast();

  const [f, setF] = useState(VAZIO);
  const [declarou, setDeclarou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const set = (patch: Partial<typeof VAZIO>) => setF((v) => ({ ...v, ...patch }));

  // Limpa SEMPRE que abre e SEMPRE que fecha. Deixar o número de um cliente na memória
  // do componente para o próximo cadastro é como deixar o cartão dele no balcão.
  useEffect(() => {
    setF({ ...VAZIO, titular: cliente?.nome ?? "", cpfTitular: cliente?.cpf ?? "" });
    setDeclarou(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cliente?.id]);

  if (!cliente) return null;

  const semWhatsApp = !(cliente.telefone ?? "").trim();

  function fechar() {
    setF(VAZIO);
    setDeclarou(false);
    onClose();
  }

  async function salvar() {
    // `cliente` já foi garantido acima, mas a checagem volta aqui porque a função é
    // hoisted e o TypeScript não estreita o tipo dentro dela.
    if (!cliente || !user || !tenantId) return;

    // Valida no cliente antes de mandar: erro de digitação pego aqui não faz o número do
    // cartão sair do navegador, e a mensagem é melhor que o 400 genérico do gateway.
    const invalido = validarCamposCartao(f, hojeLocalISO());
    if (invalido) {
      toast(invalido, "error");
      return;
    }
    if (!declarou) {
      toast("Confirme que o titular do cartão autorizou a cobrança.", "error");
      return;
    }

    setSalvando(true);
    try {
      const r = await acaoCadastrarCartaoNoBalcao(await user.getIdToken(), tenantId, cliente.id, {
        ...f,
        declarouAutorizacao: declarou,
        origin: window.location.origin,
      });
      if (!r.ok) {
        toast(r.erro ?? "Não foi possível cadastrar o cartão.", "error");
        return;
      }
      toast(
        r.avisouCliente
          ? `Cartão ${r.bandeira} ••${r.ultimosDigitos} cadastrado. O cliente recebeu a confirmação.`
          : `Cartão ${r.bandeira} ••${r.ultimosDigitos} cadastrado — mas a confirmação NÃO saiu no WhatsApp.`,
        r.avisouCliente ? undefined : "error",
      );
      onSalvo?.();
      fechar();
    } catch {
      toast("Não foi possível cadastrar o cartão.", "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Cadastrar cartão no balcão"
      width={500}
      footer={
        <>
          <Button variant="ghost" onClick={fechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando} disabled={!declarou}>Cadastrar cartão</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: c.surfaceAlt, borderRadius: 11, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.inkTitle }}>{cliente.nome}</div>
          <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 2 }}>
            {formatBRL(valorMensalidade)} · cobrança todo dia {diaVencimento}
          </div>
          <div style={{ fontSize: 12, color: c.ink3, marginTop: 4 }}>
            O cartão não é cobrado agora. A mensalidade em aberto é debitada pelo ciclo, na hora seguinte.
          </div>
        </div>

        {semWhatsApp ? (
          <div style={{ fontSize: 12.5, color: c.redText, background: c.redBg, border: `1px solid ${c.red}`, borderRadius: 9, padding: "10px 12px", lineHeight: 1.45 }}>
            Este cliente não tem telefone no cadastro, então <b>ele não vai receber a confirmação</b> do
            cartão — e é essa mensagem que prova que ele soube da cobrança. Complete a ficha antes de
            cadastrar o cartão.
          </div>
        ) : null}

        <Field label="Nome impresso no cartão">
          <TextInput
            value={f.titular}
            onChange={(e) => set({ titular: e.target.value })}
            autoComplete="off"
            placeholder="RUI A PEREIRA"
          />
        </Field>

        <Field label="Número do cartão">
          <TextInput
            value={f.numero}
            onChange={(e) => set({ numero: e.target.value })}
            autoComplete="off"
            inputMode="numeric"
            placeholder="0000 0000 0000 0000"
          />
        </Field>

        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Mês" style={{ width: 90 }}>
            <TextInput
              value={f.mesValidade}
              onChange={(e) => set({ mesValidade: e.target.value })}
              autoComplete="off"
              inputMode="numeric"
              placeholder="12"
            />
          </Field>
          <Field label="Ano" style={{ width: 110 }}>
            <TextInput
              value={f.anoValidade}
              onChange={(e) => set({ anoValidade: e.target.value })}
              autoComplete="off"
              inputMode="numeric"
              placeholder="2030"
            />
          </Field>
          <Field label="Cód. segurança" style={{ flex: 1 }}>
            <TextInput
              value={f.ccv}
              onChange={(e) => set({ ccv: e.target.value })}
              autoComplete="off"
              inputMode="numeric"
              placeholder="123"
            />
          </Field>
        </div>

        {/* O gateway exige estes três junto do cartão. Não ficam guardados: só o token
            sobrevive à chamada, e para recobrar basta ele. */}
        <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 2 }}>
          Dados do titular — exigidos pelo Asaas na hora de cadastrar, e não ficam guardados aqui.
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="CPF do titular" style={{ flex: 1 }}>
            <TextInput
              value={f.cpfTitular}
              onChange={(e) => set({ cpfTitular: e.target.value })}
              autoComplete="off"
              inputMode="numeric"
              placeholder="000.000.000-00"
            />
          </Field>
          <Field label="CEP" style={{ width: 130 }}>
            <TextInput
              value={f.cep}
              onChange={(e) => set({ cep: e.target.value })}
              autoComplete="off"
              inputMode="numeric"
              placeholder="00000-000"
            />
          </Field>
          <Field label="Nº" style={{ width: 90 }}>
            <TextInput
              value={f.numeroEndereco}
              onChange={(e) => set({ numeroEndereco: e.target.value })}
              autoComplete="off"
              placeholder="100"
            />
          </Field>
        </div>

        {/*
          A declaração é obrigatória e é gravada com o nome de quem está logado. No balcão
          quem marca não é o titular do cartão, então o registro diz exatamente isso —
          fingir que o cliente marcou seria prova falsa, e é justamente esta prova que a
          barbearia apresenta se ele contestar no banco.
        */}
        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            cursor: "pointer",
            background: c.surfaceAlt,
            border: `1px solid ${c.borderSoft}`,
            borderRadius: 12,
            padding: "13px 14px",
          }}
        >
          <input
            type="checkbox"
            checked={declarou}
            onChange={(e) => setDeclarou(e.target.checked)}
            style={{ marginTop: 2, width: 17, height: 17, flex: "none", accentColor: c.brass }}
          />
          <span style={{ fontSize: 12.5, color: c.ink2, lineHeight: 1.5 }}>
            Confirmo que o titular está presente, autorizou a cobrança de{" "}
            <b>{formatBRL(valorMensalidade)}</b> neste cartão todo dia <b>{diaVencimento}</b>, e foi
            informado de que pode cancelar quando quiser. Esta declaração fica registrada no seu nome.
          </span>
        </label>
      </div>
    </Modal>
  );
}
