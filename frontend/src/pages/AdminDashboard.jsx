import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Mic, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../api/client';

function displayClassification(value) {
  if (!value) return 'Generated';
  if (value === 'CONTROL') return 'TYPICAL SPEECH PATTERN';
  if (value.includes('LIKE SPEECH PATTERN')) return 'ATYPICAL SPEECH PATTERN';
  return value;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState('');
  const [reportCode, setReportCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadSubmissions() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/users');
      setSubmissions(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load admin submissions.');
    } finally {
      setLoading(false);
    }
  }

  async function generateReport(submissionId) {
    setGeneratingId(submissionId);
    setError('');
    setSuccess('');
    try {
      await api.post('/generate-report', { submissionId });
      setSuccess(`Report generated for submission ${submissionId.slice(-6)}.`);
      await loadSubmissions();
    } catch (requestError) {
      const msg = requestError.response?.data?.message || 'Unable to generate report.';
      setError(msg);
      console.error('Generate report error:', requestError.response?.data || requestError.message);
    } finally {
      setGeneratingId('');
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSubmissions();
  }, []);

  function getReportSummary(report) {
    if (!report) return 'Not generated';
    return displayClassification(report.classification);
  }

  const reportsUnlocked = reportCode === '123456';

  function responseStatus(responses, questionId, label) {
    return `${label} status: ${responses[questionId] ? 'saved' : 'pending'}`;
  }

  function responseSummary(responses) {
    return ['q1', 'q2', 'q3'].map((id, index) => responseStatus(responses, id, `Q${index + 1}`)).join(', ');
  }

  return (
    <main className="page">
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Admin Dashboard</p>
          <h1>Voice Submissions</h1>
          <p>Review saved patient audio, transcripts, per-question results, and structured speech analysis reports.</p>
        </div>
        <div className="header-actions">
          <button className="primary" type="button" onClick={() => navigate('/record')}>
            <Mic size={18} />
            Record Patient
          </button>
          <button className="secondary" type="button" onClick={loadSubmissions}>
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </header>

      <section className="form-panel report-code-panel">
        <label className="field">
          <span>Report code</span>
          <input
            type="password"
            value={reportCode}
            onChange={(event) => setReportCode(event.target.value)}
            placeholder="Enter code to enable report generation"
          />
        </label>
        <p className="inline-status">{reportsUnlocked ? 'Report generation enabled.' : 'Enter the doctor code to show generate buttons.'}</p>
      </section>

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      {loading ? (
        <p className="inline-status">Loading submissions...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Stored Responses</th>
                <th>Status</th>
                <th>Report</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => {
                const responses = submission.responses || {};
                const responseCount = Object.keys(responses).length;
                return (
                  <tr key={submission._id}>
                    <td>
                      <strong>{submission.user?.name || submission.userId}</strong>
                      <span>{submission.user?.contact || submission.sessionId}</span>
                    </td>
                    <td>{responseSummary(responses)}</td>
                    <td>{submission.status}</td>
                    <td>{getReportSummary(submission.report)}</td>
                    <td>
                      <div className="table-actions">
                        {reportsUnlocked && submission.report && (
                          <button className="secondary" type="button" onClick={() => navigate(`/report/${submission._id}`)}>
                            <Eye size={16} />
                            View Report
                          </button>
                        )}
                        {reportsUnlocked && (
                          <button
                            type="button"
                            onClick={() => generateReport(submission._id)}
                            disabled={generatingId === submission._id || responseCount === 0}
                          >
                            <Sparkles size={16} />
                            {generatingId === submission._id ? 'Generating...' : submission.report ? 'Regenerate' : 'Generate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {submissions.length === 0 && <p className="inline-status">No voice responses have been saved yet.</p>}
        </div>
      )}
    </main>
  );
}
