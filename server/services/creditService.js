const User = require('../models/User');
const CreditLog = require('../models/CreditLog');
const sequelize = require('../config/db');

const applyCreditChange = async (userId, delta, reason, refId, eventKey, transaction) => {
    if (eventKey) {
        const existing = await CreditLog.findOne({
            where: { user_id: userId, event_key: eventKey },
            transaction,
            lock: transaction?.LOCK?.UPDATE,
        });
        if (existing) {
            return true;
        }
    }

    await CreditLog.create({
        user_id: userId,
        delta,
        reason,
        ref_id: refId,
        event_key: eventKey || null,
    }, { transaction });

    const user = await User.findByPk(userId, { transaction, lock: transaction?.LOCK?.UPDATE });
    if (user) {
        user.credit_score = Number(user.credit_score || 0) + Number(delta || 0);
        await user.save({ transaction });
    }

    return true;
};

/**
 * 变更用户信用分
 * @param {number} userId 用户ID
 * @param {number} delta 分值变化
 * @param {string} reason 变动原因
 * @param {number|null} refId 关联业务ID
 * @param {{eventKey?: string|null, transaction?: import('sequelize').Transaction|null}} options 扩展参数
 */
exports.updateCredit = async (userId, delta, reason, refId = null, options = {}) => {
    const { eventKey = null, transaction = null } = options;

    if (transaction) {
        try {
            await applyCreditChange(userId, delta, reason, refId, eventKey, transaction);
            return true;
        } catch (err) {
            console.error('Credit update failed:', err);
            return false;
        }
    }

    const t = await sequelize.transaction();
    try {
        await applyCreditChange(userId, delta, reason, refId, eventKey, t);
        await t.commit();
        return true;
    } catch (err) {
        await t.rollback();
        console.error('Credit update failed:', err);
        return false;
    }
};
