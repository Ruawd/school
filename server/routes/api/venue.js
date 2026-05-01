const express = require('express');
const router = express.Router();
const venueController = require('../../controllers/venueController');
const auth = require('../../middlewares/auth');
const { requireRole } = require('../../middlewares/auth');

// @route   GET api/v1/venues
// @desc    获取场地列表
// @access  私有
router.get('/', auth, venueController.getVenues);

// @route   GET api/v1/venues/:id
// @desc    获取场地详情
// @access  私有
router.get('/:id', auth, venueController.getVenueById);

// @route   POST api/v1/venues
// @desc    创建场地
// @access  私有（仅管理员）
router.post('/', auth, requireRole([9]), venueController.createVenue);

// @route   PUT api/v1/venues/:id
// @desc    更新场地
// @access  私有 (仅管理员)
router.put('/:id', auth, requireRole([9]), venueController.updateVenue);

// @route   DELETE api/v1/venues/:id
// @desc    删除场地
// @access  私有 (仅管理员)
router.delete('/:id', auth, requireRole([9]), venueController.deleteVenue);

module.exports = router;
