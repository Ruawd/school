import React, { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, List } from 'antd-mobile';
import { AppOutline, BellOutline, RightOutline, ScanningOutline, SetOutline } from 'antd-mobile-icons';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axios from '../../../services/request';
import { getRoleLabel } from '../../../utils/user';

const Profile = () => {
  const [user, setUser] = useState({});
  const navigate = useNavigate();
  const notificationStream = useOutletContext() || {};
  const unreadCount = notificationStream.unreadCount || 0;

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const userRes = await axios.get('/auth/me');
        if (!active || userRes.code !== 200) return;
        setUser(userRes.data || {});
        localStorage.setItem('user', JSON.stringify(userRes.data || {}));
      } catch (err) {
        console.error(err);
      }
    };

    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  const renderListExtra = (content = null) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {content}
      <RightOutline />
    </div>
  );

  return (
    <div style={{ padding: 12, background: '#f5f5f5', minHeight: '100%' }}>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar style={{ '--size': '64px', '--border-radius': '50%' }}>{user.real_name?.slice?.(0, 1) || '我'}</Avatar>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{user.real_name || '未登录用户'}</div>
            <div style={{ marginTop: 4, color: '#666' }}>{user.username || '-'}</div>
            <div style={{ marginTop: 6, color: '#999', fontSize: 13 }}>角色：{getRoleLabel(user.role)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff' }}>{user.credit_score ?? '-'}</div>
            <div style={{ color: '#999', fontSize: 12 }}>当前信用分</div>
          </div>
        </div>
      </Card>

      <List header='账号与服务'>
        <List.Item arrow={false} prefix={<SetOutline />} extra={renderListExtra()} description='查看我的信用变动与违约记录' onClick={() => navigate('/credit')}>
          我的信用档案
        </List.Item>
        <List.Item
          arrow={false}
          prefix={<BellOutline />}
          extra={renderListExtra(unreadCount > 0 ? <Badge content={unreadCount} /> : null)}
          description='查看系统通知与预约提醒'
          onClick={() => navigate('/notifications')}
        >
          站内通知
        </List.Item>
        {Number(user.role) === 9 && (
          <List.Item arrow={false} prefix={<AppOutline />} extra={renderListExtra()} description='进入管理后台处理审核、场地与统计' onClick={() => navigate('/admin')}>
            管理端入口
          </List.Item>
        )}
        {Number(user.role) === 9 && (
          <List.Item arrow={false} prefix={<ScanningOutline />} extra={renderListExtra()} description='管理员现场扫码核验预约签到' onClick={() => navigate('/checkin', { state: { fromAdmin: true } })}>
            管理员扫码
          </List.Item>
        )}
      </List>

      <div style={{ marginTop: 20 }}>
        <Button block color='danger' onClick={handleLogout}>退出登录</Button>
      </div>
    </div>
  );
};

export default Profile;
