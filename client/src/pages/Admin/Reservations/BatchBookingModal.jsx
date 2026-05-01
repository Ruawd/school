import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Checkbox, DatePicker, Form, Input, Modal, Select, Spin, Tag, message } from 'antd';
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

const { RangePicker } = DatePicker;

const BatchBookingModal = ({ visible, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [venues, setVenues] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [schedulesByDate, setSchedulesByDate] = useState({});
  const [selectedBlockValue, setSelectedBlockValue] = useState('');

  const venueId = Form.useWatch('venue_id', form);
  const dateRange = Form.useWatch('dateRange', form);
  const weeks = Form.useWatch('weeks', form) || [];

  useEffect(() => {
    if (!visible) return;

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
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      form.resetFields();
      setSchedulesByDate({});
      setSelectedBlockValue('');
    }
  }, [visible, form]);

  const selectedVenue = useMemo(
    () => venues.find((item) => Number(item.id) === Number(venueId)) || null,
    [venues, venueId],
  );
  const selectedVenueId = selectedVenue?.id || '';
  const weeksKey = useMemo(
    () => (Array.isArray(weeks) ? [...weeks].map((item) => Number(item)).sort((a, b) => a - b).join(',') : ''),
    [weeks],
  );
  const dateRangeKey = useMemo(() => {
    if (!Array.isArray(dateRange) || dateRange.length !== 2 || !dateRange[0] || !dateRange[1]) return '';
    return `${dayjs(dateRange[0]).format('YYYY-MM-DD')}|${dayjs(dateRange[1]).format('YYYY-MM-DD')}`;
  }, [dateRange]);

  const occurrenceDates = useMemo(() => {
    if (!Array.isArray(dateRange) || dateRange.length !== 2 || !weeks.length) return [];
    return buildOccurrenceDates(dateRange[0].toDate(), dateRange[1].toDate(), weeks);
  }, [dateRangeKey, weeksKey]);
  const occurrenceDatesKey = useMemo(
    () => occurrenceDates.map((date) => dayjs(date).format('YYYY-MM-DD')).join('|'),
    [occurrenceDates],
  );

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
    if (!visible) return;

    setSelectedBlockValue((prev) => (prev ? '' : prev));

    if (!selectedVenueId || !occurrenceDates.length) {
      setSchedulesByDate((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }

    refreshAvailability(selectedVenueId, occurrenceDates);
  }, [visible, selectedVenueId, occurrenceDatesKey]);

  const { blocks: commonBlocks } = useMemo(
    () => buildCommonFreeBlocks(selectedVenue, schedulesByDate, occurrenceDates),
    [selectedVenue, schedulesByDate, occurrenceDates],
  );

  const selectedBlock = useMemo(
    () => commonBlocks.find((item) => getBlockValue(item) === selectedBlockValue) || null,
    [commonBlocks, selectedBlockValue],
  );

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedBlock) {
        message.warning('请选择共同空闲时段');
        return;
      }

      setSubmitting(true);
      const latestSchedules = await refreshAvailability(values.venue_id, occurrenceDates);
      const { blocks: latestBlocks } = buildCommonFreeBlocks(selectedVenue, latestSchedules, occurrenceDates);
      const latestBlock = latestBlocks.find((item) => getBlockValue(item) === getBlockValue(selectedBlock));

      if (!latestBlock) {
        setSelectedBlockValue('');
        message.warning('共同空闲时段已变化，请重新选择');
        return;
      }

      const payload = {
        venue_id: values.venue_id,
        start_date: values.dateRange[0].format('YYYY-MM-DD'),
        end_date: values.dateRange[1].format('YYYY-MM-DD'),
        start_time: latestBlock.startLabel,
        end_time: latestBlock.endLabel,
        weeks: values.weeks,
        purpose: values.purpose.trim(),
      };

      const res = await axios.post('/reservations/batch', payload);
      if (res.code === 200) {
        message.success(res.msg || '批量预约处理完成');
        onSuccess?.();
        onClose?.();
      }
    } catch (err) {
      if (!err?.errorFields) {
        console.error(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title='批量预约'
      open={visible}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={submitting}
      width={760}
      destroyOnHidden
    >
      <Form form={form} layout='vertical'>
        <Form.Item
          name='venue_id'
          label='场地'
          rules={[{ required: true, message: '请选择场地' }]}
        >
          <Select
            placeholder='请选择场地'
            options={venues.map((item) => ({ label: item.name, value: item.id }))}
          />
        </Form.Item>

        <Form.Item
          name='dateRange'
          label='循环周期'
          rules={[{ required: true, message: '请选择开始和结束日期' }]}
        >
          <RangePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name='weeks'
          label='重复星期'
          rules={[{ required: true, message: '请至少选择一个重复星期' }]}
        >
          <Checkbox.Group>
            {WEEKDAY_OPTIONS.map((item) => (
              <Checkbox key={item.value} value={item.value}>{item.label}</Checkbox>
            ))}
          </Checkbox.Group>
        </Form.Item>

        <Form.Item label='共同空闲时段' required>
          <Alert
            type='info'
            showIcon
            style={{ marginBottom: 12 }}
            title='系统会自动计算所选周期内所有命中日期的共同空闲时段，只允许提交所有日期都空闲的时间段。'
          />

          {occurrenceDates.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {occurrenceDates.map((date) => (
                <Tag key={dayjs(date).format('YYYY-MM-DD')} color='blue'>
                  {formatOccurrenceLabel(date)}
                </Tag>
              ))}
            </div>
          ) : (
            <div style={{ color: '#999', marginBottom: 12 }}>请选择周期和重复星期后查看可预约时段。</div>
          )}

          {availabilityLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999', marginBottom: 12 }}>
              <Spin size='small' />
              正在计算共同空闲时段...
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
                        border: active ? '1px solid #1677ff' : '1px solid #d9d9d9',
                        borderRadius: 10,
                        background: active ? '#e6f4ff' : '#fff',
                        padding: '12px 14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 600 }}>
                        {block.startLabel} - {block.endLabel}
                      </div>
                      <div style={{ marginTop: 4, color: '#666' }}>
                        持续 {getBlockHours(block)} 小时 · 覆盖 {occurrenceDates.length} 次预约
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Alert
                type='warning'
                showIcon
                title='当前周期内没有所有日期都可用的共同空闲时段，请调整日期范围、重复星期或更换场地。'
              />
            )
          ) : null}
        </Form.Item>

        <Form.Item
          name='purpose'
          label='预约用途'
          rules={[
            { required: true, message: '请输入预约用途' },
            { validator: (_, value) => (String(value || '').trim() ? Promise.resolve() : Promise.reject(new Error('请输入预约用途'))) },
          ]}
        >
          <Input.TextArea rows={3} maxLength={120} showCount placeholder='请输入预约用途或活动说明' />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default BatchBookingModal;
