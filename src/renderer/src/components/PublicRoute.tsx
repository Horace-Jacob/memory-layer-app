import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { JSX } from 'react';

export const PublicRoute = (): JSX.Element => {
  const { session } = useAuth();

  // If user is already logged in, redirect them to Dashboard
  if (session) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};
