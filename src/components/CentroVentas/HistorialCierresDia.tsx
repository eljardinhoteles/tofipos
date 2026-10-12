import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { useState } from 'react';
import { FileText, LockSimple } from '@phosphor-icons/react';
import { CierreReporteVista } from './CierreReporteVista';
import { Button } from '@/components/ui/button';
import { useCierresDelDia } from '../../hooks/useCierresDelDia';
import { METODO_TITULO, ORIGEN_CIERRE_TITULO, type CierreTurno } from '../../lib/cierreTurno';

interface HistorialCierresDiaProps {
  fechaLarga: string;
  /** Día de caja, AAAA-MM-DD. */
  fechaDia: string;
}

const dinero = (n: number) => `$${n.toFixed(2)}`;

/** Tarjetas de los cierres guardados (o el estado vacío si aún no hay ninguno). */
export function ListaCierres({ cierres, cargando = false, error = null, vacio, onVerReporte }: { cierres: CierreTurno[]; cargando?: boolean; error?: string | null; vacio: React.ReactNode; onVerReporte: (c: CierreTurno) => void }) {
  if (cargando && cierres.length === 0) return <p className="t-meta text-muted-foreground py-8 text-center">Cargando cierres…</p>;
  if (error) return <p className="t-meta text-destructive py-8 text-center">No se pudieron cargar los cierres. Revisa tu conexión a internet.</p>;
  if (cierres.length === 0) return <>{vacio}</>;
  return (
    <>
      {cierres.map(c => (
              <section key={c.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex flex-col">
                    <span className="t-cuerpo-fuerte text-secondary-foreground">Cierre de las {dayjs(c.fecha_cierre).format('HH:mm')}</span>
                    <span className="t-meta text-muted-foreground truncate">
                      Cerrado por {c.usuario_nombre}{c.origenes.length > 0 ? ` · ${c.origenes.map(o => ORIGEN_CIERRE_TITULO[o] ?? o).join(', ')}` : ''}
                    </span>
                  </div>
                  <span className="t-valor tabular-nums text-foreground shrink-0">{dinero(c.total_cobrado)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {(['efectivo', 'tarjeta', 'transferencia', 'otros'] as const).filter(m => c.pagos[m] > 0).map(m => (
                    <div key={m} className="flex items-baseline gap-2">
                      <span className="t-cuerpo text-muted-foreground">{METODO_TITULO[m]}</span>
                      <span className="flex-1 border-b border-dotted border-border" />
                      <span className="t-cuerpo-fuerte tabular-nums text-foreground">{dinero(c.pagos[m])}</span>
                    </div>
                  ))}
                  {c.total_reembolsado > 0 && (
                    <div className="flex items-baseline gap-2">
                      <span className="t-cuerpo text-muted-foreground">Reembolsos</span>
                      <span className="flex-1 border-b border-dotted border-border" />
                      <span className="t-cuerpo-fuerte tabular-nums text-foreground">{dinero(c.total_reembolsado)}</span>
                    </div>
                  )}
                </div>
                <Button type="button" variant="outline" className="self-end gap-1.5" onClick={() => onVerReporte(c)}>
                  <FileText size={16} weight="bold" /> Ver reporte
                </Button>
                {c.novedades?.trim() && (
                  <p className="t-meta text-muted-foreground whitespace-pre-wrap rounded-2xl bg-muted/40 p-3">{c.novedades}</p>
                )}
              </section>
      ))}
    </>
  );
}

/** Días anteriores: no se cierra turno, solo se consultan los cierres que se hicieron ese día. */
export function HistorialCierresDia({ fechaLarga, fechaDia }: HistorialCierresDiaProps) {
  const { cierres, cargando, error } = useCierresDelDia(fechaDia);
  const [reporte, setReporte] = useState<CierreTurno | null>(null);
  if (reporte) return <CierreReporteVista cierre={reporte} onVolver={() => setReporte(null)} />;
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-16 px-6 border-b border-border bg-card flex flex-col justify-center shrink-0 min-w-0">
        <span className="t-titulo text-secondary-foreground truncate">Cierres del día</span>
        <span className="t-meta text-muted-foreground truncate capitalize">{fechaLarga}</span>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="mx-auto w-full max-w-3xl p-6 flex flex-col gap-4">
          <ListaCierres cierres={cierres} cargando={cargando} error={error} onVerReporte={setReporte} vacio={
            <div className="flex flex-col items-center gap-2 text-center py-16">
              <LockSimple size={32} className="text-muted-foreground" />
              <span className="t-titulo text-secondary-foreground">Sin cierres este día</span>
              <p className="t-meta text-muted-foreground max-w-sm">
                Los cierres de turno solo se hacen en el día en curso. Aquí se consultan los que se guardaron en esta fecha.
              </p>
            </div>
          } />
        </div>
      </div>
    </div>
  );
}
