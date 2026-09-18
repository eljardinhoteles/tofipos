// Plantillas de "Opciones adicionales" reutilizables entre productos —
// hardcodeadas por ahora (probando el flujo); si funciona bien se migran a
// una tabla configurable por el admin. Ignóralas libremente por producto:
// aplican solo cuando el usuario las agrega desde el botón "Sugerencias".
export type ModifierTemplate = {
  nombre: string
  obligatorio: boolean
  multi: boolean
  opciones: string[]
}

export const MODIFIER_TEMPLATES: ModifierTemplate[] = [
  { nombre: 'Papa', obligatorio: false, multi: false, opciones: ['Frita', 'Dorada', 'Puré'] },
  { nombre: 'Ensalada', obligatorio: false, multi: false, opciones: ['Fresca', 'Legumbres', 'Sin ensalada'] },
  { nombre: 'Término', obligatorio: false, multi: false, opciones: ['1/4', 'Medio', '3/4', 'Bien'] },
  { nombre: 'Bebida', obligatorio: false, multi: false, opciones: ['Con hielo', 'Sin hielo', 'Natural'] },
  { nombre: 'Azúcar', obligatorio: false, multi: false, opciones: ['Sin azúcar', 'Normal', 'Extra dulce'] },
  { nombre: 'Cocción de huevo', obligatorio: false, multi: false, opciones: ['Frito', 'Revuelto', 'Duro', 'Tibio'] },
 { nombre: 'Alcohol', obligatorio: false, multi: false, opciones: ['Con alcohol', 'Sin alcohol'] },
]
