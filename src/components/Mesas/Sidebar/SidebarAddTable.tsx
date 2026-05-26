import { Box, Stack, Text, Group, ActionIcon, Button, NumberInput, TextInput } from '@mantine/core';
import { ArrowLeft, FloppyDisk } from '@phosphor-icons/react';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';

interface SidebarAddTableProps {
  editingMesaId: string | null;
  initialValues: { numero: number; nombre: string; capacidad: number };
  onBack: () => void;
  onSubmit: (values: any) => void;
  selectedConfigPiso: string;
  isHabitacion?: boolean;
}

export function SidebarAddTable({
  editingMesaId,
  initialValues,
  onBack,
  onSubmit,
  selectedConfigPiso,
  isHabitacion = false,
}: SidebarAddTableProps) {
  const form = useForm({
    initialValues,
    validate: {
      numero: (value) => (value ? null : 'Requerido'),
    },
  });

  // Efecto para cargar valores iniciales si cambian (para edición)
  useEffect(() => {
    form.setValues(initialValues);
  }, [initialValues]);

  return (
    <Box h="100%" p="lg" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group mb="lg">
        <ActionIcon variant="subtle" color="gray" onClick={onBack}>
          <ArrowLeft size={20} />
        </ActionIcon>
        <Stack gap={0}>
          <Text fw={900} size="xl" c="var(--pos-text)">
            {editingMesaId
              ? (isHabitacion ? 'Editar Habitación' : 'Editar Mesa')
              : (isHabitacion ? 'Nueva Habitación' : 'Nueva Mesa')}
          </Text>
          <Text size="sm" c="dimmed">{selectedConfigPiso}</Text>
        </Stack>
      </Group>

      <form onSubmit={form.onSubmit(onSubmit)} style={{ flex: 1 }}>
        <Stack gap="xl">
          <NumberInput
            label={isHabitacion ? 'Número de Habitación' : 'Número de Mesa'}
            placeholder={isHabitacion ? 'Ej: 101' : 'Ej: 15'}
            required
            min={1}
            allowDecimal={false}
            size="md"
            radius="md"
            {...form.getInputProps('numero')}
          />

          {isHabitacion && (
            <TextInput
              label="Nombre / Tipo (Opcional)"
              placeholder="Ej: Suite, Doble, Junior..."
              size="md"
              radius="md"
              {...form.getInputProps('nombre')}
            />
          )}

          {!isHabitacion && (
            <NumberInput
              label="Capacidad (Opcional)"
              placeholder="Ej: 4"
              min={0}
              size="md"
              radius="md"
              {...form.getInputProps('capacidad')}
            />
          )}

          <Box mt="xl">
            <Button
              type="submit"
              fullWidth
              size="lg"
              radius="md"
              leftSection={<FloppyDisk size={20} />}
            >
              {editingMesaId
                ? 'Guardar Cambios'
                : (isHabitacion ? 'Crear Habitación' : 'Crear Mesa')}
            </Button>
            <Button
              variant="subtle"
              color="gray"
              fullWidth
              mt="sm"
              onClick={onBack}
            >
              Cancelar
            </Button>
          </Box>
        </Stack>
      </form>
    </Box>
  );
}
