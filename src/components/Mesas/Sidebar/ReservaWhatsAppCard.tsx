import { forwardRef } from 'react';
import { type Reserva } from '../../../db/database';

interface ReservaWhatsAppCardProps {
  reserva: Reserva;
  zonaNombre: string;
  comandaItems: any[];
  totalMonto: number;
  totalAbonado?: number;
  codigoReserva?: string;
}

export const ReservaWhatsAppCard = forwardRef<HTMLDivElement, ReservaWhatsAppCardProps>(
  ({ reserva, zonaNombre, comandaItems, totalMonto, totalAbonado = 0, codigoReserva = '' }, ref) => {
    const showBilling = comandaItems.length > 0 || totalAbonado > 0;
    const pendiente = Math.max(0, totalMonto - totalAbonado);

    return (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '0',
          width: '400px',
          minWidth: '400px',
          maxWidth: '400px',
          height: 'auto',
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: -9999,
          boxSizing: 'border-box',
        }}
      >
        {/* Estilos inyectados */}
        <style dangerouslySetInnerHTML={{ __html: `
          .wa-card-container, .wa-card-container * {
            box-sizing: border-box !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          }
          .wa-card-container table {
            display: table !important;
            width: 100% !important;
            border-collapse: collapse !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .wa-card-container tr {
            display: table-row !important;
            border: none !important;
            background: none !important;
          }
          .wa-card-container td {
            display: table-cell !important;
            border: none !important;
            background: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .wa-card-container td.wa-half {
            width: 50% !important;
          }
          .wa-card-container td.wa-icon-cell {
            width: 18px !important;
            padding-right: 6px !important;
            font-size: 11px !important;
            line-height: 1 !important;
            text-align: center !important;
            vertical-align: middle !important;
          }
          .wa-emoji {
            font-size: 11px !important;
            line-height: 1 !important;
            display: inline-block !important;
          }
        `}} />

        <div
          ref={ref}
          className="wa-card-container"
          style={{
            backgroundColor: 'white',
            border: '1px solid #dee2e6',
            borderRadius: '12px',
            padding: '18px',
            overflow: 'hidden',
            width: '360px',
            minWidth: '360px',
            maxWidth: '360px',
            boxSizing: 'border-box',
          }}
        >

          {/* ── Header ── */}
          <table>
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'middle', textAlign: 'left' }}>
                  <div style={{ fontWeight: 900, fontSize: '13px', letterSpacing: '0.6px', color: '#1c7ed6', lineHeight: '1.2' }}>
                    ✅ RESERVA CONFIRMADA{codigoReserva ? ` · ${codigoReserva}` : ''}
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#adb5bd', marginTop: '3px', letterSpacing: '0.3px' }}>
                    {localStorage.getItem('pos_org_name_cached') || 'Restaurante El Jardín'}
                  </div>
                </td>
                <td style={{ width: '28px', textAlign: 'right', verticalAlign: 'middle' }}>
                  <span className="wa-emoji" style={{ fontSize: '16px' }}>🍽️</span>
                </td>
              </tr>
            </tbody>
          </table>

          <hr style={{ border: 'none', borderTop: '1px dashed #dee2e6', margin: '10px 0' }} />

          {/* ── Cliente ── */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#212529', marginBottom: '1px' }}>
              {reserva.nombre || 'Sin nombre'}
            </div>
            {reserva.telefono && (
              <div style={{ fontSize: '11px', color: '#868e96' }}>
                📞 {reserva.telefono}
              </div>
            )}
          </div>

          {/* ── Info 2x2 ── */}
          <table style={{ marginBottom: '4px' }}>
            <tbody>
              <tr>
                {/* Fecha */}
                <td className="wa-half" style={{ padding: '3px 0', verticalAlign: 'middle' }}>
                  <table><tbody><tr>
                    <td className="wa-icon-cell"><span className="wa-emoji">📅</span></td>
                    <td style={{ fontSize: '11px', fontWeight: 600, color: '#495057', verticalAlign: 'middle' }}>
                      {reserva.fecha}
                    </td>
                  </tr></tbody></table>
                </td>
                {/* Hora */}
                <td className="wa-half" style={{ padding: '3px 0', verticalAlign: 'middle' }}>
                  <table><tbody><tr>
                    <td className="wa-icon-cell"><span className="wa-emoji">⏰</span></td>
                    <td style={{ fontSize: '11px', fontWeight: 600, color: '#495057', verticalAlign: 'middle' }}>
                      {reserva.hora}
                    </td>
                  </tr></tbody></table>
                </td>
              </tr>
              <tr>
                {/* Personas */}
                <td className="wa-half" style={{ padding: '3px 0', verticalAlign: 'middle' }}>
                  <table><tbody><tr>
                    <td className="wa-icon-cell"><span className="wa-emoji">👥</span></td>
                    <td style={{ fontSize: '11px', fontWeight: 600, color: '#495057', verticalAlign: 'middle' }}>
                      {reserva.personas} personas
                    </td>
                  </tr></tbody></table>
                </td>
                {/* Zona */}
                <td className="wa-half" style={{ padding: '3px 0', verticalAlign: 'middle' }}>
                  <table><tbody><tr>
                    <td className="wa-icon-cell"><span className="wa-emoji">📍</span></td>
                    <td style={{ fontSize: '11px', fontWeight: 600, color: '#495057', verticalAlign: 'middle' }}>
                      {zonaNombre || 'Sin zona'}
                    </td>
                  </tr></tbody></table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Nota */}
          {reserva.nota && (
            <div style={{ marginTop: '6px', fontSize: '10px', color: '#868e96', fontStyle: 'italic', lineHeight: '1.4' }}>
              💬 {reserva.nota}
            </div>
          )}

          {/* ── Pedido / Cuenta ── */}
          {showBilling && (
            <>
              <hr style={{ border: 'none', borderTop: '1px dashed #dee2e6', margin: '12px 0' }} />

              {comandaItems.length > 0 && (
                <>
                  {/* Título pedido */}
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#868e96', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    🧾 Pedido Anticipado
                  </div>

                  {/* Items */}
                  <table style={{ marginBottom: '10px' }}>
                    <tbody>
                      {comandaItems.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: '2px 0', fontSize: '11px', verticalAlign: 'top', textAlign: 'left' }}>
                            <span style={{ fontWeight: 800, color: '#adb5bd', marginRight: '5px' }}>{item.cantidad}×</span>
                            <span style={{ fontWeight: 600, color: '#495057' }}>{item.nombre}</span>
                          </td>
                          <td style={{ padding: '2px 0', fontSize: '11px', fontWeight: 700, color: '#343a40', textAlign: 'right', verticalAlign: 'top', width: '72px', whiteSpace: 'nowrap' }}>
                            ${(item.precio * item.cantidad).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* ── Totales ── */}
              <div style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '10px 12px', marginTop: '4px' }}>
                <table>
                  <tbody>
                    {/* Total */}
                    <tr>
                      <td style={{ fontSize: '11px', fontWeight: 700, color: '#495057', paddingBottom: totalAbonado > 0 ? '6px' : '0' }}>
                        Total
                      </td>
                      <td style={{ fontSize: totalAbonado > 0 ? '13px' : '16px', fontWeight: 900, color: totalAbonado > 0 ? '#495057' : '#2b8a3e', textAlign: 'right', paddingBottom: totalAbonado > 0 ? '6px' : '0' }}>
                        ${totalMonto.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>

                    {totalAbonado > 0 && (
                      <>
                        {/* Separador */}
                        <tr>
                          <td colSpan={2} style={{ paddingBottom: '6px' }}>
                            <div style={{ borderTop: '1px solid #dee2e6', marginTop: '0' }} />
                          </td>
                        </tr>
                        {/* Abonado */}
                        <tr>
                          <td style={{ fontSize: '11px', fontWeight: 700, color: '#2b8a3e', paddingBottom: '6px' }}>
                            ✅ Abonado
                          </td>
                          <td style={{ fontSize: '13px', fontWeight: 800, color: '#2b8a3e', textAlign: 'right', paddingBottom: '6px' }}>
                            −${totalAbonado.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                        {/* Separador */}
                        <tr>
                          <td colSpan={2} style={{ paddingBottom: '6px' }}>
                            <div style={{ borderTop: '2px solid #dee2e6', marginTop: '0' }} />
                          </td>
                        </tr>
                        {/* Pendiente */}
                        <tr>
                          <td style={{ fontSize: '12px', fontWeight: 800, color: '#e8590c' }}>
                            Saldo Pendiente
                          </td>
                          <td style={{ fontSize: '17px', fontWeight: 900, color: '#e8590c', textAlign: 'right' }}>
                            ${pendiente.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Footer ── */}
          <div style={{ marginTop: '16px', textAlign: 'center', paddingTop: '10px', borderTop: '1px solid #f1f3f5' }}>
            <span style={{ fontSize: '9px', color: '#adb5bd', fontStyle: 'italic', letterSpacing: '0.2px' }}>
              ¡Te esperamos! · Espera máxima de 15 minutos · Gracias por tu preferencia
            </span>
          </div>

        </div>
      </div>
    );
  }
);
ReservaWhatsAppCard.displayName = 'ReservaWhatsAppCard';
