const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const Reservation = require('../models/Reservation');
const Venue = require('../models/Venue');
const User = require('../models/User');
const Evaluation = require('../models/Evaluation');
const batchService = require('../services/batchService');
const { sendNotification, sendNotificationToAdmins, sendReservationNotification } = require('../services/notificationService');
const {
  QUEUE_STATUS,
  cancelQueueEntry: cancelQueueEntryService,
  enqueue,
  getAllQueueEntries: getAllQueueEntriesService,
  getMyQueueEntries: getMyQueueEntriesService,
  processQueueForSlot,
} = require('../services/queueService');
const sequelize = require('../config/db');
const { success, error } = require('../utils/response');
const {
  OCCUPY_STATUSES,
  buildDateTime,
  buildOccurrenceDates,
  createPendingReservation,
  ensureUserCanReserve,
  formatDateKey,
  getAdvanceWindowDays,
} = require('../services/reservationRulesService');
const REPORT_OCCUPY_STATUSES = [1, 2, 4];
const CANCELLABLE_RESERVATION_STATUSES = [0, 1];

const round2 = (value) => Number(value.toFixed(2));

const getDurationHours = (start, end) => {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return diff > 0 ? diff / 3600000 : 0;
};

const getOverlapHours = (start, end, rangeStart, rangeEnd) => {
  const overlapStart = Math.max(new Date(start).getTime(), rangeStart.getTime());
  const overlapEnd = Math.min(new Date(end).getTime(), rangeEnd.getTime());
  return overlapEnd > overlapStart ? (overlapEnd - overlapStart) / 3600000 : 0;
};

const getPeriod = (range, rawDate) => {
  const input = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(input.getTime())) {
    throw Object.assign(new Error('统计日期格式无效'), { statusCode: 400 });
  }

  let start;
  let end;

  if (range === 'weekly') {
    const current = new Date(input);
    current.setHours(0, 0, 0, 0);
    const weekday = current.getDay();
    const mondayOffset = weekday === 0 ? 6 : weekday - 1;
    start = new Date(current);
    start.setDate(current.getDate() - mondayOffset);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (range === 'monthly') {
    start = new Date(input.getFullYear(), input.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(input.getFullYear(), input.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    throw Object.assign(new Error('统计周期参数无效'), { statusCode: 400 });
  }

  return {
    range,
    start,
    end,
    label: `${formatDateKey(start)} 至 ${formatDateKey(end)}`,
  };
};

const getOpenHoursPerDay = (venue) => {
  const startParts = String(venue.open_start || '08:00:00').split(':').map((item) => Number(item) || 0);
  const endParts = String(venue.open_end || '22:00:00').split(':').map((item) => Number(item) || 0);
  const startMinutes = startParts[0] * 60 + startParts[1] + startParts[2] / 60;
  const endMinutes = endParts[0] * 60 + endParts[1] + endParts[2] / 60;
  return endMinutes > startMinutes ? (endMinutes - startMinutes) / 60 : 0;
};

const serializeQueueEntry = (entry) => {
  const plain = typeof entry?.toJSON === 'function' ? entry.toJSON() : entry;
  if (!plain) return null;
  return {
    ...plain,
    queue_status: Number(plain.status),
  };
};

const getReservationCancelReason = ({ isAdmin, currentStatus, reason }) => {
  if (String(reason || '').trim()) {
    return String(reason).trim();
  }
  if (isAdmin) {
    return currentStatus === 0 ? '管理员驳回预约' : '管理员取消预约';
  }
  return currentStatus === 0 ? '用户主动取消待审核预约' : '用户主动取消预约';
};

const buildReport = async (range, rawDate) => {
  const period = getPeriod(range, rawDate);
  const reservations = await Reservation.findAll({
    where: {
      start_time: { [Op.lt]: period.end },
      end_time: { [Op.gt]: period.start },
    },
    include: [
      { model: Venue, as: 'venue', attributes: ['id', 'name', 'type_id', 'open_start', 'open_end'] },
      { model: User, as: 'user', attributes: ['id', 'real_name', 'username'] },
    ],
    order: [['start_time', 'ASC']],
  });

  const venues = await Venue.findAll({
    attributes: ['id', 'name', 'type_id', 'open_start', 'open_end'],
    raw: true,
  });

  const dayBuckets = [];
  const cursor = new Date(period.start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= period.end) {
    dayBuckets.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const trendMap = new Map(dayBuckets.map((day) => [day, {
    date: day,
    reservationCount: 0,
    approvedCount: 0,
    checkedInCount: 0,
    violationCount: 0,
    reservedHours: 0,
    actualHours: 0,
  }]));

  const typeSummaryMap = new Map();
  const venueSummaryMap = new Map();
  const dayCount = dayBuckets.length;

  let pendingCount = 0;
  let approvedCount = 0;
  let checkedInCount = 0;
  let cancelledCount = 0;
  let violationCount = 0;
  let reservedHours = 0;
  let actualHours = 0;

  for (const venue of venues) {
    venueSummaryMap.set(venue.id, {
      venueId: venue.id,
      venueName: venue.name,
      reservationCount: 0,
      approvedCount: 0,
      checkedInCount: 0,
      violationCount: 0,
      reservedHours: 0,
      actualHours: 0,
      openHours: round2(getOpenHoursPerDay(venue) * dayCount),
    });
  }

  for (const reservation of reservations) {
    const currentVenue = reservation.venue;
    const trendDate = formatDateKey(new Date(Math.max(new Date(reservation.start_time).getTime(), period.start.getTime())));
    const bucket = trendMap.get(trendDate);
    if (bucket) bucket.reservationCount += 1;

    switch (Number(reservation.status)) {
      case 0:
        pendingCount += 1;
        break;
      case 1:
        approvedCount += 1;
        if (bucket) bucket.approvedCount += 1;
        break;
      case 2:
        checkedInCount += 1;
        if (bucket) bucket.checkedInCount += 1;
        break;
      case 3:
        cancelledCount += 1;
        break;
      case 4:
        violationCount += 1;
        if (bucket) bucket.violationCount += 1;
        break;
      default:
        break;
    }

    const overlapHours = REPORT_OCCUPY_STATUSES.includes(Number(reservation.status))
      ? getOverlapHours(reservation.start_time, reservation.end_time, period.start, period.end)
      : 0;
    const actualOverlapHours = Number(reservation.status) === 2
      ? getOverlapHours(reservation.start_time, reservation.end_time, period.start, period.end)
      : 0;

    reservedHours += overlapHours;
    actualHours += actualOverlapHours;

    if (bucket) {
      bucket.reservedHours = round2(bucket.reservedHours + overlapHours);
      bucket.actualHours = round2(bucket.actualHours + actualOverlapHours);
    }

    if (currentVenue) {
      if (!typeSummaryMap.has(currentVenue.type_id || 0)) {
        typeSummaryMap.set(currentVenue.type_id || 0, {
          typeId: currentVenue.type_id || 0,
          reservationCount: 0,
          reservedHours: 0,
          actualHours: 0,
        });
      }

      const typeItem = typeSummaryMap.get(currentVenue.type_id || 0);
      typeItem.reservationCount += 1;
      typeItem.reservedHours = round2(typeItem.reservedHours + overlapHours);
      typeItem.actualHours = round2(typeItem.actualHours + actualOverlapHours);

      const venueItem = venueSummaryMap.get(currentVenue.id) || {
        venueId: currentVenue.id,
        venueName: currentVenue.name,
        reservationCount: 0,
        approvedCount: 0,
        checkedInCount: 0,
        violationCount: 0,
        reservedHours: 0,
        actualHours: 0,
        openHours: round2(getOpenHoursPerDay(currentVenue) * dayCount),
      };

      venueItem.reservationCount += 1;
      if (Number(reservation.status) === 1) venueItem.approvedCount += 1;
      if (Number(reservation.status) === 2) venueItem.checkedInCount += 1;
      if (Number(reservation.status) === 4) venueItem.violationCount += 1;
      venueItem.reservedHours = round2(venueItem.reservedHours + overlapHours);
      venueItem.actualHours = round2(venueItem.actualHours + actualOverlapHours);
      venueSummaryMap.set(currentVenue.id, venueItem);
    }
  }

  const totalOpenHours = round2(venues.reduce((sum, venue) => sum + getOpenHoursPerDay(venue) * dayCount, 0));
  const utilizationRate = totalOpenHours > 0 ? round2((reservedHours / totalOpenHours) * 100) : 0;
  const actualUtilizationRate = totalOpenHours > 0 ? round2((actualHours / totalOpenHours) * 100) : 0;

  const venueRank = Array.from(venueSummaryMap.values())
    .map((item) => ({
      ...item,
      utilizationRate: item.openHours > 0 ? round2((item.reservedHours / item.openHours) * 100) : 0,
      actualUtilizationRate: item.openHours > 0 ? round2((item.actualHours / item.openHours) * 100) : 0,
    }))
    .sort((a, b) => b.reservedHours - a.reservedHours || b.reservationCount - a.reservationCount);

  const typeSummary = Array.from(typeSummaryMap.values())
    .sort((a, b) => b.reservedHours - a.reservedHours || b.reservationCount - a.reservationCount);

  return {
    range,
    period: {
      start: period.start,
      end: period.end,
      label: period.label,
    },
    summary: {
      reservationCount: reservations.length,
      pendingCount,
      approvedCount,
      checkedInCount,
      cancelledCount,
      violationCount,
      reservedHours: round2(reservedHours),
      actualHours: round2(actualHours),
      totalOpenHours,
      utilizationRate,
      actualUtilizationRate,
    },
    trend: Array.from(trendMap.values()),
    venueRank,
    typeSummary,
  };
};

exports.createBatchReservation = async (req, res) => {
  try {
    const data = { ...req.body, user_id: req.user.id };
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return error(res, 404, '用户不存在');
    }

    if (!data.venue_id || !data.start_date || !data.end_date || !data.start_time || !data.end_time || !data.purpose) {
      return error(res, 400, '请完整填写场地、周期、时段和用途');
    }

    if (!Array.isArray(data.weeks) || !data.weeks.length) {
      return error(res, 400, '请至少选择一个重复星期');
    }

    const maxAdvanceDays = getAdvanceWindowDays(user.credit_score);
    const firstOccurrence = buildOccurrenceDates({
      startDate: data.start_date,
      endDate: data.end_date,
      weeks: data.weeks,
    })[0];
    ensureUserCanReserve(user, buildDateTime(firstOccurrence, data.start_time));

    data.credit_score = user.credit_score;
    const result = await batchService.createBatchReservations(data, { user });

    await sendNotification(
      req.user.id,
      '批量预约结果已生成',
      `本次批量预约共处理 ${result.total} 个时段，成功 ${result.success.length} 个，候补 ${result.queued.length} 个，失败 ${result.failed.length} 个。`,
      'system',
    );
    await sendNotificationToAdmins(
      '有新的批量预约申请',
      `${req.user.real_name || req.user.username} 提交了批量预约，成功 ${result.success.length} 个，候补 ${result.queued.length} 个。`,
      'alert',
    );

    success(
      res,
      { ...result, maxAdvanceDays },
      `批量预约处理完成：成功 ${result.success.length} 个，候补 ${result.queued.length} 个，失败 ${result.failed.length} 个`,
    );
  } catch (err) {
    console.error(err);
    error(res, err.statusCode || 500, err.message || '批量预约处理失败');
  }
};

exports.createReservation = async (req, res) => {
  try {
    const { venue_id, start_time, end_time, purpose } = req.body;
    const user_id = req.user.id;

    if (!venue_id || !start_time || !end_time || !purpose) {
      return error(res, 400, '请完整填写场地、时间和用途');
    }

    const user = await User.findByPk(user_id);
    if (!user) {
      return error(res, 404, '用户不存在');
    }

    const reservation = await sequelize.transaction(async (t) => {
      const { reservation: created } = await createPendingReservation({
        userId: user_id,
        venueId: Number(venue_id),
        startTime: start_time,
        endTime: end_time,
        purpose,
        transaction: t,
        user,
      });

      return created;
    });

    await sendNotification(req.user.id, '预约申请已提交', '您的预约申请已提交，正在等待管理员审核。', 'system');
    await sendNotificationToAdmins(
      '有新的预约申请待审核',
      `${req.user.real_name || req.user.username} 提交了一条新的预约申请。`,
      'alert',
    );

    success(res, reservation, '预约申请提交成功，等待管理员审核');
  } catch (err) {
    console.error(err);
    if (err.code === 'TIME_CONFLICT') {
      const user = await User.findByPk(req.user.id);
      const queueEntry = await enqueue({
        user_id: req.user.id,
        venue_id: req.body.venue_id,
        start_time: req.body.start_time,
        end_time: req.body.end_time,
        purpose: req.body.purpose,
        credit_score: user?.credit_score || 0,
      });
      await sendNotification(req.user.id, '已加入候补队列', '该时段已有预约冲突，系统已自动为您加入候补队列。', 'system', {
        bizType: 'queue',
        bizId: queueEntry.id,
        eventKey: 'queue_waiting',
      });
      return success(res, { queue: serializeQueueEntry(queueEntry) }, '该时段已被占用，已自动加入候补队列');
    }
    if (err.statusCode) {
      return error(res, err.statusCode, err.message);
    }
    error(res, 500, '预约申请失败');
  }
};

exports.getMyReservations = async (req, res) => {
  try {
    const list = await Reservation.findAll({
      where: { user_id: req.user.id },
      include: [
        { model: Venue, as: 'venue', attributes: ['name', 'image_url', 'equipment', 'open_start', 'open_end'] },
        { model: Evaluation, as: 'evaluation' },
      ],
      order: [['create_time', 'DESC']],
    });
    success(res, list);
  } catch (err) {
    console.error(err);
    error(res, 500, '获取我的预约失败');
  }
};

exports.getMyQueueEntries = async (req, res) => {
  try {
    const list = await getMyQueueEntriesService(req.user.id);
    success(res, list.map(serializeQueueEntry));
  } catch (err) {
    console.error(err);
    error(res, 500, '获取我的候补记录失败');
  }
};

exports.getVenueSchedule = async (req, res) => {
  try {
    const { venue_id, date } = req.query;
    if (!venue_id || !date) {
      return error(res, 400, '请传入场地和日期');
    }

    const startOfDay = new Date(`${date} 00:00:00`);
    const endOfDay = new Date(`${date} 23:59:59`);
    if (Number.isNaN(startOfDay.getTime()) || Number.isNaN(endOfDay.getTime())) {
      return error(res, 400, '日期格式无效');
    }

    const list = await Reservation.findAll({
      where: {
        venue_id,
        status: { [Op.in]: OCCUPY_STATUSES },
        [Op.and]: [
          { start_time: { [Op.lt]: endOfDay } },
          { end_time: { [Op.gt]: startOfDay } },
        ],
      },
      attributes: ['id', 'start_time', 'end_time', 'status'],
      order: [['start_time', 'ASC']],
    });
    success(res, list);
  } catch (err) {
    console.error(err);
    error(res, 500, '获取场地日程失败');
  }
};

exports.cancelReservation = async (req, res) => {
  try {
    const isAdmin = Number(req.user.role) === 9;
    const operatorId = Number(req.user.id);
    const reason = String(req.body?.reason || req.body?.remarks || '').trim();
    const now = new Date();

    const reservation = await sequelize.transaction(async (transaction) => {
      const current = await Reservation.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!current) {
        throw Object.assign(new Error('预约不存在'), { statusCode: 404 });
      }

      if (Number(current.user_id) !== operatorId && !isAdmin) {
        throw Object.assign(new Error('无权取消该预约'), { statusCode: 403 });
      }

      if (!CANCELLABLE_RESERVATION_STATUSES.includes(Number(current.status))) {
        throw Object.assign(new Error('当前预约状态不允许取消'), { statusCode: 400 });
      }

      if (new Date(current.end_time) <= now) {
        throw Object.assign(new Error('预约已结束，无法取消'), { statusCode: 400 });
      }

      const currentStatus = Number(current.status);
      const cancelReason = getReservationCancelReason({ isAdmin, currentStatus, reason });

      current.status = 3;
      current.cancel_reason = cancelReason;
      current.cancel_source = isAdmin ? 'admin' : 'user';
      current.cancel_by = operatorId;
      current.cancel_time = now;
      if (currentStatus === 0 && !current.review_time) {
        current.review_time = now;
        current.review_remark = isAdmin ? cancelReason : '用户在审核前主动取消预约';
        if (isAdmin) {
          current.review_by = operatorId;
        }
      }
      await current.save({ transaction });

      return current;
    });

    await sendReservationNotification(
      reservation.user_id,
      reservation.id,
      isAdmin ? 'cancelled_by_admin' : 'cancelled_by_user',
      isAdmin ? '预约已被管理员取消' : '预约已取消',
      `您的预约已取消：${reservation.cancel_reason || '该时段已重新释放。'}`,
      isAdmin ? 'alert' : 'system',
    );
    await processQueueForSlot(reservation.venue_id, reservation.start_time, reservation.end_time);

    success(res, null, '预约取消成功');
  } catch (err) {
    console.error(err);
    error(res, err.statusCode || 500, err.message || '取消预约失败');
  }
};

exports.getReservationStats = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);

    const reservations = await Reservation.findAll({
      where: {
        start_time: { [Op.gte]: start, [Op.lt]: end },
        status: { [Op.ne]: 3 },
      },
      attributes: ['start_time'],
      raw: true,
    });

    const statsMap = new Map();
    reservations.forEach((item) => {
      const key = formatDateKey(item.start_time);
      statsMap.set(key, (statsMap.get(key) || 0) + 1);
    });

    const data = Array.from(statsMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => [date, count]);

    success(res, data);
  } catch (err) {
    console.error(err);
    error(res, 500, '获取预约统计失败');
  }
};

exports.getWeeklyReport = async (req, res) => {
  try {
    const report = await buildReport('weekly', req.query.date);
    success(res, report);
  } catch (err) {
    console.error(err);
    error(res, err.statusCode || 500, err.message || '获取周报失败');
  }
};

exports.getMonthlyReport = async (req, res) => {
  try {
    const report = await buildReport('monthly', req.query.date || req.query.month);
    success(res, report);
  } catch (err) {
    console.error(err);
    error(res, err.statusCode || 500, err.message || '获取月报失败');
  }
};

exports.getAllReservations = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status !== undefined && status !== '') where.status = Number(status);

    const list = await Reservation.findAll({
      where,
      include: [
        { model: Venue, as: 'venue', attributes: ['name'] },
        { model: User, as: 'user', attributes: ['real_name', 'username'] },
      ],
      order: [['create_time', 'DESC']],
    });
    success(res, list);
  } catch (err) {
    console.error(err);
    error(res, 500, '获取预约列表失败');
  }
};

exports.updateReservationStatus = async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const nextStatus = Number(status);
    const operatorId = Number(req.user.id);
    const reason = String(remarks || req.body?.reason || '').trim();
    if (![0, 1, 2, 3, 4].includes(nextStatus)) {
      return error(res, 400, '预约状态不合法');
    }

    if (Number(req.user.role) !== 9) {
      return error(res, 403, '无权操作');
    }

    if (nextStatus === 2) {
      return error(res, 400, '请使用签到接口完成签到');
    }

    const { reservation, currentStatus } = await sequelize.transaction(async (transaction) => {
      const current = await Reservation.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!current) {
        throw Object.assign(new Error('预约不存在'), { statusCode: 404 });
      }

      const currentStatusValue = Number(current.status);
      if (currentStatusValue === nextStatus) {
        return { reservation: current, currentStatus: currentStatusValue };
      }

      const now = new Date();

      if (nextStatus === 1) {
        if (currentStatusValue !== 0) {
          throw Object.assign(new Error('仅待审核预约可执行通过操作'), { statusCode: 400 });
        }
        current.status = 1;
        current.review_by = operatorId;
        current.review_time = now;
        current.review_remark = reason || '管理员审核通过';
        current.cancel_reason = null;
        current.cancel_source = null;
        current.cancel_by = null;
        current.cancel_time = null;
      } else if (nextStatus === 3) {
        if (![0, 1].includes(currentStatusValue)) {
          throw Object.assign(new Error('当前预约状态不允许取消/驳回'), { statusCode: 400 });
        }
        const cancelReason = getReservationCancelReason({
          isAdmin: true,
          currentStatus: currentStatusValue,
          reason,
        });
        current.status = 3;
        current.cancel_reason = cancelReason;
        current.cancel_source = 'admin';
        current.cancel_by = operatorId;
        current.cancel_time = now;
        if (currentStatusValue === 0) {
          current.review_by = operatorId;
          current.review_time = now;
          current.review_remark = cancelReason;
        }
      } else if (nextStatus === 4) {
        if (![0, 1].includes(currentStatusValue)) {
          throw Object.assign(new Error('仅待审核或已通过预约可标记为违约'), { statusCode: 400 });
        }
        current.status = 4;
        current.cancel_reason = reason || '管理员标记违约';
        current.cancel_source = 'admin';
        current.cancel_by = operatorId;
        current.cancel_time = now;
        if (currentStatusValue === 0) {
          current.review_by = operatorId;
          current.review_time = now;
          current.review_remark = reason || '管理员审核后标记违约';
        }
      }

      await current.save({ transaction });
      return { reservation: current, currentStatus: currentStatusValue };
    });

    const venue = await Venue.findByPk(reservation.venue_id);
    const venueName = venue?.name || '场地';

    if (currentStatus === nextStatus) {
      return success(res, reservation, '预约状态未变化');
    }

    if (nextStatus === 1) {
      await sendReservationNotification(
        reservation.user_id,
        reservation.id,
        'approved',
        '预约审核通过',
        `您提交的预约已审核通过：${venueName}${reservation.review_remark ? `，备注：${reservation.review_remark}` : '。'}`,
        'approve',
      );
    } else if (nextStatus === 3) {
      await sendReservationNotification(
        reservation.user_id,
        reservation.id,
        currentStatus === 0 ? 'rejected' : 'cancelled_by_admin',
        currentStatus === 0 ? '预约未通过' : '预约已被管理员取消',
        `您的预约已处理：${venueName}${reservation.cancel_reason ? `，原因：${reservation.cancel_reason}` : '。'}`,
        'alert',
      );
      await processQueueForSlot(reservation.venue_id, reservation.start_time, reservation.end_time);
    } else if (nextStatus === 4) {
      await sendReservationNotification(
        reservation.user_id,
        reservation.id,
        'marked_violation',
        '预约已标记为违约',
        `您的预约已被管理员标记为违约：${venueName}${reservation.cancel_reason ? `，备注：${reservation.cancel_reason}` : '。'}`,
        'alert',
      );
    } else {
      await sendNotification(
        reservation.user_id,
        '预约状态已更新',
        `您的预约状态已更新为 ${nextStatus}：${venueName}。`,
        'system',
      );
    }

    success(res, null, '预约状态更新成功');
  } catch (err) {
    console.error(err);
    error(res, err.statusCode || 500, err.message || '更新预约状态失败');
  }
};

exports.cancelMyQueueEntry = async (req, res) => {
  try {
    const result = await cancelQueueEntryService({
      queueId: Number(req.params.id),
      userId: Number(req.user.id),
      isAdmin: Number(req.user.role) === 9,
      reason: String(req.body?.reason || req.body?.remarks || '').trim(),
    });

    if (result.code === 'NOT_FOUND') {
      return error(res, 404, '候补记录不存在');
    }
    if (result.code === 'FORBIDDEN') {
      return error(res, 403, '无权取消该候补记录');
    }
    if (result.code === 'INVALID_STATUS') {
      return error(res, 400, '当前候补状态不允许取消');
    }

    success(res, serializeQueueEntry(result.queue), '候补取消成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '取消候补失败');
  }
};

exports.getAllQueueEntries = async (req, res) => {
  try {
    const list = await getAllQueueEntriesService();
    success(res, list.map(serializeQueueEntry));
  } catch (err) {
    console.error(err);
    error(res, 500, '获取候补列表失败');
  }
};
