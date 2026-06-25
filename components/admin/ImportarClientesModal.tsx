"use client";

import { useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/StatusPill";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { c, font } from "@/lib/theme";
import {
  CAMPOS,
  formatarCpf,
  indexarExistentes,
  mapearCabecalhos,
  maskTelefone,
  modeloCsv,
  montarLinhas,
  parseArquivo,
  type CampoImport,
  type LinhaImport,
  type StatusLinha,
} from "@/lib/clientes-import";

const STATUS_META: Record<StatusLinha, { label: string; fg: string; bg: string }> = {
  ok: { label: "OK", fg: c.green, bg: "rgba(18,161,80,.12)" },
  invalido: { label: "Inválido", fg: c.red, bg: "rgba(229,72,77,.12)" },
  duplicado: { label: "Duplicado", fg: c.amber, bg: "rgba(224,162,26,.14)" },
};

const MAX_PREVIEW = 100;

export function ImportarClientesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<"arquivo" | "conferir">("arquivo");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<CampoImport, number>>({ nome: -1, cpf: -1, telefone: -1, email: -1, plano: -1 });
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);

  const existentes = useMemo(() => indexarExistentes(state.clientes), [state.clientes]);

  const linhas: LinhaImport[] = useMemo(() => {
    if (!rows.length) return [];
    return montarLinhas({ rows, mapping, planos: state.planos, existentes });
  }, [rows, mapping, state.planos, existentes]);

  const contagem = useMemo(() => {
    let ok = 0, invalido = 0, duplicado = 0;
    for (const l of linhas) {
      if (l.status === "ok") ok++;
      else if (l.status === "invalido") invalido++;
      else duplicado++;
    }
    return { ok, invalido, duplicado };
  }, [linhas]);

  function resetar() {
    setEtapa("arquivo");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({ nome: -1, cpf: -1, telefone: -1, email: -1, plano: -1 });
    setProgresso(null);
    setImportando(false);
    setLendo(false);
  }

  function fechar() {
    if (importando) return; // não fecha no meio da gravação
    resetar();
    onClose();
  }

  async function abrirArquivo(file: File) {
    setLendo(true);
    try {
      const { headers: h, rows: r } = await parseArquivo(file);
      if (!h.length || !r.length) {
        toast("A planilha está vazia ou sem cabeçalho.", "error");
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRows(r);
      setMapping(mapearCabecalhos(h));
      setEtapa("conferir");
    } catch {
      toast("Não foi possível ler o arquivo. Use .xlsx, .xls ou .csv.", "error");
    } finally {
      setLendo(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) abrirArquivo(file);
    e.target.value = ""; // permite reescolher o mesmo arquivo
  }

  function baixarModelo() {
    const blob = new Blob([modeloCsv()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importar() {
    const novos = linhas.filter((l) => l.status === "ok" && l.cliente).map((l) => l.cliente!);
    if (!novos.length) return;
    setImportando(true);
    setProgresso({ feitos: 0, total: novos.length });
    try {
      await actions.clientes.addMany(novos, (feitos, total) => setProgresso({ feitos, total }));
      const partes = [`${novos.length} cliente(s) importado(s)`];
      if (contagem.duplicado) partes.push(`${contagem.duplicado} ignorado(s) (duplicados)`);
      if (contagem.invalido) partes.push(`${contagem.invalido} com erro`);
      toast(partes.join(" · "));
      resetar();
      onClose();
    } catch {
      toast("Falha ao importar. Verifique a conexão e tente de novo.", "error");
      setImportando(false);
    }
  }

  const cell = (l: LinhaImport, campo: CampoImport): string => {
    const i = mapping[campo];
    const v = i >= 0 ? (l.raw[i] ?? "").trim() : "";
    if (campo === "cpf") return v ? formatarCpf(v) : "—";
    if (campo === "telefone") return v ? maskTelefone(v) : "—";
    if (campo === "plano") return l.cliente?.plano ?? (v || "—");
    return v || "—";
  };

  const COLS = "76px 1.4fr 1.1fr 1fr 1.4fr 0.9fr";

  return (
    <Modal
      open={open}
      onClose={fechar}
      width={etapa === "conferir" ? 860 : 480}
      title="Importar clientes"
      footer={
        etapa === "conferir" ? (
          <>
            <Button variant="ghost" onClick={resetar} disabled={importando}>Trocar arquivo</Button>
            <Button onClick={importar} disabled={importando || contagem.ok === 0}>
              {importando
                ? `Importando ${progresso?.feitos ?? 0}/${progresso?.total ?? 0}…`
                : `Importar ${contagem.ok} cliente${contagem.ok === 1 ? "" : "s"}`}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={fechar}>Fechar</Button>
        )
      }
    >
      {etapa === "arquivo" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: c.ink2, lineHeight: 1.5 }}>
            Suba a sua planilha de clientes (.xlsx, .xls ou .csv). O sistema reconhece as colunas
            automaticamente e mostra uma prévia antes de gravar. <b>CPF é obrigatório.</b>
          </div>

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) abrirArquivo(file);
            }}
            style={{
              border: `1.5px dashed ${c.borderInput}`,
              borderRadius: 12,
              background: c.surfaceWarm,
              padding: "30px 20px",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: c.inkTitle }}>
              {lendo ? "Lendo arquivo…" : "Clique ou arraste o arquivo aqui"}
            </div>
            <div style={{ fontSize: 12, color: c.ink3, marginTop: 4 }}>.xlsx · .xls · .csv</div>
          </div>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onInputChange} style={{ display: "none" }} />

          <button
            onClick={baixarModelo}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: c.brassDeep, fontSize: 12.5, fontWeight: 700, padding: 0, textAlign: "left" }}
          >
            Baixar planilha modelo →
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Resumo + de-para */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: c.ink2 }}>
              <b style={{ color: c.inkTitle }}>{fileName}</b> · {linhas.length} linha(s)
            </span>
            <div style={{ flex: 1 }} />
            <Tag label={`${contagem.ok} válidos`} fg={STATUS_META.ok.fg} bg={STATUS_META.ok.bg} />
            <Tag label={`${contagem.duplicado} duplicados`} fg={STATUS_META.duplicado.fg} bg={STATUS_META.duplicado.bg} />
            <Tag label={`${contagem.invalido} inválidos`} fg={STATUS_META.invalido.fg} bg={STATUS_META.invalido.bg} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {CAMPOS.map((campo) => (
              <Field key={campo.key} label={campo.key === "cpf" ? "CPF *" : campo.label}>
                <Select
                  value={mapping[campo.key]}
                  onChange={(e) => setMapping((m) => ({ ...m, [campo.key]: Number(e.target.value) }))}
                  style={{ padding: "9px 10px", fontSize: 12.5 }}
                >
                  <option value={-1}>— não usar —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          {/* Prévia */}
          <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "9px 12px", background: c.surfaceAlt, fontSize: 11, fontWeight: 700, color: c.ink3, textTransform: "uppercase", letterSpacing: 0.4 }}>
              <span>Status</span><span>Nome</span><span>CPF</span><span>Telefone</span><span>E-mail</span><span>Plano</span>
            </div>
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              {linhas.slice(0, MAX_PREVIEW).map((l, idx) => {
                const meta = STATUS_META[l.status];
                const motivo = l.erros.length ? l.erros.join(", ") : l.avisos.join(", ");
                return (
                  <div key={idx} style={{ borderTop: `1px solid ${c.borderSoft}`, padding: "8px 12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center", fontSize: 12.5, color: c.ink }}>
                      <span><Tag label={meta.label} fg={meta.fg} bg={meta.bg} /></span>
                      <span style={{ fontWeight: 600, color: c.inkTitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell(l, "nome")}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell(l, "cpf")}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell(l, "telefone")}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell(l, "email")}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell(l, "plano")}</span>
                    </div>
                    {motivo ? (
                      <div style={{ fontSize: 11, color: l.erros.length ? c.red : c.ink3, marginTop: 3 }}>{motivo}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          {linhas.length > MAX_PREVIEW ? (
            <div style={{ fontSize: 11.5, color: c.ink3, fontFamily: font.sans }}>
              Mostrando as primeiras {MAX_PREVIEW} de {linhas.length} linhas. A importação processa todas.
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
