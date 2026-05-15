import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

type OrderStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  | 'ASSIGNED' | 'REASSIGNED' | 'CREW_CONFIRMED' | 'EN_ROUTE_TO_PICKUP'
  | 'AT_PICKUP' | 'PICKUP_FAILED' | 'IN_TRANSIT' | 'AT_DELIVERY'
  | 'DELIVERY_FAILED' | 'DELIVERED' | 'COMPLETED' | 'INCIDENT' | 'RESOLVED';

interface CustodyOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  custody_type_id: string;
  client_id: string;
  pickup_address: { street: string; city: string; state: string };
  delivery_address: { street: string; city: string; state: string };
  scheduled_at: string | null;
  created_at: string;
}

interface OrdersResponse {
  data: CustodyOrder[];
  total: number;
  page: number;
  limit: number;
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

const STATUS_OPTIONS: OrderStatus[] = [
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ASSIGNED', 'REASSIGNED',
  'CREW_CONFIRMED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT',
  'AT_DELIVERY', 'DELIVERED', 'COMPLETED', 'INCIDENT', 'RESOLVED',
  'REJECTED', 'CANCELLED', 'PICKUP_FAILED', 'DELIVERY_FAILED',
];

const LIMIT = 20;

export function CustodyOrdersPage() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(LIMIT));
  if (statusFilter) queryParams.set('status', statusFilter);

  const { data, isLoading, isError } = useQuery<OrdersResponse>({
    queryKey: ['custody-orders', page, statusFilter],
    queryFn: () => api.get<OrdersResponse>(`/orders?${queryParams.toString()}`),
  });

  const orders = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const filtered = search.trim()
    ? orders.filter((o) =>
        o.order_number.toLowerCase().includes(search.toLowerCase())
      )
    : orders;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Órdenes de custodia</h1>
        <span className="text-sm text-gray-500">{total} orden{total !== 1 ? 'es' : ''} en total</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as OrderStatus | ''); setPage(0); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Buscar por número de orden..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Cargando órdenes...</div>
        ) : isError ? (
          <div className="p-12 text-center text-red-500">Error al cargar órdenes.</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No hay órdenes con los filtros seleccionados.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Origen</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Destino</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Programada</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Creada</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">
                    {order.order_number}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                    {order.pickup_address.street}, {order.pickup_address.city}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                    {order.delivery_address.street}, {order.delivery_address.city}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {order.scheduled_at
                      ? new Date(order.scheduled_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(order.created_at).toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/admin/custody/orders/$id"
                      params={{ id: order.id }}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>Página {page + 1} de {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
