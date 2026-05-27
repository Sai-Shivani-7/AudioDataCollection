const express = require('express');
const { signup, login, googleLogin, me } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/google', googleLogin);
router.get('/me', requireAuth, me);

module.exports = router;
