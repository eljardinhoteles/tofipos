# Graph Report - POS_food_  (2026-05-23)

## Corpus Check
- 110 files · ~84,062 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 756 nodes · 1323 edges · 43 communities (32 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 39|Community 39]]

## God Nodes (most connected - your core abstractions)
1. `initVerticalRxDb()` - 63 edges
2. `useUI()` - 37 edges
3. `useIvaActivo()` - 23 edges
4. `useRxMenuCatalog()` - 23 edges
5. `compilerOptions` - 22 edges
6. `RxMesa` - 21 edges
7. `compilerOptions` - 18 edges
8. `useRxClientes()` - 17 edges
9. `Sistema de comandas — Dexie.js + Vite + Supabase` - 16 edges
10. `calcularTotalesComanda()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Ordenes()` --calls--> `dayjs`  [INFERRED]
  src/pages/Ordenes.tsx → package.json
- `Mesas()` --calls--> `useUI()`  [EXTRACTED]
  src/pages/Mesas.tsx → src/context/UIContext.tsx
- `App()` --calls--> `useAuth()`  [EXTRACTED]
  src/App.tsx → src/context/AuthContext.tsx
- `CalendarGrid()` --calls--> `useUI()`  [EXTRACTED]
  src/components/Reservas/CalendarGrid.tsx → src/context/UIContext.tsx
- `SidebarMenuProduct()` --calls--> `useUI()`  [EXTRACTED]
  src/components/Menu/SidebarMenuProduct.tsx → src/context/UIContext.tsx

## Communities (43 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (59): PaymentMethodAndCharge(), PaymentMethodAndChargeProps, POSCard, POSCardProps, TicketPreviewModal(), TicketPreviewModalProps, ModifierGroup, createRxCategoria() (+51 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (52): ClienteFormModal(), ClienteFormModalProps, UIContext, UIContextType, useUI(), createRxCliente(), createRxComanda(), createRxPiso() (+44 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (36): PageHeader(), PageHeaderProps, ComandaEstadoBase, getMesaEstadoEfectivo(), isOperativeComanda(), isOperativeComandaForMesa(), BorradoPendiente, ComandaItemDelete (+28 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (47): dependencies, dexie, dexie-react-hooks, @mantine/charts, @mantine/core, @mantine/dates, @mantine/form, @mantine/hooks (+39 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (32): code:ts (import {), code:tsx (<Box {...getStyles('root')} {...others} />), code:ts (// Factory vars: { root: '--my-height' | '--my-color' }), code:ts (MyComponent.varsResolver = varsResolver;), code:ts (interface StylesApiProps<Payload extends FactoryPayload> {), code:ts (interface CompoundStylesApiProps<Payload extends FactoryPayl), code:ts (// Type uses PolymorphicFactory<{}> instead of Factory<{}>), code:ts (// Factory uses 'signature' field) (+24 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (36): code:tsx (const combobox = useCombobox(options?: UseComboboxOptions);), code:tsx (<Combobox.Empty>Nothing found</Combobox.Empty>), code:tsx (<Combobox.Group label="Frontend">), code:tsx (<Combobox.Header>Custom header</Combobox.Header>), code:tsx (<Combobox.Chevron size="sm" error={error} color="blue" />), code:tsx (<Combobox.ClearButton onClear={() => setValue(null)} />), code:tsx (<Combobox.HiddenInput), code:ts (interface UseComboboxOptions {) (+28 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (34): 10. KDS — pantalla cocina, 11. Inicializar todo en main.tsx, 12. Variables de entorno, 13. Orden de desarrollo recomendado, 14. Puente de impresora (script Node separado), 1. Crear el proyecto, 2. Estructura de carpetas, 3. Supabase — schema SQL (+26 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (28): code:ts (useForm<Values, TransformedValues>({), code:ts ({), code:ts (const field = useField({), code:ts ({), code:ts (const [FormProvider, useFormContext, useForm] = createFormCo), code:ts (const actions = createFormActions<Values>('my-form-name');), code:ts (const form = useForm({ name: 'my-form-name', initialValues: ), code:ts (// Rules object — keys match form field names, nested object) (+20 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+16 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (23): ajusteIvaSchema, categoriaSchema, clienteSchema, ComandaEstado, ComandaItemEstado, comandaItemSchema, comandaSchema, emitSyncStatus() (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (23): code:tsx (import { Box, BoxProps, ElementProps, factory, Factory, useP), code:tsx (// TypeScript infers value as string | null), code:css (.root {), code:tsx (import {), code:ts (import { createSafeContext, GetStylesApi } from '@mantine/co), code:tsx (import {), code:tsx (import { MyCardProvider } from './MyCard.context';), code:tsx (import {) (+15 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (21): code:tsx (import { useForm, isEmail, isNotEmpty, hasLength } from '@ma), code:tsx (const form = useForm({ initialValues: { email: '', password:), code:tsx (const form = useForm({), code:tsx (interface Employee {), code:tsx (form.insertListItem('employees', { name: '', role: '' });   ), code:tsx (const form = useForm({), code:tsx (// 1. Create typed context once), code:tsx (const form = useForm({) (+13 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (21): Campos, Campos, Campos, Campos derivados o de sync, Campos derivados o de sync, Campos derivados o de sync, Colección: `comanda_items`, Colección: `comandas` (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (18): 1. Set up the form, 2. Wire inputs with getInputProps, 3. Handle submission, code:tsx (const form = useForm({), code:tsx (<TextInput {...form.getInputProps('email')} label="Email" />), code:tsx (<Checkbox {...form.getInputProps('agreed', { type: 'checkbox), code:tsx (<form onSubmit={form.onSubmit((values) => console.log(values), code:tsx (validate: {) (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (15): code:tsx (function CustomSelect({ data }: { data: string[] }) {), code:tsx (function SearchableSelect({ data }: { data: string[] }) {), code:tsx (function MultiSelect({ data }: { data: string[] }) {), code:tsx (// Single value), code:tsx (<Combobox.Dropdown>), Table of Contents, Basic select (button trigger), Clear button (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (17): computedHash, skillPath, source, sourceType, computedHash, skillPath, source, sourceType (+9 more)

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (12): AuthContext, AuthContextType, useAuth(), RxUsuario, detenerSync(), iniciarSync(), sincronizarDatosOrganizacion(), MainSidebar() (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.21
Nodes (8): COLLECTION_LABELS, SyncStatusModal(), forceSyncAll(), subscribeSyncStatus(), SyncStatus, NavbarLinkProps, navItems, NAV_ITEMS

### Community 20 - "Community 20"
Cohesion: 0.21
Nodes (11): RxPago, alignCenter(), DEFAULT_CONFIG, drawDivider(), formatProductRow(), generarComandaCocina(), generarPrecuentaDividida(), generarTicketPago() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (11): 1. Create the store, 2. Render structure, 3. Handle submit, code:tsx (const combobox = useCombobox({), code:tsx (<Combobox store={combobox} onOptionSubmit={handleSubmit}>), code:tsx (const handleSubmit = (val: string) => {), Core Workflow, Mantine Combobox Skill (+3 more)

### Community 22 - "Community 22"
Cohesion: 0.20
Nodes (9): code:tsx (import {), code:ts (Factory<{), code:ts (const theme = createTheme({), Component template, Factory type fields, Factory variant — which to use, Mantine Custom Components Skill, References (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (8): exclude, extractDocstrings, frameworks, include, languages, maxFileSize, trackCallSites, version

### Community 24 - "Community 24"
Cohesion: 0.28
Nodes (7): createRxAjusteIva(), setSuspendHooks(), updateRxAjusteIva(), useRxAjustesIva(), Ajustes(), SECTION_KEYS, SectionKey

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (7): AuthProvider(), UIProvider(), diagnoseSyncState(), myColor, o, posTheme, tierra

### Community 26 - "Community 26"
Cohesion: 0.33
Nodes (5): code:js (export default defineConfig([), code:js (// eslint.config.js), Expanding the ESLint configuration, React Compiler, React + TypeScript + Vite

### Community 27 - "Community 27"
Cohesion: 0.47
Nodes (4): createRxUsuario(), updateRxUsuario(), useRxUsuarios(), AjustesUsuarios()

## Knowledge Gaps
- **350 isolated node(s):** `version`, `source`, `sourceType`, `skillPath`, `computedHash` (+345 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `Ordenes()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `dayjs` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **What connects `version`, `source`, `sourceType` to the rest of the system?**
  _350 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0633964429145152 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05261261261261261 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06848357791754019 - nodes in this community are weakly interconnected._