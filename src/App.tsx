import { useAuth } from './context/AuthContext';
import { useEffect, useState, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayoutV2 } from './components/Layout/AppLayoutV2';
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { setSuspendHooks } from './db/database';
import { supabase } from './lib/supabase';
import { initVerticalRxDb, forceSyncAll, waitForInitialSync } from './db/rxdb';
import {
  ArrowsClockwise,
  SignOut,
  SquaresFour,
  Receipt,
  CalendarCheck,
  CurrencyDollar,
  Users,
  Bag,
  ChartBar,
} from '@phosphor-icons/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { showToast } from '@/lib/toast';
import { setOrgCache } from './lib/orgCache';

const brandModules = [
  { label: 'Mesas', icon: SquaresFour },
  { label: 'Órdenes', icon: Receipt },
  { label: 'Reservas', icon: CalendarCheck },
  { label: 'Centro de Ventas', icon: CurrencyDollar },
  { label: 'Clientes', icon: Users },
  { label: 'Productos', icon: Bag },
  { label: 'Métricas', icon: ChartBar },
];

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
    const brandPanel = (
      <div className="relative hidden md:flex md:w-1/2 lg:w-[45%] flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground">
        <div
          className="pointer-events-none absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary-foreground/15">
            <img src="/Icon-app.webp" alt="TofiPOS" className="w-6 h-6 object-contain" />
          </div>
          <span className="font-heading text-base font-semibold tracking-tight">TofiPOS</span>
        </div>
        <div className="relative flex flex-col gap-5 max-w-sm">
          <h1 className="font-heading text-3xl font-semibold leading-tight">
            Gestión Operativa de Restaurante &amp; Hoteles
          </h1>
          <div className="flex flex-wrap gap-2.5">
            {brandModules.map(({ label, icon: ModIcon }) => (
              <div
                key={label}
                title={label}
                className="flex size-10 items-center justify-center rounded-xl bg-primary-foreground/10"
              >
                <ModIcon size={18} weight="regular" />
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} TofiPOS
        </p>
      </div>
    );

    if (!adminUser) {
      content = (
        <div className="flex h-screen w-screen bg-background">
          {brandPanel}
          <div className="flex w-full md:w-1/2 lg:w-[55%] items-center justify-center p-6">
            <div className="w-full max-w-sm flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <h2 className="font-heading text-xl font-medium text-foreground">Configuración POS</h2>
                <p className="text-sm text-muted-foreground">
                  Inicia sesión con tu cuenta de administrador para vincular este dispositivo.
                </p>
              </div>
              <form onSubmit={handleAdminLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="admin-email">Correo</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    required
                    placeholder="admin@tuempresa.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="admin-password">Contraseña</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" disabled={isAdminSubmitting} className="mt-2 w-full">
                  {isAdminSubmitting ? 'Ingresando...' : 'Iniciar sesión'}
                </Button>
              </form>
            </div>
          </div>
        </div>
      );
    } else {
      content = (
        <div className="flex h-screen w-screen bg-background">
          {brandPanel}
          <div className="flex w-full md:w-1/2 lg:w-[55%] items-center justify-center p-6">
            <div className="w-full max-w-sm flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <h2 className="font-heading text-xl font-medium text-foreground">
                  {isCreatingOrg || orgs.length === 0 ? 'Crear organización' : 'Seleccionar establecimiento'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isCreatingOrg || orgs.length === 0
                    ? 'Registra el establecimiento para vincular este dispositivo.'
                    : 'Elige el establecimiento al que quieres vincular este dispositivo.'}
                </p>
              </div>
              {loadingOrgs ? (
                <div className="py-8 text-center text-sm font-medium text-muted-foreground">
                  Cargando...
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {isCreatingOrg || orgs.length === 0 ? (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="org-nombre">Nombre del establecimiento</Label>
                        <Input
                          id="org-nombre"
                          type="text"
                          required
                          placeholder="Establecimiento Ejemplo"
                          value={newOrgNombre}
                          onChange={(e) => setNewOrgNombre(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleCrearOrg}
                        disabled={isAdminSubmitting}
                        className="w-full"
                      >
                        Crear y vincular
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label>Establecimiento</Label>
                        <Select value={selectedOrgId || undefined} onValueChange={setSelectedOrgId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecciona un establecimiento" />
                          </SelectTrigger>
                          <SelectContent>
                            {orgs.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        onClick={handleVincularOrg}
                        disabled={isAdminSubmitting}
                        className="w-full"
                      >
                        Vincular dispositivo
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={logoutAdmin}
                    className="w-full text-destructive hover:text-destructive"
                  >
                    <SignOut size={16} />
                    Cerrar sesión admin
                  </Button>
                </div>
              )}
            </div>
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
