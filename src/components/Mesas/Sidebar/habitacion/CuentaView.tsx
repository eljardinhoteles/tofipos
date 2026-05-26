import { useState, useMemo } from 'react'
import { Box, Stack, Group, Text, Button, ActionIcon, ScrollArea, Paper, Center, Badge, ThemeIcon } from '@mantine/core'
import { XIcon, CreditCardIcon, CalendarIcon, UserIcon, ReceiptIcon, PlusIcon, MinusIcon, TrashIcon, FloppyDiskIcon, Printer } from '@phosphor-icons/react'
import { type Mesa, type HabitacionCuenta } from '../../../../db/database'
import { sileo } from 'sileo'
import { useUI } from '../../../../context/UIContext'
import { useIvaActivo } from '../../../../hooks/useIvaActivo'
import { calcularTotalesComanda } from '../../../../lib/taxUtils'
import { useRxMenuCatalog } from '../../../../hooks/useRxMenuCatalog'
import { initVerticalRxDb, updateRxComanda, updateRxHabitacionCuenta } from '../../../../db/rxdb'
import { useEffect } from 'react'
import { generarPrecuenta } from '../../../../services/printTemplateEngine'
import { TicketPreviewModal } from '../../../Common/TicketPreviewModal'

export function CuentaView({
  cuenta,
  selectedMesa,
  onClose,
  onCheckout,
}: {
  cuenta: HabitacionCuenta
  selectedMesa: Mesa
  onClose: () => void
  onCheckout: (data: any) => void
}) {
  const { openConfirm, openPrompt } = useUI()
  const roomType = selectedMesa.nombre.match(/\(([^)]+)\)/)?.[1] || selectedMesa.piso || 'Sin tipo'
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingComandaId, setEditingComandaId] = useState<string | null>(null)
  const [localCantidades, setLocalCantidades] = useState<Record<string, number>>({})
  const [previewTicketText, setPreviewTicketText] = useState<string | null>(null)

  const startEditing = (comandaId: string, items: any[]) => {
    const cantidades: Record<string, number> = {}
    items.forEach(i => { cantidades[i.id] = i.cantidad })
    setLocalCantidades(cantidades)
    setEditingComandaId(comandaId)
  }

  const handleSaveEdits = async (items: any[]) => {
    const rxDb = await initVerticalRxDb()
    for (const item of items) {
      const nuevaCantidad = localCantidades[item.id]
      if (nuevaCantidad === undefined) continue
      if (nuevaCantidad <= 0) {
        const doc = await rxDb.comanda_items.findOne(item.id).exec()
        if (doc) await doc.remove()
      } else if (nuevaCantidad !== item.cantidad) {
        const now = new Date().toISOString()
        const doc = await rxDb.comanda_items.findOne(item.id).exec()
        if (doc) {
          await doc.update({
            $set: {
              cantidad: nuevaCantidad,
              _modified: now,
              updated_at: now
            }
          } as any)
        }
      }
    }
    setEditingComandaId(null)
    setLocalCantidades({})
    sileo.success({ title: 'Comanda actualizada' })
  }

  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo()
  const { menuItems } = useRxMenuCatalog()
  const [comandas, setComandas] = useState<any[]>([])
  const [allRichItems, setAllRichItems] = useState<any[]>([])
  useMemo(() => {
    let alive = true
    let subs: Array<{ unsubscribe: () => void }> = []
    ;(async () => {
      const rxDb = await initVerticalRxDb()
      const query = rxDb.comandas.find({ selector: { habitacion_cuenta_id: cuenta.id, _deleted: { $ne: true } }, sort: [{ created_at: 'desc' }] })
      subs.push(query.$.subscribe(async (docs: any[]) => {
        if (!alive) return
        const list = docs.map((d: any) => d.toJSON())
        setComandas(list)
        const ids = list.map((c: any) => c.id)
        if (ids.length === 0) { setAllRichItems([]); return }
        const items = await rxDb.comanda_items.find({ selector: { comanda_id: { $in: ids }, _deleted: { $ne: true } } }).exec()
        const rawItems = items.map((d: any) => d.toJSON())
        const menuItemsBulk = menuItems.filter((m: any) => rawItems.some((i: any) => i.item_id === m.id))
        const categorias = menuItemsBulk.length > 0 ? menuItemsBulk.map((m: any) => ({ id: m.categoria_id, es_comida_incluida: false })) : []
        const catMap = new Map(categorias.map((c: any): [string, any] => [c.id, c]))
        const menuMap = new Map(menuItemsBulk.map((m: any): [string, any] => [m.id, m]))
        setAllRichItems(rawItems.map((item: any) => {
          const menuItem = menuMap.get(item.item_id)
          const categoria = menuItem ? catMap.get(menuItem.categoria_id) : undefined
          return { ...item, es_incluido: categoria?.es_comida_incluida === true }
        }))
      }))
    })().catch(() => {})
    return () => {
      alive = false
      subs.forEach(s => s.unsubscribe())
    }
  }, [cuenta.id, menuItems])

  const itemsByComanda = (comandaId: string) => allRichItems.filter(i => i.comanda_id === comandaId)
  const [pagos, setPagos] = useState<any[]>([])

  useEffect(() => {
    let alive = true
    let sub: { unsubscribe: () => void } | null = null
    ;(async () => {
      const rxDb = await initVerticalRxDb()
      const orgId = localStorage.getItem('pos_active_org_id') || ''
      sub = rxDb.pagos.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
        if (!alive) return
        setPagos(docs.map((d: any) => d.toJSON()))
      })
    })().catch(() => {})
    return () => {
      alive = false
      sub?.unsubscribe()
    }
  }, [])

  const paidComandaIds = useMemo(() => new Set(pagos.map(p => p.comanda_id)), [pagos])
  const unpaidRichItems = useMemo(() => allRichItems.filter(item => !paidComandaIds.has(item.comanda_id)), [allRichItems, paidComandaIds])
  const allExtras = unpaidRichItems.filter(i => !i.es_incluido)
  const allIncluidos = unpaidRichItems.filter(i => i.es_incluido)
  const totalesExtras = useMemo(() => calcularTotalesComanda(allExtras, menuItems, ivaPorcentaje, preciosConIva), [allExtras, menuItems, ivaPorcentaje, preciosConIva])
  const totalConIva = totalesExtras.total

  const handleSolicitarCheckout = () => {
    const unpaidExtras = allRichItems.filter(i => !i.es_incluido && !paidComandaIds.has(i.comanda_id))
    if (unpaidExtras.length === 0 && allRichItems.filter(i => i.es_incluido && !paidComandaIds.has(i.comanda_id)).length === 0) {
      sileo.error({ title: 'Sin consumos pendientes', description: 'No hay ítems pendientes en la cuenta.' })
      return
    }
    onCheckout({ extras: allExtras, incluidos: allIncluidos })
  }

  const handleAnularCuenta = () => {
    openConfirm(
      'Anular cuenta',
      'Esto anulará la cuenta de habitación actual y liberará la mesa. ¿Deseas continuar?',
      async () => {
        openPrompt({
          title: 'Motivo de anulación',
          label: 'Escriba el motivo',
          placeholder: 'Ej: cliente se retiró, error en consumo, etc.',
          defaultValue: 'Cuenta de habitación anulada',
          onConfirm: async (motivo) => {
            try {
              const now = new Date().toISOString()
              for (const comanda of comandas) {
                await updateRxComanda(comanda.id, {
                  estado: 'anulada',
                  confirmada: true,
                  motivo_anulacion: motivo,
                })
              }
              await updateRxHabitacionCuenta(cuenta.id, {
                estado: 'cerrada',
                check_out: now.split('T')[0],
              })
              sileo.success({ title: 'Cuenta anulada' })
              onClose()
            } catch {
              sileo.error({ title: 'Error al anular cuenta' })
            }
          }
        })
      }
    )
  }

  return (
    <Box h="100%" className="hab-sidebar">
      <Box p="lg" className="hab-sidebar__header">
        <Group justify="space-between">
          <Group gap="md">
            <Box className="hab-sidebar__icon hab-sidebar__icon--active">
              <Text fw={900} size="xl" c="white">
                {selectedMesa.nombre.replace(/\D/g, '') || selectedMesa.nombre}
              </Text>
            </Box>
            <Stack gap={0}>
              <Text fw={800} size="md" c="var(--pos-text)" className="hab-sidebar__title">
                {roomType}
              </Text>
              <Group gap={8} mt={4}>
                <Group gap={4}>
                  <UserIcon size={14} color="var(--ui-primary)" weight="bold" />
                  <Text size="xs" fw={800} c="var(--ui-primary)">{cuenta.huesped}</Text>
                </Group>
                <Box className="hab-sidebar__meta-separator" />
                <Group gap={4}>
                  <CalendarIcon size={14} color="var(--pos-text-muted)" />
                  <Text size="xs" fw={700} c="dimmed">
                    {new Date(cuenta.check_in).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                    {cuenta.check_out && ` — ${new Date(cuenta.check_out).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`}
                  </Text>
                </Group>
              </Group>
            </Stack>
          </Group>
          <ActionIcon variant="light" color="gray" onClick={onClose} size="lg" radius="xl" className="hab-sidebar__close-button">
            <XIcon size={18} />
          </ActionIcon>
        </Group>
      </Box>

      <ScrollArea flex={1} p="lg">
        {comandas.length === 0 ? (
          <Center py={48}>
            <Stack align="center" gap="md">
              <ThemeIcon size={64} radius="xl" variant="light" color="myColor">
                <ReceiptIcon size={28} />
              </ThemeIcon>
              <Stack align="center" gap={4}>
                <Text fw={700}>Sin consumos aún</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Envía comandas a esta habitación para acumular los cargos.
                </Text>
              </Stack>
            </Stack>
          </Center>
        ) : (
          <Stack gap="xs">
            {comandas.map(c => {
              const items = itemsByComanda(c.id)
              const extras = items.filter(i => !i.es_incluido)
              const incluidos = items.filter(i => i.es_incluido)
              const total = extras.reduce((acc, i) => acc + i.precio * i.cantidad, 0)
              const isOpen = expandedId === c.id
              const hora = new Date(c.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
              const fecha = new Date(c.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })
              const isPaid = c.estado === 'cerrado' || paidComandaIds.has(c.id)

              return (
                <Paper
                  key={c.id}
                  radius="md"
                  withBorder
                  className={isPaid ? 'hab-comanda-card hab-comanda-card--paid' : 'hab-comanda-card'}
                  onClick={() => setExpandedId(isOpen ? null : c.id)}
                >
                  <Group p="sm" justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      <ActionIcon
                        size={32}
                        radius="md"
                        variant={isPaid ? 'filled' : 'light'}
                        color={isPaid ? 'green' : 'myColor'}
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
                          <Text size="sm" fw={700}>Comanda #{c.folio}</Text>
                          {isPaid && <Badge size="xs" color="green" variant="light">Pagado</Badge>}
                        </Group>
                        <Text size="xs" c="dimmed">{fecha} · {hora}</Text>
                      </Stack>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      {!isPaid && incluidos.length > 0 && <Badge size="xs" color="green" variant="light">+{incluidos.length} inc.</Badge>}
                      <Text size="sm" fw={800} c={isPaid ? 'green.8' : total > 0 ? 'var(--ui-primary)' : 'dimmed'}>
                        {isPaid ? `$${total.toFixed(2)}` : total > 0 ? `$${total.toFixed(2)}` : 'Incluido'}
                      </Text>
                    </Group>
                  </Group>

                  {isOpen && (
                    <Box px="sm" pb="sm" className="hab-comanda-card__details" onClick={e => e.stopPropagation()}>
                      <Stack gap={4} pt="sm">
                        {[...incluidos, ...extras].map(item => {
                          const isEditing = editingComandaId === c.id
                          const cantidad = isEditing ? (localCantidades[item.id] ?? item.cantidad) : item.cantidad
                          return (
                            <Group key={item.id} justify="space-between" wrap="nowrap">
                              <Text size="sm" className="hab-comanda-card__item-name" lineClamp={1}>{item.nombre ?? item.item_id}</Text>
                              {isEditing ? (
                                <Group gap={4} wrap="nowrap">
                                  <ActionIcon size="sm" variant="subtle" color="red"
                                    onClick={() => setLocalCantidades(p => ({ ...p, [item.id]: Math.max(0, (p[item.id] ?? item.cantidad) - 1) }))}>
                                    <MinusIcon size={12} />
                                  </ActionIcon>
                                  <Text size="sm" fw={700} w={20} ta="center">{cantidad}</Text>
                                  <ActionIcon size="sm" variant="subtle" color="myColor"
                                    onClick={() => setLocalCantidades(p => ({ ...p, [item.id]: (p[item.id] ?? item.cantidad) + 1 }))}>
                                    <PlusIcon size={12} />
                                  </ActionIcon>
                                  <ActionIcon size="sm" variant="subtle" color="red"
                                    onClick={() => setLocalCantidades(p => ({ ...p, [item.id]: 0 }))}>
                                    <TrashIcon size={12} />
                                  </ActionIcon>
                                </Group>
                              ) : (
                                <Text size="sm" c="dimmed">×{cantidad}</Text>
                              )}
                              {!item.es_incluido && (
                                <Text size="sm" fw={700} w={60} ta="right">${(item.precio * cantidad).toFixed(2)}</Text>
                              )}
                            </Group>
                          )
                        })}
                      </Stack>
                      {!isPaid && (
                        <Box pt="sm">
                          {editingComandaId === c.id ? (
                            <Group grow gap="xs">
                              <Button size="xs" variant="subtle" color="gray" onClick={() => setEditingComandaId(null)}>Cancelar</Button>
                              <Button size="xs" color="myColor" leftSection={<FloppyDiskIcon size={14} />}
                                onClick={() => handleSaveEdits([...incluidos, ...extras])}>
                                Guardar
                              </Button>
                            </Group>
                          ) : (
                            <Button size="xs" variant="subtle" color="myColor" fullWidth
                              onClick={() => startEditing(c.id, [...incluidos, ...extras])}>
                              Editar
                            </Button>
                          )}
                        </Box>
                      )}
                    </Box>
                  )}
                </Paper>
              )
            })}
          </Stack>
        )}
      </ScrollArea>

      <Box p="lg" className="hab-sidebar__footer">
        <Stack gap="sm">
          <Group justify="space-between" px="xs">
            <Text size="md" fw={800} tt="uppercase">Total de Consumos</Text>
            <Text size="xl" fw={900} c="var(--ui-primary)">${totalConIva.toFixed(2)}</Text>
          </Group>
          <Group grow gap="sm">
            <Button color="green" size="lg" radius="md" leftSection={<CreditCardIcon size={18} weight="bold" />} onClick={handleSolicitarCheckout} fw={900}>
              Checkout
            </Button>
            <Button variant="light" color="red" size="lg" radius="md" onClick={handleAnularCuenta}>
              Anular
            </Button>
          </Group>
        </Stack>
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
