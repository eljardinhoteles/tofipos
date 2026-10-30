import { useNavigate, useLocation } from 'react-router-dom';
import { SquaresFour, ForkKnife, CalendarStar, PresentationChart } from '@phosphor-icons/react';
import { HeaderTabs, HeaderTab } from './PageHeader';
import { usePermisos } from '../../hooks/usePermisos';

/** Secciones del header en PC: Mesas, Reservas, Planificador y Métricas (rutas aparte; en móvil no se muestran). */
export function SeccionesMesas() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const permisos = usePermisos();
  const secciones = [
    { to: '/v2/mesas', label: 'Mesas', icono: SquaresFour, visible: true },
    // Cubiertos y no calendario: así no se confunde con el módulo Hotel, que también tiene reservas y calendario.
    { to: '/v2/reservas', label: 'Reservas', icono: ForkKnife, visible: true },
    { to: '/v2/planificacion', label: 'Planificador', icono: CalendarStar, visible: true },
    { to: '/v2/metricas', label: 'Métricas', icono: PresentationChart, visible: permisos.verMetricas },
  ].filter((s) => s.visible);
  return (
    <HeaderTabs label="Secciones de Mesas">
      {secciones.map((s) => (
        <HeaderTab key={s.to} activa={pathname.startsWith(s.to)} icono={s.icono} onClick={() => navigate(s.to)}>{s.label}</HeaderTab>
      ))}
    </HeaderTabs>
  );
}
