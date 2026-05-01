const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');
const Venue = require('./Venue');

const Reservation = sequelize.define('Reservation', {
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
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 0,
    comment: '状态(0待审核 1已预约 2已签到 3已取消 4违约)'
  },
  review_remark: {
    type: DataTypes.STRING,
    comment: '审核备注'
  },
  review_by: {
    type: DataTypes.INTEGER,
    comment: '审核人ID'
  },
  review_time: {
    type: DataTypes.DATE,
    comment: '审核时间'
  },
  checkin_code: {
    type: DataTypes.STRING,
    comment: '签到码'
  },
  checkin_time: {
    type: DataTypes.DATE,
    comment: '签到时间'
  },
  checkin_method: {
    type: DataTypes.STRING,
    comment: '签到方式'
  },
  checkin_operator_id: {
    type: DataTypes.INTEGER,
    comment: '签到操作人ID'
  },
  cancel_reason: {
    type: DataTypes.STRING,
    comment: '取消/关闭原因'
  },
  cancel_source: {
    type: DataTypes.STRING,
    comment: '取消来源'
  },
  cancel_by: {
    type: DataTypes.INTEGER,
    comment: '取消操作人ID'
  },
  cancel_time: {
    type: DataTypes.DATE,
    comment: '取消时间'
  },
  queue_entry_id: {
    type: DataTypes.INTEGER,
    comment: '候补记录ID'
  },
  purpose: {
    type: DataTypes.STRING,
    comment: '申请用途'
  }
}, {
  tableName: 'reservations',
  timestamps: true,
  createdAt: 'create_time',
  updatedAt: 'update_time'
});

Reservation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Reservation.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });
Reservation.hasOne(require('./Evaluation'), { foreignKey: 'reservation_id', as: 'evaluation' });

module.exports = Reservation;
