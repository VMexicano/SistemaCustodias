import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { api } from '../lib/api';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  vertical_id: string;
  vertical_name?: string;
  users_count: number;
  active: boolean;
  created_at: string;
}

interface CreateCompanyForm {
  name: string;
  slug: string;
  rfc: string;
  contact_email: string;
  contact_phone: string;
}

const COLUMNS: Column<CompanyRow>[] = [
  { key: 'name', header: 'Nombre' },
  { key: 'slug', header: 'Slug', render: (r) => <span className="font-mono text-xs">{r.slug}</span> },
  {
    key: 'vertical_name',
    header: 'Vertical',
    render: (r) => r.vertical_name ? <Badge variant="blue" label={r.vertical_name} /> : '—',
  },
  { key: 'users_count', header: 'Usuarios' },
  {
    key: 'active',
    header: 'Estado',
    render: (r) =>
      r.active ? <Badge variant="green" label="Activa" /> : <Badge variant="gray" label="Inactiva" />,
  },
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function CompaniesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateCompanyForm>({
    name: '',
    slug: '',
    rfc: '',
    contact_email: '',
    contact_phone: '',
  });
  const [createError, setCreateError] = useState('');

  const limit = 20;
  const { data, isLoading } = useQuery<{ data: CompanyRow[]; total: number }>({
    queryKey: ['admin-companies', page],
    queryFn: () => api.get(`/admin/companies?page=${page}&limit=${limit}`),
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateCompanyForm) => api.post('/admin/companies', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      setShowCreate(false);
      setForm({ name: '', slug: '', rfc: '', contact_email: '', contact_phone: '' });
      setCreateError('');
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const companies = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Empresas</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
        >
          + Nueva empresa
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table
          columns={COLUMNS}
          data={companies}
          loading={isLoading}
          emptyMessage="No hay empresas"
          onRowClick={(row) => void navigate({ to: `/admin/companies/${row.id}` })}
        />
        <div className="px-4 py-3 border-t">
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nueva empresa" size="md">
        <div className="space-y-4">
          {createError && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{createError}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RFC</label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.rfc}
                onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email de contacto</label>
            <input
              type="email"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.contact_email}
              onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name || !form.slug || createMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Guardando...' : 'Crear empresa'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
