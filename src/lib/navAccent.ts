// Color de activo de la navegación (sobre el fondo oscuro del marco). Es el mismo para todos los
// módulos: el token `--nav-accent` del UI kit, así cambia junto con el tema. Se mantiene el mapa por
// ruta para que MainSidebarV2 y el menú móvil sigan leyendo `NAV_ACCENT[ruta]`; vive aquí (no en un
// componente) para no romper la recarga rápida de Vite.
const ACENTO = 'var(--nav-accent)';

export const NAV_ACCENT: Record<string, string> = {
  '/v2/mesas': ACENTO,
  '/v2/ordenes': ACENTO,
  '/v2/reservas': ACENTO,
  '/v2/hotel': ACENTO,
  '/v2/centro-ventas': ACENTO,
  '/v2/clientes': ACENTO,
  '/v2/menu': ACENTO,
  '/v2/metricas': ACENTO,
  '/v2/planificacion': ACENTO,
  '/v2/ajustes': ACENTO,
};
