const express = require('express');
const router = express.Router();

router.use('/auth', require('./api/auth'));
router.use('/venues', require('./api/venue'));
router.use('/reservations', require('./api/reservation'));
router.use('/checkin', require('./api/checkin'));
router.use('/evaluations', require('./api/evaluation'));
router.use('/upload', require('./api/upload'));
router.use('/venue-types', require('./api/venueType'));
router.use('/notifications', require('./api/notification'));

module.exports = router;
