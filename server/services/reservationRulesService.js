const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const Reservation = require('../models/Reservation');
const Venue = require('../models/Venue');
const User = require('../models/User');

const SLOT_MINUTES = 30;
const OCCUPY_STATUSES = [0, 1, 2];
const NEIGHBOR_OCCUPY_STATUSES = [1, 2];
const SPECIAL_NEIGHBOR_TYPE_ID = 3;

const createReservationError = (message, statusCode = 400, code = 'RESERVATION_INVALID') => (
  Object.assign(new Error(message), { statusCode, code })
);

const parseDateTime = (value, label = '时间') => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createReservationError(`${label}格式无效`, 400, 'INVALID_DATETIME');
  }
  return date;
};

const formatDateKey = (date) => {
  const target = parseDateTime(date);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTimeText = (date) => {
  const target = parseDateTime(date);
  return `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
};

const parseTimeToMinutes = (value) => {
  const [hour = 0, minute = 0, second = 0] = String(value || '00:00:00')
    .split(':')
    .map((item) => Number(item) || 0);
  return hour * 60 + minute + second / 60;
};

const getDateMinutes = (date) => {
  const target = parseDateTime(date);
  return target.getHours() * 60 + target.getMinutes() + target.getSeconds() / 60;
};

const isSameCalendarDay = (left, right) => (
  formatDateKey(left) === formatDateKey(right)
);

const getAdvanceWindowDays = (creditScore) => (Number(creditScore) >= 90 ? 14 : 7);

const buildOccurrenceDates = ({ startDate, endDate, weeks }) => {
  const start = parseDateTime(`${startDate} 00:00:00`, '开始日期');
  const end = parseDateTime(`${endDate} 23:59:59`, '结束日期');

  if (start > end) {
    throw createReservationError('结束日期不能早于开始日期', 400, 'INVALID_DATE_RANGE');
  }

  const weekSet = new Set(
    (Array.isArray(weeks) ? weeks : [])
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6),
  );

  if (!weekSet.size) {
    throw createReservationError('请至少选择一个重复星期', 400, 'INVALID_BATCH_WEEKS');
  }

  const dates = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    if (weekSet.has(cursor.getDay())) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (!dates.length) {
    throw createReservationError('当前周期内没有命中所选星期，请调整起止日期或重复频率', 400, 'EMPTY_BATCH_DATES');
  }

  return dates;
};

const buildDateTime = (date, timeText, label = '时间') => {
  if (!timeText) {
    throw createReservationError(`${label}不能为空`, 400, 'EMPTY_TIME_TEXT');
  }
  return parseDateTime(`${formatDateKey(date)} ${String(timeText).trim()}`, label);
};

const ensureReservationWindow = (startTime, endTime) => {
  const start = parseDateTime(startTime, '开始时间');
  const end = parseDateTime(endTime, '结束时间');

  if (start >= end) {
    throw createReservationError('结束时间必须晚于开始时间', 400, 'INVALID_TIME_RANGE');
  }

  if (start <= new Date()) {
    throw createReservationError('预约开始时间必须晚于当前时间', 400, 'PAST_RESERVATION');
  }

  if (!isSameCalendarDay(start, end)) {
    throw createReservationError('预约开始和结束时间必须在同一天内', 400, 'CROSS_DAY_RESERVATION');
  }

  return { start, end };
};

const ensureUserCanReserve = (user, startTime) => {
  if (!user) {
    throw createReservationError('用户不存在', 404, 'USER_NOT_FOUND');
  }

  if (Number(user.status) !== 1) {
    throw createReservationError('账号已被禁用，请联系管理员', 403, 'USER_DISABLED');
  }

  const creditScore = Number(user.credit_score || 0);
  if (creditScore < 60) {
    throw createReservationError(`当前信用分为 ${creditScore}，低于 60 分，暂时无法预约`, 403, 'LOW_CREDIT_SCORE');
  }

  const maxAdvanceDays = getAdvanceWindowDays(creditScore);
  const daysAhead = (parseDateTime(startTime).getTime() - Date.now()) / (24 * 3600 * 1000);
  if (daysAhead > maxAdvanceDays) {
    throw createReservationError(`当前信用分最多可提前预约 ${maxAdvanceDays} 天`, 403, 'ADVANCE_DAYS_EXCEEDED');
  }

  return { creditScore, maxAdvanceDays };
};

const ensureVenueCanReserve = (venue, startTime, endTime) => {
  if (!venue) {
    throw createReservationError('场地不存在', 404, 'VENUE_NOT_FOUND');
  }

  if (Number(venue.status) === 0) {
    throw createReservationError('该场地当前处于维护状态，暂不支持预约', 409, 'VENUE_MAINTAINING');
  }

  const openStart = parseTimeToMinutes(venue.open_start || '08:00:00');
  const openEnd = parseTimeToMinutes(venue.open_end || '22:00:00');

  if (openEnd <= openStart) {
    throw createReservationError('场地开放时间配置异常，请联系管理员处理', 409, 'VENUE_HOURS_INVALID');
  }

  const startMinutes = getDateMinutes(startTime);
  const endMinutes = getDateMinutes(endTime);

  if (startMinutes < openStart || endMinutes > openEnd) {
    throw createReservationError(
      `预约时间需位于场地开放时段 ${formatTimeText(buildDateTime(startTime, venue.open_start))} - ${formatTimeText(buildDateTime(startTime, venue.open_end))} 内`,
      400,
      'OUTSIDE_OPEN_HOURS',
    );
  }

  const startOffset = startMinutes - openStart;
  const endOffset = endMinutes - openStart;
  const startAligned = startOffset % SLOT_MINUTES === 0;
  const endAligned = endMinutes === openEnd || endOffset % SLOT_MINUTES === 0;

  if (!startAligned || !endAligned) {
    throw createReservationError(`预约时间需按 ${SLOT_MINUTES} 分钟粒度选择`, 400, 'INVALID_SLOT_STEP');
  }

  return {
    openStart,
    openEnd,
    startMinutes,
    endMinutes,
  };
};

const findTimeConflict = async ({
  venueId,
  startTime,
  endTime,
  transaction,
  statuses = OCCUPY_STATUSES,
}) => Reservation.findOne({
  where: {
    venue_id: venueId,
    status: { [Op.in]: statuses },
    [Op.and]: [
      { start_time: { [Op.lt]: endTime } },
      { end_time: { [Op.gt]: startTime } },
    ],
  },
  lock: transaction ? transaction.LOCK.UPDATE : undefined,
  transaction,
});

const findNeighborConflict = async ({
  venue,
  startTime,
  endTime,
  transaction,
}) => {
  const venueId = Number(venue.id);
  const neighborIds = [venueId - 1, venueId + 1].filter((item) => item > 0);
  if (!neighborIds.length) return null;

  const neighbors = await Venue.findAll({
    where: { id: { [Op.in]: neighborIds } },
    transaction,
  });

  for (const neighbor of neighbors) {
    if (
      Number(venue.type_id) !== SPECIAL_NEIGHBOR_TYPE_ID
      && Number(neighbor.type_id) !== SPECIAL_NEIGHBOR_TYPE_ID
    ) {
      continue;
    }

    const conflict = await Reservation.findOne({
      where: {
        venue_id: neighbor.id,
        status: { [Op.in]: NEIGHBOR_OCCUPY_STATUSES },
        [Op.and]: [
          { start_time: { [Op.lt]: endTime } },
          { end_time: { [Op.gt]: startTime } },
        ],
      },
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });

    if (conflict) {
      return { neighbor, reservation: conflict };
    }
  }

  return null;
};

const createPendingReservation = async ({
  userId,
  venueId,
  startTime,
  endTime,
  purpose,
  transaction,
  user: injectedUser = null,
  venue: injectedVenue = null,
}) => {
  const { start, end } = ensureReservationWindow(startTime, endTime);
  const user = injectedUser || await User.findByPk(userId, { transaction });
  const venue = injectedVenue || await Venue.findByPk(venueId, { transaction });

  ensureUserCanReserve(user, start);
  ensureVenueCanReserve(venue, start, end);

  const conflict = await findTimeConflict({
    venueId: Number(venueId),
    startTime: start,
    endTime: end,
    transaction,
  });

  if (conflict) {
    throw createReservationError('所选时段已存在预约冲突', 409, 'TIME_CONFLICT');
  }

  const neighborConflict = await findNeighborConflict({
    venue,
    startTime: start,
    endTime: end,
    transaction,
  });

  if (neighborConflict) {
    throw createReservationError(
      `与相邻特殊场地“${neighborConflict.neighbor.name}”的预约时段冲突，请调整时间`,
      409,
      'NEIGHBOR_CONFLICT',
    );
  }

  const reservation = await Reservation.create({
    user_id: user.id,
    venue_id: Number(venueId),
    start_time: start,
    end_time: end,
    purpose,
    status: 0,
    checkin_code: uuidv4(),
  }, { transaction });

  return { reservation, user, venue, start, end };
};

module.exports = {
  SLOT_MINUTES,
  OCCUPY_STATUSES,
  buildDateTime,
  buildOccurrenceDates,
  createPendingReservation,
  createReservationError,
  ensureReservationWindow,
  ensureUserCanReserve,
  ensureVenueCanReserve,
  findNeighborConflict,
  findTimeConflict,
  formatDateKey,
  formatTimeText,
  getAdvanceWindowDays,
};
