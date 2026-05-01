import React, { useEffect, useMemo } from 'react';
import { TabBar } from 'antd-mobile';
import { AppOutline, UnorderedListOutline, UserOutline, EnvironmentOutline } from 'antd-mobile-icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import useNotificationStream from '../../hooks/useNotificationStream';
import { readStoredUser, resolveNotificationTarget } from '../../utils/notificationRouting';

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

    const setRouteActive = (value) => {
        navigate(value);
    };

    return (
        <div className='mobile-layout'>
            <div className='mobile-layout__content'>
                <Outlet context={notificationStream} />
            </div>
            <div
                className='mobile-layout__tabbar'
                style={{ display: tabs.find(t => t.key === pathname) ? 'block' : 'none' }}
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
