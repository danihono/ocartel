"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { duracaoServico } from "@/lib/selectors";
import { horarioLivre, ocupaHorario } from "@/lib/agenda";
import { HOJE_ISO, addDias, addMeses, hojeLocalISO, indiceSegDom, isoParaLabel } from "@/lib/date";
import { c } from "@/lib/theme";

export interface AgendamentoRecorrenteDefaults {
  dateISO?: string;
  barbeiroId?: string;
}

// Indexado Segunda=0 … Domingo=6 — alinha com `indiceSegDom` e `config.horario.diasAtivos`.
const DIAS_CURTO = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// Teto de segurança de UX: o `addMany` já fatia em 500, isto evita gerar séries
// gigantes por engano (ex.: vários dias/semana por anos).
const CAP = 200;

/** Expande [de, ate] nos dias da semana marcados (UTC-safe via lib/date). */
function expandirDatas(de: string, ate: string, dias: boolean[]): string[] {
  if (!de || !ate || ate < de) return [];
  const datas: string[] = [];
  let cur = de;
  let guard = 0;
  while (cur <= ate) {
    if (dias[indiceSegDom(cur)]) datas.push(cur);
    cur = addDias(cur, 1);
    if (++guard > 5000) break; // trava dura anti-loop
  }
  return datas;
}

type Gerado = { date: string; conflito: string | null; incluir: boolean };

export function AgendamentoRecorrenteModal({
  open,
  onClose,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  defaults?: AgendamentoRecorrenteDefaults;
}) {
  const { state, actions } = useStore();
  const toast = useToast();

  const [cliente, setCliente] = useState("");
  const [servico, setServico] = useState("");
  const [barbeiroId, setBarbeiroId] = useState("");
  const [dias, setDias] = useState<boolean[]>(() => Array(7).fill(false));
  const [de, setDe] = useState(HOJE_ISO);
  const [ate, setAte] = useState(addMeses(HOJE_ISO, 3));
  const [inicio, setInicio] = useState("09:00");
  const [etapa, setEtapa] = useState<"form" | "revisao">("form");
  const [gerados, setGerados] = useState<Gerado[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const inicial = defaults?.dateISO ?? hojeLocalISO();
    setCliente("");
    setServico(state.servicos[0]?.nome ?? "");
    setBarbeiroId(defaults?.barbeiroId ?? state.barbeiros[0]?.id ?? "");
    const d = Array(7).fill(false);
    d[indiceSegDom(inicial)] = true; // pré-marca o dia da semana da data inicial
    setDias(d);
    setDe(inicial);
    setAte(addMeses(inicial, 3));
    setInicio("09:00");
    setEtapa("form");
    setGerados([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Prévia (contagem) recalculada a cada mudança do form.
  const previa = useMemo(() => expandirDatas(de, ate, dias).length, [de, ate, dias]);

  const janelaInicio = addDias(hojeLocalISO(), -180);
  const foraDaJanela = de < janelaInicio; // conflitos antes disso não podem ser verificados

  function revisar() {
    if (!cliente.trim()) {
      toast("Informe o nome do cliente.", "error");
      return;
    }
    if (dias.every((x) => !x)) {
      toast("Selecione ao menos um dia da semana.", "error");
      return;
    }
    if (!de || !ate) {
      toast("Informe as datas de início e fim.", "error");
      return;
    }
    if (ate < de) {
      toast("A data final deve ser igual ou posterior à inicial.", "error");
      return;
    }

    const datas = expandirDatas(de, ate, dias);
    if (datas.length === 0) {
      toast("Nenhuma data bate com os dias da semana escolhidos.", "error");
      return;
    }
    if (datas.length > CAP) {
      toast(`São ${datas.length} datas — máximo de ${CAP}. Reduza o período ou os dias.`, "error");
      return;
    }

    const duracaoMin = duracaoServico(state, servico);
    const novos: Gerado[] = datas.map((date) => {
      const ocupados = state.agendamentos
        .filter((a) => a.barbeiroId === barbeiroId && a.date === date && ocupaHorario(a.status))
        .map((a) => ({ inicio: a.inicio, duracaoMin: a.duracaoMin }));
      const livre = horarioLivre(ocupados, inicio, duracaoMin);
      return { date, conflito: livre ? null : "ocupado", incluir: livre }; // conflitos vêm desmarcados
    });
    setGerados(novos);
    setEtapa("revisao");
  }

  function alternarDia(i: number) {
    setDias((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function alternarGerado(i: number) {
    setGerados((prev) => prev.map((g, idx) => (idx === i ? { ...g, incluir: !g.incluir } : g)));
  }

  async function criar() {
    const selecionados = gerados.filter((g) => g.incluir);
    if (selecionados.length === 0) return;

    const svc = state.servicos.find((s) => s.nome === servico);
    const nomeLimpo = cliente.trim();
    const clienteId = state.clientes.find((cl) => cl.nome === nomeLimpo)?.id;
    const duracaoMin = duracaoServico(state, servico);
    const recorrenciaId = makeId("rec"); // um id para a série toda

    const lista = selecionados.map((g) => ({
      id: makeId("ag"),
      date: g.date,
      barbeiroId,
      clienteNome: nomeLimpo,
      clienteId,
      servico,
      servicoId: svc?.id,
      inicio,
      duracaoMin,
      status: "agendado" as const,
      origem: "admin" as const,
      recorrenciaId,
    }));

    setSalvando(true);
    try {
      await actions.agendamentos.addMany(lista);
      toast(`${lista.length} agendamento${lista.length > 1 ? "s" : ""} criado${lista.length > 1 ? "s" : ""}.`);
      onClose();
    } catch {
      toast("Não foi possível criar os agendamentos.", "error");
    } finally {
      setSalvando(false);
    }
  }

  const selecionados = gerados.filter((g) => g.incluir).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agendamento recorrente"
      width={560}
      footer={
        etapa === "form" ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={revisar} disabled={previa === 0}>
              Revisar{previa > 0 ? ` (${previa})` : ""}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setEtapa("form")} disabled={salvando}>Voltar</Button>
            <Button onClick={criar} loading={salvando} disabled={selecionados === 0}>
              Criar ({selecionados})
            </Button>
          </>
        )
      }
    >
      {etapa === "form" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Cliente">
            <TextInput value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" list="oc-clientes-rec" />
            <datalist id="oc-clientes-rec">
              {state.clientes.map((cl) => (
                <option key={cl.id} value={cl.nome} />
              ))}
            </datalist>
          </Field>
          <Field label="Serviço">
            <Select value={servico} onChange={(e) => setServico(e.target.value)}>
              {state.servicos.map((s) => (
                <option key={s.id} value={s.nome}>
                  {s.nome} · R$ {s.preco} · {s.duracaoMin}min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Profissional">
            <Select value={barbeiroId} onChange={(e) => setBarbeiroId(e.target.value)}>
              {state.barbeiros.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.inkLabel, display: "block", marginBottom: 6 }}>Dias da semana</span>
            <div style={{ display: "flex", gap: 6 }}>
              {DIAS_CURTO.map((label, i) => {
                const on = dias[i];
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => alternarDia(i)}
                    style={{
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: 9,
                      border: `1px solid ${on ? c.brass : c.borderInput}`,
                      background: on ? c.brass : c.surface,
                      color: on ? "#fff" : c.ink2,
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <Field label="De" style={{ flex: 1 }}>
              <TextInput type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </Field>
            <Field label="Até" style={{ flex: 1 }}>
              <TextInput type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </Field>
            <Field label="Horário" style={{ flex: 1 }}>
              <TextInput type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </Field>
          </div>

          <div style={{ fontSize: 12.5, color: c.ink3, fontWeight: 600 }}>
            {previa > 0 ? `≈ ${previa} agendamento${previa > 1 ? "s" : ""} no período.` : "Selecione dias e período para ver a prévia."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: c.inkTitle, fontWeight: 600 }}>
            {selecionados} de {gerados.length} datas selecionadas
          </div>
          {gerados.some((g) => g.conflito) ? (
            <div style={{ fontSize: 12, color: c.ink3 }}>
              Datas com conflito de horário já vêm desmarcadas — marque para criar mesmo assim.
            </div>
          ) : null}
          {foraDaJanela ? (
            <div style={{ fontSize: 12, color: c.red, fontWeight: 600 }}>
              Atenção: conflitos antes de {isoParaLabel(janelaInicio)} não puderam ser verificados.
            </div>
          ) : null}

          <div style={{ maxHeight: 280, overflow: "auto", border: `1px solid ${c.borderSoft}`, borderRadius: 10 }}>
            {gerados.map((g, i) => (
              <label
                key={g.date}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderBottom: i < gerados.length - 1 ? `1px solid ${c.borderSoft}` : "none",
                  cursor: "pointer",
                  background: g.incluir ? c.surface : c.surfaceAlt,
                }}
              >
                <input type="checkbox" checked={g.incluir} onChange={() => alternarGerado(i)} />
                <span style={{ flex: 1, fontSize: 13, color: c.inkTitle, fontWeight: 600 }}>{isoParaLabel(g.date)}</span>
                {g.conflito ? (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: c.redBg, color: c.red }}>
                    conflito
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
