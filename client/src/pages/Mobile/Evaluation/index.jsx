import React, { useState } from 'react';
import { Card, Button, Form, TextArea, Rate, Toast } from 'antd-mobile';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from '../../../services/request';

const Evaluation = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { reservation } = location.state || {};
    const [loading, setLoading] = useState(false);

    const onFinish = async (values) => {
        if (!reservation) return;
        setLoading(true);
        try {
            const res = await axios.post('/evaluations', {
                reservation_id: reservation.id,
                rating: values.rating,
                comment: values.comment
            });
            if (res.code === 200) {
                Toast.show({ icon: 'success', content: '评价提交成功' });
                navigate('/history');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!reservation) return <div>未选择预约</div>;

    return (
        <div style={{ padding: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>活动评价</div>
            <Card>
                <div style={{ marginBottom: 16, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                    <div style={{ fontWeight: 'bold' }}>{reservation.venue?.name}</div>
                    <div style={{ color: '#999', fontSize: 13 }}>{reservation.start_time}</div>
                </div>

                <Form onFinish={onFinish} footer={
                    <Button block type='submit' color='primary' size='large' loading={loading}>提交评价</Button>
                }>
                    <Form.Item name='rating' label='评分' rules={[{ required: true, message: '请打分' }]}>
                        <Rate allowHalf />
                    </Form.Item>
                    <Form.Item name='comment' label='心得体会' rules={[{ required: true }]}>
                        <TextArea placeholder='这次活动体验如何？' rows={4} maxLength={200} showCount />
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default Evaluation;
