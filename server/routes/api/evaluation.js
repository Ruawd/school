const express = require('express');
const router = express.Router();
const evaluationController = require('../../controllers/evaluationController');
const auth = require('../../middlewares/auth');

// @route   POST api/v1/evaluations
// @desc    提交评价
// @access  私有
router.post('/', auth, evaluationController.createEvaluation);

// @route   GET api/v1/evaluations
// @desc    获取所有评价 (Admin) or by venue (Public)
// @access  私有/公开
router.get('/', auth, (req, res, next) => {
    if (req.user.role === 9) {
        return evaluationController.getAllEvaluations(req, res);
    } else {
        return evaluationController.getVenueEvaluations(req, res);
    }
});

// @route   DELETE api/v1/evaluations/:id
// @desc    删除评价
// @access  私有 (Admin)
router.delete('/:id', auth, evaluationController.deleteEvaluation);

module.exports = router;
