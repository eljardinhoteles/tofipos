// @ts-nocheck
import { LoadingOverlay, Title, Text, Button, Stack, Container, useMantineTheme, TextInput, PasswordInput, Card, Center, Select, Loader } from '@mantine/core';
import { useAuth } from './context/AuthContext';
import { useEffect, useState, type ReactElement } from 'react';
import { useMediaQuery, useNetwork } from '@mantine/hooks';
import { iniciarSync, detenerSync, sincronizarDatosOrganizacion } from './db/sync';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/Layout/AppLayout';
import { Toaster, sileo } from "sileo";
import { setSuspendHooks } from './db/database';
import { supabase } from './lib/supabase';
import { initVerticalRxDb } from './db/rxdb';
import { SignOut, ArrowsClockwise } from '@phosphor-icons/react';
import { useRegisterSW } from 'virtual:pwa-register/react';

function App() {
  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      sileo.info({
        title: 'Nueva versión disponible',
        description: 'Recarga la app para actualizar.',
      });
    },
    onOfflineReady() {
      sileo.success({ title: 'App lista sin conexión' });
    },
  });
  void updateServiceWorker;

  const {
    adminUser,
    activeOrganizationId,
    isAuthenticated,
    loginAdmin,
    logoutAdmin,
    vincularOrganizacion,
    desvincularDispositivo,
    isLoading: authLoading
  } = useAuth();

  const theme = useMantineTheme();
  const sidebarBg = (theme.other as { sidebarBg?: string }).sidebarBg || '#003b1e';
  const network = useNetwork();
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Admin login states
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false);

  // Org selection states
  const [orgs, setOrgs] = useState<{ value: string; label: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loadingOrgs, setLoadingOrgs] = useState(false);

  const [organizacionNombre, setOrganizacionNombre] = useState('Mi Hotel');
  const [organizacionRuc, setOrganizacionRuc] = useState('');
  const [organizacionTelefono, setOrganizacionTelefono] = useState('');
  const [organizacionDireccion, setOrganizacionDireccion] = useState('');
  
  // New org states
  const [newOrgNombre, setNewOrgNombre] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [pwaHintDismissed, setPwaHintDismissed] = useState<boolean>(() => localStorage.getItem('pos_pwa_hint_dismissed') === 'true');

  // Cargar lista de organizaciones si el admin está logueado pero no hay org vinculada
  useEffect(() => {
    const loadOrgs = async () => {
      if (!adminUser || activeOrganizationId) return;
      setLoadingOrgs(true);
      try {
        const { data, error } = await supabase
          .from('organizaciones')
          .select('id, nombre')
          .eq('activo', true)
          .order('nombre', { ascending: true });

        if (error) throw error;
        setOrgs((data || []).map((org) => ({ value: org.id, label: org.nombre })));
        setSelectedOrgId((data && data[0]?.id) || null);
      } catch (err) {
        console.error('Error al cargar organizaciones:', err);
        setOrgs([]);
      } finally {
        setLoadingOrgs(false);
      }
    };

    loadOrgs();
  }, [adminUser, activeOrganizationId]);

  // Cargar nombre de la organización vinculada
  useEffect(() => {
    const getOrgName = async () => {
      if (activeOrganizationId) {
        let cachedName = localStorage.getItem('pos_org_name_cached');
        if (!cachedName && network.online) {
          try {
            const { data, error } = await supabase
              .from('organizaciones')
              .select('nombre')
              .eq('id', activeOrganizationId)
              .single();
            if (!error && data) {
              cachedName = data.nombre;
              localStorage.setItem('pos_org_name_cached', cachedName);
            }
          } catch (err) {
            console.error('Error fetching org name:', err);
          }
        }
        if (cachedName) setOrganizacionNombre(cachedName);
        else setOrganizacionNombre('Mi Hotel');
      }
    };
    getOrgName();
  }, [activeOrganizationId, network.online]);

  useEffect(() => {
    const checkStandalone = () => {
      const standaloneByMedia = window.matchMedia('(display-mode: standalone)').matches;
      const standaloneByIOS = (window.navigator as any).standalone === true;
      setIsStandalone(standaloneByMedia || standaloneByIOS);
    };
    checkStandalone();
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', checkStandalone);
    return () => mq.removeEventListener?.('change', checkStandalone);
  }, []);

  useEffect(() => {
    if (!activeOrganizationId) return;
    let cancelled = false;
    let startTimer: number | null = null;

    initVerticalRxDb().catch(err => console.warn('Error al iniciar RxDB vertical:', err));
    startTimer = window.setTimeout(() => {
      if (cancelled) return;
      iniciarSync();
    }, 800);

    return () => {
      cancelled = true;
      if (startTimer) window.clearTimeout(startTimer);
      detenerSync();
    };
  }, [activeOrganizationId]);

  useEffect(() => {
  }, [activeOrganizationId]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword.trim()) {
      sileo.error({ title: 'Campos incompletos', description: 'Por favor ingresa correo y contraseña.' });
      return;
    }
    setIsAdminSubmitting(true);
    const { error } = await loginAdmin(adminEmail, adminPassword);
    setIsAdminSubmitting(false);
    if (error) {
      sileo.error({ title: 'Error de acceso', description: error.message || 'Credenciales incorrectas.' });
    } else {
      sileo.success({ title: 'Acceso correcto', description: 'Sesión de administrador iniciada.' });
    }
  };

  const handleVincularOrg = async () => {
    if (!selectedOrgId) {
      sileo.error({ title: 'Selección requerida', description: 'Por favor selecciona una organización.' });
      return;
    }
    const matchedOrg = orgs.find(o => o.value === selectedOrgId);
    if (matchedOrg) {
      localStorage.setItem('pos_org_name_cached', matchedOrg.label);
      setOrganizacionNombre(matchedOrg.label);
    }
    vincularOrganizacion(selectedOrgId);
    sileo.success({ title: 'Vinculado', description: 'Dispositivo vinculado al hotel seleccionado.' });
    
    // Descargar datos iniciales de forma inmediata
    setIsAdminSubmitting(true);
    await sincronizarDatosOrganizacion();
    setIsAdminSubmitting(false);
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
      vincularOrganizacion(orgId);
      localStorage.setItem('pos_org_name_cached', newOrgNombre.trim());
      setOrganizacionNombre(newOrgNombre.trim());
      await sincronizarDatosOrganizacion();
    } catch (error) {
      console.error('Error al crear organización:', error);
      sileo.error({ title: 'Error', description: 'No se pudo crear la organización.' });
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  if (authLoading) {
    return <LoadingOverlay visible={true} />;
  }

  const dismissPwaHint = () => {
    setPwaHintDismissed(true);
    localStorage.setItem('pos_pwa_hint_dismissed', 'true');
  };

  const toaster = (
    <Toaster
      position={isMobile ? "top-center" : "bottom-left"}
      offset={isMobile ? 24 : { bottom: 12, left: 92 }}
      theme="light"
      options={{
        fill: sidebarBg,
        styles: {
          title: 'color: rgba(255,255,255,0.98);',
          description: 'color: rgba(255,255,255,0.70);'
        }
      }}
    />
  );

  let content: ReactElement;
  // 1. Si no hay organización vinculada, forzar la vinculación
  if (!activeOrganizationId) {
    if (!adminUser) {
      content = (
        <Container size="xs" p="xl" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Card withBorder shadow="md" p="xl" radius="md" style={{ width: '100%' }}>
            <Stack gap="lg">
              <Stack align="center" gap={4}>
                <Title order={2} ta="center">Configuración POS</Title>
                <Text size="sm" c="dimmed" ta="center">
                  Inicia sesión con tu cuenta de administrador de Supabase para vincular este dispositivo a tu hotel.
                </Text>
              </Stack>
              <form onSubmit={handleAdminLogin}>
                <Stack gap="md">
                  <TextInput label="Correo electrónico Admin" placeholder="admin@hotel.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required disabled={isAdminSubmitting} />
                  <PasswordInput label="Contraseña" placeholder="Contraseña" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required disabled={isAdminSubmitting} />
                  <Button type="submit" fullWidth loading={isAdminSubmitting} mt="md">Iniciar Sesión Admin</Button>
                </Stack>
              </form>
            </Stack>
          </Card>
        </Container>
      );
    } else {
      content = (
        <Container size="xs" p="xl" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Card withBorder shadow="md" p="xl" radius="md" style={{ width: '100%' }}>
            <Stack gap="lg">
              <Stack align="center" gap={4}>
                <Title order={2} ta="center">{isCreatingOrg || orgs.length === 0 ? 'Crear Hotel / Organización' : 'Seleccionar Hotel'}</Title>
                <Text size="sm" c="dimmed" ta="center">
                  {isCreatingOrg || orgs.length === 0
                    ? 'Registra tu hotel en Supabase para configurarlo en este dispositivo.'
                    : 'Elige la organización a la que pertenecerá esta tablet permanentemente.'}
                </Text>
              </Stack>
              {loadingOrgs ? (
                <Center p="xl"><Loader size="md" /></Center>
              ) : (
                <Stack gap="md">
                  {isCreatingOrg || orgs.length === 0 ? (
                    <>
                      <TextInput label="Nombre del Hotel / Organización" placeholder="Ej. Hotel Valle de Guadalupe" value={newOrgNombre} onChange={(e) => setNewOrgNombre(e.target.value)} required disabled={isAdminSubmitting} />
                      <TextInput label="RUC" placeholder="Ej. 1790012345001" value={organizacionRuc} onChange={(e) => setOrganizacionRuc(e.target.value)} disabled={isAdminSubmitting} />
                      <TextInput label="Teléfono" placeholder="Ej. +593 99 123 4567" value={organizacionTelefono} onChange={(e) => setOrganizacionTelefono(e.target.value)} disabled={isAdminSubmitting} />
                      <TextInput label="Dirección" placeholder="Ej. Av. Principal 123 y Calle 4" value={organizacionDireccion} onChange={(e) => setOrganizacionDireccion(e.target.value)} disabled={isAdminSubmitting} />
                      <Button fullWidth onClick={handleCrearOrg} loading={isAdminSubmitting}>Crear y Vincular Dispositivo</Button>
                      {orgs.length > 0 && <Button variant="subtle" fullWidth onClick={() => setIsCreatingOrg(false)}>Volver a la lista</Button>}
                    </>
                  ) : (
                    <>
                      <Select label="Organización activa" placeholder="Selecciona tu hotel" data={orgs} value={selectedOrgId} onChange={setSelectedOrgId} required />
                      <Button fullWidth onClick={handleVincularOrg} loading={isAdminSubmitting}>Vincular Dispositivo</Button>
                      <Button variant="subtle" size="xs" onClick={() => setIsCreatingOrg(true)}>+ Crear nueva organización</Button>
                    </>
                  )}
                  <Button variant="subtle" color="red" fullWidth onClick={logoutAdmin}>Cancelar / Cerrar Admin</Button>
                </Stack>
              )}
            </Stack>
          </Card>
        </Container>
      );
    }
  } else {
    content = (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <>
      {toaster}
      {!isStandalone && activeOrganizationId && !pwaHintDismissed && (
        <Container size="md" px="md" pt="sm" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
          <Card withBorder radius="md" p="sm" onClick={dismissPwaHint} style={{ backgroundColor: '#fff7e6', borderColor: '#f59f00', cursor: 'pointer' }}>
            <Text size="sm" fw={700} c="#8a5b00">
              Estás en navegador. Para pantalla completa sin barras, instala la app en inicio (Compartir → Añadir a pantalla de inicio).
            </Text>
          </Card>
        </Container>
      )}
      {content}
    </>
  );
}

export default App;
