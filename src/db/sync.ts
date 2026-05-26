let appOnline = true
let syncRetryActive = false

export function isAppOnline() {
  return appOnline
}

export function isSyncRetryActive() {
  return syncRetryActive
}

export async function probarConexionSupabase() {
  return navigator.onLine
}

export async function syncPendientes() {
  return
}

export async function sincronizarDatosOrganizacion() {
  return
}

export async function iniciarSync() {
  appOnline = navigator.onLine
}

export async function detenerSync() {
  syncRetryActive = false
}

export async function getPendingSyncSummary() {
  return {
    total: 0,
    byTable: {} as Record<string, number>,
  }
}

export async function publicarCuentaHabitacion() {
  return
}

export async function publicarReserva() {
  return
}

export async function publicarMesa() {
  return
}

export async function syncComanda() {
  return
}

export async function registrarBorrado() {
  return
}

export async function procesarBorradosPendientes() {
  return
}

export function setAppOnlineState(val: boolean) {
  appOnline = val
}

export function setSyncRetryState(val: boolean) {
  syncRetryActive = val
}
