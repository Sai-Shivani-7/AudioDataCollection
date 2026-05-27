const mongoose = require('mongoose');

const transcriptSchema = new mongoose.Schema(
  {
    raw: String,
    normalized: String,
  },
  { _id: false }
);

const responseSchema = new mongoose.Schema(
  {
    questionId: String,
    question: String,
    audioMimeType: String,
    audioSize: Number,
    durationMs: Number,
    transcripts: transcriptSchema,
    result: {
      type: mongoose.Schema.Types.Mixed,
    },
    savedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    title: String,
    basedOn: String,
    fileName: String,
    classification: String,
    probabilitySchizophrenia: Number,
    decisionThreshold: Number,
    uncertaintyMargin: Number,
    biomarkers: mongoose.Schema.Types.Mixed,
    linguisticFindings: [String],
    syntacticFindings: [String],
    clinicalInterpretation: mongoose.Schema.Types.Mixed,
    overallImpression: String,
    finalSummary: String,
    confidenceLevel: String,
    questionResults: [
      mongoose.Schema.Types.Mixed,
    ],
    structuredSubmission: mongoose.Schema.Types.Mixed,
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    user: {
      name: String,
      contact: String,
    },
    responses: {
      type: Map,
      of: responseSchema,
      default: {},
    },
    combinedTranscript: String,
    combinedTranscriptUrl: String,
    combinedResult: {
      type: mongoose.Schema.Types.Mixed,
    },
    combinedResultUrl: String,
    reportUrl: String,
    progressiveZipFileUrl: String,
    progressiveZipGoogleDriveFileId: String,
    progressiveZipGoogleDriveUrl: String,
    progressiveZipUploadError: String,
    zipFileUrl: String,
    zipGoogleDriveFileId: String,
    zipGoogleDriveUrl: String,
    zipUploadError: String,
    report: reportSchema,
    status: {
      type: String,
      enum: ['in-progress', 'completed', 'report-generated'],
      default: 'in-progress',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Submission', submissionSchema);
