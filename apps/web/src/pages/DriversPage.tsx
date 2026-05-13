import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';

interface AdminDriverRow {
  id: string;
  full_name: string;
  phone?: string;
  online: boolean;
  status: string;
  created_at: string;
  pending_docs_count?: number;
}

const STATUS_BADGE: Record<string, { variant: 'green' | 'red' | 'yellow' | 'blue' | 'gray'; label: string }> = {
  active: { variant: 'green', label: 'Activo' },
  pending_review: { variant: 'yellow', label: 'Pendiente' },
  suspended: { variant: 'red', label: 'Suspendido' },
  rejected: { variant: 'red', label: 'Rechazado' },
};

const COLUMNS: Column<AdminDriverRow>[] = [
  { key: 'full_name', header: 'Nombre' },
  { key: 'phone', header: 'Teléfono', render: (r) => r.phone ?? '—' },
  {
    key: 'status',
    header: 'Estado',
    render: (r) => {
      const s = STATUS_BADGE[r.status];
      return s ? <Badge variant={s.variant} label={s.label} /> : <Badge variant="gray" label={r.status} />;
    },
  },
  {
    key: 'online',
    header: 'Online',
    render: (r) =>
      r.online ? (
        <Badge variant="green" label="Sí" />
      ) : (
        <Badge variant="gray" label="No" />
      ),
  },
  {
    key: 'created_at',
    header: 'Registro',
    render: (r) => new Date(r.created_at).toLocaleDateString('es-MX'),
  },
];

export function DriversPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<AdminDriverRow | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<AdminDriverRow | null>(null);

  const limit = 20;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (statusFilter) params.set('status', statusFilter);

  const { data, isLoading } = useQuery<{ data: AdminDriverRow[]; total: number }>({
    queryKey: ['admin-drivers-page', page, statusFilter],
    queryFn: () => api.get(`/admin/drivers?${params}`),
  });

  const suspendMutation = useMutation({
    mutationFn: (driverId: string) =>
      api.patch(`/admin/drivers/${driverId}/status`, { status: 'suspended' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-drivers-page'] });
      setSuspendTarget(null);
    },
  });

  const drivers = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Conductores</h2>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          <option value="pending_review">Pendiente revisión</option>
          <option value="active">Activos</option>
          <option value="suspended">Suspendidos</option>
          <option value="rejected">Rechazados</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table
          columns={COLUMNS}
          data={drivers}
          loading={isLoading}
          emptyMessage="No hay conductores"
          onRowClick={setSelectedDriver}
        />
        <div className="px-4 py-3 border-t">
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      </div>

      <Modal
        open={!!selectedDriver}
        onClose={() => setSelectedDriver(null)}
        title={selectedDriver?.full_name ?? 'Conductor'}
        size="md"
      >
        {selectedDriver && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-gray-500 mb-1">Teléfono</p>
                <p>{selectedDriver.phone ?? '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Estado</p>
                {(() => {
                  const s = STATUS_BADGE[selectedDriver.status];
                  return s ? <Badge variant={s.variant} label={s.label} /> : <span>{selectedDriver.status}</span>;
                })()}
              </div>
              <div>
                <p className="text-gray-500 mb-1">Online ahora</p>
                <p>{selectedDriver.online ? 'Sí' : 'No'}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Registro</p>
                <p>{new Date(selectedDriver.created_at).toLocaleDateString('es-MX')}</p>
              </div>
            </div>
            {selectedDriver.status !== 'suspended' && (
              <div className="pt-2 border-t">
                <button
                  onClick={() => {
                    setSelectedDriver(null);
                    setSuspendTarget(selectedDriver);
                  }}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-700"
                >
                  Suspender conductor
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!suspendTarget}
        title="Suspender conductor"
        message={`¿Suspender a ${suspendTarget?.full_name ?? ''}? El conductor no podrá aceptar viajes.`}
        confirmLabel="Suspender"
        danger
        onConfirm={() => suspendTarget && suspendMutation.mutate(suspendTarget.id)}
        onCancel={() => setSuspendTarget(null)}
      />
    </div>
  );
}
