import { Scissors } from '@phosphor-icons/react';

export interface ParteDividida { id: string; nombre: string; monto: number }

const money = (n: number) => `$${n.toFixed(2)}`;

// Señal en las comandas históricas que se cobraron con "Dividir cuenta": quién
// pagó cada parte y cuánto. Cada parte es una venta "Dividido - Nombre".
export function ComandaDividida({ partes }: { partes: ParteDividida[] }) {
  if (partes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-special-soft text-special-foreground">
      <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider">
        <Scissors size={14} weight="bold" />
        Cuenta dividida · {partes.length} {partes.length === 1 ? 'pago' : 'pagos'}
      </div>
      <ul className="flex flex-col gap-0.5">
        {partes.map(p => (
          <li key={p.id} className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span className="truncate">{p.nombre}</span>
            <span className="font-bold tabular-nums shrink-0">{money(p.monto)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
