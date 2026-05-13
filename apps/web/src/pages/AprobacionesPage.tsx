import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usePendingApprovals } from '../hooks/usePendingApprovals';
import { Table, Column } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import type { PendingApprovalTrip } from '../hooks/usePendingApprovals';

const LIMIT = 20;

export function AprobacionesPage() {
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<PendingApprovalTrip | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const offset = (page - 1) * LIMIT;
  const { data, total, isLoading } = usePendingApprovals(LIMIT, offset);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
  }

  async function handleApprove(trip: PendingApprovalTrip) {
    setActionLoading(trip.id);
    try {
      await api.post(`/trips/${trip.id}/approve`, {});
      invalidate();
    } finally {
      setActionLoading(null);
    }
  }

  function openReject(trip: PendingApprovalTrip) {
    setRejectTarget(trip);
    setRejectReason('');
  }

  async function handleRejectConfirm() {
    if (!rejectTarget) return;
    setActionLoading(rejectTarget.id);
    try {
      await api.post(`/trips/${rejectTarget.id}/reject`, { reason: rejectReason });
      setRejectTarget(null);
      invalidate();
    } finally {
      setActionLoading(null);
    }
  }

  const COLUMNS: Column<PendingApprovalTrip>[] = [
    {
      key: 'origin_address',
      header: 'Origen',
      render: (r) => (
        <span className="text-sm text-gray-700 line-clamp-1">{r.origin_address}</span>
      ),
    },
    {
      key: 'destination_address',
      header: 'Destino',
      render: (r) => (
        <span className="text-sm text-gray-700 line-clamp-1">{r.destination_address}</span>
      ),
    },
    {
      key: 'passenger_phone',
      header: 'Cliente',
      render: (r) => <span className="font-mono text-sm">{r.passenger_phone}</span>,
    },
    {
      key: 'wait_minutes',
      header: 'Espera',
      render: (r) => <span className="text-sm">{r.wait_minutes} min</span>,
    },
    {
      key: 'id',
      header: 'Acciones',
      render: (r) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleApprove(r);
            }}
            disabled={actionLoading === r.id}
            className="px-3 py-1 text-xs font-medium rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {actionLoading === r.id ? '...' : 'Aprobar'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openReject(r);
            }}
            disabled={actionLoading === r.id}
            className="px-3 py-1 text-xs font-medium rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Rechazar
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Aprobaciones pendientes</h2>
        {total > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            {total} pendiente{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table
          columns={COLUMNS}
          data={data}
          loading={isLoading}
          emptyMessage="No hay solicitudes pendientes"
        />
        {total > LIMIT && (
          <div className="px-4 py-3 border-t">
            <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Rechazar solicitud</h3>
            <p className="text-sm text-gray-600">
              Viaje de <span className="font-medium">{rejectTarget.passenger_phone}</span>
              {' '}desde{' '}
              <span className="font-medium">{rejectTarget.origin_address}</span>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motivo del rechazo <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Indica el motivo..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleRejectConfirm()}
                disabled={!rejectReason.trim() || actionLoading === rejectTarget.id}
                className="px-4 py-2 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {actionLoading === rejectTarget.id ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
