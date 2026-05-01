const express = require('express');
const router = express.Router();
const checkinController = require('../../controllers/checkinController');
const auth = require('../../middlewares/auth');

// @route   POST api/v1/checkin
// @desc    扫码签到
// @access  私有
router.post('/', auth, checkinController.checkin);

module.exports = router;
