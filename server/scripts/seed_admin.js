const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('../models/User');

async function seedAdminUser() {
  try {
    const existing = await User.findOne({
      where: { username: 'admin' },
      attributes: ['id'],
    });

    if (existing) {
      return { created: false, username: 'admin' };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('123456', salt);

    await User.create({
      username: 'admin',
      password: hashedPassword,
      real_name: '系统管理员',
      role: 9,
      status: 1,
      credit_score: 100,
    });

    return { created: true, username: 'admin', password: '123456' };
  } catch (err) {
    console.error('初始化管理员账号失败:', err);
    throw err;
  }
}

if (require.main === module) {
  seedAdminUser()
    .then((result) => {
      if (result.created) {
        console.log(`管理员账号已创建：${result.username} / ${result.password}`);
      } else {
        console.log('管理员账号已存在，无需重复初始化。');
      }
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = {
  seedAdminUser,
};
