import React, { useState } from 'react';
import { Card, Form, Input, Button, message, Tabs } from 'antd';
import { UserOutlined, LockOutlined, IdcardOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from '../../services/request';
import './style.css';

const Login = () => {
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const navigate = useNavigate();

  const jumpByRole = () => {
    navigate('/home');
  };

  const handleLogin = async (values) => {
    setLoginLoading(true);
    try {
      const res = await axios.post('/auth/login', values);
      if (res.code === 200) {
        message.success('登录成功');
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        jumpByRole(res.data.user);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (values) => {
    setRegisterLoading(true);
    try {
      const res = await axios.post('/auth/register', values);
      if (res.code === 200) {
        message.success('注册成功，已自动登录');
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        jumpByRole(res.data.user);
      }
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="login-container">
      <Card
        title="校园场地智能预约系统"
        variant="borderless"
        style={{ maxWidth: 420, width: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      >
        <Tabs
          defaultActiveKey="login"
          items={[
            {
              key: 'login',
              label: '账号登录',
              children: (
                <Form name="login" onFinish={handleLogin} size="large">
                  <Form.Item
                    name="username"
                    rules={[{ required: true, message: '请输入学号/工号' }]}
                  >
                    <Input prefix={<UserOutlined />} placeholder="学号/工号" />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                  </Form.Item>

                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loginLoading} block>
                      登录
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'register',
              label: '用户注册',
              children: (
                <Form name="register" onFinish={handleRegister} size="large">
                  <Form.Item
                    name="username"
                    rules={[{ required: true, message: '请输入学号/工号' }]}
                  >
                    <Input prefix={<UserOutlined />} placeholder="学号/工号" />
                  </Form.Item>

                  <Form.Item
                    name="real_name"
                    rules={[{ required: true, message: '请输入真实姓名' }]}
                  >
                    <Input prefix={<IdcardOutlined />} placeholder="真实姓名" />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 6, message: '密码至少 6 位' },
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                  </Form.Item>

                  <Form.Item
                    name="confirmPassword"
                    dependencies={['password']}
                    rules={[
                      { required: true, message: '请再次输入密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('两次输入的密码不一致'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
                  </Form.Item>

                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={registerLoading} block>
                      注册并登录
                    </Button>
                  </Form.Item>

                  <div style={{ textAlign: 'center', color: '#666' }}>
                    自助注册默认创建为普通用户
                  </div>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default Login;
