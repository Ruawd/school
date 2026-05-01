const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');
const Venue = require('./Venue');

const ReservationQueue = sequelize.define('ReservationQueue', {
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID'
  },
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '场地ID'
  },
  start_time: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '开始时间'
  },
  end_time: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '结束时间'
  },
  purpose: {
    type: DataTypes.STRING,
    comment: '申请用途'
  },
  credit_score: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '信用分'
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 0,
    comment: '状态(0排队中 1已晋级 2已取消)'
  },
  promoted_reservation_id: {
    type: DataTypes.INTEGER,
    comment: '晋级后的预约ID'
  },
  process_remark: {
    type: DataTypes.STRING,
    comment: '处理备注'
  },
  cancel_reason: {
    type: DataTypes.STRING,
    comment: '取消原因'
  },
  processed_time: {
    type: DataTypes.DATE,
    comment: '处理时间'
  }
}, {
  tableName: 'reservation_queue',
  timestamps: true,
  createdAt: 'create_time',
  updatedAt: 'update_time'
});

ReservationQueue.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ReservationQueue.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });

module.exports = ReservationQueue;
