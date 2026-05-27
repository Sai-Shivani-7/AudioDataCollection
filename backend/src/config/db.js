const mongoose = require('mongoose');

async function connectDatabase() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/speech_analysis';

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000, // fail faster if unreachable
    });
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    console.error('');
    console.error('  The backend will start but database operations will fail.');
    console.error('  To fix: either start a local MongoDB instance or set MONGO_URI');
    console.error('  in .env to a MongoDB Atlas connection string.');
    console.error('');
    // Don't exit — let the server start so we can return proper error responses
    // instead of the frontend getting a network error with no explanation.
  }
}

module.exports = connectDatabase;
