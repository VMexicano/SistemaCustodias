import { useState } from 'react';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { useNavigate } from '@tanstack/react-router';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { accessToken } = await api.post<{ accessToken: string }>(
        '/admin/auth/login',
        { username, password },
      );
      auth.setToken(accessToken);
      await navigate({ to: '/admin' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Usuario o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{import.meta.env.VITE_APP_NAME ?? 'RideBase'}</h1>
        <p className="text-sm text-gray-500 mb-6">Panel de administración</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm text-gray-600">Usuario</span>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin"
              autoComplete="username"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-600">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white rounded px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
