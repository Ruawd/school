const express = require('express');
const router = express.Router();
const venueTypeController = require('../../controllers/venueTypeController');
const auth = require('../../middlewares/auth');
const { requireRole } = require('../../middlewares/auth');

router.get('/', auth, venueTypeController.getAllTypes);
router.post('/', auth, requireRole([9]), venueTypeController.createType);
router.delete('/:id', auth, requireRole([9]), venueTypeController.deleteType);

module.exports = router;
