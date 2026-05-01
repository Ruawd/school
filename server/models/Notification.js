const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');

const Notification = sequelize.define('Notification', {
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '接收用户ID'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '标题'
  },
  content: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '内容'
  },
  type: {
    type: DataTypes.STRING,
    defaultValue: 'system',
    comment: '消息类型'
  },
  biz_type: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '业务类型'
  },
  biz_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '业务ID'
  },
  event_key: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '幂等事件键'
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否已读'
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  createdAt: 'create_time',
  updatedAt: false,
  indexes: [
    { fields: ['user_id', 'event_key'] },
    { fields: ['biz_type', 'biz_id'] }
  ]
});

Notification.belongsTo(User, { foreignKey: 'user_id' });

module.exports = Notification;
