// A tela em si é renderizada por app/(admin)/layout.tsx, que mantém as seis
// montadas ao mesmo tempo e só alterna qual está visível — trocar de aba não
// remonta nada (preserva scroll, filtros e estado). A rota existe para o URL, o
// <Link>, o prefetch e o histórico do navegador continuarem funcionando.
export default function Page() {
  return null;
}
