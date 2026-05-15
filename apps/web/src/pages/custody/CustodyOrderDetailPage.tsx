import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

type OrderStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  | 'ASSIGNED' | 'REASSIGNED' | 'CREW_CONFIRMED' | 'EN_ROUTE_TO_PICKUP'
  | 'AT_PICKUP' | 'PICKUP_FAILED' | 'IN_TRANSIT' | 'AT_DELIVERY'
  | 'DELIVERY_FAILED' | 'DELIVERED' | 'COMPLETED' | 'INCIDENT' | 'RESOLVED';

interface Address {
  street: string;
  city: string;
  state: string;
  zip?: string;
  reference?: string;
}

interface CustodyOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  custody_type_id: string;
  client_id: string;
  custodio_id: string | null;
  copiloto_id: string | null;
  pickup_address: Address;
  delivery_address: Address;
  scheduled_at: string | null;
  notes: string | null;
  rejected_reason: string | null;
  pricing_snapshot: {
    total_mxn: number;
    base_price_mxn: number;
    per_km_price_mxn: number;
    distance_km: number;
    iva_mxn: number;
  } | null;
  custody_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface OrderTransition {
  id: string;
  from_status: string;
  to_status: string;
  actor_id: string;
  actor_role: string;
  notes: string | null;
  digital_signature: string | null;
  created_at: string;
}

interface SecurityAlert {
  id: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string | null;
  resolved_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_APPROVAL: 'Pendiente aprobación',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
  ASSIGNED: 'Asignada',
  REASSIGNED: 'Reasignada',
  CREW_CONFIRMED: 'Tripulación confirmada',
  EN_ROUTE_TO_PICKUP: 'En ruta a recolección',
  AT_PICKUP: 'En punto de recolección',
  PICKUP_FAILED: 'Recolección fallida',
  IN_TRANSIT: 'En tránsito',
  AT_DELIVERY: 'En punto de entrega',
  DELIVERY_FAILED: 'Entrega fallida',
  DELIVERED: 'Entregada',
  COMPLETED: 'Completada',
  INCIDENT: 'Incidente',
  RESOLVED: 'Resuelta',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
  ASSIGNED: 'bg-indigo-100 text-indigo-800',
  REASSIGNED: 'bg-indigo-100 text-indigo-800',
  CREW_CONFIRMED: 'bg-indigo-100 text-indigo-800',
  EN_ROUTE_TO_PICKUP: 'bg-cyan-100 text-cyan-800',
  AT_PICKUP: 'bg-cyan-100 text-cyan-800',
  PICKUP_FAILED: 'bg-red-100 text-red-700',
  IN_TRANSIT: 'bg-orange-100 text-orange-800',
  AT_DELIVERY: 'bg-orange-100 text-orange-800',
  DELIVERY_FAILED: 'bg-red-100 text-red-700',
  DELIVERED: 'bg-teal-100 text-teal-800',
  COMPLETED: 'bg-green-100 text-green-800',
  INCIDENT: 'bg-red-100 text-red-800',
  RESOLVED: 'bg-green-100 text-green-800',
};

const SEVERITY_COLORS = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  panic: 'Pánico',
  tamper: 'Manipulación',
  geofence_violation: 'Violación de geocerca',
  communication_loss: 'Pérdida de comunicación',
  custom: 'Personalizada',
};

export function CustodyOrderDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);

  const { data: order, isLoading, isError } = useQuery<CustodyOrder>({
    queryKey: ['custody-order', id],
    queryFn: () => api.get<CustodyOrder>(`/orders/${id}`),
  });

  const { data: transitions = [] } = useQuery<OrderTransition[]>({
    queryKey: ['custody-order-transitions', id],
    queryFn: () => api.get<OrderTransition[]>(`/orders/${id}/transitions`),
    enabled: !!order,
  });

  const { data: alerts = [] } = useQuery<SecurityAlert[]>({
    queryKey: ['custody-order-alerts', id],
    queryFn: () => api.get<SecurityAlert[]>(`/orders/${id}/alerts`),
    enabled: !!order,
  });

  const approveMutation = useMutation({
    mutationFn: () => api.patch(`/orders/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custody-order', id] }),
  });

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const rejectMutation = useMutation({
    mutationFn: (reason: string) => api.patch(`/orders/${id}/reject`, { reason }),
    onSuccess: () => {
      setShowRejectModal(false);
      setRejectReason('');
      void qc.invalidateQueries({ queryKey: ['custody-order', id] });
    },
  });

  async function downloadPdf() {
    setDownloading(true);
    try {
      const blob = await api.getBlob(`/orders/${id}/chain-of-custody/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cadena-custodia-${order?.order_number ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading) {
    return <div className="p-6 text-gray-400">Cargando orden...</div>;
  }

  if (isError || !order) {
    return <div className="p-6 text-red-500">No se pudo cargar la orden.</div>;
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

  const fmtAddress = (a: Address) =>
    `${a.street}, ${a.city}, ${a.state}${a.zip ? ` CP ${a.zip}` : ''}`;

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/admin/custody/orders"
            className="text-gray-400 hover:text-gray-600 text-lg"
          >
            ←
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 font-mono">
              {order.order_number}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Creada el {fmtDate(order.created_at)}
            </p>
          </div>
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
        </div>

        <div className="flex gap-2">
          {order.status === 'PENDING_APPROVAL' && (
            <>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {approveMutation.isPending ? 'Aprobando...' : 'Aprobar'}
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Rechazar
              </button>
            </>
          )}
          <button
            onClick={() => void downloadPdf()}
            disabled={downloading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {downloading ? 'Descargando...' : '↓ PDF cadena de custodia'}
          </button>
        </div>
      </div>

      {/* Rejection reason */}
      {order.rejected_reason && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <strong>Motivo de rechazo:</strong> {order.rejected_reason}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Addresses */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Ruta</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Origen</p>
              <p className="text-sm text-gray-800">{fmtAddress(order.pickup_address)}</p>
              {order.pickup_address.reference && (
                <p className="text-xs text-gray-500 mt-0.5">Ref: {order.pickup_address.reference}</p>
              )}
            </div>
            <div className="border-t pt-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Destino</p>
              <p className="text-sm text-gray-800">{fmtAddress(order.delivery_address)}</p>
              {order.delivery_address.reference && (
                <p className="text-xs text-gray-500 mt-0.5">Ref: {order.delivery_address.reference}</p>
              )}
            </div>
          </div>
        </div>

        {/* Pricing snapshot */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Pricing</h2>
          {order.pricing_snapshot ? (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Precio base</span>
                <span>${order.pricing_snapshot.base_price_mxn.toFixed(2)} MXN</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Distancia</span>
                <span>{order.pricing_snapshot.distance_km} km × ${order.pricing_snapshot.per_km_price_mxn}/km</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>IVA (16%)</span>
                <span>${order.pricing_snapshot.iva_mxn.toFixed(2)} MXN</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900 border-t pt-1 mt-1">
                <span>Total</span>
                <span>${order.pricing_snapshot.total_mxn.toFixed(2)} MXN</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin pricing aún (se genera al aprobar)</p>
          )}
        </div>

        {/* Team */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Equipo asignado</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Custodio</span>
              <span className="text-gray-800 font-mono text-xs">{order.custodio_id ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Copiloto</span>
              <span className="text-gray-800 font-mono text-xs">{order.copiloto_id ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* Notes & schedule */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Detalles</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Programada para</span>
              <span className="text-gray-800">
                {order.scheduled_at
                  ? fmtDate(order.scheduled_at)
                  : '—'}
              </span>
            </div>
            {order.notes && (
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-400 mb-1">Notas</p>
                <p className="text-gray-700">{order.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transitions timeline */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Historial de transiciones ({transitions.length})
        </h2>
        {transitions.length === 0 ? (
          <p className="text-sm text-gray-400">Sin transiciones registradas.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
            <div className="space-y-4">
              {transitions.map((t) => (
                <div key={t.id} className="flex gap-4 pl-10 relative">
                  <div className="absolute left-3 top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white ring-1 ring-blue-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                        {t.from_status || '—'}
                      </span>
                      <span className="text-gray-400 text-xs">→</span>
                      <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                        {t.to_status}
                      </span>
                      {t.digital_signature && (
                        <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                          ✓ Firmado
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      <span>{t.actor_role}</span>
                      <span>•</span>
                      <span>{fmtDate(t.created_at)}</span>
                    </div>
                    {t.notes && (
                      <p className="text-xs text-gray-600 mt-1 italic">{t.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Alertas de seguridad ({alerts.length})
          </h2>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium mt-0.5 ${SEVERITY_COLORS[alert.severity]}`}>
                  {alert.severity}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type}
                  </p>
                  {alert.description && (
                    <p className="text-xs text-gray-600 mt-0.5">{alert.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{fmtDate(alert.created_at)}</p>
                </div>
                {alert.resolved_at ? (
                  <span className="text-xs text-green-600 font-medium mt-0.5">Resuelta</span>
                ) : (
                  <span className="text-xs text-red-600 font-medium mt-0.5">Activa</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Rechazar orden</h2>
            <p className="text-sm text-gray-600 mb-4">
              Indica el motivo del rechazo (mínimo 10 caracteres).
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              rows={4}
              placeholder="Describe el motivo del rechazo..."
            />
            {rejectMutation.isError && (
              <p className="text-sm text-red-500 mt-2">
                {(rejectMutation.error as Error).message}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => rejectMutation.mutate(rejectReason)}
                disabled={rejectReason.length < 10 || rejectMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rechazando...' : 'Rechazar orden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
