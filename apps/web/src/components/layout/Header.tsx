
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { auth } from '../../lib/auth';
import { useVerticalConfig } from '../../hooks/useVerticalConfig';

export function Header() {
  const navigate = useNavigate();
  const { data: config } = useVerticalConfig();
  const appName = import.meta.env.VITE_APP_NAME ?? 'RideBase';
  const title = config?.name ?? appName;

  useEffect(() => {
    document.title = `${title} — Admin`;
  }, [title]);

  const handleLogout = async () => {
    auth.clearToken();
    await navigate({ to: '/login' });
  };

  return (
    <header className="bg-white border-b px-6 py-3 flex items-center justify-between flex-shrink-0">
      <h1 className="text-lg font-bold text-gray-800">{title}</h1>
      <button
        onClick={() => void handleLogout()}
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        Salir
      </button>
    </header>
  );
}
