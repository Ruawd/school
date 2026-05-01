import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Calendar,
  Card,
  Image,
  Picker,
  Popup,
  SpinLoading,
  TextArea,
  Toast,
} from 'antd-mobile';
import { ClockCircleOutline, EnvironmentOutline } from 'antd-mobile-icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import axios from '../../../services/request';
import { resolveImageUrl } from '../../../utils/image';
import { getVenueStatusMeta, splitEquipments } from '../../../utils/amap';

const PLACEHOLDER_IMG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWVlIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIGR5PSIuM2VtIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7mmoLml6Dlm77niYcvPC90ZXh0Pjwvc3ZnPg==';
const SLOT_MINUTES = 30;
const EMPTY_SELECTION = { startIndex: null, endIndex: null };

const parseMinutes = (timeText) => {
  const [hour = 0, minute = 0] = String(timeText || '00:00:00').split(':').map((value) => Number(value) || 0);
  return hour * 60 + minute;
};

const formatMinutes = (minutes) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const overlapsWithReservation = (slotStart, slotEnd, reservation) => {
  const reservationStart = parseMinutes(dayjs(reservation.start_time).format('HH:mm:ss'));
  const reservationEnd = parseMinutes(dayjs(reservation.end_time).format('HH:mm:ss'));
  return reservationStart < slotEnd && reservationEnd > slotStart;
};

const buildSlots = (venue, schedule, selectedDate) => {
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

const buildFreeBlocks = (slots) => {
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

const getReservationStatusLabel = (status) => {
  switch (Number(status)) {
    case 2:
      return '已签到';
    case 1:
      return '已通过';
    case 0:
      return '待审核';
    default:
      return '已占用';
  }
};

const getSelectionStage = (selection) => {
  if (selection.startIndex === null) return 'idle';
  if (selection.endIndex === null) return 'pickingEnd';
  return 'complete';
};

const getSelectedSlots = (slots, selection) => {
  if (selection.startIndex === null) return [];
  const startSlot = slots[selection.startIndex];
  if (!startSlot) return [];
  if (selection.endIndex === null) return [startSlot];
  const startIndex = Math.min(selection.startIndex, selection.endIndex);
  const endIndex = Math.max(selection.startIndex, selection.endIndex);
  return slots.slice(startIndex, endIndex + 1);
};

const getSelectedWindow = (slots, selection) => {
  if (selection.startIndex === null || selection.endIndex === null) return null;
  const selectedSlots = getSelectedSlots(slots, selection);
  if (!selectedSlots.length) return null;
  return {
    startLabel: selectedSlots[0].startLabel,
    endLabel: selectedSlots[selectedSlots.length - 1].endLabel,
    hours: (selectedSlots.reduce((sum, item) => sum + (item.end - item.start), 0) / 60).toFixed(1),
    slotCount: selectedSlots.length,
  };
};

const getEndCandidateIndexes = (slots, startIndex) => {
  if (startIndex === null) return [];
  const startSlot = slots[startIndex];
  if (!startSlot || startSlot.state !== 'free') return [];

  const indexes = [];
  for (let index = startIndex; index < slots.length; index += 1) {
    if (slots[index].state !== 'free') break;
    indexes.push(index);
  }
  return indexes;
};

const isSelectionStrictlyFree = (slots, selection) => {
  if (selection.startIndex === null || selection.endIndex === null) return false;
  const targetSlots = getSelectedSlots(slots, selection);
  if (!targetSlots.length) return false;
  return targetSlots.every((slot) => slot.state === 'free');
};

const MobileBooking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const cachedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const maxAdvanceDays = cachedUser?.credit_score >= 90 ? 14 : 7;

  const [venue, setVenue] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [purpose, setPurpose] = useState('');
  const [popupVisible, setPopupVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validatingSelection, setValidatingSelection] = useState(false);
  const [startPickerVisible, setStartPickerVisible] = useState(false);
  const [endPickerVisible, setEndPickerVisible] = useState(false);
  const [startPickerValue, setStartPickerValue] = useState([]);
  const [endPickerValue, setEndPickerValue] = useState([]);

  useEffect(() => {
    const fetchVenue = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/venues/${id}`);
        if (res.code === 200) {
          setVenue(res.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchVenue();
  }, [id]);

  const fetchSchedule = async (targetDate) => {
    const dateText = dayjs(targetDate).format('YYYY-MM-DD');
    const res = await axios.get(`/reservations/schedule?venue_id=${id}&date=${dateText}`);
    return res.code === 200 ? (res.data || []) : [];
  };

  const loadSchedule = async (targetDate) => {
    setScheduleLoading(true);
    try {
      const list = await fetchSchedule(targetDate);
      setSchedule(list);
      return list;
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setScheduleLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    loadSchedule(selectedDate);
    setSelection(EMPTY_SELECTION);
    setPopupVisible(false);
    setStartPickerVisible(false);
    setEndPickerVisible(false);
    setStartPickerValue([]);
    setEndPickerValue([]);
  }, [id, selectedDate]);

  const slots = useMemo(() => buildSlots(venue, schedule, selectedDate), [venue, schedule, selectedDate]);
  const freeBlocks = useMemo(() => buildFreeBlocks(slots), [slots]);
  const selectionStage = useMemo(() => getSelectionStage(selection), [selection]);
  const previewSlots = useMemo(() => getSelectedSlots(slots, selection), [slots, selection]);
  const selectedWindow = useMemo(() => getSelectedWindow(slots, selection), [slots, selection]);
  const endCandidateIndexes = useMemo(
    () => getEndCandidateIndexes(slots, selection.startIndex),
    [slots, selection.startIndex],
  );
  const strictSelectionValid = useMemo(() => isSelectionStrictlyFree(slots, selection), [slots, selection]);
  const selectedStartSlot = useMemo(
    () => (selection.startIndex === null ? null : (slots[selection.startIndex] || null)),
    [slots, selection.startIndex],
  );
  const startOptions = useMemo(
    () => slots.filter((slot) => slot.state === 'free').map((slot) => ({
      label: slot.startLabel,
      value: slot.index,
    })),
    [slots],
  );
  const endOptions = useMemo(
    () => endCandidateIndexes.map((index) => ({
      label: slots[index]?.endLabel,
      value: index,
    })).filter((item) => item.label),
    [endCandidateIndexes, slots],
  );

  const statusMeta = venue ? getVenueStatusMeta(venue.status) : null;
  const equipmentTags = splitEquipments(venue?.equipment);

  useEffect(() => {
    if (selection.startIndex === null) return;
    const startSlot = slots[selection.startIndex];
    if (!startSlot || startSlot.state !== 'free') {
      setSelection(EMPTY_SELECTION);
      setPopupVisible(false);
      return;
    }
    if (selection.endIndex !== null && !isSelectionStrictlyFree(slots, selection)) {
      Toast.show({ content: '所选时段已不再空闲，请重新选择' });
      setSelection(EMPTY_SELECTION);
      setPopupVisible(false);
    }
  }, [slots, selection]);

  const clearSelection = () => {
    setSelection(EMPTY_SELECTION);
    setPopupVisible(false);
    setStartPickerValue([]);
    setEndPickerValue([]);
  };

  const applyBlockSelection = (block) => {
    setPopupVisible(false);
    setSelection({ startIndex: block.startIndex, endIndex: block.endIndex });
    setStartPickerValue([block.startIndex]);
    setEndPickerValue([block.endIndex]);
  };

  const handleStartPickerConfirm = (value) => {
    const nextStartIndex = Number(value?.[0]);
    if (!Number.isInteger(nextStartIndex)) return;

    setPopupVisible(false);
    const candidateIndexes = getEndCandidateIndexes(slots, nextStartIndex);
    const nextEndIndex = selection.endIndex !== null && candidateIndexes.includes(selection.endIndex)
      ? selection.endIndex
      : null;
    setSelection((prev) => ({
      startIndex: nextStartIndex,
      endIndex: prev.endIndex !== null && candidateIndexes.includes(prev.endIndex) ? prev.endIndex : null,
    }));
    setStartPickerValue([nextStartIndex]);
    setEndPickerValue(nextEndIndex !== null ? [nextEndIndex] : []);
  };

  const handleEndPickerConfirm = (value) => {
    if (selection.startIndex === null) {
      Toast.show({ content: '请先选择开始时间' });
      return;
    }

    const nextEndIndex = Number(value?.[0]);
    if (!Number.isInteger(nextEndIndex)) return;
    if (!endCandidateIndexes.includes(nextEndIndex)) {
      Toast.show({ content: '结束时间不在可预约范围内，请重新选择' });
      return;
    }

    setPopupVisible(false);
    setSelection((prev) => ({
      ...prev,
      endIndex: nextEndIndex,
    }));
    setEndPickerValue([nextEndIndex]);
  };

  const openConfirmPopup = async () => {
    if (!selectedWindow || !strictSelectionValid) {
      Toast.show({ content: '请先选择完整的预约时段' });
      return;
    }

    setValidatingSelection(true);
    try {
      const latestSchedule = await fetchSchedule(selectedDate);
      setSchedule(latestSchedule);
      const latestSlots = buildSlots(venue, latestSchedule, selectedDate);
      if (!isSelectionStrictlyFree(latestSlots, selection)) {
        Toast.show({ content: '所选时段已不再空闲，请重新选择' });
        setSelection(EMPTY_SELECTION);
        return;
      }
      setPopupVisible(true);
    } catch (err) {
      console.error(err);
    } finally {
      setValidatingSelection(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedWindow || !strictSelectionValid) {
      Toast.show({ content: '请选择有效的预约时段' });
      return;
    }
    if (!purpose.trim()) {
      Toast.show({ content: '请填写预约用途' });
      return;
    }

    setSubmitting(true);
    try {
      const dateText = dayjs(selectedDate).format('YYYY-MM-DD');
      const payload = {
        venue_id: Number(id),
        start_time: `${dateText} ${selectedWindow.startLabel}`,
        end_time: `${dateText} ${selectedWindow.endLabel}`,
        purpose: purpose.trim(),
      };

      const res = await axios.post('/reservations', payload);
      if (res.code === 200) {
        Toast.show({ icon: 'success', content: res.msg || '预约申请已提交' });
        setPopupVisible(false);
        setPurpose('');
        setSelection(EMPTY_SELECTION);
        await loadSchedule(selectedDate);
        navigate('/history');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='mobile-booking-loading'>
        <SpinLoading color='primary' style={{ '--size': '32px' }} />
        <div style={{ marginTop: 12 }}>正在加载场地信息...</div>
      </div>
    );
  }

  if (!venue) {
    return <div className='mobile-booking-loading'>未找到场地</div>;
  }

  return (
    <div className='mobile-booking-page'>
      <Image src={resolveImageUrl(venue.image_url) || PLACEHOLDER_IMG} fit='cover' height={220} />

      <div className='mobile-booking-page__content'>
        <Card>
          <div className='mobile-booking-page__title-row'>
            <div>
              <div className='mobile-booking-page__title'>{venue.name}</div>
              <div className='mobile-booking-page__meta'>
                <span><EnvironmentOutline /> 容纳 {venue.capacity || 0} 人</span>
                <span><ClockCircleOutline /> {venue.open_start?.slice(0, 5)} - {venue.open_end?.slice(0, 5)}</span>
              </div>
            </div>
            {statusMeta ? (
              <span className={`mobile-booking-page__status status-${statusMeta.value}`}>{statusMeta.label}</span>
            ) : null}
          </div>
          {equipmentTags.length ? (
            <div className='mobile-booking-page__tags'>
              {equipmentTags.map((tag) => (
                <span className='mobile-booking-page__tag' key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
          <div className='mobile-booking-page__hint'>
            可以直接点下面的可选时段；如果想自己定开始和结束时间，用下面的自定义时间。
          </div>
        </Card>

        <Card title='预约日期'>
          <Calendar
            selectionMode='single'
            value={selectedDate}
            min={new Date()}
            max={dayjs().add(maxAdvanceDays, 'day').toDate()}
            onChange={(value) => value && setSelectedDate(value)}
          />
          <div className='mobile-booking-page__subhint'>
            当前信用分最多可提前预约 {maxAdvanceDays} 天，当前选择 {dayjs(selectedDate).format('YYYY年MM月DD日')}
          </div>
        </Card>

        <Card title='可选时段'>
          {scheduleLoading ? (
            <div className='mobile-booking-page__loading-inline'>正在加载...</div>
          ) : freeBlocks.length ? (
            <div className='mobile-booking-page__block-list'>
              {freeBlocks.map((block) => {
                const active = selection.startIndex === block.startIndex && selection.endIndex === block.endIndex;
                return (
                  <button
                    type='button'
                    key={`${block.startIndex}-${block.endIndex}`}
                    className={`mobile-booking-page__block-item${active ? ' is-active' : ''}`}
                    onClick={() => applyBlockSelection(block)}
                  >
                    <span className='time'>{block.startLabel} - {block.endLabel}</span>
                    <span className='desc'>时长 {(block.slotCount * SLOT_MINUTES) / 60} 小时</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className='mobile-booking-page__empty-text'>当天没有可预约时段</div>
          )}
        </Card>

        <Card title='自定义时间'>
          <div className='mobile-booking-page__custom-time-tip'>
            自定义时间按 30 分钟选择。先选开始时间，再选结束时间；结束时间可以重复调整。
          </div>

          <div className='mobile-booking-page__time-picker-grid'>
            <div className='mobile-booking-page__time-picker-item'>
              <div className='mobile-booking-page__time-picker-label'>开始时间</div>
              <button
                type='button'
                className='mobile-booking-page__time-picker-trigger'
                onClick={() => {
                  if (!startOptions.length) return;
                  setStartPickerValue(selectedStartSlot ? [selectedStartSlot.index] : [startOptions[0]?.value]);
                  setStartPickerVisible(true);
                }}
                disabled={!startOptions.length}
              >
                <span>{selectedStartSlot?.startLabel || '请选择'}</span>
                <strong>选择</strong>
              </button>
            </div>

            <div className='mobile-booking-page__time-picker-item'>
              <div className='mobile-booking-page__time-picker-label'>结束时间</div>
              <button
                type='button'
                className='mobile-booking-page__time-picker-trigger'
                onClick={() => {
                  if (selection.startIndex === null) {
                    Toast.show({ content: '请先选择开始时间' });
                    return;
                  }
                  if (!endOptions.length) return;
                  setEndPickerValue(selection.endIndex !== null ? [selection.endIndex] : [endOptions[0]?.value]);
                  setEndPickerVisible(true);
                }}
                disabled={selection.startIndex === null || !endOptions.length}
              >
                <span>{selectedWindow?.endLabel || '请选择'}</span>
                <strong>选择</strong>
              </button>
            </div>
          </div>

          {selectionStage === 'pickingEnd' ? (
            <div className='mobile-booking-page__selection-summary is-pending'>
              <div>
                已选开始时间 {previewSlots[0]?.startLabel}，请继续选择结束时间。
              </div>
              <Button size='mini' fill='none' onClick={clearSelection}>清除</Button>
            </div>
          ) : null}
          {selectionStage === 'complete' && selectedWindow ? (
            <div className='mobile-booking-page__selection-summary'>
              <div>
                已选 {selectedWindow.startLabel} - {selectedWindow.endLabel}，共 {selectedWindow.hours} 小时
              </div>
              <Button size='mini' fill='none' onClick={clearSelection}>清除</Button>
            </div>
          ) : null}

          <Picker
            title='选择开始时间'
            columns={[startOptions]}
            visible={startPickerVisible}
            value={startPickerValue}
            onSelect={setStartPickerValue}
            onClose={() => setStartPickerVisible(false)}
            onConfirm={handleStartPickerConfirm}
          />
          <Picker
            title='选择结束时间'
            columns={[endOptions]}
            visible={endPickerVisible}
            value={endPickerValue}
            onSelect={setEndPickerValue}
            onClose={() => setEndPickerVisible(false)}
            onConfirm={handleEndPickerConfirm}
          />
        </Card>

        <Card title='当日占用情况'>
          {schedule.length ? (
            <div className='mobile-booking-page__occupy-list'>
              {schedule.map((item) => (
                <div className='mobile-booking-page__occupy-item' key={item.id}>
                  <span>{dayjs(item.start_time).format('HH:mm')} - {dayjs(item.end_time).format('HH:mm')}</span>
                  <strong>{getReservationStatusLabel(item.status)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className='mobile-booking-page__empty-text'>当天暂无占用记录</div>
          )}
        </Card>
      </div>

      <div className='mobile-booking-page__footer'>
        <Button block fill='outline' size='large' onClick={() => navigate(`/batch?venue_id=${id}`)}>
          批量预约
        </Button>
        <Button
          block
          color='primary'
          size='large'
          disabled={Number(venue.status) === 0 || !strictSelectionValid || validatingSelection}
          loading={validatingSelection}
          onClick={openConfirmPopup}
        >
          {Number(venue.status) === 0 ? '暂停预约' : '确认预约'}
        </Button>
      </div>

      <Popup
        visible={popupVisible}
        onMaskClick={() => setPopupVisible(false)}
        bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <div className='mobile-booking-page__popup'>
          <div className='mobile-booking-page__popup-title'>确认预约信息</div>
          <div className='mobile-booking-page__popup-summary'>
            <div>场地：{venue.name}</div>
            <div>日期：{dayjs(selectedDate).format('YYYY年MM月DD日')}</div>
            <div>时段：{selectedWindow?.startLabel} - {selectedWindow?.endLabel}</div>
            <div>时长：{selectedWindow?.hours} 小时</div>
          </div>
          <div className='mobile-booking-page__popup-label'>预约用途</div>
          <TextArea
            value={purpose}
            onChange={setPurpose}
            placeholder='请填写活动内容、课程名称或其他预约说明'
            rows={3}
            maxLength={120}
            showCount
          />
          <div className='mobile-booking-page__popup-actions'>
            <Button onClick={() => setPopupVisible(false)}>取消</Button>
            <Button color='primary' loading={submitting} onClick={handleSubmit}>提交预约</Button>
          </div>
        </div>
      </Popup>
    </div>
  );
};

export default MobileBooking;
