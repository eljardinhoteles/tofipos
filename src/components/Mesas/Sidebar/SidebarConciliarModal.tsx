import { useState, useEffect } from 'react';
import { Modal, Stack, Text, ScrollArea, Paper, Group, Badge, TextInput, Textarea, Button } from '@mantine/core';
import { sileo } from 'sileo';
import { initVerticalRxDb, updateRxComanda, updateRxPago } from '../../../db/rxdb';

interface SidebarConciliarModalProps {
  opened: boolean;
  onClose: () => void;
  activeComanda: any;
  onSuccess: () => void;
}

export function SidebarConciliarModal({ opened, onClose, activeComanda, onSuccess }: SidebarConciliarModalProps) {
  const [sidebarInvoiceNro, setSidebarInvoiceNro] = useState('');
  const [sidebarInvoiceNota, setSidebarInvoiceNota] = useState('');
  const [sidebarPagosParaConciliar, setSidebarPagosParaConciliar] = useState<{ id: string, monto: number, metodo_pago: string, tipo_division?: string, factura_nro: string, factura_nota: string }[]>([]);

  useEffect(() => {
    let alive = true;
    if (opened && activeComanda) {
      initVerticalRxDb().then(async (rxDb) => {
        const pagos = await rxDb.pagos.find({ selector: { comanda_id: activeComanda.id } }).exec();
        if (!alive) return;
        setSidebarPagosParaConciliar(pagos.map((p: any) => p.toJSON()));
      });
    } else {
      setSidebarPagosParaConciliar([]);
    }
    return () => {
      alive = false;
    };
  }, [opened, activeComanda]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={900} size="lg">Conciliar Orden con Factura</Text>}
      centered
      radius="lg"
      size={sidebarPagosParaConciliar.length > 1 ? "lg" : "md"}
      padding="xl"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {sidebarPagosParaConciliar.length > 0 
            ? "Esta comanda cuenta con los siguientes pagos registrados. Asigna la factura correspondiente a cada pago para completar la conciliación."
            : "Ingresa los datos de la factura emitida en el sistema contable externo para conciliar esta orden."
          }
        </Text>

        {sidebarPagosParaConciliar.length > 0 ? (
          <ScrollArea.Autosize mah={400} type="hover">
            <Stack gap="md">
              {sidebarPagosParaConciliar.map((pago, index) => (
                <Paper key={pago.id} withBorder p="md" radius="md" style={{ borderColor: 'var(--pos-border)' }}>
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text fw={800} size="sm">
                        {pago.tipo_division 
                          ? pago.tipo_division.replace('Directo - ', '').replace('Dividido - ', '') 
                          : `Pago #${index + 1}`}
                      </Text>
                      <Badge color="green" variant="light" size="md" fw={700}>
                        ${pago.monto.toFixed(2)} ({pago.metodo_pago})
                      </Badge>
                    </Group>
                    <Group grow gap="sm">
                      <TextInput
                        label="Número de Factura"
                        placeholder="Ej: 001-002-00000123"
                        radius="md"
                        value={pago.factura_nro || ''}
                        onChange={(e) => {
                          const val = e.currentTarget.value;
                          setSidebarPagosParaConciliar(prev => prev.map(item => item.id === pago.id ? { ...item, factura_nro: val } : item));
                        }}
                      />
                      <TextInput
                        label="Notas de Conciliación"
                        placeholder="Observaciones de este pago..."
                        radius="md"
                        value={pago.factura_nota || ''}
                        onChange={(e) => {
                          const val = e.currentTarget.value;
                          setSidebarPagosParaConciliar(prev => prev.map(item => item.id === pago.id ? { ...item, factura_nota: val } : item));
                        }}
                      />
                    </Group>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        ) : (
          <>
            <TextInput
              label="Número de Factura"
              placeholder="Ej: 001-002-00000123"
              radius="md"
              size="md"
              value={sidebarInvoiceNro}
              onChange={(e) => setSidebarInvoiceNro(e.currentTarget.value)}
            />

            <Textarea
              label="Notas de Conciliación"
              placeholder="Observaciones de la conciliación contable..."
              radius="md"
              size="md"
              minRows={3}
              value={sidebarInvoiceNota}
              onChange={(e) => setSidebarInvoiceNota(e.currentTarget.value)}
            />
          </>
        )}

        <Group grow gap="sm" mt="md">
          <Button variant="light" color="gray" size="lg" radius="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            color="myColor"
            size="lg"
            radius="md"
            disabled={
              sidebarPagosParaConciliar.length > 0 
                ? sidebarPagosParaConciliar.some(p => !p.factura_nro)
                : !sidebarInvoiceNro
            }
            onClick={async () => {
                if (activeComanda) {
                  if (sidebarPagosParaConciliar.length > 0) {
                    for (const pago of sidebarPagosParaConciliar) {
                      await updateRxPago(pago.id, {
                        factura_nro: pago.factura_nro,
                        factura_nota: pago.factura_nota
                      });
                    }

                  const allNros = sidebarPagosParaConciliar.map(p => p.factura_nro).filter(Boolean);
                  const allNotas = sidebarPagosParaConciliar.map(p => p.factura_nota).filter(Boolean);

                  await updateRxComanda(activeComanda.id, {
                    estado: 'facturado',
                    factura_nro: allNros.join(', '),
                    factura_nota: allNotas.join(' | ')
                  });
                } else {
                  await updateRxComanda(activeComanda.id, {
                    estado: 'facturado',
                    factura_nro: sidebarInvoiceNro,
                    factura_nota: sidebarInvoiceNota
                  });
                }

                sileo.success({
                  title: 'Orden Conciliada',
                  description: `Comanda #${activeComanda.folio} conciliada con éxito.`
                });
                onClose();
                onSuccess(); // Cerrar el sidebar de la mesa
              }
            }}
          >
            Confirmar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
