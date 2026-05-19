// Admin Routes - Require admin authentication
import React from 'react';
import AdminRoute from '../../features/auth/components/AdminRoute';

// Admin feature pages
import { AdminDashboardPage, AdminOrdersPage } from '../../features/admin';
import AdminBulkOrdersPage from '../../features/admin/pages/AdminBulkOrdersPage';

const adminRoutes = [
  {
    path: '/admin',
    element: (
      <AdminRoute allowEmployee={true}>
        <AdminDashboardPage />
      </AdminRoute>
    )
  },
  {
    path: '/admin/dashboard',
    element: (
      <AdminRoute allowEmployee={true}>
        <AdminDashboardPage />
      </AdminRoute>
    )
  },
  {
    path: '/admin/orders',
    element: (
      <AdminRoute allowEmployee={true}>
        <AdminOrdersPage />
      </AdminRoute>
    )
  },
  {
    path: '/admin/bulk-orders',
    element: (
      <AdminRoute allowEmployee={true}>
        <AdminBulkOrdersPage />
      </AdminRoute>
    )
  }
];

export default adminRoutes;
