import dayjs from 'dayjs';
import { ArrowsClockwise, ArrowsLeftRight, Bed, Broadcast, CheckCircle, CloudArrowUp, CloudCheck, PlugsConnected, WarningCircle, XCircle, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EstadoBadge, type TonoEstado } from '../Common/EstadoBadge';
import { Girando } from './Espera';
import { hace } from '../../lib/hotelCalendarioCache';
import type { SaludResp } from '../../lib/cloudbeds';
import { ConexionCloudbeds } from './ConexionCloudbeds';

interface Props {
  salud: SaludResp | null;
  /** Hora de la última comprobación (ms). */
  ahora: number;
  /** El Worker mismo no respondió (sin red, sesión vencida…). */
  error: string;
  comprobando: boolean;
  onComprobar: () => void;
  pendientes: number;
  divergentes: number;
  sinEnlazar: number;
  /** Solo administradores: muestra la gestión de la API key de Cloudbeds de esta organización. */
  puedeConfigurar?: boolean;
  /** Lleva a la lista de reservas ya filtrada (por sincronizar o por revisar) o a Habitaciones. */
  onIrA: (destino: 'pendientes' | 'revisar' | 'habitaciones') => void;
}

type Nivel = 'ok' | 'aviso' | 'mal';

// Un nivel = un color en toda la sección (el mismo del resplandor del header): verde, naranja o rojo.
const TONO: Record<Nivel, { badge: TonoEstado; caja: string; borde: string; etiqueta: string }> = {
  ok: { badge: 'success', caja: 'bg-success-soft text-success-foreground', borde: 'border-border', etiqueta: 'Correcto' },
  aviso: { badge: 'warning', caja: 'bg-warning-soft text-warning-foreground', borde: 'border-warning/40', etiqueta: 'Revisar' },
  mal: { badge: 'destructive', caja: 'bg-destructive-soft text-destructive', borde: 'border-destructive/40', etiqueta: 'Falla' },
};
const ICONO_NIVEL: Record<Nivel, Icon> = { ok: CheckCircle, aviso: WarningCircle, mal: XCircle };

/** Un aviso sin actividad en más de un día es raro (aunque no entren reservas, hay movimientos): se señala. */
const AVISO_VIEJO_MS = 24 * 3600_000;

interface Dato { icono: Icon; titulo: string; nivel: Nivel; valor: string; detalle: string }

/**
 * Salud de la integración con Cloudbeds: un resumen arriba (verde, naranja o rojo) con su botón de comprobar, las tres
 * conexiones que sostienen la integración, y las cosas que requieren una acción con su botón «Ver».
 */
export function EstadoIntegracion({ salud, ahora, error, comprobando, onComprobar, pendientes, divergentes, sinEnlazar, puedeConfigurar, onIrA }: Props) {
  const ultimo = salud?.ultimoAvisoWebhook ?? null;
  const antiguoAviso = ultimo !== null && ahora - ultimo > AVISO_VIEJO_MS;
  const sync = salud?.sincronizacion;

  // ---- Conexiones ----
  const conexion: Dato = error
    ? { icono: PlugsConnected, titulo: 'Servidor del POS', nivel: 'mal', valor: 'No responde', detalle: error }
    : !salud
      ? { icono: PlugsConnected, titulo: 'Cloudbeds', nivel: 'aviso', valor: 'Comprobando…', detalle: 'Un momento' }
      : salud.cloudbeds.ok
        ? { icono: PlugsConnected, titulo: 'Cloudbeds', nivel: 'ok', valor: 'Conectado', detalle: `${salud.cloudbeds.propiedad ?? 'Propiedad'} · responde en ${salud.cloudbeds.ms} ms` }
        : { icono: PlugsConnected, titulo: 'Cloudbeds', nivel: 'mal', valor: 'Sin conexión', detalle: `${salud.cloudbeds.error ?? 'Falló'}. Si dice que la clave no es válida, hay que generar una nueva (caduca tras 30 días sin uso).` };

  const avisos: Dato = salud === null
    ? { icono: Broadcast, titulo: 'Avisos en vivo', nivel: 'aviso', valor: 'Sin datos', detalle: 'Todavía no se ha comprobado' }
    : ultimo === null
      ? { icono: Broadcast, titulo: 'Avisos en vivo', nivel: 'aviso', valor: 'Ninguno aún', detalle: 'No ha llegado ningún aviso desde que se activaron' }
      : {
        icono: Broadcast, titulo: 'Avisos en vivo', nivel: antiguoAviso ? 'aviso' : 'ok', valor: `Hace ${hace(ahora - ultimo)}`,
        detalle: antiguoAviso ? `Último el ${dayjs(ultimo).format('DD/MM HH:mm')}. Llevan más de un día sin llegar: revisa que los webhooks sigan activos` : `Último aviso de Cloudbeds el ${dayjs(ultimo).format('DD/MM HH:mm')}`,
      };

  const ronda = sync?.ultima;
  const cambiosRonda = ronda ? ronda.creada + ronda.cancelada + ronda.cambiada + ronda.enlazada : 0;
  const sincro: Dato = !salud
    ? { icono: CloudCheck, titulo: 'Sincronización automática', nivel: 'aviso', valor: 'Sin datos', detalle: 'Todavía no se ha comprobado' }
    : sync === undefined
      ? { icono: CloudCheck, titulo: 'Sincronización automática', nivel: 'aviso', valor: 'No disponible', detalle: 'El servidor es una versión anterior: falta desplegar la nueva' }
      : !sync.activa
        ? { icono: CloudCheck, titulo: 'Sincronización automática', nivel: 'aviso', valor: 'Inactiva', detalle: 'Falta la clave de servicio de Supabase en el servidor: las reservas de otros canales y los cambios hechos en Cloudbeds no entran solos' }
        : !ronda
          ? { icono: CloudCheck, titulo: 'Sincronización automática', nivel: 'ok', valor: 'Activa', detalle: 'Aún no ha corrido ninguna ronda (se revisa cada 5 minutos)' }
          : {
            icono: CloudCheck, titulo: 'Sincronización automática', nivel: ronda.errores > 0 ? 'aviso' : 'ok', valor: 'Activa',
            detalle: `Última ronda hace ${hace(ahora - ronda.t)} · ${cambiosRonda === 0 ? 'sin cambios' : `${cambiosRonda} ${cambiosRonda === 1 ? 'cambio aplicado' : 'cambios aplicados'}`}${ronda.errores > 0 ? ` · ${ronda.errores} con error` : ''}`,
          };
  const conexiones = [conexion, avisos, sincro];

  // ---- Para revisar ----
  const tareas: Array<{ icono: Icon; titulo: string; ayuda: string; n: number; ok: string; ir: () => void }> = [
    { icono: CloudArrowUp, titulo: 'Reservas sin subir', n: pendientes, ok: 'Todas están en Cloudbeds', ir: () => onIrA('pendientes'), ayuda: 'Se reintentan solas cada minuto; mientras tanto la habitación sigue libre en Cloudbeds.' },
    { icono: ArrowsLeftRight, titulo: 'Cambiaron en Cloudbeds', n: divergentes, ok: 'Todas coinciden con el POS', ir: () => onIrA('revisar'), ayuda: 'Se cancelaron o cambiaron allá y no coinciden con el POS.' },
    { icono: Bed, titulo: 'Habitaciones sin enlazar', n: sinEnlazar, ok: 'Todas enlazadas', ir: () => onIrA('habitaciones'), ayuda: 'No se pueden reservar hasta enlazarlas con su tipo de Cloudbeds.' },
  ];

  // ---- Resumen ----
  const hayMal = conexiones.some((c) => c.nivel === 'mal');
  const nTareas = tareas.filter((t) => t.n > 0).length;
  const nAvisos = conexiones.filter((c) => c.nivel === 'aviso').length + nTareas;
  const global: Nivel = hayMal ? 'mal' : nAvisos > 0 ? 'aviso' : 'ok';
  // La primera comprobación aún no terminó: no se alarma con avisos que son solo «sin datos todavía».
  const inicial = !salud && !error;
  const IconoGlobal = ICONO_NIVEL[global];
  const titulo = inicial ? 'Comprobando la conexión…' : global === 'mal' ? (error ? 'No se pudo comprobar la conexión' : 'Cloudbeds no responde') : global === 'aviso' ? (nAvisos === 1 ? 'Hay 1 cosa por revisar' : `Hay ${nAvisos} cosas por revisar`) : 'Todo funciona correctamente';
  const subtitulo = comprobando ? 'Comprobando…' : salud ? `Comprobado a las ${dayjs(ahora).format('HH:mm')} · se repite cada 5 minutos` : 'Comprobando la conexión…';

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-5xl w-full mx-auto">
      <section className={cn('flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5', inicial ? 'border-border' : TONO[global].borde)} aria-live="polite">
        <span className={cn('size-14 shrink-0 rounded-2xl flex items-center justify-center', inicial ? 'bg-muted text-muted-foreground' : TONO[global].caja)}>
          {inicial ? <Girando size={30} /> : <IconoGlobal size={30} weight="fill" aria-hidden />}
        </span>
        <div className="flex flex-col min-w-0 grow">
          <h2 className="t-titulo">{titulo}</h2>
          <p className="t-cuerpo text-muted-foreground">{subtitulo}</p>
        </div>
        <Button type="button" variant="outline" onClick={onComprobar} disabled={comprobando} className="gap-2 shrink-0">
          {comprobando ? <Girando /> : <ArrowsClockwise size={16} weight="bold" />} Comprobar ahora
        </Button>
      </section>

      <section className="flex flex-col gap-3" aria-label="Conexiones">
        <h3 className="t-etiqueta text-muted-foreground">Conexiones</h3>
        <ul className="grid gap-3 grid-cols-1 lg:grid-cols-3">
          {conexiones.map((c) => (
            <li key={c.titulo} className={cn('flex flex-col gap-3 rounded-2xl border bg-card p-4', TONO[c.nivel].borde)}>
              <div className="flex items-center gap-3">
                <span className={cn('size-10 shrink-0 rounded-xl flex items-center justify-center', TONO[c.nivel].caja)}><c.icono size={20} weight="bold" aria-hidden /></span>
                <span className="t-etiqueta text-muted-foreground grow min-w-0">{c.titulo}</span>
                <EstadoBadge tono={TONO[c.nivel].badge}>{TONO[c.nivel].etiqueta}</EstadoBadge>
              </div>
              <span className="t-valor">{c.valor}</span>
              <span className="t-meta text-muted-foreground">{c.detalle}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-label="Para revisar">
        <h3 className="t-etiqueta text-muted-foreground">Para revisar</h3>
        <ul className="grid gap-3 grid-cols-1 lg:grid-cols-3">
          {tareas.map((t) => {
            const pendiente = t.n > 0;
            return (
              <li key={t.titulo} className={cn('flex flex-col gap-3 rounded-2xl border bg-card p-4', pendiente ? TONO.aviso.borde : 'border-border')}>
                <div className="flex items-center gap-3">
                  <span className={cn('size-10 shrink-0 rounded-xl flex items-center justify-center', pendiente ? TONO.aviso.caja : 'bg-muted text-muted-foreground')}><t.icono size={20} weight="bold" aria-hidden /></span>
                  <span className="t-cuerpo-fuerte grow min-w-0">{t.titulo}</span>
                </div>
                {pendiente ? (
                  <>
                    <span className="t-cifra tabular-nums">{t.n}</span>
                    <span className="t-meta text-muted-foreground grow">{t.ayuda}</span>
                    <Button type="button" variant="outline" onClick={t.ir} className="self-start">Ver</Button>
                  </>
                ) : (
                  <span className="t-cuerpo text-success-foreground flex items-center gap-1.5"><CheckCircle size={18} weight="fill" aria-hidden /> {t.ok}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {puedeConfigurar && <ConexionCloudbeds onCambio={onComprobar} />}
    </div>
  );
}
