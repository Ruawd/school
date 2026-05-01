import React, { useEffect, useMemo, useState } from 'react';
import { TabBar } from 'antd-mobile';
import { AppOutline, UnorderedListOutline, UserOutline, EnvironmentOutline } from 'antd-mobile-icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import useNotificationStream from '../../hooks/useNotificationStream';
import { readStoredUser, resolveNotificationTarget } from '../../utils/notificationRouting';
import MobileHome from './Home';
import MobileHistory from './History';
import Profile from './Profile';

const MobileLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { pathname } = location;
    const notificationStream = useNotificationStream({
        enabled: Boolean(localStorage.getItem('token')),
        onNewNotification: (notification) => {
            if ('Notification' in window && Notification.permission === 'granted') {
                const browserNotification = new Notification('校园场地预约系统', {
                    body: notification?.content || notification?.title || '您有一条新通知',
                });
                browserNotification.onclick = () => {
                    browserNotification.close();
                    window.focus();
                    navigate(resolveNotificationTarget(notification, readStoredUser()));
                };
            }
        },
    });

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    const tabs = useMemo(() => ([
        {
            key: '/home',
            title: '首页',
            icon: <AppOutline />,
        },
        {
            key: '/map',
            title: '地图',
            icon: <EnvironmentOutline />,
        },
        {
            key: '/history',
            title: '预约',
            icon: <UnorderedListOutline />,
        },
        {
            key: '/profile',
            title: '我的',
            icon: <UserOutline />,
            badge: notificationStream.unreadCount > 0 ? (notificationStream.unreadCount > 99 ? '99+' : notificationStream.unreadCount) : null,
        },
    ]), [notificationStream.unreadCount]);

    const keepAlivePages = useMemo(() => ({
        '/home': MobileHome,
        '/history': MobileHistory,
        '/profile': Profile,
    }), []);
    const isBottomTab = tabs.some((item) => item.key === pathname);
    const isKeepAlivePage = Boolean(keepAlivePages[pathname]);
    const [visitedPages, setVisitedPages] = useState(() => (isKeepAlivePage ? [pathname] : []));

    useEffect(() => {
        if (!isKeepAlivePage) return;
        setVisitedPages((prev) => (prev.includes(pathname) ? prev : [...prev, pathname]));
    }, [isKeepAlivePage, pathname]);

    const setRouteActive = (value) => {
        navigate(value);
    };

    return (
        <div className='mobile-layout'>
            <div className='mobile-layout__content'>
                {visitedPages.map((pageKey) => {
                    const Page = keepAlivePages[pageKey];
                    if (!Page) return null;
                    const active = pathname === pageKey;
                    return (
                        <div key={pageKey} style={{ display: active ? 'block' : 'none', height: '100%' }}>
                            <Page active={active} notificationStream={notificationStream} />
                        </div>
                    );
                })}
                {!isKeepAlivePage ? <Outlet context={notificationStream} /> : null}
            </div>
            <div
                className='mobile-layout__tabbar'
                style={{ display: isBottomTab ? 'block' : 'none' }}
            >
                <TabBar activeKey={pathname} onChange={value => setRouteActive(value)}>
                    {tabs.map(item => (
                        <TabBar.Item key={item.key} icon={item.icon} title={item.title} badge={item.badge} />
                    ))}
                </TabBar>
            </div>
        </div>
    );
};

export default MobileLayout;
