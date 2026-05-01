const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');
const Venue = require('./Venue');

const Evaluation = sequelize.define('Evaluation', {
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '评价人ID'
  },
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '场地ID'
  },
  reservation_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '预约ID'
  },
  rating: {
    type: DataTypes.TINYINT,
    allowNull: false,
    comment: '评分(1-5)'
  },
  comment: {
    type: DataTypes.STRING,
    comment: '评价内容'
  }
}, {
  tableName: 'biz_evaluations',
  timestamps: true,
  createdAt: 'create_time',
  updatedAt: false
});

Evaluation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Evaluation.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });
Evaluation.belongsTo(sequelize.models.Reservation, { foreignKey: 'reservation_id', as: 'reservation' });

module.exports = Evaluation;
