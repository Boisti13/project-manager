import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n';

function ProtectedRoute({ children }) {
  const { currentUser, loading } = useAuth();

  if (loading) return <div className="container"><p>{t('Loading…')}</p></div>;
  if (!currentUser) return <Navigate to="/login" replace />;

  return children;
}

export default ProtectedRoute;
