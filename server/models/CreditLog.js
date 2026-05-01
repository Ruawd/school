const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');

const CreditLog = sequelize.define('CreditLog', {
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID'
  },
  delta: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '变动值'
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '变动原因'
  },
  event_key: {
    type: DataTypes.STRING,
    comment: '幂等事件键'
  },
  ref_id: {
    type: DataTypes.INTEGER,
    comment: '关联业务ID'
  }
}, {
  tableName: 'log_credits',
  timestamps: true,
  createdAt: 'create_time',
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['user_id', 'event_key'] },
  ]
});

CreditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = CreditLog;
