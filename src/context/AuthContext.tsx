import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, createVerificationClient } from '../lib/supabase';
import type { UsuarioLocal } from '../db/database';
import { initVerticalRxDb, resetLocalDatabase } from '../db/rxdb';
import { cacheCredential, verifyCachedCredential, hasCachedCredential, clearAuthCache } from '../lib/authCache';

interface AuthContextType {
  // Estado de Administrador de Supabase
  adminUser: User | null;
  adminSession: Session | null;
  isAdminConfigured: boolean; // Si hay admin logueado y organización seleccionada
  activeOrganizationId: string | null;

  // Estado de Mesero / Usuario Local (Offline)
  currentMesero: UsuarioLocal | null;
  isAuthenticated: boolean; // Si hay un mesero activo operando la app

  // Operaciones
  loginAdmin: (email: string, password: string) => Promise<{ error: any }>;
  logoutAdmin: () => Promise<{ error: any }>;
  vincularOrganizacion: (orgId: string) => Promise<void>;
  desvincularDispositivo: () => void;
  loginConPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logoutMesero: () => void;
  fetchOrganizacionesAdmin: () => Promise<Array<{ id: string; nombre: string }>>;

  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Administrador
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [adminSession, setAdminSession] = useState<Session | null>(null);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(
    () => localStorage.getItem('pos_active_org_id')
  );

  // Mesero Local
  const [currentMesero, setCurrentMesero] = useState<UsuarioLocal | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Obtener la sesión inicial de Supabase (Admin)
    const getInitialSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        setAdminSession(initialSession);
        setAdminUser(initialSession?.user ?? null);
      } catch (err) {
        console.error('Error al recuperar sesión inicial de Supabase:', err);
      } finally {
        setIsLoading(false);
      }
    };

    getInitialSession();

    // 2. Escuchar cambios de autenticación de Supabase
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!alive) return;
      setAdminSession(currentSession);
      setAdminUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    // 3. Recuperar el mesero activo de la sesión actual
    const savedMeseroId = localStorage.getItem('pos_current_mesero_id');
    if (savedMeseroId) {
      initVerticalRxDb().then(async rxDb => {
        const mesero = await rxDb.usuarios.findOne(savedMeseroId).exec();
        if (!alive) return;
        if (mesero && mesero.toJSON().activo) {
          setCurrentMesero(mesero.toJSON() as UsuarioLocal);
        } else {
          localStorage.removeItem('pos_current_mesero_id');
        }
      }).catch(err => {
        console.error('Error al cargar mesero persistido:', err);
      });
    }

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!activeOrganizationId || currentMesero) return;

    const savedMeseroId = localStorage.getItem('pos_current_mesero_id');
    const hasOfflineAuth = localStorage.getItem('pos_offline_auth') === 'true';
    if (!savedMeseroId || !hasOfflineAuth) return;

    initVerticalRxDb().then(async rxDb => {
      const mesero = await rxDb.usuarios.findOne(savedMeseroId).exec();
      if (!alive) return;
      if (mesero && mesero.toJSON().activo) {
        setCurrentMesero(mesero.toJSON() as UsuarioLocal);
      } else {
        localStorage.removeItem('pos_current_mesero_id');
        localStorage.removeItem('pos_offline_auth');
      }
    }).catch(err => {
      console.error('Error al restaurar mesero local:', err);
    });

    return () => { alive = false; };
  }, [activeOrganizationId, currentMesero]);

  // Bootstrap: si el admin del dispositivo aún no tiene perfil en `usuarios`
  // (p. ej. dispositivos vinculados antes de la migración a Supabase Auth),
  // lo crea vía Edge Function. Idempotente y silencioso.
  useEffect(() => {
    if (!adminUser || !activeOrganizationId || !navigator.onLine) return;
    supabase.functions.invoke('manage-users', {
      body: { action: 'ensure-self', organization_id: activeOrganizationId }
    }).catch(err => console.warn('ensure-self falló:', err));
  }, [adminUser, activeOrganizationId]);

  const loginAdmin = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      setAdminSession(data.session);
      setAdminUser(data.user);
      localStorage.setItem('pos_admin_email', data.user?.email || email);
      return { error: null };
    } catch (error: any) {
      console.error('Error al iniciar sesión admin:', error.message || error);
      return { error };
    }
  };

  const logoutAdmin = async () => {
    try {
      await supabase.auth.signOut();
      desvincularDispositivo();
      localStorage.removeItem('pos_admin_email');
      return { error: null };
    } catch (error: any) {
      console.error('Error al cerrar sesión admin:', error.message || error);
      return { error };
    }
  };

  const vincularOrganizacion = async (orgId: string): Promise<void> => {
    const currentOrgId = localStorage.getItem('pos_active_org_id');
    if (currentOrgId && currentOrgId !== orgId) {
      localStorage.removeItem('pos_current_mesero_id');
      localStorage.removeItem('pos_offline_auth');
      setCurrentMesero(null);
    }
    localStorage.setItem('pos_active_org_id', orgId);
    setActiveOrganizationId(orgId);

    // Bootstrap: garantiza que el admin que vincula tenga perfil en `usuarios`
    // (solo se auto-crea como admin si la organización aún no tiene administradores).
    // IMPORTANTE: awaiteamos el resultado para que la replicación (initVerticalRxDb)
    // arranque DESPUÉS de que la membresía exista en Supabase. Sin este await,
    // mis_organizaciones() podría devolver vacío y la RLS bloquearía todos los pulls.
    try {
      await supabase.functions.invoke('manage-users', {
        body: { action: 'ensure-self', organization_id: orgId }
      });
    } catch (err) {
      // Si falla (p.ej. ya tiene membresía y el 403 es esperado), continuar.
      // El dispositivo podrá leer datos si ya existe su membresía.
      console.warn('ensure-self falló (puede ser normal si ya tiene perfil):', err);
    }
  };

  const desvincularDispositivo = async () => {
    localStorage.removeItem('pos_active_org_id');
    localStorage.removeItem('pos_current_mesero_id');
    localStorage.removeItem('pos_offline_auth');
    localStorage.removeItem('pos_org_name_cached');
    clearAuthCache();
    setActiveOrganizationId(null);
    setCurrentMesero(null);

    // Limpieza completa de RxDB local para evitar mezclar datos con la nueva
    // vinculación. Se destruye la base entera (resetLocalDatabase) en vez de
    // hacer .find().remove() por colección: los remove() son borrados lógicos
    // que la replicación empujaba a Supabase al re-vincular, ¡borrando los
    // datos reales de la organización para todos los dispositivos!
    try {
      await resetLocalDatabase();
      console.log('RxDB local destruido correctamente.');
    } catch (e) {
      console.error('Error al limpiar RxDB local durante la desvinculación:', e);
    }
  };

  // Busca la membresía local (RxDB) de una cuenta de Auth en la organización activa
  const cargarPerfilLocal = async (authUserId: string): Promise<UsuarioLocal | null> => {
    if (!activeOrganizationId) return null;
    const rxDb = await initVerticalRxDb();
    const doc = await rxDb.usuarios.findOne({
      selector: { user_id: authUserId, organization_id: activeOrganizationId, _deleted: { $ne: true } }
    }).exec();
    if (!doc) return null;
    const perfil = doc.toJSON() as UsuarioLocal;
    if (!perfil.activo) return null;
    return perfil;
  };

  const activarMesero = (perfil: UsuarioLocal) => {
    setCurrentMesero(perfil);
    localStorage.setItem('pos_current_mesero_id', perfil.id);
    localStorage.setItem('pos_offline_auth', 'true');
  };

  /**
   * Login de colaborador contra Supabase Auth (única fuente de credenciales).
   * Online: valida con un cliente efímero (no toca la sesión del dispositivo) y
   * refresca el verificador PBKDF2 local. Offline: valida contra el verificador cacheado.
   * En ambos casos el rol/estado viene del perfil sincronizado en la tabla `usuarios`.
   */
  const loginConPassword = async (email: string, pass: string) => {
    if (!activeOrganizationId) {
      return { success: false, error: 'El dispositivo no está asociado a ningún hotel.' };
    }
    const cleanEmail = email.trim().toLowerCase();

    try {
      if (navigator.onLine) {
        const verifier = createVerificationClient();
        const { data, error } = await verifier.auth.signInWithPassword({
          email: cleanEmail,
          password: pass
        });

        if (!error && data.user) {
          let perfil = await cargarPerfilLocal(data.user.id);
          if (!perfil) {
            // Perfil aún no sincronizado localmente: leerlo directo con la sesión efímera
            const { data: remoto } = await verifier
              .from('usuarios')
              .select('*')
              .eq('user_id', data.user.id)
              .eq('organization_id', activeOrganizationId)
              .eq('_deleted', false)
              .maybeSingle();
            if (remoto && remoto.activo && !remoto._deleted) perfil = remoto as UsuarioLocal;
          }
          await verifier.auth.signOut();

          if (!perfil) {
            return { success: false, error: 'Tu cuenta no pertenece a esta organización o está inactiva.' };
          }

          await cacheCredential(cleanEmail, pass, data.user.id);
          activarMesero(perfil);
          return { success: true };
        }

        // Credenciales rechazadas online: son la verdad; no caer al caché offline
        if (error && error.message?.toLowerCase().includes('invalid')) {
          return { success: false, error: 'Credenciales inválidas.' };
        }
        // Otro tipo de error (red intermitente, servicio caído): intentar offline
      }

      // Camino offline: verificador PBKDF2 local
      const cachedUserId = await verifyCachedCredential(cleanEmail, pass);
      if (cachedUserId) {
        const perfil = await cargarPerfilLocal(cachedUserId);
        if (!perfil) {
          return { success: false, error: 'Usuario inactivo o fuera de esta organización.' };
        }
        activarMesero(perfil);
        return { success: true };
      }

      if (!navigator.onLine && !hasCachedCredential(cleanEmail)) {
        return { success: false, error: 'Primer inicio de sesión requiere conexión a internet.' };
      }
      return { success: false, error: 'Credenciales inválidas o usuario no encontrado.' };
    } catch (err: any) {
      console.error('Error al iniciar sesión con contraseña:', err);
      return { success: false, error: 'Error al verificar credenciales.' };
    }
  };

  const logoutMesero = () => {
    setCurrentMesero(null);
    localStorage.removeItem('pos_current_mesero_id');
  };

  // Lista las organizaciones a las que pertenece el admin autenticado (multi-org)
  const fetchOrganizacionesAdmin = async (): Promise<Array<{ id: string; nombre: string }>> => {
    const { data: orgIds, error: rpcError } = await supabase.rpc('mis_organizaciones');
    if (rpcError) throw rpcError;
    if (!orgIds || orgIds.length === 0) return [];

    const { data, error } = await supabase
      .from('organizaciones')
      .select('id, nombre')
      .in('id', orgIds);
    if (error) throw error;
    return (data || []) as Array<{ id: string; nombre: string }>;
  };

  const isAdminConfigured = !!adminUser && !!activeOrganizationId;
  const isAuthenticated = !!currentMesero;

  return (
    <AuthContext.Provider value={{
      adminUser,
      adminSession,
      isAdminConfigured,
      activeOrganizationId,
      currentMesero,
      isAuthenticated,
      loginAdmin,
      logoutAdmin,
      vincularOrganizacion,
      desvincularDispositivo,
      loginConPassword,
      logoutMesero,
      fetchOrganizacionesAdmin,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
