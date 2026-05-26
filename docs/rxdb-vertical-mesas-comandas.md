# RxDB Vertical 1: Mesas, Comandas y Comanda Items

Objetivo: preparar la primera migración a RxDB sin romper la UI actual.

## Principios

- `mesas`, `comandas` y `comanda_items` deben poder leerse localmente sin red.
- Supabase sigue siendo la fuente remota canónica.
- La UI debe seguir funcionando con el mismo contrato de negocio.
- El modelo local debe conservar la mayor parte de los nombres actuales para reducir cambios.

## Colección: `mesas`

### Campos

- `id: string`  
- `nombre: string`
- `estado: 'libre' | 'ocupada' | 'cuenta'`
- `piso: string`
- `capacidad?: number`
- `updated_at: string`
- `organization_id: string`

### Campos derivados o de sync

- `_deleted?: boolean`
- `_modified?: string`

### Índices recomendados

- `id`
- `piso`
- `estado`
- `organization_id`

### Notas

- `estado` se conserva porque la UI ya lo usa.
- En la primera vertical no conviene guardar `sync_pending` ni `sincronizado` como lógica de negocio.
- `organization_id` debe existir para filtrar multi-tenant.

## Colección: `comandas`

### Campos

- `id: string`
- `folio: number`
- `mesa_id: string`
- `mesa_nombre?: string`
- `mesero: string`
- `cliente?: string`
- `cliente_id?: string`
- `estado: 'pendiente' | 'en_cocina' | 'listo' | 'cuenta' | 'cerrado' | 'facturado' | 'anulada'`
- `habitacion_cuenta_id?: string`
- `nota?: string`
- `factura_nro?: string`
- `factura_nota?: string`
- `confirmada: boolean`
- `total: number`
- `personas?: number`
- `created_at: string`
- `updated_at: string`
- `motivo_anulacion?: string`
- `organization_id: string`

### Campos derivados o de sync

- `_deleted?: boolean`
- `_modified?: string`

### Índices recomendados

- `id`
- `folio`
- `mesa_id`
- `estado`
- `habitacion_cuenta_id`
- `organization_id`
- `updated_at`

### Notas

- `confirmada` debe seguir existiendo porque la UI la usa para distinguir flujos.
- `sincronizado` debe salir del dominio si RxDB se convierte en la fuente local.
- `items` no debe ser campo persistido principal; mejor resolverlo por query de `comanda_items`.

## Colección: `comanda_items`

### Campos

- `id: string`
- `comanda_id: string`
- `item_id: string`
- `nombre: string`
- `precio: number`
- `cantidad: number`
- `modificadores?: string[]`
- `nota?: string`
- `estado: 'pendiente' | 'listo'`
- `pagado_cantidad?: number`
- `created_at?: string`
- `updated_at: string`
- `organization_id: string`

### Campos derivados o de sync

- `_deleted?: boolean`
- `_modified?: string`

### Índices recomendados

- `id`
- `comanda_id`
- `item_id`
- `estado`
- `organization_id`
- `updated_at`

### Notas

- `pagado_cantidad` se conserva porque ya afecta edición y cobro parcial.
- `modificadores` debe ser un array simple de strings, como ya está hoy.
- Para borrar ítems, lo más probable es usar `_deleted` en lugar de una tabla tombstone separada.

## Relaciones lógicas

- Una `mesa` puede tener 0 o 1 `comanda` operativa.
- Una `comanda` puede tener N `comanda_items`.
- `mesa_id` y `comanda_id` son claves lógicas, no joins físicos.

## Reglas de dominio

- Una comanda operativa se considera viva si no está cerrada/facturada/anulada.
- Una mesa no debe mostrarse libre si existe una comanda operativa asociada.
- La UI debe calcular estado operativo desde el dominio, no solo desde el color visual.

## Fase 1

Implementar primero:

- esquema RxDB
- acceso local a las tres colecciones
- consultas equivalentes a las que hoy hace Dexie
- replicación Supabase solo para estas tres colecciones

## Fase 2

Después:

- mover mutaciones de mesas/comandas/items a helpers centrales
- quitar `sync_pending` y `sincronizado`
- retirar la lógica vieja de sync por partes
