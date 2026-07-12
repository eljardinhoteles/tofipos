import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stack,
  UnstyledButton,
  Text,
  Group,
  Divider,
  Avatar,
} from '@mantine/core';
import { NavLink, useNavigate } from 'react-router-dom';
import { Drawer as VaulDrawer } from 'vaul';
import {
  SquaresFour,
  Receipt,
  CalendarCheck,
  Bag,
  Gear,
  Users,
  ForkKnife,
  ArrowsClockwise,
  User,
  SignOut,
  ShoppingCartSimple,
  List,
  DownloadSimple,
  ChartBar,
} from '@phosphor-icons/react';
import { SyncStatusModal } from '../Common/SyncStatusModal';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { isOperativeComanda } from '../../db/comandaState';
import { initVerticalRxDb, subscribeSyncStatus, pingSyncStatus, forceSyncAll, type SyncStatus } from '../../db/rxdb';
import { useIvaActivo } from '../../hooks/useIvaActivo';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';
import { calcularTotalesComanda } from '../../lib/taxUtils';

// ── Ítems de navegación (igual que escritorio) ───────────────────────────
const NAV_ITEMS = [
  { label: 'Mesas',     to: '/mesas',    icon: SquaresFour,   desc: 'Plano y gestión de mesas' },
  { label: 'Órdenes',  to: '/ordenes',  icon: Receipt,       desc: 'Historial de comandas' },
  { label: 'Reservas', to: '/reservas', icon: CalendarCheck, desc: 'Agenda de reservas' },
  { label: 'Clientes', to: '/clientes', icon: Users,         desc: 'Base de clientes' },
  { label: 'Productos', to: '/menu',    icon: Bag,           desc: 'Carta y precios' },
  { label: 'Métricas',  to: '/metricas', icon: ChartBar,      desc: 'Análisis de ventas y rendimiento' },
  { label: 'Ajustes',  to: '/ajustes',  icon: Gear,         desc: 'Configuración del sistema' },
];

// ── Ítem de nav dentro del sheet ─────────────────────────────────────────
function SheetNavItem({
  label,
  to,
  desc,
  icon: Icon,
  onClick,
}: {
  label: string;
  to: string;
  desc: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <NavLink to={to} onClick={onClick} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <Group
          gap={14}
          px={16}
          py={12}
          className={`mob-sheet__nav-item${isActive ? ' mob-sheet__nav-item--active' : ''}`}
          wrap="nowrap"
        >
          <div className={`mob-sheet__nav-icon${isActive ? ' mob-sheet__nav-icon--active' : ''}`}>
            <Icon
              size={22}
              weight={isActive ? 'fill' : 'regular'}
              color="var(--pos-sidebar-atxt)"
              style={{ opacity: isActive ? 1 : 0.7 }}
            />
          </div>
          <Stack gap={1} style={{ flex: 1 }}>
            <Text fw={isActive ? 800 : 600} size="md" c="var(--pos-sidebar-atxt)">{label}</Text>
            <Text size="xs" c="var(--pos-sidebar-txt)">{desc}</Text>
          </Stack>
        </Group>
      )}
    </NavLink>
  );
}

// ── Componente principal ─────────────────────────────────────────────────
export function MobileSidebar() {
  const navigate = useNavigate();
  const { mesaView, setMesaView, selectedMesaId, reservaProductosComandaId, setReservaProductosComandaId } = useUI();
  const { currentMesero, adminUser, logoutAdmin } = useAuth();

  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
  const { menuItems } = useRxMenuCatalog();

  const [menuOpen, setMenuOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncPressed, setSyncPressed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA install prompt outcome: ${outcome}`);
    setDeferredPrompt(null);
    setIsInstallable(false);
  };
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    online: navigator.onLine,
    supabaseOk: null,
    hasError: false,
    errorCollections: [],
    activePushQueue: 0,
    collections: {},
  });
  const [activeMesasCount, setActiveMesasCount] = useState(0);
  const [activeMesa, setActiveMesa] = useState<any | null>(null);
  const [activeComanda, setActiveComanda] = useState<any | null>(null);
  const [comandaItems, setComandaItems] = useState<any[]>([]);

  // 1. Suscribirse a mesas en general para contar mesas activas
  useEffect(() => {
    let alive = true;
    let mesasSub: any = null;

    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const mesasQuery = rxDb.mesas.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } }
      });
      mesasSub = mesasQuery.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setActiveMesasCount(docs.filter((m: any) => m.estado !== 'libre').length);
      });
    })().catch(err => console.warn('Error en suscripción de mesas:', err));

    return () => {
      alive = false;
      mesasSub?.unsubscribe();
    };
  }, []);

  // 2. Suscribirse a la mesa seleccionada y a sus comandas para encontrar la comanda operativa
  useEffect(() => {
    let alive = true;
    let mesaSub: any = null;
    let comandasSub: any = null;

    (async () => {
      if (!selectedMesaId) {
        if (alive) {
          setActiveMesa(null);
          setActiveComanda(null);
        }
        return;
      }

      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';

      // Suscribirse a la mesa seleccionada
      const mesaQuery = rxDb.mesas.findOne(selectedMesaId);
      mesaSub = mesaQuery.$.subscribe((doc: any) => {
        if (!alive) return;
        setActiveMesa(doc ? doc.toJSON() : null);
      });

      // Suscribirse a las comandas de la mesa para encontrar la comanda operativa/activa
      const comandasQuery = rxDb.comandas.find({
        selector: {
          mesa_id: selectedMesaId,
          organization_id: orgId,
          _deleted: { $ne: true },
          estado: { $nin: ['cerrado', 'facturado', 'anulada'] }
        },
        sort: [{ updated_at: 'desc' }, { id: 'desc' }]
      });

      comandasSub = comandasQuery.$.subscribe((docs: any[]) => {
        if (!alive) return;
        const operative = docs.map((d: any) => d.toJSON()).find((c: any) => isOperativeComanda(c)) || null;
        setActiveComanda(operative);
      });

    })().catch(err => console.warn('Error en suscripción de mesa/comandas:', err));

    return () => {
      alive = false;
      mesaSub?.unsubscribe();
      comandasSub?.unsubscribe();
    };
  }, [selectedMesaId]);

  // 3. Suscribirse a los ítems de la comanda activa
  useEffect(() => {
    let alive = true;
    let itemsSub: any = null;

    (async () => {
      if (!activeComanda?.id) {
        if (alive) setComandaItems([]);
        return;
      }
      const rxDb = await initVerticalRxDb();
      if (!alive) return;

      const query = rxDb.comanda_items.find({
        selector: { comanda_id: activeComanda.id, _deleted: { $ne: true } }
      });

      itemsSub = query.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setComandaItems(docs.map((doc: any) => doc.toJSON()));
      });
    })().catch(err => console.warn('Error en suscripción de comanda_items:', err));

    return () => {
      alive = false;
      itemsSub?.unsubscribe();
    };
  }, [activeComanda?.id]);

  const totalProductos = useMemo(
    () => comandaItems.reduce((acc, i) => acc + i.cantidad, 0),
    [comandaItems]
  );
  const totalMonto = useMemo(
    () => calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva).total,
    [comandaItems, menuItems, ivaPorcentaje, preciosConIva]
  );

  useEffect(() => {
    const unsub = subscribeSyncStatus(setSyncStatus);
    pingSyncStatus();
    return unsub;
  }, []);

  useEffect(() => {
    if (!syncModalOpen) return;
    pingSyncStatus();
    const interval = setInterval(pingSyncStatus, 30_000);
    return () => clearInterval(interval);
  }, [syncModalOpen]);

  const handleForceSync = useCallback(async () => {
    setSyncing(true);
    await forceSyncAll();
    await pingSyncStatus();
    setTimeout(() => setSyncing(false), 1200);
  }, []);

  const handleOpenSyncModal = () => {
    setSyncModalOpen(true);
    pingSyncStatus();
  };

  const userName = currentMesero?.nombre || adminUser?.email || 'Usuario';
  const userRole = currentMesero
    ? (currentMesero.rol === 'admin' ? 'Administrador' : 'Mesero')
    : adminUser
      ? 'Administrador'
      : 'Usuario';

  const syncIconColor = syncStatus.hasError
    ? 'var(--status-closed)'
    : syncStatus.online
      ? 'var(--pos-sidebar-atxt)'
      : 'var(--pos-sidebar-txt)';

  // ── Modo: Selección de productos para reserva ────────────────────────
  const [reservaComandaItems, setReservaComandaItems] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    let itemsSub: any = null;

    (async () => {
      if (!reservaProductosComandaId) {
        if (alive) setReservaComandaItems([]);
        return;
      }
      const rxDb = await initVerticalRxDb();
      if (!alive) return;

      const query = rxDb.comanda_items.find({
        selector: { comanda_id: reservaProductosComandaId, _deleted: { $ne: true } }
      });

      itemsSub = query.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setReservaComandaItems(docs.map((doc: any) => doc.toJSON()));
      });
    })().catch(err => console.warn('Error en suscripción de reserva comanda_items:', err));

    return () => {
      alive = false;
      itemsSub?.unsubscribe();
    };
  }, [reservaProductosComandaId]);
  const reservaTotalProductos = useMemo(
    () => reservaComandaItems.reduce((acc, i) => acc + i.cantidad, 0),
    [reservaComandaItems]
  );
  const reservaTotalMonto = useMemo(
    () => calcularTotalesComanda(reservaComandaItems, menuItems, ivaPorcentaje, preciosConIva).total,
    [reservaComandaItems, menuItems, ivaPorcentaje, preciosConIva]
  );

  if (reservaProductosComandaId) {
    return (
      <div className="mob-nav">
        <button
          type="button"
          className="mob-nav__pill mob-nav__pill--comanda"
          onClick={() => setReservaProductosComandaId(null)}
        >
          <Group gap={10} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <div className="mob-nav__icon-circle">
              <ShoppingCartSimple size={18} weight="bold" color="var(--pos-sidebar-atxt)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mob-nav__pill-label">Reserva</div>
              <div className="mob-nav__pill-sub">
                {reservaTotalProductos} productos · ${reservaTotalMonto.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </Group>
          <span className="mob-nav__pill-action">Ver comanda →</span>
        </button>
      </div>
    );
  }

  // ── Modo: Selección de productos ─────────────────────────────────────
  if (mesaView === 'productos' && selectedMesaId) {
    const mesaLabel = activeMesa?.nombre || 'Comanda';

    return (
      <div className="mob-nav" >
        <button
          type="button"
          className="mob-nav__pill mob-nav__pill--comanda"
          onClick={() => setMesaView('mapa')}
        >
          <Group gap={10} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <div className="mob-nav__icon-circle">
              <ShoppingCartSimple size={18} weight="bold" color="var(--pos-sidebar-atxt)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mob-nav__pill-label">{mesaLabel}</div>
              <div className="mob-nav__pill-sub">
                {totalProductos} productos · ${totalMonto.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </Group>
          <span className="mob-nav__pill-action">Ver comanda →</span>
        </button>
      </div>
    );
  }

  // ── Modo: Navegación normal ───────────────────────────────────────────
  return (
    <>
      <div className="mob-nav" >
        {/* Izquierda: Menú */}
        <button
          type="button"
          className="mob-nav__btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
        >
          <List size={22} color="var(--pos-sidebar-atxt)" weight="bold" />
        </button>

        {/* Centro: Mesas */}
        <button
          type="button"
          className="mob-nav__pill"
          onClick={() => navigate('/mesas')}
          aria-label="Ir a Mesas"
        >
          <SquaresFour size={20} weight="fill" color="var(--pos-sidebar-atxt)" />
          <span className="mob-nav__pill-label" style={{ fontSize: 14 }}>Mesas</span>
          {activeMesasCount > 0 && (
            <span className="mob-nav__badge">
              {activeMesasCount} {activeMesasCount === 1 ? 'activa' : 'activas'}
            </span>
          )}
        </button>

        {/* Derecha: Sync */}
        <button
          type="button"
          className="mob-nav__btn"
          aria-label="Estado de sincronización"
          onClick={handleOpenSyncModal}
          onPointerDown={() => setSyncPressed(true)}
          onPointerUp={() => setSyncPressed(false)}
          onPointerCancel={() => setSyncPressed(false)}
          onPointerLeave={() => setSyncPressed(false)}
          style={{
            transform: syncPressed ? 'scale(0.88)' : undefined,
            opacity: syncing ? 0.55 : syncPressed ? 0.8 : 1,
            transition: 'transform 120ms ease, opacity 120ms ease',
            position: 'relative',
          }}
        >
          <ArrowsClockwise
            size={22}
            weight="bold"
            color={syncIconColor}
            className={syncing ? 'spin-fast' : undefined}
          />
          {/* Punto de estado */}
          <span style={{
            position: 'absolute',
            top: 4,
            right: 4,
            fontSize: 7,
            lineHeight: 1,
            color: !syncStatus.online
              ? 'var(--status-reserved)'
              : syncStatus.hasError
                ? 'var(--status-closed)'
                : syncStatus.supabaseOk
                  ? 'var(--status-active)'
                  : 'transparent',
          }}>●</span>
        </button>
      </div>

      {/* ── Vaul Sheet del menú (mismo que el resto de sidebars) ───────── */}
      <VaulDrawer.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <VaulDrawer.Portal>
          <VaulDrawer.Content className="vaul-content mob-sheet">
            <VaulDrawer.Title className="sr-only">Menú principal</VaulDrawer.Title>
            <VaulDrawer.Description className="sr-only">
              Navegación principal del punto de venta
            </VaulDrawer.Description>
            <div className="vaul-handle" />

            {/* Cabecera */}
            <Group px="lg" py="md" gap={12} align="center" className="mob-sheet__header">
              <div className="mob-sheet__logo-box">
                <ForkKnife size={22} weight="fill" color="var(--pos-sidebar-atxt)" />
              </div>
              <Stack gap={0}>
                <Text fw={900} size="md" c="var(--pos-sidebar-atxt)" lh={1.1} truncate style={{ maxWidth: '200px' }}>
                  {localStorage.getItem('pos_org_name_cached') || 'POS Restaurante'}
                </Text>
                <Text size="xs" c="var(--pos-sidebar-txt)">Sistema de comandas</Text>
              </Stack>
            </Group>

            {/* Ítems de navegación */}
            <div className="vaul-body" style={{ overflowY: 'auto', flex: 1 }} data-vaul-no-drag>
              <Stack gap={2} p="sm">
                {NAV_ITEMS.map((item) => (
                  <SheetNavItem key={item.label} {...item} onClick={() => setMenuOpen(false)} />
                ))}
              </Stack>

              <Divider color="var(--ui-primary-layer)" mx="md" my="xs" />

              {/* Footer: usuario + sync + logout */}
              <Stack gap={0} p="sm" pb="lg">
                {/* Usuario */}
                <Group gap={14} px={16} py={12} wrap="nowrap">
                  <Avatar size={44} radius={12} color="green" style={{ flexShrink: 0 }}>
                    <User size={22} weight="regular" />
                  </Avatar>
                  <Stack gap={1} style={{ flex: 1 }}>
                    <Text fw={700} size="md" c="var(--pos-sidebar-atxt)">{userName}</Text>
                    <Text size="xs" c="var(--pos-sidebar-txt)">{userRole}</Text>
                  </Stack>
                </Group>

                {/* Sync */}
                <UnstyledButton
                  onClick={() => { setMenuOpen(false); handleOpenSyncModal(); }}
                  px={16} py={12}
                  style={{ borderRadius: 14, display: 'flex', alignItems: 'center', gap: 14 }}
                >
                  <div className="mob-sheet__action-icon" style={{ position: 'relative' }}>
                    <ArrowsClockwise
                      size={22}
                      weight="bold"
                      color={syncStatus.hasError ? 'var(--status-closed)' : 'var(--pos-sidebar-atxt)'}
                      style={{ opacity: syncStatus.online ? 1 : 0.4 }}
                      className={syncing ? 'spin-fast' : undefined}
                    />
                    <span style={{
                      position: 'absolute', top: -2, right: -2, fontSize: 7,
                      color: !syncStatus.online ? 'var(--status-reserved)' : syncStatus.hasError ? 'var(--status-closed)' : syncStatus.supabaseOk ? 'var(--status-active)' : 'transparent',
                    }}>●</span>
                  </div>
                  <Stack gap={1}>
                    <Text fw={600} size="md" c="var(--pos-sidebar-atxt)">Sincronización</Text>
                    <Text size="xs" c="var(--pos-sidebar-txt)">
                      {!syncStatus.online ? 'Sin conexión' : syncStatus.hasError ? `Error en ${syncStatus.errorCollections.length} colección(es)` : syncStatus.supabaseOk === null ? 'Verificando...' : 'Todo sincronizado'}
                    </Text>
                  </Stack>
                  <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 12 }}>→</span>
                </UnstyledButton>

                {/* Instalar Aplicación */}
                {isInstallable && (
                  <UnstyledButton
                    onClick={() => { setMenuOpen(false); handleInstallClick(); }}
                    px={16} py={12}
                    style={{ borderRadius: 14, display: 'flex', alignItems: 'center', gap: 14 }}
                  >
                    <div className="mob-sheet__action-icon" style={{ backgroundColor: 'var(--ui-primary-soft)' }}>
                      <DownloadSimple size={22} weight="bold" color="var(--ui-primary)" />
                    </div>
                    <Stack gap={1}>
                      <Text fw={600} size="md" c="var(--pos-sidebar-atxt)">Instalar Aplicación</Text>
                      <Text size="xs" c="var(--pos-sidebar-txt)">Descarga la app en tu dispositivo</Text>
                    </Stack>
                  </UnstyledButton>
                )}

                {/* Cerrar sesión */}
                <UnstyledButton
                  onClick={() => { logoutAdmin(); setMenuOpen(false); }}
                  px={16} py={12}
                  style={{ borderRadius: 14, display: 'flex', alignItems: 'center', gap: 14 }}
                >
                  <div className="mob-sheet__action-icon mob-sheet__action-icon--danger">
                    <SignOut size={22} weight="bold" color="var(--mantine-color-red-4)" />
                  </div>
                  <Text fw={600} size="md" c="var(--mantine-color-red-4)">Cerrar Sesión</Text>
                </UnstyledButton>
              </Stack>
            </div>
          </VaulDrawer.Content>
        </VaulDrawer.Portal>
      </VaulDrawer.Root>

      <SyncStatusModal
        opened={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        status={syncStatus}
        onForceSync={handleForceSync}
        syncing={syncing}
      />
    </>
  );
}
