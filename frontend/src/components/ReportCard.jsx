import { AlertTriangle, FileArchive, FileText } from 'lucide-react';

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

function BiomarkerTable({ biomarkers }) {
  if (!biomarkers) return null;
  return (
    <div className="biomarker-table-wrap">
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
          {BIOMARKER_ORDER.map((name) => {
            const item = biomarkers[name];
            if (!item) return null;
            return (
              <tr key={name} className={item.flag ? 'flagged' : ''}>
                <td>{name}</td>
                <td>{formatValue(item.value)}</td>
                <td>{item.ref}</td>
                <td>{item.flag ? `${item.flag === 'HIGH' ? '↑' : '↓'} ${item.flag}` : ''}</td>
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
  combinedResultUrl,
  reportUrl,
  zipFileUrl,
  zipGoogleDriveUrl,
  zipUploadError,
}) {
  if (!report) {
    return (
      <section className="empty-state">
        <FileText size={30} />
        <h2>No report available</h2>
        <p>Generate a report after saving the three voice responses.</p>
      </section>
    );
  }

  const responseList = Object.values(responses || {});

  return (
    <article className="report clinical-report">
      <header className="clinical-header">
        <h1>PATIENT SPEECH ANALYSIS REPORT</h1>
        <p>Research Prototype - NOT for Clinical Use</p>
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
        <h2>Biomarker Summary</h2>
        <BiomarkerTable biomarkers={report.biomarkers} />
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
          <h2>3. Clinical Interpretation</h2>
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
          <h2>4. Overall Impression</h2>
          <p className="overall-impression">{report.overallImpression}</p>
        </div>
      </section>

      <section className="report-section">
        <h2>Stored Response Files</h2>
        <div className="asset-links">
          {combinedTranscriptUrl && <a className="icon-link" href={combinedTranscriptUrl} target="_blank" rel="noreferrer"><FileText size={16} />Combined transcript</a>}
          {combinedResultUrl && <a className="icon-link" href={combinedResultUrl} target="_blank" rel="noreferrer"><FileText size={16} />Combined result</a>}
          {reportUrl && <a className="icon-link" href={reportUrl} target="_blank" rel="noreferrer"><FileText size={16} />Final report</a>}
          {(zipFileUrl || zipGoogleDriveUrl) && <span className="icon-link"><FileArchive size={16} />Final report ZIP saved</span>}
        </div>
        {zipUploadError && <p className="inline-status">Drive ZIP upload status: {zipUploadError}</p>}
        {combinedTranscript && (
          <div className="combined-transcript">
            <span>Concatenated transcript</span>
            <p>{combinedTranscript}</p>
          </div>
        )}
      </section>

      <section className="report-section">
        <h2>Question Audio and Transcripts</h2>
        <div className="response-list">
          {responseList.map((response) => (
            <article className="response-card" key={response.questionId}>
              <header>
                <strong>{response.question}</strong>
                <span>{displayClassification(response.result?.classification)}</span>
              </header>
              <div className="transcript-columns">
                <div>
                  <span>Raw transcript</span>
                  <p>{response.transcripts?.raw || 'No transcript captured.'}</p>
                </div>
                <div>
                  <span>Normalized transcript</span>
                  <p>{response.transcripts?.normalized || 'No normalized transcript available.'}</p>
                </div>
              </div>
              {response.spectrogram?.data ? (
                <div className="spectrogram-panel">
                  <span>Spectrogram</span>
                  <img src={spectrogramSrc(response.spectrogram)} alt={`${response.questionId} spectrogram`} />
                </div>
              ) : response.spectrogramError ? (
                <p className="inline-status">Spectrogram status: {response.spectrogramError}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <footer className="clinical-disclaimer">
        DISCLAIMER: Research prototype only. Not validated for clinical use. Must NOT be used for diagnosis, treatment, or clinical decisions.
      </footer>
    </article>
  );
}
