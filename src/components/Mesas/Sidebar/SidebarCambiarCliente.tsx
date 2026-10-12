import { Check, User } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { ReservaHeader } from './ReservaHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SidebarCambiarClienteProps {
  folio: number | string;
  mesaNombre: string;
  nombre: string;
  onNombreChange: (val: string) => void;
  // Clientes registrados que coinciden con lo escrito (con su documento, para elegir al correcto).
  sugerencias: Array<{ id: string; nombre: string; detalle: string }>;
  /** Cliente elegido de la lista (la comanda se vincula a su id). */
  onElegir: (cliente: { id: string; nombre: string }) => void;
  onBack: () => void;
  onGuardar: () => void;
}

// Página dentro del mismo sheet (mismo patrón que SidebarEnviarHabitacion /
// SidebarSplit): como vive en el propio sheet, el teclado lo redimensiona de
// forma nativa, sin un modal encima que confunda al sheet de la comanda.
export function SidebarCambiarCliente({
  folio,
  mesaNombre,
  nombre,
  onNombreChange,
  sugerencias,
  onElegir,
  onBack,
  onGuardar,
}: SidebarCambiarClienteProps) {
  return (
    <div className="h-full w-full bg-card flex flex-col overflow-hidden shadow-xl">
      <ReservaHeader tono="neutro" titulo="Cambiar cliente" subtitulo={`Comanda #${folio} · ${mesaNombre}`} onBack={onBack} />

      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cambiar-cliente">Nombre del cliente</Label>
          <Input
            id="cambiar-cliente"
            type="text"
            autoFocus
            placeholder="Consumidor Final (Defecto)"
            value={nombre}
            onChange={(e) => onNombreChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onGuardar(); }}
            className="h-12 text-base"
          />
          <p className="t-meta text-muted-foreground">
            Elige un cliente registrado o escribe uno nuevo.
          </p>
        </div>

        {sugerencias.length > 0 && (
          <div className="flex flex-col rounded-2xl border border-border overflow-hidden">
            {sugerencias.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onElegir(c)}
                className={`w-full min-h-14 px-3 py-2 flex items-center gap-2 text-left cursor-pointer ${i % 2 === 1 ? 'bg-muted/40' : ''}`}
              >
                <User size={16} className="text-muted-foreground shrink-0" />
                <span className="flex flex-col min-w-0">
                  <span className="truncate t-cuerpo text-foreground">{c.nombre}</span>
                  <span className="truncate t-meta text-muted-foreground tabular-nums">{c.detalle}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </main>

      <footer className="p-4 border-t border-border shrink-0">
        <Button className="w-full h-12 font-bold gap-2" onClick={onGuardar}>
          <Check size={18} weight="bold" /> Guardar
        </Button>
      </footer>
    </div>
  );
}
