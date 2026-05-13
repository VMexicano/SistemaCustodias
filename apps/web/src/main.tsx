import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  RouterProvider,
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { auth } from './lib/auth';
import { AdminLayout } from './components/layout/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ConfigPage } from './pages/ConfigPage';
import { TripsPage } from './pages/TripsPage';
import { DriversPage } from './pages/DriversPage';
import { UsersPage } from './pages/UsersPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyDetailPage } from './pages/CompanyDetailPage';
import { VerticalesPage } from './pages/VerticalesPage';
import { AprobacionesPage } from './pages/AprobacionesPage';
import './index.css';

const queryClient = new QueryClient();

function requireAuth() {
  if (!auth.isAuthenticated()) {
    throw redirect({ to: '/login' });
  }
}

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// Pathless layout route — wraps all /admin/* pages without affecting the URL
const adminLayoutRoute = createRoute({
  id: 'admin-layout',
  getParentRoute: () => rootRoute,
  beforeLoad: requireAuth,
  component: AdminLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin',
  component: DashboardPage,
});

const tripsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/trips',
  component: TripsPage,
});

const driversRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/drivers',
  component: DriversPage,
});

const usersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/users',
  component: UsersPage,
});

const companiesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/companies',
  component: CompaniesPage,
});

const companyDetailRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/companies/$id',
  component: CompanyDetailPage,
});

const verticalesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/verticals',
  component: VerticalesPage,
});

const approvalsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/approvals',
  component: AprobacionesPage,
});

const configRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/config',
  component: ConfigPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/login' });
  },
  component: () => null,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  adminLayoutRoute.addChildren([
    dashboardRoute,
    tripsRoute,
    driversRoute,
    usersRoute,
    companiesRoute,
    companyDetailRoute,
    verticalesRoute,
    approvalsRoute,
    configRoute,
  ]),
  indexRoute,
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
