import { ArrowLeft, Check, User } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SidebarCambiarClienteProps {
  folio: number | string;
  mesaNombre: string;
  nombre: string;
  onNombreChange: (val: string) => void;
  // Clientes registrados que coinciden con lo escrito.
  sugerencias: string[];
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
  onBack,
  onGuardar,
}: SidebarCambiarClienteProps) {
  return (
    <div className="h-full w-full bg-card flex flex-col overflow-hidden shadow-xl">
      <header className="p-4 border-b border-border flex items-center gap-3 shrink-0 shadow-xs">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex flex-col min-w-0">
          <h3 className="font-extrabold text-base text-foreground leading-tight">Cambiar Cliente</h3>
          <span className="text-[10px] font-bold text-muted-foreground truncate">
            COMANDA #{folio} · {mesaNombre}
          </span>
        </div>
      </header>

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
          <p className="text-xs text-muted-foreground">
            Elige un cliente registrado o escribe uno nuevo.
          </p>
        </div>

        {sugerencias.length > 0 && (
          <div className="flex flex-col rounded-xl border border-border overflow-hidden">
            {sugerencias.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => onNombreChange(s)}
                className={`w-full h-12 px-3 flex items-center gap-2 text-left text-sm font-semibold cursor-pointer ${i % 2 === 1 ? 'bg-muted/70' : ''}`}
              >
                <User size={16} className="text-muted-foreground shrink-0" />
                <span className="truncate">{s}</span>
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
