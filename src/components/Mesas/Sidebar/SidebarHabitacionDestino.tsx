import { useState } from 'react';
import { Bed, CircleNotch } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { ReservaHeader } from './ReservaHeader';
import { SubcuentaChips } from './habitacion/SubcuentaChips';
import { HabitacionOpcion } from './habitacion/HabitacionOpcion';

interface SidebarHabitacionDestinoProps {
  folio?: number | string;
  cuentas: any[];
  mesas: any[];
  procesando: boolean;
  onConfirm: (cuentaId: string, subcuentaId: string | null) => void | Promise<void>;
  onBack: () => void;
  /** Habitación (y subcuenta) con la que la comanda ya está vinculada: llega preseleccionada, a la espera de que el usuario confirme. */
  cuentaInicialId?: string | null;
  subcuentaInicialId?: string | null;
  /** 'vincular': solo asocia la cuenta a la habitación (sigue abierta en la mesa); 'cargar': la transfiere y cierra. */
  modo?: 'cargar' | 'vincular';
  /** Modo vincular, si ya tiene habitación: permite quitar el vínculo. */
  onQuitar?: () => void | Promise<void>;
}

// Página dentro del mismo sheet (mismo patrón que SidebarCambiarCliente y
// SidebarCobrarCuenta): elegir la habitación (y subcuenta) de una comanda, ya sea
// para cargarla o solo para vincularla. La escritura la resuelve quien la monta.
export function SidebarHabitacionDestino({ folio, cuentas, mesas, procesando, onConfirm, onBack, modo = 'cargar', onQuitar, cuentaInicialId, subcuentaInicialId }: SidebarHabitacionDestinoProps) {
  const vincular = modo === 'vincular';
  const inicial = cuentaInicialId && cuentas.some((c) => c.id === cuentaInicialId) ? cuentaInicialId : null;
  const [cuentaId, setCuentaId] = useState<string | null>(inicial);
  const [subcuentaId, setSubcuentaId] = useState<string | null>(
    inicial && cuentas.find((c) => c.id === inicial)?.subcuentas?.some((x: any) => x.id === subcuentaInicialId) ? (subcuentaInicialId ?? null) : null,
  );
  const cuentaSel = cuentas.find((c) => c.id === cuentaId);
  const subs = cuentaSel?.subcuentas ?? [];
  const titulo = 'text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground';

  return (
    <div className="h-full w-full bg-card flex flex-col overflow-hidden shadow-xl">
      <ReservaHeader
        tono="info"
        badge={<Bed size={22} weight="bold" />}
        titulo={vincular ? 'Vincular a habitación' : 'Cargar a habitación'}
        subtitulo={`Comanda #${folio}`}
        onBack={() => { if (!procesando) onBack(); }}
      />

      <main className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-6">
        <p className="text-sm text-muted-foreground leading-snug">
          {vincular
            ? 'Elige la habitación de esta cuenta. Seguirá abierta en la mesa y se enviará a la habitación cuando la cargues.'
            : 'Elige la habitación activa a la que se transferirá esta comanda.'}
        </p>

        <section className="flex flex-col gap-3">
          <h4 className={titulo}>Habitación</h4>
          <div className="flex flex-col gap-2">
            {cuentas.map((cuenta) => (
              <HabitacionOpcion
                key={cuenta.id}
                mesaNombre={mesas.find((m) => m.id === cuenta.mesa_id)?.nombre}
                huesped={cuenta.huesped}
                seleccionada={cuentaId === cuenta.id}
                tono="info"
                onSelect={() => { setCuentaId(cuenta.id); setSubcuentaId(null); }}
              />
            ))}
          </div>
        </section>

        {subs.length > 0 && (
          <section className="flex flex-col gap-3">
            <h4 className={titulo}>Cargar a la subcuenta</h4>
            <SubcuentaChips subcuentas={subs} value={subcuentaId} onChange={setSubcuentaId} nombrePrincipal={cuentaSel?.principal_nombre || 'Principal'} />
          </section>
        )}

      </main>

      <footer className="p-4 border-t border-border bg-muted/40 flex flex-col gap-2 shrink-0">
        <Button
          type="button"
          onClick={() => { if (cuentaId) onConfirm(cuentaId, subcuentaId); }}
          disabled={!cuentaId || procesando}
          className="h-12 w-full gap-2 font-bold bg-info text-white hover:bg-info/90">
          {procesando
            ? (<><CircleNotch size={18} className="animate-spin" /> {vincular ? 'Vinculando…' : 'Transfiriendo…'}</>)
            : (<><Bed size={18} weight="bold" /> {vincular ? 'Vincular' : 'Cargar a habitación'}</>)}
        </Button>
        {vincular && onQuitar && (
          <Button type="button" variant="dangerGhost" disabled={procesando} onClick={() => onQuitar()} className="w-full h-11 font-semibold">
            Quitar vínculo con la habitación
          </Button>
        )}
      </footer>
    </div>
  );
}
