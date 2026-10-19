import { useState } from 'react';
import dayjs from 'dayjs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EstadoBadge } from '../Common/EstadoBadge';
import { BannerEspera, Girando } from './Espera';
import { TONO_ESTADO, bloques } from '../../lib/hotelCalendarioCache';
import type { TarjetaCalendario } from '../../lib/cloudbeds';
import type { HabitacionHotel } from '../../lib/hotelHabitacionesApi';

interface Props {
  info: TarjetaCalendario | null;
  habitaciones: HabitacionHotel[];
  onClose: () => void;
  puedeGestionar: boolean;
  /** Enlaza la reserva de Cloudbeds con el POS para gestionarla desde aquí. Debe lanzar un error si no se pudo. */
  onAdoptar: (t: TarjetaCalendario) => Promise<void>;
  /** Elimina el bloqueo en Cloudbeds. Debe lanzar un error si no se pudo. */
  onEliminarBloqueo: (t: TarjetaCalendario) => Promise<void>;
}

/** Ficha de una reserva o bloqueo de Cloudbeds que no se gestiona todavía desde el POS. */
export function TarjetaInfoDialog({ info, habitaciones, onClose, puedeGestionar, onAdoptar, onEliminarBloqueo }: Props) {
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const cerrar = () => { if (!trabajando) { setConfirmarBorrado(false); onClose(); } };
  const correr = async (texto: string, fn: () => Promise<void>) => {
    setTrabajando(texto);
    try { await fn(); setConfirmarBorrado(false); onClose(); } catch { /* quien llama ya avisó del error */ } finally { setTrabajando(null); }
  };

  // Un bloqueo puede incluir varias cabañas (un solo bloqueo): eliminarlo las libera a todas.
  const cabanasDelBloqueo = info?.tipo === 'bloqueo'
    ? new Set([...bloques.values()].flatMap((b) => b.tarjetas).filter((t) => t.tipo === 'bloqueo' && t.id === info.id).map((t) => t.roomTypeID)).size
    : 0;

  // Una reserva de Cloudbeds con varias cabañas dentro aparece como una tarjeta en cada una (mismo código).
  const cabanasDeLaReserva = info?.tipo === 'reserva'
    ? new Set([...bloques.values()].flatMap((b) => b.tarjetas).filter((t) => t.tipo === 'reserva' && t.id === info.id).map((t) => t.roomTypeID)).size
    : 0;
  const esDeVariasCabanas = cabanasDeLaReserva > 1;

  return (
    <Dialog open={info !== null} onOpenChange={(o) => { if (!o) cerrar(); }}>
      <DialogContent className="max-w-sm">
        {info && (
          <>
            <DialogHeader>
              <DialogTitle className="t-titulo">{info.tipo === 'bloqueo' ? `Bloqueo · ${info.nombre}` : info.nombre}</DialogTitle>
              <DialogDescription className="t-meta flex flex-wrap items-center gap-2">
                {info.tipo === 'bloqueo' ? <EstadoBadge tono="neutral">Bloqueo de habitación</EstadoBadge> : (
                  <EstadoBadge tono={TONO_ESTADO[info.estado ?? '']?.tono ?? 'info'}>{TONO_ESTADO[info.estado ?? '']?.texto ?? info.estado}</EstadoBadge>
                )}
              </DialogDescription>
            </DialogHeader>

            {trabajando && <BannerEspera texto={trabajando} detalle="No cierres esta ventana" />}

            <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-border bg-card p-4">
              <Dato t="Llegada" v={dayjs(info.desde).format('DD/MM/YYYY')} />
              <Dato t="Salida" v={dayjs(info.hasta).format('DD/MM/YYYY')} />
              <Dato t="Cabaña" v={habitaciones.find((h) => h.cloudbeds_room_type_id === info.roomTypeID)?.nombre ?? '—'} />
              {info.fuente && <Dato t="Fuente" v={info.fuente} />}
              {info.saldo != null && info.tipo === 'reserva' && <Dato t="Saldo en Cloudbeds" v={`$${info.saldo.toFixed(2)}`} />}
              {info.tipo === 'reserva' && <Dato t="Código" v={info.id} />}
              {esDeVariasCabanas && <Dato t="Cabañas en esta reserva" v={String(cabanasDeLaReserva)} />}
              {info.tipo === 'bloqueo' && cabanasDelBloqueo > 1 && <Dato t="Cabañas en este bloqueo" v={String(cabanasDelBloqueo)} />}
            </div>

            {info.tipo === 'reserva' && esDeVariasCabanas && (
              <p className="t-meta rounded-2xl bg-muted text-muted-foreground px-3 py-2">
                Es una sola reserva de Cloudbeds que incluye {cabanasDeLaReserva} cabañas. Se gestiona en Cloudbeds: el POS maneja una cabaña por reserva y cancelarla allá cancela todo el grupo.
              </p>
            )}

            {info.tipo === 'reserva' && !esDeVariasCabanas && (
              <>
                <p className="t-meta text-muted-foreground">
                  Esta reserva está en Cloudbeds y no se creó desde el POS. Al enlazarla se concilia con su venta del Centro de Ventas y con la ficha del cliente; después podrás añadir extras y fijar una tarifa manual desde aquí. No se cambia nada en Cloudbeds.
                </p>
                {puedeGestionar && (
                  <div className="flex justify-end">
                    <Button type="button" onClick={() => void correr('Consultando la reserva en Cloudbeds…', () => onAdoptar(info))} disabled={!!trabajando} className="gap-2">
                      {trabajando ? <Girando /> : null} Gestionar desde el POS
                    </Button>
                  </div>
                )}
              </>
            )}

            {info.tipo === 'bloqueo' && puedeGestionar && (
              confirmarBorrado ? (
                <div className="flex flex-col gap-3 rounded-2xl bg-destructive-soft p-4">
                  <span className="t-cuerpo-fuerte text-destructive">
                    ¿Eliminar este bloqueo{cabanasDelBloqueo > 1 ? ` (se liberan ${cabanasDelBloqueo} cabañas)` : ''}?
                  </span>
                  <span className="t-meta text-destructive">Las fechas quedarán disponibles para reservar en todos los canales.</span>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setConfirmarBorrado(false)} disabled={!!trabajando}>No</Button>
                    <Button type="button" onClick={() => void correr('Eliminando el bloqueo en Cloudbeds…', () => onEliminarBloqueo(info))} disabled={!!trabajando} className="gap-2 bg-destructive text-white hover:bg-destructive/90">
                      {trabajando ? <Girando /> : null} Sí, eliminar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={() => setConfirmarBorrado(true)} className="text-destructive">Eliminar bloqueo</Button>
                </div>
              )
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="t-etiqueta text-muted-foreground">{t}</span>
      <span className="t-fila break-words">{v}</span>
    </div>
  );
}
