// Fecha calendario (YYYY-MM-DD) en la zona horaria del dispositivo.
// No usar toISOString().split('T')[0] para esto: devuelve la fecha en UTC y, en
// Ecuador (UTC−5), después de las 19:00 ya sería el día siguiente.
export function fechaLocal(fecha: Date | string | number = new Date()): string {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}
