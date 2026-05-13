import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface AdminTripRow {
  id: string;
  status: string;
  passenger_name: string;
  driver_name?: string;
  trip_type_name?: string;
  origin_lat: number;
  origin_lng: number;
  origin_address: string;
  destination_lat: number;
  destination_lng: number;
  destination_address: string;
  created_at: string;
  fare_amount: number | null;
  metadata?: Record<string, unknown>;
  scheduled_for?: string | null;
}

interface TemperatureReading {
  recorded_at: string;
  celsius: number;
  sensor_id?: string;
}

interface TemperatureSummary {
  min: number;
  max: number;
  avg: number;
  out_of_range_count: number;
}

interface CustodyEvent {
  id: string;
  event_type: 'pick_up' | 'handoff' | 'delivery';
  actor_id: string;
  signature_url?: string;
  photo_url?: string;
  declared_value?: number;
  notes?: string;
  occurred_at: string;
  sequence: number;
}

type TripStatus =
  | 'REQUESTED'
  | 'SEARCHING'
  | 'ACCEPTED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'SCHEDULED';

type TripTab = 'detalle' | 'temperatura' | 'custodia';

const STATUS_BADGE: Record<string, { variant: 'green' | 'red' | 'yellow' | 'blue' | 'gray'; label: string }> = {
  COMPLETED: { variant: 'green', label: 'Completado' },
  CANCELLED: { variant: 'red', label: 'Cancelado' },
  IN_PROGRESS: { variant: 'blue', label: 'En curso' },
  SEARCHING: { variant: 'yellow', label: 'Buscando' },
  ACCEPTED: { variant: 'blue', label: 'Aceptado' },
  DRIVER_EN_ROUTE: { variant: 'blue', label: 'En camino' },
  DRIVER_ARRIVED: { variant: 'blue', label: 'Llegó' },
  SCHEDULED: { variant: 'yellow', label: 'Programado' },
  REQUESTED: { variant: 'gray', label: 'Solicitado' },
};

const CUSTODY_LABELS: Record<string, { label: string; variant: 'yellow' | 'blue' | 'green' }> = {
  pick_up: { label: 'Recogida', variant: 'yellow' },
  handoff: { label: 'Transferencia', variant: 'blue' },
  delivery: { label: 'Entrega', variant: 'green' },
};

const ALL_STATUSES: TripStatus[] = [
  'REQUESTED',
  'SEARCHING',
  'ACCEPTED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'SCHEDULED',
];

const COLUMNS: Column<AdminTripRow>[] = [
  { key: 'id', header: 'ID', render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}</span> },
  { key: 'passenger_name', header: 'Pasajero' },
  { key: 'driver_name', header: 'Conductor', render: (r) => r.driver_name ?? '—' },
  { key: 'trip_type_name', header: 'Tipo', render: (r) => r.trip_type_name ?? '—' },
  {
    key: 'status',
    header: 'Estado',
    render: (r) => {
      const s = STATUS_BADGE[r.status];
      return s ? <Badge variant={s.variant} label={s.label} /> : <Badge variant="gray" label={r.status} />;
    },
  },
  {
    key: 'created_at',
    header: 'Fecha',
    render: (r) => new Date(r.created_at).toLocaleString('es-MX'),
  },
  {
    key: 'fare_amount',
    header: 'Tarifa',
    render: (r) => (r.fare_amount != null ? `$${r.fare_amount}` : '—'),
  },
];

export function TripsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTrip, setSelectedTrip] = useState<AdminTripRow | null>(null);
  const [selectedTab, setSelectedTab] = useState<TripTab>('detalle');

  useEffect(() => {
    setSelectedTab('detalle');
  }, [selectedTrip?.id]);

  const limit = 20;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (statusFilter) params.set('status', statusFilter);

  const { data, isLoading } = useQuery<{ data: AdminTripRow[]; total: number }>({
    queryKey: ['admin-trips-page', page, statusFilter],
    queryFn: () => api.get(`/admin/trips?${params}`),
  });

  const { data: temperatureData } = useQuery<{ readings: TemperatureReading[]; summary: TemperatureSummary | null }>({
    queryKey: ['trip-temperature', selectedTrip?.id],
    queryFn: () => api.get(`/trips/${selectedTrip!.id}/temperature`),
    enabled: !!selectedTrip,
  });

  const { data: custodyData } = useQuery<{ success: boolean; data: CustodyEvent[] }>({
    queryKey: ['trip-custody', selectedTrip?.id],
    queryFn: () => api.get(`/trips/${selectedTrip!.id}/custody`),
    enabled: !!selectedTrip,
  });

  const trips = data?.data ?? [];
  const total = data?.total ?? 0;
  const tempReadings = temperatureData?.readings ?? [];
  const tempSummary = temperatureData?.summary ?? null;
  const custodyEvents = custodyData?.data ?? [];
  const showTempTab = tempReadings.length > 0;
  const showCustodyTab = custodyEvents.length > 0;

  const setpoints = selectedTrip?.metadata?.temperature_setpoints as
    | { min_celsius?: number; max_celsius?: number }
    | undefined;

  const chartData = tempReadings.map((r) => ({
    time: new Date(r.recorded_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    celsius: Number(r.celsius),
  }));

  const tabs: { key: TripTab; label: string; show: boolean }[] = [
    { key: 'detalle', label: 'Detalle', show: true },
    { key: 'temperatura', label: 'Temperatura', show: showTempTab },
    { key: 'custodia', label: 'Custodia', show: showCustodyTab },
  ];
  const visibleTabs = tabs.filter((t) => t.show);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Viajes</h2>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_BADGE[s]?.label ?? s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table
          columns={COLUMNS}
          data={trips}
          loading={isLoading}
          emptyMessage="No hay viajes"
          onRowClick={setSelectedTrip}
        />
        <div className="px-4 py-3 border-t">
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      </div>

      <Modal
        open={!!selectedTrip}
        onClose={() => setSelectedTrip(null)}
        title={`Viaje ${selectedTrip?.id.slice(0, 8) ?? ''}`}
        size="lg"
      >
        {selectedTrip && (
          <div className="space-y-4 text-sm">
            {/* Tab bar — solo si hay más de 1 tab visible */}
            {visibleTabs.length > 1 && (
              <div className="flex border-b -mt-1 mb-2">
                {visibleTabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setSelectedTab(t.key)}
                    className={`px-4 py-2 text-sm font-medium ${
                      selectedTab === t.key
                        ? 'border-b-2 border-blue-500 text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* Tab: Detalle */}
            {selectedTab === 'detalle' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-500 mb-1">Pasajero</p>
                    <p className="font-medium">{selectedTrip.passenger_name}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Estado</p>
                    {(() => {
                      const s = STATUS_BADGE[selectedTrip.status];
                      return s ? <Badge variant={s.variant} label={s.label} /> : <span>{selectedTrip.status}</span>;
                    })()}
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Origen</p>
                    <p>{selectedTrip.origin_address}</p>
                    <p className="text-xs text-gray-400">
                      {Number(selectedTrip.origin_lat).toFixed(6)}, {Number(selectedTrip.origin_lng).toFixed(6)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Destino</p>
                    <p>{selectedTrip.destination_address}</p>
                    <p className="text-xs text-gray-400">
                      {Number(selectedTrip.destination_lat).toFixed(6)},{' '}
                      {Number(selectedTrip.destination_lng).toFixed(6)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Tarifa</p>
                    <p>{selectedTrip.fare_amount != null ? `$${selectedTrip.fare_amount} MXN` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Creado</p>
                    <p>{new Date(selectedTrip.created_at).toLocaleString('es-MX')}</p>
                  </div>
                </div>

                {selectedTrip.metadata && Object.keys(selectedTrip.metadata).length > 0 && (
                  <div>
                    <p className="text-gray-500 mb-2 font-medium">Metadata</p>
                    <pre className="bg-gray-50 rounded p-3 text-xs overflow-auto max-h-40">
                      {JSON.stringify(selectedTrip.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedTrip.scheduled_for && (
                  <div>
                    <p className="text-gray-500 mb-1">Programado para</p>
                    <p>{new Date(selectedTrip.scheduled_for).toLocaleString('es-MX')}</p>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Temperatura */}
            {selectedTab === 'temperatura' && showTempTab && (
              <div className="space-y-4">
                {tempSummary && (
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-blue-50 rounded p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">Mínima</p>
                      <p className="text-lg font-semibold text-blue-700">{tempSummary.min.toFixed(1)}°C</p>
                    </div>
                    <div className="bg-orange-50 rounded p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">Máxima</p>
                      <p className="text-lg font-semibold text-orange-700">{tempSummary.max.toFixed(1)}°C</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">Promedio</p>
                      <p className="text-lg font-semibold text-gray-700">{tempSummary.avg.toFixed(1)}°C</p>
                    </div>
                    <div className={`${tempSummary.out_of_range_count > 0 ? 'bg-red-50' : 'bg-green-50'} rounded p-3 text-center`}>
                      <p className="text-xs text-gray-500 mb-1">Fuera de rango</p>
                      <p className={`text-lg font-semibold ${tempSummary.out_of_range_count > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {tempSummary.out_of_range_count}
                      </p>
                    </div>
                  </div>
                )}

                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="°C" width={45} />
                      <Tooltip formatter={(v: number) => [`${v}°C`, 'Temperatura']} />
                      <Line
                        type="monotone"
                        dataKey="celsius"
                        stroke="#3b82f6"
                        dot={false}
                        strokeWidth={2}
                      />
                      {setpoints?.min_celsius !== undefined && (
                        <ReferenceLine
                          y={setpoints.min_celsius}
                          stroke="#ef4444"
                          strokeDasharray="4 4"
                          label={{ value: `Mín ${setpoints.min_celsius}°C`, position: 'insideBottomLeft', fontSize: 10, fill: '#ef4444' }}
                        />
                      )}
                      {setpoints?.max_celsius !== undefined && (
                        <ReferenceLine
                          y={setpoints.max_celsius}
                          stroke="#ef4444"
                          strokeDasharray="4 4"
                          label={{ value: `Máx ${setpoints.max_celsius}°C`, position: 'insideTopLeft', fontSize: 10, fill: '#ef4444' }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-xs text-gray-400 text-right">
                  {tempReadings.length} lecturas · última:{' '}
                  {new Date(tempReadings[tempReadings.length - 1].recorded_at).toLocaleString('es-MX')}
                </p>
              </div>
            )}

            {/* Tab: Custodia */}
            {selectedTab === 'custodia' && showCustodyTab && (
              <div className="space-y-0">
                {custodyEvents.map((ev, idx) => {
                  const meta = CUSTODY_LABELS[ev.event_type];
                  const isLast = idx === custodyEvents.length - 1;
                  return (
                    <div key={ev.id} className="flex gap-3 items-start">
                      <div className="flex flex-col items-center pt-1">
                        <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
                        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 mt-1 min-h-[24px]" />}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={meta?.variant ?? 'gray'} label={meta?.label ?? ev.event_type} />
                          <span className="text-xs text-gray-400">#{ev.sequence}</span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {new Date(ev.occurred_at).toLocaleString('es-MX')}
                          </span>
                        </div>
                        {ev.notes && <p className="text-gray-600 mt-1 text-xs">{ev.notes}</p>}
                        {ev.declared_value != null && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Valor declarado: ${ev.declared_value} MXN
                          </p>
                        )}
                        {ev.photo_url && (
                          <a
                            href={ev.photo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-500 hover:underline mt-1 block"
                          >
                            Ver foto
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
