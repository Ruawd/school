import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Timeline,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  SearchOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from '../../../services/request';
import { getRoleMeta, getRoleLabel } from '../../../utils/user';

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

const ROLE_OPTIONS = [
  { label: '全部角色', value: '' },
  { label: '学生', value: 1 },
  { label: '教师', value: 2 },
  { label: '管理员', value: 9 },
];

const DELETE_USER_CONFIRM_TITLE = '确定要删除这个用户吗？';
const DELETE_USER_CONFIRM_DESCRIPTION = '删除后，这个用户的预约、通知、评价和信用记录都会一并删除。';

const TABLE_ACTION_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
  width: '100%',
};

const TABLE_ACTION_BUTTON_STYLE = {
  width: '100%',
  justifyContent: 'flex-start',
  paddingInline: 0,
  marginInline: 0,
};

const MOBILE_ACTION_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
};

const MOBILE_ACTION_BUTTON_STYLE = {
  width: '100%',
};

const UserMgr = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ keyword: '', role: '', status: '' });
  const [formVisible, setFormVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [creditDrawerOpen, setCreditDrawerOpen] = useState(false);
  const [creditLogs, setCreditLogs] = useState([]);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditUser, setCreditUser] = useState(null);
  const [creditMode, setCreditMode] = useState('all');
  const [form] = Form.useForm();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);

  const loadUsers = async (overrideQuery = query) => {
    setLoading(true);
    try {
      const params = {};
      if (overrideQuery.keyword) params.keyword = overrideQuery.keyword.trim();
      if (overrideQuery.role !== '') params.role = overrideQuery.role;
      if (overrideQuery.status !== '') params.status = overrideQuery.status;
      const res = await axios.get('/auth/users', { params });
      if (res.code === 200) {
        setUsers(res.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCreditLogs = async (user, mode = creditMode) => {
    if (!user?.id) return;
    setCreditLoading(true);
    try {
      const res = await axios.get(`/auth/users/${user.id}/credit-logs`, {
        params: {
          violationsOnly: mode === 'violation' ? 1 : 0,
        },
      });
      if (res.code === 200) {
        setCreditLogs(res.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreditLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (creditDrawerOpen && creditUser) {
      loadCreditLogs(creditUser, creditMode);
    }
  }, [creditDrawerOpen, creditUser, creditMode]);

  const handleSearch = () => loadUsers(query);

  const handleReset = () => {
    const next = { keyword: '', role: '', status: '' };
    setQuery(next);
    loadUsers(next);
  };

  const openCreateModal = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: 1, status: 1, credit_score: 100 });
    setFormVisible(true);
  };

  const openEditModal = (record) => {
    setEditingUser(record);
    form.setFieldsValue({
      username: record.username,
      real_name: record.real_name,
      role: Number(record.role),
      status: Number(record.status),
      credit_score: Number(record.credit_score),
      password: '',
    });
    setFormVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        username: values.username.trim(),
        real_name: values.real_name.trim(),
        role: values.role,
        status: values.status,
        credit_score: values.credit_score,
      };
      if (values.password) payload.password = values.password;

      let res;
      if (editingUser) {
        res = await axios.put(`/auth/users/${editingUser.id}`, payload);
      } else {
        res = await axios.post('/auth/register', { ...payload, password: values.password });
      }

      if (res.code === 200) {
        message.success(editingUser ? '用户更新成功' : '用户创建成功');
        setFormVisible(false);
        form.resetFields();
        loadUsers();
      }
    } catch (err) {
      if (err?.errorFields) return;
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (record, checked) => {
    try {
      const res = await axios.put(`/auth/users/${record.id}/status`, { status: checked ? 1 : 0 });
      if (res.code === 200) {
        message.success('状态更新成功');
        loadUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (record) => {
    try {
      const res = await axios.delete(`/auth/users/${record.id}`);
      if (res.code === 200) {
        message.success('用户删除成功');
        loadUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openCreditDrawer = (record, mode = 'all') => {
    setCreditUser(record);
    setCreditMode(mode);
    setCreditDrawerOpen(true);
  };

  const renderRole = (role) => {
    const meta = getRoleMeta(role);
    return <Tag color={meta.color}>{meta.label}</Tag>;
  };

  const renderDelta = (delta) => {
    const positive = Number(delta) >= 0;
    return <Tag color={positive ? 'success' : 'error'}>{positive ? '+' : ''}{delta}</Tag>;
  };

  const renderUserActions = (record, compact = false) => {
    const isSelf = Number(record.id) === Number(currentUser.id);
    const buttonProps = compact
      ? { size: 'small', style: MOBILE_ACTION_BUTTON_STYLE }
      : { type: 'link', style: TABLE_ACTION_BUTTON_STYLE };

    return (
      <div style={compact ? MOBILE_ACTION_GRID_STYLE : TABLE_ACTION_GRID_STYLE}>
        <Button
          {...buttonProps}
          icon={compact ? null : <EditOutlined />}
          onClick={() => openEditModal(record)}
        >
          编辑
        </Button>
        <Button
          {...buttonProps}
          icon={compact ? null : <HistoryOutlined />}
          onClick={() => openCreditDrawer(record, 'all')}
        >
          信用记录
        </Button>
        <Button
          {...buttonProps}
          icon={compact ? null : <EyeOutlined />}
          onClick={() => openCreditDrawer(record, 'violation')}
        >
          违约记录
        </Button>
        <Popconfirm
          title={DELETE_USER_CONFIRM_TITLE}
          description={DELETE_USER_CONFIRM_DESCRIPTION}
          onConfirm={() => handleDelete(record)}
          disabled={isSelf}
        >
          <Button
            {...buttonProps}
            danger
            icon={compact ? null : <DeleteOutlined />}
            disabled={isSelf}
          >
            删除
          </Button>
        </Popconfirm>
      </div>
    );
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 72 },
    { title: '账号', dataIndex: 'username', width: 160 },
    { title: '姓名', dataIndex: 'real_name', width: 120 },
    { title: '角色', dataIndex: 'role', width: 110, render: renderRole },
    { title: '信用分', dataIndex: 'credit_score', width: 100 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (_, record) => (
        <Switch
          checked={Number(record.status) === 1}
          checkedChildren='启用'
          unCheckedChildren='禁用'
          onChange={(checked) => handleToggleStatus(record, checked)}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      width: 170,
      render: (value) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 300,
      render: (_, record) => renderUserActions(record),
    },
  ];

  const MobileUserCard = ({ user }) => (
    <Card key={user.id} size='small' style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{user.real_name}</div>
          <div style={{ color: '#666', marginTop: 4 }}>{user.username}</div>
        </div>
        <div>{renderRole(user.role)}</div>
      </div>
      <div style={{ marginTop: 10, color: '#666', fontSize: 13 }}>
        <div>信用分：{user.credit_score}</div>
        <div style={{ marginTop: 4 }}>状态：{Number(user.status) === 1 ? '启用' : '禁用'}</div>
        <div style={{ marginTop: 4 }}>创建时间：{user.create_time ? dayjs(user.create_time).format('YYYY-MM-DD HH:mm') : '-'}</div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 10 }}>
          <Switch checked={Number(user.status) === 1} onChange={(checked) => handleToggleStatus(user, checked)} />
        </div>
        {renderUserActions(user, true)}
      </div>
    </Card>
  );

  return (
    <>
      <Card title='用户管理' extra={<Button type='primary' icon={<UserAddOutlined />} onClick={openCreateModal}>新增用户</Button>}>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <Input
              allowClear
              value={query.keyword}
              onChange={(e) => setQuery((prev) => ({ ...prev, keyword: e.target.value }))}
              onPressEnter={handleSearch}
              prefix={<SearchOutlined />}
              placeholder='搜索账号或姓名'
            />
          </Col>
          <Col xs={12} md={4}>
            <Select style={{ width: '100%' }} value={query.role} options={ROLE_OPTIONS} onChange={(value) => setQuery((prev) => ({ ...prev, role: value }))} />
          </Col>
          <Col xs={12} md={4}>
            <Select style={{ width: '100%' }} value={query.status} options={STATUS_OPTIONS} onChange={(value) => setQuery((prev) => ({ ...prev, status: value }))} />
          </Col>
          <Col xs={12} md={4}><Button block type='primary' onClick={handleSearch}>查询</Button></Col>
          <Col xs={12} md={4}><Button block onClick={handleReset}>重置</Button></Col>
        </Row>

        {isMobile ? (
          users.length ? users.map((user) => <MobileUserCard key={user.id} user={user} />) : <Empty description='暂无用户数据' />
        ) : (
          <Table rowKey='id' loading={loading} dataSource={users} columns={columns} scroll={{ x: 1200 }} pagination={{ pageSize: 10, showSizeChanger: false }} />
        )}
      </Card>

      <Modal
        title={editingUser ? '编辑用户' : '新增用户'}
        open={formVisible}
        onOk={handleSubmit}
        onCancel={() => setFormVisible(false)}
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={form} layout='vertical'>
          <Form.Item name='username' label='账号' rules={[{ required: true, message: '请输入账号' }]}>
            <Input placeholder='学号/工号/管理员账号' />
          </Form.Item>
          <Form.Item name='real_name' label='姓名' rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder='真实姓名' />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name='role' label='角色' rules={[{ required: true, message: '请选择角色' }]}>
                <Select options={ROLE_OPTIONS.filter((item) => item.value !== '')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name='status' label='状态' rules={[{ required: true, message: '请选择状态' }]}>
                <Select options={STATUS_OPTIONS.filter((item) => item.value !== '')} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name='credit_score' label='信用分' rules={[{ required: true, message: '请输入信用分' }]}>
            <Input type='number' min={0} />
          </Form.Item>
          <Form.Item
            name='password'
            label={editingUser ? '重置密码（留空则不修改）' : '登录密码'}
            rules={editingUser ? [] : [{ required: true, message: '请输入登录密码' }, { min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password placeholder={editingUser ? '留空则保持原密码' : '请输入初始密码'} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={creditUser ? `${creditUser.real_name} 的信用档案` : '信用档案'}
        placement={isMobile ? 'bottom' : 'right'}
        size={isMobile ? '80vh' : 560}
        open={creditDrawerOpen}
        onClose={() => setCreditDrawerOpen(false)}
      >
        {creditUser ? (
          <>
            <Descriptions bordered size='small' column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label='账号'>{creditUser.username}</Descriptions.Item>
              <Descriptions.Item label='姓名'>{creditUser.real_name}</Descriptions.Item>
              <Descriptions.Item label='角色'>{getRoleLabel(creditUser.role)}</Descriptions.Item>
              <Descriptions.Item label='当前信用分'>{creditUser.credit_score}</Descriptions.Item>
              <Descriptions.Item label='账号状态'>{Number(creditUser.status) === 1 ? '启用' : '禁用'}</Descriptions.Item>
            </Descriptions>

            <Space style={{ marginBottom: 16 }} wrap>
              <Button type={creditMode === 'all' ? 'primary' : 'default'} onClick={() => setCreditMode('all')}>全部变动</Button>
              <Button type={creditMode === 'violation' ? 'primary' : 'default'} danger={creditMode === 'violation'} onClick={() => setCreditMode('violation')}>违约记录</Button>
            </Space>

            {creditLoading ? (
              <div style={{ padding: 32, textAlign: 'center' }}>加载中...</div>
            ) : creditLogs.length ? (
              <Timeline
                items={creditLogs.map((item) => ({
                  color: Number(item.delta) >= 0 ? 'green' : 'red',
                  children: (
                    <div>
                      <Space wrap>
                        {renderDelta(item.delta)}
                        <span style={{ fontWeight: 500 }}>{item.reason}</span>
                      </Space>
                      <div style={{ marginTop: 6, color: '#666' }}>时间：{item.create_time ? dayjs(item.create_time).format('YYYY-MM-DD HH:mm:ss') : '-'}</div>
                      <div style={{ marginTop: 4, color: '#999' }}>关联业务ID：{item.ref_id || '-'}</div>
                    </div>
                  ),
                }))}
              />
            ) : (
              <Empty description={creditMode === 'violation' ? '暂无违约记录' : '暂无信用变动记录'} />
            )}
          </>
        ) : null}
      </Drawer>
    </>
  );
};

export default UserMgr;
