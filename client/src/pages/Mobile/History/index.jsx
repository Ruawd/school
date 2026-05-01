import React, { useEffect, useState } from 'react';
import { Card, Tag, Button, Toast, CenterPopup, SearchBar } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import axios from '../../../services/request';
import dayjs from 'dayjs';

const CHECKIN_WINDOW_MINUTES = 15;

const History = () => {
    const [list, setList] = useState([]);
    const [queueList, setQueueList] = useState([]);
    const [keyword, setKeyword] = useState('');
    const navigate = useNavigate();

    const [evalVisible, setEvalVisible] = useState(false);
    const [currentEval, setCurrentEval] = useState(null);

    const loadData = async () => {
        try {
            const [reservationRes, queueRes] = await Promise.all([
                axios.get('/reservations/me'),
                axios.get('/reservations/queue/me'),
            ]);

            if (reservationRes.code === 200) {
                setList(reservationRes.data || []);
            }
            if (queueRes.code === 200) {
                setQueueList(queueRes.data || []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    const handleCancel = (id) => {
        const confirmed = window.confirm('确定要取消这个预约吗？');
        if (!confirmed) return;

        axios.put(`/reservations/${id}/cancel`).then((res) => {
            if (res.code === 200) {
                Toast.show({ icon: 'success', content: '取消成功' });
                loadData();
            } else {
                Toast.show({ icon: 'fail', content: res.msg || '取消失败' });
            }
        });
    };

    const handleQueueCancel = (id) => {
        const confirmed = window.confirm('确定要取消这个候补吗？');
        if (!confirmed) return;

        axios.put(`/reservations/queue/${id}/cancel`).then((res) => {
            if (res.code === 200) {
                Toast.show({ icon: 'success', content: '候补已取消' });
                loadData();
            } else {
                Toast.show({ icon: 'fail', content: res.msg || '取消失败' });
            }
        });
    };

    const getStatusTag = (status) => {
        const map = {
            0: <Tag color='warning'>待审核</Tag>,
            1: <Tag color='success'>预约成功</Tag>,
            2: <Tag color='primary'>已签到</Tag>,
            3: <Tag color='default'>已取消</Tag>,
            4: <Tag color='danger'>违约</Tag>,
        };
        return map[status] || <Tag>未知</Tag>;
    };

    const getQueueStatusTag = (status) => {
        const map = {
            0: <Tag color='warning'>候补中</Tag>,
            1: <Tag color='success'>已晋级</Tag>,
            2: <Tag color='default'>已关闭</Tag>,
        };
        return map[status] || <Tag>未知</Tag>;
    };

    const canCancel = (item) => {
        const isPendingOrSuccess = item.status === 0 || item.status === 1;
        const isNotStarted = dayjs().valueOf() < dayjs(item.start_time).valueOf();
        return isPendingOrSuccess && isNotStarted;
    };

    const matchKeyword = (value) => String(value || '').toLowerCase().includes(keyword.trim().toLowerCase());

    const filteredList = list.filter((item) => {
        if (!keyword.trim()) return true;
        return [
            item.venue?.name,
            item.venue?.equipment,
            item.purpose,
            item.review_remark,
            item.cancel_reason,
        ].some(matchKeyword);
    });

    const filteredQueueList = queueList.filter((item) => {
        if (!keyword.trim()) return true;
        return [
            item.venue?.name,
            item.venue?.equipment,
            item.purpose,
            item.process_remark,
            item.cancel_reason,
        ].some(matchKeyword);
    });

    return (
        <div style={{ padding: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>我的预约记录</div>
            <SearchBar
                placeholder='搜索名称、设备或用途'
                value={keyword}
                onChange={(val) => setKeyword(val)}
                style={{ marginBottom: 12 }}
            />

            {filteredList.map((item) => (
                <Card key={item.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontWeight: 'bold' }}>{item.venue?.name}</span>
                        {getStatusTag(item.status)}
                    </div>
                    <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                        时间：{dayjs(item.start_time).format('MM-DD HH:mm')} - {dayjs(item.end_time).format('HH:mm')}
                    </div>
                    <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                        申请时间：{item.create_time ? dayjs(item.create_time).format('MM-DD HH:mm') : '-'}
                    </div>
                    <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                        审核时间：{item.review_time ? dayjs(item.review_time).format('MM-DD HH:mm') : '-'}
                    </div>
                    {item.review_remark ? (
                        <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                            审核备注：{item.review_remark}
                        </div>
                    ) : null}
                    {item.cancel_reason ? (
                        <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                            取消原因：{item.cancel_reason}
                        </div>
                    ) : null}
                    {item.checkin_time ? (
                        <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                            签到时间：{dayjs(item.checkin_time).format('MM-DD HH:mm')}
                        </div>
                    ) : null}

                    <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                        {item.status === 1
                            && dayjs().isAfter(dayjs(item.start_time).subtract(CHECKIN_WINDOW_MINUTES, 'minute'))
                            && dayjs().isBefore(dayjs(item.end_time)) ? (
                                <Button size='small' color='primary' fill='solid' onClick={() => navigate('/checkin', { state: { reservation: item } })}>
                                    去签到
                                </Button>
                            ) : null}

                        {canCancel(item) ? (
                            <Button size='small' color='danger' fill='outline' onClick={() => handleCancel(item.id)}>
                                取消预约
                            </Button>
                        ) : null}
                    </div>

                    {item.status === 2 && dayjs().isAfter(dayjs(item.end_time)) ? (
                        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, textAlign: 'right', marginTop: 8 }}>
                            {item.evaluation ? (
                                <Button size='small' color='primary' fill='outline' onClick={() => {
                                    setCurrentEval(item.evaluation);
                                    setEvalVisible(true);
                                }}>
                                    查看评价
                                </Button>
                            ) : (
                                <Button size='small' color='success' fill='outline' onClick={() => navigate('/evaluation', { state: { reservation: item } })}>
                                    去评价
                                </Button>
                            )}
                        </div>
                    ) : null}
                </Card>
            ))}

            {filteredList.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#999', marginTop: 24 }}>暂无预约记录</div>
            ) : null}

            <div style={{ fontSize: 18, fontWeight: 'bold', margin: '20px 0 12px' }}>我的候补记录</div>
            {filteredQueueList.map((item) => (
                <Card key={`queue-${item.id}`} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontWeight: 'bold' }}>{item.venue?.name}</span>
                        {getQueueStatusTag(item.queue_status ?? item.status)}
                    </div>
                    <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                        候补时段：{dayjs(item.start_time).format('MM-DD HH:mm')} - {dayjs(item.end_time).format('HH:mm')}
                    </div>
                    <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                        申请用途：{item.purpose || '-'}
                    </div>
                    <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                        排队时间：{item.create_time ? dayjs(item.create_time).format('MM-DD HH:mm') : '-'}
                    </div>
                    {item.processed_time ? (
                        <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                            处理时间：{dayjs(item.processed_time).format('MM-DD HH:mm')}
                        </div>
                    ) : null}
                    {item.process_remark ? (
                        <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                            处理说明：{item.process_remark}
                        </div>
                    ) : null}
                    {item.cancel_reason ? (
                        <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                            关闭原因：{item.cancel_reason}
                        </div>
                    ) : null}
                    {item.reservation ? (
                        <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                            晋级结果：已生成预约 #{item.reservation.id}，请在上方预约记录中查看最新状态
                        </div>
                    ) : null}

                    <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                        {Number(item.queue_status ?? item.status) === 0 ? (
                            <Button size='small' color='danger' fill='outline' onClick={() => handleQueueCancel(item.id)}>
                                取消候补
                            </Button>
                        ) : null}
                    </div>
                </Card>
            ))}

            {filteredQueueList.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#999', marginTop: 24 }}>暂无候补记录</div>
            ) : null}

            <CenterPopup
                visible={evalVisible}
                onMaskClick={() => setEvalVisible(false)}
            >
                <div style={{ padding: 24, background: '#fff', borderRadius: 12, width: '80vw' }}>
                    <div style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>我的评价</div>
                    {currentEval ? (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ color: '#faad14', fontSize: 24, marginBottom: 12 }}>
                                {'★'.repeat(Math.round(currentEval.rating))}
                                {'☆'.repeat(5 - Math.round(currentEval.rating))}
                            </div>
                            <div style={{ fontSize: 16, color: '#333', background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
                                {currentEval.comment || '未填写评语'}
                            </div>
                            <div style={{ marginTop: 12, fontSize: 12, color: '#999', textAlign: 'right' }}>
                                {dayjs(currentEval.create_time).format('YYYY-MM-DD HH:mm')}
                            </div>
                        </div>
                    ) : null}
                    <div style={{ marginTop: 24 }}>
                        <Button block color='primary' onClick={() => setEvalVisible(false)}>
                            关闭
                        </Button>
                    </div>
                </div>
            </CenterPopup>
        </div>
    );
};

export default History;
