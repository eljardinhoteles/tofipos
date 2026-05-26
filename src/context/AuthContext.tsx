import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { UsuarioLocal } from '../db/database';
import { initVerticalRxDb } from '../db/rxdb';

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
  vincularOrganizacion: (orgId: string) => void;
  desvincularDispositivo: () => void;
  loginConPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logoutMesero: () => void;

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setAdminSession(currentSession);
      setAdminUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    // 3. Recuperar el mesero activo de la sesión actual
    const savedMeseroId = localStorage.getItem('pos_current_mesero_id');
    if (savedMeseroId) {
      initVerticalRxDb().then(async rxDb => {
        const mesero = await rxDb.usuarios.findOne(savedMeseroId).exec();
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
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!activeOrganizationId || currentMesero) return;

    const savedMeseroId = localStorage.getItem('pos_current_mesero_id');
    const hasOfflineAuth = localStorage.getItem('pos_offline_auth') === 'true';
    if (!savedMeseroId || !hasOfflineAuth) return;

    initVerticalRxDb().then(async rxDb => {
      const mesero = await rxDb.usuarios.findOne(savedMeseroId).exec();
      if (mesero && mesero.toJSON().activo) {
        setCurrentMesero(mesero.toJSON() as UsuarioLocal);
      } else {
        localStorage.removeItem('pos_current_mesero_id');
        localStorage.removeItem('pos_offline_auth');
      }
    }).catch(err => {
      console.error('Error al restaurar mesero local:', err);
    });
  }, [activeOrganizationId, currentMesero]);

  // Deshabilitado: este bootstrap local generaba duplicados de usuarios al iniciar/sincronizar.

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

  const vincularOrganizacion = (orgId: string) => {
    const currentOrgId = localStorage.getItem('pos_active_org_id');
    if (currentOrgId && currentOrgId !== orgId) {
      localStorage.removeItem('pos_current_mesero_id');
      localStorage.removeItem('pos_offline_auth');
      setCurrentMesero(null);
    }
    localStorage.setItem('pos_active_org_id', orgId);
    setActiveOrganizationId(orgId);
  };

  const desvincularDispositivo = async () => {
    localStorage.removeItem('pos_active_org_id');
    localStorage.removeItem('pos_current_mesero_id');
    localStorage.removeItem('pos_offline_auth');
    localStorage.removeItem('pos_org_name_cached');
    setActiveOrganizationId(null);
    setCurrentMesero(null);

    // Limpieza completa de RxDB local para evitar mezclar datos con la nueva vinculación
    try {
      const rxDb = await initVerticalRxDb();
      await Promise.all([
        rxDb.mesas.find().remove(),
        rxDb.menu_items.find().remove(),
        rxDb.comandas.find().remove(),
        rxDb.comanda_items.find().remove(),
        rxDb.pisos.find().remove(),
        rxDb.categorias.find().remove(),
        rxDb.reservas.find().remove(),
        rxDb.clientes.find().remove(),
        rxDb.pagos.find().remove(),
        rxDb.habitacion_cuentas.find().remove(),
        rxDb.usuarios.find().remove()
      ]);
      console.log('RxDB local limpiado correctamente.');
    } catch (e) {
      console.error('Error al limpiar RxDB local durante la desvinculación:', e);
    }
  };

  const loginConPassword = async (email: string, pass: string) => {
    if (!activeOrganizationId) {
      return { success: false, error: 'El dispositivo no está asociado a ningún hotel.' };
    }

    try {
      // 1. Intentar validar localmente en Dexie para cualquier usuario activo
      const rxDb = await initVerticalRxDb();
      const usuariosValidos = await rxDb.usuarios.find({
        selector: { organization_id: activeOrganizationId, _deleted: { $ne: true } }
      }).exec();

      const localUser = usuariosValidos.map((d: any) => d.toJSON()).find(
        u => u.email?.toLowerCase() === email.trim().toLowerCase() && u.password === pass && u.activo
      );

      if (localUser) {
        setCurrentMesero(localUser);
        localStorage.setItem('pos_current_mesero_id', localUser.id);
        localStorage.setItem('pos_offline_auth', 'true');
        return { success: true };
      }

      // 2. Si no se encuentra localmente, y hay internet, intentar validar con Supabase Auth
      if (navigator.onLine) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pass
        });
        if (!error && data.user) {
          // Crear un perfil virtual para la interfaz del POS
          const tempUser: UsuarioLocal = {
            id: data.user.id,
            nombre: data.user.email?.split('@')[0] || 'Usuario',
            rol: 'admin',
            organization_id: activeOrganizationId,
            activo: true,
            _deleted: false,
            _modified: new Date().toISOString(),
          };
          setCurrentMesero(tempUser);
          localStorage.setItem('pos_current_mesero_id', tempUser.id);
          localStorage.setItem('pos_offline_auth', 'true');
          return { success: true };
        }
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
