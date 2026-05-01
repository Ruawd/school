import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, List, NavBar, Tabs, Tag } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import axios from '../../../services/request';

const Credit = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState({});
  const [tab, setTab] = useState('all');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => (tab === 'violation' ? '违约记录' : '信用变动记录'), [tab]);

  const loadData = async (nextTab = tab) => {
    setLoading(true);
    try {
      const [userRes, logsRes] = await Promise.all([
        axios.get('/auth/me'),
        axios.get('/auth/credit-logs/me', {
          params: { violationsOnly: nextTab === 'violation' ? 1 : 0 },
        }),
      ]);
      if (userRes.code === 200) setUser(userRes.data || {});
      if (logsRes.code === 200) setLogs(logsRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(tab);
  }, [tab]);

  return (
    <div style={{ minHeight: '100%', background: '#f5f5f5' }}>
      <NavBar onBack={() => navigate(-1)}>我的信用</NavBar>
      <div style={{ padding: 12 }}>
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, color: '#666' }}>当前信用分</div>
          <div style={{ fontSize: 34, fontWeight: 700, color: '#1677ff', marginTop: 6 }}>{user.credit_score ?? '-'}</div>
          <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>信用分会根据按时签到、迟到签到、违约未到等行为自动调整。</div>
        </Card>

        <Tabs activeKey={tab} onChange={setTab}>
          <Tabs.Tab title='全部变动' key='all' />
          <Tabs.Tab title='违约记录' key='violation' />
        </Tabs>

        <Card title={title} style={{ marginTop: 12 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#999' }}>加载中...</div>
          ) : logs.length ? (
            <List>
              {logs.map((item) => {
                const positive = Number(item.delta) >= 0;
                return (
                  <List.Item
                    key={item.id}
                    prefix={<Tag color={positive ? 'success' : 'danger'}>{positive ? '+' : ''}{item.delta}</Tag>}
                    description={
                      <div>
                        <div>{dayjs(item.create_time).format('YYYY-MM-DD HH:mm:ss')}</div>
                        <div style={{ marginTop: 4, color: '#999' }}>关联业务：{item.ref_id || '-'}</div>
                      </div>
                    }
                  >
                    {item.reason}
                  </List.Item>
                );
              })}
            </List>
          ) : (
            <Empty description={tab === 'violation' ? '暂无违约记录' : '暂无信用变动记录'} />
          )}
          <div style={{ marginTop: 12 }}>
            <Button block onClick={() => loadData(tab)}>刷新记录</Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Credit;
