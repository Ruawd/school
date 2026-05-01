import dayjs from 'dayjs';

export const SLOT_MINUTES = 30;

export const WEEKDAY_OPTIONS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 0 },
];

export const parseMinutes = (timeText) => {
  const [hour = 0, minute = 0] = String(timeText || '00:00:00')
    .split(':')
    .map((value) => Number(value) || 0);
  return hour * 60 + minute;
};

export const formatMinutes = (minutes) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const overlapsWithReservation = (slotStart, slotEnd, reservation) => {
  const reservationStart = parseMinutes(dayjs(reservation.start_time).format('HH:mm:ss'));
  const reservationEnd = parseMinutes(dayjs(reservation.end_time).format('HH:mm:ss'));
  return reservationStart < slotEnd && reservationEnd > slotStart;
};

export const buildSlots = (venue, schedule, selectedDate) => {
  if (!venue) return [];

  const openStart = parseMinutes(venue.open_start);
  const openEnd = parseMinutes(venue.open_end);
  if (openEnd <= openStart) return [];

  const now = dayjs();
  const isToday = dayjs(selectedDate).isSame(now, 'day');
  const nowMinutes = now.hour() * 60 + now.minute();
  const slotCount = Math.ceil((openEnd - openStart) / SLOT_MINUTES);

  return Array.from({ length: slotCount }, (_, index) => {
    const start = openStart + index * SLOT_MINUTES;
    const end = Math.min(start + SLOT_MINUTES, openEnd);
    const reservation = schedule.find((item) => overlapsWithReservation(start, end, item));
    const isPast = isToday && end <= nowMinutes;
    const occupied = Boolean(reservation);

    let state = 'free';
    if (occupied) state = 'occupied';
    if (!occupied && isPast) state = 'past';

    return {
      index,
      start,
      end,
      startLabel: formatMinutes(start),
      endLabel: formatMinutes(end),
      state,
      disabled: occupied || isPast,
      reservation,
    };
  });
};

export const buildFreeBlocks = (slots) => {
  const blocks = [];
  let current = null;

  slots.forEach((slot) => {
    if (slot.state !== 'free') {
      if (current) {
        blocks.push(current);
        current = null;
      }
      return;
    }

    if (!current) {
      current = {
        startIndex: slot.index,
        endIndex: slot.index,
        startLabel: slot.startLabel,
        endLabel: slot.endLabel,
        slotCount: 1,
      };
      return;
    }

    current.endIndex = slot.index;
    current.endLabel = slot.endLabel;
    current.slotCount += 1;
  });

  if (current) {
    blocks.push(current);
  }

  return blocks;
};

export const getBlockHours = (block) => ((block.slotCount * SLOT_MINUTES) / 60).toFixed(1);

export const buildOccurrenceDates = (startDate, endDate, weeks) => {
  if (!startDate || !endDate || !Array.isArray(weeks) || !weeks.length) return [];

  const weekSet = new Set(weeks.map((item) => Number(item)));
  const cursor = dayjs(startDate).startOf('day');
  const targetEnd = dayjs(endDate).endOf('day');
  if (cursor.isAfter(targetEnd)) return [];

  const dates = [];
  let current = cursor;
  while (current.isBefore(targetEnd) || current.isSame(targetEnd, 'day')) {
    if (weekSet.has(current.day())) {
      dates.push(current.toDate());
    }
    current = current.add(1, 'day');
  }

  return dates;
};

export const buildCommonFreeBlocks = (venue, schedulesByDate, occurrenceDates) => {
  if (!venue || !occurrenceDates.length) {
    return { blocks: [], slotGroups: [] };
  }

  const slotGroups = occurrenceDates.map((date) => {
    const key = dayjs(date).format('YYYY-MM-DD');
    return buildSlots(venue, schedulesByDate[key] || [], date);
  });

  const baseSlots = slotGroups[0] || [];
  if (!baseSlots.length || slotGroups.some((group) => group.length !== baseSlots.length)) {
    return { blocks: [], slotGroups };
  }

  const commonSlots = baseSlots.map((slot, index) => {
    const freeInAll = slotGroups.every((group) => group[index]?.state === 'free');
    return {
      ...slot,
      state: freeInAll ? 'free' : 'occupied',
      disabled: !freeInAll,
    };
  });

  return {
    blocks: buildFreeBlocks(commonSlots),
    slotGroups,
  };
};

export const formatOccurrenceLabel = (date) => {
  const target = dayjs(date);
  const weekday = WEEKDAY_OPTIONS.find((item) => item.value === target.day())?.label || '';
  return `${target.format('MM-DD')} ${weekday}`;
};

export const getBlockValue = (block) => `${block.startLabel}-${block.endLabel}`;
