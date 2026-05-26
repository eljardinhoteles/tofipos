/**
 * ClienteExpandableHeader
 * Chevron flotante sobre línea divisora que expande los datos del cliente.
 * Reutilizado en SidebarDetails y SidebarReservaDetail.
 */
import { useState } from 'react';
import { Box, Stack, Text, Group, ActionIcon, Collapse, Autocomplete, Button } from '@mantine/core';
import { CaretDown, PencilSimple, Users, Copy as CopyIcon, Check, X } from '@phosphor-icons/react';
import { sileo } from 'sileo';
import { useRxClientes } from '../../../hooks/useRxClientes';

interface ClienteExpandableHeaderProps {
  /** Nombre del cliente tal como aparece en la comanda/reserva */
  clienteNombre: string | undefined;
  /** Si true, muestra el botón de editar (lápiz) */
  showEditButton?: boolean;
  /** Callback para abrir el modal de edición */
  onEdit?: () => void;
  /** Callback para cambiar el cliente vinculado */
  onChangeCliente?: (nombre: string, id: string) => void;
}

export function ClienteExpandableHeader({
  clienteNombre,
  showEditButton = false,
  onEdit,
  onChangeCliente,
}: ClienteExpandableHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [tempValue, setTempValue] = useState('');
  const { clientes } = useRxClientes();

  const cd = clientes.find(c => c.nombre === clienteNombre);
  const isSystemCliente = cd?.id === '99999999999' || clienteNombre === 'Consumidor Final';

  const rows = [
    { label: 'Nombre',        value: clienteNombre || 'Público General' },
    { label: 'Identificación', value: cd?.dni      || '—' },
    { label: 'Teléfono',      value: cd?.telefono  || '—' },
    { label: 'Email',         value: cd?.email     || '—' },
  ];

  const handleCopy = () => {
    const text = `Cliente: ${clienteNombre || 'Público General'}\n` +
                 `Identificación: ${cd?.dni || '—'}\n` +
                 `Teléfono: ${cd?.telefono || '—'}\n` +
                 `Email: ${cd?.email || '—'}`;
    navigator.clipboard.writeText(text);
    sileo.success({
      title: 'Datos copiados',
      description: 'Los datos del cliente se copiaron al portapapeles.'
    });
  };

  return (
    <>
      {/* Panel expandible — crece hacia abajo, encima del chevron */}
      <Collapse in={expanded}>
        <Box px="md" pb="xs" pt="xs">
          {isChanging ? (
            <Box w="100%">
              <Text size="xs" fw={700} c="dimmed" mb={8} style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Cambiar Cliente de la Cuenta
              </Text>
              <Group gap="xs" align="center" w="100%" wrap="nowrap">
                <Autocomplete
                  placeholder="Escribe o busca el cliente..."
                  size="sm"
                  variant="filled"
                  radius="md"
                  data={clientes.map(c => c.nombre)}
                  value={tempValue}
                  onChange={setTempValue}
                  style={{ flex: 1 }}
                  comboboxProps={{ withinPortal: true, zIndex: 10000 }}
                  styles={{
                    input: {
                      backgroundColor: 'var(--pos-bg)',
                      border: '1px solid var(--pos-border)'
                    },
                    dropdown: {
                      borderRadius: '12px',
                      boxShadow: 'var(--mantine-shadow-xl)',
                      border: '1px solid var(--pos-border)'
                    }
                  }}
                  onOptionSubmit={(val) => {
                    const matched = clientes.find(c => c.nombre === val);
                    if (onChangeCliente) {
                      onChangeCliente(val, matched?.id || '');
                      setIsChanging(false);
                    }
                  }}
                />
                <ActionIcon
                  variant="filled"
                  color="myColor"
                  size="md"
                  radius="md"
                  onClick={() => {
                    if (tempValue.trim() && onChangeCliente) {
                      const matched = clientes.find(c => c.nombre.trim().toLowerCase() === tempValue.trim().toLowerCase());
                      onChangeCliente(matched ? matched.nombre : tempValue.trim(), matched ? matched.id : '');
                      setIsChanging(false);
                    }
                  }}
                  disabled={!tempValue.trim()}
                >
                  <Check size={18} weight="bold" />
                </ActionIcon>
                <ActionIcon
                  variant="light"
                  color="gray"
                  size="md"
                  radius="md"
                  onClick={() => setIsChanging(false)}
                >
                  <X size={18} weight="bold" />
                </ActionIcon>
              </Group>
            </Box>
          ) : (
            <Stack gap={4}>
              <Stack gap={1}>
                {rows.map(r => (
                  <Text key={r.label} size="sm" c="var(--pos-text)" style={{ userSelect: 'text' }}>
                    <Text component="span" size="sm" c="dimmed" fw={600}>{r.label}: </Text>
                    {r.value}
                  </Text>
                ))}
                {cd?.notas && (
                  <Text size="sm" c="var(--pos-text)" style={{ userSelect: 'text' }}>
                    <Text component="span" size="sm" c="dimmed" fw={600}>Notas: </Text>
                    {cd.notas}
                  </Text>
                )}
              </Stack>

              {/* Botonera de tres acciones premium */}
              <Group gap="xs" mt="sm" w="100%">
                {!isSystemCliente && showEditButton && onEdit && (
                  <Button
                    variant="light"
                    color="myColor"
                    size="xs"
                    radius="md"
                    leftSection={<PencilSimple size={14} weight="bold" />}
                    onClick={onEdit}
                    fw={700}
                    style={{ flex: 1 }}
                  >
                    Editar
                  </Button>
                )}
                {onChangeCliente && (
                  <Button
                    variant="light"
                    color="orange"
                    size="xs"
                    radius="md"
                    leftSection={<Users size={14} weight="bold" />}
                    onClick={() => {
                      setTempValue(clienteNombre || '');
                      setIsChanging(true);
                    }}
                    fw={700}
                    style={{ flex: 1 }}
                  >
                    Cambiar
                  </Button>
                )}
                <Button
                  variant="light"
                  color="gray"
                  size="xs"
                  radius="md"
                  leftSection={<CopyIcon size={14} weight="bold" />}
                  onClick={handleCopy}
                  fw={700}
                  style={{ flex: 1 }}
                >
                  Copiar
                </Button>
              </Group>
            </Stack>
          )}
        </Box>
      </Collapse>

      {/* Divider con chevron flotante — siempre al fondo */}
      <Box
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 14,
          marginTop: 2,
        }}
      >
        <Box
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: 'var(--pos-border)',
          }}
        />
        <ActionIcon
          variant="subtle"
          color="gray"
          radius="xl"
          onClick={() => setExpanded(v => !v)}
          style={{
            position: 'relative',
            zIndex: 1,
            width: 20,
            height: 20,
            minWidth: 20,
            minHeight: 20,
            border: '1px solid var(--ui-primary)',
            backgroundColor: 'var(--ui-primary-soft)',
            padding: 0,
            opacity: 0.7,
          }}
        >
          <CaretDown
            size={10}
            weight="bold"
            color="var(--ui-primary)"
            style={{
              transition: 'transform 200ms ease',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </ActionIcon>
      </Box>
    </>
  );
}
