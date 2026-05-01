const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const ReservationQueue = require('../models/ReservationQueue');
const Notification = require('../models/Notification');
const CreditLog = require('../models/CreditLog');
const Evaluation = require('../models/Evaluation');
const { sendNotification } = require('../services/notificationService');
const { success, error } = require('../utils/response');

const signToken = (user) => new Promise((resolve, reject) => {
  jwt.sign(
    {
      user: {
        id: user.id,
        role: user.role,
      },
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
    (err, token) => {
      if (err) return reject(err);
      resolve(token);
    },
  );
});

const sanitizeUser = (user) => {
  const plain = user.toJSON ? user.toJSON() : user;
  const { password, ...rest } = plain;
  return rest;
};

const parseUserFromAuthHeader = (req) => {
  try {
    const authHeader = req.header('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.user || null;
  } catch (_) {
    return null;
  }
};

const normalizeRegisterRole = (req) => {
  const requester = parseUserFromAuthHeader(req);
  const requestedRole = Number(req.body.role);
  if (requester?.role === 9 && [1, 2, 9].includes(requestedRole)) {
    return requestedRole;
  }
  return 1;
};

const ensureAdminCountSafe = async (targetUser, nextRole, nextStatus) => {
  const isAdminNow = Number(targetUser.role) === 9 && Number(targetUser.status) === 1;
  const remainsAdmin = Number(nextRole ?? targetUser.role) === 9 && Number(nextStatus ?? targetUser.status) === 1;
  if (!isAdminNow || remainsAdmin) return true;
  const activeAdminCount = await User.count({ where: { role: 9, status: 1 } });
  return activeAdminCount > 1;
};

const queryCreditLogs = async ({ userId, violationsOnly = false, limit = 100 }) => {
  const where = { user_id: userId };
  if (violationsOnly) {
    where[Op.or] = [
      { reason: { [Op.like]: '%违约%' } },
      { reason: { [Op.like]: '%迟到%' } },
      { reason: { [Op.like]: '%失约%' } },
      { reason: { [Op.like]: '%超时%' } },
    ];
  }

  return CreditLog.findAll({
    where,
    order: [['create_time', 'DESC']],
    limit: Number(limit) || 100,
  });
};

exports.register = async (req, res) => {
  try {
    const { username, password, real_name } = req.body;
    if (!username || !password || !real_name) {
      return error(res, 400, '请填写账号、密码和真实姓名');
    }

    const existing = await User.findOne({ where: { username } });
    if (existing) {
      return error(res, 400, '该账号已存在');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      password: hashedPassword,
      real_name,
      role: normalizeRegisterRole(req),
      status: 1,
    });

    const token = await signToken(user);
    success(res, { token, user: sanitizeUser(user) }, '注册成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '注册失败');
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return error(res, 400, '请输入账号和密码');
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return error(res, 400, '账号或密码错误');
    }

    if (Number(user.status) !== 1) {
      return error(res, 403, '账号已被禁用，请联系管理员');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return error(res, 400, '账号或密码错误');
    }

    const token = await signToken(user);
    success(res, { token, user: sanitizeUser(user) }, '登录成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '登录失败');
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: { exclude: ['password'] } });
    if (!user) {
      return error(res, 404, '用户不存在');
    }
    success(res, user);
  } catch (err) {
    console.error(err);
    error(res, 500, '获取当前用户信息失败');
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { keyword, role, status } = req.query;
    const where = {};

    if (keyword) {
      where[Op.or] = [
        { username: { [Op.like]: `%${keyword}%` } },
        { real_name: { [Op.like]: `%${keyword}%` } },
      ];
    }

    if (role !== undefined && role !== '') where.role = Number(role);
    if (status !== undefined && status !== '') where.status = Number(status);

    const users = await User.findAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['create_time', 'DESC']],
    });

    success(res, users);
  } catch (err) {
    console.error(err);
    error(res, 500, '获取用户列表失败');
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { attributes: { exclude: ['password'] } });
    if (!user) {
      return error(res, 404, '用户不存在');
    }
    success(res, user);
  } catch (err) {
    console.error(err);
    error(res, 500, '获取用户详情失败');
  }
};

exports.updateUser = async (req, res) => {
  try {
    const targetUser = await User.findByPk(req.params.id);
    if (!targetUser) {
      return error(res, 404, '用户不存在');
    }

    const { username, real_name, role, status, credit_score, password } = req.body;
    const originalCredit = Number(targetUser.credit_score || 0);

    if (username && username !== targetUser.username) {
      const exists = await User.findOne({ where: { username } });
      if (exists) {
        return error(res, 400, '该账号已被占用');
      }
      targetUser.username = username;
    }

    if (!(await ensureAdminCountSafe(targetUser, role, status))) {
      return error(res, 400, '系统至少需要保留一个启用中的管理员账号');
    }

    if (real_name !== undefined) targetUser.real_name = real_name;
    if (role !== undefined && role !== '') targetUser.role = Number(role);
    if (status !== undefined && status !== '') targetUser.status = Number(status);

    let nextCredit = originalCredit;
    let creditChanged = false;
    if (credit_score !== undefined && credit_score !== null && credit_score !== '') {
      nextCredit = Number(credit_score);
      if (Number.isNaN(nextCredit)) {
        return error(res, 400, '信用分必须为数字');
      }
      targetUser.credit_score = nextCredit;
      creditChanged = nextCredit !== originalCredit;
    }

    if (password) {
      targetUser.password = await bcrypt.hash(password, 10);
    }

    await targetUser.save();

    if (creditChanged) {
      const delta = nextCredit - originalCredit;
      await CreditLog.create({
        user_id: targetUser.id,
        delta,
        reason: '管理员调整信用分',
        ref_id: req.user.id,
      });
      await sendNotification(
        targetUser.id,
        '信用分变动',
        `管理员已将您的信用分调整为 ${nextCredit} 分（${delta >= 0 ? '+' : ''}${delta}）。`,
        'alert',
        {
          bizType: 'credit',
          bizId: targetUser.id,
        },
      );
    }

    const freshUser = await User.findByPk(targetUser.id, { attributes: { exclude: ['password'] } });
    success(res, freshUser, '用户信息更新成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '更新用户信息失败');
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const targetUser = await User.findByPk(req.params.id);
    if (!targetUser) {
      return error(res, 404, '用户不存在');
    }

    if (!(await ensureAdminCountSafe(targetUser, targetUser.role, req.body.status))) {
      return error(res, 400, '系统至少需要保留一个启用中的管理员账号');
    }

    targetUser.status = Number(req.body.status);
    await targetUser.save();
    success(res, sanitizeUser(targetUser), '用户状态更新成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '更新用户状态失败');
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const targetUser = await User.findByPk(req.params.id);
    if (!targetUser) {
      return error(res, 404, '用户不存在');
    }

    if (Number(targetUser.id) === Number(req.user.id)) {
      return error(res, 400, '不能删除当前登录账号');
    }

    if (!(await ensureAdminCountSafe(targetUser))) {
      return error(res, 400, '系统至少需要保留一个启用中的管理员账号');
    }

    await sequelize.transaction(async (t) => {
      const reservations = await Reservation.findAll({
        where: { user_id: targetUser.id },
        attributes: ['id'],
        transaction: t,
      });
      const reservationIds = reservations.map((item) => item.id);

      if (reservationIds.length > 0) {
        await Evaluation.destroy({ where: { reservation_id: reservationIds }, transaction: t });
      }

      await Evaluation.destroy({ where: { user_id: targetUser.id }, transaction: t });
      await Notification.destroy({ where: { user_id: targetUser.id }, transaction: t });
      await CreditLog.destroy({ where: { user_id: targetUser.id }, transaction: t });
      await ReservationQueue.destroy({ where: { user_id: targetUser.id }, transaction: t });
      await Reservation.destroy({ where: { user_id: targetUser.id }, transaction: t });
      await targetUser.destroy({ transaction: t });
    });

    success(res, null, '用户删除成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '删除用户失败');
  }
};

exports.getMyCreditLogs = async (req, res) => {
  try {
    const list = await queryCreditLogs({
      userId: req.user.id,
      violationsOnly: String(req.query.violationsOnly || '') === '1',
      limit: req.query.limit || 100,
    });
    success(res, list);
  } catch (err) {
    console.error(err);
    error(res, 500, '获取信用记录失败');
  }
};

exports.getUserCreditLogs = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { attributes: ['id'] });
    if (!user) {
      return error(res, 404, '用户不存在');
    }

    const list = await queryCreditLogs({
      userId: user.id,
      violationsOnly: String(req.query.violationsOnly || '') === '1',
      limit: req.query.limit || 100,
    });
    success(res, list);
  } catch (err) {
    console.error(err);
    error(res, 500, '获取用户信用记录失败');
  }
};
