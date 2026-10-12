import { useState, useMemo, useEffect } from'react';
import { type Cliente } from'../db/database';
import {
 Plus, Trash, PencilSimple, MagnifyingGlass,

} from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { Paginacion } from'../components/Common/Paginacion';
import { useUI } from'../context/UIContext';
import { ClienteFormModal } from'../components/Clientes/ClienteFormModal';
import { useRxClientes } from'../hooks/useRxClientes';
import { useRxComandas } from'../hooks/useRxComandas';
import { initVerticalRxDb } from'../db/rxdb';
import { Input } from'@/components/ui/input';
import { PageFrame, PageHeader, PageContent, HeaderSearch, headerPrimaryButtonClass } from'../components/Common/PageHeader';

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
 const itemsPerPage = 15;

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
 <PageFrame>
 <PageHeader
 title="Clientes"
 subtitle={`${stats.total} ${stats.total === 1 ? 'Registrado' : 'Registrados'}`}
 search={<HeaderSearch value={searchQuery} onChange={setSearchQuery} placeholder="Buscar por nombre, teléfono o DNI..." />}
 actions={
 <button type="button" onClick={() => { setEditingCliente(null); setNewOpened(true); }} title="Nuevo cliente" aria-label="Nuevo cliente" className={headerPrimaryButtonClass}>
 <Plus size={18} weight="bold" />
   <span className="hidden 2xl:inline">Nuevo cliente</span>
 </button>
 }
 />

 <PageContent>
 {/* En móvil el buscador no cabe en el header: va en una fila propia */}
 <div className="md:hidden px-4 py-2 shrink-0">
 <div className="relative">
 <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
 <Input type="text" placeholder="Buscar por nombre, teléfono o DNI..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-11 text-base" />
 </div>
 </div>

 {/* Contenido / Tabla */}
 <main className="flex-1 overflow-y-auto min-h-0 bg-card">
 {filteredClientes.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
 <div className="w-24 h-24 flex items-center justify-center">
 <img src="/Clients.webp"alt=""aria-hidden="true"className="w-full h-full object-contain"/>
 </div>
 <h2 className="t-titulo text-foreground">No se encontraron clientes</h2>
 <p className="t-meta text-muted-foreground">Intenta cambiar el criterio de búsqueda o registra uno nuevo.</p>
 </div>
 ) : (
 <div className="flex flex-col">
 <table className="w-full text-left">
 <thead className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_var(--border)] t-etiqueta text-muted-foreground">
 <tr>
 <th className="px-3 sm:px-6 py-3.5">Cliente</th>
 <th className="px-3 sm:px-6 py-3.5">Contacto</th>
 <th className="px-3 sm:px-6 py-3.5 hidden md:table-cell">Facturación</th>
 <th className="px-3 sm:px-6 py-3.5 hidden lg:table-cell">Notas</th>
 <th className="w-px whitespace-nowrap px-3 sm:px-6 py-3.5 text-right">Acciones</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {paginatedClientes.map((cliente) => {
 const isSystemCliente = cliente.id ==='99999999999';
 return (
 <tr key={cliente.id} className="hover:bg-muted/60 transition-colors">
 <td className="px-3 sm:px-6 py-3">
 <div className="flex flex-col">
 <span className="t-fila text-foreground">{cliente.nombre}</span>
 <span className="t-meta text-muted-foreground tabular-nums">
 {cliente.dni || 'Sin documento'}
 </span>
 </div>
 </td>
 <td className="px-3 sm:px-6 py-3">
 <div className="flex flex-col gap-0.5">
 {cliente.telefono ? (
 <a
 href={getWhatsAppLink(cliente.telefono) ||'#'}
 target="_blank"rel="noreferrer"className="t-cuerpo-fuerte text-foreground">
 {cliente.telefono}
 </a>
 ) : (
 <span className="t-cuerpo text-muted-foreground">Sin teléfono</span>
 )}
 {cliente.email && (
 <span className="t-meta text-muted-foreground truncate">{cliente.email}</span>
 )}
 </div>
 </td>
 <td className="px-3 sm:px-6 py-3 hidden md:table-cell">
 {cliente.nombre_factura || cliente.numero_doc ? (
 <div className="flex flex-col gap-1">
 {cliente.nombre_factura && (
 <span className="t-cuerpo-fuerte text-foreground">{cliente.nombre_factura}</span>
 )}
 {cliente.numero_doc && (
 <span className="px-2 py-0.5 rounded-md bg-special-soft text-special-foreground t-dato w-fit">
 {(cliente.tipo_doc ||'cedula').toUpperCase()} · {cliente.numero_doc}
 </span>
 )}
 </div>
 ) : (
 <span className="t-cuerpo text-muted-foreground">Sin datos</span>
 )}
 </td>
 <td className="px-3 sm:px-6 py-3 max-w-xs hidden lg:table-cell">
 <span className="t-cuerpo text-muted-foreground line-clamp-2">{cliente.notas ||'Sin notas'}</span>
 </td>
 <td className="w-px whitespace-nowrap px-3 sm:px-6 py-3 text-right">
 <div className="flex items-center justify-end gap-1">
 {!isSystemCliente ? (
 <button
 type="button"onClick={() => handleOpenEdit(cliente)} aria-label={`Editar ${cliente.nombre}`} title="Editar"
 className="size-9 pointer-coarse:size-11 rounded-2xl text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center cursor-pointer transition-colors">
 <PencilSimple size={16} />
 </button>
 ) : (
 <div aria-hidden="true" className="size-9 pointer-coarse:size-11 rounded-2xl text-muted-foreground/40 flex items-center justify-center cursor-not-allowed">
 <PencilSimple size={16} />
 </div>
 )}

 {!isSystemCliente ? (
 <button
 type="button"onClick={() => handleDelete(cliente.id)} aria-label={`Eliminar ${cliente.nombre}`} title="Eliminar"
 className="size-9 pointer-coarse:size-11 rounded-2xl text-muted-foreground hover:bg-destructive-soft hover:text-destructive flex items-center justify-center cursor-pointer transition-colors">
 <Trash size={16} />
 </button>
 ) : (
 <div aria-hidden="true" className="size-9 pointer-coarse:size-11 rounded-2xl text-muted-foreground/40 flex items-center justify-center cursor-not-allowed">
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

<div className="md:hidden pb-[calc(env(safe-area-inset-bottom)+96px)]">
 <Paginacion page={page} totalPages={totalPages} total={filteredClientes.length} pageSize={itemsPerPage} onPageChange={setPage} />
 </div>
  </main>

 <Paginacion className="hidden md:block" page={page} totalPages={totalPages} total={filteredClientes.length} pageSize={itemsPerPage} onPageChange={setPage} />

 </PageContent>

 <ClienteFormModal
 opened={newOpened}
 onClose={handleCloseModal}
 editingCliente={editingCliente}
 />
 </PageFrame>
 );
}
