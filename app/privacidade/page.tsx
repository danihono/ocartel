// Política de privacidade — pública, sem login.
//
// Existe porque a Meta exige um link de política para publicar o app do WhatsApp (sem app
// publicado, a mensagem real do cliente nem chega ao webhook). Mas ela vale para o sistema
// inteiro, não só para o WhatsApp: é aqui que o cliente da barbearia descobre o que é
// guardado sobre ele, com quem é compartilhado e como pedir para apagar.
//
// A seção `#exclusao` é o link que vai no campo "Instruções de exclusão de dados" do
// painel da Meta — não mude o id sem mudar lá.
//
// Os fornecedores listados são os que o código realmente chama (lib/canal, lib/ia,
// lib/cobrador, Firebase). Entrou um novo? Ele entra aqui também.

import type { Metadata } from "next";
import { c, font } from "@/lib/theme";

/** Para onde vão os pedidos de titular (LGPD, art. 18). */
const CONTATO_EMAIL = "danielboy200627@gmail.com";

/** Data da última mudança de conteúdo — atualize junto com o texto. */
const ATUALIZADA_EM = "11 de novembro de 2026";

export const metadata: Metadata = {
  title: "Política de privacidade — O Cartel",
  description: "Como O Cartel trata os dados de barbearias e de seus clientes.",
};

function Secao({ id, titulo, children }: { id?: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 19, fontWeight: 600, color: c.inkTitle, margin: "0 0 10px" }}>{titulo}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.65, color: c.ink2 }}>{children}</div>
    </section>
  );
}

export default function PrivacidadePage() {
  return (
    <main style={{ minHeight: "100vh", background: c.bg, padding: "48px 16px 80px" }}>
      <article style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: c.ink3, fontFamily: font.mono }}>
          O Cartel
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 600, color: c.inkTitle, margin: "8px 0 6px", letterSpacing: "-0.02em" }}>
          Política de privacidade
        </h1>
        <p style={{ fontSize: 13.5, color: c.ink3, margin: 0 }}>Atualizada em {ATUALIZADA_EM}.</p>

        <Secao titulo="Quem somos">
          <p>
            O Cartel é um sistema de gestão para barbearias: agenda, cadastro de clientes, planos de
            mensalidade, cobrança e atendimento pelo WhatsApp. Cada barbearia usa o sistema para
            organizar o próprio negócio.
          </p>
          <p>
            Para os dados dos <b>clientes de uma barbearia</b>, quem decide o que é feito com eles é a
            própria barbearia (a <b>controladora</b>, nos termos da Lei Geral de Proteção de Dados —
            LGPD). O Cartel trata esses dados em nome dela, como <b>operador</b>. Para os dados de
            quem administra a barbearia no sistema (conta, login), o controlador é O Cartel.
          </p>
        </Secao>

        <Secao titulo="Quais dados tratamos">
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>
              <b>Cadastro:</b> nome, telefone, e-mail e data de nascimento, quando informados pela
              barbearia ou pelo próprio cliente ao agendar.
            </li>
            <li>
              <b>Agenda e histórico:</b> horários marcados, serviços, barbeiro, comparecimento e
              confirmações.
            </li>
            <li>
              <b>Mensagens de WhatsApp</b> trocadas entre o cliente e a barbearia, incluindo fotos,
              áudios e documentos enviados na conversa, e o nome de perfil do WhatsApp.
            </li>
            <li>
              <b>Pagamentos:</b> valores, vencimentos e situação das mensalidades. Dados de cartão são
              digitados e guardados pelo processador de pagamentos (Asaas); O Cartel guarda apenas a
              bandeira, os quatro últimos dígitos e um código de referência.
            </li>
            <li>
              <b>Conta de acesso</b> de donos e barbeiros: e-mail e dados de login.
            </li>
          </ul>
        </Secao>

        <Secao titulo="Para que usamos">
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>Marcar, confirmar e lembrar horários;</li>
            <li>Conversar com o cliente pelo WhatsApp em nome da barbearia;</li>
            <li>
              Responder automaticamente pelo WhatsApp, quando a barbearia liga o atendente com
              inteligência artificial — ele lê a conversa e a agenda para sugerir ou marcar horário;
            </li>
            <li>Emitir e acompanhar cobranças de mensalidade;</li>
            <li>Gerar relatórios para a própria barbearia.</li>
          </ul>
          <p>
            Não vendemos dados, não os usamos para publicidade e não os compartilhamos entre
            barbearias.
          </p>
        </Secao>

        <Secao titulo="Com quem compartilhamos">
          <p>Somente com os fornecedores necessários para o sistema funcionar:</p>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>
              <b>Meta (WhatsApp Business Platform)</b> — envio e recebimento das mensagens de WhatsApp;
            </li>
            <li>
              <b>Google (Firebase e Google Cloud)</b> — hospedagem do sistema e do banco de dados;
            </li>
            <li>
              <b>Google (Gemini)</b> — processamento das mensagens pelo atendente automático, quando
              ligado pela barbearia;
            </li>
            <li>
              <b>Asaas</b> — emissão de boletos e Pix e cobrança no cartão.
            </li>
          </ul>
          <p>
            Alguns desses fornecedores podem processar dados fora do Brasil, sempre sob contrato e
            com as garantias exigidas pela LGPD.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo guardamos">
          <p>
            Enquanto a barbearia usar O Cartel, ou até que a exclusão seja pedida. Registros de
            pagamento podem ser mantidos pelo prazo exigido pela legislação fiscal.
          </p>
        </Secao>

        <Secao titulo="Seus direitos">
          <p>
            Pela LGPD, você pode pedir a confirmação de que tratamos seus dados, o acesso a eles, a
            correção, a anonimização ou exclusão, a portabilidade e informações sobre com quem foram
            compartilhados, além de revogar consentimentos. Como cliente de uma barbearia, você
            também pode fazer o pedido diretamente a ela.
          </p>
        </Secao>

        <Secao id="exclusao" titulo="Como pedir a exclusão dos seus dados">
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            <li>
              Envie um e-mail para{" "}
              <a href={`mailto:${CONTATO_EMAIL}`} style={{ color: c.accent }}>
                {CONTATO_EMAIL}
              </a>{" "}
              com o assunto <b>&quot;Exclusão de dados&quot;</b>;
            </li>
            <li>Informe seu nome, o telefone usado no WhatsApp e a barbearia com que você fala;</li>
            <li>
              Respondemos em até 15 dias, confirmando a exclusão das conversas, do cadastro e do
              histórico — exceto o que a lei obriga a manter, como registros de pagamento.
            </li>
          </ol>
          <p>Se quiser apenas parar de receber mensagens, peça à barbearia pela própria conversa.</p>
        </Secao>

        <Secao titulo="Segurança">
          <p>
            Os dados ficam em servidores do Google, com acesso restrito por conta e por barbearia:
            cada barbearia vê apenas os próprios clientes, e o público não vê nada além da página de
            agendamento.
          </p>
        </Secao>

        <Secao titulo="Contato">
          <p>
            Dúvidas sobre esta política ou sobre seus dados:{" "}
            <a href={`mailto:${CONTATO_EMAIL}`} style={{ color: c.accent }}>
              {CONTATO_EMAIL}
            </a>
            .
          </p>
        </Secao>
      </article>
    </main>
  );
}
