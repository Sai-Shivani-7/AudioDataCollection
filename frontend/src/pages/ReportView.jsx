import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api/client';
import ReportCard from '../components/ReportCard';

export default function ReportView() {
  const { id } = useParams();
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadReport() {
      setLoading(true);
      setError('');
      try {
        const response = await api.get(`/get-report/${id}`);
        setReportData(response.data);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load report.');
      } finally {
        setLoading(false);
      }
    }

    loadReport();
  }, [id]);

  return (
    <main className="page">
      <Link className="back-link" to="/admin">
        <ArrowLeft size={18} />
        Back to dashboard
      </Link>
      {loading && <p className="inline-status">Loading report...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <ReportCard
          report={reportData?.report}
          user={reportData?.user}
          responses={reportData?.responses}
          combinedTranscript={reportData?.combinedTranscript}
          combinedTranscriptUrl={reportData?.combinedTranscriptUrl}
          combinedResult={reportData?.combinedResult}
          combinedResultUrl={reportData?.combinedResultUrl}
          reportUrl={reportData?.reportUrl}
          zipFileUrl={reportData?.zipFileUrl}
          zipGoogleDriveUrl={reportData?.zipGoogleDriveUrl}
          zipUploadError={reportData?.zipUploadError}
        />
      )}
    </main>
  );
}
