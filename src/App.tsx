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
  Eye,
  EyeSlash,
  Buildings,
  Check,
} from '@phosphor-icons/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import { showToast } from '@/lib/toast';
import { setOrgCache } from './lib/orgCache';
import { appVersionLabel } from './lib/appVersion';

const brandModules = [
  { label: 'Mesas', icon: SquaresFour },
  { label: 'Órdenes', icon: Receipt },
  { label: 'Reservas', icon: CalendarCheck },
  { label: 'Centro de Ventas', icon: CurrencyDollar },
  { label: 'Clientes', icon: Users },
  { label: 'Productos', icon: Bag },
  { label: 'Métricas', icon: ChartBar },
];

// Columna del formulario de ingreso/vinculación. En móvil no hay panel de marca,
// así que el logo va arriba; la versión del sistema va al pie en todas las pantallas.
function LoginColumna({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full md:w-1/2 lg:w-[55%] flex-col items-center overflow-y-auto p-6">
      <div className="md:hidden self-start flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary">
          <img src="/Icon-app.webp" alt="TofiPOS" className="size-7 object-contain" />
        </div>
        <span className="font-heading text-lg font-semibold tracking-tight text-foreground">TofiPOS</span>
      </div>
      <div className="my-auto w-full max-w-sm flex flex-col gap-6 py-8">{children}</div>
      <p className="text-[11px] font-semibold text-muted-foreground/70 tabular-nums">{appVersionLabel()}</p>
    </div>
  );
}

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
  const [verPassword, setVerPassword] = useState(false);
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
          // Con varios establecimientos no se preselecciona ninguno: evita vincular el equivocado de pasada.
          if (formatted.length === 1) setSelectedOrgId(formatted[0].value);
        })
        .catch((err) => console.error('Error cargando orgs:', err))
        .finally(() => setLoadingOrgs(false));
    }
  }, [adminUser, activeOrganizationId, fetchOrganizacionesAdmin]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdminSubmitting(true);
    try {
      const { error } = await loginAdmin(adminEmail, adminPassword);
      if (error) throw error;
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
        <ArrowsClockwise size={32} className="animate-spin text-muted-foreground" />
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
          <LoginColumna>
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
                    className="h-12 text-base"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="admin-password">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="admin-password"
                      type={verPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      autoComplete="current-password"
                      className="h-12 pr-12 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setVerPassword(v => !v)}
                      aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      aria-pressed={verPassword}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                    >
                      {verPassword ? <EyeSlash size={20} weight="bold" /> : <Eye size={20} weight="bold" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={isAdminSubmitting} className="mt-2 h-12 w-full font-bold">
                  {isAdminSubmitting ? 'Ingresando...' : 'Iniciar sesión'}
                </Button>
              </form>
          </LoginColumna>
        </div>
      );
    } else {
      content = (
        <div className="flex h-screen w-screen bg-background">
          {brandPanel}
          <LoginColumna>
              <div className="flex flex-col gap-1.5">
                <h2 className="font-heading text-xl font-medium text-foreground">
                  {isCreatingOrg || orgs.length === 0 ? 'Crear establecimiento' : 'Establecimientos'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isCreatingOrg || orgs.length === 0
                    ? 'Aún no hay ninguno: crea el primero para vincular este dispositivo.'
                    : 'Elige a cuál se vinculará este dispositivo.'}
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
                        <Label htmlFor="org-nombre">Nombre</Label>
                        <Input
                          id="org-nombre"
                          type="text"
                          required
                          placeholder="Establecimiento Ejemplo"
                          value={newOrgNombre}
                          onChange={(e) => setNewOrgNombre(e.target.value)}
                          className="h-12 text-base"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleCrearOrg}
                        disabled={isAdminSubmitting}
                        className="h-12 w-full font-bold"
                      >
                        Crear y vincular
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Establecimiento">
                          {orgs.map((o) => {
                            const elegido = selectedOrgId === o.value;
                            return (
                              <button
                                key={o.value}
                                type="button"
                                role="radio"
                                aria-checked={elegido}
                                onClick={() => setSelectedOrgId(o.value)}
                                className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left cursor-pointer transition-colors ${elegido ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50'}`}
                              >
                                <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${elegido ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                  <Buildings size={20} weight="bold" />
                                </div>
                                <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-foreground">{o.label}</span>
                                {elegido && (
                                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                    <Check size={14} weight="bold" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={handleVincularOrg}
                        disabled={isAdminSubmitting || !selectedOrgId}
                        className="h-12 w-full font-bold"
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
          </LoginColumna>
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
      <SonnerToaster position="top-center" />
      {content}
    </>
  );
}
