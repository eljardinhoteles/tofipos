import { useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')
import { Box, Stack, Group, Text, Button, ActionIcon, ScrollArea, Autocomplete, Textarea } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { XIcon, CalendarIcon, UserIcon, ReceiptIcon, BedIcon } from '@phosphor-icons/react'
import { type Mesa } from '../../../../db/database'
import { useForm } from '@mantine/form'
import { sileo } from 'sileo'
import { createRxHabitacionCuenta, updateRxMesa } from '../../../../db/rxdb'
import { useRxClientes } from '../../../../hooks/useRxClientes'

export function CheckinForm({ selectedMesa, onClose }: { selectedMesa: Mesa; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(false)
  const today = new Date().toISOString().split('T')[0]

  const { clientes } = useRxClientes()
  const clienteOptions = clientes.map(c => c.nombre)

  const form = useForm({
    initialValues: {
      huesped: '',
      rango: [new Date(), null] as [Date | null, Date | null],
      notas: '',
    },
    validate: {
      huesped: (v) => v.trim() ? null : 'Ingresa el nombre del huésped',
      rango: (v) => v[0] ? null : 'Selecciona al menos la fecha de entrada',
    }
  })

  const handleSubmit = async (values: typeof form.values) => {
    setIsLoading(true)
    try {
      const checkIn = values.rango[0] ? dayjs(values.rango[0]).format('YYYY-MM-DD') : today
      const checkOut = values.rango[1] ? dayjs(values.rango[1]).format('YYYY-MM-DD') : undefined
      const clienteMatch = clientes.find(c => c.nombre.trim().toLowerCase() === values.huesped.trim().toLowerCase())
      const cuentaId = crypto.randomUUID()
      const now = new Date().toISOString()

      await createRxHabitacionCuenta({
        id: cuentaId,
        mesa_id: selectedMesa.id,
        huesped: values.huesped.trim(),
        cliente_id: clienteMatch?.id,
        check_in: checkIn,
        check_out: checkOut,
        estado: 'activa',
        notas: values.notas.trim() || undefined,
        organization_id: localStorage.getItem('pos_active_org_id') || '',
        created_at: now,
        updated_at: now,
      })

      await updateRxMesa(selectedMesa.id, { estado: 'ocupada' })
      sileo.success({ title: 'Cuenta abierta', description: `${selectedMesa.nombre} — ${values.huesped}` })
    } catch (error) {
      console.error('Error al abrir cuenta:', error)
      sileo.error({ title: 'Error al abrir cuenta', description: error instanceof Error ? error.message : 'Error desconocido' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Box h="100%" className="hab-sidebar">
      <Box p="lg" className="hab-sidebar__header">
        <Group justify="space-between">
          <Group gap="md">
            <Box className="hab-sidebar__icon hab-sidebar__icon--checkin">
              <BedIcon size={22} weight="bold" color="white" />
            </Box>
            <Stack gap={0}>
              <Text size="lg" fw={800} c="var(--pos-text)" className="hab-sidebar__title">
                Iniciar Cuenta
              </Text>
              <Text size="11px" c="dimmed" fw={700} className="hab-sidebar__eyebrow">
                Habitación #{selectedMesa.nombre.replace(/\D/g, '') || selectedMesa.nombre}
              </Text>
            </Stack>
          </Group>
          <ActionIcon variant="light" color="gray" onClick={onClose} size="lg" radius="xl" className="hab-sidebar__close-button">
            <XIcon size={18} />
          </ActionIcon>
        </Group>
      </Box>

      <ScrollArea flex={1} p="lg">
        <form id="checkin-form" onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Box>
              <Group gap="xs" mb={12}>
                <UserIcon size={16} weight="bold" color="var(--ui-primary)" />
                <Text size="xs" fw={700} c="dimmed" className="hab-sidebar__section-label">
                  Nombre del huésped
                </Text>
              </Group>
              <Autocomplete
                placeholder="Buscar cliente o escribir nombre..."
                size="lg"
                radius="md"
                leftSection={<UserIcon size={18} />}
                data={clienteOptions}
                maxDropdownHeight={300}
                comboboxProps={{ withinPortal: true, zIndex: 10000 }}
                classNames={{ input: 'ui-input-tokenized', dropdown: 'ui-dropdown-tokenized' }}
                {...form.getInputProps('huesped')}
              />
            </Box>

            <Box>
              <Group gap="xs" mb={12}>
                <CalendarIcon size={16} weight="bold" color="var(--ui-primary)" />
                <Text size="xs" fw={700} c="dimmed" className="hab-sidebar__section-label">
                  Periodo de Estancia
                </Text>
              </Group>
              <DatePickerInput
                type="range"
                placeholder="Check-in — Check-out"
                size="lg"
                radius="md"
                leftSection={<CalendarIcon size={18} />}
                locale="es"
                clearable
                minDate={new Date()}
                classNames={{ input: 'ui-input-tokenized' }}
                {...form.getInputProps('rango')}
              />
            </Box>

            <Box>
              <Group gap="xs" mb={12}>
                <ReceiptIcon size={16} weight="bold" color="var(--ui-primary)" />
                <Text size="xs" fw={700} c="dimmed" className="hab-sidebar__section-label">
                  Notas / Observaciones
                </Text>
              </Group>
              <Textarea
                placeholder="Observaciones de la estancia..."
                size="lg"
                radius="md"
                rows={3}
                classNames={{ input: 'ui-input-tokenized' }}
                {...form.getInputProps('notas')}
              />
            </Box>
          </Stack>
        </form>
      </ScrollArea>

      <Box p="lg" className="hab-sidebar__footer">
        <Group grow gap="sm">
          <Button
            type="submit"
            form="checkin-form"
            color="myColor"
            size="lg"
            radius="md"
            leftSection={<BedIcon size={18} weight="bold" />}
            loading={isLoading}
            fw={900}
          >
            Abrir Cuenta
          </Button>
          <Button variant="light" color="red" size="lg" radius="md" onClick={onClose} fw={800}>
            Cancelar
          </Button>
        </Group>
      </Box>
    </Box>
  )
}
