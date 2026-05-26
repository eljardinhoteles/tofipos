import { useState } from 'react';
import { ActionIcon, Badge, Box, Button, Divider, Grid, Group, Paper, Select, Stack, Switch, TextInput, PasswordInput, Text, ThemeIcon, Modal } from '@mantine/core';
import { Pencil, Eye, EyeSlash, Plus, Trash } from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useRxUsuarios } from '../../hooks/useRxUsuarios';
import { createRxUsuario, updateRxUsuario } from '../../db/rxdb';
import { sileo } from 'sileo';

export default function AjustesUsuarios() {
  const { openConfirm } = useUI();
  const { currentMesero, adminUser } = useAuth();
  const { usuarios } = useRxUsuarios();

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formRol, setFormRol] = useState<'admin' | 'mesero' | 'cajero'>('cajero');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formActivo, setFormActivo] = useState(true);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  const orgId = currentMesero?.organization_id || localStorage.getItem('pos_active_org_id') || '';
  const isSelfAdmin = currentMesero?.rol === 'admin';
  const isSelfUser = (user: any) => user.id === currentMesero?.id;
  const canSelfManage = (user: any) => !(isSelfAdmin && isSelfUser(user));
  const connectedEmail = adminUser?.email?.toLowerCase() || '';
  const persistedAdminEmail = (localStorage.getItem('pos_admin_email') || '').toLowerCase();
  const isConnectedUser = (user: any) => {
    if (isSelfUser(user)) return true;
    if ((adminUser?.email || persistedAdminEmail) && user.email) {
      const email = user.email.toLowerCase();
      return email === connectedEmail || email === persistedAdminEmail;
    }
    return false;
  };

  const toggleSecret = (id: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
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
    setFormRol(user.rol as 'admin' | 'mesero' | 'cajero');
    setFormEmail(user.email || '');
    setFormPassword(user.password || '');
    setFormActivo(user.activo);
    setUserModalOpen(true);
  };

  const saveUser = async () => {
    if (!orgId) {
      sileo.error({ title: 'Sin organización activa', description: 'Vincula un hotel antes de guardar usuarios.' });
      return;
    }
    if (!formNombre.trim()) return sileo.error({ title: 'Ingresa un nombre' });
    if (!formEmail.trim()) return sileo.error({ title: 'Ingresa un usuario o correo' });
    if (!formPassword.trim() || formPassword.length < 4) {
      return sileo.error({ title: 'Contraseña muy corta', description: 'Debe tener al menos 4 caracteres.' });
    }

    const normalizedEmail = formEmail.trim().toLowerCase();
    const duplicate = usuarios.find((u) =>
      !u._deleted &&
      u.email?.toLowerCase() === normalizedEmail &&
      u.id !== editingUser?.id
    );
    if (duplicate) {
      return sileo.error({ title: 'Usuario duplicado', description: 'Ya existe un usuario con ese correo/usuario.' });
    }

    try {
      if (editingUser) {
        if (!canSelfManage(editingUser)) {
          sileo.error({ title: 'No permitido', description: 'No puedes desactivar ni borrar tu propia cuenta administradora.' });
          return;
        }
        await updateRxUsuario(editingUser.id, {
          nombre: formNombre,
          rol: formRol,
          email: normalizedEmail,
          password: formPassword,
          activo: formActivo,
        });
        sileo.success({ title: 'Usuario actualizado exitosamente' });
      } else {
        await createRxUsuario({
          id: crypto.randomUUID(),
          nombre: formNombre,
          rol: formRol,
          email: normalizedEmail,
          password: formPassword,
          activo: formActivo,
          organization_id: orgId,
        });
        sileo.success({ title: 'Usuario creado exitosamente' });
      }
      setUserModalOpen(false);
    } catch (error) {
      console.error(error);
      sileo.error({ title: 'Error al guardar usuario' });
    }
  };

  const deleteUser = (user: any) => {
    if (!canSelfManage(user)) {
      sileo.error({ title: 'No permitido', description: 'No puedes desactivar ni borrar tu propia cuenta administradora.' });
      return;
    }

    openConfirm(
      'Eliminar Colaborador',
      `¿Estás seguro de eliminar a ${user.nombre}? Esta acción inhabilitará su acceso local e intentará remover su registro de forma remota.`,
      async () => {
        try {
          await updateRxUsuario(user.id, { _deleted: true } as any);
          sileo.success({ title: 'Usuario eliminado' });
        } catch (error) {
          console.error(error);
          sileo.error({ title: 'Error al eliminar usuario' });
        }
      }
    );
  };

  return (
    <Stack gap={0}>
      <Stack gap="lg" py="xl">
        {!orgId && (
          <Paper withBorder p="md" radius="md" bg="gray.0">
            <Text fw={700}>Sin organización activa</Text>
            <Text size="sm" c="dimmed">Vincula un hotel para administrar usuarios.</Text>
          </Paper>
        )}
        <Paper withBorder p="xl" radius="lg" style={{ backgroundColor: 'var(--pos-surface)' }}>
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed" style={{ maxWidth: 450 }}>
              Administra usuarios, roles y credenciales desde aquí.
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
                const secretRevealed = !!revealedSecrets[user.id];
                const isConnected = isConnectedUser(user);

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
                                {isUserAdmin ? 'Administrador' : 'Mesero'}
                              </Badge>
                              {!user.activo && <Badge color="red" size="xs" radius="sm">Inactivo</Badge>}
                            </Group>
                          </Box>
                        </Group>
                      </Grid.Col>

                      <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Box>
                          <Text size="xs" c="dimmed" fw={600}>Usuario: {user.email || 'N/A'}</Text>
                          <Group gap={4} align="center">
                            <Text size="xs" c="dimmed" fw={600}>Clave: {secretRevealed ? (user.password || '') : '••••'}</Text>
                            {user.password && (
                              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => toggleSecret(user.id)}>
                                {secretRevealed ? <EyeSlash size={12} /> : <Eye size={12} />}
                              </ActionIcon>
                            )}
                          </Group>
                        </Box>
                      </Grid.Col>

                      <Grid.Col span={{ base: 12, sm: 3 }}>
                        <Group justify="flex-end" gap="sm">
                          <Switch
                            checked={user.activo}
                            disabled={!canSelfManage(user)}
                            onChange={async (e) => {
                              if (!canSelfManage(user)) {
                                sileo.error({ title: 'No permitido', description: 'No puedes desactivar tu propia cuenta administradora.' });
                                return;
                              }
                              await updateRxUsuario(user.id, { activo: e.currentTarget.checked });
                              sileo.success({ title: 'Estado actualizado' });
                            }}
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
                            disabled={!canSelfManage(user) || !orgId}
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
                { value: 'admin', label: 'Administrador' },
              ]}
              value={formRol}
              onChange={(val) => setFormRol((val || 'cajero') as 'admin' | 'mesero' | 'cajero')}
              required
              radius="md"
              size="sm"
            />

            <TextInput label="Usuario / Correo Electrónico" placeholder="ejemplo@hotel.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required radius="md" size="sm" />
            <PasswordInput label="Contraseña" placeholder="Mínimo 4 caracteres" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required radius="md" size="sm" />

            <Switch
              label="Colaborador Activo (Habilitado para operar)"
              checked={formActivo}
              onChange={(e) => {
                if (editingUser && !canSelfManage(editingUser)) {
                  sileo.error({ title: 'No permitido', description: 'No puedes desactivar tu propia cuenta administradora.' });
                  return;
                }
                setFormActivo(e.currentTarget.checked);
              }}
              color="green"
              mt="xs"
              disabled={editingUser ? !canSelfManage(editingUser) : false}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={() => setUserModalOpen(false)} radius="md">Cancelar</Button>
              <Button color="myColor" onClick={saveUser} radius="md" disabled={!orgId}>Guardar Cambios</Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Stack>
  );
}
