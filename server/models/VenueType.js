const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const VenueType = sequelize.define('VenueType', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: '场地类型名称'
    }
}, {
    tableName: 'venue_types',
    timestamps: false
});

module.exports = VenueType;
