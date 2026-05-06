import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Menu, Space } from 'antd';
import {
    BellOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
} from '@ant-design/icons';
import { TabBar } from 'antd-mobile';
import { AppOutline, UnorderedListOutline, UserOutline, EnvironmentOutline } from 'antd-mobile-icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import useNotificationStream from '../../hooks/useNotificationStream';
import { readStoredUser, resolveNotificationTarget } from '../../utils/notificationRouting';
import { getRoleLabel } from '../../utils/user';
import MobileHome from './Home';
import MobileHistory from './History';
import Profile from './Profile';

const MobileLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { pathname } = location;
    const [collapsed, setCollapsed] = useState(false);
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
    const activeTabKey = useMemo(() => {
        if (pathname.startsWith('/venue') || pathname.startsWith('/batch')) return '/home';
        if (pathname.startsWith('/notifications') || pathname.startsWith('/credit')) return '/profile';
        if (pathname.startsWith('/evaluation')) return '/history';
        return pathname;
    }, [pathname]);
    const currentUser = readStoredUser();
    const currentLabel = tabs.find((item) => item.key === activeTabKey)?.title || '用户端';
    const desktopMenuItems = useMemo(() => tabs.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.title,
    })), [tabs]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login', { replace: true });
    };

    useEffect(() => {
        if (!isKeepAlivePage) return;
        setVisitedPages((prev) => (prev.includes(pathname) ? prev : [...prev, pathname]));
    }, [isKeepAlivePage, pathname]);

    const setRouteActive = (value) => {
        navigate(value);
    };

    return (
        <div className='mobile-layout user-layout'>
            <aside className={`user-layout__sidebar${collapsed ? ' is-collapsed' : ''}`}>
                <div className='user-layout__brand'>
                    {collapsed ? (
                        <div className='user-layout__brand-collapsed'>用</div>
                    ) : (
                        <div style={{ overflow: 'hidden' }}>
                            <div className='user-layout__brand-title'>系统用户</div>
                            <div className='user-layout__brand-subtitle'>{getRoleLabel(currentUser?.role)}</div>
                        </div>
                    )}
                </div>
                <Menu
                    theme='dark'
                    mode='inline'
                    inlineCollapsed={collapsed}
                    selectedKeys={[activeTabKey]}
                    onClick={({ key }) => setRouteActive(key)}
                    items={desktopMenuItems}
                    style={{ flex: 1, minHeight: 0, borderInlineEnd: 'none' }}
                />
            </aside>
            <div className='user-layout__main'>
                <header className='user-layout__header'>
                    <div className='user-layout__header-left'>
                        <Button
                            type='text'
                            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            onClick={() => setCollapsed((prev) => !prev)}
                        />
                        <div className='user-layout__header-title-wrap'>
                            <div className='user-layout__header-title'>{currentLabel}</div>
                            <div className='user-layout__header-subtitle'>
                                {currentUser?.real_name || '用户'} · {getRoleLabel(currentUser?.role)}
                            </div>
                        </div>
                    </div>
                    <Space align='center'>
                        <Badge count={notificationStream.unreadCount} size='small'>
                            <Button shape='circle' icon={<BellOutlined />} onClick={() => navigate('/notifications')} />
                        </Badge>
                        <Button icon={<LogoutOutlined />} onClick={handleLogout}>退出登录</Button>
                    </Space>
                </header>
                <div className='mobile-layout__content user-layout__content'>
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
            </div>
            <div
                className='mobile-layout__tabbar'
                style={{ display: isBottomTab ? 'block' : 'none' }}
            >
                <TabBar activeKey={activeTabKey} onChange={value => setRouteActive(value)}>
                    {tabs.map(item => (
                        <TabBar.Item key={item.key} icon={item.icon} title={item.title} badge={item.badge} />
                    ))}
                </TabBar>
            </div>
        </div>
    );
};

export default MobileLayout;
