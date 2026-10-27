// Documento do Firestore → objeto que atravessa uma server action.
//
// Server action só devolve dado "simples" (JSON). `Timestamp` do Firestore é uma classe,
// e passaria quebrado; aqui vira texto ISO. Funciona com Timestamp do Admin SDK e do SDK
// web (os dois têm `toDate()`), e não importa nenhum dos dois — é só uma função pura.

type ComToDate = { toDate: () => Date };

function temToDate(v: unknown): v is ComToDate {
  return typeof v === "object" && v !== null && typeof (v as ComToDate).toDate === "function";
}

export function serializar(v: unknown): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (temToDate(v)) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serializar);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = serializar(x);
    return out;
  }
  return v;
}
