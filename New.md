# Sistema de comandas — Dexie.js + Vite + Supabase

Stack: Vite + React + TypeScript + Dexie.js + Supabase + Tailwind + Shadcn/ui

---

## 1. Crear el proyecto

```bash
npm create vite@latest comandas -- --template react-ts
cd comandas
npm install
```

### Instalar dependencias

```bash
# UI
npm install tailwindcss postcss autoprefixer
npm install @shadcn/ui
npx tailwindcss init -p

# Base de datos local
npm install dexie dexie-react-hooks

# Supabase
npm install @supabase/supabase-js

# Estado global
npm install zustand

# Routing
npm install react-router-dom
```

---

## 2. Estructura de carpetas

```
src/
├── db/
│   ├── database.ts        ← definición de Dexie (tablas locales)
│   └── sync.ts            ← lógica de sincronización con Supabase
├── lib/
│   └── supabase.ts        ← cliente de Supabase
├── hooks/
│   ├── useComandas.ts     ← hook para leer/escribir comandas
│   └── useMesas.ts        ← hook para estado de mesas
├── pages/
│   ├── Mesas.tsx          ← pantalla principal — selección de mesa
│   ├── Pedido.tsx         ← tomar pedido por mesa
│   ├── KDS.tsx            ← pantalla cocina
│   └── Caja.tsx           ← resumen de cuentas
├── components/
│   ├── ItemCard.tsx       ← card de ítem del menú
│   ├── PedidoPanel.tsx    ← panel lateral con pedido actual
│   └── EstadoBadge.tsx    ← badge online/offline
└── main.tsx
```

---

## 3. Supabase — schema SQL

Ejecutar en el SQL Editor de Supabase:

```sql
-- Mesas
create table mesas (
  id text primary key,
  nombre text not null,
  estado text default 'libre' check (estado in ('libre','ocupada','cuenta'))
);

-- Categorías del menú
create table categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden int default 0
);

-- Menú
create table menu_items (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio numeric(10,2) not null,
  categoria_id uuid references categorias(id),
  activo boolean default true,
  modificadores jsonb default '[]'
);

-- Comandas
create table comandas (
  id uuid primary key default gen_random_uuid(),
  mesa_id text references mesas(id),
  mesero text,
  estado text default 'pendiente' check (estado in ('pendiente','en_cocina','listo','cerrado')),
  nota text,
  total numeric(10,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Items de cada comanda
create table comanda_items (
  id uuid primary key default gen_random_uuid(),
  comanda_id uuid references comandas(id) on delete cascade,
  item_id uuid references menu_items(id),
  nombre text not null,
  precio numeric(10,2) not null,
  cantidad int default 1,
  modificadores text,
  nota text,
  estado text default 'pendiente' check (estado in ('pendiente','listo'))
);

-- Habilitar Realtime para KDS
alter publication supabase_realtime add table comandas;
alter publication supabase_realtime add table comanda_items;

-- Datos iniciales de mesas
insert into mesas (id, nombre) values
  ('M1','Mesa 1'),('M2','Mesa 2'),('M3','Mesa 3'),
  ('M4','Mesa 4'),('M5','Mesa 5'),('M6','Mesa 6'),
  ('T1','Terraza 1'),('T2','Terraza 2'),('B1','Barra 1');
```

---

## 4. Cliente Supabase

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

```bash
# .env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxx
```

---

## 5. Base de datos local — Dexie

```typescript
// src/db/database.ts
import Dexie, { Table } from 'dexie'

export interface Mesa {
  id: string
  nombre: string
  estado: 'libre' | 'ocupada' | 'cuenta'
}

export interface MenuItem {
  id: string
  nombre: string
  precio: number
  categoria_id: string
  categoria_nombre?: string
  activo: boolean
  modificadores: string[]
}

export interface ComandaItem {
  id: string
  comanda_id: string
  item_id: string
  nombre: string
  precio: number
  cantidad: number
  modificadores?: string
  nota?: string
  estado: 'pendiente' | 'listo'
}

export interface Comanda {
  id: string
  mesa_id: string
  mesero: string
  estado: 'pendiente' | 'en_cocina' | 'listo' | 'cerrado'
  nota?: string
  total: number
  items?: ComandaItem[]
  sincronizado: boolean      // false = pendiente de subir a Supabase
  created_at: string
  updated_at: string
}

class ElJardinDB extends Dexie {
  mesas!: Table<Mesa>
  menu_items!: Table<MenuItem>
  comandas!: Table<Comanda>
  comanda_items!: Table<ComandaItem>

  constructor() {
    super('ElJardinDB')

    this.version(1).stores({
      mesas:         'id, estado',
      menu_items:    'id, categoria_id, activo',
      comandas:      'id, mesa_id, estado, sincronizado, created_at',
      comanda_items: 'id, comanda_id, estado',
    })
  }
}

export const db = new ElJardinDB()
```

---

## 6. Sincronización Dexie → Supabase

```typescript
// src/db/sync.ts
import { db } from './database'
import { supabase } from '../lib/supabase'

let syncInterval: ReturnType<typeof setInterval> | null = null

// Sincronizar una comanda pendiente
async function syncComanda(comanda: typeof db.comandas extends Table<infer T> ? T : never) {
  try {
    const items = await db.comanda_items
      .where('comanda_id')
      .equals(comanda.id)
      .toArray()

    // Upsert comanda en Supabase
    const { error: errorComanda } = await supabase
      .from('comandas')
      .upsert({
        id:         comanda.id,
        mesa_id:    comanda.mesa_id,
        mesero:     comanda.mesero,
        estado:     comanda.estado,
        nota:       comanda.nota,
        total:      comanda.total,
        created_at: comanda.created_at,
        updated_at: comanda.updated_at,
      })

    if (errorComanda) throw errorComanda

    // Upsert items
    if (items.length > 0) {
      const { error: errorItems } = await supabase
        .from('comanda_items')
        .upsert(items)

      if (errorItems) throw errorItems
    }

    // Marcar como sincronizado en Dexie
    await db.comandas.update(comanda.id, { sincronizado: true })

    console.log(`Comanda ${comanda.id} sincronizada`)
  } catch (err) {
    console.warn(`No se pudo sincronizar comanda ${comanda.id}:`, err)
  }
}

// Correr sync de todas las pendientes
export async function syncPendientes() {
  if (!navigator.onLine) return

  const pendientes = await db.comandas
    .where('sincronizado')
    .equals(0)           // Dexie guarda booleans como 0/1
    .toArray()

  for (const comanda of pendientes) {
    await syncComanda(comanda)
  }
}

// Cargar menú y mesas desde Supabase al arrancar
export async function cargarDatosIniciales() {
  if (!navigator.onLine) return

  try {
    // Cargar mesas
    const { data: mesas } = await supabase.from('mesas').select('*')
    if (mesas) await db.mesas.bulkPut(mesas)

    // Cargar menú con categoría
    const { data: items } = await supabase
      .from('menu_items')
      .select('*, categorias(nombre)')
      .eq('activo', true)

    if (items) {
      const itemsFormateados = items.map((i: any) => ({
        ...i,
        categoria_nombre: i.categorias?.nombre,
        modificadores: i.modificadores || [],
      }))
      await db.menu_items.bulkPut(itemsFormateados)
    }
  } catch (err) {
    console.warn('Sin internet — usando datos locales')
  }
}

// Iniciar sync automático cada 10 segundos
export function iniciarSync() {
  cargarDatosIniciales()

  syncInterval = setInterval(() => {
    syncPendientes()
  }, 10_000)

  // Sync inmediato cuando vuelve la red
  window.addEventListener('online', () => {
    console.log('Red recuperada — sincronizando...')
    syncPendientes()
  })
}

export function detenerSync() {
  if (syncInterval) clearInterval(syncInterval)
}
```

---

## 7. Hook principal — useComandas

```typescript
// src/hooks/useComandas.ts
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Comanda, ComandaItem } from '../db/database'
import { supabase } from '../lib/supabase'
import { v4 as uuid } from 'uuid'

export function useComandas(mesaId?: string) {
  const comandas = useLiveQuery(
    () => mesaId
      ? db.comandas.where('mesa_id').equals(mesaId).toArray()
      : db.comandas.orderBy('created_at').reverse().toArray(),
    [mesaId]
  )

  return comandas ?? []
}

export async function crearComanda(
  mesaId: string,
  mesero: string,
  items: Array<{ item_id: string; nombre: string; precio: number; cantidad: number; modificadores?: string; nota?: string }>,
  nota?: string
) {
  const comandaId = uuid()
  const total = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0)
  const ahora = new Date().toISOString()

  // 1. Guardar comanda en Dexie (inmediato, sin red)
  await db.comandas.add({
    id:          comandaId,
    mesa_id:     mesaId,
    mesero,
    estado:      'pendiente',
    nota,
    total,
    sincronizado: false,
    created_at:  ahora,
    updated_at:  ahora,
  })

  // 2. Guardar items en Dexie
  const itemsComanda: ComandaItem[] = items.map(i => ({
    id:           uuid(),
    comanda_id:   comandaId,
    item_id:      i.item_id,
    nombre:       i.nombre,
    precio:       i.precio,
    cantidad:     i.cantidad,
    modificadores: i.modificadores,
    nota:         i.nota,
    estado:       'pendiente',
  }))

  await db.comanda_items.bulkAdd(itemsComanda)

  // 3. Intentar subir a Supabase inmediatamente
  if (navigator.onLine) {
    try {
      await supabase.from('comandas').insert({
        id: comandaId, mesa_id: mesaId, mesero,
        estado: 'pendiente', nota, total,
        created_at: ahora, updated_at: ahora,
      })
      await supabase.from('comanda_items').insert(itemsComanda)
      await db.comandas.update(comandaId, { sincronizado: true })
    } catch {
      // Queda en cola — syncPendientes lo reintentará
    }
  }

  // 4. Marcar mesa como ocupada
  await db.mesas.update(mesaId, { estado: 'ocupada' })

  return comandaId
}

export async function actualizarEstadoItem(itemId: string, estado: 'pendiente' | 'listo') {
  await db.comanda_items.update(itemId, { estado })

  if (navigator.onLine) {
    await supabase
      .from('comanda_items')
      .update({ estado })
      .eq('id', itemId)
  }
}
```

---

## 8. Hook — useMesas

```typescript
// src/hooks/useMesas.ts
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'

export function useMesas() {
  return useLiveQuery(() => db.mesas.toArray()) ?? []
}

export function useMenu(categoriaId?: string) {
  return useLiveQuery(
    () => categoriaId
      ? db.menu_items.where('categoria_id').equals(categoriaId).toArray()
      : db.menu_items.toArray(),
    [categoriaId]
  ) ?? []
}
```

---

## 9. Pantalla de pedido — Pedido.tsx

```tsx
// src/pages/Pedido.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { crearComanda } from '../hooks/useComandas'
import ItemCard from '../components/ItemCard'
import PedidoPanel from '../components/PedidoPanel'

interface ItemPedido {
  item_id: string
  nombre: string
  precio: number
  cantidad: number
  modificadores?: string
}

export default function Pedido() {
  const { mesaId } = useParams<{ mesaId: string }>()
  const navigate = useNavigate()
  const [pedido, setPedido] = useState<Record<string, ItemPedido>>({})
  const [catActiva, setCatActiva] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const categorias = useLiveQuery(() =>
    db.menu_items
      .orderBy('categoria_id')
      .uniqueKeys()
      .then(keys => keys as string[])
  ) ?? []

  const items = useLiveQuery(
    () => catActiva
      ? db.menu_items.where('categoria_id').equals(catActiva).toArray()
      : db.menu_items.toArray(),
    [catActiva]
  ) ?? []

  function agregarItem(item: typeof items[0]) {
    setPedido(prev => {
      const existe = prev[item.id]
      return {
        ...prev,
        [item.id]: {
          item_id:  item.id,
          nombre:   item.nombre,
          precio:   item.precio,
          cantidad: existe ? existe.cantidad + 1 : 1,
        }
      }
    })
  }

  function cambiarCantidad(itemId: string, delta: number) {
    setPedido(prev => {
      const nueva = (prev[itemId]?.cantidad ?? 0) + delta
      if (nueva <= 0) {
        const { [itemId]: _, ...resto } = prev
        return resto
      }
      return { ...prev, [itemId]: { ...prev[itemId], cantidad: nueva } }
    })
  }

  async function enviar() {
    if (!mesaId || Object.keys(pedido).length === 0) return
    setEnviando(true)

    await crearComanda(
      mesaId,
      'Mesero',     // reemplazar con usuario autenticado
      Object.values(pedido)
    )

    setEnviando(false)
    navigate('/')
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Panel izquierdo — menú */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {/* Filtro de categorías */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => setCatActiva(null)}>Todo</button>
          {categorias.map(cat => (
            <button
              key={cat}
              onClick={() => setCatActiva(cat)}
              style={{ fontWeight: catActiva === cat ? 600 : 400 }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid de ítems */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              cantidad={pedido[item.id]?.cantidad ?? 0}
              onAgregar={() => agregarItem(item)}
            />
          ))}
        </div>
      </div>

      {/* Panel derecho — pedido */}
      <PedidoPanel
        mesaId={mesaId ?? ''}
        pedido={Object.values(pedido)}
        onCambiarCantidad={cambiarCantidad}
        onEnviar={enviar}
        enviando={enviando}
      />
    </div>
  )
}
```

---

## 10. KDS — pantalla cocina

```tsx
// src/pages/KDS.tsx
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { supabase } from '../lib/supabase'
import { actualizarEstadoItem } from '../hooks/useComandas'

export default function KDS() {
  const comandas = useLiveQuery(() =>
    db.comandas
      .where('estado')
      .anyOf(['pendiente', 'en_cocina'])
      .toArray()
  ) ?? []

  // Escuchar nuevas comandas desde Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel('kds-comandas')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'comandas'
      }, async (payload) => {
        // Guardar en Dexie local para que KDS también funcione offline
        await db.comandas.put({ ...payload.new as any, sincronizado: true })
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'comanda_items'
      }, async (payload) => {
        await db.comanda_items.put(payload.new as any)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
      {comandas.map(comanda => (
        <ComandaCard key={comanda.id} comanda={comanda} />
      ))}
    </div>
  )
}

function ComandaCard({ comanda }: { comanda: any }) {
  const items = useLiveQuery(
    () => db.comanda_items.where('comanda_id').equals(comanda.id).toArray(),
    [comanda.id]
  ) ?? []

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem' }}>
      <div style={{ fontWeight: 600, marginBottom: '8px' }}>
        {comanda.mesa_id} — {new Date(comanda.created_at).toLocaleTimeString()}
      </div>
      {items.map(item => (
        <div
          key={item.id}
          onClick={() => actualizarEstadoItem(item.id, item.estado === 'pendiente' ? 'listo' : 'pendiente')}
          style={{
            padding: '6px 8px',
            marginBottom: '4px',
            borderRadius: '6px',
            cursor: 'pointer',
            background: item.estado === 'listo' ? '#E1F5EE' : '#FFF',
            textDecoration: item.estado === 'listo' ? 'line-through' : 'none',
            opacity: item.estado === 'listo' ? 0.6 : 1,
          }}
        >
          {item.cantidad}x {item.nombre}
          {item.modificadores && <span style={{ fontSize: '11px', color: '#888' }}> — {item.modificadores}</span>}
        </div>
      ))}
    </div>
  )
}
```

---

## 11. Inicializar todo en main.tsx

```tsx
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { iniciarSync } from './db/sync'
import Mesas from './pages/Mesas'
import Pedido from './pages/Pedido'
import KDS from './pages/KDS'
import Caja from './pages/Caja'

// Arrancar sincronización al iniciar la app
iniciarSync()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/"              element={<Mesas />} />
        <Route path="/mesa/:mesaId" element={<Pedido />} />
        <Route path="/kds"          element={<KDS />} />
        <Route path="/caja"         element={<Caja />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
```

---

## 12. Variables de entorno

```bash
# .env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 13. Orden de desarrollo recomendado

1. Crear proyecto Vite + instalar dependencias
2. Crear schema en Supabase y cargar datos de prueba (mesas + menú)
3. Configurar `database.ts` y `supabase.ts`
4. Implementar `sync.ts` — probar que carga mesas y menú
5. Implementar `crearComanda` — probar offline y que sincroniza al volver la red
6. Construir pantalla de pedido `Pedido.tsx`
7. Construir KDS con Realtime
8. Puente de impresora (script Node separado)
9. Pantalla de mesas y caja

---

## 14. Puente de impresora (script Node separado)

Corre en el PC de caja. Escucha Supabase Realtime e imprime ESC/POS.

```bash
npm install @supabase/supabase-js node-escpos
```

```javascript
// impresora.js
const { createClient } = require('@supabase/supabase-js')
const escpos = require('node-escpos')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

supabase
  .channel('impresora')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'comandas'
  }, async (payload) => {
    const comanda = payload.new
    const { data: items } = await supabase
      .from('comanda_items')
      .select('*')
      .eq('comanda_id', comanda.id)

    imprimirComanda(comanda, items)
  })
  .subscribe()

function imprimirComanda(comanda, items) {
  const device = new escpos.Network('192.168.1.100') // IP de tu impresora
  const printer = new escpos.Printer(device)

  device.open(() => {
    printer
      .align('CT')
      .style('B')
      .size(1, 1)
      .text(`${comanda.mesa_id}`)
      .style('NORMAL')
      .size(0, 0)
      .text(`${new Date().toLocaleTimeString()}`)
      .drawLine()

    items.forEach(item => {
      printer.text(`${item.cantidad}x ${item.nombre}`)
      if (item.modificadores) printer.text(`   ${item.modificadores}`)
    })

    if (comanda.nota) {
      printer.drawLine().text(`NOTA: ${comanda.nota}`)
    }

    printer.drawLine().cut().close()
  })
}
```

---

## Resumen del flujo completo

```
Mesero toca "Enviar"
  → Dexie guarda comanda (sincronizado: false)  ← instantáneo, sin red
  → Intenta subir a Supabase
      ✓ Con internet  → sube, marca sincronizado: true
                      → Supabase Realtime → KDS + impresora
      ✗ Sin internet  → queda en Dexie
                      → sync cada 10s reintenta
                      → cuando vuelve la red → sube todo
```