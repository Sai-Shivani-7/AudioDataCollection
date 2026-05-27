const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const connectDatabase = require('./config/db');
const submissionRoutes = require('./routes/submissionRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  })
);
app.use(express.json({ limit: '10mb' }));
app.use('/api/auth', authRoutes);
app.use('/api', submissionRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Speech Analysis API',
    googleConfigured: Boolean(
      process.env.GOOGLE_DRIVE_ACCESS_TOKEN ||
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN ||
      (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
    ),
    googleOAuthConfigured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    googleOAuthAuthorized: Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ message: error.message || 'Server error.' });
});

connectDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
  });
});
