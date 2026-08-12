import { useState, useEffect, useCallback } from'react';
import { NavLink, useLocation } from'react-router-dom';
import { useAuth } from'../../context/AuthContext';
import { subscribeSyncStatus, pingSyncStatus, forceSyncAll, type SyncStatus } from'../../db/rxdb';
import { SyncStatusModal } from'../Common/SyncStatusModal';
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
} from'@phosphor-icons/react';
import { cn } from'@/lib/utils';

const navItemsV2 = [
 { label:'Mesas', to:'/v2/mesas', icon: SquaresFour },
 { label:'Órdenes', to:'/v2/ordenes', icon: Receipt },
 { label:'Reservas', to:'/v2/reservas', icon: CalendarCheck },
 { label:'Centro de Ventas', to:'/v2/centro-ventas', icon: CurrencyDollar },
 { label:'Clientes', to:'/v2/clientes', icon: Users },
 { label:'Productos', to:'/v2/menu', icon: Bag },
 { label:'Métricas', to:'/v2/metricas', icon: ChartBar },
 { label:'Ajustes', to:'/v2/ajustes', icon: Gear },
];

export function MainSidebarV2() {
 const { currentMesero, logoutAdmin } = useAuth();
 const location = useLocation();
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

 const userName = currentMesero?.nombre ||'Admin';

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
 <aside className="w-20 h-full bg-nav text-nav-foreground flex flex-col justify-between items-center py-4 border-r border-nav-foreground/10 shrink-0">
 {/* Brand Icon */}
 <div className="w-10 h-10 rounded-xl bg-nav-foreground/10 flex items-center justify-center mb-6">
 <img
 src="/Icon-app.webp"alt="POS Food"aria-hidden="true"className="w-7 h-7 object-contain"/>
 </div>

 {/* Navigation */}
 <nav className="flex-1 flex flex-col gap-2 items-center w-full">
 {navItemsV2.map((item) => {
 const Icon = item.icon;
 const isActive = location.pathname === item.to || (item.to !=='/v2/mesas'&& location.pathname.startsWith(item.to));
 return (
 <NavLink
 key={item.label}
 to={item.to}
 title={item.label}
 className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer",
 isActive
 ?"bg-primary text-primary-foreground shadow-md shadow-primary/20":"text-nav-foreground/50")}
 >
 <Icon size={24} weight={isActive ?'fill':'regular'} />
 </NavLink>
 );
 })}
 </nav>

 {/* Footer / Status & User */}
 <div className="flex flex-col items-center gap-3 w-full pt-4 border-t border-nav-foreground/10 relative">
 <button
 type="button"onClick={() => setModalOpen(true)}
 title="Estado de Sincronización"className="w-10 h-10 rounded-xl bg-nav-foreground/10 text-nav-foreground/70 flex items-center justify-center relative cursor-pointer active:scale-95 transition-all">
 <ArrowsClockwise size={20} className={syncing ?'animate-spin':''} />
 <span
 className={cn("absolute top-1.5 right-1.5 w-2 h-2 rounded-full",
 !syncStatus.online ?"bg-amber-500": syncStatus.hasError ?"bg-red-500":"bg-emerald-500")}
 />
 </button>

 <div className="relative">
 <button
 type="button"onClick={() => setUserMenuOpen(!userMenuOpen)}
 title={userName}
 className="w-10 h-10 rounded-xl bg-nav-foreground/10 text-nav-foreground/70 flex items-center justify-center cursor-pointer active:scale-95 transition-all">
 <User size={20} />
 </button>

 {userMenuOpen && (
 <div className="absolute left-14 bottom-0 w-48 bg-nav border border-nav-foreground/15 rounded-xl shadow-xl p-2 z-50 flex flex-col gap-1 text-sm text-nav-foreground/90">
 <div className="px-3 py-1.5 font-bold border-b border-nav-foreground/15 text-nav-foreground/70">
 {userName}
 </div>
 <button
 type="button"onClick={() => { setUserMenuOpen(false); setModalOpen(true); }}
 className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer">
 <ArrowsClockwise size={16} /> Estado Sync
 </button>
 <button
 type="button"onClick={() => logoutAdmin()}
 className="flex items-center gap-2 px-3 py-2 rounded-lg text-destructive text-left transition-colors cursor-pointer">
 <SignOut size={16} /> Cerrar Sesión
 </button>
 </div>
 )}
 </div>
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
