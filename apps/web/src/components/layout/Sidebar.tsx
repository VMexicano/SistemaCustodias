import { useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { usePendingApprovals } from '../../hooks/usePendingApprovals';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/admin', label: 'Dashboard', icon: '📊', exact: true },
  { path: '/admin/trips', label: 'Viajes', icon: '🚗' },
  { path: '/admin/approvals', label: 'Aprobaciones', icon: '✅' },
  { path: '/admin/drivers', label: 'Conductores', icon: '👤' },
  { path: '/admin/users', label: 'Usuarios', icon: '👥' },
  { path: '/admin/companies', label: 'Empresas', icon: '🏢' },
  { path: '/admin/verticals', label: 'Verticales', icon: '📌' },
  { path: '/admin/config', label: 'Configuración', icon: '⚙️' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const {
    location: { pathname },
  } = useRouterState();

  const { total: pendingCount } = usePendingApprovals(1, 0);

  return (
    <aside
      className={`bg-white border-r flex flex-col flex-shrink-0 transition-all duration-200 ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      <div className="px-3 py-4 border-b flex justify-end">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-gray-600 text-lg w-8 h-8 flex items-center justify-center"
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.path
            : pathname === item.path || pathname.startsWith(item.path + '/');
          const isApprovals = item.path === '/admin/approvals';
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg text-sm transition-colors mb-0.5 ${
                active
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {!collapsed && (
                <span className="truncate flex-1">{item.label}</span>
              )}
              {!collapsed && isApprovals && pendingCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-yellow-400 text-yellow-900">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
              {collapsed && isApprovals && pendingCount > 0 && (
                <span className="absolute left-7 top-1 w-2 h-2 rounded-full bg-yellow-400" />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
