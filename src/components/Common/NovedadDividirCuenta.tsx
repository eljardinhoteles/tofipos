import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowsLeftRight, ArrowsOutLineHorizontal, Money, Printer, Sparkle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// Aviso de una función nueva: «Dividir Cuenta» en Mesas. Se muestra una sola vez por dispositivo y trae un gráfico que imita la pantalla
// real para que el equipo la entienda sin una capacitación. Para volver a mostrarlo (o avisar otra novedad) basta cambiar la clave.
const CLAVE = 'pos_novedad:dividir-cuenta-v1';

function yaVisto() {
  try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; }
}
function marcarVisto() {
  try { localStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento: se mostrará de nuevo */ }
}

// Mini fila de producto, igual a la de la lista real: cantidad, nombre y precio.
function Fila({ cant, nombre, precio, elegido }: { cant: string; nombre: string; precio: string; elegido?: boolean }) {
  return (
    <div className={cn('rounded-lg border px-2.5 py-1.5 flex items-center gap-2',
      elegido ? 'border-primary bg-primary/10 motion-safe:animate-pulse' : 'border-border bg-card')}>
      <span className={cn('t-fila tabular-nums', elegido ? 'text-primary' : 'text-foreground')}>{cant}</span>
      <span className="flex-1 min-w-0 t-cuerpo text-foreground truncate">{nombre}</span>
      <span className="t-cuerpo tabular-nums text-foreground">{precio}</span>
    </div>
  );
}

// Gráfico: dos cuentas lado a lado; el producto elegido de la primera se pasa a la segunda con «Pasar aquí».
function Grafico() {
  return (
    <div aria-hidden="true" className="rounded-2xl bg-muted p-3 flex items-stretch gap-2">
      <div className="flex-1 min-w-0 rounded-xl border border-warning bg-card overflow-hidden flex flex-col">
        <div className="bg-warning-soft px-2.5 py-1.5 flex items-center justify-between">
          <span className="t-cuerpo-fuerte text-foreground">Cuenta 1</span>
          <span className="t-cuerpo-fuerte tabular-nums text-foreground">$12.00</span>
        </div>
        <div className="p-2 flex flex-col gap-1.5">
          <Fila cant="2" nombre="Jarra Guayusa" precio="$10.00" elegido />
          <Fila cant="1" nombre="Sprite" precio="$2.00" />
        </div>
      </div>

      <div className="flex items-center text-muted-foreground">
        <ArrowRight size={18} weight="bold" className="motion-safe:animate-pulse" />
      </div>

      <div className="flex-1 min-w-0 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="bg-muted/60 px-2.5 py-1.5 flex items-center justify-between">
          <span className="t-cuerpo-fuerte text-foreground">Cuenta 2</span>
          <span className="t-cuerpo-fuerte tabular-nums text-foreground">$0.00</span>
        </div>
        <div className="p-2 flex flex-col gap-1.5">
          <div className="h-9 rounded-lg border-2 border-dashed border-primary bg-primary/10 text-primary t-cuerpo-fuerte flex items-center justify-center gap-1.5">
            <ArrowDown size={14} weight="bold" className="motion-safe:animate-bounce" /> Pasar aquí
          </div>
          <div className="h-9 rounded-lg border border-dashed border-border" />
        </div>
      </div>
    </div>
  );
}

const pill = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full t-dato whitespace-nowrap';

/** El aviso en sí: se puede abrir a demanda (p. ej. desde el icono de info del modal de dividir cuenta). */
export function NovedadDividirCuentaDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const pasos = [
    {
      icono: <span className={cn(pill, 'border border-special/40 bg-special-soft text-special-foreground')}><ArrowsOutLineHorizontal size={15} weight="bold" /> Dividir Mesa</span>,
      texto: 'Al pedir la cuenta, toca este botón: crea la segunda cuenta de la mesa.',
    },
    {
      icono: <span className={cn(pill, 'bg-special text-white')}><ArrowsLeftRight size={15} weight="bold" /> Dividir Cuenta</span>,
      texto: 'Abre la pantalla de reparto. Toca los productos y «Pasar aquí», o arrástralos a la otra cuenta. Cada toque suma una unidad.',
    },
    {
      icono: <span className="inline-flex items-center gap-1.5 text-foreground"><Printer size={18} weight="bold" /><Money size={18} weight="bold" /></span>,
      texto: 'Imprime la precuenta de cada cuenta y toca «Pasar a Cobrar»: al terminar vuelves a la pantalla para seguir con la otra.',
    },
  ];

  return (
    <Dialog open={abierto} onOpenChange={(open) => { if (!open) onCerrar(); }}>
      <DialogContent className="max-w-md gap-4 max-h-[92dvh] overflow-y-auto">
        <DialogHeader className="text-left gap-2">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-special-soft text-special-foreground px-2.5 h-6 t-etiqueta">
            <Sparkle size={12} weight="fill" /> Novedad
          </span>
          <DialogTitle className="t-titulo">Ahora puedes dividir una cuenta entre varias</DialogTitle>
          <DialogDescription className="t-meta">
            Reparte los productos de una mesa en cuentas separadas, imprime cada precuenta y cóbralas una por una, todo desde una sola pantalla.
          </DialogDescription>
        </DialogHeader>

        <Grafico />

        <div className="flex flex-col gap-2">
          {pasos.map((p, i) => (
            <div key={i} className="flex items-start gap-3 rounded-2xl bg-muted p-3">
              <span className="w-6 h-6 rounded-full bg-card text-foreground t-dato flex items-center justify-center shrink-0 shadow-xs">{i + 1}</span>
              <div className="flex flex-col gap-1.5 min-w-0">
                <div>{p.icono}</div>
                <span className="t-cuerpo text-foreground leading-snug">{p.texto}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={onCerrar}>Entendido</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Lo muestra solo la primera vez en cada dispositivo. */
export function NovedadDividirCuenta() {
  // Se abre una sola vez y se marca como visto al instante: si se cierra la app a medias no vuelve a insistir.
  const [abierto, setAbierto] = useState(() => !yaVisto());
  useEffect(() => { if (abierto) marcarVisto(); }, [abierto]);
  return <NovedadDividirCuentaDialog abierto={abierto} onCerrar={() => setAbierto(false)} />;
}
