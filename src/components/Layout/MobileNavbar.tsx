import { useState } from'react';
import { NavLink, useNavigate, useLocation } from'react-router-dom';
import {
 Drawer,
 DrawerPortal,
 DrawerOverlay,
 DrawerContent,
 DrawerTitle,
 DrawerDescription,
 DrawerHandle,
} from'@/components/ui/drawer';
import { Button } from'@/components/ui/button';
import { Avatar, AvatarFallback } from'@/components/ui/avatar';
import {
 List,
 SquaresFour,
 Receipt,
 CalendarCheck,
 Bag,
 Gear,
 Users,
 ChartBar,
 CurrencyDollar,
 ArrowsClockwise,
 UserGear,
 SignOut,
} from'@phosphor-icons/react';
import { cn } from'@/lib/utils';
import { useAuth } from'../../context/AuthContext';
import type { SyncStatus } from'../../db/rxdb';

export interface MobileCartInfo {
 mesaNombre: string;
 itemCount: number;
 total: number;
}

const navItemsMobile = [
 { label:'Mesas', to:'/v2/mesas', icon: SquaresFour },
 { label:'Órdenes', to:'/v2/ordenes', icon: Receipt },
 { label:'Reservas', to:'/v2/reservas', icon: CalendarCheck },
 { label:'Centro de Ventas', to:'/v2/centro-ventas', icon: CurrencyDollar },
 { label:'Clientes', to:'/v2/clientes', icon: Users },
 { label:'Productos', to:'/v2/menu', icon: Bag },
 { label:'Métricas', to:'/v2/metricas', icon: ChartBar },
 { label:'Ajustes', to:'/v2/ajustes', icon: Gear },
];

function initials(name: string) {
 return name
 .split('')
 .filter(Boolean)
 .slice(0, 2)
 .map((s) => s[0]?.toUpperCase())
 .join('');
}

export function MobileNavbar({ syncStatus, syncing, onOpenSync, cart, onOpenCart }: {
 syncStatus: SyncStatus;
 syncing: boolean;
 onOpenSync: () => void;
 cart?: MobileCartInfo | null;
 onOpenCart?: () => void;
}) {
 const location = useLocation();
 const navigate = useNavigate();
 const { currentMesero, adminUser, logoutMesero, logoutAdmin } = useAuth();
 const [menuOpen, setMenuOpen] = useState(false);

 const userName = currentMesero?.nombre || adminUser?.email ||'Usuario';
 const userRole = currentMesero ?'Mesero':'Administrador';

 const handleLogout = () => {
 setMenuOpen(false);
 if (currentMesero) {
 logoutMesero();
 } else {
 logoutAdmin();
 }
 };

 const isMesasActive = location.pathname ==='/v2/mesas'|| location.pathname.startsWith('/v2/mesas');

 return (
 <>
 <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2 pointer-events-none">
 <nav className="flex items-center w-full max-w-md pointer-events-auto">
 {cart && cart.itemCount > 0 ? (
 /* Estado carrito: Layout de 3 piezas idéntico al normal */
 <div className="flex items-center justify-between w-full gap-3 h-14">
 
 {/* IZQUIERDA: Slot para Categorías/Volver */}
 <div id="mobile-navbar-cart-action-slot" onClick={e => e.stopPropagation()} className="shrink-0 flex items-center justify-center w-14 h-14"></div>
 
 {/* CENTRO: Info de comanda */}
 <button
 type="button"onClick={onOpenCart}
 className="flex flex-col items-center justify-center flex-1 h-14 px-4 rounded-full bg-emerald-600 text-white shadow-[0_8px_16px_rgba(5,150,105,0.3)] border border-emerald-500/50 cursor-pointer active:scale-[0.96] transition-transform min-w-0">
 <span className="text-[14px] font-extrabold truncate w-full text-center leading-tight">
 {cart.mesaNombre}
 </span>
 <span className="text-[12px] text-emerald-50 font-medium truncate w-full text-center mt-0.5">
 {cart.itemCount} {cart.itemCount === 1 ?'item':'items'} · ${cart.total.toFixed(2)}
 </span>
 </button>

 {/* DERECHA: Slot para Buscar */}
 <div id="mobile-navbar-cart-search-slot" onClick={e => e.stopPropagation()} className="shrink-0 flex items-center justify-center w-14 h-14"></div>
 </div>
 ) : (
 /* Estado normal: Menú, Mesas y Sync como 3 botones independientes */
 <div className="flex items-center justify-between w-full gap-3">
 <button
 type="button"onClick={() => setMenuOpen(true)}
 title="Secciones"className="flex items-center justify-center w-14 h-14 rounded-full bg-nav text-nav-foreground shadow-lg shadow-black/20 cursor-pointer active:scale-95 transition-transform shrink-0">
 <List size={22} />
 </button>

 <button
 type="button"onClick={() => navigate('/v2/mesas')}
 title="Mesas"className={cn("flex items-center justify-center gap-2 flex-1 h-14 rounded-full shadow-lg shadow-black/20 cursor-pointer active:scale-[0.98] transition-all",
 isMesasActive ?"bg-primary text-primary-foreground":"bg-nav text-nav-foreground")}
 >
 <SquaresFour size={20} weight={isMesasActive ?'fill':'regular'} />
 <span className="text-sm font-bold">Mesas</span>
 </button>

 <button
 type="button"onClick={onOpenSync}
 title="Estado de Sincronización"className="relative flex items-center justify-center w-14 h-14 rounded-full bg-nav text-nav-foreground shadow-lg shadow-black/20 cursor-pointer active:scale-95 transition-transform shrink-0">
 <ArrowsClockwise size={22} className={syncing ?'animate-spin':''} />
 <span
 className={cn("absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-nav",
 !syncStatus.online ?"bg-amber-500": syncStatus.hasError ?"bg-destructive":"bg-emerald-500")}
 />
 </button>
 </div>
 )}
 </nav>
 </div>

 <Drawer open={menuOpen} onOpenChange={setMenuOpen} dismissible handleOnly>
 <DrawerPortal>
 <DrawerOverlay />
 <DrawerContent className="fixed bottom-0 left-0 right-0 h-[95vh] max-h-[95vh] bg-card rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.25)] z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden">
 <DrawerTitle className="sr-only">Secciones</DrawerTitle>
 <DrawerDescription className="sr-only">Navegación entre secciones de la app</DrawerDescription>
 <DrawerHandle />

 {/* Secciones del menú — lista principal, ítems grandes y táctiles */}
 <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-2 flex flex-col gap-1.5">
 {navItemsMobile.map((item) => {
 const Icon = item.icon;
 return (
 <NavLink
 key={item.to}
 to={item.to}
 onClick={() => setMenuOpen(false)}
 className={({ isActive }) =>
 cn('flex items-center gap-4 px-4 py-3.5 rounded-2xl font-extrabold text-sm transition-colors',
 isActive
 ?'bg-primary text-primary-foreground':'text-foreground active:bg-muted')
 }
 >
 {({ isActive }) => (
 <>
 <span className={cn("flex items-center justify-center w-10 h-10 rounded-xl shrink-0",
 isActive ?"bg-primary-foreground/15":"bg-muted")}>
 <Icon size={20} weight={isActive ?'fill':'regular'} />
 </span>
 <span>{item.label}</span>
 </>
 )}
 </NavLink>
 );
 })}
 </nav>

 {/* Paper de usuario + cierre de sesión, siempre al final */}
 <div className="shrink-0 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
 <div className="rounded-2xl bg-muted/60 p-3 flex flex-col gap-3">
 <div className="flex items-center gap-3 px-1">
 <Avatar size="lg">
 <AvatarFallback>{initials(userName)}</AvatarFallback>
 </Avatar>
 <div className="flex flex-col min-w-0 flex-1">
 <span className="font-extrabold text-sm text-foreground truncate">{userName}</span>
 <span className="text-xs text-muted-foreground font-semibold capitalize">{userRole}</span>
 </div>
 <Button
 variant="ghost"size="icon"title="Configuración de Cuenta"onClick={() => {
 setMenuOpen(false);
 navigate('/ajustes');
 }}
 >
 <UserGear size={18} />
 </Button>
 </div>

 <Button
 variant="destructive"className="w-full justify-center gap-2 font-bold text-xs bg-destructive/10 text-destructive"onClick={handleLogout}
 >
 <SignOut size={16} /> Cerrar Sesión
 </Button>
 </div>
 </div>
 </DrawerContent>
 </DrawerPortal>
 </Drawer>
 </>
 );
}
