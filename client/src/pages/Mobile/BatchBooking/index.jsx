import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  NavBar,
  Picker,
  SpinLoading,
  Tag,
  TextArea,
  Toast,
} from 'antd-mobile';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import axios from '../../../services/request';
import {
  buildCommonFreeBlocks,
  buildOccurrenceDates,
  formatOccurrenceLabel,
  getBlockHours,
  getBlockValue,
  WEEKDAY_OPTIONS,
} from '../../../utils/bookingSlots';

const WeekSelector = ({ value = [], onChange }) => {
  const toggle = (targetValue) => {
    const nextValue = value.includes(targetValue)
      ? value.filter((item) => item !== targetValue)
      : [...value, targetValue];
    onChange?.(nextValue.sort((a, b) => a - b));
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {WEEKDAY_OPTIONS.map((option) => {
        const active = value.includes(option.value);
        return (
          <div
            key={option.value}
            onClick={() => toggle(option.value)}
            style={{
              padding: '6px 16px',
              background: active ? '#1677ff' : '#f5f5f5',
              color: active ? '#fff' : '#333',
              borderRadius: 999,
              fontSize: 13,
              transition: 'all 0.2s',
            }}
          >
            {option.label}
          </div>
        );
      })}
    </div>
  );
};

const MobileBatchBooking = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preVenueId = searchParams.get('venue_id');

  const [venues, setVenues] = useState([]);
  const [venuePickerVisible, setVenuePickerVisible] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState(preVenueId ? Number(preVenueId) : null);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(new Date().getTime() + 7 * 24 * 3600 * 1000));
  const [startPickerVisible, setStartPickerVisible] = useState(false);
  const [endPickerVisible, setEndPickerVisible] = useState(false);
  const [weeks, setWeeks] = useState([]);
  const [purpose, setPurpose] = useState('');
  const [selectedBlockValue, setSelectedBlockValue] = useState('');
  const [schedulesByDate, setSchedulesByDate] = useState({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const res = await axios.get('/venues');
        if (res.code === 200) {
          setVenues(res.data || []);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchVenues();
  }, []);

  const selectedVenue = useMemo(
    () => venues.find((item) => Number(item.id) === Number(selectedVenueId)) || null,
    [venues, selectedVenueId],
  );

  const venueOptions = useMemo(
    () => venues.map((item) => ({ label: item.name, value: item.id })),
    [venues],
  );

  const occurrenceDates = useMemo(() => {
    if (!weeks.length || startDate > endDate) return [];
    return buildOccurrenceDates(startDate, endDate, weeks);
  }, [startDate, endDate, weeks]);

  const refreshAvailability = async (targetVenueId, targetDates) => {
    if (!targetVenueId || !targetDates.length) {
      setSchedulesByDate({});
      return {};
    }

    setAvailabilityLoading(true);
    try {
      const entries = await Promise.all(
        targetDates.map(async (date) => {
          const dateText = dayjs(date).format('YYYY-MM-DD');
          const res = await axios.get('/reservations/schedule', {
            params: { venue_id: targetVenueId, date: dateText },
          });
          return [dateText, res.code === 200 ? (res.data || []) : []];
        }),
      );

      const nextMap = Object.fromEntries(entries);
      setSchedulesByDate(nextMap);
      return nextMap;
    } catch (err) {
      console.error(err);
      return {};
    } finally {
      setAvailabilityLoading(false);
    }
  };

  useEffect(() => {
    setSelectedBlockValue('');
    if (!selectedVenueId || !occurrenceDates.length || startDate > endDate) {
      setSchedulesByDate({});
      return;
    }

    refreshAvailability(selectedVenueId, occurrenceDates);
  }, [selectedVenueId, occurrenceDates, startDate, endDate]);

  const { blocks: commonBlocks } = useMemo(
    () => buildCommonFreeBlocks(selectedVenue, schedulesByDate, occurrenceDates),
    [selectedVenue, schedulesByDate, occurrenceDates],
  );

  const selectedBlock = useMemo(
    () => commonBlocks.find((item) => getBlockValue(item) === selectedBlockValue) || null,
    [commonBlocks, selectedBlockValue],
  );

  const handleSubmit = async () => {
    if (!selectedVenueId) {
      Toast.show({ content: '请选择场地' });
      return;
    }
    if (startDate > endDate) {
      Toast.show({ content: '结束日期不能早于开始日期' });
      return;
    }
    if (!weeks.length) {
      Toast.show({ content: '请选择重复星期' });
      return;
    }
    if (!occurrenceDates.length) {
      Toast.show({ content: '当前周期内没有命中所选星期' });
      return;
    }
    if (!selectedBlock) {
      Toast.show({ content: '请选择可预约时段' });
      return;
    }
    if (!purpose.trim()) {
      Toast.show({ content: '请填写预约用途' });
      return;
    }

    setSubmitting(true);
    try {
      const latestSchedules = await refreshAvailability(selectedVenueId, occurrenceDates);
      const { blocks: latestBlocks } = buildCommonFreeBlocks(selectedVenue, latestSchedules, occurrenceDates);
      const latestBlock = latestBlocks.find((item) => getBlockValue(item) === getBlockValue(selectedBlock));

      if (!latestBlock) {
        setSelectedBlockValue('');
        Toast.show({ content: '可预约时段已变化，请重新选择' });
        return;
      }

      const res = await axios.post('/reservations/batch', {
        venue_id: selectedVenueId,
        start_date: dayjs(startDate).format('YYYY-MM-DD'),
        end_date: dayjs(endDate).format('YYYY-MM-DD'),
        start_time: latestBlock.startLabel,
        end_time: latestBlock.endLabel,
        weeks,
        purpose: purpose.trim(),
      });

      if (res.code === 200) {
        Toast.show({ icon: 'success', content: res.msg || '批量预约处理完成' });
        navigate('/history');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: '#fff', minHeight: '100%' }}>
      <NavBar onBack={() => navigate(-1)}>批量预约</NavBar>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Form layout='horizontal' footer={(
          <Button
            block
            color='primary'
            size='large'
            loading={submitting}
            onClick={handleSubmit}
          >
            提交批量预约
          </Button>
        )}
        >
          <Form.Header>基本信息</Form.Header>
          <Form.Item label='预约场地' required>
            {preVenueId ? (
              <div style={{ fontSize: 16, color: '#333' }}>{selectedVenue?.name || '加载中...'}</div>
            ) : (
              <Picker
                columns={[venueOptions]}
                value={selectedVenueId ? [selectedVenueId] : []}
                visible={venuePickerVisible}
                onClose={() => setVenuePickerVisible(false)}
                onConfirm={(value) => setSelectedVenueId(Number(value?.[0]))}
              >
                {(_, actions) => (
                  <div onClick={actions.open} style={{ fontSize: 16, color: selectedVenue ? '#333' : '#999' }}>
                    {selectedVenue?.name || '请选择场地'}
                  </div>
                )}
              </Picker>
            )}
          </Form.Item>

          <Form.Header>循环周期</Form.Header>
          <div style={{ display: 'flex', gap: 12, padding: '0 12px' }}>
            <div
              style={{ flex: 1, border: '1px solid #f0f0f0', padding: 10, borderRadius: 8, textAlign: 'center' }}
              onClick={() => setStartPickerVisible(true)}
            >
              <div style={{ fontSize: 12, color: '#999' }}>开始日期</div>
              <div>{dayjs(startDate).format('YYYY-MM-DD')}</div>
            </div>
            <div
              style={{ flex: 1, border: '1px solid #f0f0f0', padding: 10, borderRadius: 8, textAlign: 'center' }}
              onClick={() => setEndPickerVisible(true)}
            >
              <div style={{ fontSize: 12, color: '#999' }}>结束日期</div>
              <div>{dayjs(endDate).format('YYYY-MM-DD')}</div>
            </div>
          </div>

          <DatePicker
            visible={startPickerVisible}
            value={startDate}
            onClose={() => setStartPickerVisible(false)}
            onConfirm={(value) => value && setStartDate(value)}
          />
          <DatePicker
            visible={endPickerVisible}
            value={endDate}
            onClose={() => setEndPickerVisible(false)}
            onConfirm={(value) => value && setEndDate(value)}
          />

          <Form.Item label='重复星期' required>
            <WeekSelector value={weeks} onChange={setWeeks} />
          </Form.Item>

          <Form.Header>可预约时段</Form.Header>
          <div style={{ padding: '0 12px 12px' }}>
            <div style={{ color: '#666', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
              这里只显示所选日期里每次都能预约的时段。
            </div>

            {startDate > endDate ? (
              <div style={{ color: '#ff4d4f', fontSize: 13 }}>结束日期不能早于开始日期。</div>
            ) : null}

            {occurrenceDates.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {occurrenceDates.map((date) => (
                  <Tag key={dayjs(date).format('YYYY-MM-DD')} color='primary' fill='outline'>
                    {formatOccurrenceLabel(date)}
                  </Tag>
                ))}
              </div>
            ) : (
              <div style={{ color: '#999', fontSize: 13, marginBottom: 12 }}>请选择起止日期和重复星期后查看可预约时段。</div>
            )}

            {availabilityLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999' }}>
                <SpinLoading color='primary' />
                正在检查可预约时段...
              </div>
            ) : null}

            {!availabilityLoading && selectedVenue && occurrenceDates.length ? (
              commonBlocks.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {commonBlocks.map((block) => {
                    const active = getBlockValue(block) === selectedBlockValue;
                    return (
                      <button
                        key={getBlockValue(block)}
                        type='button'
                        onClick={() => setSelectedBlockValue(getBlockValue(block))}
                        style={{
                          border: active ? '1px solid #1677ff' : '1px solid #f0f0f0',
                          background: active ? '#e6f4ff' : '#fff',
                          borderRadius: 12,
                          padding: '12px 14px',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#333' }}>
                          {block.startLabel} - {block.endLabel}
                        </div>
                        <div style={{ marginTop: 4, color: '#666', fontSize: 13 }}>
                          时长 {getBlockHours(block)} 小时 · 共 {occurrenceDates.length} 次
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#ff4d4f', fontSize: 13 }}>
                  这段时间里没有都能预约的时段，请调整日期或更换场地。
                </div>
              )
            ) : null}
          </div>

          <Form.Header>预约用途</Form.Header>
          <Form.Item label='用途' required>
            <TextArea
              value={purpose}
              onChange={setPurpose}
              placeholder='请输入活动内容或预约说明'
              rows={3}
              maxLength={120}
              showCount
            />
          </Form.Item>
        </Form>
      </div>
    </div>
  );
};

export default MobileBatchBooking;
