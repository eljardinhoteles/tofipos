import { useAuth } from './context/AuthContext';
import { useEffect, useState, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayoutV2 } from './components/Layout/AppLayoutV2';
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { setSuspendHooks } from './db/database';
import { supabase } from './lib/supabase';
import { initVerticalRxDb, forceSyncAll, waitForInitialSync } from './db/rxdb';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import { showToast } from '@/lib/toast';
import { setOrgCache } from './lib/orgCache';

export default function App() {
  const {
    activeOrganizationId,
    vincularOrganizacion,
    isLoading: authLoading,
    adminUser,
    loginAdmin,
    logoutAdmin,
    fetchOrganizacionesAdmin
  } = useAuth();

  const [orgs, setOrgs] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [newOrgNombre, setNewOrgNombre] = useState('');
  const [organizacionRuc] = useState('');
  const [organizacionTelefono] = useState('');
  const [organizacionDireccion] = useState('');
  const [isCreatingOrg] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false);
  const [isSyncingInitial, setIsSyncingInitial] = useState(false);

  const [, setOrganizacionNombre] = useState<string | null>(
    () => localStorage.getItem('pos_org_name_cached') || null
  );

  const [, setNeedRefresh] = useState(false);
  const [, setOfflineReady] = useState(false);


  useRegisterSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onOfflineReady() {
      setOfflineReady(true);
    },
  });

  useEffect(() => {
    let alive = true;
    if (activeOrganizationId) {
      const cached = localStorage.getItem('pos_org_name_cached');
      if (cached) setOrganizacionNombre(cached);

      supabase
        .from('organizaciones')
        .select('nombre, ruc, telefono, direccion')
        .eq('id', activeOrganizationId)
        .maybeSingle()
        .then(({ data }) => {
          if (alive && data?.nombre) {
            setOrganizacionNombre(data.nombre);
            setOrgCache(data);
          }
        });
    }
    return () => { alive = false; };
  }, [activeOrganizationId]);

  useEffect(() => {
    if (activeOrganizationId) setSuspendHooks(false);
  }, [activeOrganizationId]);

  useEffect(() => {
    if (adminUser && !activeOrganizationId) {
      setLoadingOrgs(true);
      fetchOrganizacionesAdmin()
        .then((list) => {
          const formatted = list.map((o) => ({ value: o.id, label: o.nombre }));
          setOrgs(formatted);
          if (formatted.length > 0) setSelectedOrgId(formatted[0].value);
        })
        .catch((err) => console.error('Error cargando orgs:', err))
        .finally(() => setLoadingOrgs(false));
    }
  }, [adminUser, activeOrganizationId, fetchOrganizacionesAdmin]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdminSubmitting(true);
    try {
      await loginAdmin(adminEmail, adminPassword);
    } catch (error) {
      console.error('Login admin falló:', error);
      showToast.error('Error', 'Credenciales inválidas.');
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  const handleVincularOrg = async () => {
    if (!selectedOrgId) return;
    setIsAdminSubmitting(true);
    try {
      const orgObj = orgs.find((o) => o.value === selectedOrgId);
      if (orgObj) {
        localStorage.setItem('pos_org_name_cached', orgObj.label);
        setOrganizacionNombre(orgObj.label);
      }

      await vincularOrganizacion(selectedOrgId);
      setIsSyncingInitial(true);
      await initVerticalRxDb();
      await waitForInitialSync();
      await forceSyncAll();
      setIsSyncingInitial(false);
    } catch (error) {
      console.error('Error al vincular organización:', error);
      showToast.error('Error', 'No se pudo vincular la organización.');
      setIsSyncingInitial(false);
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  const handleCrearOrg = async () => {
    if (!newOrgNombre.trim()) return;
    setIsAdminSubmitting(true);
    const orgId = crypto.randomUUID();
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('organizaciones').insert({
        id: orgId,
        nombre: newOrgNombre.trim(),
        ruc: organizacionRuc.trim() || null,
        telefono: organizacionTelefono.trim() || null,
        direccion: organizacionDireccion.trim() || null,
        activo: true,
        created_at: now,
        _deleted: false,
        _modified: now
      });
      if (error) throw error;
      await vincularOrganizacion(orgId);
      localStorage.setItem('pos_org_name_cached', newOrgNombre.trim());
      setOrganizacionNombre(newOrgNombre.trim());
      setIsSyncingInitial(true);
      await initVerticalRxDb();
      await waitForInitialSync();
      await forceSyncAll();
      setIsSyncingInitial(false);
    } catch (error) {
      console.error('Error al crear organización:', error);
      showToast.error('Error', 'No se pudo crear la organización.');
      setIsSyncingInitial(false);
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-foreground text-background font-bold text-sm">
        Cargando sistema...
      </div>
    );
  }

  let content: ReactElement;

  if (activeOrganizationId && isSyncingInitial) {
    content = (
      <div className="h-screen w-screen flex flex-col items-center justify-center p-6 bg-background text-center gap-4">
        <ArrowsClockwise size={32} className="animate-spin text-primary" />
        <div className="flex flex-col gap-1">
          <h2 className="font-extrabold text-lg text-foreground">Sincronizando datos...</h2>
          <p className="text-xs text-muted-foreground max-w-sm">
            Descargando mesas, menú y configuración. Esto solo pasa la primera vez que vinculas este dispositivo.
          </p>
        </div>
      </div>
    );
  } else if (!activeOrganizationId) {
    if (!adminUser) {
      content = (
        <div className="h-screen w-screen flex items-center justify-center p-6 bg-background">
          <div className="bg-card p-8 rounded-2xl border border-border shadow-xl w-full max-w-sm flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
              <h2 className="font-extrabold text-lg text-foreground">Configuración POS</h2>
              <p className="text-xs text-muted-foreground">
                Inicia sesión con tu cuenta de administrador para vincular este dispositivo.
              </p>
            </div>
            <form onSubmit={handleAdminLogin} className="flex flex-col gap-3">
              <Input
                type="email"
                required
                placeholder="Correo admin"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="h-9 text-xs"
              />
              <Input
                type="password"
                required
                placeholder="Contraseña"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="h-9 text-xs"
              />
              <Button type="submit" disabled={isAdminSubmitting} className="mt-2">
                Iniciar Sesión Admin
              </Button>
            </form>
          </div>
        </div>
      );
    } else {
      content = (
        <div className="h-screen w-screen flex items-center justify-center p-6 bg-background">
          <div className="bg-card p-8 rounded-2xl border border-border shadow-xl w-full max-w-sm flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
              <h2 className="font-extrabold text-lg text-foreground">
                {isCreatingOrg || orgs.length === 0 ? 'Crear Organización' : 'Seleccionar Hotel'}
              </h2>
            </div>
            {loadingOrgs ? (
              <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Cargando...</div>
            ) : (
              <div className="flex flex-col gap-3">
                {isCreatingOrg || orgs.length === 0 ? (
                  <>
                    <Input
                      type="text"
                      required
                      placeholder="Nombre del Hotel"
                      value={newOrgNombre}
                      onChange={(e) => setNewOrgNombre(e.target.value)}
                      className="h-9 text-xs"
                    />
                    <Button
                      type="button"
                      onClick={handleCrearOrg}
                      disabled={isAdminSubmitting}
                      className="py-2.5"
                    >
                      Crear y Vincular
                    </Button>
                  </>
                ) : (
                  <>
                    <select
                      value={selectedOrgId || ''}
                      onChange={(e) => setSelectedOrgId(e.target.value)}
                      className="h-10 px-3 text-xs bg-muted border border-border rounded-lg font-semibold"
                    >
                      {orgs.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleVincularOrg}
                      disabled={isAdminSubmitting}
                      className="py-2.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs"
                    >
                      Vincular Dispositivo
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={logoutAdmin}
                  className="py-2 text-xs font-bold text-destructive"
                >
                  Cerrar Sesión Admin
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }
  } else {
    content = (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<AppLayoutV2 />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <>
      <SonnerToaster position="top-center" richColors />
      {content}
    </>
  );
}
