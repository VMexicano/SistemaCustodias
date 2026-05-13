import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';

interface AdminUserRow {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  status: string;
  created_at: string;
  company_name?: string;
}

const COLUMNS: Column<AdminUserRow>[] = [
  { key: 'full_name', header: 'Nombre' },
  { key: 'phone', header: 'Teléfono' },
  {
    key: 'status',
    header: 'Estado',
    render: (r) =>
      r.status === 'active' ? (
        <Badge variant="green" label="Activo" />
      ) : (
        <Badge variant="red" label="Bloqueado" />
      ),
  },
  {
    key: 'company_name',
    header: 'Empresa',
    render: (r) => r.company_name ?? '—',
  },
  {
    key: 'created_at',
    header: 'Registro',
    render: (r) => new Date(r.created_at).toLocaleDateString('es-MX'),
  },
];

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);

  const limit = 20;
  const { data, isLoading } = useQuery<{ data: AdminUserRow[]; total: number }>({
    queryKey: ['admin-users-page', page],
    queryFn: () => api.get(`/admin/users?page=${page}&limit=${limit}`),
  });

  const users = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Usuarios</h2>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table
          columns={COLUMNS}
          data={users}
          loading={isLoading}
          emptyMessage="No hay usuarios"
          onRowClick={setSelectedUser}
        />
        <div className="px-4 py-3 border-t">
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      </div>

      <Modal
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={selectedUser?.full_name ?? 'Usuario'}
        size="md"
      >
        {selectedUser && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-gray-500 mb-1">Teléfono</p>
                <p>{selectedUser.phone}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Email</p>
                <p>{selectedUser.email ?? '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Estado</p>
                {selectedUser.status === 'active' ? (
                  <Badge variant="green" label="Activo" />
                ) : (
                  <Badge variant="red" label="Bloqueado" />
                )}
              </div>
              <div>
                <p className="text-gray-500 mb-1">Empresa</p>
                <p>{selectedUser.company_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Registro</p>
                <p>{new Date(selectedUser.created_at).toLocaleDateString('es-MX')}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">ID</p>
                <p className="font-mono text-xs">{selectedUser.id}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
