import { AlertTriangle, FileText } from 'lucide-react';

const BIOMARKER_ORDER = [
  'type_token_ratio',
  'repetition_rate',
  'disfluency_ratio',
  'negative_word_ratio',
  'word_entropy',
  'bigram_diversity',
  'semantic_coherence',
  'coherence_len_drift',
  'coherence_len_std',
  'first_person_ratio',
  'sentence_fragmentation',
  'sent_len_mean',
  'dep_depth_mean',
  'clause_count_ratio',
  'pronoun_ratio',
  'verb_ratio',
];

const BIOMARKER_LABELS = {
  type_token_ratio: 'Type-token ratio',
  repetition_rate: 'Repetition rate',
  disfluency_ratio: 'Disfluency ratio',
  negative_word_ratio: 'Negative-word ratio',
  word_entropy: 'Word entropy',
  bigram_diversity: 'Bigram diversity',
  semantic_coherence: 'Semantic coherence',
  coherence_len_drift: 'Coherence-length drift',
  coherence_len_std: 'Coherence-length standard deviation',
  first_person_ratio: 'First-person ratio',
  sentence_fragmentation: 'Sentence fragmentation',
  sent_len_mean: 'Mean sentence length',
  dep_depth_mean: 'Mean dependency depth',
  clause_count_ratio: 'Clause-count ratio',
  pronoun_ratio: 'Pronoun ratio',
  verb_ratio: 'Verb ratio',
};

const ACOUSTIC_BIOMARKER_ORDER = [
  'mean_energy_db',
  'spectral_centroid_hz',
  'spectral_bandwidth_hz',
  'spectral_rolloff_hz',
  'spectral_flatness',
  'voiced_frame_ratio',
];

const ACOUSTIC_BIOMARKER_LABELS = {
  mean_energy_db: 'Mean energy (dB)',
  spectral_centroid_hz: 'Spectral centroid (Hz)',
  spectral_bandwidth_hz: 'Spectral bandwidth (Hz)',
  spectral_rolloff_hz: 'Spectral roll-off (Hz)',
  spectral_flatness: 'Spectral flatness',
  voiced_frame_ratio: 'Voiced-frame ratio',
};

function formatValue(value) {
  return Number(value || 0).toFixed(4);
}

function displayClassification(value) {
  if (!value) return 'Not available';
  if (value === 'CONTROL') return 'TYPICAL SPEECH PATTERN';
  if (value.includes('LIKE SPEECH PATTERN')) return 'ATYPICAL SPEECH PATTERN';
  return value;
}

function spectrogramSrc(spectrogram) {
  if (!spectrogram?.data) return '';
  if (spectrogram.encoding === 'base64') return `data:${spectrogram.mimeType || 'image/svg+xml'};base64,${spectrogram.data}`;
  return `data:${spectrogram.mimeType || 'image/svg+xml'};utf8,${encodeURIComponent(spectrogram.data)}`;
}

function BiomarkerTable({ biomarkers, label = 'Feature summary', order = BIOMARKER_ORDER, labels = BIOMARKER_LABELS }) {
  if (!biomarkers) return null;
  return (
    <div className="biomarker-table-wrap" aria-label={label}>
      <table className="biomarker-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Value</th>
            <th>Ref</th>
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {order.map((name) => {
            const item = biomarkers[name];
            if (!item) return null;
            return (
              <tr key={name} className={item.flag ? 'flagged' : ''}>
                <td>{labels[name] || name}</td>
                <td>{formatValue(item.value)}</td>
                <td>{item.ref}</td>
                <td>{item.flag ? <span className={`feature-flag feature-flag-${item.flag.toLowerCase()}`}>{item.flag}</span> : <span className="feature-flag feature-flag-normal">Within range</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FindingList({ items }) {
  return (
    <ul className="clinical-list">
      {(items || []).map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function ReportCard({
  report,
  user,
  responses,
  combinedTranscript,
  combinedTranscriptUrl,
  zipUploadError,
}) {
  if (!report) {
    return (
      <section className="empty-state">
        <FileText size={30} />
        <h2>No report available</h2>
        <p>Generate a report after saving voice responses.</p>
      </section>
    );
  }

  const primarySpectrogramResponse = ['session', 'q4', 'q3', 'q2', 'q1']
    .map((questionId) => responses?.[questionId])
    .find((response) => response?.spectrogram?.data);
  const savedSpectrogram = report.spectrogram?.data
    ? report.spectrogram
    : primarySpectrogramResponse?.spectrogram;

  return (
    <article className="report clinical-report">
      <header className="clinical-header">
        <h1>PATIENT SPEECH ANALYSIS REPORT</h1>
      </header>

      <section className="clinical-summary">
        <div><span>Participant</span><strong>{user?.name || 'Unassigned session'}</strong></div>
        <div><span>File</span><strong>{report.fileName || 'combined-transcript.txt'}</strong></div>
        <div><span>Classification</span><strong>{displayClassification(report.classification)}</strong></div>
        <div><span>Based on</span><strong>{report.basedOn || 'upto_q3'}</strong></div>
        <div><span>Confidence</span><strong>{report.confidenceLevel || 'Low'}</strong></div>
        <div><span>Speech score</span><strong>{Number(report.probabilitySchizophrenia || 0).toFixed(4)}</strong></div>
        <div><span>Decision threshold</span><strong>{Number(report.decisionThreshold || 0).toFixed(4)}</strong></div>
        <div><span>Uncertain margin</span><strong>{Number(report.uncertaintyMargin || 0).toFixed(4)}</strong></div>
      </section>

      {report.finalSummary && (
        <section className="report-section">
          <h2>Final Summary</h2>
          <p className="overall-impression">{report.finalSummary}</p>
        </section>
      )}

      <section className="report-section">
        <h2>Linguistic Biomarker Summary</h2>
        <BiomarkerTable biomarkers={report.biomarkers} label="Linguistic feature summary" />
      </section>

      <section className="report-section">
        <h2>Saved Spectrogram</h2>
        {savedSpectrogram ? (
          <figure className="report-spectrogram">
            <img src={spectrogramSrc(savedSpectrogram)} alt="Saved recording spectrogram" />
            <figcaption>{savedSpectrogram.fileName || 'Saved recording spectrogram'}</figcaption>
          </figure>
        ) : (
          <p className="inline-status">No saved spectrogram is available in this report record. Generate the report after saving a WAV response.</p>
        )}
      </section>

      <section className="report-section">
        <h2>Acoustic Biomarker Summary</h2>
        {Object.keys(report.acousticBiomarkers || {}).length ? (
          <BiomarkerTable
            biomarkers={report.acousticBiomarkers}
            label="Acoustic feature summary"
            order={ACOUSTIC_BIOMARKER_ORDER}
            labels={ACOUSTIC_BIOMARKER_LABELS}
          />
        ) : <p className="inline-status">Acoustic feature values will be restored from the saved ZIP or calculated for newly saved WAV responses.</p>}
      </section>

      <section className="report-section clinical-sections">
        <div>
          <h2>1. Linguistic Findings</h2>
          <FindingList items={report.linguisticFindings} />
        </div>
        <div>
          <h2>2. Syntactic Findings</h2>
          <FindingList items={report.syntacticFindings} />
        </div>
        <div>
          <h2>3. Acoustic Biomarker Findings</h2>
          <FindingList items={report.acousticFindings} />
        </div>
        <div>
          <h2>4. Clinical Interpretation</h2>
          <div className="interpretation-list">
            {(report.clinicalInterpretation || []).map((item) => (
              <div key={`${item.biomarker}-${item.text}`} className="interpretation-item">
                <AlertTriangle size={18} />
                <p><strong>[{item.biomarker}]</strong> {item.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2>5. Overall Impression</h2>
          <p className="overall-impression">{report.overallImpression}</p>
        </div>
      </section>

      <section className="report-section">
        <h2>Transcript</h2>
        <div className="combined-transcript">
          <span>Stored transcript</span>
          <p>{combinedTranscript || 'No transcript was stored for this report.'}</p>
        </div>
        {combinedTranscriptUrl && <a className="icon-link transcript-download" href={combinedTranscriptUrl} target="_blank" rel="noreferrer"><FileText size={16} />Open transcript file</a>}
        {zipUploadError && <p className="inline-status">Drive ZIP upload status: {zipUploadError}</p>}
      </section>

      <footer className="clinical-disclaimer">
        DISCLAIMER: Research prototype only. Not validated for clinical use. Must NOT be used for diagnosis, treatment, or clinical decisions.
      </footer>
    </article>
  );
}
