import { useState, useEffect } from 'react';
import 'dayjs/locale/es';
import {
  Box, Stack, Group, Text, Button, ActionIcon,
  Divider, Autocomplete, ScrollArea, Select, Textarea
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  CalendarBlank, Users, Note,
  Minus, Plus, UserPlus, MapPin, X
} from '@phosphor-icons/react';
import { sileo } from 'sileo';
import { useUI } from '../../../context/UIContext';
import { useRxClientes } from '../../../hooks/useRxClientes';
import { initVerticalRxDb, createRxReserva, updateRxReserva, createRxComanda } from '../../../db/rxdb';

interface SidebarReservaNewProps {
  onBack: () => void;
  onSuccess: (reservaId: string) => void;
}

const toISO = (d: Date | string | number | null | undefined) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toLocalDate = (val: string | Date | null | undefined): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return val;
  const matches = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matches) {
    return new Date(parseInt(matches[1], 10), parseInt(matches[2], 10) - 1, parseInt(matches[3], 10));
  }
  const parsed = new Date(val);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <Group gap={6} mb={10}>
      <Icon size={14} weight="bold" color="var(--mantine-color-myColor-6)" />
      <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </Text>
    </Group>
  );
}

export function SidebarReservaNew({ onBack, onSuccess }: SidebarReservaNewProps) {
  const { selectedReservaId, nuevaReservaPreset, setNuevaReservaPreset } = useUI();
  const [isEditMode, setIsEditMode] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [reservaId] = useState<string>(() => selectedReservaId || crypto.randomUUID());
  const [comandaId] = useState<string>(() => crypto.randomUUID());
  const [isProcessing, setIsProcessing] = useState(false);
  const [nota, setNota] = useState('');

  const [nombre, setNombre] = useState('');
  const [personas, setPersonas] = useState(2);
  const [fecha, setFecha] = useState<Date | null>(new Date());
  const [hora, setHora] = useState('19:00');
  const [zonaId, setZonaId] = useState<string | null>(null);
  const [nombreError, setNombreError] = useState('');

  const { clientes } = useRxClientes();
  const [zonas, setZonas] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const query = rxDb.pisos.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } },
        sort: [{ orden: 'asc' }, { nombre: 'asc' }]
      });
      sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setZonas(docs.map((doc: any) => doc.toJSON()));
      });
    })().catch(() => {});
    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function load() {
      if (selectedReservaId) {
        const rxDb = await initVerticalRxDb();
        const r = await rxDb.reservas.findOne(selectedReservaId).exec();
        if (r) {
          setIsEditMode(true);
          const data = r.toJSON();
          setNombre(data.nombre);
          setPersonas(data.personas);
          setFecha(new Date(data.fecha + 'T12:00:00'));
          setHora(data.hora);
          setZonaId(data.zona_id || null);
          setNota(data.nota || '');
        }
      } else if (nuevaReservaPreset) {
        if (nuevaReservaPreset.fecha) setFecha(nuevaReservaPreset.fecha);
        if (nuevaReservaPreset.zonaId) setZonaId(nuevaReservaPreset.zonaId);
        setNuevaReservaPreset(null);
      }
      setDataLoaded(true);
    }
    load();
  }, [selectedReservaId]);

  if (!dataLoaded) return null;

  const handleFinish = async () => {
    if (nombre.trim().length < 2) {
      setNombreError('Ingresa un nombre');
      return;
    }
    if (!fecha) return;
    setNombreError('');

    setIsProcessing(true);
    try {
      sileo.info({ title: 'Guardando reserva', description: 'Publicando cambios en la nube...' });
      const today = toISO(new Date());
      const dbDate = fecha ? toISO(fecha) : today;

      if (dbDate < today) {
        sileo.error({
          title: 'Fecha inválida',
          description: 'No puedes crear reservas en fechas pasadas.',
        });
        setIsProcessing(false);
        return;
      }

      if (isEditMode) {
        await updateRxReserva(reservaId, {
          nombre: nombre.trim(), fecha: dbDate, hora, personas,
          zona_id: zonaId || undefined, nota: nota.trim() || undefined,
        });
      } else {
        const now = new Date().toISOString();
        const rxDb = await initVerticalRxDb();
        const nextFolio = (await rxDb.comandas.find().exec()).length + 1;
        await createRxComanda({
          id: comandaId, folio: nextFolio,
          mesa_id: 'reserva_' + reservaId,
          mesa_nombre: 'Reserva',
          mesero: 'Sistema', cliente: nombre.trim(),
          estado: 'pendiente', total: 0,
          confirmada: true,
          organization_id: localStorage.getItem('pos_active_org_id') || '',
          created_at: now,
          updated_at: now,
        });
        await createRxReserva({
          id: reservaId, nombre: nombre.trim(), fecha: dbDate, hora, personas,
          zona_id: zonaId || undefined, estado: 'confirmada',
          comanda_id: comandaId, abono: 0,
          nota: nota.trim() || undefined,
          organization_id: localStorage.getItem('pos_active_org_id') || '',
          created_at: now,
          updated_at: now,
        });
      }

      sileo.success({
        title: isEditMode ? 'Reserva actualizada' : 'Reserva creada',
        description: 'Guardada y publicada en la nube.',
      });
      onSuccess(reservaId);
    } catch (e) {
      console.error(e);
      sileo.error({ title: isEditMode ? 'Error al actualizar' : 'Error al crear la reserva' });
    } finally {
      setIsProcessing(false);
    }
  };

  const Header = (
    <Box px="md" pt="md" style={{ flexShrink: 0 }}>
      <Group justify="space-between" align="center" mb="md">
        <Stack gap={0}>
          <Text fw={900} size="lg" c="var(--pos-text)" style={{ lineHeight: 1 }}>
            {isEditMode ? 'Editar Reserva' : 'Nueva Reserva'}
          </Text>
          <Group gap={6} mt={4}>
            <UserPlus size={16} weight="bold" color="var(--ui-primary)" />
            <Text fw={700} size="sm" c="var(--pos-text)">{nombre || 'Cliente sin asignar'}</Text>
          </Group>
        </Stack>
        <ActionIcon
          variant="light"
          color="gray"
          onClick={onBack}
          size="lg"
          radius="xl"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--pos-text-sub)' }}
        >
          <X size={18} weight="bold" />
        </ActionIcon>
      </Group>
      <Divider style={{ margin: '0 -16px' }} />
    </Box>
  );

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      {Header}
      <ScrollArea flex={1} type="never" px="md" pt="md" pb="md">
        <Stack gap="xl">
          <Box>
            <SectionLabel icon={UserPlus} label="Nombre del cliente" />
            <Autocomplete
              placeholder="Ej: Juan Pérez"
              size="lg"
              radius="md"
              data={Array.from(new Set(clientes.map(c => c.nombre).filter(Boolean)))}
              value={nombre}
              onChange={v => { setNombre(v); setNombreError(''); }}
              leftSection={<UserPlus size={18} />}
              error={nombreError}
              maxDropdownHeight={260}
              comboboxProps={{ withinPortal: true, zIndex: 10000 }}
            />
          </Box>
          <Box>
            <SectionLabel icon={Users} label="Comensales" />
            <Group gap="md" align="center" justify="center" mt="sm">
              <ActionIcon size={40} variant="light" color="gray" radius="xl" onClick={() => setPersonas(Math.max(1, personas - 1))}>
                <Minus size={18} weight="bold" />
              </ActionIcon>
              <Text size="24px" fw={900} w={48} ta="center" c="var(--pos-text)">{personas}</Text>
              <ActionIcon size={40} variant="light" color="gray" radius="xl" onClick={() => setPersonas(Math.min(50, personas + 1))}>
                <Plus size={18} weight="bold" />
              </ActionIcon>
            </Group>
          </Box>
          <Box>
            <SectionLabel icon={CalendarBlank} label="Fecha y hora" />
            <Stack gap="xs">
              <DatePickerInput
                size="lg"
                radius="md"
                leftSection={<CalendarBlank size={18} />}
                dropdownType="modal"
                modalProps={{ zIndex: 10000 }}
                locale="es"
                valueFormat="dddd, D [de] MMMM [de] YYYY"
                minDate={(() => {
                  const d = new Date();
                  d.setHours(0, 0, 0, 0);
                  return d;
                })()}
                value={fecha}
                onChange={(val: any) => setFecha(toLocalDate(val))}
              />
              <Group gap={6} wrap="nowrap" align="flex-start">
                <Select
                  size="lg"
                  radius="md"
                  placeholder="HH"
                  data={Array.from({ length: 24 }, (_, i) => ({ value: String(i).padStart(2, '0'), label: String(i).padStart(2, '0') }))}
                  value={hora.split(':')[0]}
                  onChange={h => setHora(`${h || '19'}:${hora.split(':')[1] || '00'}`)}
                  style={{ flex: 1 }}
                  allowDeselect={false}
                />
                <Box style={{ display: 'flex', alignItems: 'center', height: 52, fontWeight: 900, fontSize: 22, color: 'var(--pos-text-muted)' }}>:</Box>
                <Select
                  size="lg"
                  radius="md"
                  placeholder="MM"
                  data={Array.from({ length: 12 }, (_, i) => ({ value: String(i * 5).padStart(2, '0'), label: String(i * 5).padStart(2, '0') }))}
                  value={hora.split(':')[1]}
                  onChange={m => setHora(`${hora.split(':')[0] || '19'}:${m || '00'}`)}
                  style={{ flex: 1 }}
                  allowDeselect={false}
                />
              </Group>
            </Stack>
          </Box>
          <Box>
            <SectionLabel icon={MapPin} label="Zona preferida" />
            <Select
              placeholder="Cualquier zona"
              size="lg"
              radius="md"
              data={zonas.map(z => ({ value: z.id, label: z.nombre }))}
              value={zonaId}
              onChange={setZonaId}
              clearable
            />
          </Box>
          <Box>
            <SectionLabel icon={Note} label="Notas de la reserva" />
            <Textarea
              placeholder="Ej: Mesa cerca de la ventana, alergias, botella de champaña..."
              size="lg"
              radius="md"
              minRows={3}
              maxRows={6}
              autosize
              value={nota}
              onChange={e => setNota(e.currentTarget.value)}
              styles={{ input: { backgroundColor: 'var(--pos-surface)' } }}
            />
          </Box>
        </Stack>
      </ScrollArea>
      <Box p="lg" style={{ borderTop: '1px solid var(--pos-border)', backgroundColor: 'var(--pos-bg)', flexShrink: 0 }}>
        <Group grow gap="sm">
          <Button size="lg" radius="md" variant="light" color="gray" onClick={onBack} fw={800}>
            Cancelar
          </Button>
          <Button
            size="lg"
            radius="md"
            fw={900}
            loading={isProcessing}
            onClick={handleFinish}
            color="green"
          >
            {isEditMode ? 'Guardar Cambios' : 'Crear Reserva'}
          </Button>
        </Group>
      </Box>
    </Box>
  );
}
