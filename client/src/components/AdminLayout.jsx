import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Drawer, Grid, Layout, List, Menu, Popover, Space, theme } from 'antd';
import {
  BellOutlined,
  DashboardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ScheduleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import axios from '../services/request';
import { getRoleLabel } from '../utils/user';
import useNotificationStream from '../hooks/useNotificationStream';
import { resolveNotificationTarget } from '../utils/notificationRouting';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

const menuItems = [
  { key: '/admin/dashboard', icon: <DashboardOutlined />, label: '系统概览' },
  { key: '/admin/venues', icon: <ScheduleOutlined />, label: '场地管理' },
  { key: '/admin/reservations', icon: <ScheduleOutlined />, label: '预约审核' },
  { key: '/admin/users', icon: <UserOutlined />, label: '用户管理' },
  { key: '/admin/evaluations', icon: <ScheduleOutlined />, label: '评价管理' },
];

const AdminLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });
  const [openNote, setOpenNote] = useState(false);
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer, borderRadiusLG, colorPrimary },
  } = theme.useToken();
  const { notifications, unreadCount, markReadLocal } = useNotificationStream({
    enabled: Boolean(currentUser),
    onNewNotification: (notification) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        const browserNotification = new Notification('校园场地预约系统', {
          body: notification?.content || notification?.title || '您有一条新通知',
        });
        browserNotification.onclick = () => {
          browserNotification.close();
          window.focus();
          const target = resolveNotificationTarget(notification, currentUser);
          if (target !== '/notifications') {
            navigate(target);
            return;
          }
          setOpenNote(true);
        };
      }
    },
  });

  const currentLabel = useMemo(
    () => menuItems.find((item) => item.key === location.pathname)?.label || '管理后台',
    [location.pathname],
  );

  useEffect(() => {
    const syncUser = () => {
      try {
        setCurrentUser(JSON.parse(localStorage.getItem('user') || 'null'));
      } catch {
        setCurrentUser(null);
      }
    };

    syncUser();
    window.addEventListener('storage', syncUser);
    return () => window.removeEventListener('storage', syncUser);
  }, []);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  const handleOpenChange = (open) => {
    setOpenNote(open);
  };

  const handleRead = async (item) => {
    if (!item.is_read) {
      try {
        await axios.put(`/notifications/${item.id}/read`);
        markReadLocal(item.id);
      } catch (err) {
        console.error(err);
        return;
      }
    }

    const target = resolveNotificationTarget(item, currentUser);
    if (target !== '/notifications' && target !== location.pathname) {
      setOpenNote(false);
      navigate(target);
    }
  };

  if (!currentUser) return null;

  const notificationContent = (
    <List
      dataSource={notifications}
      locale={{ emptyText: '暂无通知' }}
      style={{
        width: isMobile ? '100%' : 320,
        maxHeight: isMobile ? 'calc(100vh - 120px)' : 420,
        overflow: 'auto',
      }}
      renderItem={(item) => (
        <List.Item
          onClick={() => handleRead(item)}
          style={{
            cursor: item.is_read ? 'default' : 'pointer',
            background: item.is_read ? '#fff' : '#f6ffed',
            padding: isMobile ? '16px 20px' : undefined,
          }}
        >
          {isMobile ? (
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <Badge status={item.is_read ? 'default' : 'processing'} style={{ marginTop: 8, flex: '0 0 auto' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.5, color: '#222' }}>{item.title}</div>
                <div style={{ marginTop: 6, whiteSpace: 'normal', color: '#666', lineHeight: 1.6 }}>{item.content}</div>
              </div>
            </div>
          ) : (
            <List.Item.Meta
              avatar={<Badge status={item.is_read ? 'default' : 'processing'} />}
              title={item.title}
              description={<div style={{ whiteSpace: 'normal', color: '#666' }}>{item.content}</div>}
            />
          )}
        </List.Item>
      )}
    />
  );

  const menuContent = (
    <>
      <div
        style={{
          minHeight: 76,
          padding: collapsed ? '16px 12px' : '18px 16px 14px',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {collapsed ? (
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.08em' }}>管</div>
        ) : (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1, marginBottom: 6 }}>系统管理员</div>
            <div style={{ fontSize: 13, opacity: 0.82 }}>{getRoleLabel(currentUser.role)}</div>
          </div>
        )}
      </div>
      <Menu
        theme='dark'
        mode='inline'
        selectedKeys={[location.pathname]}
        onClick={({ key }) => navigate(key)}
        items={menuItems}
        style={{ flex: 1, minHeight: 0, borderInlineEnd: 'none' }}
      />
    </>
  );

  return (
    <Layout style={{ height: '100vh', minHeight: '100vh', overflow: 'hidden' }} hasSider={!isMobile}>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          trigger={null}
          width={248}
          collapsedWidth={80}
          style={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {menuContent}
        </Sider>
      )}
      <Layout style={{ minWidth: 0, overflow: 'hidden' }}>
        <Header
          style={{
            padding: isMobile ? '0 12px' : '0 20px',
            height: isMobile ? 56 : 72,
            lineHeight: 'normal',
            background: colorBgContainer,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flex: '0 0 auto',
            boxShadow: '0 1px 4px rgba(0, 21, 41, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {!isMobile && (
              <Button type='text' icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed((prev) => !prev)} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, lineHeight: 1.25, margin: 0 }}>{currentLabel}</div>
              {!isMobile && (
                <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4, marginTop: 6 }}>
                  {currentUser.real_name} · {getRoleLabel(currentUser.role)}
                </div>
              )}
            </div>
          </div>

          <Space align='center'>
            {isMobile ? (
              <Badge count={unreadCount} size='small'>
                <Button shape='circle' icon={<BellOutlined />} onClick={() => setOpenNote(true)} />
              </Badge>
            ) : (
              <Popover content={notificationContent} title='站内通知' trigger='click' open={openNote} onOpenChange={handleOpenChange} placement='bottomRight'>
                <Badge count={unreadCount} size='small'>
                  <Button shape='circle' icon={<BellOutlined />} />
                </Badge>
              </Popover>
            )}
            <Button icon={<LogoutOutlined />} onClick={handleLogout}>{isMobile ? '退出' : '退出登录'}</Button>
          </Space>
        </Header>

        {isMobile && (
          <Drawer
            title='站内通知'
            placement='right'
            width='100vw'
            open={openNote}
            onClose={() => setOpenNote(false)}
            styles={{
              header: { padding: '16px 20px' },
              body: { padding: 0 },
              content: { boxShadow: 'none' },
            }}
          >
            {notificationContent}
          </Drawer>
        )}

        <Content
          style={{
            flex: 1,
            margin: isMobile ? 8 : 16,
            padding: isMobile ? 12 : 20,
            minHeight: 0,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'auto',
            paddingBottom: isMobile ? 72 : 20,
          }}
        >
          <Outlet />
        </Content>

        {isMobile && (
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              height: 56,
              background: colorBgContainer,
              borderTop: '1px solid #f0f0f0',
              display: 'flex',
              zIndex: 10,
            }}
          >
            {menuItems.map((item) => {
              const active = item.key === location.pathname;
              return (
                <div
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    color: active ? colorPrimary : '#666',
                    fontSize: 12,
                    paddingTop: 8,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 18 }}>{item.icon}</div>
                  <div style={{ marginTop: 4 }}>{item.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </Layout>
    </Layout>
  );
};

export default AdminLayout;
