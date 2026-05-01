const express = require('express');
const router = express.Router();
const reservationController = require('../../controllers/reservationController');
const auth = require('../../middlewares/auth');
const { requireRole } = require('../../middlewares/auth');

router.post('/', auth, reservationController.createReservation);
router.post('/batch', auth, reservationController.createBatchReservation);
router.get('/me', auth, reservationController.getMyReservations);
router.get('/queue/me', auth, reservationController.getMyQueueEntries);
router.get('/schedule', auth, reservationController.getVenueSchedule);
router.get('/stats', auth, requireRole([9]), reservationController.getReservationStats);
router.get('/reports/weekly', auth, requireRole([9]), reservationController.getWeeklyReport);
router.get('/reports/monthly', auth, requireRole([9]), reservationController.getMonthlyReport);
router.get('/queue', auth, requireRole([9]), reservationController.getAllQueueEntries);
router.get('/', auth, requireRole([9]), reservationController.getAllReservations);
router.put('/queue/:id/cancel', auth, reservationController.cancelMyQueueEntry);
router.put('/:id/cancel', auth, reservationController.cancelReservation);
router.put('/:id/status', auth, requireRole([9]), reservationController.updateReservationStatus);

module.exports = router;
