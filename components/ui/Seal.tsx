import Image from "next/image";
import { c } from "@/lib/theme";

/**
 * A marca do O Cartel — a navalha, na versão redonda da folha de marca.
 *
 * Era um selo desenhado em CSS com o monograma "OC" em Cinzel. Virou o símbolo de
 * verdade, e a versão CIRCULAR é de propósito: mantém a silhueta redonda que já estava
 * em todos os dez lugares onde isto aparece (sidebar, login, guarda de sessão, console
 * do super admin, agendamento público, links de confirmação e de cartão), então nenhum
 * layout precisou mudar de forma para receber a marca nova.
 *
 * O símbolo é claro sobre fundo verde escuro, então ele se resolve sozinho tanto no
 * escuro (sidebar, login) quanto no claro (páginas públicas) — não precisa de variante.
 */
export function Seal({ size = 40, alt = "" }: { size?: number; alt?: string }) {
  return (
    <Image
      src="/marca/simbolo-circulo.png"
      width={size}
      height={size}
      alt={alt}
      // `alt` vazio = decorativo: o nome da marca já vem escrito ao lado em quase todos
      // os usos, e o leitor de tela não deve dizê-lo duas vezes.
      aria-hidden={alt === "" ? true : undefined}
      style={{ display: "block", flex: "none", borderRadius: "50%" }}
      priority
    />
  );
}

/** Avatar with initials. */
export function Avatar({
  initials,
  size = 38,
  bg = c.brassSoft,
  color = c.brassDeep,
  fontSize,
}: {
  initials: string;
  size?: number;
  bg?: string;
  color?: string;
  fontSize?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: fontSize ?? Math.round(size * 0.34),
        fontWeight: 700,
        flex: "none",
      }}
    >
      {initials}
    </div>
  );
}
