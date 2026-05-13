import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Link } from '@tanstack/react-router';

interface Stats {
  activeTrips: number;
  onlineDrivers: number;
  todayRevenueMXN: number;
  pendingErrors: number;
}

interface ErrorLog {
  id: string;
  errorCode: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface Trip {
  id: string;
  status: string;
  passengerName: string;
  originAddress: string;
  destinationAddress: string;
  originLat: number | null;
  originLng: number | null;
  destinations: Array<{
    sequence: number;
    lat: number;
    lng: number;
    address: string;
  }>;
  finalFare: number | null;
  createdAt: string;
}

interface AdminTripApi {
  id: string;
  status: string;
  passenger_name?: string;
  passengerName?: string;
  origin_address?: string;
  originAddress?: string;
  destination_address?: string;
  destinationAddress?: string;
  origin_lat?: number;
  originLat?: number;
  origin_lng?: number;
  originLng?: number;
  destination_lat?: number;
  destination_lng?: number;
  destinations?: Array<{
    sequence: number;
    lat: number;
    lng: number;
    address: string;
  }>;
  fare_amount?: number | null;
  finalFare?: number | null;
  created_at?: string;
  createdAt?: string;
}

interface ScheduledTripAdminRow {
  id: string;
  status: string;
  passenger_name: string;
  origin_address: string;
  destination_address: string;
  scheduled_for: string | null;
  fare_amount: number | null;
  created_at: string;
  search_started_at?: string | null;
}

function formatScheduledDate(isoString: string | null): string {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCoord(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return num.toFixed(6);
}

function mapTrip(apiTrip: AdminTripApi): Trip {
  const originLat = apiTrip.origin_lat ?? apiTrip.originLat ?? null;
  const originLng = apiTrip.origin_lng ?? apiTrip.originLng ?? null;
  const fallbackDestination = {
    sequence: 1,
    lat: apiTrip.destination_lat ?? 0,
    lng: apiTrip.destination_lng ?? 0,
    address: apiTrip.destination_address ?? apiTrip.destinationAddress ?? 'Sin destino',
  };

  return {
    id: apiTrip.id,
    status: apiTrip.status,
    passengerName: apiTrip.passenger_name ?? apiTrip.passengerName ?? 'Sin nombre',
    originAddress: apiTrip.origin_address ?? apiTrip.originAddress ?? 'Sin origen',
    destinationAddress: apiTrip.destination_address ?? apiTrip.destinationAddress ?? 'Sin destino',
    originLat: originLat !== null ? Number(originLat) : null,
    originLng: originLng !== null ? Number(originLng) : null,
    destinations: apiTrip.destinations && apiTrip.destinations.length > 0
      ? apiTrip.destinations.map(d => ({ ...d, lat: Number(d.lat), lng: Number(d.lng) }))
      : [fallbackDestination],
    finalFare: apiTrip.fare_amount ?? apiTrip.finalFare ?? null,
    createdAt: apiTrip.created_at ?? apiTrip.createdAt ?? new Date().toISOString(),
  };
}

function getDispatchBadge(row: ScheduledTripAdminRow) {
  if (row.search_started_at) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
        🔍 Buscando conductor
      </span>
    );
  }
  const dispatchAt = row.scheduled_for
    ? new Date(new Date(row.scheduled_for).getTime() - 30 * 60 * 1000).toLocaleTimeString(
        'es-MX',
        { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' },
      )
    : null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
      ⏳ {dispatchAt ? `Despacha a las ${dispatchAt}` : 'Pendiente'}
    </span>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();

  const { data: stats } = useQuery<Stats>({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats'),
    refetchInterval: 30_000,
  });

  const { data: tripsData } = useQuery<{ data: AdminTripApi[]; total: number }>({
    queryKey: ['admin-trips'],
    queryFn: () => api.get('/admin/trips?page=1&limit=10'),
    refetchInterval: 30_000,
  });

  const { data: errorsData } = useQuery<{ data: ErrorLog[] }>({
    queryKey: ['admin-errors'],
    queryFn: () => api.get('/admin/errors?resolved=false'),
    refetchInterval: 30_000,
  });

  const { data: scheduledTripsData } = useQuery<{ data: ScheduledTripAdminRow[]; total: number }>({
    queryKey: ['admin-trips-scheduled'],
    queryFn: () => api.get('/admin/trips?status=SCHEDULED&limit=50'),
    refetchInterval: 30_000,
  });

  const trips = Array.isArray(tripsData?.data) ? tripsData.data.map(mapTrip) : [];
  const errors = Array.isArray((errorsData as unknown as ErrorLog[]))
    ? (errorsData as unknown as ErrorLog[])
    : Array.isArray(errorsData?.data)
      ? errorsData.data
      : [];
  const scheduledTrips: ScheduledTripAdminRow[] = Array.isArray(scheduledTripsData?.data)
    ? scheduledTripsData.data
    : [];

  const resolveError = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/errors/${id}/resolve`, {}),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin-errors'] }).then(() =>
        queryClient.invalidateQueries({ queryKey: ['admin-stats'] }),
      ),
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Viajes activos', value: stats?.activeTrips ?? '—' },
            { label: 'Conductores online', value: stats?.onlineDrivers ?? '—' },
            {
              label: 'Ingresos hoy (MXN)',
              value: stats ? `$${stats.todayRevenueMXN.toFixed(2)}` : '—',
            },
            { label: 'Errores pendientes', value: stats?.pendingErrors ?? '—' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Viajes recientes */}
        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">Viajes recientes</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="px-6 py-3">ID</th>
                <th>Estado</th>
                <th>Pasajero</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Tarifa</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {trips.map(t => (
                <tr key={t.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono text-xs">{t.id.slice(0, 8)}...</td>
                  <td>
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs">{t.status}</span>
                  </td>
                  <td className="px-3 py-3 max-w-xs truncate">{t.passengerName}</td>
                  <td className="px-3 py-3 max-w-sm">
                    <p className="truncate">{t.originAddress}</p>
                    <p className="text-[11px] text-gray-400">
                      {formatCoord(t.originLat)}, {formatCoord(t.originLng)}
                    </p>
                  </td>
                  <td className="px-3 py-3 max-w-sm">
                    <p className="truncate">{t.destinations[0]?.address ?? t.destinationAddress}</p>
                    <p className="text-[11px] text-gray-400">
                      {t.destinations.length > 1
                        ? `${t.destinations.length} destinos`
                        : `${formatCoord(t.destinations[0]?.lat ?? null)}, ${formatCoord(t.destinations[0]?.lng ?? null)}`}
                    </p>
                  </td>
                  <td className="px-3 py-3">{t.finalFare ? `$${t.finalFare}` : '—'}</td>
                  <td className="px-3 py-3 text-gray-400">
                    {new Date(t.createdAt).toLocaleString('es-MX')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Viajes programados */}
        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">Viajes programados</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="px-6 py-3">Pasajero</th>
                <th className="px-3 py-3">Origen → Destino</th>
                <th className="px-3 py-3">Fecha programada</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Tarifa estimada</th>
                <th className="px-3 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {scheduledTrips.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-center text-gray-400 text-sm">
                    No hay viajes programados
                  </td>
                </tr>
              ) : (
                scheduledTrips.map(t => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-3">{t.passenger_name}</td>
                    <td className="px-3 py-3 max-w-sm">
                      <p className="truncate">{t.origin_address}</p>
                      <p className="text-[11px] text-gray-400 truncate">→ {t.destination_address}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatScheduledDate(t.scheduled_for)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {t.fare_amount != null ? `$${t.fare_amount}` : '—'}
                    </td>
                    <td className="px-3 py-3">{getDispatchBadge(t)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Errores operacionales */}
        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">Errores pendientes</h2>
          </div>
          {errors.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-400">Sin errores pendientes</p>
          ) : (
            <div className="divide-y">
              {errors.map(err => (
                <div key={err.id} className="px-6 py-4 flex justify-between items-start">
                  <div>
                    <p className="font-mono text-sm font-semibold">{err.errorCode}</p>
                    <p className="text-sm text-gray-600 mt-1">{err.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(err.createdAt).toLocaleString('es-MX')}
                    </p>
                  </div>
                  <button
                    onClick={() => resolveError.mutate(err.id)}
                    disabled={resolveError.isPending}
                    className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded hover:bg-green-200 disabled:opacity-50"
                  >
                    Resolver
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick links */}
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/trips" className="text-sm text-blue-600 hover:underline">Ver todos los viajes →</Link>
          <Link to="/admin/drivers" className="text-sm text-blue-600 hover:underline">Ver conductores →</Link>
          <Link to="/admin/companies" className="text-sm text-blue-600 hover:underline">Ver empresas →</Link>
        </div>
    </div>
  );
}
