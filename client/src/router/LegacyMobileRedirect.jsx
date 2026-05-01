import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const LegacyMobileRedirect = () => {
  const location = useLocation();
  const nextPath = location.pathname.replace(/^\/m(?=\/|$)/, '') || '/home';
  return <Navigate to={`${nextPath}${location.search}${location.hash}`} replace />;
};

export default LegacyMobileRedirect;
