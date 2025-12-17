import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { JSX } from 'react';
import { useOnboarding } from '@renderer/hooks/useOnboarding';
import { Loading } from './Loading';

export const ProtectedRoute = (): JSX.Element => {
  const { session } = useAuth();
  const { loading } = useOnboarding();
  if (loading) {
    return <Loading IsOpen={loading} />;
  }

  // If no session exists, redirect to Login
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // If session exists, render the child route (Outlet)
  return <Outlet />;
};
