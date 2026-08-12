import { useState } from'react';
import { Pencil, Plus, Trash, X } from'@phosphor-icons/react';
import { useAuth } from'../../context/AuthContext';
import { useUI } from'../../context/UIContext';
import { useRxUsuarios } from'../../hooks/useRxUsuarios';
import { supabase } from'../../lib/supabase';
import { forceSyncAll } from'../../db/rxdb';
import { removeCachedCredential } from'../../lib/authCache';
import { showToast } from'@/lib/toast';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';
import { Button } from'@/components/ui/button';


type Rol ='admin'|'mesero'|'cajero';

const ROL_LABELS: Record<Rol, string> = {
 admin:'Administrador',
 mesero:'Mesero',
 cajero:'Cajero',
};

export default function AjustesUsuarios() {
 const { openConfirm } = useUI();
 const { currentMesero, adminUser } = useAuth();
 const { usuarios } = useRxUsuarios();

 const [userModalOpen, setUserModalOpen] = useState(false);
 const [editingUser, setEditingUser] = useState<any | null>(null);
 const [formNombre, setFormNombre] = useState('');
 const [formRol, setFormRol] = useState<Rol>('cajero');
 const [formEmail, setFormEmail] = useState('');
 const [formPassword, setFormPassword] = useState('');
 const [formActivo, setFormActivo] = useState(true);
 const [saving, setSaving] = useState(false);

 const orgId = currentMesero?.organization_id || localStorage.getItem('pos_active_org_id') ||'';
 const canManage = !!adminUser || currentMesero?.rol ==='admin';
 const isSelfUser = (user: any) => user.id === currentMesero?.id || user.user_id === adminUser?.id;

 const invokeManageUsers = async (body: Record<string, unknown>) => {
 if (!navigator.onLine) {
 throw new Error('La gestión de usuarios requiere conexión a internet.');
 }
 const { data, error } = await supabase.functions.invoke('manage-users', {
 body: { organization_id: orgId, ...body },
 });
 if (error) {
 let detail = error.message;
 try {
 const ctx = (error as any).context;
 if (ctx?.json) detail = (await ctx.json())?.error || detail;
 } catch {}
 throw new Error(detail);
 }
 if (data?.error) throw new Error(data.error);
 forceSyncAll().catch(() => {});
 return data;
 };

 const openCreate = () => {
 setEditingUser(null);
 setFormNombre('');
 setFormRol('cajero');
 setFormEmail('');
 setFormPassword('');
 setFormActivo(true);
 setUserModalOpen(true);
 };

 const openEdit = (user: any) => {
 setEditingUser(user);
 setFormNombre(user.nombre);
 setFormRol(user.rol as Rol);
 setFormEmail(user.email ||'');
 setFormPassword('');
 setFormActivo(user.activo);
 setUserModalOpen(true);
 };

 const saveUser = async () => {
 if (!orgId) {
 showToast.error('Sin organización activa','Vincula un hotel antes de guardar usuarios.');
 return;
 }
 if (!formNombre.trim()) return showToast.error('Ingresa un nombre');
 if (!formEmail.trim() || !formEmail.includes('@')) {
 return showToast.error('Correo inválido');
 }
 if (!editingUser && (!formPassword.trim() || formPassword.length < 6)) {
 return showToast.error('Contraseña muy corta','Debe tener al menos 6 caracteres.');
 }

 setSaving(true);
 try {
 if (editingUser) {
 await invokeManageUsers({
 action:'update',
 user: {
 id: editingUser.id,
 nombre: formNombre.trim(),
 rol: formRol,
 email: formEmail.trim().toLowerCase(),
 activo: formActivo,
 ...(formPassword ? { password: formPassword } : {}),
 },
 });
 showToast.success('Usuario actualizado exitosamente');
 } else {
 await invokeManageUsers({
 action:'create',
 user: {
 nombre: formNombre.trim(),
 rol: formRol,
 email: formEmail.trim().toLowerCase(),
 password: formPassword,
 activo: formActivo,
 },
 });
 showToast.success('Usuario creado exitosamente');
 }
 setUserModalOpen(false);
 } catch (error: any) {
 console.error(error);
 showToast.error('Error al guardar usuario', error.message);
 } finally {
 setSaving(false);
 }
 };

 const deleteUser = (user: any) => {
 if (isSelfUser(user)) {
 showToast.error('No permitido','No puedes eliminar tu propia cuenta.');
 return;
 }
 openConfirm('Eliminar Colaborador',`¿Estás seguro de eliminar a ${user.nombre}?`,
 async () => {
 try {
 await invokeManageUsers({ action:'delete', user: { id: user.id } });
 if (user.email) removeCachedCredential(user.email);
 showToast.success('Usuario eliminado');
 } catch (error: any) {
 console.error(error);
 showToast.error('Error al eliminar usuario', error.message);
 }
 }
 );
 };

 if (!canManage) {
 return (
 <div className="bg-card p-6 rounded-2xl border border-border text-center font-bold text-muted-foreground text-xs">
 Solo los administradores pueden gestionar usuarios.
 </div>
 );
 }

 return (
 <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-4">
 <div className="flex items-center justify-between">
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground">Usuarios del Local</h3>
 <p className="text-xs text-muted-foreground">Los colaboradores inician sesión con Supabase Auth.</p>
 </div>

 <Button size="sm"disabled={!orgId} onClick={openCreate}>
 <Plus size={16} weight="bold"/> Agregar Usuario
 </Button>
 </div>

 <div className="w-full h-[1px] bg-border"/>

 <div className="flex flex-col gap-2">
 {usuarios.map((user) => (
 <div key={user.id} className="p-4 rounded-xl bg-muted border border-border flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-extrabold text-xs flex items-center justify-center">
 {user.nombre.slice(0, 2).toUpperCase()}
 </div>
 <div className="flex flex-col">
 <span className="font-extrabold text-xs text-foreground">{user.nombre}</span>
 <span className="text-[10px] text-muted-foreground font-semibold">{user.email ||'Sin correo'}</span>
 </div>
 </div>

 <div className="flex items-center gap-3">
 <span className="px-2 py-0.5 rounded-md bg-muted text-foreground font-bold text-[10px] uppercase">
 {ROL_LABELS[(user.rol as Rol)] || user.rol}
 </span>

 <div className="flex items-center gap-1">
 <button
 type="button"onClick={() => openEdit(user)}
 className="p-1.5 rounded-lg text-primary cursor-pointer">
 <Pencil size={16} />
 </button>
 <button
 type="button"disabled={isSelfUser(user)}
 onClick={() => deleteUser(user)}
 className="p-1.5 rounded-lg text-destructive disabled:opacity-30 cursor-pointer">
 <Trash size={16} />
 </button>
 </div>
 </div>
 </div>
 ))}
 </div>

 {userModalOpen && (
 <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4">
 <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
 <div className="flex items-center justify-between border-b border-border pb-3">
 <h3 className="font-extrabold text-base text-foreground">
 {editingUser ?'Editar Colaborador':'Agregar Colaborador'}
 </h3>
 <button type="button"onClick={() => setUserModalOpen(false)} className="text-muted-foreground">
 <X size={16} />
 </button>
 </div>

 <div className="flex flex-col gap-3">
 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Nombre Completo *</Label>
 <Input
 type="text"required
 placeholder="Ej: Juan Pérez"value={formNombre}
 onChange={(e) => setFormNombre(e.target.value)}
 className="h-9 text-xs"/>
 </div>

 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Rol</Label>
 <select
 value={formRol}
 onChange={(e) => setFormRol(e.target.value as Rol)}
 className="h-9 px-3 text-xs bg-input/50 border border-transparent rounded-2xl focus:outline-none focus:border-ring font-semibold">
 <option value="cajero">Cajero</option>
 <option value="mesero">Mesero</option>
 <option value="admin">Administrador</option>
 </select>
 </div>

 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Correo Electrónico *</Label>
 <Input
 type="email"required
 placeholder="ejemplo@hotel.com"value={formEmail}
 onChange={(e) => setFormEmail(e.target.value)}
 className="h-9 text-xs"/>
 </div>

 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Contraseña</Label>
 <Input
 type="password"placeholder="Mínimo 6 caracteres"value={formPassword}
 onChange={(e) => setFormPassword(e.target.value)}
 className="h-9 text-xs"/>
 </div>
 </div>

 <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
 <Button variant="outline"size="sm"onClick={() => setUserModalOpen(false)}>Cancelar</Button>
 <Button size="sm"disabled={saving} onClick={saveUser}>
 {saving ?'Guardando...':'Guardar Cambios'}
 </Button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
