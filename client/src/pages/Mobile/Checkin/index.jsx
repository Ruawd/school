import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Button, Toast, Result, Tabs, Dialog } from 'antd-mobile';
import { QRCodeCanvas } from 'qrcode.react';
import { BrowserQRCodeReader } from '@zxing/browser';
import axios from '../../../services/request';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import dayjs from 'dayjs';

const isCameraSecureContext = () => {
    if (typeof window === 'undefined') return true;
    const host = window.location.hostname;
    return window.isSecureContext || ['localhost', '127.0.0.1', '::1'].includes(host);
};

const getCameraErrorMessage = (err) => {
    switch (err?.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            return '摄像头权限被拒绝了，请在浏览器里允许访问摄像头后重试';
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return '没有检测到可用摄像头，请检查设备或浏览器权限';
        case 'NotReadableError':
        case 'TrackStartError':
            return '摄像头正被其他应用占用，请关闭后重试';
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
            return '当前摄像头不支持所选模式，请切换其他摄像头重试';
        case 'SecurityError':
            return '当前访问地址不支持摄像头，请使用 localhost 或 HTTPS 打开页面';
        default:
            return '无法启动摄像头，请检查浏览器权限，或先用拍照识别';
    }
};
const logCheckinDebug = (action, error) => {
    if (import.meta.env.DEV) {
        console.debug(`[Checkin] ${action}`, error);
    }
};

const buildCheckinPayload = (code) => {
    const value = String(code || '').trim();
    if (value.startsWith('VENUE_TOKEN:')) {
        return { venueToken: value.slice('VENUE_TOKEN:'.length) };
    }
    if (value.startsWith('VENUE:')) {
        return { venueId: value.split(':')[1] };
    }
    return { checkinCode: value };
};

const Checkin = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const notificationStream = useOutletContext() || {};
    const { reservation, fromAdmin } = location.state || {};
    const notificationList = notificationStream.notifications || [];

    const [loading, setLoading] = useState(false);
    const [cameraLoading, setCameraLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(fromAdmin ? 'scan' : 'code');
    const [now, setNow] = useState(new Date());
    const [devices, setDevices] = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [scanning, setScanning] = useState(false);
    const [scanTip, setScanTip] = useState('');
    const [scanUser, setScanUser] = useState(null);
    const [scanDialogVisible, setScanDialogVisible] = useState(false);
    const videoRef = useRef(null);
    const readerRef = useRef(null);
    const controlsRef = useRef(null);
    const tipTimerRef = useRef(null);
    const currentUser = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
    })();
    const isAdmin = Number(currentUser?.role) === 9;
    const reservationNoticeId = useMemo(() => {
        if (!reservation?.id) return 0;
        const matched = notificationList.find((notification) => (
            notification?.biz_type === 'reservation' && Number(notification?.biz_id) === Number(reservation.id)
        ));
        return Number(matched?.id || 0);
    }, [notificationList, reservation?.id]);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (fromAdmin) {
            setActiveTab('scan');
        }
    }, [fromAdmin]);

    const loadDevices = async () => {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        try {
            const list = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = list.filter((item) => item.kind === 'videoinput');
            setDevices(videoInputs);
            if (videoInputs.length && !videoInputs.some((item) => item.deviceId === deviceId)) {
                setDeviceId(videoInputs[0].deviceId);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const stopScan = () => {
        try {
            controlsRef.current?.stop();
            controlsRef.current = null;
        } catch (error) {
            logCheckinDebug('stopScan:controls', error);
        }

        const stream = videoRef.current?.srcObject;
        if (stream instanceof MediaStream) {
            stream.getTracks().forEach((track) => track.stop());
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        try {
            BrowserQRCodeReader.releaseAllStreams();
        } catch (error) {
            logCheckinDebug('stopScan:releaseStreams', error);
        }

        setScanning(false);
    };

    const handleCheckin = async (code) => {
        setLoading(true);
        setScanTip('识别成功，正在签到...');
        try {
            const payload = buildCheckinPayload(code);
            const res = await axios.post('/checkin', payload);
            if (res.code === 200) {
                const status = res.data?.checkin_status;
                const successText = status === 'already'
                    ? '该预约已完成签到'
                    : status === 'late'
                        ? '签到成功，信用分 -1'
                        : '签到成功，信用分 +1';
                Toast.show({ icon: 'success', content: successText });
                setScanTip(status === 'already' ? '该预约已完成签到' : '签到成功');
                if (activeTab === 'scan' && isAdmin && status !== 'already') {
                    setScanUser(res.data?.user || null);
                    setScanDialogVisible(true);
                } else {
                    setActiveTab('code');
                    if (reservation && code === reservation.checkin_code) {
                        navigate('/history');
                    }
                }
            } else {
                Toast.show({ icon: 'fail', content: res.msg || '签到失败' });
                setScanTip('签到失败，请重试');
            }
        } catch (err) {
            console.error(err);
            Toast.show({ icon: 'fail', content: '签到失败，请重试' });
            setScanTip('签到失败，请重试');
        } finally {
            setLoading(false);
            clearTimeout(tipTimerRef.current);
            tipTimerRef.current = setTimeout(() => setScanTip(''), 3000);
        }
    };

    const decodeCallback = (result, err, controls) => {
        if (result) {
            Toast.show({ icon: 'loading', content: '识别成功，正在签到...' });
            try {
                controls?.stop();
                controlsRef.current = null;
            } catch (error) {
                logCheckinDebug('decodeCallback:stopControls', error);
            }
            setScanning(false);
            setScanTip('识别成功，正在签到...');
            handleCheckin(result.getText());
            return;
        }

        if (err?.name === 'NotFoundException') {
            return;
        }

        if (err && err?.name !== 'ChecksumException' && err?.name !== 'FormatException') {
            console.error(err);
        }
    };

    const startScan = async (preferredDeviceId = '') => {
        if (cameraLoading) return;
        if (!videoRef.current) {
            Toast.show({ icon: 'fail', content: '扫码组件还没准备好，请稍后重试' });
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            const message = '当前浏览器不支持摄像头调用，请改用拍照识别';
            setScanTip(message);
            Toast.show({ icon: 'fail', content: message });
            return;
        }
        if (!isCameraSecureContext()) {
            const message = '当前访问地址不是安全环境，浏览器不会开放摄像头。请用 localhost 或 HTTPS 打开，也可以先用拍照识别。';
            setScanTip(message);
            Toast.show({ icon: 'fail', content: '当前地址不支持摄像头' });
            return;
        }

        try {
            setCameraLoading(true);
            stopScan();
            setScanTip('正在打开摄像头...');

            const videoElement = videoRef.current;
            videoElement.setAttribute('playsinline', 'true');
            videoElement.setAttribute('webkit-playsinline', 'true');
            videoElement.muted = true;
            videoElement.autoplay = true;

            if (!readerRef.current) {
                readerRef.current = new BrowserQRCodeReader();
            }

            const nextDeviceId = preferredDeviceId || deviceId;
            const constraints = nextDeviceId
                ? { audio: false, video: { deviceId: { exact: nextDeviceId } } }
                : { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };

            const controls = await readerRef.current.decodeFromConstraints(
                constraints,
                videoElement,
                decodeCallback,
            );

            controlsRef.current = controls;
            setScanning(true);
            setScanTip('摄像头已开启，请将二维码放入取景框内');
            await loadDevices();
            if (preferredDeviceId && preferredDeviceId !== deviceId) {
                setDeviceId(preferredDeviceId);
            }
        } catch (err) {
            console.error(err);
            const message = getCameraErrorMessage(err);
            setScanTip(message);
            stopScan();
            Toast.show({ icon: 'fail', content: message });
        } finally {
            setCameraLoading(false);
        }
    };

    const handleImageFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        try {
            if (!readerRef.current) {
                readerRef.current = new BrowserQRCodeReader();
            }
            const result = await readerRef.current.decodeFromImageUrl(url);
            await handleCheckin(result.getText());
        } catch {
            Toast.show({ icon: 'fail', content: '未识别到二维码' });
        } finally {
            URL.revokeObjectURL(url);
            e.target.value = '';
        }
    };

    useEffect(() => {
        if (!reservation?.id || !reservationNoticeId) return;
        let active = true;

        const syncReservationStatus = async () => {
            try {
                const res = await axios.get('/reservations/me');
                if (!active || res.code !== 200) return;
                const current = res.data.find((item) => item.id === reservation.id);
                if (current && current.status === 2) {
                    Toast.show({ icon: 'success', content: '签到成功' });
                    navigate('/history');
                }
            } catch (error) {
                logCheckinDebug('syncReservationStatus', error);
            }
        };

        void syncReservationStatus();
        return () => {
            active = false;
        };
    }, [navigate, reservation?.id, reservationNoticeId]);

    useEffect(() => {
        if (activeTab === 'scan') {
            loadDevices();
            startScan();
        } else {
            stopScan();
        }

        return () => {
            stopScan();
            clearTimeout(tipTimerRef.current);
        };
    }, [activeTab]);

    return (
        <div style={{ padding: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' }}>签到验证</div>

            <Tabs activeKey={activeTab} onChange={setActiveTab}>
                <Tabs.Tab title='我的签到码' key='code'>
                    {reservation ? (
                        <Card style={{ marginTop: 16, textAlign: 'center' }}>
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1677ff' }}>
                                    {dayjs(now).format('HH:mm:ss')}
                                </div>
                                <div style={{ fontSize: 13, color: '#999', marginBottom: 12 }}>
                                    当前时间 ({dayjs(now).format('YYYY-MM-DD')})
                                </div>
                                <div style={{ borderTop: '1px dashed #eee', paddingTop: 12 }}>
                                    <div style={{ fontSize: 18, fontWeight: 'bold' }}>{reservation.venue?.name}</div>
                                    <div style={{ color: '#faad14', fontSize: 14 }}>
                                        预约时段：{dayjs(reservation.start_time).format('HH:mm')} - {dayjs(reservation.end_time).format('HH:mm')}
                                    </div>
                                </div>
                            </div>
                            <div style={{ background: '#fff', padding: 16, display: 'flex', justifyContent: 'center', borderRadius: 8, boxShadow: 'inset 0 0 10px rgba(0,0,0,0.05)' }}>
                                <QRCodeCanvas value={reservation.checkin_code} size={200} />
                            </div>
                            <div style={{ marginTop: 12, color: '#666', fontSize: 13 }}>
                                请出示二维码进行核验
                            </div>
                        </Card>
                    ) : (
                        <Result status='warning' title='未选择预约' description='请从“我的预约”列表中选择进行签到' />
                    )}
                </Tabs.Tab>

                <Tabs.Tab title='扫一扫' key='scan'>
                    <Card style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ fontSize: 13, color: '#666' }}>选择摄像头</div>
                                <select
                                    value={deviceId}
                                    onChange={(e) => startScan(e.target.value)}
                                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                                >
                                    {devices.length ? devices.map((item) => (
                                        <option key={item.deviceId} value={item.deviceId}>{item.label || '摄像头'}</option>
                                    )) : <option value=''>自动选择</option>}
                                </select>
                            </div>
                            <div style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden', background: '#f5f5f5' }}>
                                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: 260, objectFit: 'cover' }} />
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        width: 180,
                                        height: 180,
                                        transform: 'translate(-50%, -50%)',
                                        border: '2px solid rgba(22,119,255,0.9)',
                                        borderRadius: 12,
                                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.15)',
                                        pointerEvents: 'none',
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                <Button size='small' color='primary' onClick={scanning ? stopScan : () => startScan()} loading={loading || cameraLoading}>
                                    {scanning ? '停止扫码' : '开始扫码签到'}
                                </Button>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <input type='file' accept='image/*' capture='environment' onChange={handleImageFile} style={{ display: 'none' }} />
                                    <Button size='small' fill='outline'>拍照/图片识别</Button>
                                </label>
                            </div>
                            {scanTip ? (
                                <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#1677ff', lineHeight: 1.6 }}>
                                    {scanTip}
                                </div>
                            ) : null}
                        </div>
                        <div style={{ textAlign: 'center', marginTop: 12, color: '#999' }}>
                            {isAdmin ? '请将摄像头对准用户签到码；现场也可以直接扫描当前场地签到码' : '请将摄像头对准场地签到码'}
                        </div>
                    </Card>
                </Tabs.Tab>
            </Tabs>

            <Dialog
                visible={scanDialogVisible}
                content={scanUser ? `用户 ${scanUser.real_name || scanUser.username || scanUser.id} 签到成功` : '签到成功'}
                confirmText='继续扫码'
                onConfirm={() => {
                    setScanDialogVisible(false);
                    setScanUser(null);
                    if (isAdmin && !scanning) startScan();
                }}
                onClose={() => {
                    setScanDialogVisible(false);
                    setScanUser(null);
                }}
            />
        </div>
    );
};

export default Checkin;
