const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendToUser } = require('./notificationHub');

const NOTIFICATION_LIMIT = 50;

const serializeNotification = (note) => {
  const source = typeof note?.toJSON === 'function' ? note.toJSON() : note;
  if (!source) return null;

  return {
    id: source.id,
    user_id: source.user_id,
    title: source.title,
    content: source.content,
    type: source.type,
    biz_type: source.biz_type ?? null,
    biz_id: source.biz_id ?? null,
    event_key: source.event_key ?? null,
    is_read: Boolean(source.is_read),
    create_time: source.create_time,
  };
};

const getUnreadCount = async (userId) => Notification.count({
  where: { user_id: userId, is_read: false },
});

const getRecentNotifications = async (userId, limit = NOTIFICATION_LIMIT) => {
  const list = await Notification.findAll({
    where: { user_id: userId },
    order: [['create_time', 'DESC']],
    limit,
  });

  return list.map(serializeNotification);
};

const buildNotificationSnapshot = async (userId, limit = NOTIFICATION_LIMIT) => {
  const [unreadCount, notifications] = await Promise.all([
    getUnreadCount(userId),
    getRecentNotifications(userId, limit),
  ]);

  return {
    type: 'snapshot',
    unreadCount,
    notifications,
  };
};

const pushNotificationCreated = async (userId, note) => {
  const unreadCount = await getUnreadCount(userId);
  const payload = {
    type: 'notification_created',
    unreadCount,
    notification: serializeNotification(note),
  };
  sendToUser(userId, payload);
  return payload;
};

const pushNotificationRead = async (userId, notificationId) => {
  const unreadCount = await getUnreadCount(userId);
  const payload = {
    type: 'notification_read',
    unreadCount,
    notificationId: Number(notificationId),
  };
  sendToUser(userId, payload);
  return payload;
};

const pushNotificationReadAll = async (userId) => {
  const payload = {
    type: 'notification_read_all',
    unreadCount: 0,
  };
  sendToUser(userId, payload);
  return payload;
};

const buildEventWhere = ({ userId, bizType = null, bizId = null, eventKey = null }) => ({
  user_id: userId,
  biz_type: bizType,
  biz_id: bizId,
  event_key: eventKey,
});

const hasSentEvent = async ({ userId, bizType = null, bizId = null, eventKey }) => {
  if (!eventKey) return false;

  const existing = await Notification.findOne({
    where: buildEventWhere({ userId, bizType, bizId, eventKey }),
    attributes: ['id'],
  });

  return Boolean(existing);
};

const sendNotification = async (userId, title, content, type = 'system', options = {}) => {
  try {
    const bizType = options.bizType ?? null;
    const bizId = options.bizId ?? null;
    const eventKey = options.eventKey ?? null;

    if (eventKey && await hasSentEvent({ userId, bizType, bizId, eventKey })) {
      return true;
    }

    const note = await Notification.create({
      user_id: userId,
      title,
      content,
      type,
      biz_type: bizType,
      biz_id: bizId,
      event_key: eventKey,
    });

    await pushNotificationCreated(userId, note);
    return true;
  } catch (err) {
    console.error('[Notification] Failed to save:', err);
    return false;
  }
};

const sendReservationNotification = async (userId, reservationId, eventKey, title, content, type = 'system') => {
  return sendNotification(userId, title, content, type, {
    bizType: 'reservation',
    bizId: reservationId,
    eventKey,
  });
};

const sendNotificationToAdmins = async (title, content, type = 'system', options = {}) => {
  try {
    const admins = await User.findAll({ where: { role: 9, status: 1 }, attributes: ['id'] });
    for (const admin of admins) {
      await sendNotification(admin.id, title, content, type, options);
    }
    return true;
  } catch (err) {
    console.error('[Notification] Failed to notify admins:', err);
    return false;
  }
};

module.exports = {
  buildNotificationSnapshot,
  hasSentEvent,
  pushNotificationRead,
  pushNotificationReadAll,
  sendNotification,
  sendReservationNotification,
  sendNotificationToAdmins,
  serializeNotification,
};
