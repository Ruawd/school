const Notification = require('../models/Notification');
const { success, error } = require('../utils/response');
const { pushNotificationRead, pushNotificationReadAll } = require('../services/notificationService');

// 获取我的通知
exports.getMyNotifications = async (req, res) => {
    try {
        const list = await Notification.findAll({
            where: { user_id: req.user.id },
            order: [['create_time', 'DESC']],
            limit: 50 // Limit to recent 50
        });
        success(res, list);
    } catch (err) {
        console.error(err);
        error(res, 500, '服务器错误');
    }
};

// 获取未读数量
exports.getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.count({
            where: { user_id: req.user.id, is_read: false }
        });
        success(res, { count });
    } catch (err) {
        error(res, 500, '服务器错误');
    }
};

// 标记已读
exports.markRead = async (req, res) => {
    try {
        const { id } = req.params;
        const note = await Notification.findOne({
            where: { id, user_id: req.user.id }
        });
        if (note) {
            const wasUnread = !note.is_read;
            note.is_read = true;
            await note.save();
            if (wasUnread) {
                await pushNotificationRead(req.user.id, note.id);
            }
        }
        success(res, null);
    } catch (err) {
        error(res, 500, '服务器错误');
    }
};

// 全部已读
exports.markAllRead = async (req, res) => {
    try {
        const [updatedCount] = await Notification.update({ is_read: true }, {
            where: { user_id: req.user.id, is_read: false }
        });
        if (updatedCount > 0) {
            await pushNotificationReadAll(req.user.id);
        }
        success(res, null);
    } catch (err) {
        error(res, 500, '服务器错误');
    }
};
