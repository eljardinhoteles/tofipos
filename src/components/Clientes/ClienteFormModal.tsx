import { useEffect } from 'react';
import { Modal, Stack, Group, Text, Button, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Phone, Envelope, IdentificationCard, MapPin } from '@phosphor-icons/react';
import { type Cliente } from '../../db/database';
import { sileo } from 'sileo';
import { initVerticalRxDb, createRxCliente, updateRxCliente } from '../../db/rxdb';

interface ClienteFormModalProps {
  opened: boolean;
  onClose: () => void;
  /** Si se pasa, el modal trabaja en modo edición */
  editingCliente?: Cliente | null;
  /** Nombre pre-rellenado (útil al abrir desde el sidebar) */
  initialNombre?: string;
}

export function ClienteFormModal({ opened, onClose, editingCliente, initialNombre }: ClienteFormModalProps) {
  const form = useForm({
    initialValues: {
      nombre: '',
      telefono: '',
      email: '',
      dni: '',
      direccion: '',
      notas: '',
    },
    validate: {
      nombre: (v) => (v.length < 2 ? 'Nombre demasiado corto' : null),
    },
  });

  useEffect(() => {
    if (opened) {
      if (editingCliente) {
        form.setValues({
          nombre: editingCliente.nombre,
          telefono: editingCliente.telefono || '',
          email: editingCliente.email || '',
          dni: editingCliente.dni || '',
          direccion: editingCliente.direccion || '',
          notas: editingCliente.notas || '',
        });
      } else {
        form.reset();
        if (initialNombre) form.setFieldValue('nombre', initialNombre);
      }
    }
  }, [opened, editingCliente, initialNombre]);

  const handleSubmit = async (values: typeof form.values) => {
    if (editingCliente?.id === '99999999999' || editingCliente?.nombre === 'Consumidor Final') {
      sileo.error({ title: 'Acción no permitida', description: 'El cliente Consumidor Final no puede ser modificado.' });
      onClose();
      form.reset();
      return;
    }

    if (editingCliente) {
      await updateRxCliente(editingCliente.id, { ...values, organization_id: localStorage.getItem('pos_active_org_id') || '' });
      sileo.success({ title: 'Cliente actualizado' });
    } else {
      const rxDb = await initVerticalRxDb();
      const exists = await rxDb.clientes.findOne({
        selector: { nombre: values.nombre }
      }).exec();
      if (exists) {
        await updateRxCliente((exists as any).id, { ...values, organization_id: localStorage.getItem('pos_active_org_id') || '' });
        sileo.success({ title: 'Cliente actualizado' });
      } else {
        await createRxCliente({
          id: crypto.randomUUID(),
          ...values,
          organization_id: localStorage.getItem('pos_active_org_id') || '',
          created_at: new Date().toISOString(),
        });
        sileo.success({ title: 'Cliente registrado' });
      }
    }
    onClose();
    form.reset();
  };

  return (
    <Modal
      opened={opened}
      onClose={() => { onClose(); form.reset(); }}
      title={<Text size="lg" fw={800}>{editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}</Text>}
      centered
      radius="xl"
      size="lg"
      zIndex={2000}
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <TextInput
            label="Nombre Completo"
            placeholder="Ej: Juan Pérez"
            required
            radius="md"
            {...form.getInputProps('nombre')}
          />
          <Group grow>
            <TextInput
              label="Teléfono"
              placeholder="Ej: 0991234567"
              radius="md"
              leftSection={<Phone size={18} />}
              {...form.getInputProps('telefono')}
            />
            <TextInput
              label="DNI / RUC"
              placeholder="Documento de identidad"
              radius="md"
              leftSection={<IdentificationCard size={18} />}
              {...form.getInputProps('dni')}
            />
          </Group>
          <TextInput
            label="Correo Electrónico"
            placeholder="usuario@ejemplo.com"
            radius="md"
            leftSection={<Envelope size={18} />}
            {...form.getInputProps('email')}
          />
          <TextInput
            label="Dirección"
            placeholder="Calle principal, sector..."
            radius="md"
            leftSection={<MapPin size={18} />}
            {...form.getInputProps('direccion')}
          />
          <TextInput
            label="Notas"
            placeholder="Preferencias, alergias, etc."
            radius="md"
            {...form.getInputProps('notas')}
          />
          <Group justify="flex-end" mt="xl">
            <Button variant="light" color="gray" size="lg" radius="md" onClick={() => { onClose(); form.reset(); }}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" radius="md">
              {editingCliente ? 'Guardar Cambios' : 'Registrar Cliente'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
