const NEGATIVE_WORDS = ['bad', 'sad', 'angry', 'afraid', 'scared', 'worried', 'stress', 'difficult', 'confused', 'hard', 'hopeless'];
const FIRST_PERSON = ['i', 'me', 'my', 'mine', 'myself'];
const PRONOUNS = ['i', 'me', 'my', 'mine', 'myself', 'you', 'he', 'she', 'we', 'they', 'him', 'her', 'us', 'them'];
const COMMON_VERBS = ['am', 'is', 'are', 'was', 'were', 'be', 'being', 'been', 'do', 'does', 'did', 'go', 'went', 'have', 'has', 'had', 'feel', 'think', 'know', 'see', 'hear', 'want', 'need', 'make', 'say', 'talk', 'plan'];

const BIOMARKER_REFS = {
  type_token_ratio: { ref: '>0.4', direction: 'min', threshold: 0.4 },
  repetition_rate: { ref: '<0.35', direction: 'max', threshold: 0.35 },
  disfluency_ratio: { ref: '<0.1', direction: 'max', threshold: 0.1 },
  negative_word_ratio: { ref: '<0.06', direction: 'max', threshold: 0.06 },
  word_entropy: { ref: '>3.0', direction: 'min', threshold: 3.0 },
  bigram_diversity: { ref: '>0.5', direction: 'min', threshold: 0.5 },
  semantic_coherence: { ref: '>0.6', direction: 'min', threshold: 0.6 },
  coherence_len_drift: { ref: '<8.0', direction: 'max', threshold: 8.0 },
  coherence_len_std: { ref: '<10.0', direction: 'max', threshold: 10.0 },
  first_person_ratio: { ref: '<0.07', direction: 'max', threshold: 0.07 },
  sentence_fragmentation: { ref: '<0.2', direction: 'max', threshold: 0.2 },
  sent_len_mean: { ref: '>6.0', direction: 'min', threshold: 6.0 },
  dep_depth_mean: { ref: '>3.0', direction: 'min', threshold: 3.0 },
  clause_count_ratio: { ref: '>0.04', direction: 'min', threshold: 0.04 },
  pronoun_ratio: { ref: '<0.2', direction: 'max', threshold: 0.2 },
  verb_ratio: { ref: '>0.12', direction: 'min', threshold: 0.12 },
};

function normalizeTranscript(text = '') {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bi\b/g, 'I');
}

function wordsFrom(text = '') {
  return normalizeTranscript(text)
    .toLowerCase()
    .match(/[a-z']+/g) || [];
}

function sentencesFrom(text = '') {
  const sentences = normalizeTranscript(text)
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length ? sentences : [normalizeTranscript(text)].filter(Boolean);
}

function ratio(count, total) {
  return total ? count / total : 0;
}

function entropy(words) {
  if (!words.length) return 0;
  const counts = new Map();
  words.forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  return Array.from(counts.values()).reduce((sum, count) => {
    const p = count / words.length;
    return sum - p * Math.log2(p);
  }, 0);
}

function std(values) {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function flagFor(name, value) {
  const config = BIOMARKER_REFS[name];
  if (!config) return '';
  const high = config.direction === 'max' && value > config.threshold;
  const low = config.direction === 'min' && value < config.threshold;
  if (high) return 'HIGH';
  if (low) return 'LOW';
  return '';
}

function extractSpeechFeatures({ text = '' }) {
  const normalized = normalizeTranscript(text);
  const words = wordsFrom(normalized);
  const sentences = sentencesFrom(normalized);
  const uniqueWords = new Set(words);
  const bigrams = words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`);
  const uniqueBigrams = new Set(bigrams);
  const sentenceLengths = sentences.map((sentence) => wordsFrom(sentence).length).filter((length) => length > 0);
  const repeatedWords = words.filter((word, index) => index > 0 && word === words[index - 1]).length;
  const disfluencies = words.filter((word) => ['um', 'uh', 'hmm', 'like'].includes(word)).length;
  const firstPerson = words.filter((word) => FIRST_PERSON.includes(word)).length;
  const pronouns = words.filter((word) => PRONOUNS.includes(word)).length;
  const verbs = words.filter((word) => COMMON_VERBS.includes(word) || word.endsWith('ed') || word.endsWith('ing')).length;
  const negativeWords = words.filter((word) => NEGATIVE_WORDS.includes(word)).length;
  const clauseMarkers = words.filter((word) => ['and', 'but', 'because', 'when', 'while', 'although', 'if', 'then'].includes(word)).length;
  const lengthDrift = sentenceLengths.length > 1 ? Math.abs(sentenceLengths.at(-1) - sentenceLengths[0]) : 0;

  const values = {
    type_token_ratio: ratio(uniqueWords.size, words.length),
    repetition_rate: ratio(repeatedWords, words.length),
    disfluency_ratio: ratio(disfluencies, words.length),
    negative_word_ratio: ratio(negativeWords, words.length),
    word_entropy: entropy(words),
    bigram_diversity: ratio(uniqueBigrams.size, bigrams.length),
    semantic_coherence: Math.max(0, Math.min(1, 1 - std(sentenceLengths) / 20)),
    coherence_len_drift: lengthDrift,
    coherence_len_std: std(sentenceLengths),
    first_person_ratio: ratio(firstPerson, words.length),
    sentence_fragmentation: ratio(sentenceLengths.filter((length) => length < 4).length, sentenceLengths.length),
    sent_len_mean: sentenceLengths.length ? sentenceLengths.reduce((sum, value) => sum + value, 0) / sentenceLengths.length : 0,
    dep_depth_mean: Math.min(8, Math.max(1, 2 + clauseMarkers + Math.round((sentenceLengths[0] || 0) / 8))),
    clause_count_ratio: ratio(clauseMarkers, words.length),
    pronoun_ratio: ratio(pronouns, words.length),
    verb_ratio: ratio(verbs, words.length),
  };

  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      {
        value: Number(value.toFixed(4)),
        ref: BIOMARKER_REFS[name].ref,
        flag: flagFor(name, value),
      },
    ])
  );
}

function findingsFromBiomarkers(biomarkers) {
  const flagged = Object.entries(biomarkers).filter(([, item]) => item.flag);
  const linguisticFindings = [];
  const syntacticFindings = [];
  const clinicalInterpretation = [];

  if (biomarkers.first_person_ratio?.flag === 'HIGH') {
    linguisticFindings.push(`Elevated first-person pronoun ratio (${biomarkers.first_person_ratio.value.toFixed(3)})`);
    clinicalInterpretation.push({
      biomarker: 'first_person_ratio',
      text: 'High usage of first-person pronouns may indicate self-referential speech or preoccupation with personal experiences.',
    });
  }
  if (biomarkers.negative_word_ratio?.flag === 'HIGH') {
    linguisticFindings.push(`Elevated negative-word ratio (${biomarkers.negative_word_ratio.value.toFixed(3)})`);
    clinicalInterpretation.push({
      biomarker: 'negative_word_ratio',
      text: 'Higher negative emotional word use may reflect distress, dysphoria, or negatively valenced speech content.',
    });
  }
  if (biomarkers.disfluency_ratio?.flag === 'HIGH') {
    linguisticFindings.push(`Elevated disfluency ratio (${biomarkers.disfluency_ratio.value.toFixed(3)})`);
  }
  if (biomarkers.sentence_fragmentation?.flag === 'HIGH') {
    syntacticFindings.push(`Elevated sentence fragmentation (${biomarkers.sentence_fragmentation.value.toFixed(3)})`);
  }
  if (biomarkers.sent_len_mean?.flag === 'LOW') {
    syntacticFindings.push(`Reduced mean sentence length (${biomarkers.sent_len_mean.value.toFixed(3)})`);
  }
  if (biomarkers.dep_depth_mean?.flag === 'LOW') {
    syntacticFindings.push(`Reduced syntactic depth (${biomarkers.dep_depth_mean.value.toFixed(3)})`);
  }

  return {
    flaggedCount: flagged.length,
    linguisticFindings: linguisticFindings.length ? linguisticFindings : ['No notable linguistic deviations detected.'],
    syntacticFindings: syntacticFindings.length ? syntacticFindings : ['No notable syntactic deviations detected.'],
    clinicalInterpretation: clinicalInterpretation.length
      ? clinicalInterpretation
      : [{ biomarker: 'none', text: 'No individual biomarker exceeded the configured interpretive threshold.' }],
  };
}

function classifyFromBiomarkers(biomarkers) {
  const weights = {
    type_token_ratio: -0.7,
    repetition_rate: 0.6,
    disfluency_ratio: 0.8,
    negative_word_ratio: 0.9,
    word_entropy: -0.4,
    bigram_diversity: -0.3,
    semantic_coherence: -0.8,
    coherence_len_drift: 0.35,
    coherence_len_std: 0.25,
    first_person_ratio: 0.75,
    sentence_fragmentation: 0.6,
    sent_len_mean: -0.25,
    dep_depth_mean: -0.3,
    clause_count_ratio: -0.15,
    pronoun_ratio: 0.25,
    verb_ratio: -0.2,
  };
  const flagged = Object.values(biomarkers).filter((item) => item.flag).length;
  const linear = Object.entries(biomarkers).reduce((sum, [name, item]) => sum + (weights[name] || 0) * item.value, -1.4 + flagged * 0.25);
  const probability = 1 / (1 + Math.exp(-linear));
  const threshold = 0.45;
  const uncertaintyMargin = 0.08;
  const uncertain = Math.abs(probability - threshold) < uncertaintyMargin;
  const classification = uncertain ? 'UNCERTAIN' : probability >= threshold ? 'ATYPICAL SPEECH PATTERN' : 'TYPICAL SPEECH PATTERN';
  return { probability: Number(probability.toFixed(4)), threshold, uncertaintyMargin, uncertain, classification };
}

function buildAnalysis({ text = '', fileName = 'recording.wav' }) {
  const biomarkers = extractSpeechFeatures({ text });
  const decision = classifyFromBiomarkers(biomarkers);
  const findings = findingsFromBiomarkers(biomarkers);
  const overallImpression =
    decision.classification === 'TYPICAL SPEECH PATTERN'
      ? `Speech pattern appears broadly typical despite ${findings.flaggedCount} flagged biomarker(s). Isolated deviations do not necessarily indicate a stable pattern; speech-analysis score = ${decision.probability.toFixed(3)} falls below the calibrated threshold.`
      : decision.classification === 'UNCERTAIN'
        ? `Speech falls within the uncertainty band around the calibrated threshold. Interpret flagged biomarkers in the full assessment context.`
        : `Speech shows an atypical pattern with ${findings.flaggedCount} flagged biomarker(s). This research output requires professional review and cannot be used alone for decisions.`;

  return {
    fileName,
    classification: decision.classification,
    probabilitySchizophrenia: decision.probability,
    decisionThreshold: decision.threshold,
    uncertaintyMargin: decision.uncertaintyMargin,
    biomarkers,
    ...findings,
    overallImpression,
  };
}

function buildQuestionResult({ rawTranscript = '', normalizedTranscript = '', fileName = 'recording.wav' }) {
  return buildAnalysis({ text: normalizedTranscript || rawTranscript, fileName });
}

function orderedResponses(submission) {
  const responses = Object.fromEntries(submission.responses || []);
  return ['q1', 'q2', 'q3', 'q4'].map((id) => responses[id]).filter(Boolean);
}

function orderedResponseEntries(submission) {
  const responses = Object.fromEntries(submission.responses || []);
  return ['q1', 'q2', 'q3', 'q4']
    .filter((id) => responses[id])
    .map((id) => [id, responses[id]]);
}

function buildCombinedTranscript(submission) {
  return orderedResponses(submission)
    .map((response, index) => `Question ${index + 1}: ${response.question}\nTranscript: ${response.transcripts?.normalized || response.transcripts?.raw || ''}`)
    .join('\n\n');
}

function buildCombinedResult(submission) {
  return {
    ...buildAnalysis({ text: buildCombinedTranscript(submission), fileName: 'combined-transcript.txt' }),
    updatedAt: new Date(),
  };
}

function transcriptForResponse(response) {
  return response?.transcripts?.normalized || response?.transcripts?.raw || '';
}

function buildCumulativeTranscript(entries, uptoIndex) {
  return entries
    .slice(0, uptoIndex + 1)
    .map(([questionId, response]) => {
      const label = questionId.replace(/^q/, 'Question ');
      return `${label}: ${response.question}\nTranscript: ${transcriptForResponse(response)}`;
    })
    .join('\n\n');
}

function summarizePatterns(result, wordCount) {
  const biomarkers = result?.biomarkers || {};
  const notes = [];

  if (biomarkers.semantic_coherence?.flag === 'LOW') notes.push('reduced semantic coherence');
  else notes.push('coherence appears broadly preserved');

  if (biomarkers.repetition_rate?.flag === 'HIGH') notes.push('elevated immediate repetition');
  if (biomarkers.sentence_fragmentation?.flag === 'HIGH') notes.push('increased sentence fragmentation');
  if (biomarkers.disfluency_ratio?.flag === 'HIGH') notes.push('notable disfluency markers');
  if (biomarkers.type_token_ratio?.flag === 'LOW') notes.push('reduced lexical variety');
  if (biomarkers.coherence_len_std?.flag === 'HIGH' || biomarkers.coherence_len_drift?.flag === 'HIGH') {
    notes.push('variable sentence-length coherence');
  }

  const dataNote = wordCount < 25
    ? 'Interpret cautiously because the transcript is short.'
    : wordCount < 75
      ? 'The available transcript gives a moderate basis for interpretation.'
      : 'The transcript length supports a stronger pattern-level interpretation.';

  return `${notes.join('; ')}. ${dataNote}`;
}

function confidenceFromWordCount(wordCount, responseCount) {
  if (responseCount >= 3 && wordCount >= 75) return 'High';
  if (responseCount >= 2 && wordCount >= 25) return 'Medium';
  return 'Low';
}

function buildStructuredSubmissionJson(submission) {
  const entries = orderedResponseEntries(submission);
  const transcripts = {};
  const cumulativeTranscripts = {};
  const result = {};

  entries.forEach(([questionId, response], index) => {
    transcripts[questionId] = transcriptForResponse(response);
    cumulativeTranscripts[`upto_${questionId}`] = buildCumulativeTranscript(entries, index);
    result[questionId] = response.result || buildQuestionResult({
      rawTranscript: response.transcripts?.raw || '',
      normalizedTranscript: response.transcripts?.normalized || '',
      fileName: `${questionId}.wav`,
    });
  });

  const [highestQuestionId] = entries.at(-1) || ['q1'];
  const basedOn = `upto_${highestQuestionId}`;
  const latestTranscript = cumulativeTranscripts[basedOn] || '';
  const finalResult = buildAnalysis({ text: latestTranscript, fileName: `${basedOn}-transcript.txt` });
  const wordCount = wordsFrom(latestTranscript).length;

  return {
    transcripts,
    cumulative_transcripts: cumulativeTranscripts,
    result,
    final_report: {
      based_on: basedOn,
      final_report: {
        final_result: finalResult,
      },
      final_summary: summarizePatterns(finalResult, wordCount),
      confidence_level: confidenceFromWordCount(wordCount, entries.length),
    },
  };
}

function buildReport(submission) {
  const structuredSubmission = buildStructuredSubmissionJson(submission);
  const finalReport = structuredSubmission.final_report.final_report.final_result;
  const questionResults = orderedResponses(submission)
    .filter((response) => response?.result)
    .map((response) => ({
      questionId: response.questionId,
      question: response.question,
      ...response.result,
    }));

  return {
    title: 'PATIENT SPEECH ANALYSIS REPORT',
    basedOn: structuredSubmission.final_report.based_on,
    fileName: `${structuredSubmission.final_report.based_on}-transcript.txt`,
    classification: finalReport.classification,
    probabilitySchizophrenia: finalReport.probabilitySchizophrenia,
    decisionThreshold: finalReport.decisionThreshold,
    uncertaintyMargin: finalReport.uncertaintyMargin,
    biomarkers: finalReport.biomarkers,
    linguisticFindings: finalReport.linguisticFindings,
    syntacticFindings: finalReport.syntacticFindings,
    clinicalInterpretation: finalReport.clinicalInterpretation,
    overallImpression: finalReport.overallImpression,
    finalSummary: structuredSubmission.final_report.final_summary,
    confidenceLevel: structuredSubmission.final_report.confidence_level,
    questionResults,
    structuredSubmission,
    generatedAt: new Date(),
  };
}

module.exports = {
  normalizeTranscript,
  extractSpeechFeatures,
  buildCombinedTranscript,
  buildCombinedResult,
  buildQuestionResult,
  buildReport,
  buildStructuredSubmissionJson,
};
