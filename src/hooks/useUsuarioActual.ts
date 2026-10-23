import { useAuth } from '../context/AuthContext';

/**
 * Quien está operando: el usuario local (PIN) y, si no hay, el administrador de la sesión. Es el mismo criterio del Centro de Ventas
 * para firmar los movimientos, así que lo registrado desde otros módulos (Hotel…) sale con su autor.
 */
export function useUsuarioActual(): { id?: string; nombre?: string } {
  const { currentMesero, adminUser } = useAuth();
  return {
    id: currentMesero?.id || adminUser?.id,
    nombre: currentMesero?.nombre || adminUser?.user_metadata?.full_name || adminUser?.email?.split('@')[0] || undefined,
  };
}
