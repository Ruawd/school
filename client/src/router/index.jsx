import { createBrowserRouter, Navigate } from 'react-router-dom';
import Login from '../pages/Login';
import AdminLayout from '../components/AdminLayout';
import Dashboard from '../pages/Admin/Dashboard';
import VenueMgr from '../pages/Admin/VenueMgr';
import UserMgr from '../pages/Admin/UserMgr';
import ReservationMgr from '../pages/Admin/Reservations';
import EvaluationMgr from '../pages/Admin/EvaluationMgr';
import MobileLayout from '../pages/Mobile/Layout';
import MobileHome from '../pages/Mobile/Home';
import Profile from '../pages/Mobile/Profile';
import MobileCredit from '../pages/Mobile/Credit';
import MobileBooking from '../pages/Mobile/Booking';
import MobileCheckin from '../pages/Mobile/Checkin';
import MobileEvaluation from '../pages/Mobile/Evaluation';
import MobileMap from '../pages/Mobile/Map';
import MobileHistory from '../pages/Mobile/History';
import MobileBatchBooking from '../pages/Mobile/BatchBooking';
import MobileNotifications from '../pages/Mobile/Notifications';
import { ProtectedRoute, PublicOnlyRoute } from './RouteGuards';
import LegacyMobileRedirect from './LegacyMobileRedirect';

const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/', element: <Login /> },
      { path: '/login', element: <Login /> },
    ],
  },
  {
    element: <ProtectedRoute roles={[9]} />,
    children: [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to='dashboard' replace /> },
          { path: 'dashboard', element: <Dashboard /> },
          { path: 'venues', element: <VenueMgr /> },
          { path: 'reservations', element: <ReservationMgr /> },
          { path: 'users', element: <UserMgr /> },
          { path: 'evaluations', element: <EvaluationMgr /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <MobileLayout />,
        children: [
          { path: '/home', element: <MobileHome /> },
          { path: '/map', element: <MobileMap /> },
          { path: '/history', element: <MobileHistory /> },
          { path: '/checkin', element: <MobileCheckin /> },
          { path: '/evaluation', element: <MobileEvaluation /> },
          { path: '/notifications', element: <MobileNotifications /> },
          { path: '/profile', element: <Profile /> },
          { path: '/credit', element: <MobileCredit /> },
          { path: '/venue/:id', element: <MobileBooking /> },
          { path: '/batch', element: <MobileBatchBooking /> },
        ],
      },
      { path: '/m/*', element: <LegacyMobileRedirect /> },
    ],
  },
]);

export default router;
