import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Rate, Popconfirm, message } from 'antd';
import axios from '../../../services/request';
import dayjs from 'dayjs';

const EvaluationMgr = () => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchList = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/evaluations');
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
        fetchList();
    }, []);

    const handleDelete = async (id) => {
        try {
            const res = await axios.delete(`/evaluations/${id}`);
            if (res.code === 200) {
                message.success('删除成功');
                fetchList();
            }
        } catch {
            message.error('删除失败');
        }
    };

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 60 },
        { title: '评价人', render: (_, r) => r.user?.real_name },
        { title: '场地', render: (_, r) => r.venue?.name },
        { title: '评分', render: (_, r) => <Rate disabled allowHalf defaultValue={r.rating} /> },
        { title: '内容', dataIndex: 'comment' },
        { title: '时间', render: (_, r) => dayjs(r.create_time).format('YYYY-MM-DD HH:mm') },
        {
            title: '操作',
            render: (_, r) => (
                <Popconfirm title="确定删除?" onConfirm={() => handleDelete(r.id)}>
                    <Button type="link" danger size="small">删除</Button>
                </Popconfirm>
            )
        }
    ];

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const MobileCard = ({ record }) => (
        <Card size="small" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 'bold' }}>{record.venue?.name}</span>
                <Rate disabled allowHalf defaultValue={record.rating} style={{ fontSize: 14 }} />
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                评价人: {record.user?.real_name}
            </div>
            <div style={{ fontSize: 13, color: '#333', marginBottom: 8, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                {record.comment}
            </div>
            <div style={{ fontSize: 12, color: '#999', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{dayjs(record.create_time).format('MM-DD HH:mm')}</span>
                <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
                    <Button size="small" danger>删除</Button>
                </Popconfirm>
            </div>
        </Card>
    );

    return (
        <Card title="评价管理" styles={{ body: { padding: isMobile ? '0 12px' : 24 } }}>
            {isMobile ? (
                <div>
                    {list.map(item => <MobileCard key={item.id} record={item} />)}
                    {list.length === 0 && <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无评价</div>}
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
        </Card>
    );
};

export default EvaluationMgr;
