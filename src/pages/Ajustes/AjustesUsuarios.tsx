import { useState } from 'react';
import { ActionIcon, Badge, Box, Button, Divider, Grid, Group, Paper, Select, Stack, Switch, TextInput, PasswordInput, Text, ThemeIcon, Modal } from '@mantine/core';
import { Pencil, Plus, Trash, WifiSlash } from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useRxUsuarios } from '../../hooks/useRxUsuarios';
import { supabase } from '../../lib/supabase';
import { forceSyncAll } from '../../db/rxdb';
import { removeCachedCredential } from '../../lib/authCache';
import { sileo } from 'sileo';

type Rol = 'admin' | 'mesero' | 'cajero';

const ROL_LABELS: Record<Rol, string> = {
  admin: 'Administrador',
  mesero: 'Mesero',
  cajero: 'Cajero',
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

  const orgId = currentMesero?.organization_id || localStorage.getItem('pos_active_org_id') || '';
  // Puede gestionar usuarios: el admin que configuró el dispositivo (sesión Supabase)
  // o un colaborador con rol admin.
  const canManage = !!adminUser || currentMesero?.rol === 'admin';
  const isSelfUser = (user: any) => user.id === currentMesero?.id || user.user_id === adminUser?.id;
  const connectedEmail = (adminUser?.email || localStorage.getItem('pos_admin_email') || '').toLowerCase();
  const isConnectedUser = (user: any) =>
    isSelfUser(user) || (!!user.email && user.email.toLowerCase() === connectedEmail);

  // Las mutaciones van a la Edge Function manage-users (requiere internet)
  const invokeManageUsers = async (body: Record<string, unknown>) => {
    if (!navigator.onLine) {
      throw new Error('La gestión de usuarios requiere conexión a internet.');
    }
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { organization_id: orgId, ...body },
    });
    if (error) {
      // El detalle viene en el body de la respuesta de la función
      let detail = error.message;
      try {
        const ctx = (error as any).context;
        if (ctx?.json) detail = (await ctx.json())?.error || detail;
      } catch { /* usar mensaje genérico */ }
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    // Refrescar perfiles locales (la tabla usuarios es solo pull)
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
    setFormEmail(user.email || '');
    setFormPassword('');
    setFormActivo(user.activo);
    setUserModalOpen(true);
  };

  const saveUser = async () => {
    if (!orgId) {
      sileo.error({ title: 'Sin organización activa', description: 'Vincula un hotel antes de guardar usuarios.' });
      return;
    }
    if (!formNombre.trim()) return sileo.error({ title: 'Ingresa un nombre' });
    if (!formEmail.trim() || !formEmail.includes('@')) {
      return sileo.error({ title: 'Correo inválido', description: 'Las cuentas usan correo electrónico (Supabase Auth).' });
    }
    if (!editingUser && (!formPassword.trim() || formPassword.length < 6)) {
      return sileo.error({ title: 'Contraseña muy corta', description: 'Debe tener al menos 6 caracteres.' });
    }
    if (editingUser && formPassword && formPassword.length < 6) {
      return sileo.error({ title: 'Contraseña muy corta', description: 'Debe tener al menos 6 caracteres.' });
    }

    setSaving(true);
    try {
      if (editingUser) {
        await invokeManageUsers({
          action: 'update',
          user: {
            id: editingUser.id,
            nombre: formNombre.trim(),
            rol: formRol,
            email: formEmail.trim().toLowerCase(),
            activo: formActivo,
            ...(formPassword ? { password: formPassword } : {}),
          },
        });
        sileo.success({ title: 'Usuario actualizado exitosamente' });
      } else {
        const result = await invokeManageUsers({
          action: 'create',
          user: {
            nombre: formNombre.trim(),
            rol: formRol,
            email: formEmail.trim().toLowerCase(),
            password: formPassword,
            activo: formActivo,
          },
        });
        // Si el correo ya tenía cuenta de Auth (en otra organización), se
        // invitó conservando su contraseña actual — la que escribiste no se usó.
        if (result?.existing) {
          sileo.success({
            title: 'Colaborador invitado',
            description: `${formEmail.trim()} ya tenía una cuenta y fue añadido a esta organización con su contraseña actual.`,
          });
        } else {
          sileo.success({ title: 'Usuario creado exitosamente' });
        }
      }
      setUserModalOpen(false);
    } catch (error: any) {
      console.error(error);
      sileo.error({ title: 'Error al guardar usuario', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (user: any, activo: boolean) => {
    try {
      await invokeManageUsers({ action: 'update', user: { id: user.id, activo } });
      sileo.success({ title: 'Estado actualizado' });
    } catch (error: any) {
      console.error(error);
      sileo.error({ title: 'Error al actualizar estado', description: error.message });
    }
  };

  const deleteUser = (user: any) => {
    if (isSelfUser(user)) {
      sileo.error({ title: 'No permitido', description: 'No puedes eliminar tu propia cuenta.' });
      return;
    }
    openConfirm(
      'Eliminar Colaborador',
      `¿Estás seguro de eliminar a ${user.nombre}? Se desactivará su cuenta y no podrá volver a iniciar sesión.`,
      async () => {
        try {
          await invokeManageUsers({ action: 'delete', user: { id: user.id } });
          // Invalida el verificador PBKDF2 local para que no pueda seguir
          // iniciando sesión offline en este dispositivo con el caché viejo.
          if (user.email) removeCachedCredential(user.email);
          sileo.success({ title: 'Usuario eliminado' });
        } catch (error: any) {
          console.error(error);
          sileo.error({ title: 'Error al eliminar usuario', description: error.message });
        }
      }
    );
  };

  if (!canManage) {
    return (
      <Stack gap={0} py="xl">
        <Paper withBorder p="xl" radius="lg" ta="center">
          <Text fw={700}>Acceso restringido</Text>
          <Text size="sm" c="dimmed">Solo los administradores pueden gestionar usuarios.</Text>
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack gap={0}>
      <Stack gap="lg" py="xl">
        {!orgId && (
          <Paper withBorder p="md" radius="md" bg="gray.0">
            <Text fw={700}>Sin organización activa</Text>
            <Text size="sm" c="dimmed">Vincula un hotel para administrar usuarios.</Text>
          </Paper>
        )}
        {!navigator.onLine && (
          <Paper withBorder p="md" radius="md" bg="yellow.0">
            <Group gap="xs">
              <WifiSlash size={18} />
              <Text size="sm" fw={600}>Sin conexión: la creación y edición de usuarios requiere internet.</Text>
            </Group>
          </Paper>
        )}
        <Paper withBorder p="xl" radius="lg" style={{ backgroundColor: 'var(--pos-surface)' }}>
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed" style={{ maxWidth: 450 }}>
              Los colaboradores inician sesión con su correo y contraseña de Supabase Auth.
              La primera vez necesitan internet; luego pueden operar sin conexión.
            </Text>
            <Button color="myColor" radius="md" size="md" leftSection={<Plus size={18} weight="bold" />} onClick={openCreate} disabled={!orgId}>
              Agregar Usuario
            </Button>
          </Group>

          <Divider my="md" />

          <Stack gap="sm">
            {usuarios.length === 0 ? (
              <Paper p="md" radius="md" withBorder ta="center" style={{ backgroundColor: 'var(--pos-bg)' }}>
                <Text size="sm" c="dimmed">No hay colaboradores registrados.</Text>
              </Paper>
            ) : (
              usuarios.map((user) => {
                const initials = user.nombre.slice(0, 2).toUpperCase();
                const isUserAdmin = user.rol === 'admin';
                const isConnected = isConnectedUser(user);
                const isSelf = isSelfUser(user);

                return (
                  <Paper
                    key={user.id}
                    p="md"
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: isConnected ? 'var(--ui-primary-soft)' : 'var(--pos-bg)',
                      borderColor: isConnected ? 'var(--ui-primary)' : 'var(--pos-border)',
                      boxShadow: isConnected ? '0 0 0 1px color-mix(in srgb, var(--ui-primary), transparent 72%)' : undefined,
                    }}
                  >
                    <Grid align="center">
                      <Grid.Col span={{ base: 12, sm: 5 }}>
                        <Group gap="md">
                          <ThemeIcon size={42} radius="xl" color={isUserAdmin ? 'grape' : 'blue'} variant="light">
                            <Text fw={800} size="sm">{initials}</Text>
                          </ThemeIcon>
                          <Box>
                            <Group gap="xs">
                              <Text fw={800} size="md" c="var(--pos-text)">{user.nombre}</Text>
                              {isConnected && <Badge size="xs" color="myColor" variant="filled">Conectado</Badge>}
                            </Group>
                            <Group gap={6} mt={2}>
                              <Badge color={isUserAdmin ? 'grape' : 'blue'} size="xs" radius="sm" variant="light">
                                {ROL_LABELS[(user.rol as Rol)] || user.rol}
                              </Badge>
                              {!user.activo && <Badge color="red" size="xs" radius="sm">Inactivo</Badge>}
                            </Group>
                          </Box>
                        </Group>
                      </Grid.Col>

                      <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Text size="xs" c="dimmed" fw={600}>Correo: {user.email || 'N/A'}</Text>
                      </Grid.Col>

                      <Grid.Col span={{ base: 12, sm: 3 }}>
                        <Group justify="flex-end" gap="sm">
                          <Switch
                            checked={user.activo}
                            disabled={isSelf || !orgId}
                            onChange={(e) => toggleActivo(user, e.currentTarget.checked)}
                            color="green"
                            size="sm"
                          />
                          <ActionIcon color="myColor" variant="light" size="md" radius="md" onClick={() => openEdit(user)} disabled={!orgId}>
                            <Pencil size={16} />
                          </ActionIcon>
                          <ActionIcon
                            color="red"
                            variant="light"
                            size="md"
                            radius="md"
                            disabled={isSelf || !orgId}
                            onClick={() => deleteUser(user)}
                          >
                            <Trash size={16} />
                          </ActionIcon>
                        </Group>
                      </Grid.Col>
                    </Grid>
                  </Paper>
                );
              })
            )}
          </Stack>
        </Paper>

        <Modal
          opened={userModalOpen}
          onClose={() => setUserModalOpen(false)}
          title={editingUser ? 'Editar Colaborador' : 'Agregar Colaborador'}
          radius="lg"
          size="md"
          styles={{ header: { fontWeight: 800 }, title: { fontSize: '18px', fontWeight: 850 } }}
        >
          <Stack gap="md">
            <TextInput label="Nombre Completo" placeholder="Ej: Juan Pérez" value={formNombre} onChange={(e) => setFormNombre(e.target.value)} required radius="md" size="sm" />
            <Select
              label="Rol de Usuario"
              placeholder="Selecciona el rol"
              data={[
                { value: 'cajero', label: 'Cajero' },
                { value: 'mesero', label: 'Mesero' },
                { value: 'admin', label: 'Administrador' },
              ]}
              value={formRol}
              onChange={(val) => setFormRol((val || 'cajero') as Rol)}
              required
              radius="md"
              size="sm"
            />

            <TextInput label="Correo Electrónico" placeholder="ejemplo@hotel.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required radius="md" size="sm" />
            <PasswordInput
              label={editingUser ? 'Nueva Contraseña (opcional)' : 'Contraseña'}
              placeholder={editingUser ? 'Dejar en blanco para no cambiarla' : 'Mínimo 6 caracteres'}
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              required={!editingUser}
              radius="md"
              size="sm"
            />

            <Switch
              label="Colaborador Activo (Habilitado para operar)"
              checked={formActivo}
              onChange={(e) => setFormActivo(e.currentTarget.checked)}
              color="green"
              mt="xs"
              disabled={!!editingUser && isSelfUser(editingUser)}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={() => setUserModalOpen(false)} radius="md">Cancelar</Button>
              <Button color="myColor" onClick={saveUser} radius="md" loading={saving} disabled={!orgId}>Guardar Cambios</Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Stack>
  );
}
