import { useRef, useState } from 'react';
import { CircleStop, Mic, RotateCcw, Save, UserPlus } from 'lucide-react';
import { api } from '../api/client';
import { voiceQuestions } from '../data/voiceQuestions';

function makeSessionId(doctorId) {
  return `session-${doctorId}-${Date.now()}`;
}

function createSpeechRecognizer(onText) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const recognizer = new SpeechRecognition();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = 'en-US';
  recognizer.onresult = (event) => {
    const text = Array.from(event.results)
      .map((result) => result[0]?.transcript || '')
      .join(' ');
    onText(text);
  };
  return recognizer;
}

function writeString(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function audioBufferToWav(audioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const sampleCount = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = sampleCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex][sampleIndex]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

async function convertRecordingToWav(recordedBlob) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error('This browser cannot convert recordings to WAV.');

  const audioContext = new AudioContext();
  try {
    const sourceBuffer = await recordedBlob.arrayBuffer();
    const decodedAudio = await audioContext.decodeAudioData(sourceBuffer.slice(0));
    return new Blob([audioBufferToWav(decodedAudio)], { type: 'audio/wav' });
  } finally {
    await audioContext.close?.();
  }
}

export default function UserDashboard({ currentUser }) {
  const [sessionId, setSessionId] = useState(() => makeSessionId(currentUser?.id));
  const mediaRecorderRef = useRef(null);
  const speechRecognizerRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingStartedAtRef = useRef(null);

  const [durationMs, setDurationMs] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [patient, setPatient] = useState({ name: '', contact: '' });
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [recordingStopped, setRecordingStopped] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [savedResponses, setSavedResponses] = useState({});
  const [submissionId, setSubmissionId] = useState('');
  const [loadingAction, setLoadingAction] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [progressiveZipUrl, setProgressiveZipUrl] = useState('');
  const [audioCount, setAudioCount] = useState(0);

  const currentQuestion = voiceQuestions[stepIndex];
  const hasAllResponses = Object.keys(savedResponses).length === voiceQuestions.length;
  const currentQuestionSaved = savedResponses[currentQuestion?.id];

  function resetRecordingState() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      speechRecognizerRef.current?.stop();
      setIsRecording(false);
    }

    setAudioBlob(null);
    setRecordingStopped(false);
    setTranscript('');
    setDurationMs(0);
    setError('');
    setStatus('');
  }

  function selectStep(index) {
    if (index === stepIndex) return;
    resetRecordingState();
    setStepIndex(index);
  }

  async function startRecording() {
    if (!patient.name.trim()) {
      setError('Enter the patient name before recording.');
      return;
    }

    setError('');
    setStatus('');
    setAudioBlob(null);
    setRecordingStopped(false);
    setTranscript('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const recordedBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setDurationMs(recordingStartedAtRef.current ? Date.now() - recordingStartedAtRef.current : 0);
        stream.getTracks().forEach((track) => track.stop());
        try {
          setStatus('Preparing WAV audio...');
          const wavBlob = await convertRecordingToWav(recordedBlob);
          setAudioBlob(wavBlob);
          setStatus('Recording converted to WAV. Ready to save.');
        } catch (conversionError) {
          setAudioBlob(null);
          setError(conversionError.message || 'Unable to convert this recording to WAV. Please re-record.');
          setStatus('');
        }
      };
      recorder.start();
      recordingStartedAtRef.current = Date.now();
      mediaRecorderRef.current = recorder;

      const recognizer = createSpeechRecognizer(setTranscript);
      speechRecognizerRef.current = recognizer;
      recognizer?.start();
      setIsRecording(true);
    } catch (recordingError) {
      setError(recordingError.message || 'Microphone permission was denied.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    speechRecognizerRef.current?.stop();
    setIsRecording(false);
    setRecordingStopped(true);
  }

  function rerecord() {
    setAudioBlob(null);
    setTranscript('');
    setDurationMs(0);
    setRecordingStopped(false);
    setError('');
    setStatus('');
  }

  function startNewPatient() {
    mediaRecorderRef.current?.stop();
    speechRecognizerRef.current?.stop();
    setSessionId(makeSessionId(currentUser?.id));
    setPatient({ name: '', contact: '' });
    setStepIndex(0);
    setSavedResponses({});
    setSubmissionId('');
    setAudioBlob(null);
    setRecordingStopped(false);
    setTranscript('');
    setDurationMs(0);
    setStatus('');
    setError('');
    setProgressiveZipUrl('');
    setAudioCount(0);
  }

  async function saveAndNext() {
    if (!audioBlob) {
      setError('Record an answer before saving this question.');
      return;
    }

    setLoadingAction('save');
    setError('');
    setStatus('');

    try {
      const payload = new FormData();
      payload.append('sessionId', sessionId);
      payload.append('userName', patient.name);
      payload.append('userContact', patient.contact);
      payload.append('questionId', currentQuestion.id);
      payload.append('question', currentQuestion.text);
      payload.append('rawTranscript', transcript);
      payload.append('durationMs', String(durationMs));
      payload.append('audio', audioBlob, `${currentQuestion.id}.wav`);

      const response = await api.post('/upload-voice-response', payload);
      const savedId = response.data.submission?._id;
      if (savedId) setSubmissionId(savedId);

      setSavedResponses((current) => ({ ...current, [currentQuestion.id]: response.data.response }));
      setAudioBlob(null);
      setTranscript('');
      setRecordingStopped(false);
      setDurationMs(0);
      
      setStatus('Response saved. Audio is stored only inside the ZIP.');

      const cleanupError = response.data.progressiveZipCleanup?.error;
      if (cleanupError) {
        setError(`Audio ZIP was saved, but old Drive files could not be removed: ${cleanupError}`);
      }
      
      const zipUrl = response.data.submission?.progressiveZipGoogleDriveUrl;
      const count = response.data.progressiveZipAudioCount
        ?? (response.data.submission?.responses ? Object.keys(response.data.submission.responses).length : 0);
      if (zipUrl) {
        setProgressiveZipUrl(zipUrl);
        setAudioCount(count);
      }

      const nextIndex = Math.min(stepIndex + 1, voiceQuestions.length - 1);
      if (nextIndex !== stepIndex) setStepIndex(nextIndex);
    } catch (requestError) {
      const errorMsg = requestError.response?.data?.message || 'Unable to save this voice response.';
      setError(errorMsg);
    } finally {
      setLoadingAction('');
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Patient Recording</p>
          <h1>Speech Analysis</h1>
          <p>Record three patient voice prompts. Reports are generated later from the doctor dashboard.</p>
        </div>
        <button className="secondary" type="button" onClick={startNewPatient}>
          <UserPlus size={18} />
          New Patient
        </button>
      </header>

      <section className="form-panel profile-panel">
        <label className="field">
          <span>Patient name</span>
          <input value={patient.name} onChange={(event) => setPatient((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label className="field">
          <span>Contact or patient ID</span>
          <input value={patient.contact} onChange={(event) => setPatient((current) => ({ ...current, contact: event.target.value }))} />
        </label>
      </section>

      <div className="stepper three">
        {voiceQuestions.map((question, index) => (
          <button
            key={question.id}
            className={index === stepIndex ? 'active' : ''}
            type="button"
            onClick={() => selectStep(index)}
          >
            {index + 1}
            <span>{`Q${index + 1} status: ${savedResponses[question.id] ? 'saved' : 'pending'}`}</span>
          </button>
        ))}
      </div>

      <section className="form-panel recorder-panel">
        <div className="panel-heading">
          <h2>Question {stepIndex + 1}</h2>
          <p>{currentQuestion.text}</p>
        </div>

        {currentQuestionSaved && !audioBlob && !isRecording && (
          <div className="saved-response-info">
            <p className="success">This question has been saved.</p>
            {currentQuestionSaved.transcripts?.raw && (
              <div className="transcript-panel">
                <span>Saved transcript</span>
                <p>{currentQuestionSaved.transcripts.raw}</p>
              </div>
            )}
            <p className="inline-status">You can re-record to replace this response.</p>
          </div>
        )}

        <div className="recorder-controls">
          {!isRecording ? (
            <button className={recordingStopped ? 'secondary disabled-look' : 'primary'} type="button" onClick={startRecording} disabled={recordingStopped}>
              <Mic size={18} />
              {currentQuestionSaved && !recordingStopped ? 'Re-record' : 'Start Recording'}
            </button>
          ) : (
            <button type="button" onClick={stopRecording}>
              <CircleStop size={18} />
              Stop Recording
            </button>
          )}
          {recordingStopped && (
            <button className="secondary" type="button" onClick={rerecord}>
              <RotateCcw size={18} />
              Re-record
            </button>
          )}
          <span className={isRecording ? 'recording-dot active' : 'recording-dot'} />
        </div>

        <div className="transcript-panel">
          <span>Live transcript</span>
          <p>{transcript || 'Transcript will appear here when browser speech recognition is available.'}</p>
        </div>

        {audioBlob && <p className="inline-status">Recording is ready to save.</p>}
      </section>

      {status && <p className="success">{status}</p>}
      {progressiveZipUrl && (
        <p className="success">
          ZIP file saved with {audioCount} audio(s).
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="action-row">
        <button className="secondary" type="button" onClick={() => selectStep(Math.max(stepIndex - 1, 0))}>
          Back
        </button>
        <button type="button" onClick={saveAndNext} disabled={loadingAction !== '' || !audioBlob}>
          <Save size={18} />
          {loadingAction === 'save' ? 'Saving...' : 'Save and Next'}
        </button>
        {hasAllResponses && (
          <p className="inline-status">
            All answers are saved{submissionId ? ` for submission ${submissionId.slice(-6)}` : ''}. Generate the report from the doctor dashboard.
          </p>
        )}
      </div>
    </main>
  );
}
