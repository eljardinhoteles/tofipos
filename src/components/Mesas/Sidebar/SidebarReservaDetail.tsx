import { useEffect, useState, useRef } from 'react';
import {
  Box, Stack, Group, Text, Button, ActionIcon,
  Badge, ScrollArea, Divider, ThemeIcon, NumberInput, Paper,
  SimpleGrid, UnstyledButton
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  CalendarBlank, Clock, Users, MapPin, ArrowLeft,
  Money, Note, HandCoins, PencilSimple,
  CreditCard, Bank, Calculator, X, ArrowUpRight, CheckCircle,
  Basket, Minus, Plus, Trash, ListPlus, Printer
} from '@phosphor-icons/react';
import { type Reserva } from '../../../db/database';
import { sileo } from 'sileo';
import { useUI } from '../../../context/UIContext';
import { PaymentMethodButton } from './SidebarCheckout';
import { ClienteExpandableHeader } from './ClienteExpandableHeader';
import { ComandaItemRow } from './ComandaItemRow';
import { ClienteFormModal } from '../../Clientes/ClienteFormModal';
import { ProductModifiersModal } from '../../Products/ProductModifiersModal';
import { useIvaActivo } from '../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from '../../../lib/taxUtils';
import { useRxClientes } from '../../../hooks/useRxClientes';
import { initVerticalRxDb, updateRxReserva, updateRxComanda, createRxPago, updateRxComandaItem } from '../../../db/rxdb';
import { useRxMenuCatalog } from '../../../hooks/useRxMenuCatalog';
import html2canvas from 'html2canvas';
import { ReservaWhatsAppCard } from './ReservaWhatsAppCard';
import { generarComandaCocina } from '../../../services/printTemplateEngine';
import { TicketPreviewModal } from '../../Common/TicketPreviewModal';

interface SidebarReservaDetailProps {
  reservaId: string;
  onBack: () => void;
  onClose: () => void;
}

const STATUS_COLOR: Record<Reserva['estado'], string> = {
  pendiente: 'yellow',
  confirmada: 'green',
  cancelada: 'red',
  completada: 'gray',
};
  const STATUS_LABEL: Record<Reserva['estado'], string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Completada',
};
const STATUS_ICON_BG: Record<Reserva['estado'], string> = {
  pendiente: 'var(--ui-primary)',
  confirmada: 'var(--status-active)',
  cancelada: 'var(--status-closed)',
  completada: 'var(--mantine-color-gray-6)',
};

export function SidebarReservaDetail({ reservaId, onBack, onClose }: SidebarReservaDetailProps) {
  const whatsappCardRef = useRef<HTMLDivElement>(null);
  const [previewOpened, setPreviewOpened] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [abonoInput, setAbonoInput] = useState<number | ''>('');
  const [abonoMetodo, setAbonoMetodo] = useState<'efectivo' | 'tarjeta' | 'transferencia' | 'otros'>('efectivo');
  const [view, setView] = useState<'detalles' | 'pagos'>('detalles');
  const [editClienteModal, setEditClienteModal] = useState(false);
  const [isAddPressed, setIsAddPressed] = useState(false);
  
  const { setReservaView, openConfirm, openAssignModal, reservaProductosComandaId, setReservaProductosComandaId } = useUI();

  const [reserva, setReserva] = useState<any | null>(null);
  const [comandaItems, setComandaItems] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [zonas, setZonas] = useState<any[]>([]);
  const { clientes } = useRxClientes();
  const [mesas, setMesas] = useState<any[]>([]);
  const [codigoReserva, setCodigoReserva] = useState<string>('');

  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
  const { menuItems } = useRxMenuCatalog();

  const handlePrint = () => {
    if (!reserva) return;
    const mockComanda = {
      id: reserva.comanda_id || '',
      folio: reserva.folio || 0,
      cliente: reserva.nombre,
      created_at: reserva.created_at,
    };
    const content = generarComandaCocina(
      mockComanda as any,
      comandaItems,
      `Reserva: ${reserva.nombre}`,
      false
    );
    setPreviewContent(content);
    setPreviewTitle(`Orden de Cocina - ${reserva.nombre}`);
    setPreviewOpened(true);
    sileo.success({ title: 'Comanda generada', description: 'Vista previa de cocina abierta.' });
  };

  const handleShareWhatsApp = async () => {
    if (!reserva || !whatsappCardRef.current) return;
    try {
      const canvas = await html2canvas(whatsappCardRef.current, {
        backgroundColor: '#f8f9fa',
        scale: 2,
        logging: false,
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          sileo.error({ title: 'Error', description: 'No se pudo generar la imagen' });
          return;
        }

        // Descargar la imagen
        const fileName = `reserva-${reserva.folio || codigoReserva || reserva.id.substring(0, 6)}.png`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Copiar al portapapeles
        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({
                'image/png': blob
              })
            ]);
            sileo.success({ 
              title: 'Listo', 
              description: 'Imagen descargada y copiada al portapapeles.' 
            });
          } else {
            sileo.success({ 
              title: 'Descargado', 
              description: 'Imagen descargada (portapapeles no soportado).' 
            });
          }
        } catch (copyErr) {
          console.error(copyErr);
          sileo.success({ 
            title: 'Descargado', 
            description: 'Imagen descargada.' 
          });
        }
      }, 'image/png');
    } catch (err) {
      console.error(err);
      sileo.error({ title: 'Error', description: 'No se pudo generar la imagen' });
    }
  };

  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [modifyingProduct, setModifyingProduct] = useState<any | null>(null);

  const editForm = useForm({
    initialValues: {
      cantidad: 1,
      precio: 0,
    }
  });

  useEffect(() => {
    if (editingItem) {
      editForm.setValues({
        cantidad: editingItem.cantidad,
        precio: editingItem.precio,
      });
    }
  }, [editingItem]);

  const handleUpdateItem = async (values: typeof editForm.values) => {
    if (!editingItem) return;
    if (editingItem.pagado_cantidad && editingItem.pagado_cantidad > 0) {
      sileo.error({ title: 'Error', description: 'No se puede modificar un producto que ya tiene unidades pagadas.' });
      setEditingItem(null);
      return;
    }
    await updateRxComandaItem(editingItem.id, {
      cantidad: values.cantidad,
      precio: values.precio
    });

    if (reserva?.comanda_id) {
      await updateRxComanda(reserva.comanda_id, { confirmada: false });
    }

    setEditingItem(null);
  };

  const handleDeleteItem = async () => {
    if (!editingItem) return;
    if (editingItem.pagado_cantidad && editingItem.pagado_cantidad > 0) {
      sileo.error({ title: 'Error', description: 'No se puede eliminar un producto que ya tiene unidades pagadas.' });
      setEditingItem(null);
      return;
    }
    await updateRxComandaItem(editingItem.id, { _deleted: true });

    if (reserva?.comanda_id) {
      await updateRxComanda(reserva.comanda_id, { confirmada: false });
    }

    setEditingItem(null);
  };

  useEffect(() => {
    let alive = true;
    let subs: Array<{ unsubscribe: () => void }> = [];
    let comandaSubs: Array<{ unsubscribe: () => void }> = [];

    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';

      subs.push(
        rxDb.pisos.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
          if (alive) setZonas(docs.map((d: any) => d.toJSON()));
        }),
        rxDb.mesas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
          if (alive) setMesas(docs.map((d: any) => d.toJSON()));
        }),
        rxDb.reservas.findOne(reservaId).$.subscribe((reservaDoc: any) => {
          if (!alive) return;
          const r = reservaDoc ? reservaDoc.toJSON() : null;
          setReserva(r);

          if (r) {
            rxDb.reservas.find({
              selector: {
                organization_id: orgId,
                _deleted: { $ne: true },
                $or: [
                  { created_at: { $lt: r.created_at } },
                  { created_at: r.created_at, id: { $lt: r.id } }
                ]
              }
            }).exec().then(docs => {
              if (alive) {
                setCodigoReserva(`R${docs.length + 1}`);
              }
            }).catch((err) => {
              console.error(err);
            });
          } else {
            setCodigoReserva('');
          }

          // Clear previous comanda subscriptions if comanda_id changed or was removed
          comandaSubs.forEach(s => s.unsubscribe());
          comandaSubs = [];

          if (r?.comanda_id) {
            comandaSubs.push(
              rxDb.comanda_items.find({ selector: { comanda_id: r.comanda_id, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
                if (alive) setComandaItems(docs.map((d: any) => d.toJSON()));
              }),
              rxDb.pagos.find({ selector: { comanda_id: r.comanda_id, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
                if (alive) setPagos(docs.map((d: any) => d.toJSON()));
              })
            );
          } else {
            setComandaItems([]);
            setPagos([]);
          }
        })
      );
    })().catch(() => {});

    return () => {
      alive = false;
      subs.forEach(s => s.unsubscribe());
      comandaSubs.forEach(s => s.unsubscribe());
    };
  }, [reservaId]);

  if (!reserva) return null;

  const isReadOnly = reserva.estado === 'completada' || reserva.estado === 'cancelada';
  
  // Cálculos financieros centralizados por item
  const totales = calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);
  const subtotal = totales.subtotalNeto;
  const iva = totales.ivaTotal;
  const total = totales.total;
  const totalAbonado = pagos.reduce((acc, p) => acc + p.monto, 0);

  const fechaDisplay = new Date(reserva.fecha + 'T12:00').toLocaleDateString('es-ES', {
    dateStyle: 'full'
  });

  const handleRegistrarAbono = async () => {
    if (!reserva.comanda_id || !abonoInput || abonoInput <= 0) return;
    sileo.info({ title: 'Guardando pago', description: 'Publicando abono en la nube...' });
    await createRxPago({
      id: crypto.randomUUID(),
      comanda_id: reserva.comanda_id,
      monto: abonoInput as number,
      metodo_pago: abonoMetodo,
      fecha: new Date().toISOString(),
      tipo_division: 'monto_fijo',
      organization_id: localStorage.getItem('pos_active_org_id') || ''
    });
    setAbonoInput('');
    sileo.success({ title: 'Abono registrado', description: 'Guardado en la nube.' });
  };

  if (view === 'pagos') {
    return (
      <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Header Pagos */}
        <Box p="md" pb="xs" style={{ borderBottom: '1px solid var(--pos-border)' }}>
          <Group justify="space-between" align="center">
            <Group gap="md">
              <ActionIcon variant="light" size="xl" radius="xl" onClick={() => setView('detalles')}>
                <ArrowLeft size={22} weight="bold" />
              </ActionIcon>
              <Stack gap={0}>
                <Text fw={800} size="md" c="var(--pos-text)" style={{ lineHeight: 1 }}>Historial de Pagos</Text>
                <Text size="11px" c="dimmed" fw={700} mt={2} style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Reserva de {reserva.nombre}
                </Text>
              </Stack>
            </Group>
          </Group>
        </Box>

        <ScrollArea flex={1} p="lg">
          <Stack gap="lg">
            {/* Total del pedido y restante */}
            {comandaItems.length > 0 && (() => {
              const restante = Math.max(0, total - totalAbonado);
              return (
                <UnstyledButton 
                  px="lg" py="md" w="100%"
                  onClick={() => setAbonoInput(parseFloat(restante.toFixed(2)))}
                    style={{
                      borderRadius: 12,
                      backgroundColor: 'var(--ui-primary-soft)',
                      border: '1px solid var(--ui-primary)',
                      transition: 'transform 0.1s ease',
                    }}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <Group justify="space-between" align="center">
                    <Stack gap={2}>
                      <Text size="xs" fw={700} c="var(--ui-primary)" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {totalAbonado > 0 ? 'Restante por pagar' : 'Total del pedido'}
                      </Text>
                      <Text size="10px" c="dimmed" fw={500}>Subtotal ${subtotal.toFixed(2)} + IVA {ivaPorcentaje}%</Text>
                    </Stack>
                    <Text size="xl" fw={900} c="var(--ui-primary)">${restante.toFixed(2)}</Text>
                  </Group>
                </UnstyledButton>
              );
            })()}

            {/* Pagos anteriores */}
            {pagos.length > 0 && (
              <Box p="md" style={{ borderRadius: 12, border: '1px solid var(--pos-border)', backgroundColor: 'var(--pos-surface)' }}>
                <Text size="xs" fw={700} c="dimmed" mb="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pagos Anteriores</Text>
                <Stack gap={8}>
                  {pagos.map(pago => (
                    <Group key={pago.id} justify="space-between">
                      <Stack gap={0}>
                        <Text size="sm" fw={700} style={{ textTransform: 'capitalize' }}>{pago.metodo_pago}</Text>
                        <Text size="xs" c="dimmed">{new Date(pago.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                      </Stack>
                      <Text size="sm" fw={800} c="green.7">+${pago.monto.toFixed(2)}</Text>
                    </Group>
                  ))}
                  <Divider my={4} />
                  <Group justify="space-between">
                    <Text size="md" fw={700}>Total Abonado</Text>
                    <Text size="lg" fw={900} c="green.7">${totalAbonado.toFixed(2)}</Text>
                  </Group>
                </Stack>
              </Box>
            )}

            {/* Registrar nuevo abono */}
            {!isReadOnly && (
              <Box>
                <Group gap="xs" mb={16}>
                  <HandCoins size={16} weight="bold" color="var(--ui-primary)" />
                  <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Registrar Nuevo Anticipo</Text>
                </Group>
                
                <NumberInput
                  size="xl"
                  radius="md"
                  mb="lg"
                  placeholder="0.00"
                  prefix="$ "
                  decimalScale={2}
                  fixedDecimalScale
                  value={abonoInput}
                  onChange={(val) => setAbonoInput(val === '' ? '' : Number(val))}
                  styles={{ input: { fontSize: 24, fontWeight: 900, textAlign: 'center', height: 70, backgroundColor: 'var(--pos-bg)' } }}
                />

                <Box style={{ opacity: (typeof abonoInput === 'number' && abonoInput > 0) ? 1 : 0.4, pointerEvents: (typeof abonoInput === 'number' && abonoInput > 0) ? 'auto' : 'none', transition: 'all 0.2s ease' }}>
                  <Text size="xs" fw={700} c="dimmed" mb="sm" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Método de pago
                  </Text>
                  <SimpleGrid cols={4} spacing="xs" mb="lg">
                    <PaymentMethodButton active={abonoMetodo === 'efectivo'} onClick={() => setAbonoMetodo('efectivo')} icon={Money} label="Efectivo" color="green" />
                    <PaymentMethodButton active={abonoMetodo === 'tarjeta'} onClick={() => setAbonoMetodo('tarjeta')} icon={CreditCard} label="Tarjeta" color="myColor" />
                    <PaymentMethodButton active={abonoMetodo === 'transferencia'} onClick={() => setAbonoMetodo('transferencia')} icon={Bank} label="Transfer" color="violet" />
                    <PaymentMethodButton active={abonoMetodo === 'otros'} onClick={() => setAbonoMetodo('otros')} icon={Calculator} label="Otros" color="gray" />
                  </SimpleGrid>

                  <Button radius="md" size="lg" h={54} color="var(--ui-primary)" fullWidth onClick={handleRegistrarAbono}
                    disabled={!abonoInput || (abonoInput as number) <= 0} style={{ fontWeight: 900 }}>
                    Añadir Pago
                  </Button>
                </Box>
              </Box>
            )}
          </Stack>
        </ScrollArea>
      </Box>
    );
  }

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header Detalles */}
      <Box p="md" pb={0}>
        <Group justify="space-between" align="center">
          <Group gap="md">
            <Box style={{
              width: 46, height: 46, borderRadius: 12,
              backgroundColor: STATUS_ICON_BG[reserva.estado as Reserva['estado']],
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <CalendarBlank size={22} weight="bold" color="white" />
            </Box>
            <Stack gap={0}>
              <Text fw={800} size="md" c="var(--pos-text)" style={{ lineHeight: 1.1 }}>
                {codigoReserva ? `${codigoReserva} - ` : ''}{reserva.nombre}
              </Text>
              <Text size="11px" fw={700} c={STATUS_COLOR[reserva.estado as Reserva['estado']]} mt={4} style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Reserva {STATUS_LABEL[reserva.estado as Reserva['estado']]}
              </Text>
            </Stack>
          </Group>
          <Group gap="xs">
            <ActionIcon 
              variant="light" 
              color="green" 
              onClick={handleShareWhatsApp} 
              size="lg" 
              radius="xl"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="20" height="20" fill="currentColor">
                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
              </svg>
            </ActionIcon>
            <ActionIcon 
              variant="light" 
              color="gray" 
              onClick={onBack} 
              size="lg" 
              radius="xl"
              style={{ 
                backgroundColor: 'rgba(255,255,255,0.05)', 
                color: 'var(--pos-text-sub)' 
              }}
            >
              <X size={18} weight="bold" />
            </ActionIcon>
          </Group>
        </Group>

        <ClienteExpandableHeader
          clienteNombre={reserva.nombre}
          showEditButton
          onEdit={() => setEditClienteModal(true)}
          onChangeCliente={async (nuevoNombre) => {
            if (reserva) {
              await updateRxReserva(reserva.id, { nombre: nuevoNombre });
              sileo.success({
                title: 'Huésped cambiado',
                description: `La reserva ahora está a nombre de ${nuevoNombre}.`
              });
            }
          }}
        />
      </Box>

      <ScrollArea flex={1} p="lg">
        <Stack gap="lg">
          {reserva.estado === 'completada' && (
            <Paper
              withBorder
              p="sm"
              radius="md"
              style={{
                backgroundColor: 'var(--mantine-color-green-0)',
                borderColor: 'var(--mantine-color-green-2)',
              }}
            >
              <Group gap="xs" align="center" wrap="nowrap">
                <ThemeIcon color="green" radius="xl" size="md">
                  <CheckCircle size={14} weight="bold" />
                </ThemeIcon>
                <Stack gap={1}>
                  <Text size="xs" fw={800} c="var(--mantine-color-green-9)" style={{ lineHeight: 1.2 }}>
                    Asignada a Mesa {mesas.find(m => m.id === reserva.mesa_id)?.nombre || reserva.mesa_id || 'N/A'}
                  </Text>
                  <Text size="10px" c="var(--mantine-color-green-7)" fw={600} style={{ textTransform: 'capitalize' }}>
                    El {fechaDisplay} a las {reserva.hora} hs
                  </Text>
                </Stack>
              </Group>
            </Paper>
          )}

          {/* Info principal */}
          <Box>
            <Paper withBorder shadow="none" radius="md" py="xs" px="sm" style={{ backgroundColor: 'var(--pos-bg-light)', borderColor: 'var(--pos-border)' }}>
              <Stack gap="6px">
                {/* Fecha */}
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <CalendarBlank size={14} weight="bold" color="var(--ui-primary)" />
                    <Text size="xs" fw={600} c="dimmed">Fecha</Text>
                  </Group>
                  <Text size="xs" fw={700} style={{ textTransform: 'capitalize' }}>
                    {fechaDisplay}
                  </Text>
                </Group>

                <Divider color="var(--pos-border)" style={{ opacity: 0.4 }} />

                {/* Hora */}
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <Clock size={14} weight="bold" color="var(--ui-primary)" />
                    <Text size="xs" fw={600} c="dimmed">Hora</Text>
                  </Group>
                  <Badge color="myColor" variant="light" size="sm" radius="sm" style={{ fontSize: '11px', fontWeight: 800, height: 20 }}>
                    {reserva.hora}
                  </Badge>
                </Group>

                <Divider color="var(--pos-border)" style={{ opacity: 0.4 }} />

                {/* Personas */}
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <Users size={14} weight="bold" color="var(--ui-primary)" />
                    <Text size="xs" fw={600} c="dimmed">Personas</Text>
                  </Group>
                  <Text size="xs" fw={700}>
                    {reserva.personas} comensales
                  </Text>
                </Group>

                <Divider color="var(--pos-border)" style={{ opacity: 0.4 }} />

                {/* Zona */}
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <MapPin size={14} weight="bold" color="var(--ui-primary)" />
                    <Text size="xs" fw={600} c="dimmed">Zona</Text>
                  </Group>
                  <Text size="xs" fw={700} style={{ textTransform: 'capitalize' }}>
                    {zonas.find(z => z.id === reserva.zona_id)?.nombre || 'General'}
                  </Text>
                </Group>
              </Stack>
            </Paper>
          </Box>

          {/* Notas */}
          {reserva.nota && (
            <Box>
              <Group gap="xs" mb={8}>
                <Note size={16} weight="bold" color="var(--ui-primary)" />
                <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nota del cliente</Text>
              </Group>
              <Box p="md" style={{ borderRadius: 12, backgroundColor: 'var(--pos-bg)', border: '1px solid var(--pos-border)' }}>
                <Text size="sm" fw={500} c="var(--pos-text)" style={{ fontStyle: 'italic' }}>
                  "{reserva.nota}"
                </Text>
              </Box>
            </Box>
          )}

          {/* Pedido anticipado */}
          {comandaItems.length > 0 && (
            <Box>
              <Stack gap={2}>
                {comandaItems.map((item, index) => {
                  const hasPaidQty = item.pagado_cantidad && item.pagado_cantidad > 0;
                  return (
                    <ComandaItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      total={comandaItems.length}
                      onClick={
                        isReadOnly
                          ? undefined
                          : hasPaidQty
                          ? () => sileo.warning({
                              title: 'Producto con pagos',
                              description: 'No se puede modificar un producto que ya tiene unidades pagadas.'
                            })
                          : () => setEditingItem(item)
                      }
                    />
                  );
                })}
              </Stack>
            </Box>
          )}
        </Stack>
      </ScrollArea>

      {/* Action Footer */}
      <Box
        p="lg"
        className="sidebar-details__footer"
        style={{ flexShrink: 0 }}
      >
        {!editingItem && !isReadOnly && reserva.comanda_id && (() => {
          const isSelectingProducts = reservaProductosComandaId === reserva.comanda_id;
          return (
            <Button
              variant="subtle"
              color="myColor"
              size="md"
              radius="xl"
              leftSection={isSelectingProducts ? <CheckCircle size={18} weight="bold" /> : <Basket size={18} />}
              onClick={isSelectingProducts ? () => setReservaProductosComandaId(null) : () => setReservaProductosComandaId(reserva.comanda_id)}
              onPointerDown={() => setIsAddPressed(true)}
              onPointerUp={() => setIsAddPressed(false)}
              onPointerCancel={() => setIsAddPressed(false)}
              onPointerLeave={() => setIsAddPressed(false)}
              className={`sidebar-details__add-button${isAddPressed ? ' sidebar-details__add-button--pressed' : ''}${comandaItems.length === 0 ? ' sidebar-details__add-button--pulse' : ''}`}
            >
              {isSelectingProducts ? 'Guardar' : 'Añadir'}
            </Button>
          );
        })()}

        <Stack gap="xs">
          {/* Totales del pedido */}
          {!editingItem && (comandaItems.length > 0 || totalAbonado > 0) && (
            <Stack gap="xs" mb="sm">
              <Group justify="space-between">
                <Text size="sm" c="dimmed" fw={600}>Subtotal</Text>
                <Text fw={700} size="sm" c="var(--pos-text)">${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed" fw={600}>IVA {ivaPorcentaje}%</Text>
                <Text fw={700} size="sm" c="var(--pos-text)">${iva.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
              </Group>

              {totalAbonado > 0 && (
                <UnstyledButton onClick={() => setView('pagos')} py={4} style={{ borderRadius: '4px', transition: 'background-color 0.2s' }} className="hover-bg-gray">
                  <Group justify="space-between">
                    <Text size="sm" c="green.8" fw={700} style={{ textDecoration: 'underline', textUnderlineOffset: '4px' }}>PAGADO (ANTICIPOS)</Text>
                    <Text size="sm" fw={700} c="green.8">-${totalAbonado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                  </Group>
                </UnstyledButton>
              )}

              <Divider my={4} color="var(--pos-border)" />

              {totalAbonado > 0 ? (
                <Group justify="space-between" mt={4} p="md" style={{ backgroundColor: 'var(--mantine-color-orange-0)', borderRadius: '12px', border: '1px solid var(--mantine-color-orange-3)' }}>
                  <Stack gap={0}>
                    <Text size="xs" c="orange.9" fw={700} tt="uppercase">{totalAbonado > total ? 'SALDO A FAVOR' : 'PENDIENTE'}</Text>
                    <Text size="sm" c="dimmed" fw={500}>De un total de ${total.toFixed(2)}</Text>
                  </Stack>
                  <Text size="24px" fw={900} c={totalAbonado > total ? 'green.8' : 'orange.9'}>
                    ${Math.abs(total - totalAbonado).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </Group>
              ) : (
                <Group justify="space-between">
                  <Text size="md" fw={800} tt="uppercase" c="var(--pos-text)">Total</Text>
                  <Text size="24px" fw={900} c="var(--ui-primary)">${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                </Group>
              )}
            </Stack>
          )}

          <Stack gap="sm" mt="xs">
            {editingItem ? (
              <form onSubmit={editForm.onSubmit(handleUpdateItem)} style={{ width: '100%' }}>
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={800} tt="uppercase" c="var(--ui-primary)">Editando Producto</Text>
                    <ActionIcon variant="subtle" color="gray" onClick={() => setEditingItem(null)}>
                      <X size={18} />
                    </ActionIcon>
                  </Group>

                  <Group gap="md" justify="center">
                    <ActionIcon
                      size="xl"
                      variant="white"
                      radius="xl"
                      onClick={() => editForm.setFieldValue('cantidad', Math.max(1, editForm.values.cantidad - 1))}
                      style={{ border: '1px solid var(--pos-border)' }}
                    >
                      <Minus size={22} weight="bold" />
                    </ActionIcon>

                    <Box ta="center" miw={60}>
                      <Text size="32px" fw={900}>{editForm.values.cantidad}</Text>
                    </Box>

                    <ActionIcon
                      size="xl"
                      variant="white"
                      radius="xl"
                      onClick={() => editForm.setFieldValue('cantidad', editForm.values.cantidad + 1)}
                      style={{ border: '1px solid var(--pos-border)' }}
                    >
                      <Plus size={22} weight="bold" />
                    </ActionIcon>
                  </Group>

                  <NumberInput
                    label="Precio Unitario"
                    prefix="$"
                    decimalScale={2}
                    fixedDecimalScale
                    {...editForm.getInputProps('precio')}
                    radius="md"
                    size="md"
                  />

                  <Button
                    variant="light"
                    color="myColor"
                    fullWidth
                    size="md"
                    leftSection={<ListPlus size={18} />}
                    onClick={async () => {
                      if (!editingItem) return;
                      const product = menuItems.find((m: any) => m.id === editingItem.item_id);
                      if (product) {
                        setModifyingProduct(product);
                      } else {
                        sileo.error({ title: 'Error', description: 'No se encontró la configuración del producto.' });
                      }
                    }}
                  >
                    Personalizar (Adicionales)
                  </Button>

                  <Group grow gap="sm" mt="xs">
                    <Button
                      variant="subtle"
                      color="red"
                      radius="md"
                      size="lg"
                      leftSection={<Trash size={20} />}
                      onClick={handleDeleteItem}
                    >
                      Eliminar
                    </Button>
                    <Button
                      type="submit"
                      color="myColor"
                      radius="md"
                      size="lg"
                    >
                      Guardar Cambios
                    </Button>
                  </Group>
                </Stack>
              </form>
            ) : (
              <>
                <Group grow gap="sm">
                  <Button 
                    variant="light" 
                    color="orange" 
                    size="lg" 
                    radius="md" 
                    onClick={handlePrint}
                    leftSection={<Printer size={18} />}
                    fw={800}
                  >
                    Ticket
                  </Button>
                  <Button 
                    variant="light" 
                    color="myColor" 
                    size="lg" 
                    radius="md" 
                    onClick={() => setView('pagos')} 
                    leftSection={<Money size={18} />}
                    fw={800}
                  >
                    Pagos
                  </Button>
                  {!isReadOnly && (
                    <Button 
                      variant="light" 
                      color="gray" 
                      size="lg" 
                      radius="md" 
                      onClick={() => setReservaView('nueva')} 
                      leftSection={<PencilSimple size={18} />}
                      fw={800}
                    >
                      Editar
                    </Button>
                  )}
                </Group>
            
                {!isReadOnly && (
                  <Button
                    color="green"
                    size="lg"
                    radius="md"
                    onClick={() => openAssignModal(reserva.id)}
                    leftSection={<ArrowUpRight size={18} weight="bold" />}
                    fw={900}
                    fullWidth
                  >
                    Asignar Mesa
                  </Button>
                )}

                {reserva.estado === 'cancelada' && (
                  <Button 
                    variant="light" 
                    color="red" 
                    size="lg" 
                    radius="md" 
                    fullWidth 
                    onClick={() => {
                      openConfirm(
                        'ELIMINAR RESERVA',
                        '¿Estás seguro de eliminar esta reserva permanentemente? Se borrarán sus datos y esta acción no se puede deshacer.',
                        async () => {
                          if (reserva.comanda_id) {
                            const rxDb = await initVerticalRxDb();
                            const pagosDocs = await rxDb.pagos.find({ selector: { comanda_id: reserva.comanda_id, _deleted: { $ne: true } } }).exec();
                            await Promise.all(pagosDocs.map(doc => doc.remove()));
                            const itemsDocs = await rxDb.comanda_items.find({ selector: { comanda_id: reserva.comanda_id, _deleted: { $ne: true } } }).exec();
                            await Promise.all(itemsDocs.map(doc => doc.remove()));
                            const comanda = await rxDb.comandas.findOne(reserva.comanda_id).exec();
                            if (comanda) {
                              await updateRxComanda(reserva.comanda_id, {
                                estado: 'anulada',
                                confirmada: true,
                              });
                            }
                          }
                          await updateRxReserva(reserva.id, { _deleted: true, nota: reserva.nota || 'Reserva eliminada' } as any);
                          onClose();
                        }
                      );
                    }}
                    fw={800}
                  >
                    Eliminar Reserva
                  </Button>
                )}
              </>
            )}
          </Stack>
        </Stack>
      </Box>

      <ClienteFormModal
        opened={editClienteModal}
        onClose={() => setEditClienteModal(false)}
        editingCliente={clientes.find(c => c.nombre === reserva.nombre) || null}
        initialNombre={reserva.nombre}
      />

      <ProductModifiersModal
        opened={!!modifyingProduct}
        onClose={() => setModifyingProduct(null)}
        product={modifyingProduct}
        onConfirm={async (selected) => {
          if (editingItem) {
            await updateRxComandaItem(editingItem.id, { modificadores: selected });
            setEditingItem((prev: any | null) => prev ? { ...prev, modificadores: selected } : null);
            sileo.success({ title: 'Adicionales Actualizados', description: 'Los modificadores se guardaron correctamente.' });
          }
        }}
      />

      {reserva && (
        <ReservaWhatsAppCard
          ref={whatsappCardRef}
          reserva={reserva}
          zonaNombre={zonas.find(z => z.id === reserva.zona_id)?.nombre || ''}
          comandaItems={comandaItems}
          totalMonto={calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva).total}
          totalAbonado={totalAbonado}
          codigoReserva={codigoReserva}
        />
      )}

      <TicketPreviewModal
        opened={previewOpened}
        onClose={() => setPreviewOpened(false)}
        title={previewTitle}
        content={previewContent}
      />
    </Box>
  );
}
