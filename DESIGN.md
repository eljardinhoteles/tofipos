---
name: POS El Jardín
description: Punto de venta de El Jardín Lodge & Spa. Uso en iPad y PC, con manos ocupadas y poca luz.
colors:
  background: "#EEF0F2"
  foreground: "#060808"
  card: "#FFFFFF"
  muted: "#E9ECEC"
  muted-foreground: "#4B5F63"
  border: "#D3D9DA"
  primary: "#2F6B4F"
  primary-foreground: "#F3F8F5"
  destructive: "#D90000"
  destructive-soft: "#FFEBE7"
  success: "#248430"
  success-soft: "#E3F4E2"
  success-foreground: "#146720"
  warning: "#D9A514"
  warning-soft: "#FEF0D4"
  warning-foreground: "#B84C00"
  info: "#007CA3"
  info-soft: "#DCF3FC"
  info-foreground: "#00658B"
  special: "#7C44C3"
  special-soft: "#F1EAFF"
  special-foreground: "#6A34AB"
  rose: "#CF284B"
  rose-soft: "#FFEBED"
  rose-foreground: "#AE0037"
  teal: "#00756B"
  teal-soft: "#DDF9F4"
  teal-foreground: "#005F59"
  slate: "#596A83"
  slate-soft: "#EDF2F8"
  slate-foreground: "#384960"
  nav: "#1C2A22"
  nav-foreground: "#F3F8F5"
  nav-accent: "#C3E463"
  nav-alert: "#FF9E96"
rounded:
  md: 6px
  lg: 7px
  xl: 10px
  2xl: 13px
  full: 9999px
  marco: 20px
typography:
  etiqueta:
    fontFamily: Nunito Sans Variable
    fontSize: 0.75rem
    fontWeight: 700
    letterSpacing: 0.05em
  meta:
    fontFamily: Nunito Sans Variable
    fontSize: 0.75rem
    fontWeight: 500
  cuerpo:
    fontFamily: Nunito Sans Variable
    fontSize: 0.875rem
    fontWeight: 600
  fila:
    fontFamily: Nunito Sans Variable
    fontSize: 1rem
    fontWeight: 700
  titulo:
    fontFamily: Nunito Sans Variable
    fontSize: 1rem
    fontWeight: 800
  valor:
    fontFamily: Nunito Sans Variable
    fontSize: 1.25rem
    fontWeight: 800
  cifra:
    fontFamily: Nunito Sans Variable
    fontSize: 1.5rem
    fontWeight: 800
  dato:
    fontFamily: Nunito Sans Variable
    fontSize: 0.75rem
    fontWeight: 700
  cuerpo-fuerte:
    fontFamily: Nunito Sans Variable
    fontSize: 0.875rem
    fontWeight: 700
  hero:
    fontFamily: Nunito Sans Variable
    fontSize: 2.25rem
    fontWeight: 800
components:
  boton-primario:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  mesa-seleccionada:
    backgroundColor: "{colors.info}"
    textColor: "#FFFFFF"
  mesa-cuenta-seleccionada:
    backgroundColor: "{colors.warning-foreground}"
    textColor: "#FFFFFF"
  chip-pendiente:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-foreground}"
  chip-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info-foreground}"
  chip-especial:
    backgroundColor: "{colors.special-soft}"
    textColor: "{colors.special-foreground}"
  chip-exito:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success-foreground}"
  chip-error:
    backgroundColor: "{colors.destructive-soft}"
    textColor: "{colors.destructive}"
  texto-secundario:
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted-foreground}"
  tarjeta:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
  campo:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
  nav:
    backgroundColor: "{colors.nav}"
    textColor: "{colors.nav-foreground}"
  nav-activo:
    backgroundColor: "{colors.nav}"
    textColor: "{colors.nav-accent}"
  solido-exito:
    backgroundColor: "{colors.success}"
    textColor: "#FFFFFF"
  solido-especial:
    backgroundColor: "{colors.special}"
    textColor: "#FFFFFF"
  aviso-solido:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.foreground}"
  etiqueta-rose:
    backgroundColor: "{colors.rose-soft}"
    textColor: "{colors.rose-foreground}"
  etiqueta-teal:
    backgroundColor: "{colors.teal-soft}"
    textColor: "{colors.teal-foreground}"
  etiqueta-slate:
    backgroundColor: "{colors.slate-soft}"
    textColor: "{colors.slate-foreground}"
  header-rose:
    backgroundColor: "{colors.rose}"
    textColor: "#FFFFFF"
  header-teal:
    backgroundColor: "{colors.teal}"
    textColor: "#FFFFFF"
  header-slate:
    backgroundColor: "{colors.slate}"
    textColor: "#FFFFFF"
  alerta-en-nav:
    backgroundColor: "{colors.nav}"
    textColor: "{colors.nav-alert}"
---

## Overview

Interfaz táctil, densa pero legible. La jerarquía se logra con pocos roles tipográficos y no con muchos tamaños.

## Colors

Valores del tema claro (los del tema oscuro viven en `src/index.css`). Siempre se usan los tokens, nunca la paleta cruda de Tailwind ni hex.

| Token | Uso |
|---|---|
| primary | Acciones principales, y mesa ocupada o seleccionada (verde de marca). |
| info | Habitaciones (ocupada o seleccionada), abonos y datos informativos. Azul petróleo `#007CA3`, elegido para que se lea emparentado con el verde de marca sin confundirse con él. |
| warning | **Pendiente** y cuenta pedida. Pendiente de confirmar, por cobrar. |
| success | Hecho, pagado, confirmado. |
| destructive | Error, fallido, anular. |
| special | Acciones fiscales o especiales (facturar, dividir cuenta). |
| muted-foreground | Texto secundario sobre claro. |
| nav-* | Solo en header y sidebar oscuros. `nav-alert` es el rojo legible sobre `nav`. |

Cada estado tiene tres variantes: `<estado>` (relleno sólido, texto blanco encima), `<estado>-soft` (fondo suave de chips y avisos) y `<estado>-foreground` (texto e iconos sobre blanco o sobre `-soft`).

Reglas:

- En el plano de Mesas: libre = blanca neutra; mesa ocupada = primary; habitación ocupada = info; cuenta pedida = warning (en ambas). Seleccionada = relleno sólido del mismo color.
- Superficies: reposo `bg-muted/40`, hover `hover:bg-muted/60`; sólido `bg-muted`. Tintes de estado: reposo `/10`, hover `/15`. Overlays blancos sobre color: `/15` en reposo, `/25` en hover.
- Pasos de un flujo: pendiente = warning, en curso = info, hecho = success, fallido = destructive. Por eso "por confirmar" usa warning y no un naranja propio.
- `text-white` solo sobre rellenos sólidos de estado. Sobre `primary` se usa `text-primary-foreground`.
- Texto secundario sobre un fondo de color: `/70` de opacidad, un solo nivel. Sobre fondo claro se usa `text-muted-foreground`, nunca `text-foreground/xx`.
- Los iconos decorativos pueden bajar a `/60`, y la pista de una celda vacía (el `+` del planificador) a `/40` en reposo; el texto que se lee, no.
- Los colores de etiqueta del planificador (`rose`, `teal`, `slate`, además de los de estado) son tokens propios con sus tres variantes (`<color>`, `<color>-soft`, `<color>-foreground`) en `src/index.css`, con tema claro y oscuro. No son estados: identifican una etiqueta y no deben usarse para significar algo. Nunca se usa la paleta cruda de Tailwind.

Contraste (WCAG AA, auditado con Centro de Ventas): `warning-foreground` (L 0.55) y `destructive` (L 0.54) están ajustados para llegar a 4.5:1 como texto sobre su `-soft`. Tokens de superficie añadidos: `background-sunken` (panel de trabajo más oscuro que la página) y `primary-soft` (fondo suave del verde de marca, origen Mesa); ambos con tema claro y oscuro.

### Excepciones

- `ReservaWhatsAppCard`: la tarjeta se convierte en imagen para enviarla por WhatsApp. Usa estilos en línea con hex a propósito, porque la captura no resuelve las variables CSS del tema.

### Origen de una venta (badge)

Un solo componente (`OrigenBadge`) para Órdenes, Centro de Ventas y detalle. El color indica el lugar de origen y coincide con el resto de la app: Mesa = `primary`, Consumo habitación = `info`, Reservas (restaurante u hotel) = `warning`. El icono distingue restaurante de hotel. Estilo suave: fondo `-soft` o `/10`, texto `-foreground` y borde fino. El relleno sólido (mismo color, texto blanco) se usa solo cuando la orden está abierta en el sidebar: `activo`.

## Typography

Fuente única: Nunito Sans. Diez roles; cada uno existe como utilidad en `src/index.css` (`t-etiqueta`, `t-meta`, `t-cuerpo`, `t-fila`, `t-titulo`, `t-valor`, `t-cifra`, `t-dato`, `t-cuerpo-fuerte`, `t-hero`). El color se añade aparte con tokens (`text-foreground`, `text-muted-foreground`).

| Rol | Uso |
|---|---|
| etiqueta | Título de sección, subtítulo de header, rótulo de campo. Siempre mayúsculas. |
| meta | Ayudas, fechas, hora, texto secundario sin fondo. |
| cuerpo | Texto de lectura y detalle de una fila. |
| fila | Nombre de producto, cliente, mesa en una lista. |
| titulo | Título de sidebar, de modal y de bloque. |
| valor | Totales y precios destacados. |
| cifra | Números grandes (número de mesa, contadores). |
| dato | Badge, chip o dato pequeño que debe leerse (12px, 700). |
| cuerpo-fuerte | Texto de detalle destacado (14px, 700). |
| hero | Monto principal de una pantalla (saldo pendiente, total a cobrar). |

Reglas:

- Mínimo 12px (`0.75rem`). No usar `text-[10px]`, `text-[11px]` ni otros tamaños arbitrarios. Fuera de `src/components/ui/` (que define el tamaño propio de cada componente del kit) tampoco se escribe `text-xs`/`text-sm` con peso suelto: se usa el rol.
- Pesos permitidos: 500, 600, 700, 800. No usar `font-black` (900).
- Cifras que se comparan o suman llevan `tabular-nums` (ya incluido en `valor` y `cifra`).
- `dato` (12px, 700) es para estado y elementos con fondo: badges, chips, contadores. `meta` (12px, 500) es para datos secundarios sin fondo: hora, cliente, ayudas.
- En componentes que ya traen tipografía propia (`Label`), el rol se marca como prioritario: `t-dato!`.
- El tamaño solo se sale de la escala con una razón de producto (p. ej. ticket impreso) y se documenta aquí.
- Exentos de estas reglas por ser papel: el ticket térmico (48 columnas, motor `printTemplateEngine`) y el reporte A4 de cocina (se imprime con el diálogo nativo del navegador desde un iframe oculto, `src/lib/imprimirReporteA4.ts`) y el de cierre (hoja con estilos propios, Arial).

## Shapes

La base es `--radius: 0.45rem` (7.2px) en `src/index.css`; de ahí salen todas las esquinas. El radio se elige por rol y no por apariencia. Hay seis valores y ninguno más: no se usan `rounded` a secas, `rounded-sm`, `rounded-3xl`, `rounded-4xl` ni valores arbitrarios.

| Rol | Clase | Valor |
|---|---|---|
| Todo lo que se toca: botón (con o sin texto, también de icono), campo, selector, buscador, selector de pestañas, fila o tarjeta tocable | `rounded-2xl` | 13px |
| Toda superficie: tarjeta, paper, bloque informativo o de aviso, popover, menú desplegable, diálogo, tarjeta de mesa | `rounded-2xl` | 13px |
| Recuadro de icono, avatar cuadrado o miniatura de 40 a 56px | `rounded-xl` | 10px |
| Recuadro de icono de hasta 36px | `rounded-lg` | 7px |
| Chip o etiqueta rectangular, casilla, mini-botón de hasta 24px | `rounded-md` | 6px |
| Píldoras, círculos, avatares, chips de filtro, checks | `rounded-full` | píldora |
| Marco de la página y esquinas superiores de las hojas inferiores | `rounded-marco` | 20px |

Reglas:

- El radio de un elemento anidado es el del contenedor menos el margen que los separa (radios concéntricos). Es una regla del sistema y no una excepción: la pestaña dentro del selector de pestañas y el ítem dentro de un menú desplegable usan `xl`, y el recuadro de icono dentro de una fila seleccionable con 8px de margen usa `md`.
- Los componentes del kit (`Button`, `Input`, `Select`, `Textarea`, `Tabs`, `Card`, `Drawer`, `Dialog`) ya traen su radio por rol; no se sobrescribe con otro.
- Un elemento nuevo se clasifica con esta tabla antes de escribir su clase. Si no encaja en ninguna fila, la tabla se corrige primero.

## Touch targets

- Todo control que se toca debe medir al menos 44px (`size-11` / `h-11`) en pantallas táctiles.
- Con mouse se permite una versión compacta: `size-9 pointer-coarse:size-11`, `h-9 pointer-coarse:h-11`. No usar breakpoints (`lg:`) para esto: un iPad en horizontal ya cumple `lg`.
- Controles pequeños juntos (teléfono, WhatsApp, correo) llevan al menos 8px de separación.
- Los headers de sidebar usan siempre `ReservaHeader`; no se arman a mano. Tonos: `primary`, `info`, `special`, `success`, `destructive`, `rose`, `teal`, `slate`, `reserva` (naranja) y `neutro` (blanco, para formularios y pantallas de configuración). Las excepciones son el header de la comanda y los dos oscuros del plano y del selector de productos.
- Las filas de tabla que se tocan miden al menos 56px. Los campos de texto usan 16px (`text-base`) para que iOS no haga zoom.

## Componentes base (`src/components/ui`)

- `Button`, `Input`: en táctil tienen `min-h-11` (44px) sin importar el tamaño; un `h-12` explícito sigue mandando. Los iconos usan además `min-w-11`.
- `Button` base usa peso 700 y 14px (rol `cuerpo-fuerte`). `Badge` usa 12px/700 (`dato`). `Label` usa 14px/600.
- Títulos de `Dialog`, `AlertDialog`, `Sheet` y `Drawer` usan `t-titulo`.
- `Select`: el menú desplegable es una superficie más (`rounded-2xl`, borde `border-border`, `shadow-xl`, 6px de espacio interior); sus opciones miden `min-h-9 pointer-coarse:min-h-11`, `rounded-xl`, texto `t-cuerpo` (la marcada `t-cuerpo-fuerte`), cursor de mano y hover `bg-muted`. No se les pone un tamaño de texto propio. El disparador mide 32px (44px en táctil) y un campo de formulario le pone `h-12` como a un `Input`.
- Selección de una opción entre pocas (red de cobro de tarjeta): `RedCobroRadios` (`src/components/Common/RedCobroRadios.tsx`), filas tipo radio de al menos 44px que se acomodan en una sola fila si hay ancho y bajan de fila si no. Adjuntar foto o PDF: `ComprobanteAdjunto` (recuadro punteado; con archivo, una fila con el nombre y una X de 44px para quitarlo). Casilla de fila (marcar pagos, ajustar excedente): caja `size-5 rounded-md` verde al marcarla, zona táctil de 44px.
- Un control que solo aparece al pasar el cursor (anular, autor) lleva además `pointer-coarse:opacity-100`: en táctil no existe el hover.
- Para tamaños táctiles en componentes propios, usar `min-h-*` / `pointer-coarse:` y no `h-*` con breakpoints, para no pisar tamaños explícitos de quien lo use.

## Avisos (toasts)

Un solo sistema: el `Toaster` de Sonner del UI kit (`src/components/ui/sonner.tsx`) y la función `showToast` (`src/lib/toast.ts`). **Nadie importa `sonner` directo ni usa `alert()`**; incluso el aviso de impresión (`imprimirConAviso`) pasa por `showToast`.

- **Aspecto**: una superficie más del UI kit, igual que el popover y el menú del `Select`: `bg-popover`, `border-border`, `rounded-2xl`, `shadow-xl`, relleno `px-4 py-3`. Icono de 20px a la izquierda (Phosphor, relleno) que es lo único que lleva el color del tipo (`success-foreground`, `destructive`, `warning-foreground`, `info-foreground`; cargando, spinner neutro); título en `t-cuerpo-fuerte`; detalle opcional en `t-meta` neutro; botón de acción (Reintentar, Deshacer) como un botón primario pequeño a la derecha. Todo con clases y tokens, **sin estilos en línea**. Un solo diseño en escritorio y móvil (360px de ancho en escritorio; en móvil, a todo el ancho, de a uno y arriba). Se descartan deslizándolos.
- **Cuándo usar cada tipo**: `success` = lo que se hizo; `error` = falló el sistema (red, base de datos); `warning` = falta algo o no se puede hacer (validaciones y bloqueos, nunca en rojo); `info` = neutro (sin conexión, disponible solo en escritorio). Una anulación o eliminación que salió bien es `success`.
- **Cómo escribirlos**: el título dice qué pasó, en una frase corta y sin punto final; el detalle dice por qué o qué hacer. Nunca un título genérico («Error», «Aviso», «No permitido»). Los fallos son «No se pudo …» (`showToast.fallo('registrar el pago', error)` arma el título, traduce el motivo a palabras llanas y manda el error técnico a la consola). Las validaciones usan el verbo de la acción («Ingresa un monto válido», «Selecciona la red de cobro»); los bloqueos, «No se puede …» + el motivo.
- **Duración**: éxito 3,5 s, info 4,5 s, aviso 6,5 s, error 8 s (en móvil, menos). Dos avisos idénticos seguidos se refrescan en lugar de apilarse; un aviso con `id` se actualiza («Enviando…» → «Enviado»).

## Tablas y listas

- Encabezado de tabla: `t-etiqueta text-muted-foreground` sobre `bg-muted`, fijo al hacer scroll. Sin `text-xs` en la tabla: cada celda lleva su rol.
- Celda principal (folio, nombre): `t-fila` o `t-cuerpo-fuerte`. Dato secundario debajo: `t-meta text-muted-foreground`. Importes: `t-cuerpo-fuerte tabular-nums`.
- Filas: hover `hover:bg-muted/60`. Fila anulada: gris con opacidad, importe tachado.
- Chips de estado: siempre con el componente `EstadoBadge` (`src/components/Common/EstadoBadge.tsx`): fondo `-soft`, texto `-foreground`, solo texto (sin icono) y sin borde (el borde fino es del badge de origen; así los dos no compiten). Acepta `title` para un texto de ayuda (p. ej. Nube / Local de un comprobante). Pendiente = warning, En cocina y Listo = info, Cerrada o Pagado = success, Facturada o Facturado = special, Anulada o Anulado = destructive. Cada estado debe distinguirse a simple vista, y el chip de una fila anulada conserva su color aunque el resto de la fila se atenúe. No se escribe un chip de estado a mano ni se repite la variante `dark:`.
- Filtros: chips de filtro y opciones de popover miden `h-9 pointer-coarse:h-11`. Los chips de filtros aplicados se quitan de uno en uno.
- Estado vacío: título `t-titulo`, explicación `t-meta`, y una acción si existe una salida (p. ej. "Ver todo el historial").

## Calendario y tarjetas de reserva

- Cabecera de día: día de la semana en `t-etiqueta`, número en `t-titulo`, contadores (reservas y personas) en `t-meta` con iconos de 14px. Sin día de reservas: "LIBRE" en `t-etiqueta`.
- Hoy: cabecera con tinte `primary` (10% sobre `card`, opaco porque es fija) y texto `text-primary`; la celda de hoy usa `bg-primary/5`. Fines de semana `bg-muted/40`, hover de celda `bg-muted/60`.
- Columna de zonas: nombre en `t-cuerpo-fuerte`, cantidad de mesas en `t-meta`.
- Tarjeta de reserva: hora en `t-dato` (compacta) o `t-cuerpo-fuerte` (completa), nombre en `t-cuerpo-fuerte`, personas y mesa en `t-meta`. La tarjeta se tiñe con el color del estado (`-soft` y borde del color al 30–40%), igual que los estados de Órdenes: pendiente = warning, confirmada = success, completada = neutro (`bg-muted`), cancelada = rojo suave (`destructive-soft`), atenuada y con el nombre tachado. Además lleva punto y texto de estado. La tarjeta resaltada (seleccionada) añade un aro `primary`.
- El botón de asignar mesa mide `size-8 pointer-coarse:size-11`; los resultados de búsqueda del header `min-h-11`.
- El header del sidebar de una reserva sigue el color de su tarjeta: pendiente = naranja (`reserva`), confirmada = `success`, completada = gris, cancelada = `destructive`. Nueva reserva y registrar abono usan el naranja de reserva.
- Columnas según ancho (Clientes): en móvil solo las esenciales (cliente, contacto, acciones); facturación desde `md`, notas desde `lg`. El número de documento va bajo el nombre del cliente (no hay columna propia ni fecha de registro). Las columnas de datos cortos (acciones) usan `w-px` para ocupar solo su contenido.
- Acciones por fila: iconos `size-9 pointer-coarse:size-11` con `aria-label` que incluye el nombre del registro. Sin fondo en reposo (gris `muted-foreground`) para que no compitan entre sí ni con el contenido; al pasar el cursor, editar toma `bg-muted` y eliminar `bg-destructive-soft` con texto rojo. El registro del sistema muestra los iconos atenuados y sin respuesta.
- Paginación: un solo componente, `Paginacion` (`components/Common/Paginacion.tsx`), para Órdenes, Clientes y Centro de Ventas. Se adapta al ancho de su contenedor (container queries), no al de la pantalla: con poco espacio, flechas y "Página x de y" centrados; con espacio, también el texto "Anterior"/"Siguiente" y "Mostrando x-y de n" a la izquierda. Botones `h-9 pointer-coarse:h-11`. No crear paginadores propios ni listas de números ni "cargar más".
- Formularios de sidebar (cliente, reserva, hotel): etiqueta `t-etiqueta!` gris, campos `h-12 text-base`, pie con `bg-muted/40`.
- En móvil la barra de navegación flota sobre el contenido (y se oculta al hacer scroll). Las listas largas reservan su alto al final de la propia lista (`pb-[calc(env(safe-area-inset-bottom)+96px)]`), y el paginador va dentro del scroll, al final de la lista; desde `md` el paginador queda fijo abajo.

## Menú

- Tarjeta de producto: la misma del selector de productos de Mesas. Arriba la categoría (`t-etiqueta` con icono), el nombre en `t-titulo` con `Adicionales: N` debajo (icono y `t-meta`, sin fondo), y abajo el precio en `t-valor` a la izquierda y el check de activo (`CheckRedondo`, zona táctil de 44px) en la esquina inferior derecha. Inactivo = tarjeta atenuada con el check vacío; abierta en el sidebar = aro `primary`.
- Lista de categorías: nombre `t-cuerpo` (activa `t-cuerpo-fuerte`) y conteo `t-meta` (activa `t-dato`). En táctil las flechas de reordenar van lado a lado a 44px.
- Formulario de producto y de categoría: `ReservaHeader` en `primary` (verde de marca, como Clientes; gris si el producto está inactivo, también en vivo al desmarcar el check; sin acciones; "Producto activo" es lo primero del formulario, en su propio paper con `CheckRedondo`), etiquetas `t-etiqueta!`, campos `h-12 text-base` y pie con botón principal `h-12 flex-1` (Eliminar a la izquierda, en rojo, solo al editar).
- Lista de categorías (PC): misma columna que la de Ajustes (`w-64`, `border-r`, `p-3`): filas `rounded-xl` de al menos 44px con icono de 18px sin recuadro (relleno si está activa), nombre `t-cuerpo` (activa `t-cuerpo-fuerte` sobre `bg-muted`), chips `Plan` (info) y `1.º` (warning) y conteo a la derecha. Arriba, junto al título, un botón `outline` "Gestionar" con icono (no un icono suelto, que no se lee como botón). El título "Categorías" y las filas comparten el mismo margen izquierdo, y el separador tras "Todos" ocupa todo el ancho de la columna.
- Las tarjetas no cambian de sombra al pasar el cursor: el feedback es `active:scale-98` al tocar, y la selección es un aro `primary`. El hover con sombra no existe en el resto de la interfaz (filas y botones usan fondo `muted`).
- Formulario de producto: la etiqueta del precio dice si se ingresa con o sin IVA según el ajuste del sistema, y debajo hay un resumen "Se vende a" con el valor final (`t-valor`) y su desglose (base + IVA, o IVA incluido), calculado con la tasa que aplica al producto (general, propia o exento). El IVA "General" indica la tasa activa en el sistema.
- La hoja lateral del editor de producto no lleva borde ni sombra al lado izquierdo.

## Navegación

- El color de activo del menú lateral y del menú móvil es único para todos los módulos: el token `nav-accent` (`#C3E463`, un verde lima, en ambos temas), definido en `src/index.css` y leído a través de `src/lib/navAccent.ts`. No se asigna un color por módulo; para cambiar el acento basta con tocar ese token.
- Hoja "Categorías" (gestionar): la lista va en un paper (`rounded-2xl`, borde, `bg-card`, filas divididas) con filas de 64px: recuadro de icono de 40px, nombre en `t-fila` con chips `Plan` y `1.º`, conteo en `t-meta` y flechas de reordenar a la derecha (lado a lado a 44px en táctil). La edición usa el mismo pie que los demás formularios: Eliminar (outline rojo) y Guardar cambios a todo el ancho, ambos de 48px.

## Métricas

- Un solo acento para todo lo que se grafica: `info` (azul). El verde y el rojo quedan solo para subió/bajó (los chips de variación), así el color de un dato nunca se confunde con el de un estado.
- Tarjeta de indicador: valor en `t-cifra`, rótulo en `t-etiqueta`, descripción en `t-meta`, icono en recuadro neutro. Títulos de bloque `t-titulo` con subtítulo `t-meta`.
- Énfasis selectivo en barras: la hora pico y el día más rentable van a plena opacidad y el resto al 40%, de modo que lo importante se ve sin necesidad de rótulos en cada barra.
- Listas de ranking: nombre `t-cuerpo-fuerte`, dato secundario `t-meta`, importe `t-cuerpo-fuerte` con cifras tabulares y barra de proporción de 8px.
- Filtros (período, categorías, comparar): chips `h-8 pointer-coarse:h-11`; la X para quitar una categoría tiene área de 36px en táctil.

## Planificador

El planificador sigue la misma anatomía que el calendario de Reservas, para que los dos se lean como el mismo tipo de pantalla.

- Cuadrícula sobre `bg-muted`: columna fija de etiquetas a la izquierda (`bg-background`, 176 a 208px de ancho, borde derecho y sombra de separación), esquina superior izquierda con la navegación de fechas (anterior · mes en curso · siguiente, y "ir a hoy"; el botón del medio muestra solo el nombre del mes y abre el calendario) y una cabecera por día en `bg-card`. Celdas `bg-background` con `border-b border-r`.
- El header de la página solo lleva título, insignia "Prueba" y el botón de ayuda. La navegación de fechas no va en el header.
- Cabecera de día (fija y opaca): igual que en Reservas: día de la semana completo en `t-etiqueta` y, a su lado, el número del día en `t-valor` (una sola línea). Cuando el día es hoy, ayer o mañana, esa palabra va arriba en `t-dato`. El mes se lee en el botón de la esquina. Hoy lleva tinte `primary` con texto `text-primary` sin opacidad; el día confirmado muestra el sello verde.
- Cabecera de fila: icono de etiqueta y nombre en el color de la etiqueta (`t-cuerpo-fuerte`). Producto en la celda: tarjeta de 44px con el `-soft` de la etiqueta, borde del color y nombre `t-cuerpo-fuerte`.
- Celda vacía: `+` tenue (`/40`, `/60` al pasar el cursor). Celda abierta: aro del color de la etiqueta. Celda de un día confirmado: abre el resumen, no la selección.
- Sidebar de selección: `ReservaHeader` sólido del color de la etiqueta; filas de categoría y producto de 64px con check circular.
- Es solo PC e iPad; no hay vista móvil.
- Datos: el plan vive en Supabase (`plan_etiquetas`, `plan_celdas`, `plan_confirmaciones`; ver `supabase/migrations/20261012000200_planificador.sql`), no en RxDB, con una copia local por organización para leerlo sin internet. Los cambios se aplican al instante y se guardan en segundo plano (si falla, un aviso y se vuelve a leer lo guardado); los de otros equipos llegan en tiempo real. Las etiquetas las edita solo el administrador; cualquier miembro puede armar y firmar el menú.
- En Mesas (selector de productos): solo el menú de hoy **confirmado** se muestra. Cada etiqueta con productos hoy es una categoría más (chip con el tono de la etiqueta, también en la lista de categorías de celular) con los productos planeados, y cada producto planeado lleva sus etiquetas como chips `t-dato` con el tono de la etiqueta. No oculta ni bloquea nada: el menú normal sigue disponible.


## Centro de Ventas

### Lista de ventas (panel izquierdo)

- Cada venta es una grilla de dos columnas y tres filas alineadas, sin cuadrícula visible. Fila 1: cliente en `t-titulo` y MAYÚSCULAS (`text-secondary-foreground`) | valor en `t-titulo` (`text-destructive` y la palabra `Crédito` en `t-meta` si es a crédito pendiente; `text-success-foreground` y sin la palabra `Crédito` si la venta está completa). Fila 2: detalle en `t-meta` (mesa o referencia y comanda; `Saldo $x` si hay cobro parcial) | estado. Fila 3: `OrigenBadge` (con el icono de comentarios al lado si hay) | los tres indicadores de seguimiento.
- Estado: `EstadoBadge` (Pendiente, Pagado, Facturado, Anulado). **Completa** es la excepción: texto `t-dato text-success-foreground` con el icono de doble check (`Checks`) y **sin fondo**. Verde = bien, pero más liviano que el badge `Pagado` (que lleva fondo) y distinto del gris de las anuladas. Una venta completa no muestra indicadores: la lista solo carga con lo que requiere seguimiento.
- Indicadores de seguimiento (`IndicadoresSeguimiento`): tres círculos de 24px —cobro `$` (success), comprobante clip (info) y factura recibo (special)— con cuatro estados que se leen por forma y no solo por color: **completo** = relleno sólido y texto blanco; **parcial** = borde punteado y `-soft` naranja; **falta** = contorno `muted-foreground/70` e icono `muted-foreground` sobre blanco (contraste ≥ 3:1); **no aplica** = casi invisible. Cada uno es `role="img"` con su texto (también es lo que lee un lector de pantalla, porque la fila es un botón y no admite controles dentro) y un tooltip. Las ventas anuladas no los muestran. Las reglas viven en `src/lib/seguimientoVenta.ts` y las usan la lista, el filtro Completa/Incompleta y nadie más debe redefinirlas (ver «Seguimiento de una venta»).
- Padding vertical amplio; las filas de un día se separan con línea entrecortada y la última de cada día no lleva línea. Venta anulada: todo el contenido de la fila al 50 % de opacidad (el fondo y la barra de selección no).
- Separador de día: `t-etiqueta` gris sobre `bg-secondary`, solo con borde superior, `SÁBADO · 10 OCT 2026`, y a la derecha un indicador `t-meta` en minúsculas con una flecha fina: "Cierre" en la jornada en curso y "Historial" en las pasadas. El día es la **jornada de caja** (ver «Cierre de turno»), no el día calendario. Abierto en el panel derecho se rellena de `primary` con texto blanco.
- Con un panel de trabajo abierto (Registrar venta o cierre de turno) la lista se apaga: `grayscale` y 60 % de opacidad, salvo el separador del día activo.
- Filtros (una sola fila de chips, `FiltroChip` / `FiltroMultiple`): Origen, Directo, Crédito, **Con comentarios** (solo icono, `ChatText`), Estado (Pagado, Facturado, Anulado, Incompleta, Completa) y Fecha; sin borde inferior; la fila mide 63px. Los chips de tipo de venta llevan icono (Directo = `Money`, Crédito = `CreditCard`); los que abren un menú, solo la flecha. "Fecha" es un chip con popover: arriba los períodos como radios (Últimos 30 días —el predeterminado—, 90 días, Último año, Todo el historial) y abajo el calendario de rango; el chip muestra el período o el rango elegido y se pone en `primary` cuando no es el predeterminado. A la derecha del último chip, `FiltroLimpiarTodo`, que además devuelve el período a 30 días. Todo filtro nuevo debe entrar en `firmaFiltros` (CentroVentasV2) para que la página vuelva a la primera al cambiarlo.
- Datos: solo se piden a la base local las ventas tocadas en el período elegido (índice `_modified`); con texto en el buscador se busca en todo el historial, y al elegir un rango manda el rango. El buscador separa el texto en palabras (todas deben coincidir; se ignoran `$` y la coma decimal) sobre un índice armado una vez por venta (cliente con documento y teléfono, referencia, método, factura, comentarios, origen, tipo, estado, montos y fecha) y espera a que se termine de escribir.
- El paginador es el común (`Paginacion`); en móvil va al final de la lista.

### Seguimiento de una venta

Una sola definición (`seguimientoVenta`, `ventaCompleta`, `ventaIncompleta` en `src/lib/seguimientoVenta.ts`; el cálculo base está en `src/lib/ventaConMovimientos.ts`, sin React, y se puede probar suelto):

- **Cobro**: completo si el saldo (monto − pagado + reembolsado) es cero o a favor; parcial si hay pagos pero queda saldo; falta si no hay pagos.
- **Comprobante**: se revisa pago por pago. Cada pago que no sea en efectivo y no esté marcado `sin_comprobante` (tarjeta cobrada en caja: el voucher lo imprime el terminal) necesita el suyo. Los archivos de otros movimientos (factura, comentarios) **no** cuentan como respaldo de un pago. Sin pagos: falta. Solo efectivo o solo pagos de caja: no aplica.
- **Factura**: completa si ya se facturó y ningún pago es posterior a la última factura; parcial si ya se facturó pero entró dinero después; falta si nunca se facturó. *Limitación conocida*: sin el monto cubierto por cada factura, la fecha es la única señal; un ajuste posterior o dos movimientos con la misma marca de tiempo pueden dar «al día» de más. Mejora posible: usar `pagos_asociados` de cada factura.
- **Completa**: cobro completo, comprobante completo o no aplica, y factura completa. Una venta anulada no es completa ni incompleta.

### Panel "Registrar venta"

- Tres pasos con la etiqueta `t-etiqueta` "PASO X DE 3 · …": 1 Cliente y tipo de cobro, 2 Origen y cobro, 3 Revisión. Header fijo de 64px sin pie: a la izquierda el cliente (nombre en `t-titulo` y MAYÚSCULAS y, debajo, el documento) y a la derecha el badge Directa o Crédito y los botones estándar (Cancelar o Atrás, Continuar o Guardar con icono). Sin cliente elegido el header dice "Registrar venta"; en el paso 3 dice "Revisar información". "Continuar" se bloquea sin cliente (crédito exige cliente registrado).
- Papers `rounded-2xl` por sección con título en `t-etiqueta`; el título de una sección no repite el rótulo de su único campo. Campos y selectores `h-12 text-base`. El tipo de cobro son dos `Button` (Directa = `success`, Crédito = `destructive`, sólidos al elegirlos); las tarjetas de origen, al elegirse, toman las clases del badge de ese origen.
- Lo obligatorio se marca con `*`; al intentar avanzar, cada campo que falta se pone en rojo con su mensaje (`aria-invalid` y `t-meta text-destructive`): monto, red de cobro con tarjeta y número de comprobante con transferencia.
- Revisión: tarjetas con el rótulo en `t-etiqueta` y el dato debajo en `t-fila text-foreground`, en dos columnas cuando hay ancho; el monto en `t-valor`; botón "Editar" (`outline`) en cada tarjeta que vuelve a su paso.

### Detalle de la venta

- Header fijo de 64px: cliente (MAYÚSCULAS, `t-titulo`) y documento en `t-meta` (ambos seleccionables para copiar); a la derecha el badge Directa o Crédito y un botón de icono que despliega, debajo del header, los datos de contacto y facturación del cliente. Todo el panel va sobre `bg-background-sunken` (un escalón más oscuro que la página) para que las tarjetas resalten; la barra de acciones de abajo comparte ese fondo.
- Tarjeta de resumen: `rounded-2xl border` con el **fondo y el borde suaves del color del origen** (`ORIGEN_FONDO` / `ORIGEN_BORDE` en `OrigenBadge.tsx`; gris `bg-muted` si está anulada). Izquierda: la referencia (hasta 3 líneas, seleccionable) y debajo el origen como icono + texto en el color del origen (sin recuadro). Derecha: una pieza `Monto | Saldo` con cifras `t-valor` del mismo tamaño y etiqueta `t-etiqueta` arriba, sobre `bg-card/70`; el saldo se tiñe solo si hay algo que atender (pendiente `warning-foreground`, excedente `info-foreground` con `+`) y en cero va en `muted-foreground`. Si no caben en una fila, los importes bajan. «Anulado» (con su motivo) ocupa una fila completa de la tarjeta. La fecha de creación, «Facturado» y «Última actualización» no se repiten: están en el historial.
- Pestañas **Historial / Archivos / Comandas** (las dos últimas con contador `dato` cuando hay), sin fondo que las rodee; la activa es una píldora blanca. A la derecha, «Sincronizar» como botón `ghost` pequeño de texto con icono. Una sola separación (`gap-3`) entre la tarjeta, las pestañas y la lista.
- Historial de movimientos: las tarjetas (pago, factura…) van sin borde y con `shadow-2xs`; los ajustes y comentarios son filas planas con una columna de icono del mismo ancho (`w-9`) para que todos los títulos arranquen en la misma línea. **La fecha va siempre al inicio de la segunda línea de texto**, en cualquier tipo. A la derecha, columnas fijas: acción (Adjuntar, nube «Subido» como `EstadoBadge` info con `CloudCheck`, o «Anulado») | final (flecha del detalle o botón de anular). El motivo de un ajuste y el texto de un comentario se leen **completos**, con saltos de línea (nunca recortados con puntos suspensivos). En el detalle expandido de un movimiento: «Anular» (`ghost`) y «Eliminar» (comprobante, `destructive`), en ese orden; en pagos de tarjeta sin comprobante, «No requiere comprobante» para marcar el voucher del terminal. El diálogo de eliminar corta la propagación del clic para no abrir ni cerrar el detalle.
- Archivos: lista de filas `bg-card shadow-2xs` con el clip, el nombre descriptivo y su origen; tocar abre el archivo y la basura lo elimina. El nombre se arma con el movimiento («Pago tarjeta $25.50», «FAC 002-002-…»); el comprobante de un movimiento anulado se conserva con «(anulado)». Comandas: filas del mismo estilo; la cantidad la calcula el detalle una sola vez (`useComandasDeVenta`).
- No existe el borrado definitivo de ventas ni de comandas anuladas.
- Acciones: el footer es un menú de píldoras flotantes (sin fondo ni borde superior; `rounded-full h-11`, sombra `shadow-md`, centradas y en las filas que permita el ancho) siempre en el mismo orden: Pago (con el saldo en `t-meta`), Facturar, Reembolsar, Ajustar, Crédito, **Comentar / Adjuntar** y Anular al final. **Solo se muestran las que aplican a la venta** (sin pagos no hay Reembolsar; una venta a crédito no ofrece Crédito; una anulada no muestra la barra): los botones apagados ocupaban espacio sin servir. El icono lleva el color de la acción: Pago `primary`, Facturar `special`, Reembolsar `warning`, Ajustar `info`, Crédito `destructive`, Comentar neutro y Anular negro (`foreground`). El rojo es de crédito; el negro, de anular.
- Al elegir una acción el menú se reemplaza por su formulario en un panel `bg-card` con sombra hacia arriba y animación de 200 ms (sin animación con `motion-reduce`): icono y nombre a la izquierda y Cancelar / Confirmar a la derecha. Etiquetas `t-etiqueta!` **asociadas a su campo** (`htmlFor` + `useId`), campos `h-12 text-base`. Abajo, las opciones del pago juntas en una fila de `Casilla compacta` (`t-meta`): «No requiere comprobante» (solo con tarjeta; desactiva el adjuntar) y «Ajustar venta para evitar excedente». «Comentar / Adjuntar» admite comentario, documento o ambos (basta uno).
- `VentaDetalleAcciones` se monta con `key={venta.id}`: al cambiar de venta se reinicia toda su UI (pestaña, formulario, montos escritos).

### Cierre de turno

- **Jornada de caja**: el día del cierre no termina a medianoche sino a las **5:00 a. m.** (`src/lib/jornada.ts`, `HORA_CORTE_JORNADA`). Un cobro de la 1:00 a. m. cuenta en el turno anterior y ese turno se puede cerrar pasada la medianoche. Lo usan el cierre, la agrupación de la lista y la actividad de hoy.
- **Solo los pagos del usuario actual**: el cierre incluye únicamente los pagos y reembolsos que registró quien tiene la sesión (un movimiento guarda el id de su membresía o el de su cuenta; se aceptan ambos). Con dos cajas, cada una cierra lo suyo; lo de otra persona ni se suma ni se marca cerrado. Los cobros sin usuario registrado no se pueden cerrar desde ninguna sesión (el asistente avisa cuántos). Un chip fijo dice «Cerrando pagos de <nombre> (usuario actual)» en todos los pasos.
- El reporte se puede descargar como imagen (`Compartir imagen`: menú de compartir del sistema en tablet, PNG en PC) para enviarlo por WhatsApp.
- La página de cierre de un día abre en el historial de sus cierres. Hoy: botón "Crear cierre" en el header (deshabilitado si no hay cobros abiertos ni ventas a crédito del día; debajo se avisa por qué, con las ventas directas sin pago registrado como filas que abren su detalle). Días pasados: solo el historial, nunca se crea un cierre.
- Asistente de 4 pasos con la etiqueta "PASO X DE 4 · …" y el mismo header de 64px (Historial en el paso 1, Atrás, Continuar y, en el último, "Cerrar turno" con confirmación): 1 Cobros (orígenes del cierre como chips —cada persona cierra los suyos—, total, métodos, créditos y cobros por origen), 2 Comprobantes pendientes, 3 Facturas pendientes (filas de al menos 56px que abren la venta; sin pendientes, un aviso verde), 4 Cierre (resumen, "Cierre realizado por *" y "Novedades de caja *", ambos obligatorios). El avance se guarda como borrador de la sesión.
- Lo que se cierra son los movimientos del día por la fecha de cada pago o reembolso (y los ajustes de las ventas a crédito, como constancia del crédito), nunca ventas agrupadas por su último movimiento. Al cerrar, el cierre se guarda en Supabase (`cierres_turno`) y esos movimientos quedan marcados con `cierre_id`; el cierre siguiente empieza de cero y vuelve al historial.
- Cada cierre del historial es una tarjeta con hora, quién lo cerró, orígenes, total y desglose, y un botón "Ver reporte" que abre el reporte de caja en el mismo panel (resumen, cobros por método y origen, créditos, pendientes y novedades) con "Historial", "Imprimir ticket" e "Imprimir A4" en el header.

### Reglas comunes

- No se escriben variantes `dark:` (los tokens `-soft` y `-foreground` ya cambian con el tema).
- Filtros: un solo juego de componentes (`src/components/Common/FiltroChip.tsx`). `FiltroChip` es la píldora (reposo: tarjeta con borde; activo: relleno `primary`); `FiltroMultiple` es el chip con menú de selección múltiple; `FiltroOpcion` es la fila de un menú, con casilla `size-5` a la izquierda. Se usan en Centro de Ventas, Órdenes (popover de Filtros) y Métricas (categorías). Sin separadores entre chips. Todo grupo de filtros lleva a la derecha del último chip `FiltroLimpiarTodo` (icono X y "Limpiar todo"), visible solo cuando hay algo aplicado.
- Avisos flotantes (p. ej. servidor de impresión desconectado) se pueden cerrar con una X de 44px en táctil y no vuelven hasta que el problema se recupere y reaparezca.

## Ajustes

- Estructura: `PageFrame` con la columna de secciones a la izquierda (`w-64`, filas de 44px `rounded-2xl`; la activa `t-cuerpo-fuerte` sobre `bg-muted`, las demás `t-cuerpo` gris) y, en celular, los mismos nombres como chips de la barra de herramientas. El contenido va en una columna de `max-w-3xl`. El header muestra el usuario conectado (nombre `t-cuerpo-fuerte`, rol `t-dato` al 70 %) con sus iniciales en un recuadro de 36px `rounded-lg`.
- Cada sección es un paper (`Seccion`, `rounded-2xl`, borde y `shadow-xs`) con su cabecera —título `t-etiqueta`, descripción `t-cuerpo` y, a la derecha, la acción principal— separada del contenido por una línea. Las listas son filas (`Fila`, mínimo 64px, título `t-fila`, ayuda `t-cuerpo` gris, controles a la derecha) separadas por una línea fina; los formularios usan `Campo` (etiqueta `t-etiqueta` encima, control `h-12 text-base`, ayuda `t-meta`). Los campos de código o de dirección (token, URL, código de emparejamiento) van en `font-mono` con el mismo tamaño.
- Activo / inactivo (impresora, usuario, IVA con IVA incluido, tasa temporal): `CheckRedondo`, nunca un interruptor. Elegir varias opciones (qué tickets recibe una impresora): `Casilla`. Estados y roles: `EstadoBadge` (Activa = success, rol = info, Inactiva o Inactivo = neutral); una fila inactiva atenúa su icono con `opacity-50`, no con texto al 50 %.
- Botones: los estándar del kit, sin peso ni altura propios. Los de formulario, junto a un campo o como pie de un formulario, miden `h-12` (el principal a todo el ancho en los formularios de panel); "Eliminar" es `dangerGhost` de 48px.

## Actividad de hoy

- Panel lateral (`Sheet` a la derecha, `sm:max-w-[30rem]`) con header neutro de 72px: recuadro de icono de 40px `rounded-xl`, título `t-titulo`, fecha y hora de actualización en `t-meta`, y a la derecha "Actualizar" y "Cerrar" como botones de icono estándar (`outline`, 44px en táctil). Debajo, el control segmentado Todo / Cobros / Alertas con su contador (`t-dato`; Alertas en `warning` si hay algo que revisar).
- Cada evento es una fila de al menos 64px: recuadro de icono de 40px `rounded-xl` con el tono del evento (`-soft`), título `t-cuerpo-fuerte`, detalle y quién lo hizo en `t-meta`, la hora a la derecha en `t-meta` y una flecha si se puede abrir. Separadas por una línea fina; el estado vacío lleva el título en `t-titulo` y la explicación en `t-meta`. Sin texto con opacidad: lo secundario es `text-muted-foreground` y el icono apagado usa `opacity-50`.
- Eventos: mesa abierta, enviada a cocina, cuenta pedida, mesa cobrada, cobros sueltos, cargos a habitación, check-in y check-out, platos repartidos y, de las ventas, facturación, pagos de ventas que no son de mesa, **venta a crédito** (creada o marcada como crédito), **ajuste a la baja**, **movimiento anulado a mano**, **comentario en una venta** y **turno cerrado** (origenes y total; vive en Supabase, así que sin conexión no aparece). Son alertas, y se cuentan en el filtro Alertas: anulaciones, cortesías, reembolsos, ajustes a la baja, ventas a crédito y movimientos anulados. "Turno cerrado" cuenta como cobro.
- Tocar un evento abre lo que muestra: la mesa o la cuenta de la comanda, la habitación, la venta en Centro de Ventas o, en "Turno cerrado", el historial de cierres de hoy.

