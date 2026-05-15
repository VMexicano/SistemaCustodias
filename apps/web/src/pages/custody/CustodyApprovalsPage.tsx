import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface Address {
  street: string;
  city: string;
  state: string;
}

interface PendingOrder {
  id: string;
  order_number: string;
  status: string;
  client_id: string;
  custody_type_id: string;
  pickup_address: Address;
  delivery_address: Address;
  scheduled_at: string | null;
  notes: string | null;
  created_at: string;
}

interface OrdersResponse {
  data: PendingOrder[];
  total: number;
}

export function CustodyApprovalsPage() {
  const qc = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading, isError } = useQuery<OrdersResponse>({
    queryKey: ['custody-pending-approvals'],
    queryFn: () =>
      api.get<OrdersResponse>('/orders?status=PENDING_APPROVAL&limit=50'),
    refetchInterval: 30_000,
  });

  const orders = data?.data ?? [];

  const approveMutation = useMutation({
    mutationFn: (orderId: string) => api.patch(`/orders/${orderId}/approve`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['custody-pending-approvals'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      api.patch(`/orders/${orderId}/reject`, { reason }),
    onSuccess: () => {
      setRejectingId(null);
      setRejectReason('');
      void qc.invalidateQueries({ queryKey: ['custody-pending-approvals'] });
    },
  });

  function openReject(orderId: string) {
    setRejectingId(orderId);
    setRejectReason('');
  }

  function closeReject() {
    setRejectingId(null);
    setRejectReason('');
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Aprobaciones de custodia
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Órdenes en estado PENDING_APPROVAL esperando revisión del supervisor.
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
          {orders.length} pendiente{orders.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="text-center p-12 text-gray-400">Cargando solicitudes...</div>
      ) : isError ? (
        <div className="text-center p-12 text-red-500">Error al cargar solicitudes.</div>
      ) : orders.length === 0 ? (
        <div className="text-center p-12 text-gray-400">
          <p className="text-4xl mb-3">✓</p>
          <p className="font-medium text-gray-600">No hay órdenes pendientes de aprobación</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-6"
            >
              {/* Order info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <Link
                    to="/admin/custody/orders/$id"
                    params={{ id: order.id }}
                    className="font-mono font-semibold text-blue-700 hover:underline"
                  >
                    {order.order_number}
                  </Link>
                  <span className="text-xs text-gray-400">
                    Solicitada el {fmtDate(order.created_at)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">Origen</span>
                    <p className="text-gray-700 truncate">
                      {order.pickup_address.street}, {order.pickup_address.city}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">Destino</span>
                    <p className="text-gray-700 truncate">
                      {order.delivery_address.street}, {order.delivery_address.city}
                    </p>
                  </div>
                  {order.scheduled_at && (
                    <div className="col-span-2 mt-1">
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Programada para</span>
                      <p className="text-gray-700">{fmtDate(order.scheduled_at)}</p>
                    </div>
                  )}
                  {order.notes && (
                    <div className="col-span-2 mt-1">
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Notas</span>
                      <p className="text-gray-600 italic text-xs">{order.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => approveMutation.mutate(order.id)}
                  disabled={approveMutation.isPending && approveMutation.variables === order.id}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {approveMutation.isPending && approveMutation.variables === order.id
                    ? 'Aprobando...'
                    : 'Aprobar'}
                </button>
                <button
                  onClick={() => openReject(order.id)}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Rechazar orden</h2>
            <p className="text-sm text-gray-600 mb-4">
              Escribe el motivo del rechazo (mínimo 10 caracteres).
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              placeholder="Describe el motivo del rechazo..."
            />
            {rejectMutation.isError && (
              <p className="text-sm text-red-500 mt-2">
                {(rejectMutation.error as Error).message}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={closeReject}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  rejectMutation.mutate({ orderId: rejectingId, reason: rejectReason })
                }
                disabled={rejectReason.length < 10 || rejectMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
