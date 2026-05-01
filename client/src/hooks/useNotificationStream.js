import { useCallback, useEffect, useReducer, useRef } from 'react';

const MAX_NOTIFICATIONS = 50;
const INITIAL_STATE = {
  notifications: [],
  unreadCount: 0,
  initialized: false,
  connected: false,
};

const sortNotifications = (list) => [...list].sort((a, b) => {
  const timeDiff = new Date(b?.create_time || 0).getTime() - new Date(a?.create_time || 0).getTime();
  if (timeDiff !== 0) return timeDiff;
  return Number(b?.id || 0) - Number(a?.id || 0);
});

const normalizeNotifications = (list = []) => {
  const map = new Map();
  list.forEach((item) => {
    if (item?.id == null) return;
    map.set(item.id, item);
  });
  return sortNotifications(Array.from(map.values())).slice(0, MAX_NOTIFICATIONS);
};

const getUnreadCount = (list = []) => list.reduce((count, item) => count + (item?.is_read ? 0 : 1), 0);

const mergeNotification = (list, notification) => {
  if (!notification?.id) return list;
  return normalizeNotifications([notification, ...list.filter((item) => item.id !== notification.id)]);
};

const notificationReducer = (state, action) => {
  switch (action.type) {
    case 'reset':
      return INITIAL_STATE;
    case 'connected':
      if (state.connected === action.connected) return state;
      return {
        ...state,
        connected: action.connected,
      };
    case 'snapshot': {
      const nextNotifications = normalizeNotifications(action.notifications);
      return {
        ...state,
        notifications: nextNotifications,
        unreadCount: typeof action.unreadCount === 'number' ? action.unreadCount : getUnreadCount(nextNotifications),
        initialized: true,
      };
    }
    case 'notification_created': {
      const nextNotifications = mergeNotification(state.notifications, action.notification);
      return {
        ...state,
        notifications: nextNotifications,
        unreadCount: typeof action.unreadCount === 'number' ? action.unreadCount : getUnreadCount(nextNotifications),
        initialized: true,
      };
    }
    case 'notification_read': {
      const nextNotifications = state.notifications.map((item) => (
        item.id === action.notificationId ? { ...item, is_read: true } : item
      ));
      return {
        ...state,
        notifications: nextNotifications,
        unreadCount: typeof action.unreadCount === 'number' ? action.unreadCount : getUnreadCount(nextNotifications),
        initialized: true,
      };
    }
    case 'notification_read_all':
      return {
        ...state,
        notifications: state.notifications.map((item) => (item.is_read ? item : { ...item, is_read: true })),
        unreadCount: 0,
        initialized: true,
      };
    default:
      return state;
  }
};

const useNotificationStream = ({ enabled = true, onNewNotification } = {}) => {
  const [state, dispatch] = useReducer(notificationReducer, INITIAL_STATE);
  const onNewNotificationRef = useRef(onNewNotification);

  useEffect(() => {
    onNewNotificationRef.current = onNewNotification;
  }, [onNewNotification]);

  const setSnapshot = useCallback((notifications, unreadCount) => {
    dispatch({
      type: 'snapshot',
      notifications,
      unreadCount,
    });
  }, []);

  const markReadLocal = useCallback((notificationId) => {
    if (!notificationId) return;
    dispatch({ type: 'notification_read', notificationId });
  }, []);

  const markAllReadLocal = useCallback(() => {
    dispatch({ type: 'notification_read_all' });
  }, []);

  const handleMessage = useCallback((event) => {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (!payload?.type) return;

    if (payload.type === 'snapshot') {
      setSnapshot(payload.notifications || [], payload.unreadCount);
      return;
    }

    if (payload.type === 'notification_created' && payload.notification) {
      dispatch({
        type: 'notification_created',
        notification: payload.notification,
        unreadCount: payload.unreadCount,
      });
      onNewNotificationRef.current?.(payload.notification, payload);
      return;
    }

    if (payload.type === 'notification_read') {
      dispatch({
        type: 'notification_read',
        notificationId: payload.notificationId,
        unreadCount: payload.unreadCount,
      });
      return;
    }

    if (payload.type === 'notification_read_all') {
      dispatch({ type: 'notification_read_all' });
    }
  }, [setSnapshot]);

  useEffect(() => {
    if (!enabled) {
      dispatch({ type: 'reset' });
      return undefined;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      dispatch({ type: 'reset' });
      return undefined;
    }

    const es = new EventSource(`/api/v1/notifications/stream?token=${encodeURIComponent(token)}`);
    es.onopen = () => {
      dispatch({ type: 'connected', connected: true });
    };
    es.onmessage = handleMessage;
    es.onerror = () => {
      dispatch({ type: 'connected', connected: false });
    };

    return () => {
      es.close();
      dispatch({ type: 'connected', connected: false });
    };
  }, [enabled, handleMessage]);

  return {
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    initialized: state.initialized,
    connected: state.connected,
    markReadLocal,
    markAllReadLocal,
  };
};

export default useNotificationStream;
