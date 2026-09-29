// Versión del sistema, para verificar que todos los dispositivos tienen la
// misma. El número viene de package.json ("version", se sube a mano en cada
// actualización); commit y fecha se generan solos en cada build.
export const APP_VERSION = __APP_VERSION__
export const APP_COMMIT = __APP_COMMIT__
export const APP_BUILD_DATE = __APP_BUILD_DATE__

export function appVersionLabel() {
  return `v${APP_VERSION} · ${APP_COMMIT}`
}

export function appBuildDateLabel() {
  return new Date(APP_BUILD_DATE).toLocaleString('es', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
