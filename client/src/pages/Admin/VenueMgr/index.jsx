import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  TimePicker,
  Upload,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, QrcodeOutlined, SearchOutlined } from '@ant-design/icons';
import { QRCodeCanvas } from 'qrcode.react';
import dayjs from 'dayjs';
import axios from '../../../services/request';
import VenueCardCompact from '../../../components/VenueCardCompact';
import VenueMapBoard from '../../../components/VenueMapBoard';
import { resolveImageUrl } from '../../../utils/image';
import { formatCoordinate, getVenueCoordinate, getVenueStatusMeta, splitEquipments } from '../../../utils/amap';

const DEFAULT_FORM_VALUES = {
  capacity: 30,
  status: 1,
  open_start: dayjs('08:00', 'HH:mm'),
  open_end: dayjs('22:00', 'HH:mm'),
  equipment: [],
};

const getVenueCheckinValue = (venue) => (
  venue?.checkin_token ? `VENUE_TOKEN:${venue.checkin_token}` : `VENUE:${venue?.id}`
);

const validateLongitude = (_, value) => {
  if (value === undefined || value === null || value === '') {
    return Promise.reject(new Error('请在地图上选择经度坐标'));
  }
  const next = Number(value);
  if (!Number.isFinite(next) || next < 73 || next > 136) {
    return Promise.reject(new Error('经度需位于 73~136 之间，请重新选择'));
  }
  return Promise.resolve();
};

const validateLatitude = (_, value) => {
  if (value === undefined || value === null || value === '') {
    return Promise.reject(new Error('请在地图上选择纬度坐标'));
  }
  const next = Number(value);
  if (!Number.isFinite(next) || next < 3 || next > 54) {
    return Promise.reject(new Error('纬度需位于 3~54 之间，请重新选择'));
  }
  return Promise.resolve();
};

const VenueMgr = () => {
  const [venues, setVenues] = useState([]);
  const [venueTypes, setVenueTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [qrVenue, setQrVenue] = useState(null);
  const [newType, setNewType] = useState('');
  const [pickerLocation, setPickerLocation] = useState(null);
  const [filters, setFilters] = useState({ keyword: '', type: undefined, minCap: '', maxCap: '', equipments: [] });
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [form] = Form.useForm();
  const watchedImage = Form.useWatch('image_url', form);
  const watchedMapX = Form.useWatch('map_x', form);
  const watchedMapY = Form.useWatch('map_y', form);

  const currentPickerValue = useMemo(() => {
    const lng = Number(watchedMapX);
    const lat = Number(watchedMapY);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return pickerLocation;
    return {
      lng,
      lat,
      address: pickerLocation?.address || '',
    };
  }, [watchedMapX, watchedMapY, pickerLocation]);


  const loadVenueTypes = async () => {
    try {
      const res = await axios.get('/venue-types');
      if (res.code === 200) setVenueTypes(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadVenues = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/venues');
      if (res.code === 200) {
        const list = res.data || [];
        setVenues(list);
        const tags = new Set();
        list.forEach((item) => splitEquipments(item.equipment).forEach((tag) => tags.add(tag)));
        setEquipmentOptions(Array.from(tags).map((item) => ({ label: item, value: item })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVenues();
    loadVenueTypes();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getTypeName = (typeId) => venueTypes.find((item) => item.id === typeId)?.name || '未分类';

  const filteredVenues = useMemo(() => {
    return venues.filter((item) => {
      if (filters.type && item.type_id !== filters.type) return false;
      if (filters.minCap && Number(item.capacity) < Number(filters.minCap)) return false;
      if (filters.maxCap && Number(item.capacity) > Number(filters.maxCap)) return false;
      if (filters.keyword) {
        const keyword = filters.keyword.trim().toLowerCase();
        const matched = item.name?.toLowerCase().includes(keyword) || item.equipment?.toLowerCase().includes(keyword);
        if (!matched) return false;
      }
      if (filters.equipments.length) {
        const tags = splitEquipments(item.equipment);
        if (!filters.equipments.every((tag) => tags.includes(tag))) return false;
      }
      return true;
    });
  }, [venues, filters]);

  const resetFilters = () => setFilters({ keyword: '', type: undefined, minCap: '', maxCap: '', equipments: [] });

  const openCreateModal = () => {
    setEditingVenue(null);
    setPickerLocation(null);
    form.resetFields();
    form.setFieldsValue(DEFAULT_FORM_VALUES);
    setIsModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingVenue(record);
    const coordinate = getVenueCoordinate(record);
    setPickerLocation(coordinate ? { ...coordinate, address: '' } : null);
    form.setFieldsValue({
      ...record,
      equipment: splitEquipments(record.equipment),
      open_start: dayjs(record.open_start, 'HH:mm:ss'),
      open_end: dayjs(record.open_end, 'HH:mm:ss'),
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      const res = await axios.delete(`/venues/${id}`);
      if (res.code === 200) {
        message.success('场地删除成功');
        loadVenues();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMapPick = (point) => {
    const lng = Number(point.lng.toFixed(6));
    const lat = Number(point.lat.toFixed(6));
    setPickerLocation({ lng, lat, address: point.address || '' });
    form.setFieldsValue({ map_x: lng, map_y: lat });
  };

  const clearLocation = () => {
    setPickerLocation(null);
    form.setFieldsValue({ map_x: undefined, map_y: undefined });
    form.validateFields(['map_x', 'map_y']).catch(() => undefined);
  };

  const handleImageUpload = async ({ file, onSuccess, onError, onProgress }) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('/upload', formData, {
        timeout: 60000,
        onUploadProgress: (event) => {
          if (!event.total) return;
          onProgress?.({ percent: Math.round((event.loaded / event.total) * 100) });
        },
      });
      onSuccess?.(res);
    } catch (err) {
      onError?.(err);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        equipment: Array.isArray(values.equipment) ? values.equipment.join(', ') : values.equipment,
        open_start: values.open_start.format('HH:mm:ss'),
        open_end: values.open_end.format('HH:mm:ss'),
      };
      const res = editingVenue
        ? await axios.put(`/venues/${editingVenue.id}`, payload)
        : await axios.post('/venues', payload);
      if (res.code === 200) {
        message.success(editingVenue ? '场地更新成功' : '场地创建成功');
        setIsModalOpen(false);
        setPickerLocation(null);
        loadVenues();
      }
    } catch (err) {
      if (err?.errorFields) return;
      console.error(err);
    }
  };

  const handleCreateType = async () => {
    const name = newType.trim();
    if (!name) return;
    try {
      const res = await axios.post('/venue-types', { name });
      if (res.code === 200) {
        message.success('场地类型创建成功');
        setNewType('');
        loadVenueTypes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteType = async (typeId) => {
    try {
      const res = await axios.delete(`/venue-types/${typeId}`);
      if (res.code === 200) {
        message.success('场地类型删除成功');
        loadVenueTypes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const showQrModal = (record) => {
    setQrVenue(record);
    setIsQrModalOpen(true);
  };

  const downloadQrCode = () => {
    const canvas = document.getElementById('venue-qr-canvas');
    if (!canvas || !qrVenue) return;
    const link = document.createElement('a');
    link.download = `${qrVenue.name}-签到码.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const copyVenueCode = async () => {
    if (!qrVenue) return;
    try {
      await navigator.clipboard.writeText(getVenueCheckinValue(qrVenue));
      message.success('签到码内容已复制');
    } catch (err) {
      console.error(err);
      message.error('复制失败，请手动复制');
    }
  };

  const renderStatusTag = (status) => {
    const meta = getVenueStatusMeta(status);
    return <Tag color={meta.value === 1 ? 'success' : meta.value === 2 ? 'processing' : 'error'}>{meta.label}</Tag>;
  };

  const renderMapTag = (record) => (
    getVenueCoordinate(record)
      ? <Tag color='success'>已定位</Tag>
      : <Tag color='warning'>未定位</Tag>
  );

  const filterGridStyle = useMemo(() => (
    isMobile
      ? {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 12,
      }
      : {
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 2.4fr) minmax(160px, 1fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(240px, 1.5fr)',
        gap: 12,
        alignItems: 'stretch',
      }
  ), [isMobile]);

  const searchFilterItemStyle = useMemo(() => ({
    minWidth: 0,
    gridColumn: isMobile ? 'span 2' : 'span 1',
  }), [isMobile]);

  const commonFilterItemStyle = useMemo(() => ({
    minWidth: 0,
  }), []);

  const equipmentFilterItemStyle = useMemo(() => ({
    minWidth: 0,
    gridColumn: isMobile ? 'span 1' : 'span 1',
  }), [isMobile]);

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 72 },
    {
      title: '图片',
      dataIndex: 'image_url',
      width: 90,
      render: (value, record) => value ? <img src={resolveImageUrl(value)} alt={record.name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} /> : <Tag>无图</Tag>,
    },
    { title: '场地名称', dataIndex: 'name', width: 180 },
    { title: '类型', dataIndex: 'type_id', width: 120, render: (value) => getTypeName(value) },
    { title: '容量', dataIndex: 'capacity', width: 90 },
    { title: '开放时间', width: 150, render: (_, record) => `${record.open_start?.slice(0, 5)} - ${record.open_end?.slice(0, 5)}` },
    { title: '状态', dataIndex: 'status', width: 110, render: (value) => renderStatusTag(value) },
    { title: '地图定位', width: 100, render: (_, record) => renderMapTag(record) },
    { title: '设备', dataIndex: 'equipment', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 260,
      fixed: 'right',
      render: (_, record) => (
        <Space wrap>
          <Button type='link' icon={<EditOutlined />} onClick={() => openEditModal(record)}>编辑</Button>
          <Button type='link' icon={<QrcodeOutlined />} onClick={() => showQrModal(record)}>签到码</Button>
          <Popconfirm title='确认删除该场地吗？' onConfirm={() => handleDelete(record.id)}>
            <Button type='link' danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 12 }}>
        <div style={filterGridStyle}>
          <div style={searchFilterItemStyle}>
            <Input
              value={filters.keyword}
              onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              prefix={<SearchOutlined />}
              placeholder='搜索场地名称或设备'
            />
          </div>
          <div style={commonFilterItemStyle}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder='场地类型'
              value={filters.type}
              options={venueTypes.map((item) => ({ label: item.name, value: item.id }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}
            />
          </div>
          <div style={commonFilterItemStyle}>
            <Input
              value={filters.minCap}
              onChange={(e) => setFilters((prev) => ({ ...prev, minCap: e.target.value }))}
              placeholder='最小容量'
            />
          </div>
          <div style={commonFilterItemStyle}>
            <Input
              value={filters.maxCap}
              onChange={(e) => setFilters((prev) => ({ ...prev, maxCap: e.target.value }))}
              placeholder='最大容量'
            />
          </div>
          <div style={equipmentFilterItemStyle}>
            <Select
              mode='multiple'
              allowClear
              maxTagCount='responsive'
              style={{ width: '100%' }}
              value={filters.equipments}
              options={equipmentOptions}
              onChange={(value) => setFilters((prev) => ({ ...prev, equipments: value }))}
              placeholder='按设备标签筛选'
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <Button onClick={resetFilters}>重置筛选</Button>
          <Button onClick={() => setIsTypeModalOpen(true)}>维护场地类型</Button>
        </div>
      </Card>

      <Card title='场地列表' extra={<Button type='primary' icon={<PlusOutlined />} onClick={openCreateModal}>{isMobile ? '新增' : '新增场地'}</Button>}>
        {isMobile ? (
          <div>
            {filteredVenues.map((item) => (
              <VenueCardCompact
                key={item.id}
                name={item.name}
                imageUrl={item.image_url}
                statusTag={renderStatusTag(item.status)}
                capacity={item.capacity}
                typeName={getTypeName(item.type_id)}
                openStart={item.open_start?.slice(0, 5)}
                openEnd={item.open_end?.slice(0, 5)}
                footer={(
                  <>
                    <Tag color={getVenueCoordinate(item) ? 'success' : 'warning'}>{getVenueCoordinate(item) ? '已定位' : '未定位'}</Tag>
                    <Button size='small' onClick={() => openEditModal(item)}>编辑</Button>
                    <Button size='small' icon={<QrcodeOutlined />} onClick={() => showQrModal(item)}>签到码</Button>
                    <Popconfirm title='确认删除该场地吗？' onConfirm={() => handleDelete(item.id)}>
                      <Button size='small' danger>删除</Button>
                    </Popconfirm>
                  </>
                )}
              />
            ))}
            {!filteredVenues.length && <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>暂无场地数据</div>}
          </div>
        ) : (
          <Table rowKey='id' loading={loading} dataSource={filteredVenues} columns={columns} scroll={{ x: 1380 }} pagination={{ pageSize: 10, showSizeChanger: false }} />
        )}
      </Card>

      <Modal
        title={editingVenue ? '编辑场地' : '新增场地'}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalOpen(false);
          setPickerLocation(null);
        }}
        width={900}
        destroyOnHidden
      >
        <Form form={form} layout='vertical'>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name='name' label='场地名称' rules={[{ required: true, message: '请输入场地名称' }]}>
                <Input placeholder='例如：A101 教室 / 体育馆主馆' />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name='type_id' label='场地类型' rules={[{ required: true, message: '请选择场地类型' }]}>
                <Select options={venueTypes.map((item) => ({ label: item.name, value: item.id }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={8}><Form.Item name='capacity' label='容纳人数'><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name='status' label='场地状态'><Select options={[{ label: '开放', value: 1 }, { label: '维护中', value: 0 }, { label: '使用中', value: 2 }]} /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name='equipment' label='配套设备'><Select mode='tags' tokenSeparators={[',', '，', ';', '；', ' ']} options={equipmentOptions} placeholder='输入设备后回车确认' /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={12}><Form.Item name='open_start' label='开放开始时间' rules={[{ required: true, message: '请选择开始时间' }]}><TimePicker format='HH:mm' style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name='open_end' label='开放结束时间' rules={[{ required: true, message: '请选择结束时间' }]}><TimePicker format='HH:mm' style={{ width: '100%' }} /></Form.Item></Col>
          </Row>

          <Form.Item label='地图位置' required>
            <div className='admin-venue-map-picker'>
              <VenueMapBoard
                venues={venues}
                selectedVenueId={editingVenue?.id}
                allowPick
                pickerValue={currentPickerValue}
                onPick={handleMapPick}
                height={340}
                showSearch
                showLegend
                visible={isModalOpen}
              />
            </div>
            <div className='admin-venue-map-toolbar'>
              <div>
                {currentPickerValue
                  ? `当前位置：${formatCoordinate(currentPickerValue.lng)}, ${formatCoordinate(currentPickerValue.lat)}${currentPickerValue.address ? ` · ${currentPickerValue.address}` : ''}`
                  : '暂未选择地图位置'}
              </div>
              <Button onClick={clearLocation}>清除位置</Button>
            </div>
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name='map_x' label='经度' rules={[{ validator: validateLongitude }]}>
                <InputNumber precision={6} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name='map_y' label='纬度' rules={[{ validator: validateLatitude }]}>
                <InputNumber precision={6} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name='image_url' hidden><Input /></Form.Item>
          <Form.Item label='场地图片'>
            <Upload
              name='file'
              listType='picture-card'
              showUploadList={false}
              accept='image/png,image/jpeg,image/jpg,image/webp'
              customRequest={handleImageUpload}
              onChange={(info) => {
                if (info.file.status === 'done') {
                  const url = info.file.response?.data?.url;
                  form.setFieldValue('image_url', url);
                  message.success('图片上传成功');
                } else if (info.file.status === 'error') {
                  message.error('图片上传失败');
                }
              }}
            >
              {watchedImage ? (
                <img src={resolveImageUrl(watchedImage)} alt='venue' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传</div>
                </div>
              )}
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title='场地类型维护' open={isTypeModalOpen} footer={null} onCancel={() => setIsTypeModalOpen(false)}>
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder='输入新的场地类型名称' />
          <Button type='primary' onClick={handleCreateType}>新增</Button>
        </Space.Compact>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {venueTypes.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span>{item.name}</span>
              <Popconfirm title='确认删除该场地类型吗？' onConfirm={() => handleDeleteType(item.id)}>
                <Button type='link' danger size='small'>删除</Button>
              </Popconfirm>
            </div>
          ))}
        </div>
      </Modal>

      <Modal title={qrVenue ? `${qrVenue.name} 的签到码` : '签到码'} open={isQrModalOpen} footer={null} onCancel={() => setIsQrModalOpen(false)}>
        {qrVenue && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 12, color: '#666' }}>扫码内容：<code>{getVenueCheckinValue(qrVenue)}</code></div>
            <div style={{ display: 'inline-flex', padding: 16, background: '#fff', borderRadius: 12, boxShadow: 'inset 0 0 12px rgba(0,0,0,0.06)' }}>
              <QRCodeCanvas id='venue-qr-canvas' value={getVenueCheckinValue(qrVenue)} size={220} includeMargin />
            </div>
            <Space style={{ marginTop: 16 }} wrap>
              <Button onClick={copyVenueCode}>复制签到码内容</Button>
              <Button type='primary' onClick={downloadQrCode}>下载二维码</Button>
            </Space>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default VenueMgr;
