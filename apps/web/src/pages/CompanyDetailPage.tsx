import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from '@tanstack/react-router';
import { api } from '../lib/api';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Table } from '../components/ui/Table';

interface Company {
  id: string;
  name: string;
  slug: string;
  rfc?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  active: boolean;
}

interface CompanyUser {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  role: string;
  created_at: string;
}

interface Configuration {
  id: string;
  namespace: string;
  key: string;
  value: unknown;
}

type Tab = 'info' | 'users' | 'configs';

export function CompanyDetailPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const companyId = params.id ?? '';
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('info');

  // Users tab state
  const [showLinkUser, setShowLinkUser] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [foundUser, setFoundUser] = useState<{ id: string; full_name: string; phone: string } | null>(null);
  const [selectedRole, setSelectedRole] = useState('member');
  const [linkError, setLinkError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<CompanyUser | null>(null);

  // Config tab state
  const [showAddConfig, setShowAddConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ namespace: '', key: '', value: '' });
  const [configError, setConfigError] = useState('');
  const [deleteConfigTarget, setDeleteConfigTarget] = useState<Configuration | null>(null);

  const { data: company, isLoading: loadingCompany } = useQuery<Company>({
    queryKey: ['company', companyId],
    queryFn: () => api.get(`/admin/companies/${companyId}`),
    enabled: !!companyId,
  });

  const { data: usersData } = useQuery<{ data: CompanyUser[] }>({
    queryKey: ['company-users', companyId],
    queryFn: () => api.get(`/admin/companies/${companyId}/users`),
    enabled: !!companyId && tab === 'users',
  });

  const { data: configsData, refetch: refetchConfigs } = useQuery<Record<string, Record<string, unknown>>>({
    queryKey: ['company-configs', companyId],
    queryFn: () => api.get(`/config/entity/company/${companyId}`),
    enabled: !!companyId && tab === 'configs',
  });

  const searchUserMutation = useMutation({
    mutationFn: (phone: string) =>
      api.get<{ data: Array<{ id: string; full_name: string; phone: string }> }>(
        `/admin/users/search?phone=${encodeURIComponent(phone)}`,
      ),
    onSuccess: (res) => {
      const users = (res as { data: Array<{ id: string; full_name: string; phone: string }> }).data;
      setFoundUser(users[0] ?? null);
      if (!users[0]) setLinkError('Usuario no encontrado con ese teléfono');
      else setLinkError('');
    },
    onError: (err: Error) => setLinkError(err.message),
  });

  const linkUserMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.post(`/admin/companies/${companyId}/users`, { user_id: userId, role }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company-users', companyId] });
      setShowLinkUser(false);
      setFoundUser(null);
      setPhoneSearch('');
    },
    onError: (err: Error) => setLinkError(err.message),
  });

  const removeUserMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/admin/companies/${companyId}/users/${userId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company-users', companyId] });
      setRemoveTarget(null);
    },
  });

  const addConfigMutation = useMutation({
    mutationFn: ({ namespace, key, value }: { namespace: string; key: string; value: unknown }) =>
      api.put(`/config/entity/company/${companyId}/${namespace}/${key}`, { value }),
    onSuccess: () => {
      void refetchConfigs();
      setShowAddConfig(false);
      setConfigForm({ namespace: '', key: '', value: '' });
      setConfigError('');
    },
    onError: (err: Error) => setConfigError(err.message),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: ({ namespace, key }: { namespace: string; key: string }) =>
      api.delete(`/config/entity/company/${companyId}/${namespace}/${key}`),
    onSuccess: () => {
      void refetchConfigs();
      setDeleteConfigTarget(null);
    },
  });

  const companyUsers = usersData?.data ?? [];

  // Flatten configs into list
  const configsList: Configuration[] = configsData
    ? Object.entries(configsData).flatMap(([ns, keys]) =>
        Object.entries(keys).map(([k, v]) => ({ id: `${ns}:${k}`, namespace: ns, key: k, value: v })),
      )
    : [];

  if (loadingCompany) {
    return <div className="animate-pulse h-8 bg-gray-100 rounded w-48" />;
  }

  if (!company) {
    return <p className="text-gray-500">Empresa no encontrada</p>;
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/admin/companies" className="hover:text-blue-600">
          Empresas
        </Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{company.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-800">{company.name}</h2>
          {company.active ? (
            <Badge variant="green" label="Activa" />
          ) : (
            <Badge variant="gray" label="Inactiva" />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-4">
        {(['info', 'users', 'configs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'info' ? 'Información' : t === 'users' ? 'Usuarios' : 'Configuraciones'}
          </button>
        ))}
      </div>

      {/* Tab: Información */}
      {tab === 'info' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Slug</p>
              <p className="font-mono">{company.slug}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">RFC</p>
              <p>{company.rfc ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Email</p>
              <p>{company.contact_email ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Teléfono</p>
              <p>{company.contact_phone ?? '—'}</p>
            </div>
            {company.address && (
              <div className="col-span-2">
                <p className="text-gray-500 mb-1">Dirección</p>
                <p>{company.address}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Usuarios */}
      {tab === 'users' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b flex justify-between items-center">
            <h3 className="font-medium text-sm">Usuarios vinculados</h3>
            <button
              onClick={() => setShowLinkUser(true)}
              className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              + Vincular usuario
            </button>
          </div>
          <Table
            columns={[
              { key: 'full_name', header: 'Nombre' },
              { key: 'phone', header: 'Teléfono' },
              {
                key: 'role',
                header: 'Rol',
                render: (r) => <Badge variant="blue" label={r.role} />,
              },
              {
                key: 'created_at',
                header: 'Vinculado',
                render: (r) => new Date(r.created_at).toLocaleDateString('es-MX'),
              },
              {
                key: 'id',
                header: '',
                render: (r) => (
                  <button
                    onClick={(e) => { e.stopPropagation(); setRemoveTarget(r); }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Quitar
                  </button>
                ),
              },
            ]}
            data={companyUsers}
            emptyMessage="Sin usuarios vinculados"
          />
        </div>
      )}

      {/* Tab: Configuraciones */}
      {tab === 'configs' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b flex justify-between items-center">
            <h3 className="font-medium text-sm">Configuraciones</h3>
            <button
              onClick={() => setShowAddConfig(true)}
              className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              + Agregar config
            </button>
          </div>
          <Table
            columns={[
              { key: 'namespace', header: 'Namespace', render: (r) => <span className="font-mono text-xs">{r.namespace}</span> },
              { key: 'key', header: 'Clave', render: (r) => <span className="font-mono text-xs">{r.key}</span> },
              {
                key: 'value',
                header: 'Valor',
                render: (r) => (
                  <span className="font-mono text-xs text-gray-600 max-w-xs truncate block">
                    {JSON.stringify(r.value)}
                  </span>
                ),
              },
              {
                key: 'id',
                header: '',
                render: (r) => (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfigTarget(r); }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Borrar
                  </button>
                ),
              },
            ]}
            data={configsList}
            emptyMessage="Sin configuraciones"
          />
        </div>
      )}

      {/* Modal: vincular usuario */}
      <Modal open={showLinkUser} onClose={() => { setShowLinkUser(false); setFoundUser(null); setLinkError(''); }} title="Vincular usuario" size="sm">
        <div className="space-y-3">
          {linkError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{linkError}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar por teléfono</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+52..."
                value={phoneSearch}
                onChange={(e) => setPhoneSearch(e.target.value)}
              />
              <button
                onClick={() => searchUserMutation.mutate(phoneSearch)}
                disabled={!phoneSearch || searchUserMutation.isPending}
                className="px-3 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                Buscar
              </button>
            </div>
          </div>
          {foundUser && (
            <div className="bg-green-50 rounded p-3 text-sm">
              <p className="font-medium">{foundUser.full_name}</p>
              <p className="text-gray-500">{foundUser.phone}</p>
            </div>
          )}
          {foundUser && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none"
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </div>
          )}
          {foundUser && (
            <div className="flex justify-end">
              <button
                onClick={() => linkUserMutation.mutate({ userId: foundUser.id, role: selectedRole })}
                disabled={linkUserMutation.isPending}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {linkUserMutation.isPending ? 'Vinculando...' : 'Vincular'}
              </button>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        title="Quitar usuario"
        message={`¿Quitar a ${removeTarget?.full_name ?? ''} de la empresa?`}
        confirmLabel="Quitar"
        danger
        onConfirm={() => removeTarget && removeUserMutation.mutate(removeTarget.user_id)}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* Modal: agregar config */}
      <Modal open={showAddConfig} onClose={() => { setShowAddConfig(false); setConfigError(''); }} title="Agregar configuración" size="sm">
        <div className="space-y-3">
          {configError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{configError}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Namespace</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={configForm.namespace}
              onChange={(e) => setConfigForm((f) => ({ ...f, namespace: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clave</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={configForm.key}
              onChange={(e) => setConfigForm((f) => ({ ...f, key: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor (JSON)</label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              value={configForm.value}
              onChange={(e) => setConfigForm((f) => ({ ...f, value: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAddConfig(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={() => {
                let parsed: unknown;
                try { parsed = JSON.parse(configForm.value || 'null'); } catch { setConfigError('Valor inválido: debe ser JSON'); return; }
                addConfigMutation.mutate({ namespace: configForm.namespace, key: configForm.key, value: parsed });
              }}
              disabled={!configForm.namespace || !configForm.key || addConfigMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfigTarget}
        title="Borrar configuración"
        message={`¿Borrar "${deleteConfigTarget?.namespace}.${deleteConfigTarget?.key}"?`}
        confirmLabel="Borrar"
        danger
        onConfirm={() =>
          deleteConfigTarget &&
          deleteConfigMutation.mutate({ namespace: deleteConfigTarget.namespace, key: deleteConfigTarget.key })
        }
        onCancel={() => setDeleteConfigTarget(null)}
      />
    </div>
  );
}
