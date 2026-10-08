import { useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { subscribeSyncStatus, pingSyncStatus, forceSyncAll, type SyncStatus } from '../../db/rxdb';
import { SyncStatusModal } from '../Common/SyncStatusModal';
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
  CurrencyDollar,
  Pulse,
  Buildings,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useUI } from '../../context/UIContext';
import { NAV_ACCENT } from '../../lib/navAccent';

// Cada módulo tiene su propio color de activo (claro, pensado para el fondo oscuro
// de la barra). Es identidad de navegación: no sustituye a los colores semánticos.
const navItemsV2 = [
  { label: 'Mesas', to: '/v2/mesas', icon: SquaresFour, accent: NAV_ACCENT['/v2/mesas'] },
  { label: 'Órdenes', to: '/v2/ordenes', icon: Receipt, accent: NAV_ACCENT['/v2/ordenes'] },
  { label: 'Reservas', to: '/v2/reservas', icon: CalendarCheck, accent: NAV_ACCENT['/v2/reservas'] },
  { label: 'Ventas', to: '/v2/centro-ventas', icon: CurrencyDollar, accent: NAV_ACCENT['/v2/centro-ventas'] },
  { label: 'Clientes', to: '/v2/clientes', icon: Users, accent: NAV_ACCENT['/v2/clientes'] },
  { label: 'Productos', to: '/v2/menu', icon: Bag, accent: NAV_ACCENT['/v2/menu'] },
  { label: 'Métricas', to: '/v2/metricas', icon: ChartBar, accent: NAV_ACCENT['/v2/metricas'] },
];

const settingsItem = { label: 'Ajustes', to: '/v2/ajustes', icon: Gear, accent: NAV_ACCENT['/v2/ajustes'] };

// Módulos ocultos del sidebar para roles operativos (mesero/cajero) —
// solo visuales, no impide navegar ahí directamente por URL.
const RESTRICTED_LABELS_BY_ROLE: Record<string, string[]> = {
  mesero: ['Reservas', 'Métricas'],
  cajero: ['Reservas', 'Métricas'],
};

type NavItem = typeof settingsItem;

// Micro-animación de los iconos al pasar el cursor (se desactiva con "reducir movimiento").
const ICONO_ANIM = 'transition-transform duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none';

// Módulos: icono + etiqueta. El activo se marca con un borde izquierdo recto.
function ModuleLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <UtilTooltip label={item.label}>
    <NavLink
      to={item.to}
      aria-label={item.label}
      style={{ '--mod': item.accent } as React.CSSProperties}
      className={cn(
        // Alto fijo: solo el activo muestra el título, el resto es solo icono; así
        // la lista no se mueve al cambiar de módulo.
        'group/mod w-full h-[68px] flex flex-col items-center justify-center gap-1.5 border-l-[3px] outline-none transition-colors',
        'focus-visible:bg-nav-foreground/10',
        isActive
          ? 'border-(--mod) text-(--mod)'
          : 'border-transparent text-nav-foreground/90 hover:text-nav-foreground'
      )}
    >
      <Icon size={24} weight={isActive ? 'fill' : 'regular'} className={cn(ICONO_ANIM, 'group-hover/mod:scale-110 group-hover/mod:-translate-y-0.5')} />
      {isActive && (
        <span className="w-full px-1 text-center text-[11px] leading-tight truncate font-bold">
          {item.label}
        </span>
      )}
    </NavLink>
    </UtilTooltip>
  );
}

// Utilidades del pie (ajustes, sync, cuenta): solo icono + tooltip, sin fondo.
const utilButtonClass =
  'relative size-11 rounded-lg bg-transparent text-nav-foreground/75 hover:bg-transparent hover:text-nav-foreground aria-expanded:bg-nav-foreground/10 aria-expanded:text-nav-foreground focus-visible:border-transparent focus-visible:ring-nav-foreground/40';

function UtilTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function MainSidebarV2() {
  const { currentMesero, adminUser, logoutAdmin, logoutMesero } = useAuth();
  const { setActividadOpen } = useUI();
  const location = useLocation();
  const restrictedLabels = currentMesero?.rol ? RESTRICTED_LABELS_BY_ROLE[currentMesero.rol] : undefined;
  const visibleNavItems = restrictedLabels
    ? navItemsV2.filter(item => !restrictedLabels.includes(item.label))
    : navItemsV2;
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userName = currentMesero?.nombre || adminUser?.user_metadata?.full_name || adminUser?.email?.split('@')[0] || 'Admin';
  const userRole = currentMesero ? ((currentMesero as any).rol === 'admin' ? 'Administrador' : 'Mesero') : 'Administrador';
  const userEmail: string | undefined = currentMesero ? undefined : adminUser?.email;
  const orgNombre = localStorage.getItem('pos_org_name_cached') || '';
  const userIniciales = userName.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join('') || 'U';
  const isActivePath = (to: string) =>
    location.pathname === to || (to !== '/v2/mesas' && location.pathname.startsWith(to));
  const settingsActive = isActivePath(settingsItem.to);

  const syncLabel = !syncStatus.online
    ? 'Sin conexión'
    : syncStatus.hasError
      ? 'Error de sincronización'
      : 'Sincronizado';
  const syncDot = !syncStatus.online ? 'bg-warning' : syncStatus.hasError ? 'bg-destructive' : 'bg-success';

  useEffect(() => {
    const unsub = subscribeSyncStatus(setSyncStatus);
    pingSyncStatus();
    return unsub;
  }, []);

  const handleForceSync = useCallback(async () => {
    setSyncing(true);
    await forceSyncAll();
    await pingSyncStatus();
    setTimeout(() => setSyncing(false), 1200);
  }, []);

  return (
    <aside className="w-[84px] h-full bg-nav text-nav-foreground flex flex-col items-center shrink-0 border-r border-transparent">
      {/* Misma altura que el header de las páginas (72px); sin línea, el marco es continuo. */}
      <div className="w-full h-[72px] shrink-0 flex items-center justify-center">
        <img src="/Icon-app.webp" alt="POS Food" aria-hidden="true" className="w-8 h-8 object-contain" />
      </div>

      <nav aria-label="Principal" className="flex-1 min-h-0 w-full overflow-y-auto hide-scrollbar flex flex-col items-center pb-2">
        {visibleNavItems.map(item => (
          <ModuleLink key={item.label} item={item} isActive={isActivePath(item.to)} />
        ))}
      </nav>

      <Separator className="bg-nav-foreground/10" />

      <div className="flex flex-col items-center gap-1 py-4">
        <UtilTooltip label="Actividad de hoy">
          <Button
            variant="ghost"
            size="icon"
            className={utilButtonClass}
            onClick={() => setActividadOpen(true)}
            aria-label="Abrir actividad de hoy"
          >
            <Pulse size={24} className={cn(ICONO_ANIM, 'group-hover/button:scale-110')} />
          </Button>
        </UtilTooltip>

        <UtilTooltip label={settingsItem.label}>
          <Button asChild variant="ghost" size="icon" className={cn(utilButtonClass, settingsActive && 'text-nav-foreground bg-nav-foreground/10')}>
            <NavLink to={settingsItem.to} aria-label={settingsItem.label}>
              <Gear size={24} weight={settingsActive ? 'fill' : 'regular'} className={cn(ICONO_ANIM, 'group-hover/button:rotate-90')} />
            </NavLink>
          </Button>
        </UtilTooltip>

        <UtilTooltip label={`Sincronización: ${syncLabel}`}>
          <Button
            variant="ghost"
            size="icon"
            className={utilButtonClass}
            onClick={() => setModalOpen(true)}
            aria-label={`Estado de sincronización: ${syncLabel}`}
          >
            <ArrowsClockwise size={24} className={cn(ICONO_ANIM, 'group-hover/button:rotate-180', syncing && 'animate-spin')} />
            <span className={cn('absolute top-2 right-2 size-2.5 rounded-full border-2 border-nav', syncDot)} />
          </Button>
        </UtilTooltip>

        <Popover open={userMenuOpen} onOpenChange={setUserMenuOpen}>
          <UtilTooltip label={userName}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className={utilButtonClass} aria-label={`Cuenta de ${userName}`}>
                <User size={24} weight={userMenuOpen ? 'fill' : 'regular'} className={cn(ICONO_ANIM, 'group-hover/button:scale-110')} />
              </Button>
            </PopoverTrigger>
          </UtilTooltip>
          <PopoverContent side="right" align="end" sideOffset={12} className="w-64 p-1.5">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span aria-hidden="true" className="size-10 rounded-xl bg-muted text-foreground flex items-center justify-center text-sm font-black shrink-0">
                {userIniciales}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-extrabold truncate">{userName}</div>
                <div className="text-xs font-semibold text-muted-foreground">{userRole}</div>
                {userEmail && <div className="text-[11px] text-muted-foreground truncate">{userEmail}</div>}
              </div>
            </div>
            <div className="px-3 pb-2 flex flex-col gap-1 text-xs text-muted-foreground">
              {orgNombre && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <Buildings size={13} className="shrink-0" />
                  <span className="truncate font-semibold">{orgNombre}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', syncDot)} />
                {syncLabel}
              </div>
            </div>
            <Separator className="my-1" />
            <Button
              variant="ghost"
              className="w-full justify-start h-9 px-3 rounded-lg"
              onClick={() => { setUserMenuOpen(false); setModalOpen(true); }}
            >
              <ArrowsClockwise size={16} /> Estado de sync
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start h-9 px-3 rounded-lg text-destructive hover:bg-destructive/10"
              onClick={() => (currentMesero ? logoutMesero() : logoutAdmin())}
            >
              <SignOut size={16} /> Cerrar sesión
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      <SyncStatusModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        status={syncStatus}
        onForceSync={handleForceSync}
        syncing={syncing}
      />
    </aside>
  );
}
