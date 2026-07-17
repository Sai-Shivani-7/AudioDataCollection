const express = require('express');
const uploadMemory = require('../middleware/upload');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  saveProgress,
  saveVoiceResponse,
  submitData,
  uploadZip,
  googleDriveAuth,
  googleDriveOAuthCallback,
  googleDriveDeviceAuth,
  googleDriveDeviceToken,
  googleDriveStatus,
  generateReport,
  getReport,
  getAdminUsers,
  getMySubmissions,
} = require('../controllers/submissionController');

const router = express.Router();

router.post('/save-progress', requireAuth, saveProgress);
router.post('/submit-data', requireAuth, submitData);
router.post('/generate-report', requireAuth, requireAdmin, generateReport);
router.post('/upload-voice-response', requireAuth, uploadMemory.single('audio'), saveVoiceResponse);
router.post('/upload-zip', requireAuth, uploadMemory.single('zipFile'), uploadZip);
router.get('/google-drive/auth', googleDriveAuth);
router.get('/google-drive/oauth2callback', googleDriveOAuthCallback);
router.get('/google-drive/device-auth', googleDriveDeviceAuth);
router.post('/google-drive/device-token', googleDriveDeviceToken);
router.get('/google-drive/status', requireAuth, requireAdmin, googleDriveStatus);
router.get('/get-report/:id', requireAuth, getReport);
router.get('/my-submissions', requireAuth, getMySubmissions);
router.get('/admin/users', requireAuth, requireAdmin, getAdminUsers);

module.exports = router;
