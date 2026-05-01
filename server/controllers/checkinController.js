const { Op } = require('sequelize');
const sequelize = require('../config/db');
const Reservation = require('../models/Reservation');
const User = require('../models/User');
const Venue = require('../models/Venue');
const creditService = require('../services/creditService');
const { sendReservationNotification } = require('../services/notificationService');
const { VENUE_TOKEN_PREFIX } = require('../services/venueCheckinService');
const { success, error } = require('../utils/response');

const CHECKIN_WINDOW_MINUTES = 15;
const LATE_THRESHOLD_MINUTES = 5;

const buildVenueReservationWhere = ({ userId, venueId, isAdmin, status }) => {
  const where = {
    venue_id: venueId,
    status,
  };

  if (!isAdmin) {
    where.user_id = userId;
  }

  return where;
};

const findReservableReservationByVenue = async ({ userId, venueId, isAdmin, transaction }) => {
  const now = new Date();
  return Reservation.findOne({
    where: {
      ...buildVenueReservationWhere({ userId, venueId, isAdmin, status: 1 }),
      start_time: { [Op.lte]: new Date(now.getTime() + CHECKIN_WINDOW_MINUTES * 60000) },
      end_time: { [Op.gte]: now },
    },
    order: [['start_time', 'ASC']],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
};

const findUpcomingReservationByVenue = async ({ userId, venueId, isAdmin, transaction }) => (
  Reservation.findOne({
    where: {
      ...buildVenueReservationWhere({ userId, venueId, isAdmin, status: 1 }),
      start_time: { [Op.gt]: new Date() },
    },
    order: [['start_time', 'ASC']],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  })
);

const findCheckedinReservationByVenue = async ({ userId, venueId, isAdmin, transaction }) => {
  const now = new Date();
  return Reservation.findOne({
    where: {
      ...buildVenueReservationWhere({ userId, venueId, isAdmin, status: 2 }),
      end_time: { [Op.gte]: now },
    },
    order: [['start_time', 'ASC']],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
};

const resolveVenueId = async ({ venueId, venueToken, transaction }) => {
  if (venueToken) {
    const venue = await Venue.findOne({
      where: { checkin_token: venueToken },
      attributes: ['id'],
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });
    if (!venue) {
      return { errorMessage: '场地签到码无效' };
    }
    return { venueId: Number(venue.id), methodBase: 'venue_token' };
  }

  if (venueId !== undefined && venueId !== null && venueId !== '') {
    const normalizedVenueId = Number(venueId);
    if (!Number.isInteger(normalizedVenueId) || normalizedVenueId <= 0) {
      return { errorMessage: '场地签到码无效' };
    }
    return { venueId: normalizedVenueId, methodBase: 'venue_legacy' };
  }

  return { venueId: null, methodBase: null };
};

exports.checkin = async (req, res) => {
  try {
    const rawCheckinCode = typeof req.body?.checkinCode === 'string' ? req.body.checkinCode.trim() : '';
    const normalizedVenueToken = typeof req.body?.venueToken === 'string' ? req.body.venueToken.trim() : '';
    const normalizedVenueId = req.body?.venueId;
    const checkinCode = rawCheckinCode.startsWith(VENUE_TOKEN_PREFIX) || rawCheckinCode.startsWith('VENUE:')
      ? ''
      : rawCheckinCode;
    const venueToken = normalizedVenueToken || (
      rawCheckinCode.startsWith(VENUE_TOKEN_PREFIX)
        ? rawCheckinCode.slice(VENUE_TOKEN_PREFIX.length)
        : ''
    );
    const venueId = normalizedVenueId ?? (
      rawCheckinCode.startsWith('VENUE:')
        ? rawCheckinCode.split(':')[1]
        : null
    );
    const userId = Number(req.user.id);
    const isAdmin = Number(req.user.role) === 9;

    const result = await sequelize.transaction(async (transaction) => {
      const venueResolution = await resolveVenueId({ venueId, venueToken, transaction });
      if (venueResolution.errorMessage) {
        return { errorCode: 400, errorMessage: venueResolution.errorMessage };
      }

      let reservation = null;
      let methodBase = venueResolution.methodBase;

      if (venueResolution.venueId) {
        reservation = await findReservableReservationByVenue({
          userId,
          venueId: venueResolution.venueId,
          isAdmin,
          transaction,
        });

        if (!reservation) {
          const checkedinReservation = await findCheckedinReservationByVenue({
            userId,
            venueId: venueResolution.venueId,
            isAdmin,
            transaction,
          });
          if (checkedinReservation) {
            return {
              type: 'already',
              reservationId: checkedinReservation.id,
              userId: checkedinReservation.user_id,
            };
          }

          const upcomingReservation = await findUpcomingReservationByVenue({
            userId,
            venueId: venueResolution.venueId,
            isAdmin,
            transaction,
          });
          if (upcomingReservation) {
            return { errorCode: 400, errorMessage: `签到未开始，请在开始前 ${CHECKIN_WINDOW_MINUTES} 分钟内签到` };
          }

          return {
            errorCode: 404,
            errorMessage: isAdmin ? '当前时间段该场地没有可签到预约' : '当前时间段您在该场地没有可签到预约',
          };
        }
      } else if (checkinCode) {
        reservation = await Reservation.findOne({
          where: { checkin_code: checkinCode },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        methodBase = 'user_code';
      } else {
        return { errorCode: 400, errorMessage: '请提供场地签到码或用户签到码' };
      }

      if (!reservation) {
        return { errorCode: 404, errorMessage: '无效的签到码' };
      }

      if (reservation.user_id !== userId && !isAdmin) {
        return { errorCode: 403, errorMessage: '无权签到该预约' };
      }

      if (Number(reservation.status) === 2) {
        return {
          type: 'already',
          reservationId: reservation.id,
          userId: reservation.user_id,
        };
      }

      if (Number(reservation.status) !== 1) {
        return { errorCode: 400, errorMessage: '当前预约状态不允许签到' };
      }

      const now = new Date();
      const start = new Date(reservation.start_time);
      const end = new Date(reservation.end_time);

      if (now < new Date(start.getTime() - CHECKIN_WINDOW_MINUTES * 60000)) {
        return { errorCode: 400, errorMessage: `签到未开始，请在开始前 ${CHECKIN_WINDOW_MINUTES} 分钟内签到` };
      }

      if (now > end) {
        return { errorCode: 400, errorMessage: '预约已结束' };
      }

      const lateThreshold = new Date(start.getTime() + LATE_THRESHOLD_MINUTES * 60000);
      const isLate = now > lateThreshold;
      const delta = isLate ? -1 : 1;
      const reason = isLate ? '预约迟到签到' : '按时签到';
      const method = isAdmin ? `admin_scan_${methodBase}` : `user_scan_${methodBase}`;

      reservation.status = 2;
      reservation.checkin_time = now;
      reservation.checkin_method = method;
      reservation.checkin_operator_id = userId;
      await reservation.save({ transaction });

      await creditService.updateCredit(reservation.user_id, delta, reason, reservation.id, {
        eventKey: `reservation:${reservation.id}:checkin`,
        transaction,
      });

      const user = await User.findByPk(reservation.user_id, {
        attributes: ['id', 'real_name', 'username'],
        transaction,
      });

      return {
        type: 'success',
        reservationId: reservation.id,
        user,
        isLate,
      };
    });

    if (result?.errorMessage) {
      return error(res, result.errorCode || 400, result.errorMessage);
    }

    if (result?.type === 'already') {
      return success(res, { reservation_id: result.reservationId, checkin_status: 'already' }, '该预约已完成签到');
    }

    await sendReservationNotification(
      result.user.id,
      result.reservationId,
      result.isLate ? 'checkin_late' : 'checkin_success',
      result.isLate ? '迟到签到' : '签到成功',
      result.isLate ? '您已完成签到，但超过了规定时间，信用分 -1。' : '您已成功签到，信用分 +1。',
      result.isLate ? 'alert' : 'system',
    );

    success(
      res,
      {
        reservation_id: result.reservationId,
        user: result.user,
        checkin_status: result.isLate ? 'late' : 'normal',
      },
      '签到成功',
    );
  } catch (err) {
    console.error(err);
    error(res, 500, '服务器错误');
  }
};
