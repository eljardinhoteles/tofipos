import { useNavigate, useLocation } from 'react-router-dom';
import { SquaresFour, CalendarStar, PresentationChart } from '@phosphor-icons/react';
import { HeaderTabs, HeaderTab } from './PageHeader';
import { usePermisos } from '../../hooks/usePermisos';

/** Secciones del header en PC: Mesas, Planificador y Métricas (rutas aparte; en móvil no se muestran). */
export function SeccionesMesas() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const permisos = usePermisos();
  const secciones = [
    { to: '/v2/mesas', label: 'Mesas', icono: SquaresFour, visible: true },
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
