import React from 'react';
import { NavBar, List, Badge, Button, Toast } from 'antd-mobile';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axios from '../../../services/request';
import dayjs from 'dayjs';
import { readStoredUser, resolveNotificationTarget } from '../../../utils/notificationRouting';

const Notifications = () => {
    const navigate = useNavigate();
    const notificationStream = useOutletContext() || {};
    const list = notificationStream.notifications || [];
    const initialized = Boolean(notificationStream.initialized);
    const markReadLocal = notificationStream.markReadLocal || (() => {});
    const markAllReadLocal = notificationStream.markAllReadLocal || (() => {});
    const currentUser = readStoredUser();

    const markRead = async (item) => {
        if (item.is_read) return true;
        try {
            await axios.put(`/notifications/${item.id}/read`);
            markReadLocal(item.id);
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    };

    const handleItemClick = async (item) => {
        const ok = await markRead(item);
        if (!ok) return;
        const target = resolveNotificationTarget(item, currentUser);
        if (target !== '/notifications') {
            navigate(target);
        }
    };

    const markAll = async () => {
        try {
            await axios.put('/notifications/read-all');
            Toast.show({ icon: 'success', content: '已全部标记为已读' });
            markAllReadLocal();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div style={{ background: '#fff', minHeight: '100%' }}>
            <NavBar onBack={() => navigate(-1)} right={<Button size='mini' onClick={markAll}>全部已读</Button>}>
                通知
            </NavBar>
            <List>
                {list.map(item => (
                    <List.Item
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        description={<div style={{ fontSize: 12 }}>{item.content}</div>}
                        extra={!item.is_read ? <Badge content='新' /> : null}
                    >
                        <div style={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                            {dayjs(item.create_time).format('YYYY-MM-DD HH:mm')}
                        </div>
                    </List.Item>
                ))}
            </List>
            {!initialized && (
                <div style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>通知连接中...</div>
            )}
            {initialized && list.length === 0 && (
                <div style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>暂无通知</div>
            )}
        </div>
    );
};

export default Notifications;
