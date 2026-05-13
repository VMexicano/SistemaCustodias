import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';

interface VerticalRow {
  id: string;
  slug: string;
  name: string;
  description?: string;
  features: Record<string, unknown>;
  active: boolean;
}

interface EditForm {
  name: string;
  description: string;
  features: Record<string, unknown>;
}

const FEATURE_LABELS: Record<string, string> = {
  scheduling: 'Programados',
  multiStop: 'Multi-parada',
  cargoDeclaration: 'Declaración de carga',
  chainOfCustody: 'Cadena de custodia',
  temperatureLog: 'Registro temperatura',
  b2bAccounts: 'Cuentas B2B',
};

const PRICING_MODEL_OPTIONS = [
  { value: 'per_km_min', label: 'Por km/min (taxi)' },
  { value: 'fixed_rate', label: 'Tarifa fija (custody)' },
  { value: 'per_weight_km', label: 'Por peso/km (cold-chain)' },
  { value: 'per_declared_value', label: 'Por valor declarado' },
];

export function VerticalesPage() {
  const queryClient = useQueryClient();
  const [editingVertical, setEditingVertical] = useState<VerticalRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', description: '', features: {} });
  const [editError, setEditError] = useState('');

  const { data: verticals = [], isLoading } = useQuery<VerticalRow[]>({
    queryKey: ['admin-verticals'],
    queryFn: () => api.get('/admin/verticals'),
  });

  const editMutation = useMutation({
    mutationFn: ({ slug, form }: { slug: string; form: EditForm }) =>
      api.patch(`/admin/verticals/${slug}`, {
        name: form.name,
        description: form.description || undefined,
        features: form.features,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-verticals'] });
      queryClient.invalidateQueries({ queryKey: ['vertical-config'] });
      setEditingVertical(null);
      setEditError('');
    },
    onError: (err: Error) => {
      setEditError(err.message ?? 'Error al guardar');
    },
  });

  function openEditor(v: VerticalRow) {
    setEditingVertical(v);
    setEditForm({
      name: v.name,
      description: v.description ?? '',
      features: { ...v.features },
    });
    setEditError('');
  }

  function toggleFeature(key: string) {
    setEditForm((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: !prev.features[key] },
    }));
  }

  function setPricingModel(value: string) {
    setEditForm((prev) => ({
      ...prev,
      features: { ...prev.features, pricingModel: value || undefined },
    }));
  }

  const activeSlug = import.meta.env.VITE_VERTICAL_SLUG ?? 'taxi';

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-48 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Verticales</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {verticals.map((v) => (
          <div key={v.id} className="bg-white rounded-lg shadow p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{v.name}</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{v.slug}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {v.slug === activeSlug && <Badge variant="blue" label="Activo" />}
                {v.active ? (
                  <Badge variant="green" label="Habilitado" />
                ) : (
                  <Badge variant="gray" label="Deshabilitado" />
                )}
              </div>
            </div>

            {v.description && <p className="text-sm text-gray-500">{v.description}</p>}

            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Features</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                  const enabled = Boolean(v.features[key]);
                  return (
                    <span
                      key={key}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        enabled
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-gray-50 text-gray-400 border border-gray-200'
                      }`}
                    >
                      {enabled ? '✓' : '○'} {label}
                    </span>
                  );
                })}
              </div>
            </div>

            {typeof v.features.pricingModel === 'string' && (
              <div>
                <p className="text-xs text-gray-500">Modelo de precio</p>
                <p className="text-xs font-mono mt-0.5">{v.features.pricingModel}</p>
              </div>
            )}

            <button
              onClick={() => openEditor(v)}
              className="w-full mt-1 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700 transition-colors"
            >
              Editar
            </button>
          </div>
        ))}
      </div>

      <Modal
        open={!!editingVertical}
        onClose={() => { setEditingVertical(null); setEditError(''); }}
        title={`Editar vertical — ${editingVertical?.slug ?? ''}`}
        size="md"
      >
        {editingVertical && (
          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-gray-500 mb-1">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nombre del vertical"
              />
            </div>

            <div>
              <label className="block text-gray-500 mb-1">Descripción</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Descripción opcional"
              />
            </div>

            <div>
              <p className="text-gray-500 mb-2 font-medium">Features</p>
              <div className="space-y-2">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.features[key])}
                      onChange={() => toggleFeature(key)}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span className="text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-gray-500 mb-1">Modelo de precio</label>
              <select
                value={String(editForm.features.pricingModel ?? '')}
                onChange={(e) => setPricingModel(e.target.value)}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— seleccionar —</option>
                {PRICING_MODEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {editError && (
              <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded p-2">
                {editError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => { setEditingVertical(null); setEditError(''); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => editMutation.mutate({ slug: editingVertical.slug, form: editForm })}
                disabled={!editForm.name.trim() || editMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
