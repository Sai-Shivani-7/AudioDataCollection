const Submission = require('../models/Submission');
const {
  buildOAuthConsentUrl,
  cleanupAudioCollectionFolder,
  downloadFileFromDrive,
  exchangeOAuthCode,
  exchangeDeviceCode,
  getDriveStatus,
  saveRefreshTokenToEnv,
  startDeviceAuthorization,
  updateZipInDrive,
  uploadZipToDrive,
} = require('../services/googleDriveService');
const {
  buildCombinedResult,
  buildCombinedTranscript,
  buildQuestionResult,
  buildReport,
  buildStructuredSubmissionJson,
  normalizeTranscript,
} = require('../services/mlService');
const { buildSpectrogramFromWav } = require('../services/spectrogramService');
const { createZip, extractZipEntries } = require('../services/zipService');

function sanitizeFolderSegment(value = 'participant') {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'participant';
}

function getUserId(sessionId, userId) {
  return userId || sessionId;
}

function withoutStandaloneAudioFields(response = {}) {
  const safeResponse = { ...(response || {}) };
  delete safeResponse.audioBuffer;
  delete safeResponse.audioUrl;
  delete safeResponse.audioPublicId;
  delete safeResponse.audioGoogleDriveFileId;
  delete safeResponse.audioGoogleDriveUrl;
  delete safeResponse.audioGoogleDriveUploadError;
  return safeResponse;
}

function serializeResponses(responses) {
  const plainResponses = responses instanceof Map
    ? Object.fromEntries(responses)
    : (responses || {});

  return Object.fromEntries(
    Object.entries(plainResponses).map(([key, value]) => [key, withoutStandaloneAudioFields(value)])
  );
}

function serializeSubmission(submission) {
  if (!submission) return submission;
  const plainSubmission = typeof submission.toObject === 'function' ? submission.toObject() : submission;
  return {
    ...plainSubmission,
    responses: serializeResponses(plainSubmission.responses),
  };
}

function getParticipantFileName(submission, extension) {
  const participant = sanitizeFolderSegment(submission.user?.name || submission.userId || submission.sessionId);
  const session = sanitizeFolderSegment(submission.sessionId || submission._id || 'session');
  return `${participant}-${session}-final-report.${extension}`;
}

function getParticipantSessionPrefix(submission) {
  const participant = sanitizeFolderSegment(submission.user?.name || submission.userId || submission.sessionId);
  const session = sanitizeFolderSegment(submission.sessionId || submission._id || 'session');
  return `${participant}-${session}`;
}

function extensionFromAudio(response) {
  const mimeType = response?.audioMimeType || '';
  if (mimeType.includes('wav')) return 'wav';
  return 'wav';
}

async function existingProgressiveAudioEntries(submission) {
  if (!submission.progressiveZipGoogleDriveFileId) return [];

  try {
    const zipBuffer = await downloadFileFromDrive(submission.progressiveZipGoogleDriveFileId);
    return extractZipEntries(zipBuffer)
      .filter((entry) => /^(audios\/)?(q[1-4]|session)\.wav$/i.test(entry.name))
      .map((entry) => ({
        name: entry.name.startsWith('audios/') ? entry.name : `audios/${entry.name}`,
        content: entry.content,
      }));
  } catch (zipError) {
    console.warn('Previous progressive ZIP could not be reused:', zipError.message);
    return [];
  }
}

async function buildFinalReportZip(submission, currentAudio) {
  const structuredSubmission = buildStructuredSubmissionJson(submission);
  const structuredJson = JSON.stringify(structuredSubmission, null, 2);
  const zipFileName = getParticipantFileName(submission, 'zip');
  const audioFiles = await existingProgressiveAudioEntries(submission);
  if (currentAudio?.questionId && currentAudio.buffer) {
    const currentName = `audios/${currentAudio.questionId}.wav`;
    const existingIndex = audioFiles.findIndex((entry) => entry.name === currentName);
    const currentEntry = { name: currentName, content: currentAudio.buffer };
    if (existingIndex >= 0) audioFiles[existingIndex] = currentEntry;
    else audioFiles.push(currentEntry);
  }
  const zipEntries = [
    {
      name: 'final-report.json',
      content: structuredJson,
    },
    ...audioFiles,
  ];
  const zipBuffer = createZip([
    ...zipEntries,
  ]);
  console.log(`Built ZIP ${zipFileName} with entries: ${zipEntries.map((entry) => entry.name).join(', ')}`);

  return { structuredSubmission, structuredJson, zipFileName, zipBuffer, zipEntries: zipEntries.map((entry) => entry.name) };
}

async function buildProgressiveAudioZip(submission, currentAudio) {
  const previousEntries = await existingProgressiveAudioEntries(submission);
  const filesByName = new Map(
    previousEntries.map((entry) => [entry.name.replace(/^audios\//, ''), entry.content])
  );

  if (currentAudio?.questionId && currentAudio.buffer) {
    filesByName.set(`${currentAudio.questionId}.wav`, currentAudio.buffer);
  }

  const responseEntries = Array.from(submission.responses || []);
  const orderedEntries = responseEntries.sort(([leftId], [rightId]) => {
    const order = ['q1', 'q2', 'q3', 'q4', 'session'];
    const leftIndex = order.indexOf(leftId);
    const rightIndex = order.indexOf(rightId);
    return (leftIndex === -1 ? order.length : leftIndex) - (rightIndex === -1 ? order.length : rightIndex);
  });

  const audioFiles = orderedEntries
    .map(([questionId, response]) => {
      const name = `${questionId}.${extensionFromAudio(response)}`;
      const content = filesByName.get(name);
      return content ? { name: `audios/${name}`, content } : null;
    })
    .filter(Boolean);

  const transcriptFiles = orderedEntries
    .map(([questionId, response]) => {
      const raw = response?.transcripts?.raw || '';
      const normalized = response?.transcripts?.normalized || '';
      const transcript = [
        `Question ID: ${questionId}`,
        `Prompt: ${response?.question || ''}`,
        '',
        'Raw transcript:',
        raw || '(No live transcript captured by the browser.)',
        '',
        'Normalized transcript:',
        normalized || '(No normalized transcript available.)',
        '',
      ].join('\n');
      return { name: `transcripts/${questionId}.txt`, content: Buffer.from(transcript, 'utf8') };
    });

  const spectrogramFiles = orderedEntries
    .map(([questionId, response]) => {
      const spectrogram = response?.spectrogram;
      return spectrogram?.data
        ? {
            name: `spectrograms/${questionId}.svg`,
            content: Buffer.from(spectrogram.data, spectrogram.encoding === 'base64' ? 'base64' : 'utf8'),
          }
        : null;
    })
    .filter(Boolean);

  const spectrogramErrorFiles = orderedEntries
    .map(([questionId, response]) => (
      response?.spectrogramError
        ? {
            name: `spectrograms/${questionId}-error.txt`,
            content: Buffer.from(response.spectrogramError, 'utf8'),
          }
        : null
    ))
    .filter(Boolean);

  const manifest = {
    generatedAt: new Date().toISOString(),
    entries: orderedEntries.map(([questionId, response]) => ({
      questionId,
      prompt: response?.question || '',
      audio: audioFiles.some((file) => file.name === `audios/${questionId}.wav`) ? `audios/${questionId}.wav` : null,
      transcript: `transcripts/${questionId}.txt`,
      spectrogram: response?.spectrogram?.data ? `spectrograms/${questionId}.svg` : null,
      spectrogramError: response?.spectrogramError || null,
    })),
  };

  const files = [
    { name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
    ...audioFiles,
    ...transcriptFiles,
    ...spectrogramFiles,
    ...spectrogramErrorFiles,
  ];

  const audioCount = audioFiles.length;
  const zipFileName = `${getParticipantSessionPrefix(submission)}-audios.zip`;
  const zipBuffer = createZip(files);
  const zipEntries = files.map((file) => file.name);
  console.log(`Built progressive ZIP ${zipFileName} with entries: ${zipEntries.join(', ')}`);

  return { zipFileName, zipBuffer, fileCount: audioCount, zipEntries };
}

async function uploadProgressiveAudioZipToDrive(submission, zipBuffer, zipFileName) {
  let cleanupResult = { cleanedFiles: [], error: null };
  try {
    const driveFile = await updateZipInDrive({
      buffer: zipBuffer,
      fileName: zipFileName,
      fileId: submission.progressiveZipGoogleDriveFileId,
    });
    submission.progressiveZipGoogleDriveFileId = driveFile.id;
    submission.progressiveZipGoogleDriveUrl = driveFile.webViewLink || driveFile.webContentLink;
    submission.progressiveZipFileUrl = driveFile.webViewLink || driveFile.webContentLink;
    submission.progressiveZipUploadError = undefined;
    try {
      const trashedFiles = await cleanupAudioCollectionFolder({
        keepFileIds: [driveFile.id],
      });
      cleanupResult.cleanedFiles = trashedFiles.map((file) => file.name);
      if (trashedFiles.length) {
        console.log(`Cleaned up duplicate audio files: ${trashedFiles.map((file) => file.name).join(', ')}`);
      }
    } catch (cleanupError) {
      cleanupResult.error = cleanupError.message;
      console.warn('Old duplicate audio cleanup failed:', cleanupError.message);
    }
    console.log(`Progressive audio ZIP uploaded: ${zipFileName} (${driveFile.id})`);
    return { driveFile, cleanupResult };
  } catch (uploadError) {
    console.warn('Google Drive upload for progressive ZIP failed:', uploadError.message);
    submission.progressiveZipUploadError = uploadError.message;
    return { driveFile: null, cleanupResult };
  }
}

async function findOrCreateSubmission({ sessionId, userId, user }) {
  return Submission.findOneAndUpdate(
    { sessionId },
    {
      $setOnInsert: {
        sessionId,
        userId: getUserId(sessionId, userId),
      },
      $set: {
        ...(user ? { user } : {}),
      },
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
}

async function saveProgress(req, res, next) {
  try {
    const { sessionId, user, responses, status } = req.body;
    const userId = req.user?._id?.toString() || req.body.userId;
    if (!sessionId) return res.status(400).json({ message: 'sessionId is required.' });

    const submission = await findOrCreateSubmission({ sessionId, userId, user });
    if (responses && typeof responses === 'object') {
      Object.entries(responses).forEach(([key, value]) => {
        submission.responses.set(key, withoutStandaloneAudioFields(value));
      });
    }
    submission.status = status || submission.status || 'in-progress';
    await submission.save();

    res.json({ message: 'Progress saved.', submission });
  } catch (error) {
    next(error);
  }
}

async function saveVoiceResponse(req, res, next) {
  try {
    const { sessionId, questionId, question, rawTranscript = '', durationMs = 0 } = req.body;
    const userId = req.user?._id?.toString() || req.body.userId;
    const user = {
      name: req.body.userName || req.body['user[name]'],
      contact: req.body.userContact || req.body['user[contact]'],
    };
    if (!sessionId) return res.status(400).json({ message: 'sessionId is required.' });
    if (!questionId || !question) return res.status(400).json({ message: 'questionId and question are required.' });
    if (!req.file) return res.status(400).json({ message: 'Recorded audio file is required.' });
    const isWavUpload = req.file.mimetype?.includes('wav') || req.file.originalname?.toLowerCase().endsWith('.wav');
    if (!isWavUpload) {
      return res.status(400).json({ message: 'Recorded audio must be uploaded as a WAV file.' });
    }

    const normalizedTranscript = normalizeTranscript(rawTranscript);
    const result = buildQuestionResult({
      rawTranscript,
      normalizedTranscript,
      fileName: req.file.originalname || `${questionId}.wav`,
    });
    let spectrogram = null;
    let spectrogramError = null;
    try {
      spectrogram = buildSpectrogramFromWav(req.file.buffer, {
        fileName: `${questionId}-spectrogram.svg`,
        title: `${questionId} spectrogram`,
      });
    } catch (error) {
      spectrogramError = error.message;
      console.warn(`Spectrogram generation failed for ${questionId}:`, spectrogramError);
    }

    const response = {
      questionId,
      question,
      audioMimeType: req.file.mimetype,
      audioSize: req.file.size,
      durationMs: Number(durationMs) || 0,
      transcripts: {
        raw: rawTranscript,
        normalized: normalizedTranscript,
      },
      spectrogram,
      spectrogramError,
      result,
      savedAt: new Date(),
    };

    const submission = await findOrCreateSubmission({ sessionId, userId, user });
    submission.responses.set(questionId, response);
    submission.combinedTranscript = buildCombinedTranscript(submission);
    submission.combinedResult = buildCombinedResult(submission);

    submission.status = questionId === 'session' || submission.responses.size >= 4 ? 'completed' : 'in-progress';

    await submission.save();

    let progressiveZipError = null;
    let progressiveZipCleanup = null;
    let progressiveZipEntries = [];
    try {
      const { zipFileName, zipBuffer, fileCount, zipEntries } = await buildProgressiveAudioZip(submission, {
        questionId,
        buffer: req.file.buffer,
      });
      progressiveZipEntries = zipEntries;
      const uploadResult = await uploadProgressiveAudioZipToDrive(submission, zipBuffer, zipFileName);
      progressiveZipCleanup = uploadResult.cleanupResult;
      await submission.save();
      console.log(`Progressive ZIP created with ${fileCount} audio(s). Entries: ${zipEntries.join(', ')}`);
    } catch (zipError) {
      progressiveZipError = zipError.message;
      console.warn(`Progressive ZIP creation/upload failed:`, progressiveZipError);
    }

    res.json({ 
      message: 'Voice response saved. Audio is stored only inside the ZIP.', 
      response: withoutStandaloneAudioFields(response), 
      submission: serializeSubmission(submission),
      progressiveZipAudioCount: submission.responses.size,
      progressiveZipEntries,
      progressiveZipCleanup,
      progressiveZipError: progressiveZipError || submission.progressiveZipUploadError || null,
    });
  } catch (error) {
    next(error);
  }
}

async function uploadZip(req, res, next) {
  try {
    const { sessionId } = req.body;
    const userId = req.user?._id?.toString() || req.body.userId;
    if (!sessionId) return res.status(400).json({ message: 'sessionId is required.' });
    if (!req.file) return res.status(400).json({ message: 'ZIP file is required.' });

    const driveFile = await uploadZipToDrive({
      buffer: req.file.buffer,
      fileName: req.file.originalname || 'submission.zip',
      mimeType: req.file.mimetype || 'application/zip',
    });

    const submission = await findOrCreateSubmission({ sessionId, userId });
    submission.zipGoogleDriveFileId = driveFile.id;
    submission.zipGoogleDriveUrl = driveFile.webViewLink || driveFile.webContentLink;
    submission.zipFileUrl = submission.zipGoogleDriveUrl;
    await submission.save();

    res.json({ message: 'ZIP uploaded to Google Drive.', zipFileUrl: submission.zipFileUrl, submission: serializeSubmission(submission) });
  } catch (error) {
    next(error);
  }
}

function googleDriveAuth(req, res, next) {
  try {
    res.redirect(buildOAuthConsentUrl());
  } catch (error) {
    next(error);
  }
}

async function googleDriveOAuthCallback(req, res, next) {
  try {
    const { code, error } = req.query;
    if (error) return res.status(400).send(`Google Drive authorization failed: ${error}`);
    if (!code) return res.status(400).send('Google Drive authorization code is missing.');

    const tokenPayload = await exchangeOAuthCode(code);
    if (!tokenPayload.refresh_token) {
      return res.status(400).send('Google did not return a refresh token. Revisit /api/google-drive/auth and approve access again.');
    }

    saveRefreshTokenToEnv(tokenPayload.refresh_token);
    res.send('Google Drive authorization saved. Restart the backend once, then generate the report again.');
  } catch (callbackError) {
    next(callbackError);
  }
}

async function googleDriveDeviceAuth(req, res, next) {
  try {
    const devicePayload = await startDeviceAuthorization();
    res.json({
      message: 'Open verification_url, enter user_code, approve Drive access, then POST device_code to /api/google-drive/device-token.',
      verification_url: devicePayload.verification_url,
      verification_url_complete: devicePayload.verification_url_complete,
      user_code: devicePayload.user_code,
      device_code: devicePayload.device_code,
      expires_in: devicePayload.expires_in,
      interval: devicePayload.interval,
    });
  } catch (error) {
    next(error);
  }
}

async function googleDriveDeviceToken(req, res, next) {
  try {
    const { deviceCode, device_code: deviceCodeSnake } = req.body;
    const selectedDeviceCode = deviceCode || deviceCodeSnake;
    if (!selectedDeviceCode) return res.status(400).json({ message: 'deviceCode is required.' });

    const tokenPayload = await exchangeDeviceCode(selectedDeviceCode);
    if (!tokenPayload.refresh_token) {
      return res.status(400).json({ message: 'Google did not return a refresh token. Start device authorization again and approve access.' });
    }

    saveRefreshTokenToEnv(tokenPayload.refresh_token);
    res.json({ message: 'Google Drive authorization saved. Restart the backend once, then generate the report again.' });
  } catch (error) {
    if (['authorization_pending', 'slow_down'].includes(error.googleError)) {
      return res.status(428).json({ message: 'Google authorization is not completed yet. Approve access, then retry this request.' });
    }
    next(error);
  }
}

async function googleDriveStatus(req, res, next) {
  try {
    const status = await getDriveStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
}

async function submitData(req, res, next) {
  try {
    const { sessionId, user } = req.body;
    const userId = req.user?._id?.toString() || req.body.userId;
    if (!sessionId) return res.status(400).json({ message: 'sessionId is required.' });
    const submission = await findOrCreateSubmission({ sessionId, userId, user });
    submission.status = 'completed';
    await submission.save();
    res.json({ message: 'Data submitted.', submission });
  } catch (error) {
    next(error);
  }
}

async function generateReport(req, res, next) {
  try {
    const { sessionId, submissionId } = req.body;
    const query = submissionId ? { _id: submissionId } : { sessionId };
    if (req.user?.role !== 'admin') query.userId = req.user?._id?.toString();
    const submission = await Submission.findOne(query);
    if (!submission) return res.status(404).json({ message: 'Submission not found.' });

    // Check that there are responses to generate a report from
    const responseCount = submission.responses ? submission.responses.size : 0;
    if (responseCount === 0) {
      return res.status(400).json({ message: 'No voice responses found for this submission.' });
    }

    submission.report = buildReport(submission);
    submission.status = 'report-generated';
    const structuredSubmission = buildStructuredSubmissionJson(submission);
    submission.zipFileUrl = undefined;
    submission.zipGoogleDriveFileId = undefined;
    submission.zipGoogleDriveUrl = undefined;
    submission.zipUploadError = undefined;

    await submission.save();

    res.json({
      message: 'Report generated.',
      report: submission.report,
      finalReportJson: structuredSubmission,
      zipFileUrl: submission.progressiveZipFileUrl,
      zipGoogleDriveUrl: submission.progressiveZipGoogleDriveUrl,
      zipUploadError: submission.progressiveZipUploadError,
      zipEntries: Array.from(submission.responses || []).map(([questionId]) => `${questionId}.wav`),
      submission: serializeSubmission(submission),
    });
  } catch (error) {
    next(error);
  }
}

async function getReport(req, res, next) {
  try {
    const query = { _id: req.params.id };
    if (req.user?.role !== 'admin') query.userId = req.user?._id?.toString();
    const submission = await Submission.findOne(query);
    if (!submission) return res.status(404).json({ message: 'Submission not found.' });
    if (!submission.report) return res.status(404).json({ message: 'Report has not been generated yet.' });

    // Convert Mongoose Map to a plain object for JSON serialization
    const responses = serializeResponses(submission.responses);

    res.json({
      submissionId: submission._id,
      user: submission.user,
      responses,
      combinedTranscript: submission.combinedTranscript,
      combinedTranscriptUrl: submission.combinedTranscriptUrl,
      combinedResult: submission.combinedResult,
      combinedResultUrl: submission.combinedResultUrl,
      reportUrl: submission.reportUrl,
      progressiveZipFileUrl: submission.progressiveZipFileUrl,
      progressiveZipGoogleDriveUrl: submission.progressiveZipGoogleDriveUrl,
      progressiveZipGoogleDriveFileId: submission.progressiveZipGoogleDriveFileId,
      zipFileUrl: submission.zipFileUrl,
      zipGoogleDriveUrl: submission.zipGoogleDriveUrl,
      zipUploadError: submission.zipUploadError,
      report: submission.report,
    });
  } catch (error) {
    next(error);
  }
}

async function getAdminUsers(req, res, next) {
  try {
    const submissions = await Submission.find().sort({ updatedAt: -1 }).lean();
    // .lean() returns plain JS objects, converting Mongoose Maps to regular objects
    // Ensure responses are always plain objects
    const serialized = submissions.map(serializeSubmission);
    res.json(serialized);
  } catch (error) {
    next(error);
  }
}

async function getMySubmissions(req, res, next) {
  try {
    const submissions = await Submission.find({ userId: req.user._id.toString() }).sort({ updatedAt: -1 }).lean();
    const serialized = submissions.map(serializeSubmission);
    res.json(serialized);
  } catch (error) {
    next(error);
  }
}

module.exports = {
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
};
