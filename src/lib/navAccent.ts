// Color de activo por módulo (claro, pensado para el fondo oscuro del marco). Es
// identidad de navegación: no sustituye a los colores semánticos. Lo comparten el
// sidebar de PC y el menú móvil; vive aquí (no en un componente) para no romper
// la recarga rápida de Vite.
export const NAV_ACCENT: Record<string, string> = {
  '/v2/mesas': 'oklch(0.82 0.15 160)',
  '/v2/ordenes': 'oklch(0.82 0.14 65)',
  '/v2/reservas': 'oklch(0.8 0.12 240)',
  '/v2/centro-ventas': 'oklch(0.88 0.15 110)',
  '/v2/clientes': 'oklch(0.8 0.13 350)',
  '/v2/menu': 'oklch(0.78 0.13 300)',
  '/v2/metricas': 'oklch(0.83 0.11 205)',
  '/v2/ajustes': 'oklch(0.9 0.01 160)',
};
