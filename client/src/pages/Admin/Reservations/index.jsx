import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Tag, Space, message, Popconfirm, Tabs } from 'antd';
import axios from '../../../services/request';
import dayjs from 'dayjs';
import BatchBookingModal from './BatchBookingModal';

const ReservationMgr = () => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeStatus, setActiveStatus] = useState('0'); // Default Pending
    const [batchVisible, setBatchVisible] = useState(false);

    const fetchList = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/reservations', { params: { status: activeStatus } });
            if (res.code === 200) {
                setList(res.data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setList([]); // Clear list to prevent ghosting
        fetchList();
    }, [activeStatus]);

    const handleAudit = async (id, status) => {
        try {
            const res = await axios.put(`/reservations/${id}/status`, { status });
            if (res.code === 200) {
                message.success('操作成功');
                fetchList();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 60 },
        { title: '申请人', render: (_, r) => `${r.user?.real_name} (${r.user?.username})` },
        { title: '场地', render: (_, r) => r.venue?.name },
        { title: '时间', render: (_, r) => `${dayjs(r.start_time).format('MM-DD HH:mm')} - ${dayjs(r.end_time).format('HH:mm')}` },
        { title: '用途', dataIndex: 'purpose', ellipsis: true },
        {
            title: '状态',
            dataIndex: 'status',
            render: (s) => {
                const map = { 0: <Tag color="warning">待审核</Tag>, 1: <Tag color="success">已通过</Tag>, 2: <Tag color="blue">已签到</Tag>, 3: <Tag>已取消</Tag>, 4: <Tag color="error">违约</Tag> };
                return map[s] || s;
            }
        },
        { title: '申请时间', render: (_, r) => dayjs(r.create_time).format('MM-DD HH:mm') },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => (
                <Space size="middle">
                    {record.status === 0 && (
                        <>
                            <Popconfirm title="确定通过?" onConfirm={() => handleAudit(record.id, 1)}>
                                <Button type="link" size="small">通过</Button>
                            </Popconfirm>
                            <Popconfirm title="确定拒绝?" onConfirm={() => handleAudit(record.id, 3)}>
                                <Button type="link" danger size="small">拒绝</Button>
                            </Popconfirm>
                        </>
                    )}
                    {record.status === 1 && (
                        <Popconfirm title="强制取消?" onConfirm={() => handleAudit(record.id, 3)}>
                            <Button type="link" danger size="small">取消</Button>
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    const items = [
        { key: '0', label: '待审核' },
        { key: '1', label: '已通过' },
        { key: '2', label: '已签到' },
        { key: '3', label: '已取消' },
        { key: '4', label: '违约' },
    ];

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const getStatusTag = (status) => {
        const map = {
            0: <Tag color="warning">待审核</Tag>,
            1: <Tag color="success">已通过</Tag>,
            2: <Tag color="blue">已签到</Tag>,
            3: <Tag>已取消</Tag>,
            4: <Tag color="error">违约</Tag>
        };
        return map[status];
    };

    const MobileCard = ({ record }) => (
        <Card size="small" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 'bold' }}>{record.venue?.name}</span>
                {getStatusTag(record.status)}
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                申请人: {record.user?.real_name}
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                时间: {dayjs(record.start_time).format('MM-DD HH:mm')} - {dayjs(record.end_time).format('HH:mm')}
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                申请时间: {dayjs(record.create_time).format('MM-DD HH:mm')}
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                用途: {record.purpose}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                {record.status === 0 && (
                    <>
                        <Popconfirm title="确定通过?" onConfirm={() => handleAudit(record.id, 1)}>
                            <Button size="small" type="primary">通过</Button>
                        </Popconfirm>
                        <Popconfirm title="确定拒绝?" onConfirm={() => handleAudit(record.id, 3)}>
                            <Button size="small" danger>拒绝</Button>
                        </Popconfirm>
                    </>
                )}
                {record.status === 1 && (
                    <Popconfirm title="强制取消?" onConfirm={() => handleAudit(record.id, 3)}>
                        <Button size="small" danger>取消</Button>
                    </Popconfirm>
                )}
            </div>
        </Card>
    );

    return (
        <Card
            title="预约审核管理"
            extra={<Button onClick={() => setBatchVisible(true)}>批量预约</Button>}
            styles={{ body: { padding: isMobile ? '0 12px' : 24 } }}
        >
            <Tabs
                defaultActiveKey="0"
                items={items}
                onChange={setActiveStatus}
                size={isMobile ? 'small' : 'default'}
                className={isMobile ? 'mobile-spread-tabs' : ''}
            />
            {isMobile ? (
                <div>
                    {list.map(item => <MobileCard key={item.id} record={item} />)}
                    {list.length === 0 && <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无数据</div>}
                </div>
            ) : (
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={list}
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                />
            )}
            <BatchBookingModal
                visible={batchVisible}
                onClose={() => setBatchVisible(false)}
                onSuccess={fetchList}
            />
        </Card>
    );
};

export default ReservationMgr;
