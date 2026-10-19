import { useEffect, useState } from 'react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { showToast } from '@/lib/toast';
import { Girando } from '../Espera';
import {
  ajustarVentaPorCambioHotel, conciliarConCloudbedsHotel, revisarConCloudbedsHotel, type ReservaHotel, type ResultadoConciliacionCloudbeds,
} from '../../../lib/hotelReservasApi';
import { dinero } from './formatos';

interface Props {
  r: ReservaHotel;
  usuario?: string;
  onCancelar: () => void;
  onGuardado: (r: ReservaHotel) => void;
}

function Linea({ t, cb, pos }: { t: string; cb: number; pos: number }) {
  const distinto = Math.abs(cb - pos) >= 0.005;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-6 gap-y-0.5 t-cuerpo">
      <span className="text-muted-foreground">{t}</span>
      <span className="tabular-nums text-right w-20">{dinero(cb)}</span>
      <span className={distinto ? 'tabular-nums text-right w-20 text-warning-foreground t-cuerpo-fuerte' : 'tabular-nums text-right w-20'}>{dinero(pos)}</span>
    </div>
  );
}

/**
 * Compara cómo está compuesto el total en Cloudbeds (noches, extras cargados allá, impuestos) con lo que tiene el POS y,
 * si no coinciden, lo concilia: la estadía queda solo con las noches y lo demás pasa a extras «de Cloudbeds».
 */
export function EditorConciliacionCloudbeds({ r, usuario, onCancelar, onGuardado }: Props) {
  const [rev, setRev] = useState<ResultadoConciliacionCloudbeds | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    revisarConCloudbedsHotel(r)
      .then((x) => { if (vigente) setRev(x); })
      .catch((e) => { if (vigente) setError(e instanceof Error ? e.message : 'No se pudo consultar Cloudbeds'); });
    return () => { vigente = false; };
  }, [r]);

  const conciliar = async () => {
    setGuardando(true);
    setError('');
    try {
      const { reserva } = await conciliarConCloudbedsHotel(r, usuario);
      // La venta del Centro de Ventas acompaña el cambio de total, igual que al cambiar fechas o huéspedes.
      const aj = await ajustarVentaPorCambioHotel([r], 'Conciliación con los extras de Cloudbeds');
      showToast.success('Conciliada con Cloudbeds', aj !== 0 ? `Venta ajustada ${aj > 0 ? '+' : '−'}${dinero(Math.abs(aj))}.` : undefined);
      onGuardado(reserva);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conciliar');
    } finally {
      setGuardando(false);
    }
  };

  const extrasPos = r.extras.filter((e) => e.origen !== 'cloudbeds').reduce((a, e) => a + e.monto, 0);

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <span className="t-cuerpo-fuerte">Conciliar con Cloudbeds</span>
      {!rev && !error && <p className="t-meta text-muted-foreground flex items-center gap-2"><Girando /> Consultando Cloudbeds…</p>}
      {rev && (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 t-meta text-muted-foreground">
            <span />
            <span className="text-right w-20">Cloudbeds</span>
            <span className="text-right w-20">POS ahora</span>
          </div>
          <Linea t="Estadía (noches)" cb={rev.cloudbeds.hospedaje} pos={r.total_estadia} />
          <Linea t="Extras cargados en Cloudbeds" cb={rev.cloudbeds.extras + rev.cloudbeds.impuestos} pos={rev.extras.antes} />
          {extrasPos > 0 && <p className="t-meta text-muted-foreground">Además hay {dinero(extrasPos)} de extras vendidos en el POS, que no cambian.</p>}
          {r.tarifa_manual && <p className="t-meta text-muted-foreground">La tarifa de la estadía es manual ({dinero(r.total_estadia)}) y se conserva; solo se concilian los extras.</p>}
          {rev.cloudbeds.impuestos > 0 && <p className="t-meta text-muted-foreground">Incluye {dinero(rev.cloudbeds.impuestos)} de impuestos y cargos de Cloudbeds.</p>}
          {rev.hayCambios ? (
            <p className="t-meta text-warning-foreground flex items-start gap-1.5"><WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" /> El POS y Cloudbeds no coinciden. Al conciliar, la estadía pasa a {dinero(rev.estadia.despues)} y los extras de Cloudbeds a {dinero(rev.extras.despues)}.</p>
          ) : (
            <p className="t-meta text-success-foreground flex items-center gap-1.5"><CheckCircle size={16} weight="fill" className="shrink-0" /> Todo coincide con Cloudbeds.</p>
          )}
        </div>
      )}
      {error && <p role="alert" className="t-meta text-destructive rounded-xl bg-destructive-soft px-3 py-2">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Cerrar</Button>
        {rev?.hayCambios && (
          <Button type="button" className="h-11 gap-2" onClick={() => void conciliar()} disabled={guardando}>
            {guardando ? <><Girando /> Conciliando…</> : 'Conciliar'}
          </Button>
        )}
      </div>
    </div>
  );
}
