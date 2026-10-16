import { usePermisos, ROL_DESCRIPCION } from '../../hooks/usePermisos';
import { useState } from'react';
import { Pencil, Plus, Trash, UserCircle } from'@phosphor-icons/react';
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
import { EstadoBadge } from '../../components/Common/EstadoBadge';
import { CheckRedondo } from '../../components/Common/CheckRedondo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from'@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from'@/components/ui/sheet';
import { ReservaHeader } from'../../components/Mesas/Sidebar/ReservaHeader';
import { Fila, Grupo, Seccion, TITULO_SECCION, Vacio } from'../../components/Ajustes/AjustesUI';


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
 // El rol sale del usuario con PIN, no de la sesión del dispositivo (siempre es del admin).
 const canManage = usePermisos().esAdmin;
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
 showToast.warning('No hay organización activa', 'Vincula un hotel antes de guardar usuarios.');
 return;
 }
 if (!formNombre.trim()) return showToast.warning('Escribe un nombre');
 if (!formEmail.trim() || !formEmail.includes('@')) {
 return showToast.warning('Escribe un correo válido');
 }
 if (!editingUser && (!formPassword.trim() || formPassword.length < 6)) {
 return showToast.warning('Contraseña muy corta','Debe tener al menos 6 caracteres.');
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
 showToast.success('Usuario actualizado');
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
 showToast.success('Usuario creado');
 }
 setUserModalOpen(false);
 } catch (error: any) {
 console.error(error);
 showToast.fallo('guardar el usuario', error);
 } finally {
 setSaving(false);
 }
 };

 const deleteUser = (user: any) => {
 if (isSelfUser(user)) {
 showToast.warning('No puedes eliminar tu propia cuenta');
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
 showToast.fallo('eliminar el usuario', error);
 }
 }
 );
 };

  if (!canManage) {
    const expiredEmail = localStorage.getItem('pos_admin_email');
    return (
      <Seccion titulo="Usuarios del local" descripcion="Colaboradores que inician sesión en este local.">
        <Grupo>
          <Vacio>Solo los administradores pueden gestionar usuarios.</Vacio>
          {expiredEmail && (
            <Fila
              titulo="Tu sesión de administrador expiró"
              ayuda={`${expiredEmail} · para gestionar usuarios debes iniciar sesión nuevamente.`}
            >
              <Button variant="outline" className="h-11" onClick={() => {
                // Limpiamos el admin email para obligar al re-login en la pantalla inicial
                localStorage.removeItem('pos_admin_email');
                window.location.href = '/';
              }}>
                Re-autenticar
              </Button>
            </Fila>
          )}
        </Grupo>
      </Seccion>
    );
  }

  const etiqueta = TITULO_SECCION;
  const etiquetaSwitch = 't-fila text-foreground cursor-pointer';

  return (
    <>
      <Seccion
        titulo="Usuarios del local"
        descripcion="Los colaboradores inician sesión con su correo y contraseña."
        accion={
          <Button disabled={!orgId} onClick={openCreate} className="h-12 gap-1.5 px-5">
            <Plus size={18} weight="bold" /> Agregar usuario
          </Button>
        }
      >
        <Grupo>
          {usuarios.length === 0 && <Vacio>Aún no hay usuarios.</Vacio>}
          {usuarios.map((user) => (
            <Fila
              key={user.id}
              titulo={user.nombre}
              ayuda={user.email || 'Sin correo'}
              icono={
                <span aria-hidden="true" className="size-9 rounded-full bg-muted text-muted-foreground t-dato flex items-center justify-center shrink-0">
                  {user.nombre.slice(0, 2).toUpperCase()}
                </span>
              }
            >
              <EstadoBadge tono="info">{ROL_LABELS[(user.rol as Rol)] || user.rol}</EstadoBadge>
              {user.activo === false && <EstadoBadge tono="neutral">Inactivo</EstadoBadge>}
              <Button type="button" variant="ghost" size="icon" aria-label={`Editar ${user.nombre}`} onClick={() => openEdit(user)} className="size-11 text-muted-foreground touch-manipulation">
                <Pencil size={18} />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Eliminar ${user.nombre}`} disabled={isSelfUser(user)} onClick={() => deleteUser(user)}
                className="size-11 text-muted-foreground hover:text-destructive touch-manipulation">
                <Trash size={18} />
              </Button>
            </Fila>
          ))}
        </Grupo>
      </Seccion>

      <Sheet open={userModalOpen} onOpenChange={(open) => { if (!open && !saving) setUserModalOpen(false); }}>
        <SheetContent showCloseButton={false} onOpenAutoFocus={(e) => e.preventDefault()}
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-[462px] flex flex-col gap-0 p-0 data-[side=right]:border-l-0">
          <SheetHeader className="p-0 gap-0 space-y-0">
            <SheetTitle className="sr-only">{editingUser ? 'Editar colaborador' : 'Agregar colaborador'}</SheetTitle>
            <SheetDescription className="sr-only">Datos de acceso y rol del colaborador</SheetDescription>
            <ReservaHeader tono="neutro" badge={<UserCircle size={22} weight="bold" />} titulo={editingUser ? 'Editar colaborador' : 'Agregar colaborador'}
              subtitulo={editingUser ? editingUser.nombre : 'Nuevo usuario'} onClose={() => setUserModalOpen(false)} />
          </SheetHeader>

          <main className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="usr-nombre" className={etiqueta}>Nombre completo *</Label>
              <Input id="usr-nombre" type="text" required placeholder="Ej: Juan Pérez" value={formNombre} onChange={(e) => setFormNombre(e.target.value)} className="h-12 text-base" />
            </div>

            <div className="flex flex-col gap-2">
              <Label className={etiqueta}>Rol</Label>
              <Select value={formRol} onValueChange={(v) => setFormRol(v as Rol)}>
                <SelectTrigger className="h-12 w-full text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROL_LABELS) as Rol[]).map((rol) => (
                    <SelectItem key={rol} value={rol}>{ROL_LABELS[rol]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-col gap-1 rounded-2xl bg-muted/60 px-3 py-2.5 t-meta">
                <span className="text-foreground">{ROL_DESCRIPCION[formRol].puede}</span>
                {ROL_DESCRIPCION[formRol].noPuede && <span className="text-muted-foreground">{ROL_DESCRIPCION[formRol].noPuede}</span>}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="usr-email" className={etiqueta}>Correo electrónico *</Label>
              <Input id="usr-email" type="email" required placeholder="ejemplo@hotel.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="h-12 text-base" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="usr-pass" className={etiqueta}>Contraseña{editingUser ? ' (déjala vacía para no cambiarla)' : ' *'}</Label>
              <Input id="usr-pass" type="password" placeholder="Mínimo 6 caracteres" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} className="h-12 text-base" />
            </div>

            {editingUser && (
              <div className="flex items-center justify-between gap-4 pt-5 border-t border-border">
                <div className="flex flex-col">
                  <Label htmlFor="usr-activo" className={etiquetaSwitch}>Usuario activo</Label>
                  <span className="t-meta text-muted-foreground">Un usuario inactivo no puede iniciar sesión.</span>
                </div>
                <CheckRedondo id="usr-activo" aria-label="Usuario activo" checked={formActivo} onCheckedChange={setFormActivo} />
              </div>
            )}
          </main>

          <footer className="p-4 border-t border-border bg-muted/40 flex items-center gap-2 shrink-0">
            <Button variant="outline" disabled={saving} onClick={() => setUserModalOpen(false)} className="h-12 px-5">Cancelar</Button>
            <Button disabled={saving} onClick={saveUser} className="h-12 flex-1">{saving ? 'Guardando...' : 'Guardar cambios'}</Button>
          </footer>
        </SheetContent>
      </Sheet>
    </>
  );
}
