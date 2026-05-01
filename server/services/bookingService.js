const Reservation = require('../models/Reservation');
const { Op } = require('sequelize');

/**
 * 核心预约服务
 * 处理冲突检测、信用分检测等逻辑
 */

// 检测时间段冲突
exports.checkConflict = async (venueId, start, end) => {
    // start < existing.end AND end > existing.start
    // Status 1(Booked) or 2(CheckedIn)
    const count = await Reservation.count({
        where: {
            venue_id: venueId,
            status: { [Op.in]: [1, 2] },
            start_time: { [Op.lt]: end },
            end_time: { [Op.gt]: start }
        }
    });
    return count > 0;
};
