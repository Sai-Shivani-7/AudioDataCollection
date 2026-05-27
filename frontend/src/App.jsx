import { useState } from 'react';
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { LogOut, Mic, ShieldCheck } from 'lucide-react';
import AdminDashboard from './pages/AdminDashboard';
import AuthPage from './pages/AuthPage';
import ReportView from './pages/ReportView';
import UserDashboard from './pages/UserDashboard';
import './styles.css';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const stored = localStorage.getItem('sdc-auth-user');
    return stored ? JSON.parse(stored) : null;
  });

  function logout() {
    localStorage.removeItem('sdc-auth-token');
    localStorage.removeItem('sdc-auth-user');
    localStorage.removeItem('sdc-submission-id');
    setCurrentUser(null);
  }

  if (!currentUser) return <AuthPage onAuth={setCurrentUser} />;

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <div className="brand">
          <span>SA</span>
          <strong>Speech Analysis</strong>
        </div>
        <div className="nav-links">
          <NavLink to="/admin">
            <ShieldCheck size={18} />
            Dashboard
          </NavLink>
          <NavLink to="/record">
            <Mic size={18} />
            Record Patient
          </NavLink>
          <button className="secondary nav-user" type="button" onClick={logout}>
            <LogOut size={18} />
            {currentUser.name}
          </button>
        </div>
      </nav>

      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/record" element={<UserDashboard currentUser={currentUser} />} />
        <Route path="/report/:id" element={<ReportView />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  );
}
