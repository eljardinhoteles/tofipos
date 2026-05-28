import {
  Stack,
  Tooltip,
  UnstyledButton,
  Center,
  Box,
  Menu,
} from '@mantine/core';
import { SyncStatusModal } from '../Common/SyncStatusModal';
import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { subscribeSyncStatus, pingSyncStatus, forceSyncAll, type SyncStatus } from '../../db/rxdb';
import {
  SquaresFour,
  Receipt,
  CalendarCheck,
  Bag,
  Gear,
  Users,
  User,
  SignOut,
  ArrowsClockwise,
  ChartBar,
} from '@phosphor-icons/react';

const navItems = [
  { label: 'Mesas',     to: '/mesas',    icon: SquaresFour },
  { label: 'Órdenes',  to: '/ordenes',  icon: Receipt },
  { label: 'Reservas', to: '/reservas', icon: CalendarCheck },
  { label: 'Clientes', to: '/clientes', icon: Users },
  { label: 'Productos',to: '/menu',     icon: Bag },
  { label: 'Métricas', to: '/metricas', icon: ChartBar },
  { label: 'Ajustes',  to: '/ajustes',  icon: Gear },
];

interface NavbarLinkProps {
  icon: React.ElementType;
  label: string;
  to: string;
}

function NavbarLink({ icon: Icon, label, to }: NavbarLinkProps) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to);

  return (
    <Tooltip label={label} position="right" transitionProps={{ duration: 0 }} withArrow>
      <UnstyledButton
        component={NavLink}
        to={to}
        aria-label={label}
        className={`sidebar-nav-link ${isActive ? 'sidebar-nav-link--active' : ''}`}
      >
        <Icon size={26} weight={isActive ? 'fill' : 'regular'} />
      </UnstyledButton>
    </Tooltip>
  );
}

function SyncStatusDot({ status }: { status: SyncStatus }) {
  if (!status.online) return <span style={{ color: 'var(--status-reserved)', fontSize: 8 }}>●</span>;
  if (status.hasError) return <span style={{ color: 'var(--status-closed)', fontSize: 8 }}>●</span>;
  if (status.supabaseOk === null) return null;
  return <span style={{ color: 'var(--status-active)', fontSize: 8 }}>●</span>;
}

export function MainSidebar() {
  const { currentMesero, logoutAdmin } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    online: navigator.onLine,
    supabaseOk: null,
    hasError: false,
    errorCollections: [],
    activePushQueue: 0,
    collections: {},
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const userName = currentMesero?.nombre || 'Admin';

  useEffect(() => {
    const unsub = subscribeSyncStatus(setSyncStatus);
    pingSyncStatus();
    return unsub;
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    pingSyncStatus();
    const interval = setInterval(pingSyncStatus, 30_000);
    return () => clearInterval(interval);
  }, [modalOpen]);

  const handleForceSync = useCallback(async () => {
    setSyncing(true);
    await forceSyncAll();
    await pingSyncStatus();
    setTimeout(() => setSyncing(false), 1200);
  }, []);

  const handleOpenModal = () => {
    setModalOpen(true);
    pingSyncStatus();
  };

  const btnColor = !syncStatus.online
    ? 'rgba(255,255,255,0.4)'
    : syncStatus.hasError
      ? 'var(--status-closed)'
      : 'var(--status-active)';

  const tooltipLabel = !syncStatus.online
    ? 'Sin conexión — click para detalles'
    : syncStatus.hasError
      ? 'Error en sync — click para detalles'
      : syncStatus.supabaseOk === null
        ? 'Verificando sync...'
        : 'Sync activo — click para detalles';

  return (
    <Box style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Logo */}
      <Center className="sidebar-brand">
        <img
          src="/Icon-app.webp"
          alt="POS Food"
          aria-hidden="true"
          style={{ width: 28, height: 28, objectFit: 'contain' }}
        />
      </Center>

      {/* Nav */}
      <Stack align="center" justify="center" gap={6} className="sidebar-nav-stack">
        {navItems.map(item => (
          <NavbarLink key={item.label} {...item} />
        ))}
      </Stack>

      {/* Footer */}
      <Stack align="center" gap={4} className="sidebar-footer">
        <Tooltip label={tooltipLabel} position="right" withArrow transitionProps={{ duration: 0 }}>
          <UnstyledButton
            onClick={handleOpenModal}
            className={`sidebar-sync-button ${syncing ? 'sidebar-sync-button--syncing' : ''}`}
            style={{ color: btnColor, position: 'relative' }}
          >
            <ArrowsClockwise
              size={20}
              weight="bold"
              className={syncing ? 'spin-fast' : undefined}
            />
            <Box style={{ position: 'absolute', top: 2, right: 2 }}>
              <SyncStatusDot status={syncStatus} />
            </Box>
          </UnstyledButton>
        </Tooltip>

        <Menu position="right-end" offset={15} withArrow radius="md">
          <Menu.Target>
            <Tooltip label={userName} position="right" withArrow transitionProps={{ duration: 0 }}>
              <UnstyledButton className="sidebar-user-button">
                <User size={22} weight="regular" />
              </UnstyledButton>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Cuenta</Menu.Label>
            <Menu.Item leftSection={<User size={14} />}>Mi Perfil</Menu.Item>
            <Menu.Item leftSection={<ArrowsClockwise size={14} />} onClick={handleOpenModal}>
              Estado de Sincronización
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<SignOut size={14} />} onClick={() => logoutAdmin()}>
              Cerrar Sesión
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Stack>

      <SyncStatusModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        status={syncStatus}
        onForceSync={handleForceSync}
        syncing={syncing}
      />
    </Box>
  );
}
