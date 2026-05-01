import React, { useEffect, useMemo, useReducer } from 'react';
import { Spin } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import axios from '../services/request';

const INITIAL_GUARD_STATE = { checking: true, redirectPath: '' };

const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

const getHomePathByRole = () => '/home';

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    clearSession();
    return null;
  }
};

const guardReducer = (state, action) => {
  switch (action.type) {
    case 'start':
      return { checking: true, redirectPath: '' };
    case 'allow':
      return { checking: false, redirectPath: '' };
    case 'redirect':
      return { checking: false, redirectPath: action.path || '/login' };
    default:
      return state;
  }
};

const FullPageLoading = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin size='large' />
  </div>
);

export const PublicOnlyRoute = () => {
  const token = localStorage.getItem('token');
  const user = readStoredUser();

  if (token && user) {
    return <Navigate to={getHomePathByRole(user)} replace />;
  }

  return <Outlet />;
};

export const ProtectedRoute = ({ roles = null }) => {
  const location = useLocation();
  const normalizedRoles = useMemo(
    () => (Array.isArray(roles) ? roles.map((item) => Number(item)) : []),
    [roles],
  );
  const rolesKey = normalizedRoles.join(',');
  const [guardState, dispatch] = useReducer(guardReducer, INITIAL_GUARD_STATE);

  useEffect(() => {
    let active = true;

    const verify = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        if (active) {
          dispatch({ type: 'redirect', path: '/login' });
        }
        return;
      }

      try {
        const res = await axios.get('/auth/me');
        const user = res.data || null;

        if (!active) return;

        if (!user) {
          clearSession();
          dispatch({ type: 'redirect', path: '/login' });
          return;
        }

        localStorage.setItem('user', JSON.stringify(user));

        if (normalizedRoles.length && !normalizedRoles.includes(Number(user.role))) {
          dispatch({ type: 'redirect', path: getHomePathByRole(user) });
          return;
        }

        dispatch({ type: 'allow' });
      } catch {
        if (!active) return;
        clearSession();
        dispatch({ type: 'redirect', path: '/login' });
      }
    };

    dispatch({ type: 'start' });
    void verify();

    return () => {
      active = false;
    };
  }, [normalizedRoles, rolesKey]);

  if (guardState.checking) {
    return <FullPageLoading />;
  }

  if (guardState.redirectPath) {
    return <Navigate to={guardState.redirectPath} replace state={{ from: location }} />;
  }

  return <Outlet />;
};
