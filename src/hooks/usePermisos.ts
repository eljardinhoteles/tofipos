import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

// Permisos por rol. El rol sale del usuario que entró con su PIN (currentMesero),
// NO de la sesión de Supabase del dispositivo: esa sesión es la del administrador
// que vinculó el equipo y sigue abierta mientras trabajan meseros y cajeros.
//
// Matriz (el administrador puede todo):
//   mesero  → todo menos Métricas y Ajustes; Productos y Planificador solo lectura.
//   cajero  → todo menos Métricas; Productos solo lectura; en Ajustes solo Impresión.

export type Rol = 'admin' | 'cajero' | 'mesero';

export const ROL_LABELS: Record<Rol, string> = {
  admin: 'Administrador',
  cajero: 'Cajero',
  mesero: 'Mesero',
};

// Texto para el formulario de usuarios: qué puede hacer cada rol (mantener igual a la matriz de arriba).
export const ROL_DESCRIPCION: Record<Rol, { puede: string; noPuede: string }> = {
  admin: {
    puede: 'Acceso total: todos los módulos, métricas, ajustes y gestión de usuarios.',
    noPuede: '',
  },
  cajero: {
    puede: 'Mesas, órdenes, reservas, clientes y ventas (cobros y cierre de turno). Ve productos y edita el planificador. En ajustes solo configura la impresión.',
    noPuede: 'No ve métricas, no edita productos ni usuarios y no cambia el resto de los ajustes.',
  },
  mesero: {
    puede: 'Mesas, órdenes, reservas, clientes y ventas. Ve productos y el planificador.',
    noPuede: 'No edita productos ni el planificador, no ve métricas y no entra a ajustes.',
  },
};

export type SeccionAjustes = 'organizacion' | 'metodos-pago' | 'impresion' | 'iva' | 'planificador';

export interface Permisos {
  rol: Rol;
  esAdmin: boolean;
  verMetricas: boolean;
  verAjustes: boolean;
  seccionesAjustes: readonly SeccionAjustes[] | 'todas';
  editarProductos: boolean;
  editarPlanificador: boolean;
  // Crear, cambiar y cancelar reservas de hotel (Cloudbeds): admin y cajero. El mesero solo las ve.
  gestionarHotel: boolean;
}

const TODAS = 'todas' as const;

export function rolDe(usuario: { rol?: string | null } | null | undefined): Rol {
  // Sin usuario con PIN aún no se ha entrado a la app (pantalla de login).
  if (!usuario) return 'admin';
  const r = usuario.rol;
  // Un rol desconocido recibe el mínimo de permisos.
  return r === 'admin' || r === 'cajero' ? r : 'mesero';
}

export function permisosDe(rol: Rol): Permisos {
  const esAdmin = rol === 'admin';
  return {
    rol,
    esAdmin,
    verMetricas: esAdmin,
    verAjustes: rol !== 'mesero',
    seccionesAjustes: esAdmin ? TODAS : rol === 'cajero' ? ['impresion'] : [],
    editarProductos: esAdmin,
    editarPlanificador: rol !== 'mesero',
    gestionarHotel: rol !== 'mesero',
  };
}

export function puedeVerSeccion(p: Permisos, seccion: SeccionAjustes): boolean {
  return p.seccionesAjustes === TODAS || p.seccionesAjustes.includes(seccion);
}

// Módulos con acceso restringido (por URL o menú). Los que no aparecen aquí son para todos.
export function rutaPermitida(p: Permisos, path: string): boolean {
  if (path.startsWith('/v2/metricas')) return p.verMetricas;
  if (path.startsWith('/v2/ajustes')) return p.verAjustes;
  return true;
}

export function usePermisos(): Permisos {
  const { currentMesero } = useAuth();
  const rol = rolDe(currentMesero as { rol?: string } | null);
  return useMemo(() => permisosDe(rol), [rol]);
}
