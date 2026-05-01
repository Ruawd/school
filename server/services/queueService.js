const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const ReservationQueue = require('../models/ReservationQueue');
const Reservation = require('../models/Reservation');
const Venue = require('../models/Venue');
const User = require('../models/User');
const sequelize = require('../config/db');
const { sendNotification, sendNotificationToAdmins } = require('./notificationService');

const QUEUE_STATUS = {
    WAITING: 0,
    PROMOTED: 1,
    CLOSED: 2,
};

const buildQueueClosePayload = (reason, remark = reason) => ({
    status: QUEUE_STATUS.CLOSED,
    cancel_reason: reason,
    process_remark: remark,
    processed_time: new Date(),
});

const closeQueueEntry = async (entry, reason, remark = reason, transaction = null) => {
    if (!entry || Number(entry.status) !== QUEUE_STATUS.WAITING) return entry;
    return entry.update(buildQueueClosePayload(reason, remark), { transaction });
};

const notifyQueueClosed = async (entry, title, content, eventKey) => {
    await sendNotification(entry.user_id, title, content, 'system', {
        bizType: 'queue',
        bizId: entry.id,
        eventKey,
    });
};

const enqueue = async ({ user_id, venue_id, start_time, end_time, purpose, credit_score }) => {
    const exist = await ReservationQueue.findOne({
        where: {
            user_id,
            venue_id,
            start_time,
            end_time,
            status: QUEUE_STATUS.WAITING,
        }
    });

    if (exist) {
        if (exist.purpose !== purpose || Number(exist.credit_score || 0) !== Number(credit_score || 0)) {
            await exist.update({
                purpose,
                credit_score,
            });
        }
        return exist;
    }

    return ReservationQueue.create({
        user_id,
        venue_id,
        start_time,
        end_time,
        purpose,
        credit_score,
        status: QUEUE_STATUS.WAITING,
    });
};

const processQueueForSlot = async (venue_id, start_time, end_time) => {
    const now = new Date();
    const slotEnd = new Date(end_time);
    const slotStart = new Date(start_time);

    return sequelize.transaction(async (t) => {
        const candidates = await ReservationQueue.findAll({
            where: {
                venue_id,
                status: QUEUE_STATUS.WAITING,
                [Op.and]: [
                    { start_time: { [Op.lt]: end_time } },
                    { end_time: { [Op.gt]: start_time } }
                ]
            },
            order: [
                ['credit_score', 'DESC'],
                ['create_time', 'ASC']
            ],
            lock: t.LOCK.UPDATE,
            transaction: t
        });

        if (slotEnd <= now || slotStart <= now) {
            for (const item of candidates) {
                await closeQueueEntry(item, '候补时段已开始或结束，系统自动关闭', '候补未能在场地释放前完成晋级，系统已自动关闭', t);
            }
            return null;
        }

        for (const item of candidates) {
            if (new Date(item.end_time) <= now) {
                await closeQueueEntry(item, '候补时段已结束，系统自动关闭', undefined, t);
                continue;
            }

            const candidateUser = await User.findByPk(item.user_id, {
                attributes: ['id', 'status', 'credit_score'],
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            if (!candidateUser || Number(candidateUser.status) !== 1) {
                await closeQueueEntry(item, '账号不可用，候补已自动关闭', '候补用户账号不存在或已被禁用', t);
                continue;
            }
            if (Number(candidateUser.credit_score || 0) < 60) {
                await closeQueueEntry(item, '当前信用分不足，候补已自动关闭', '候补晋级时检测到信用分低于预约门槛', t);
                continue;
            }

            const conflict = await Reservation.findOne({
                where: {
                    venue_id,
                    status: { [Op.in]: [0, 1, 2] },
                    [Op.and]: [
                        { start_time: { [Op.lt]: item.end_time } },
                        { end_time: { [Op.gt]: item.start_time } }
                    ]
                },
                lock: t.LOCK.UPDATE,
                transaction: t
            });

            if (conflict) {
                continue;
            }

            const reservation = await Reservation.create({
                user_id: item.user_id,
                venue_id: item.venue_id,
                start_time: item.start_time,
                end_time: item.end_time,
                purpose: item.purpose,
                status: 0,
                checkin_code: uuidv4(),
                review_remark: '候补晋级生成，等待管理员审核',
                queue_entry_id: item.id,
            }, { transaction: t });

            await item.update({
                status: QUEUE_STATUS.PROMOTED,
                promoted_reservation_id: reservation.id,
                process_remark: '候补成功，已转为待审核预约',
                processed_time: new Date(),
            }, { transaction: t });

            const venue = await Venue.findByPk(item.venue_id, { transaction: t });
            await sendNotification(item.user_id, '候补已晋级', `您候补的 ${venue?.name || '场地'} 已释放，系统已为您生成待审核预约。`, 'approve', {
                bizType: 'queue',
                bizId: item.id,
                eventKey: 'queue_promoted',
            });
            await sendNotificationToAdmins('候补预约待审核', `有候补预约已晋级待审核：${venue?.name || '场地'}。`, 'alert', {
                bizType: 'queue',
                bizId: item.id,
                eventKey: 'queue_promoted_admin',
            });

            return reservation;
        }

        return null;
    });
};

const cleanExpiredQueueEntries = async () => {
    const now = new Date();
    const list = await ReservationQueue.findAll({
        where: {
            status: QUEUE_STATUS.WAITING,
            end_time: { [Op.lt]: now },
        },
    });

    for (const item of list) {
        await closeQueueEntry(item, '候补时段已结束，系统自动关闭');
        await notifyQueueClosed(item, '候补已关闭', '您的候补时段已结束，系统已自动关闭该候补记录。', 'queue_expired');
    }
}

const cancelQueueEntry = async ({ queueId, userId, isAdmin = false, reason = '' }) => {
    return sequelize.transaction(async (t) => {
        const queue = await ReservationQueue.findByPk(queueId, {
            include: [
                { model: Venue, as: 'venue', attributes: ['name'] },
                { model: User, as: 'user', attributes: ['id', 'real_name', 'username'] },
            ],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!queue) return { code: 'NOT_FOUND' };
        if (!isAdmin && Number(queue.user_id) !== Number(userId)) return { code: 'FORBIDDEN' };
        if (Number(queue.status) !== QUEUE_STATUS.WAITING) return { code: 'INVALID_STATUS', queue };

        const finalReason = reason || (isAdmin ? '管理员取消候补' : '用户主动取消候补');
        await queue.update(buildQueueClosePayload(finalReason), { transaction: t });

        if (isAdmin) {
            await sendNotification(queue.user_id, '候补已取消', `管理员已取消您在 ${queue.venue?.name || '场地'} 的候补记录。`, 'alert', {
                bizType: 'queue',
                bizId: queue.id,
                eventKey: 'queue_cancelled_by_admin',
            });
        }

        return { code: 'OK', queue };
    });
};

const getMyQueueEntries = async (userId) => ReservationQueue.findAll({
    where: { user_id: userId },
    include: [
        { model: Venue, as: 'venue', attributes: ['name', 'image_url', 'equipment', 'open_start', 'open_end'] },
        { model: Reservation, as: 'reservation', foreignKey: 'queue_entry_id', required: false },
    ],
    order: [['create_time', 'DESC']],
});

const getAllQueueEntries = async () => ReservationQueue.findAll({
    include: [
        { model: Venue, as: 'venue', attributes: ['name'] },
        { model: User, as: 'user', attributes: ['real_name', 'username'] },
        { model: Reservation, as: 'reservation', foreignKey: 'queue_entry_id', required: false },
    ],
    order: [['create_time', 'DESC']],
});

ReservationQueue.hasOne(Reservation, { foreignKey: 'queue_entry_id', as: 'reservation' });

module.exports = {
    QUEUE_STATUS,
    enqueue,
    processQueueForSlot,
    cleanExpiredQueueEntries,
    cancelQueueEntry,
    getMyQueueEntries,
    getAllQueueEntries,
    closeQueueEntry,
};
