import { useState, useMemo, useEffect } from'react';
import { type Cliente } from'../db/database';
import {
 Users, Plus, Trash, PencilSimple, MagnifyingGlass,
 TrendUp, ClockCounterClockwise
} from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { useUI } from'../context/UIContext';
import { ClienteFormModal } from'../components/Clientes/ClienteFormModal';
import { useRxClientes } from'../hooks/useRxClientes';
import { useRxComandas } from'../hooks/useRxComandas';
import { initVerticalRxDb } from'../db/rxdb';
import { cn } from'@/lib/utils';
import { Input } from'@/components/ui/input';

const getWhatsAppLink = (telefono: string) => {
  const cleanNumber = telefono.replace(/\D/g, '');
  return cleanNumber ? `https://wa.me/${cleanNumber}` : null;
};

export default function ClientesV2() {
 const [searchQuery, setSearchQuery] = useState('');
 const [page, setPage] = useState(1);
 const [newOpened, setNewOpened] = useState(false);
 const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
 const { openConfirm } = useUI();
 const itemsPerPage = 8;

 const { clientes } = useRxClientes();
 const { comandas } = useRxComandas();

 const filteredClientes = useMemo(() => {
 return clientes.filter(c =>
 c.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
 c.telefono?.includes(searchQuery) ||
 c.dni?.includes(searchQuery)
 );
 }, [clientes, searchQuery]);

 const totalPages = Math.max(1, Math.ceil(filteredClientes.length / itemsPerPage));

 const paginatedClientes = useMemo(() => {
 const start = (page - 1) * itemsPerPage;
 return filteredClientes.slice(start, start + itemsPerPage);
 }, [filteredClientes, page]);

 const stats = useMemo(() => {
 const total = clientes.length;
 const thisMonth = clientes.filter(c => {
 const date = new Date(c.created_at);
 const now = new Date();
 return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
 }).length;

 const frequent = clientes.filter(c => {
 const count = comandas.filter(com => com.cliente === c.nombre).length;
 return count >= 3;
 }).length;

 return { total, thisMonth, frequent };
 }, [clientes, comandas]);

 const handleOpenEdit = (cliente: Cliente) => {
 if (cliente.id ==='99999999999') {
 showToast.error('Acción no permitida','El cliente Consumidor Final no puede ser editado.');
 return;
 }
 setEditingCliente(cliente);
 setNewOpened(true);
 };

 const handleCloseModal = () => {
 setEditingCliente(null);
 setNewOpened(false);
 };

 useEffect(() => {
 setPage(1);
 }, [searchQuery]);

 useEffect(() => {
 if (page > totalPages) {
 setPage(totalPages);
 }
 }, [page, totalPages]);

 const handleDelete = (id: string) => {
 if (id ==='99999999999') {
 showToast.error('Acción no permitida','El cliente Consumidor Final no puede ser eliminado.');
 return;
 }
 openConfirm('¿Eliminar Cliente?','¿Estás seguro de eliminar este cliente de la base de datos? Esta acción no se puede deshacer.',
 async () => {
 const rxDb = await initVerticalRxDb();
 const doc = await rxDb.clientes.findOne(id).exec();
 if (doc) await doc.remove();
 showToast.error('Cliente eliminado');
 }
 );
 };

 return (
 <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
 {/* ── HEADER PRINCIPAL ─────────────────────────────── */}
 <header className="h-14 px-6 bg-card border-b border-border flex items-center justify-between shadow-xs shrink-0 gap-4">
 <div className="flex items-center gap-3 shrink-0">
 <button
 type="button"title="Nuevo Cliente"onClick={() => {
 setEditingCliente(null);
 setNewOpened(true);
 }}
 className="w-9 h-9 rounded-lg bg-primary active:scale-95 text-primary-foreground flex items-center justify-center transition-all shadow-xs cursor-pointer">
 <Plus size={18} weight="bold"/>
 </button>

 <div className="w-[1px] h-6 bg-border shrink-0"/>

 <div className="relative w-72 shrink-0">
 <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10"/>
 <Input
 type="text"placeholder="Buscar por nombre, teléfono o DNI..."value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="pl-9 h-9 text-xs"/>
 </div>
 </div>

 {/* Stats rápidos */}
 <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground shrink-0">
 <div className="flex items-center gap-1.5">
 <Users size={16} className="text-primary"/>
 <span>{stats.total} Total</span>
 </div>
 <div className="w-1 h-1 rounded-full bg-border"/>
 <div className="flex items-center gap-1.5">
 <TrendUp size={16} className="text-emerald-600"/>
 <span>{stats.thisMonth} Nuevos</span>
 </div>
 <div className="w-1 h-1 rounded-full bg-border"/>
 <div className="flex items-center gap-1.5">
 <ClockCounterClockwise size={16} className="text-amber-600"/>
 <span>{stats.frequent} Frecuentes</span>
 </div>
 </div>
 </header>

 {/* Contenido / Tabla */}
 <main className="flex-1 overflow-y-auto p-6 flex flex-col justify-between">
 {filteredClientes.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
 <div className="w-24 h-24 flex items-center justify-center">
 <img src="/Clients.webp"alt=""aria-hidden="true"className="w-full h-full object-contain"/>
 </div>
 <h2 className="text-foreground font-bold text-lg">No se encontraron clientes</h2>
 <p className="text-muted-foreground text-xs">Intenta cambiar el criterio de búsqueda o registra uno nuevo.</p>
 </div>
 ) : (
 <div className="bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
 <table className="w-full text-left text-xs">
 <thead className="bg-muted border-b border-border text-muted-foreground font-bold uppercase tracking-wider">
 <tr>
 <th className="px-6 py-3.5">Cliente</th>
 <th className="px-6 py-3.5">Contacto</th>
 <th className="px-6 py-3.5">Documento</th>
 <th className="px-6 py-3.5">Facturación</th>
 <th className="px-6 py-3.5">Notas</th>
 <th className="px-6 py-3.5 text-right">Acciones</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {paginatedClientes.map((cliente) => {
 const isSystemCliente = cliente.id ==='99999999999';
 return (
 <tr key={cliente.id} className="transition-colors">
 <td className="px-6 py-4">
 <div className="flex flex-col">
 <span className="font-extrabold text-foreground text-sm">{cliente.nombre}</span>
 <span className="text-[11px] text-muted-foreground">
 Registrado {new Date(cliente.created_at).toLocaleDateString()}
 </span>
 </div>
 </td>
 <td className="px-6 py-4">
 <div className="flex flex-col gap-0.5">
 {cliente.telefono ? (
 <a
 href={getWhatsAppLink(cliente.telefono) ||'#'}
 target="_blank"rel="noreferrer"className="font-bold text-emerald-600">
 {cliente.telefono}
 </a>
 ) : (
 <span className="text-muted-foreground">Sin teléfono</span>
 )}
 {cliente.email && (
 <span className="text-[11px] text-muted-foreground truncate">{cliente.email}</span>
 )}
 </div>
 </td>
 <td className="px-6 py-4">
 <span className={cn("px-2.5 py-1 rounded-md font-semibold text-[11px]",
 cliente.dni ?"bg-primary/10 text-primary":"bg-muted text-muted-foreground")}>
 {cliente.dni ||'Sin documento'}
 </span>
 </td>
 <td className="px-6 py-4">
 {cliente.nombre_factura || cliente.numero_doc ? (
 <div className="flex flex-col gap-1">
 {cliente.nombre_factura && (
 <span className="font-semibold text-foreground">{cliente.nombre_factura}</span>
 )}
 {cliente.numero_doc && (
 <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold text-[10px] w-fit">
 {(cliente.tipo_doc ||'cedula').toUpperCase()} · {cliente.numero_doc}
 </span>
 )}
 </div>
 ) : (
 <span className="text-muted-foreground">Sin datos</span>
 )}
 </td>
 <td className="px-6 py-4 max-w-xs">
 <span className="text-muted-foreground line-clamp-2">{cliente.notas ||'Sin notas'}</span>
 </td>
 <td className="px-6 py-4 text-right">
 <div className="flex items-center justify-end gap-1">
 {!isSystemCliente ? (
 <button
 type="button"onClick={() => handleOpenEdit(cliente)}
 className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center cursor-pointer transition-colors">
 <PencilSimple size={16} />
 </button>
 ) : (
 <div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center cursor-not-allowed">
 <PencilSimple size={16} />
 </div>
 )}

 {!isSystemCliente ? (
 <button
 type="button"onClick={() => handleDelete(cliente.id)}
 className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center cursor-pointer transition-colors">
 <Trash size={16} />
 </button>
 ) : (
 <div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center cursor-not-allowed">
 <Trash size={16} />
 </div>
 )}
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}

 {/* Paginación */}
 {filteredClientes.length > 0 && (
 <div className="flex items-center justify-between pt-4">
 <span className="text-xs font-semibold text-muted-foreground">
 Mostrando {Math.min((page - 1) * itemsPerPage + 1, filteredClientes.length)}-
 {Math.min(page * itemsPerPage, filteredClientes.length)} de {filteredClientes.length}
 </span>

 <div className="flex items-center gap-1">
 <button
 type="button"disabled={page === 1}
 onClick={() => setPage(p => Math.max(1, p - 1))}
 className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground disabled:opacity-40 cursor-pointer">
 Anterior
 </button>
 <span className="px-3 text-xs font-bold text-foreground">
 Página {page} de {totalPages}
 </span>
 <button
 type="button"disabled={page === totalPages}
 onClick={() => setPage(p => Math.min(totalPages, p + 1))}
 className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground disabled:opacity-40 cursor-pointer">
 Siguiente
 </button>
 </div>
 </div>
 )}
 </main>

 <ClienteFormModal
 opened={newOpened}
 onClose={handleCloseModal}
 editingCliente={editingCliente}
 />
 </div>
 );
}
