const Evaluation = require('../models/Evaluation');
const Venue = require('../models/Venue');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const { success, error } = require('../utils/response');
const { sendNotification } = require('../services/notificationService');

exports.createEvaluation = async (req, res) => {
    try {
        const { reservation_id, rating, comment } = req.body;
        const reservation = await Reservation.findByPk(reservation_id);

        if (!reservation) return error(res, 404, '预约不存在');
        if (reservation.user_id !== req.user.id) return error(res, 403, '无权评价');
        if (Number(reservation.status) !== 2) return error(res, 400, '仅已签到的预约可评价');
        if (new Date(reservation.end_time) > new Date()) return error(res, 400, '预约结束后才可提交评价');
        if (!Number.isFinite(Number(rating)) || Number(rating) < 0.5 || Number(rating) > 5) {
            return error(res, 400, '评分范围需在 0.5 到 5 分之间');
        }
        if (!String(comment || '').trim()) return error(res, 400, '评价内容不能为空');

        // Allow multiple evaluations? Usually no.
        const exist = await Evaluation.findOne({ where: { reservation_id } });
        if (exist) return error(res, 400, '已评价，不可重复提交');

        const newEval = await Evaluation.create({
            user_id: req.user.id,
            venue_id: reservation.venue_id,
            reservation_id,
            rating,
            comment
        });

        // Optionally update reservation status to 5 (Evaluated) if supported, or just rely on existence

        await sendNotification(req.user.id, '评价成功', '感谢您的评价！');
        success(res, newEval, '评价成功');
    } catch (err) {
        console.error(err);
        error(res, 500, '评价提交失败');
    }
};

exports.getVenueEvaluations = async (req, res) => {
    try {
        const { venue_id } = req.query;
        const where = {};
        if (venue_id) where.venue_id = venue_id;

        const list = await Evaluation.findAll({
            where,
            include: [{ model: User, as: 'user', attributes: ['username', 'real_name'] }],
            order: [['create_time', 'DESC']]
        });
        success(res, list);
    } catch (err) {
        console.error(err);
        error(res, 500, '获取评价失败');
    }
};

exports.getAllEvaluations = async (req, res) => {
    try {
        const list = await Evaluation.findAll({
            include: [
                { model: User, as: 'user', attributes: ['real_name', 'username'] },
                { model: Venue, as: 'venue', attributes: ['name'] }
            ],
            order: [['create_time', 'DESC']]
        });
        success(res, list);
    } catch (err) {
        console.error(err);
        error(res, 500, '服务器错误');
    }
};

exports.deleteEvaluation = async (req, res) => {
    try {
        await Evaluation.destroy({ where: { id: req.params.id } });
        success(res, null, '删除成功');
    } catch (err) {
        error(res, 500, '删除失败');
    }
};
