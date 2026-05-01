const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const auth = require('../../middlewares/auth');
const { requireRole } = require('../../middlewares/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', auth, authController.getMe);
router.get('/credit-logs/me', auth, authController.getMyCreditLogs);

router.get('/users', auth, requireRole([9]), authController.getAllUsers);
router.get('/users/:id/credit-logs', auth, requireRole([9]), authController.getUserCreditLogs);
router.get('/users/:id', auth, requireRole([9]), authController.getUserById);
router.put('/users/:id', auth, requireRole([9]), authController.updateUser);
router.put('/users/:id/status', auth, requireRole([9]), authController.updateUserStatus);
router.delete('/users/:id', auth, requireRole([9]), authController.deleteUser);

module.exports = router;
