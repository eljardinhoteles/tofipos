import { useState, useMemo, useEffect } from 'react'
import { Box, Stack, Group, Text, Button, ActionIcon, ScrollArea, Paper, Badge, Divider, TextInput } from '@mantine/core'
import { XIcon, Printer } from '@phosphor-icons/react'
import { type Mesa, type HabitacionCuenta } from '../../../../db/database'
import { sileo } from 'sileo'
import { ComandaItemRow } from '../ComandaItemRow'
import { useIvaActivo } from '../../../../hooks/useIvaActivo'
import { calcularTotalesComanda } from '../../../../lib/taxUtils'
import { useRxMenuCatalog } from '../../../../hooks/useRxMenuCatalog'
import { initVerticalRxDb, createRxPago, updateRxComanda, updateRxHabitacionCuenta, updateRxMesa } from '../../../../db/rxdb'
import { generarPrecuenta } from '../../../../services/printTemplateEngine'
import { TicketPreviewModal } from '../../../Common/TicketPreviewModal'

export function HabitacionCheckoutView({
  cuenta,
  selectedMesa,
  onBack,
  onSuccess,
}: {
  cuenta: HabitacionCuenta
  selectedMesa: Mesa
  checkoutData?: any
  onBack: () => void
  onSuccess: () => void
}) {
  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo()
  const { menuItems } = useRxMenuCatalog()
  const [isProcessing, setIsProcessing] = useState(false)
  const [payerName, setPayerName] = useState('')
  const [manuallyToggled, setManuallyToggled] = useState<Record<string, boolean>>({})
  const [previewTicketText, setPreviewTicketText] = useState<string | null>(null)

  const [comandas, setComandas] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const paidComandaIds = useMemo(() => new Set(pagos.map(p => p.comanda_id)), [pagos])
  const unpaidComandas = useMemo(() => comandas.filter(c => c.estado !== 'cerrado' && !paidComandaIds.has(c.id)), [comandas, paidComandaIds])
  const selectedComandaIds = useMemo(() => unpaidComandas.filter(c => manuallyToggled[c.id] !== false).map(c => c.id), [unpaidComandas, manuallyToggled])

  useEffect(() => {
    if (cuenta?.huesped && !payerName) setPayerName(cuenta.huesped)
  }, [cuenta, payerName])

  const [allRichItems, setAllRichItems] = useState<any[]>([])
  useEffect(() => {
    let alive = true
    let subs: Array<{ unsubscribe: () => void }> = []
    ;(async () => {
      const rxDb = await initVerticalRxDb()
      const orgId = localStorage.getItem('pos_active_org_id') || ''
      const comQuery = rxDb.comandas.find({ selector: { habitacion_cuenta_id: cuenta.id, _deleted: { $ne: true } } })
      const payQuery = rxDb.pagos.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } })
      subs.push(
        comQuery.$.subscribe((docs: any[]) => {
          if (!alive) return
          setComandas(docs.map((d: any) => d.toJSON()))
        }),
        payQuery.$.subscribe((docs: any[]) => {
          if (!alive) return
          setPagos(docs.map((d: any) => d.toJSON()))
        })
      )
    })().catch(() => {})
    return () => {
      alive = false
      subs.forEach(s => s.unsubscribe())
    }
  }, [cuenta.id])

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (comandas.length === 0) { setAllRichItems([]); return }
      const rxDb = await initVerticalRxDb()
      if (!alive) return
      const ids = comandas.map(c => c.id)
      const itemsDocs = await rxDb.comanda_items.find({ selector: { comanda_id: { $in: ids }, _deleted: { $ne: true } } }).exec()
      const items = itemsDocs.map((d: any) => d.toJSON())
      const menuItemsLocal = menuItems.filter((m: any) => items.some((i: any) => i.item_id === m.id))
      const categoriaIds = [...new Set(menuItemsLocal.map((m: any) => m.categoria_id))]
      const categorias = categoriaIds.map((id: string) => ({ id, es_comida_incluida: false }))
      const catMap = new Map(categorias.map((c: any): [string, any] => [c.id, c]))
      const menuMap = new Map(menuItemsLocal.map((m: any): [string, any] => [m.id, m]))
      setAllRichItems(items.map((item: any) => {
        const menuItem = menuMap.get(item.item_id)
        const categoria = menuItem ? catMap.get(menuItem.categoria_id) : undefined
        return { ...item, es_incluido: categoria?.es_comida_incluida === true }
      }))
    })().catch(() => {})
    return () => { alive = false }
  }, [comandas, menuItems])

  const itemsByComanda = (comandaId: string) => allRichItems.filter(i => i.comanda_id === comandaId)
  const selectedItems = useMemo(() => allRichItems.filter(item => selectedComandaIds.includes(item.comanda_id)), [allRichItems, selectedComandaIds])
  const extras = useMemo(() => selectedItems.filter(i => !i.es_incluido), [selectedItems])
  const incluidos = useMemo(() => selectedItems.filter(i => i.es_incluido), [selectedItems])
  const totalesCheckout = useMemo(() => calcularTotalesComanda(extras, menuItems, ivaPorcentaje, preciosConIva), [extras, menuItems, ivaPorcentaje, preciosConIva])
  const subtotal = totalesCheckout.subtotalNeto
  const iva = totalesCheckout.ivaTotal
  const total = totalesCheckout.total

  const handleFinalizar = async () => {
    if (selectedComandaIds.length === 0) {
      sileo.error({ title: 'Selecciona al menos una comanda' })
      return
    }
    setIsProcessing(true)
    try {
      const now = new Date().toISOString()
      for (const comandaId of selectedComandaIds) {
        const comanda = unpaidComandas.find(c => c.id === comandaId)
        if (!comanda) continue

        const comandaItems = itemsByComanda(comandaId)
        const comandaExtras = comandaItems.filter(i => !i.es_incluido)
        const comandaTotales = calcularTotalesComanda(comandaExtras, menuItems, ivaPorcentaje, preciosConIva)
        const comandaTotal = comandaTotales.total

        await createRxPago({
          id: crypto.randomUUID(),
          comanda_id: comandaId,
          monto: comandaTotal,
          metodo_pago: 'efectivo',
          fecha: now,
          tipo_division: payerName ? `Checkout - ${payerName}` : 'Checkout',
          organization_id: localStorage.getItem('pos_active_org_id') || ''
        })

        await updateRxComanda(comandaId, {
          estado: 'cerrado',
          mesa_nombre: comanda.mesa_nombre || selectedMesa.nombre,
          total: comandaTotal,
        })
      }

      const rxDb = await initVerticalRxDb()
      const allComandas = await rxDb.comandas.find({ selector: { habitacion_cuenta_id: cuenta.id, _deleted: { $ne: true } } }).exec()
      const allPagos = await rxDb.pagos.find({ selector: { organization_id: localStorage.getItem('pos_active_org_id') || '', _deleted: { $ne: true } } }).exec()
      const paidIds = new Set(allPagos.map(p => p.comanda_id))
      const anyActiveRemaining = allComandas.some(c => !paidIds.has(c.id) && !selectedComandaIds.includes(c.id))

      if (!anyActiveRemaining) {
        await updateRxHabitacionCuenta(cuenta.id, {
          estado: 'cerrada',
          check_out: now.split('T')[0],
        })

        await updateRxMesa(selectedMesa.id, { estado: 'libre' })

        sileo.success({
          title: 'Checkout completado',
          description: `Se cerraron todas las comandas y se liberó la habitación ${selectedMesa.nombre}.`
        })
      } else {
        sileo.success({
          title: 'Comandas cobradas',
          description: `Se cobraron ${selectedComandaIds.length} comandas seleccionadas. La habitación sigue ocupada con consumos pendientes.`
        })
      }

      onSuccess()
    } catch (error) {
      console.error(error)
      sileo.error({ title: 'Error al procesar checkout' })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Box h="100%" className="hab-sidebar">
      <Box p="lg" className="hab-sidebar__header">
        <Group gap="sm">
          <ActionIcon variant="subtle" color="gray" onClick={onBack}>
            <XIcon size={20} />
          </ActionIcon>
          <Stack gap={0}>
            <Text fw={900} size="lg">Checkout — {selectedMesa.nombre}</Text>
            <Text size="xs" c="dimmed">{cuenta.huesped}</Text>
          </Stack>
        </Group>
      </Box>

      <ScrollArea flex={1} p="lg">
        <Stack gap="lg">
          <TextInput
            label="Nombre de quien paga"
            placeholder="Ej: Juan Pérez"
            value={payerName}
            onChange={(e) => setPayerName(e.currentTarget.value)}
            radius="md"
            size="md"
          />

          <Box>
            <Text fw={800} size="xs" mb="sm" c="dimmed" tt="uppercase" className="hab-sidebar__section-label">
              Selecciona las comandas a pagar
            </Text>
            <Stack gap="xs">
              {comandas.map((c) => {
                const isPaid = c.estado === 'cerrado' || paidComandaIds.has(c.id)
                const isSelected = selectedComandaIds.includes(c.id)
                const items = itemsByComanda(c.id)
                const itemsComanda = items.filter(i => !i.es_incluido)
                const totalesComanda = calcularTotalesComanda(itemsComanda, menuItems, ivaPorcentaje, preciosConIva)
                const totalComanda = totalesComanda.total
                const hora = new Date(c.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
                const fecha = new Date(c.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })

                return (
                  <Paper
                    key={c.id}
                    p="md"
                    radius="md"
                    withBorder
                    className={`hab-checkout-card${isPaid ? ' hab-checkout-card--paid' : ''}${isSelected ? ' hab-checkout-card--selected' : ''}`}
                    onClick={() => {
                      if (isPaid) return
                      const active = !isSelected
                      setManuallyToggled(prev => ({
                        ...prev,
                        [c.id]: active
                      }))
                    }}
                  >
                    <Group justify="space-between" align="center">
                      <Group gap="sm">
                        <ActionIcon
                          size={32}
                          radius="md"
                          color={isPaid ? 'green' : isSelected ? 'myColor' : 'gray'}
                          variant={isPaid || isSelected ? 'filled' : 'light'}
                          title="Imprimir Precuenta"
                          onClick={(e) => {
                            e.stopPropagation();
                            const content = generarPrecuenta(
                              c,
                              itemsByComanda(c.id),
                              selectedMesa.nombre,
                              ivaPorcentaje
                            );
                            setPreviewTicketText(content);
                          }}
                        >
                          <Printer size={16} />
                        </ActionIcon>
                        <Stack gap={0}>
                          <Group gap="xs" align="center">
                            <Text size="sm" fw={800}>Comanda #{c.folio}</Text>
                            {isPaid && <Badge size="xs" color="green" variant="light">Pagado</Badge>}
                          </Group>
                          <Text size="xs" c="dimmed">{fecha} · {hora}</Text>
                        </Stack>
                      </Group>
                      <Text size="sm" fw={900} c={isPaid ? 'green.8' : isSelected ? 'var(--ui-primary)' : 'dimmed'}>
                        ${totalComanda.toFixed(2)}
                      </Text>
                    </Group>
                  </Paper>
                )
              })}
            </Stack>
          </Box>

          {incluidos.length > 0 && (
            <Box>
              <Text fw={700} size="xs" mb="sm" tt="uppercase" className="hab-sidebar__section-label" c="green.7">
                Incluido en plan ({incluidos.length} ítems)
              </Text>
              <Paper p="sm" radius="md" withBorder shadow="none" className="hab-checkout-card__included">
                {incluidos.map((item, i) => (
                  <ComandaItemRow key={item.id} item={{ ...item, precio: 0 }} index={i} total={incluidos.length} />
                ))}
              </Paper>
            </Box>
          )}

          {extras.length > 0 && (
            <Box>
              <Text fw={700} size="xs" mb="sm" tt="uppercase" className="hab-sidebar__section-label">
                Extras de la selección
              </Text>
              <Paper p="sm" radius="md" withBorder shadow="none">
                {extras.map((item, i) => (
                  <ComandaItemRow key={item.id} item={item} index={i} total={extras.length} />
                ))}
              </Paper>
            </Box>
          )}

          <Box p="md" className="hab-checkout-summary">
            <Stack gap={4}>
              <Group justify="space-between"><Text size="xs" c="dimmed" fw={600}>Subtotal extras</Text><Text size="xs" fw={700}>${subtotal.toFixed(2)}</Text></Group>
              <Group justify="space-between"><Text size="xs" c="dimmed" fw={600}>IVA {ivaPorcentaje}%</Text><Text size="xs" fw={700}>${iva.toFixed(2)}</Text></Group>
              <Divider my={4} />
              <Group justify="space-between">
                <Text fw={800} size="sm">TOTAL DE SELECCIÓN</Text>
                <Text fw={900} size="lg" c="myColor">${total.toFixed(2)}</Text>
              </Group>
            </Stack>
          </Box>
        </Stack>
      </ScrollArea>

      <Box p="lg" className="hab-sidebar__footer">
        <Button
          size="xl"
          radius="md"
          fullWidth
          color="green"
          loading={isProcessing}
          onClick={handleFinalizar}
          disabled={selectedComandaIds.length === 0}
          h={70}
          className="hab-checkout-summary__button"
        >
          Cobrar Selección ({selectedComandaIds.length})
        </Button>
      </Box>

      <TicketPreviewModal
        opened={previewTicketText !== null}
        onClose={() => setPreviewTicketText(null)}
        title="Precuenta de Habitación"
        content={previewTicketText || ''}
      />
    </Box>
  )
}
