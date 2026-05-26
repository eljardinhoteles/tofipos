// @ts-nocheck
import { useEffect, useState, useMemo } from 'react';
import {
  Box, Stack, Group, Text, Title, ActionIcon,
  Badge, ScrollArea, Divider, NumberInput, Button, ThemeIcon, Paper, Modal, TextInput, SimpleGrid
} from '@mantine/core';
import {
  ArrowLeft, ArrowRight, Receipt, Users, CurrencyCircleDollar, Check,
  Printer
} from '@phosphor-icons/react';
import type { Mesa, ComandaItem } from '../../../db/database';
import { sileo } from 'sileo';
import { useIvaActivo } from '../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from '../../../lib/taxUtils';
import { TicketPreviewModal } from '../../Common/TicketPreviewModal';
import { generarPrecuentaDividida } from '../../../services/printTemplateEngine';
import { useRxMenuCatalog } from '../../../hooks/useRxMenuCatalog';
import {
  initVerticalRxDb,
  createRxPago,
  updateRxComanda,
  updateRxComandaItem,
  updateRxMesa
} from '../../../db/rxdb';

interface SidebarSplitProps {
  selectedMesa: Mesa;
  activeComanda: any;
  comandaItems: any[];
  onBack: () => void;
  onSuccess: () => void;
}

export function SidebarSplit({ selectedMesa, activeComanda, comandaItems, onBack, onSuccess }: SidebarSplitProps) {
  const [splitMethod, setSplitMethod] = useState<'iguales' | 'productos' | 'monto' | null>(null);
  const [saldoInicialSplit, setSaldoInicialSplit] = useState<number>(0);

  // === ESTADOS PARA "POR PRODUCTOS" ===
  const [selectedItems, setSelectedItems] = useState<{id: string, qtyToPay: number}[]>([]);

  // === ESTADOS PARA "PARTES IGUALES" ===
  const [personas, setPersonas] = useState(2);
  const [selectedPersonaIdx, setSelectedPersonaIdx] = useState<number | null>(null);
  const [paidPersonaIndexes, setPaidPersonaIndexes] = useState<number[]>([]);

  // === ESTADOS PARA "MONTO" ===
  const [montoCustom, setMontoCustom] = useState<number | ''>('');

  // === ESTADO DE COBRO UNIFICADO ===
  const [cobrarModalState, setCobrarModalState] = useState<{
    monto: number;
    label: string;
    itemsPagados?: any[];
    onSuccessCallback?: () => void;
  } | null>(null);

  const [payerName, setPayerName] = useState<string>('');
  const [previewTicketText, setPreviewTicketText] = useState<string | null>(null);
  const [pagos, setPagos] = useState<any[]>([]);

  useEffect(() => {
    if (!activeComanda?.id) {
      setPagos([]);
      return;
    }

    let sub: { unsubscribe: () => void } | null = null;
    let alive = true;

    const run = async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const query = rxDb.pagos.find({
        selector: { comanda_id: activeComanda.id, _deleted: false }
      });
      const docs = await query.exec();
      if (!alive) return;
      setPagos(docs.map((doc: any) => doc.toJSON()));
      sub = query.$.subscribe((docs: any[]) => {
        setPagos(docs.map((doc: any) => doc.toJSON()));
      });
    };

    run().catch(console.error);

    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, [activeComanda?.id]);

  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
  const { menuItems } = useRxMenuCatalog();

  // Cálculos Base centralizados
  const totalesOriginales = useMemo(() => {
    return calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);
  }, [comandaItems, menuItems, ivaPorcentaje, preciosConIva]);


  const totalOriginal = totalesOriginales.total;

  const totalPagado = useMemo(() => pagos.reduce((acc, p) => acc + p.monto, 0), [pagos]);
  const saldoPendiente = Math.max(0, totalOriginal - totalPagado);

  const hasNonProductPayments = useMemo(() => {
    return pagos.some(p => {
      // Un pago NO es de productos si no tiene tipo_division o no contiene '(Productos)'
      return !p.tipo_division || !p.tipo_division.includes('(Productos)');
    });
  }, [pagos]);

  const montoPorPersona = useMemo(() => {
    return saldoInicialSplit / personas;
  }, [saldoInicialSplit, personas]);

  const totalesSeleccionados = useMemo(() => {
    if (selectedItems.length === 0) return { subtotalNeto: 0, ivaTotal: 0, total: 0 };
    const itemsTemporales = selectedItems.map(si => {
      const item = comandaItems.find(i => i.id === si.id);
      return {
        ...item,
        cantidad: si.qtyToPay
      } as ComandaItem;
    });
    return calcularTotalesComanda(itemsTemporales, menuItems, ivaPorcentaje, preciosConIva);
  }, [selectedItems, comandaItems, menuItems, ivaPorcentaje, preciosConIva]);

  const selectSplitMethod = (method: 'iguales' | 'productos' | 'monto') => {
    setSplitMethod(method);
    setSaldoInicialSplit(saldoPendiente);
    setSelectedPersonaIdx(null);
    setPaidPersonaIndexes([]);
    setMontoCustom('');
    setSelectedItems([]);
  };

  const procesarPagoSimple = async (
    monto: number,
    itemsPagados?: any[],
    label?: string,
    onSuccessCallback?: () => void,
    nameOfPayer?: string
  ) => {
    if (!activeComanda) return;
    try {
      // 1. Registrar pago único (sistema externo por defecto)
      await createRxPago({
        id: crypto.randomUUID(),
        comanda_id: activeComanda.id,
        monto,
        metodo_pago: 'efectivo',
        fecha: new Date().toISOString(),
        tipo_division: nameOfPayer?.trim()
          ? `Dividido - ${nameOfPayer.trim()}${itemsPagados && itemsPagados.length > 0 ? ' (Productos)' : ''}`
          : `Dividido - ${label || 'Parte'}${itemsPagados && itemsPagados.length > 0 ? ' (Productos)' : ''}`,
        organization_id: activeComanda.organization_id || localStorage.getItem('pos_active_org_id') || ''
      } as any);

      // 2. Si se pagaron items, actualizar su pagado_cantidad
      if (itemsPagados && itemsPagados.length > 0) {
        for (const item of itemsPagados) {
          const comandaItem = comandaItems.find(i => i.id === item.id);
          if (comandaItem) {
            await updateRxComandaItem(item.id, {
              pagado_cantidad: (comandaItem.pagado_cantidad || 0) + item.qtyToPay
            });
          }
        }
      }

      const descPayer = nameOfPayer?.trim() ? ` de ${nameOfPayer.trim()}` : '';
      sileo.success({ 
        title: 'Pago y Ticket', 
        description: `Cobro${descPayer} por $${monto.toFixed(2)} registrado e impreso.` 
      });

      // Generar y mostrar el ticket virtual pagado de la cuenta dividida
      const labelText = nameOfPayer?.trim() || label || 'Parte';
      
      const itemsMapeados = (itemsPagados || []).map(si => {
        const item = comandaItems.find(i => i.id === si.id);
        if (!item) return si;
        return {
          ...item,
          qtyToPay: si.qtyToPay || si.cantidad || 1
        };
      });

      const ticketText = generarPrecuentaDividida(
        activeComanda,
        itemsMapeados,
        selectedMesa.nombre,
        labelText,
        monto,
        ivaPorcentaje
      );
      setPreviewTicketText(ticketText);

      if (onSuccessCallback) {
        onSuccessCallback();
      }

      // Resetear estados
      setSelectedItems([]);
      setMontoCustom('');
      setCobrarModalState(null);

      // 3. Verificar si se completó el total
      const rxDb = await initVerticalRxDb();
      const pagosActualizados = await rxDb.pagos.find({
        selector: { comanda_id: activeComanda.id, _deleted: false }
      }).exec();
      const nuevoTotalPagado = pagosActualizados.reduce((acc, p) => acc + p.monto, 0);
      
      if (Math.abs(totalOriginal - nuevoTotalPagado) < 0.05 || nuevoTotalPagado >= totalOriginal) {
        await updateRxComanda(activeComanda.id, {
          estado: 'cerrado',
          mesa_nombre: activeComanda.mesa_nombre || selectedMesa.nombre,
          updated_at: new Date().toISOString()
        });
        await updateRxMesa(selectedMesa.id, { estado: 'libre' });
        sileo.success({ title: 'Cuenta Pagada', description: 'El saldo pendiente ha sido cubierto en su totalidad.' });
        onSuccess();
      }
    } catch (error) {
      console.error(error);
      sileo.error({ title: 'Error al registrar el pago' });
    }
  };

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
      {/* Header Fijo */}
      <Box p="lg" pb="md" style={{ borderBottom: '1px solid var(--pos-border)', backgroundColor: 'white' }}>
        <Group justify="space-between" mb="xs">
          <Group gap="sm">
            <ActionIcon variant="subtle" color="gray" onClick={splitMethod ? () => setSplitMethod(null) : onBack}>
              <ArrowLeft size={20} />
            </ActionIcon>
            <Stack gap={0}>
              <Title order={4} fw={900}>Dividir Cuenta</Title>
              <Text size="xs" c="dimmed">
                {selectedMesa.nombre.replace('Mesa ', 'Mesa #')} - Cuenta #{activeComanda?.folio} {activeComanda?.cliente ? `- ${activeComanda.cliente}` : ''}
              </Text>
            </Stack>
          </Group>
        </Group>
      </Box>

      {/* Contenido principal */}
      <ScrollArea flex={1} p="lg">
        {splitMethod && (
          <Box mb="md">
            <TextInput
              label="Nombre de quien paga (Opcional)"
              placeholder="Ej: Juan Pérez"
              value={payerName}
              onChange={(e) => setPayerName(e.currentTarget.value)}
              radius="md"
              size="sm"
              styles={{
                label: { fontWeight: 700, fontSize: '12.5px', color: '#475569', marginBottom: '4px' }
              }}
            />
          </Box>
        )}

        {!splitMethod ? (
          <Stack gap="md" pt="md">
            {/* Total a Dividir */}
            <Paper
              p="md"
              radius="lg"
              shadow="none"
              style={{
                background: 'var(--ui-primary-soft)',
                border: '1px solid var(--ui-border-strong)',
              }}
            >
              <Stack gap={2} align="center">
                <Text size="xs" fw={700} c="myColor.8" tt="uppercase" lts={1}>
                  Total a Dividir
                </Text>
                <Text size="32px" fw={900} c="myColor.9" style={{ lineHeight: 1.1 }}>
                  ${saldoPendiente.toFixed(2)}
                </Text>
                {totalPagado > 0 && (
                  <Text size="xs" c="dimmed" fw={500} mt={4}>
                    Pagado: ${totalPagado.toFixed(2)} / Total: ${totalOriginal.toFixed(2)}
                  </Text>
                )}
              </Stack>
            </Paper>

            <Box mt="xs">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" lts={0.5}>Métodos de división</Text>
            </Box>

            {/* Partes Iguales */}
            <Paper
              p="sm"
              radius="lg"
              withBorder
              shadow="none"
              className="tap"
              onClick={() => selectSplitMethod('iguales')}
              style={{
                borderColor: 'var(--pos-border)',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'all var(--ease-fast)',
              }}
            >
              <Group wrap="nowrap" align="center" gap="sm">
                <ThemeIcon size={38} radius="md" variant="light" color="myColor" style={{ flexShrink: 0 }}>
                  <Users size={20} weight="duotone" />
                </ThemeIcon>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text fw={800} size="sm">Partes iguales</Text>
                  <Text size="11px" c="dimmed" fw={500} style={{ lineHeight: 1.2 }}>
                    Divide el saldo entre N personas por igual.
                  </Text>
                </Stack>
                <ArrowRight size={16} weight="bold" color="var(--pos-text-muted)" style={{ opacity: 0.5 }} />
              </Group>
            </Paper>

            {/* Por Productos */}
            <Paper
              p="sm"
              radius="lg"
              withBorder
              shadow="none"
              className={hasNonProductPayments ? '' : 'tap'}
              onClick={hasNonProductPayments ? undefined : () => selectSplitMethod('productos')}
              style={{
                borderColor: 'var(--pos-border)',
                backgroundColor: hasNonProductPayments ? '#f8fafc' : 'white',
                opacity: hasNonProductPayments ? 0.6 : 1,
                cursor: hasNonProductPayments ? 'not-allowed' : 'pointer',
                transition: 'all var(--ease-fast)',
              }}
            >
              <Group wrap="nowrap" align="center" gap="sm">
                <ThemeIcon size={38} radius="md" variant="light" color="green" style={{ flexShrink: 0 }}>
                  <Receipt size={20} weight="duotone" />
                </ThemeIcon>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text fw={800} size="sm">Por productos</Text>
                  <Text size="11px" c="dimmed" fw={500} style={{ lineHeight: 1.2 }}>
                    {hasNonProductPayments 
                      ? 'No disponible (ya hay pagos globales).' 
                      : 'Elige los artículos que paga cada persona.'}
                  </Text>
                </Stack>
                <ArrowRight size={16} weight="bold" color="var(--pos-text-muted)" style={{ opacity: 0.5 }} />
              </Group>
            </Paper>

            {/* Monto Fijo */}
            <Paper
              p="sm"
              radius="lg"
              withBorder
              shadow="none"
              className="tap"
              onClick={() => selectSplitMethod('monto')}
              style={{
                borderColor: 'var(--pos-border)',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'all var(--ease-fast)',
              }}
            >
              <Group wrap="nowrap" align="center" gap="sm">
                <ThemeIcon size={38} radius="md" variant="light" color="violet" style={{ flexShrink: 0 }}>
                  <CurrencyCircleDollar size={20} weight="duotone" />
                </ThemeIcon>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text fw={800} size="sm">Monto fijo</Text>
                  <Text size="11px" c="dimmed" fw={500} style={{ lineHeight: 1.2 }}>
                    Registra un pago rápido por una cantidad específica.
                  </Text>
                </Stack>
                <ArrowRight size={16} weight="bold" color="var(--pos-text-muted)" style={{ opacity: 0.5 }} />
              </Group>
            </Paper>
          </Stack>
        ) : (
          <>
            {splitMethod === 'iguales' && (
              <Stack gap="xl">
                <Box>
                  <Text fw={700} mb="sm" ta="center">¿Entre cuántas personas?</Text>
                  <SimpleGrid cols={6} spacing="xs">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                      <Button
                        key={num}
                        variant={personas === num ? 'filled' : 'default'}
                        color="myColor"
                        radius="md"
                        size="md"
                        h={40}
                        p={0}
                        style={{ fontSize: '16px', fontWeight: 900 }}
                        onClick={() => {
                          setPersonas(num);
                          setSelectedPersonaIdx(null);
                          setPaidPersonaIndexes([]);
                        }}
                      >
                        {num}
                      </Button>
                    ))}
                  </SimpleGrid>
                </Box>

                <Divider variant="dashed" />

                <Stack gap="sm">
                  {Array.from({ length: personas }).map((_, idx) => {
                    const isPaid = paidPersonaIndexes.includes(idx);
                    const isSelected = selectedPersonaIdx === idx;
                    return (
                      <Paper
                        key={idx}
                        p="md"
                        radius="lg"
                        withBorder
                        bg={isSelected ? 'blue.0' : 'white'}
                        className={`split-persona-card${isSelected ? ' split-persona-card--selected' : ''}${isPaid ? ' split-persona-card--paid' : ''}`}
                        onClick={() => {
                          if (!isPaid) {
                            setSelectedPersonaIdx(isSelected ? null : idx);
                          }
                        }}
                      >
                        <Group gap="md">
                          <ThemeIcon
                            size={40}
                            radius="xl"
                            variant={isPaid ? 'filled' : isSelected ? 'filled' : 'light'}
                            color={isPaid ? 'green' : 'blue'}
                          >
                            {isPaid ? <Check size={20} weight="bold" /> : <Users size={20} weight="bold" />}
                          </ThemeIcon>
                          <Box>
                            <Text fw={700} c={isPaid ? 'green.8' : 'var(--pos-text)'}>
                              Persona {idx + 1}
                            </Text>
                            <Text size="sm" fw={800} c={isPaid ? 'green.9' : 'blue.9'}>
                              ${montoPorPersona.toFixed(2)}
                            </Text>
                          </Box>
                        </Group>
                        {isPaid ? (
                          <Badge color="green" variant="light" size="lg" radius="md">
                            Pagado
                          </Badge>
                        ) : isSelected ? (
                          <Badge color="myColor" variant="filled" size="lg" radius="md">
                            Seleccionado
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="light" size="lg" radius="md">
                            Pendiente
                          </Badge>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              </Stack>
            )}

            {splitMethod === 'monto' && (
              <Stack gap="xl">
                <Box>
                  <Paper p="sm" mb="sm" radius="md" withBorder shadow="none" style={{ backgroundColor: 'var(--mantine-color-myColor-0)' }}>
                    <Group justify="space-between">
                      <Text fw={700} size="xs" tt="uppercase" c="myColor.8">Total de la cuenta</Text>
                      <Text fw={900} size="lg" c="myColor.9">${saldoPendiente.toFixed(2)}</Text>
                    </Group>
                  </Paper>
                  <NumberInput
                    label="Monto a Pagar"
                    description="Ingresa el valor y registra el pago directo"
                    placeholder="0.00"
                    size="xl"
                    radius="md"
                    prefix="$"
                    decimalScale={2}
                    fixedDecimalScale
                    value={montoCustom}
                    onChange={(val) => setMontoCustom(val === '' ? '' : Number(val))}
                    max={saldoPendiente}
                    styles={{ input: { fontSize: '24px', fontWeight: 900, height: '60px' } }}
                  />
                </Box>
              </Stack>
            )}

            {splitMethod === 'productos' && (
              <Stack gap="xl">
                <Box>
                  <Text fw={700} mb="xs">Selecciona lo que deseas pagar ahora:</Text>
                  <Stack gap="xs">
                    {comandaItems.filter(item => (item.cantidad - (item.pagado_cantidad || 0)) > 0).map(item => {
                      const qtyPendiente = item.cantidad - (item.pagado_cantidad || 0);
                      const selectedQty = selectedItems.find(si => si.id === item.id)?.qtyToPay || 0;
                      const isFullySelected = selectedQty >= qtyPendiente;
                      
                      return (
                        <Paper key={item.id} p="sm" radius="md" withBorder shadow="none" bg="white" style={{ opacity: isFullySelected ? 0.6 : 1 }}>
                          <Group justify="space-between">
                            <Box>
                              <Text fw={600} size="sm">{item.nombre}</Text>
                              <Text size="xs" c="dimmed">Pendientes: {qtyPendiente} • ${item.precio.toFixed(2)} c/u</Text>
                            </Box>
                            
                            <Group gap="xs">
                              {selectedQty > 0 && (
                                <ActionIcon 
                                  variant="light" 
                                  color="red"
                                  onClick={() => {
                                    setSelectedItems(prev => {
                                      const existing = prev.find(si => si.id === item.id);
                                      if (existing && existing.qtyToPay > 1) {
                                        return prev.map(si => si.id === item.id ? { ...si, qtyToPay: si.qtyToPay - 1 } : si);
                                      }
                                      return prev.filter(si => si.id !== item.id);
                                    });
                                  }}
                                >
                                  -
                                </ActionIcon>
                              )}
                              <Text fw={700} w={20} ta="center">{selectedQty}</Text>
                              <ActionIcon 
                                variant="light" 
                                color="myColor"
                                disabled={isFullySelected}
                                onClick={() => {
                                  setSelectedItems(prev => {
                                    const existing = prev.find(si => si.id === item.id);
                                    if (existing) {
                                      return prev.map(si => si.id === item.id ? { ...si, qtyToPay: si.qtyToPay + 1 } : si);
                                    }
                                    return [...prev, { id: item.id, qtyToPay: 1 }];
                                  });
                                }}
                              >
                                +
                              </ActionIcon>
                            </Group>
                          </Group>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>
              </Stack>
            )}
          </>
        )}
      </ScrollArea>

      {/* Footer Fijo para Monto Fijo */}
      {splitMethod === 'monto' && (
        <Box p="lg" style={{ borderTop: '1px solid var(--pos-border)', backgroundColor: 'white' }}>
          <Stack gap="sm">
            <Group grow gap="sm">
              <Button
                size="lg"
                radius="md"
                color="orange"
                variant="light"
                leftSection={<Printer size={20} />}
                disabled={!montoCustom || Number(montoCustom) <= 0 || Number(montoCustom) > saldoPendiente}
                onClick={() => {
                  const montoVal = Number(montoCustom);
                  if (montoVal > 0) {
                    const label = payerName.trim() || "Pago Parcial";
                    const text = generarPrecuentaDividida(
                      activeComanda,
                      [],
                      selectedMesa.nombre,
                      label,
                      montoVal,
                      ivaPorcentaje
                    );
                    setPreviewTicketText(text);
                  }
                }}
              >
                Pre-cuenta
              </Button>
              <Button
                size="lg"
                radius="md"
                color="green"
                disabled={!montoCustom || Number(montoCustom) <= 0 || Number(montoCustom) > saldoPendiente}
                onClick={() => {
                  setCobrarModalState({
                    monto: Number(montoCustom),
                    label: 'Pago Parcial (Monto Fijo)'
                  });
                }}
              >
                Cobrar Monto
              </Button>
            </Group>
          </Stack>
        </Box>
      )}

      {/* Footer Fijo para Partes Iguales */}
      {splitMethod === 'iguales' && (
        <Box p="lg" style={{ borderTop: '1px solid var(--pos-border)', backgroundColor: 'white' }}>
          <Stack gap="sm">
            <Group grow gap="sm">
              <Button
                size="lg"
                radius="md"
                color="orange"
                variant="light"
                leftSection={<Printer size={20} />}
                disabled={selectedPersonaIdx === null}
                onClick={() => {
                  if (selectedPersonaIdx !== null) {
                    const label = payerName.trim() || `Persona ${selectedPersonaIdx + 1}`;
                    const text = generarPrecuentaDividida(
                      activeComanda,
                      [],
                      selectedMesa.nombre,
                      label,
                      montoPorPersona,
                      ivaPorcentaje
                    );
                    setPreviewTicketText(text);
                  }
                }}
              >
                Pre-cuenta
              </Button>
              <Button
                size="lg"
                radius="md"
                color="green"
                disabled={selectedPersonaIdx === null}
                onClick={() => {
                  if (selectedPersonaIdx !== null) {
                    const idx = selectedPersonaIdx;
                    setCobrarModalState({
                      monto: montoPorPersona,
                      label: `Persona ${idx + 1}`,
                      onSuccessCallback: () => {
                        setPaidPersonaIndexes(prev => [...prev, idx]);
                        setSelectedPersonaIdx(null);
                      }
                    });
                  }
                }}
              >
                Cobrar parte
              </Button>
            </Group>
          </Stack>
        </Box>
      )}

      {/* Footer Fijo para Selección por Productos */}
      {splitMethod === 'productos' && selectedItems.length > 0 && (
        <Box p="lg" style={{ borderTop: '1px solid var(--pos-border)', backgroundColor: 'white' }}>
          <Box p="md" style={{ borderRadius: '16px', border: '1px solid var(--pos-border)', backgroundColor: 'var(--ui-primary-soft)' }}>
            <Text fw={700} size="sm" mb="sm">Ticket Actual</Text>
            <Stack gap={4}>
              {selectedItems.map(si => {
                const item = comandaItems.find(i => i.id === si.id);
                if (!item) return null;
                return (
                  <Group key={si.id} justify="space-between">
                    <Text size="xs" fw={600}>{si.qtyToPay}x {item.nombre}</Text>
                    <Text size="xs" fw={700}>${(item.precio * si.qtyToPay).toFixed(2)}</Text>
                  </Group>
                );
              })}
              <Divider my={8} />
              <Group justify="space-between">
                <Text fw={800} size="sm">TOTAL A COBRAR</Text>
                <Text fw={900} size="lg" c="myColor">
                  ${totalesSeleccionados.total.toFixed(2)}
                </Text>
              </Group>
              <Group grow mt="sm" gap="sm">
                <Button 
                  size="lg" 
                  radius="md" 
                  color="orange" 
                  variant="light"
                  leftSection={<Printer size={20} />}
                  onClick={() => {
                    if (selectedItems.length > 0) {
                      const label = payerName.trim() || "Cuenta por Productos";
                      const itemsMapeados = selectedItems.map(si => {
                        const item = comandaItems.find(i => i.id === si.id);
                        return {
                          ...item,
                          qtyToPay: si.qtyToPay
                        };
                      });
                      const text = generarPrecuentaDividida(
                        activeComanda,
                        itemsMapeados,
                        selectedMesa.nombre,
                        label,
                        totalesSeleccionados.total,
                        ivaPorcentaje
                      );
                      setPreviewTicketText(text);
                    }
                  }}
                >
                  Pre-cuenta
                </Button>
                <Button 
                  size="lg" 
                  radius="md" 
                  color="green" 
                  onClick={() => {
                    setCobrarModalState({
                      monto: totalesSeleccionados.total,
                      label: 'Pago de Productos Seleccionados',
                      itemsPagados: selectedItems
                    });
                  }}
                >
                  Cobrar Lista
                </Button>
              </Group>
            </Stack>
          </Box>
        </Box>
      )}

      {/* Modal de Cobro Unificado e Impresión */}
      <Modal
        opened={cobrarModalState !== null}
        onClose={() => {
          setCobrarModalState(null);
        }}
        title={<Text fw={900} size="lg">Cobrar e Imprimir</Text>}
        centered
        radius="lg"
        padding="xl"
      >
        {cobrarModalState !== null && (
          <Stack gap="md">
            <Box p="md" style={{ borderRadius: '12px', border: '1px solid var(--pos-border)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">Monto a Cobrar ({cobrarModalState.label})</Text>
              <Text fw={900} size="28px" c="green.9" mt={4}>
                ${cobrarModalState.monto.toFixed(2)}
              </Text>
            </Box>

            <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
              Se registrará el pago en el sistema local y se imprimirá el comprobante correspondiente. La transacción financiera se procesa de forma externa.
            </Text>

            <Stack gap="sm" mt="md">
              <Button
                size="lg"
                color="green"
                leftSection={<Printer size={20} />}
                onClick={() => {
                  procesarPagoSimple(
                    cobrarModalState.monto,
                    cobrarModalState.itemsPagados,
                    cobrarModalState.label,
                    cobrarModalState.onSuccessCallback,
                    payerName
                  );
                }}
              >
                Cobrar e Imprimir
              </Button>
              <Button variant="light" color="gray" size="lg" onClick={() => {
                setCobrarModalState(null);
              }}>
                Cancelar
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      <TicketPreviewModal
        opened={previewTicketText !== null}
        onClose={() => setPreviewTicketText(null)}
        title="Previsualización de Ticket"
        content={previewTicketText || ''}
      />
    </Box>
  );
}
