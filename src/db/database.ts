import type {
  RxMesa as Mesa,
  RxPiso as Piso,
  RxCategoria as Categoria,
  RxHabitacionCuenta as HabitacionCuenta,
  RxMenuItem as MenuItem,
  RxComandaItem as ComandaItem,
  RxReserva as Reserva,
  RxCliente as Cliente,
  RxComanda as Comanda,
  RxPago as Pago,
  RxAjusteIva as AjustesIVA,
  RxUsuario as UsuarioLocal,
} from './rxdb'
export type {
  Mesa,
  Piso,
  Categoria,
  HabitacionCuenta,
  MenuItem,
  ComandaItem,
  Reserva,
  Cliente,
  Comanda,
  Pago,
  AjustesIVA,
  UsuarioLocal,
}
export type ModifierGroup = {
  id: string
  nombre: string
  obligatorio: boolean
  multi: boolean
  opciones: string[]
}
export type ComandaItemDelete = {
  id: string
  comanda_id: string
  item_id: string
  deleted_at: string
  organization_id: string
  sync_pending?: boolean
}
export type BorradoPendiente = {
  id: string
  tabla: string
  registro_id: string
  organization_id: string
}

export { setSuspendHooks, initVerticalRxDb } from './rxdb'
