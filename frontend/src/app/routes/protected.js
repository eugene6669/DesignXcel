// Protected Routes - Require authentication
import React from 'react';
import ProtectedRoute from '../../features/auth/components/ProtectedRoute';
import BulkOrderHistoryPage from '../../features/customer/pages/BulkOrderHistoryPage';
import { CheckoutPage, PaymentPage, OrderSuccessPage } from '../../features/checkout';
import { AccountPage } from '../../features/account';
import { NotificationsPage } from '../../features/notifications';

const protectedRoutes = [
  {
    path: '/checkout',
    element: (
      <ProtectedRoute>
        <CheckoutPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/payment',
    element: (
      <ProtectedRoute>
        <PaymentPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/order-success/:orderId',
    element: (
      <ProtectedRoute>
        <OrderSuccessPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/order-success',
    element: (
      <ProtectedRoute>
        <OrderSuccessPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/account',
    element: (
      <ProtectedRoute>
        <AccountPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/notifications',
    element: (
      <ProtectedRoute>
        <NotificationsPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/bulk-orders/history',
    element: (
      <ProtectedRoute>
        <BulkOrderHistoryPage />
      </ProtectedRoute>
    )
  }
];

export default protectedRoutes;
