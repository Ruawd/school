const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: '学号/工号'
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '密码'
    },
    real_name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '本人姓名'
    },
    role: {
        type: DataTypes.TINYINT,
        defaultValue: 1 // 1:学生, 2:教师, 9:管理员
    },
    credit_score: {
        type: DataTypes.INTEGER,
        defaultValue: 100,
        comment: '信用分'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1 // 1:正常, 0:禁用
    }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'create_time',
    updatedAt: 'update_time'
});

module.exports = User;
