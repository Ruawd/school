const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Venue = sequelize.define('Venue', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '场地名称'
    },
    type_id: {
        type: DataTypes.INTEGER,
        comment: '场地类型ID'
    },
    capacity: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '容纳人数'
    },
    open_start: {
        type: DataTypes.TIME,
        defaultValue: '08:00:00',
        comment: '开放开始时间'
    },
    open_end: {
        type: DataTypes.TIME,
        defaultValue: '22:00:00',
        comment: '开放结束时间'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1, // 0:维护 1:开放 2:使用中
        comment: '状态 (0:维护 1:开放 2:使用中)'
    },
    image_url: {
        type: DataTypes.STRING,
        comment: '场地图片URL'
    },
    equipment: {
        type: DataTypes.STRING,
        comment: '场地设备 (e.g. 投影仪, 音响)'
    }
    ,
    checkin_token: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        comment: '??????'
    },
    map_x: {
        type: DataTypes.FLOAT,
        comment: '地图X坐标(0-100)'
    },
    map_y: {
        type: DataTypes.FLOAT,
        comment: '地图Y坐标(0-100)'
    }
}, {
    tableName: 'venues',
    timestamps: true,
    createdAt: 'create_time',
    updatedAt: 'update_time'
});

module.exports = Venue;
