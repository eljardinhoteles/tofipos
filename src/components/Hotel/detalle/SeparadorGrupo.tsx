import { useState } from 'react';
import { UsersThree } from '@phosphor-icons/react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { showToast } from '@/lib/toast';
import { Girando } from '../Espera';
import { getReservaCloudbeds } from '../../../lib/cloudbeds';
import { evaluarConversionGrupo, type EvaluacionConversion } from '../../../lib/hotelConversionGrupo';
import type { HabitacionHotel } from '../../../lib/hotelHabitacionesApi';
import { separarGrupoAdoptado, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { Seccion } from './comunes';
import { plural } from './formatos';

interface Props {
  /** Habitaciones vigentes del grupo (adoptado de Cloudbeds). */
  grupo: ReservaHotel[];
  habitaciones: HabitacionHotel[];
  usuario?: string;
  onHecho: (reservas: ReservaHotel[]) => void;
}

/**
 * Separar un grupo adoptado en reservas individuales. Las filas del POS (con su venta, cliente, extras y tarifas) se conservan: el grupo
 * original se cancela en Cloudbeds y cada habitación se vuelve a crear allá como reserva propia, enlazada a la misma venta.
 */
export function SeparadorGrupo({ grupo, habitaciones, usuario, onHecho }: Props) {
  const [revisando, setRevisando] = useState(false);
  const [separando, setSeparando] = useState(false);
  const [evaluacion, setEvaluacion] = useState<EvaluacionConversion | null>(null);
  const ref = grupo[0]?.cloudbeds_grupo_ref;

  const revisar = async () => {
    if (!ref) return;
    setRevisando(true);
    try {
      // Se lee el grupo en Cloudbeds para comprobar que se puede cancelar (canal externo, fecha pasada, habitaciones sin enlazar…).
      const det = await getReservaCloudbeds(ref);
      setEvaluacion(evaluarConversionGrupo(det, habitaciones));
    } catch (e) {
      showToast.fallo('revisar el grupo en Cloudbeds', e);
    } finally {
      setRevisando(false);
    }
  };

  const separar = async () => {
    setSeparando(true);
    try {
      const reservas = await separarGrupoAdoptado(grupo, usuario);
      setEvaluacion(null);
      showToast.success('Grupo separado', `${plural(reservas.length, 'reserva', 'reservas')} individuales, con la misma venta.`);
      onHecho(reservas);
    } catch (e) {
      showToast.fallo('separar el grupo', e);
    } finally {
      setSeparando(false);
    }
  };

  if (!ref || grupo.length < 2) return null;
  return (
    <Seccion icono={UsersThree} color="info" titulo="Separar el grupo">
      <p className="t-meta text-muted-foreground">
        Hoy el grupo es una sola reserva en Cloudbeds y aquí solo se gestiona. Separarlo la cancela allá y crea una reserva por habitación, para poder cambiar fechas,
        personas o cancelar una sola. Conservas la venta, el cliente, los extras y las tarifas.
      </p>
      <Button type="button" variant="outline" className="h-11 self-start" onClick={() => void revisar()} disabled={revisando || separando}>
        {revisando ? <><Girando /> Revisando…</> : 'Separar en reservas individuales'}
      </Button>

      <AlertDialog open={!!evaluacion} onOpenChange={(o) => { if (!o && !separando) setEvaluacion(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{evaluacion?.convertible ? '¿Separar el grupo?' : 'No se puede separar este grupo'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                {evaluacion && evaluacion.bloqueos.length > 0 && (
                  <ul className="list-disc pl-5 text-destructive flex flex-col gap-0.5">{evaluacion.bloqueos.map((b) => <li key={b}>{b}</li>)}</ul>
                )}
                {evaluacion?.convertible && (
                  <>
                    <span>Se cancela la reserva <b>{ref}</b> en Cloudbeds y se crean {plural(grupo.length, 'reserva nueva', 'reservas nuevas')}, una por habitación. Si Cloudbeds rechaza alguna, se restaura el grupo original y no cambia nada.</span>
                    <ul className="list-disc pl-5 text-muted-foreground flex flex-col gap-0.5">
                      {evaluacion.avisos.filter((a) => /pagados/.test(a)).map((a) => <li key={a}>{a}</li>)}
                      <li>Cloudbeds crea cada habitación con su tarifa estándar; el precio pactado queda como tarifa manual del POS.</li>
                      <li>Las notas de la reserva original en Cloudbeds no se copian.</li>
                    </ul>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={separando}>{evaluacion?.convertible ? 'Cancelar' : 'Cerrar'}</AlertDialogCancel>
            {evaluacion?.convertible && (
              <AlertDialogAction disabled={separando} onClick={(e) => { e.preventDefault(); void separar(); }}>{separando ? 'Separando…' : 'Separar grupo'}</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Seccion>
  );
}
