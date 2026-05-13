import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';

interface Factor {
  id: string;
  code: string;
  name: string;
  type: string;
  value: number;
  active: boolean;
}

interface Commission {
  id: string;
  regionId: string;
  platformFeePct: number;
  active: boolean;
}

interface TripType {
  id: string;
  code: string;
  name: string;
  description: string;
  baseFare: number;
  costPerKm: number;
  costPerMin: number;
  minFare: number;
  serviceMode: string;
  active: boolean;
}

export function ConfigPage() {
  const queryClient = useQueryClient();

  const { data: factorsData } = useQuery<Factor[]>({
    queryKey: ['factors'],
    queryFn: () => api.get('/admin/pricing/factors'),
  });

  const { data: commissionsData } = useQuery<Commission[]>({
    queryKey: ['commissions'],
    queryFn: () => api.get('/admin/commissions'),
  });

  const { data: tripTypesData } = useQuery<TripType[]>({
    queryKey: ['trip-types'],
    queryFn: () => api.get('/admin/trip-types'),
  });

  const factors = Array.isArray(factorsData) ? factorsData : [];
  const commissions = Array.isArray(commissionsData) ? commissionsData : [];
  const tripTypes = Array.isArray(tripTypesData) ? tripTypesData : [];

  const updateFactor = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { active?: boolean; value?: number } }) =>
      api.patch(`/admin/pricing/factors/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factors'] }),
  });

  const updateCommission = useMutation({
    mutationFn: ({ id, platformFeePct }: { id: string; platformFeePct: number }) =>
      api.patch(`/admin/commissions/${id}`, { platformFeePct }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commissions'] }),
  });

  const updateTripType = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TripType> }) =>
      api.patch(`/admin/trip-types/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip-types'] }),
  });

  const createTripType = useMutation({
    mutationFn: (data: Omit<TripType, 'id' | 'serviceMode' | 'active'>) =>
      api.post('/admin/trip-types', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip-types'] }),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8">

        {/* Tipos de viaje */}
        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-start justify-between">
            <div>
              <h2 className="font-semibold">Tipos de viaje</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Nombre, descripción y estructura de tarifas visible en la app.
              </p>
            </div>
            <CreateTripTypeForm
              saving={createTripType.isPending}
              onSave={data => createTripType.mutate(data)}
            />
          </div>
          <div className="divide-y">
            {tripTypes.map(t => (
              <TripTypeRow
                key={t.id}
                tripType={t}
                saving={updateTripType.isPending}
                onUpdate={data => updateTripType.mutate({ id: t.id, data })}
              />
            ))}
          </div>
        </section>

        {/* Factores de precio */}
        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">Factores de precio</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Multiplicadores y cargos adicionales aplicados al calcular tarifas.
            </p>
          </div>
          <div className="divide-y">
            {factors.map(f => (
              <FactorRow
                key={f.id}
                factor={f}
                saving={updateFactor.isPending}
                onUpdate={data => updateFactor.mutate({ id: f.id, data })}
              />
            ))}
          </div>
        </section>

        {/* Comisiones */}
        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">Comisiones de plataforma</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Porcentaje retenido por la plataforma sobre cada viaje completado.
            </p>
          </div>
          <div className="divide-y">
            {commissions.map(c => (
              <CommissionRow
                key={c.id}
                commission={c}
                saving={updateCommission.isPending}
                onUpdate={pct => updateCommission.mutate({ id: c.id, platformFeePct: pct })}
              />
            ))}
          </div>
        </section>

    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateTripTypeForm
// ---------------------------------------------------------------------------

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  baseFare: 0,
  costPerKm: 0,
  costPerMin: 0,
  minFare: 0,
};

function CreateTripTypeForm({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: (data: typeof EMPTY_FORM) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const set = (field: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: field === 'code' || field === 'name' || field === 'description' ? e.target.value : Number(e.target.value) }));

  const handleSave = () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('Código y nombre son obligatorios.');
      return;
    }
    setError('');
    onSave(form);
    setForm(EMPTY_FORM);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
      >
        + Nuevo tipo
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-semibold text-lg">Nuevo tipo de viaje</h3>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{error}</p>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-gray-500 block mb-1">Código <span className="text-red-400">*</span></span>
              <input
                type="text"
                value={form.code}
                onChange={set('code')}
                placeholder="ej. express"
                maxLength={20}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500 block mb-1">Nombre <span className="text-red-400">*</span></span>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="ej. Express Plus"
                maxLength={100}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
          </div>

          <label className="text-sm block">
            <span className="text-gray-500 block mb-1">Descripción</span>
            <input
              type="text"
              value={form.description}
              onChange={set('description')}
              placeholder="Descripción visible en la app"
              maxLength={255}
              className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {([
              ['baseFare',  'Tarifa base (MXN)'],
              ['costPerKm', 'Por km (MXN)'],
              ['costPerMin','Por minuto (MXN)'],
              ['minFare',   'Tarifa mínima (MXN)'],
            ] as [keyof typeof EMPTY_FORM, string][]).map(([field, label]) => (
              <label key={field} className="text-sm">
                <span className="text-gray-500 block mb-1">{label}</span>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form[field] as number}
                    onChange={set(field)}
                    className="border rounded pl-5 pr-2 py-1.5 w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setOpen(false)}
            className="text-sm px-4 py-2 border rounded text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando...' : 'Crear tipo de viaje'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TripTypeRow
// ---------------------------------------------------------------------------

function TripTypeRow({
  tripType,
  saving,
  onUpdate,
}: {
  tripType: TripType;
  saving: boolean;
  onUpdate: (data: Partial<TripType>) => void;
}) {
  const [name, setName] = useState(tripType.name);
  const [description, setDescription] = useState(tripType.description);
  const [baseFare, setBaseFare] = useState(tripType.baseFare);
  const [costPerKm, setCostPerKm] = useState(tripType.costPerKm);
  const [costPerMin, setCostPerMin] = useState(tripType.costPerMin);
  const [minFare, setMinFare] = useState(tripType.minFare);
  const [active, setActive] = useState(tripType.active);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onUpdate({ name, description, baseFare, costPerKm, costPerMin, minFare, active });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const dirty =
    name !== tripType.name ||
    description !== tripType.description ||
    baseFare !== tripType.baseFare ||
    costPerKm !== tripType.costPerKm ||
    costPerMin !== tripType.costPerMin ||
    minFare !== tripType.minFare ||
    active !== tripType.active;

  return (
    <div className="px-6 py-5">
      {/* Header con nombre y toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 mr-4">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="font-semibold text-gray-800 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent w-48"
          />
          <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">
            {tripType.code}
          </span>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <div
            onClick={() => setActive(v => !v)}
            className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${active ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${active ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
          <span className={active ? 'text-blue-600 font-medium' : 'text-gray-400'}>
            {active ? 'Activo' : 'Inactivo'}
          </span>
        </label>
      </div>

      {/* Descripción */}
      <div className="mb-4">
        <label className="text-xs text-gray-500 block mb-1">Descripción (visible en la app)</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={255}
          className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Tarifas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <label className="text-sm">
          <span className="text-gray-500 block mb-1">Tarifa base (MXN)</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={baseFare}
              onChange={e => setBaseFare(Number(e.target.value))}
              className="border rounded pl-5 pr-2 py-1.5 w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </label>
        <label className="text-sm">
          <span className="text-gray-500 block mb-1">Por km (MXN)</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={costPerKm}
              onChange={e => setCostPerKm(Number(e.target.value))}
              className="border rounded pl-5 pr-2 py-1.5 w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </label>
        <label className="text-sm">
          <span className="text-gray-500 block mb-1">Por minuto (MXN)</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={costPerMin}
              onChange={e => setCostPerMin(Number(e.target.value))}
              className="border rounded pl-5 pr-2 py-1.5 w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </label>
        <label className="text-sm">
          <span className="text-gray-500 block mb-1">Tarifa mínima (MXN)</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={minFare}
              onChange={e => setMinFare(Number(e.target.value))}
              className="border rounded pl-5 pr-2 py-1.5 w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </label>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {saved && <span className="text-sm text-green-600">Guardado</span>}
        {dirty && !saved && (
          <span className="text-xs text-amber-500">Cambios sin guardar</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FactorRow
// ---------------------------------------------------------------------------

const FACTOR_TYPE_LABELS: Record<string, string> = {
  multiplier: 'Multiplicador',
  percentage: 'Porcentaje (%)',
  fixed_amount: 'Monto fijo (MXN)',
};

function FactorRow({
  factor,
  saving,
  onUpdate,
}: {
  factor: Factor;
  saving: boolean;
  onUpdate: (data: { active?: boolean; value?: number }) => void;
}) {
  const [value, setValue] = useState(factor.value);
  const [active, setActive] = useState(factor.active);
  const [saved, setSaved] = useState(false);

  const dirty = value !== factor.value || active !== factor.active;

  const handleSave = () => {
    onUpdate({ value, active });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-medium text-gray-800">{factor.name}</span>
          <span className="ml-2 text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">
            {factor.code}
          </span>
          <span className="ml-2 text-xs text-gray-500">
            {FACTOR_TYPE_LABELS[factor.type] ?? factor.type}
          </span>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <div
            onClick={() => setActive(v => !v)}
            className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${active ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${active ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
          <span className={active ? 'text-blue-600 font-medium' : 'text-gray-400'}>
            {active ? 'Activo' : 'Inactivo'}
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm flex items-center gap-2">
          <span className="text-gray-500">Valor:</span>
          <input
            type="number"
            min="0"
            step={factor.type === 'multiplier' ? '0.01' : '0.5'}
            value={value}
            onChange={e => setValue(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {factor.type === 'percentage' && <span className="text-gray-400">%</span>}
          {factor.type === 'multiplier' && <span className="text-gray-400">x</span>}
          {factor.type === 'fixed_amount' && <span className="text-gray-400">MXN</span>}
        </label>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        {saved && <span className="text-sm text-green-600">Guardado</span>}
        {dirty && !saved && <span className="text-xs text-amber-500">Sin guardar</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommissionRow
// ---------------------------------------------------------------------------

function CommissionRow({
  commission,
  saving,
  onUpdate,
}: {
  commission: Commission;
  saving: boolean;
  onUpdate: (pct: number) => void;
}) {
  const [value, setValue] = useState(commission.platformFeePct);
  const [saved, setSaved] = useState(false);

  const dirty = value !== commission.platformFeePct;

  const handleSave = () => {
    onUpdate(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="px-6 py-4 flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-800">Región MX</p>
        <p className="text-xs text-gray-400 font-mono">{commission.regionId}</p>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm flex items-center gap-2">
          <span className="text-gray-500">Comisión:</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={value}
            onChange={e => setValue(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-gray-400">%</span>
        </label>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        {saved && <span className="text-sm text-green-600">Guardado</span>}
        {dirty && !saved && <span className="text-xs text-amber-500">Sin guardar</span>}
      </div>
    </div>
  );
}
