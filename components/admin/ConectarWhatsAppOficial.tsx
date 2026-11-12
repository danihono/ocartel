"use client";

// O botão que conecta o número da barbearia à API oficial do WhatsApp.
//
// Abre a janela da Meta (Embedded Signup, v5). Se o número já é usado no app WhatsApp
// Business do celular, a própria janela oferece mantê-lo lá (Coexistência) — é o padrão do
// v5. Ao terminar, a janela entrega duas coisas por caminhos diferentes:
//
//   - os ids (número e conta), num `message` da janela → `lerSessaoEmbedded`;
//   - um código que vale 30 SEGUNDOS, no callback do `FB.login`.
//
// A ordem entre os dois não é garantida, então o callback espera um pouco pelos ids e
// manda tudo ao servidor de uma vez (lib/whatsapp/conectar.ts), antes de o código vencer.

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { c } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { lerSessaoEmbedded, type SessaoEmbedded } from "@/lib/whatsapp/embedded";
import { acaoConectarWhatsAppOficial } from "@/app/(admin)/configuracoes/actions";

// Nenhum dos dois é segredo: vão para o navegador em qualquer integração com a Meta.
const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const CONFIG_ID = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID ?? "";
const VERSAO_GRAPH = "v27.0";

/**
 * Quanto o callback espera pelos ids da janela antes de seguir só com o código. Sem eles o
 * servidor descobre a conta pelo próprio token (ver `descobrirWaba`), então esperar mais não
 * é necessário — mas o código vale 30 s, e a troca precisa caber.
 */
const ESPERA_IDS_MS = 8000;

interface RespostaLogin {
  authResponse?: { code?: string } | null;
}
interface SdkFacebook {
  init(o: Record<string, unknown>): void;
  login(cb: (r: RespostaLogin) => void, o: Record<string, unknown>): void;
}
declare global {
  interface Window {
    FB?: SdkFacebook;
    fbAsyncInit?: () => void;
  }
}

let carregando: Promise<SdkFacebook> | null = null;

/** Carrega o SDK da Meta uma vez só, e só quando alguém for conectar. */
function carregarSdk(): Promise<SdkFacebook> {
  if (window.FB) return Promise.resolve(window.FB);
  carregando ??= new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: VERSAO_GRAPH });
      resolve(window.FB!);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => {
      carregando = null;
      reject(new Error("sdk"));
    };
    document.body.appendChild(s);
  });
  return carregando;
}

type Fase = "parado" | "janela" | "conectando" | "pronto" | "erro";

export function ConectarWhatsAppOficial({
  user,
  tenantId,
  rotulo = "Conectar WhatsApp oficial",
  onConectado,
}: {
  user: User | null;
  tenantId: string | null;
  rotulo?: string;
  onConectado?: () => void;
}) {
  const [fase, setFase] = useState<Fase>("parado");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const sessao = useRef<SessaoEmbedded | null>(null);

  // A janela da Meta fala por `postMessage`. Só vale o que vem de facebook.com.
  useEffect(() => {
    function ouvir(e: MessageEvent) {
      if (!e.origin.endsWith("facebook.com")) return;
      const s = lerSessaoEmbedded(e.data);
      if (!s) return;
      // Fica no console de propósito: quando a conexão falha, é o que mostra o que a Meta
      // mandou (só ids e o nome da etapa, nada secreto).
      console.info("[whatsapp] janela da Meta:", s);
      sessao.current = s;
      if (s.tipo === "erro") {
        setFase("erro");
        setMensagem(`A Meta informou um erro: ${s.mensagem || "sem detalhe"}${s.codigo ? ` (código ${s.codigo})` : ""}.`);
      }
    }
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, []);

  async function concluir(code: string) {
    setFase("conectando");
    setMensagem("Conectando o número… não feche esta página.");

    const limite = Date.now() + ESPERA_IDS_MS;
    while (sessao.current?.tipo !== "fim" && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const fim = sessao.current?.tipo === "fim" ? sessao.current : null;

    try {
      const r = await acaoConectarWhatsAppOficial(await user!.getIdToken(), tenantId!, {
        code,
        ...(fim?.phoneNumberId ? { phoneNumberId: fim.phoneNumberId } : {}),
        ...(fim?.wabaId ? { wabaId: fim.wabaId } : {}),
        coexistencia: fim?.coexistencia ?? false,
      });
      if (!r.ok) {
        setFase("erro");
        setMensagem(r.erro);
        return;
      }
      setFase("pronto");
      setMensagem(
        [
          `Conectado${r.numero ? ` · +${r.numero}` : ""}.`,
          r.coexistencia
            ? "O número continua no app do celular. As conversas dos últimos meses estão sendo trazidas — deixe o WhatsApp Business aberto no celular por alguns minutos."
            : "",
          ...r.avisos,
        ]
          .filter(Boolean)
          .join(" "),
      );
      onConectado?.();
    } catch {
      setFase("erro");
      setMensagem("Não foi possível falar com o servidor. Tente de novo.");
    }
  }

  async function abrir() {
    if (!user || !tenantId || fase === "janela" || fase === "conectando") return;
    sessao.current = null;
    setMensagem(null);
    let fb: SdkFacebook;
    try {
      fb = await carregarSdk();
    } catch {
      setFase("erro");
      setMensagem("Não consegui carregar a janela da Meta. Confira a internet ou um bloqueador de anúncios.");
      return;
    }
    setFase("janela");
    // O callback do SDK não pode ser `async` (ele avisa e às vezes ignora): por isso o
    // `void` para a parte assíncrona.
    fb.login(
      (resposta) => {
        const code = resposta.authResponse?.code;
        if (code) {
          void concluir(code);
          return;
        }
        setFase((f) => (f === "erro" ? f : "parado"));
        setMensagem((m) => m ?? "Conexão cancelada.");
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { version: "v5" },
      },
    );
  }

  if (!APP_ID || !CONFIG_ID) {
    return (
      <div style={{ fontSize: 12.5, color: c.ink3, lineHeight: 1.45 }}>
        A conexão pela API oficial ainda não está configurada neste servidor (falta o ID de
        configuração da Meta).
      </div>
    );
  }

  return (
    <div>
      <Button onClick={() => void abrir()} disabled={fase === "janela" || fase === "conectando"}>
        {fase === "janela" ? "Termine na janela da Meta…" : fase === "conectando" ? "Conectando…" : rotulo}
      </Button>
      {mensagem && (
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.45,
            marginTop: 10,
            maxWidth: 520,
            color: fase === "erro" ? c.redText : fase === "pronto" ? c.inkTitle : c.ink3,
            fontWeight: fase === "pronto" ? 600 : 400,
          }}
        >
          {mensagem}
        </div>
      )}
    </div>
  );
}
