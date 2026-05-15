import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface SecurityAlert {
  id: string;
  order_id: string;
  operator_id: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

const SEVERITY_COLORS = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const SEVERITY_LABELS = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
  critical: 'Crítico',
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  panic: 'Pánico',
  tamper: 'Manipulación',
  geofence_violation: 'Violación de geocerca',
  communication_loss: 'Pérdida de comunicación',
  custom: 'Personalizada',
};

type Tab = 'active' | 'resolved';

export function CustodyAlertsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('active');
  const [severityFilter, setSeverityFilter] = useState<SecurityAlert['severity'] | ''>('');

  const { data: activeAlerts = [], isLoading: loadingActive } = useQuery<SecurityAlert[]>({
    queryKey: ['custody-alerts', 'active'],
    queryFn: () => api.get<SecurityAlert[]>('/alerts?resolved=false'),
    refetchInterval: 15_000,
  });

  const { data: resolvedAlerts = [], isLoading: loadingResolved } = useQuery<SecurityAlert[]>({
    queryKey: ['custody-alerts', 'resolved'],
    queryFn: () => api.get<SecurityAlert[]>('/alerts?resolved=true'),
    enabled: tab === 'resolved',
  });

  const resolveMutation = useMutation({
    mutationFn: (alertId: string) => api.patch(`/alerts/${alertId}/resolve`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['custody-alerts'] });
    },
  });

  const currentAlerts =
    tab === 'active'
      ? [...activeAlerts].sort(
          (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
        )
      : resolvedAlerts;

  const filtered = severityFilter
    ? currentAlerts.filter((a) => a.severity === severityFilter)
    : currentAlerts;

  const isLoading = tab === 'active' ? loadingActive : loadingResolved;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

  const criticalCount = activeAlerts.filter((a) => a.severity === 'critical').length;
  const highCount = activeAlerts.filter((a) => a.severity === 'high').length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Alertas de seguridad</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitoreo de alertas de custodia en tiempo real.
          </p>
        </div>

        {/* Active severity summary */}
        {activeAlerts.length > 0 && (
          <div className="flex gap-2">
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                {criticalCount} crítica{criticalCount !== 1 ? 's' : ''}
              </span>
            )}
            {highCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                {highCount} alta{highCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['active', 'resolved'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSeverityFilter(''); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'active' ? `Activas (${activeAlerts.length})` : 'Resueltas'}
          </button>
        ))}
      </div>

      {/* Severity filter */}
      <div className="mb-4">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SecurityAlert['severity'] | '')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las severidades</option>
          <option value="critical">Crítico</option>
          <option value="high">Alto</option>
          <option value="medium">Medio</option>
          <option value="low">Bajo</option>
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center p-12 text-gray-400">Cargando alertas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center p-12 text-gray-400">
          {tab === 'active' ? (
            <>
              <p className="text-4xl mb-3">✓</p>
              <p className="font-medium text-gray-600">No hay alertas activas</p>
            </>
          ) : (
            <p>No hay alertas resueltas.</p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Severidad</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Descripción</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Orden</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Creada</th>
                {tab === 'resolved' && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Resuelta</th>
                )}
                {tab === 'active' && (
                  <th className="px-4 py-3" />
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((alert) => (
                <tr
                  key={alert.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    alert.severity === 'critical' ? 'bg-red-50/40' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[alert.severity]}`}>
                      {SEVERITY_LABELS[alert.severity]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[280px] truncate">
                    {alert.description ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {alert.order_id.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {fmtDate(alert.created_at)}
                  </td>
                  {tab === 'resolved' && (
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {alert.resolved_at ? fmtDate(alert.resolved_at) : '—'}
                    </td>
                  )}
                  {tab === 'active' && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => resolveMutation.mutate(alert.id)}
                        disabled={
                          resolveMutation.isPending && resolveMutation.variables === alert.id
                        }
                        className="text-sm text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                      >
                        {resolveMutation.isPending && resolveMutation.variables === alert.id
                          ? 'Resolviendo...'
                          : 'Resolver'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
