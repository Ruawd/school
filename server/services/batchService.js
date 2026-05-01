const sequelize = require('../config/db');
const { enqueue } = require('./queueService');
const {
  buildDateTime,
  buildOccurrenceDates,
  createPendingReservation,
  formatDateKey,
  formatTimeText,
} = require('./reservationRulesService');

const createBatchReservations = async (data, options = {}) => {
  const {
    venue_id,
    start_date,
    end_date,
    start_time,
    end_time,
    weeks,
    user_id,
    purpose,
  } = data;

  const user = options.user || null;
  const venue = options.venue || null;
  const creditScore = Number(data.credit_score || user?.credit_score || 0);
  const suffix = options.purposeSuffix || '（批量预约）';

  const dates = buildOccurrenceDates({
    startDate: start_date,
    endDate: end_date,
    weeks,
  });

  const results = {
    total: dates.length,
    success: [],
    queued: [],
    failed: [],
  };

  for (const date of dates) {
    const occurrenceDate = formatDateKey(date);
    const finalPurpose = suffix && !String(purpose || '').includes(suffix)
      ? `${purpose}${suffix}`
      : purpose;

    try {
      const startDateTime = buildDateTime(date, start_time, '开始时间');
      const endDateTime = buildDateTime(date, end_time, '结束时间');

      const created = await sequelize.transaction(async (transaction) => {
        const { reservation } = await createPendingReservation({
          userId: user_id,
          venueId: venue_id,
          startTime: startDateTime,
          endTime: endDateTime,
          purpose: finalPurpose,
          transaction,
          user,
          venue,
        });

        return reservation;
      });

      results.success.push({
        id: created.id,
        date: occurrenceDate,
        start_time: formatTimeText(startDateTime),
        end_time: formatTimeText(endDateTime),
      });
    } catch (err) {
      if (err.code === 'TIME_CONFLICT') {
        const startDateTime = buildDateTime(date, start_time, '开始时间');
        const endDateTime = buildDateTime(date, end_time, '结束时间');
        await enqueue({
          user_id,
          venue_id,
          start_time: startDateTime,
          end_time: endDateTime,
          purpose: finalPurpose,
          credit_score: creditScore,
        });

        results.queued.push({
          date: occurrenceDate,
          start_time: formatTimeText(startDateTime),
          end_time: formatTimeText(endDateTime),
          reason: '该时段已存在预约，已自动加入候补队列',
        });
        continue;
      }

      results.failed.push({
        date: occurrenceDate,
        reason: err.message || '批量预约处理失败',
        code: err.code || 'BATCH_RESERVATION_FAILED',
      });
    }
  }

  return results;
};

module.exports = {
  createBatchReservations,
};
