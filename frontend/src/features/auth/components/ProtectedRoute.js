import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/useAuth';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, user, isCustomer } = useAuth();
  const location = useLocation();

  const needsPasswordSetup = Boolean(isCustomer && user?.requiresPasswordSetup);
  const allowedWhilePasswordPending =
    location.pathname === '/account' || location.pathname.startsWith('/account/');
  
  // Show loading while authentication is being checked
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Checkout/payment hardening:
  // allow route access when auth context briefly desyncs but cached user still exists.
  const isCheckoutFlowRoute = location.pathname === '/checkout' || location.pathname === '/payment';
  if (!isAuthenticated && isCheckoutFlowRoute) {
    try {
      const cachedUser = JSON.parse(localStorage.getItem('userData') || localStorage.getItem('user') || '{}');
      if (cachedUser && cachedUser.email) {
        return children;
      }
    } catch (error) {
      // continue to normal redirect
    }
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (needsPasswordSetup && !allowedWhilePasswordPending) {
    return (
      <Navigate
        to="/account?tab=security&passwordRequired=1"
        replace
        state={{ from: location }}
      />
    );
  }

  return children;
};

export default ProtectedRoute; 