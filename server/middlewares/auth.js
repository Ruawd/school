const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ code: 401, msg: '未提供 Token，拒绝访问' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.user?.id, {
      attributes: ['id', 'username', 'real_name', 'role', 'status', 'credit_score'],
    });

    if (!user) {
      return res.status(401).json({ code: 401, msg: '用户不存在或登录已失效' });
    }

    if (user.status !== 1) {
      return res.status(403).json({ code: 403, msg: '账号已被禁用，请联系管理员' });
    }

    req.user = user.toJSON();
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, msg: 'Token 无效' });
  }
};

const requireRole = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(Number(req.user.role))) {
    return res.status(403).json({ code: 403, msg: '无权操作' });
  }
  next();
};

module.exports = auth;
module.exports.requireRole = requireRole;
