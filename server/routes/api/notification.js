const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/notificationController');
const auth = require('../../middlewares/auth');
const jwt = require('jsonwebtoken');
const { addClient, removeClient } = require('../../services/notificationHub');
const { buildNotificationSnapshot } = require('../../services/notificationService');

router.get('/me', auth, notificationController.getMyNotifications);
router.get('/unread', auth, notificationController.getUnreadCount);
router.put('/:id/read', auth, notificationController.markRead);
router.put('/read-all', auth, notificationController.markAllRead);

// SSE push stream
router.get('/stream', async (req, res) => {
    const token = req.query.token || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ code: 401, msg: '无 Token，拒绝访问' });
    }
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        return res.status(401).json({ code: 401, msg: 'Token 无效' });
    }

    const userId = decoded.user?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, msg: 'Token 无效' });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.socket?.setKeepAlive?.(true);
    res.write('retry: 3000\n\n');

    addClient(userId, res);

    const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
            res.write(': keepalive\n\n');
        }
    }, 25000);

    try {
        const snapshot = await buildNotificationSnapshot(userId);
        res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    } catch (err) {
        clearInterval(heartbeat);
        removeClient(userId, res);
        return res.end();
    }

    req.on('close', () => {
        clearInterval(heartbeat);
        removeClient(userId, res);
    });
});

module.exports = router;
