const schedule = require('node-schedule');
const { Op } = require('sequelize');
const Reservation = require('../models/Reservation');
const Venue = require('../models/Venue');
const creditService = require('./creditService');
const { cleanExpiredQueueEntries, processQueueForSlot } = require('./queueService');
const { sendReservationNotification } = require('./notificationService');

const CHECKIN_TIMEOUT_MINUTES = 15;
const LATE_THRESHOLD_MINUTES = 5;
const PENDING_REVIEW_TIMEOUT_MINUTES = Number(process.env.PENDING_REVIEW_TIMEOUT_MINUTES || 60);

const sendUpcomingReminders = async () => {
  const now = new Date();
  const inSixtyMinutes = new Date(now.getTime() + 60 * 60 * 1000);
  const reservations = await Reservation.findAll({
    where: {
      status: 1,
      start_time: { [Op.gt]: now, [Op.lte]: inSixtyMinutes },
    },
  });

  for (const reservation of reservations) {
    const venue = await Venue.findByPk(reservation.venue_id, { attributes: ['name'] });
    const startTime = new Date(reservation.start_time);
    const diffMinutes = Math.max(1, Math.floor((startTime.getTime() - now.getTime()) / 60000));

    if (diffMinutes > CHECKIN_TIMEOUT_MINUTES) {
      await sendReservationNotification(
        reservation.user_id,
        reservation.id,
        'upcoming_60',
        '活动即将开始',
        `您预约的 ${venue?.name || '场地'} 将在约 ${diffMinutes} 分钟后开始，请提前到场。`,
        'reminder',
      );
    }
  }
};

const sendCheckinCountdownReminders = async () => {
  const now = new Date();
  const reservations = await Reservation.findAll({
    where: {
      status: 1,
      start_time: { [Op.lte]: now },
      end_time: { [Op.gte]: now },
    },
  });

  for (const reservation of reservations) {
    const venue = await Venue.findByPk(reservation.venue_id, { attributes: ['name'] });
    const startTime = new Date(reservation.start_time);
    const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 60000));

    await sendReservationNotification(
      reservation.user_id,
      reservation.id,
      'checkin_countdown_start',
      '签到倒计时开始',
      `您预约的 ${venue?.name || '场地'} 已开始，请在 ${CHECKIN_TIMEOUT_MINUTES} 分钟内完成签到。`,
      'alert',
    );

    if (elapsedMinutes >= CHECKIN_TIMEOUT_MINUTES - LATE_THRESHOLD_MINUTES) {
      await sendReservationNotification(
        reservation.user_id,
        reservation.id,
        'checkin_countdown_last_5',
        '签到即将超时',
        `您预约的 ${venue?.name || '场地'} 还有 ${LATE_THRESHOLD_MINUTES} 分钟将因未签到被自动释放，请尽快签到。`,
        'alert',
      );
    }
  }
};

const releasePendingReviewReservations = async () => {
  const now = new Date();
  const pendingDeadline = new Date(now.getTime() - PENDING_REVIEW_TIMEOUT_MINUTES * 60000);
  const reservations = await Reservation.findAll({
    where: {
      status: 0,
      [Op.or]: [
        { create_time: { [Op.lte]: pendingDeadline } },
        { start_time: { [Op.lte]: now } },
      ],
    },
  });

  for (const reservation of reservations) {
    reservation.status = 3;
    reservation.review_time = now;
    reservation.review_remark = '待审核超时自动释放';
    reservation.cancel_time = now;
    reservation.cancel_source = 'system';
    reservation.cancel_reason = '待审核超时自动释放';
    await reservation.save();

    await sendReservationNotification(
      reservation.user_id,
      reservation.id,
      'pending_timeout_release',
      '预约自动关闭',
      '您的预约因待审核超时未处理，系统已自动释放该时段。',
      'alert',
    );

    await processQueueForSlot(reservation.venue_id, reservation.start_time, reservation.end_time);
  }
};

const releaseTimeoutReservations = async () => {
  const now = new Date();
  const deadline = new Date(now.getTime() - CHECKIN_TIMEOUT_MINUTES * 60000);
  const reservations = await Reservation.findAll({
    where: {
      status: 1,
      start_time: { [Op.lt]: deadline },
    },
  });

  for (const reservation of reservations) {
    reservation.status = 4;
    reservation.cancel_time = now;
    reservation.cancel_source = 'system';
    reservation.cancel_reason = '预约超时未签到，系统自动释放';
    await reservation.save();

    await creditService.updateCredit(reservation.user_id, -5, '预约超时违约', reservation.id, {
      eventKey: `reservation:${reservation.id}:timeout_violation`,
    });
    await sendReservationNotification(
      reservation.user_id,
      reservation.id,
      'timeout_release',
      '预约超时违约',
      '您已超过签到时间，预约已被系统自动释放并扣除信用分。',
      'alert',
    );
    await processQueueForSlot(reservation.venue_id, reservation.start_time, reservation.end_time);
  }
};

const startSchedulers = () => {
  schedule.scheduleJob('*/1 * * * *', async () => {
    try {
      await sendUpcomingReminders();
      await sendCheckinCountdownReminders();
      await releasePendingReviewReservations();
      await releaseTimeoutReservations();
      await cleanExpiredQueueEntries();
    } catch (err) {
      console.error('[Scheduler] Error:', err);
    }
  });
};

startSchedulers();

module.exports = {
  startSchedulers,
};
