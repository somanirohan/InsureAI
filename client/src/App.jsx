import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Sidebar, MobileTopBar } from './components/common/Navbar';
import LandingPage from './components/landing/LandingPage';
import DashboardView from './components/dashboard/DashboardView';
import ChatBox from './components/chat/ChatBox';
import CostEstimatorView from './components/cost/CostEstimatorView';
import ComparisonView from './components/comparison/ComparisonView';
import { LiquidBlob, Starfield } from './components/common/LiquidBlob';
import api from './services/api';
import { Spinner } from './components/common/ui';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab]           = useState('dashboard');
  const [policies, setPolicies]             = useState([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [chatTargetPolicy, setChatTargetPolicy] = useState(null);

  const fetchPolicies = async () => {
    try {
      setLoadingPolicies(true);
      const res = await api.get('/policies');
      setPolicies(res.data.policies || []);
    } catch (err) {
      console.error('Error fetching policies:', err);
    } finally {
      setLoadingPolicies(false);
    }
  };

  useEffect(() => {
    if (user) fetchPolicies();
  }, [user]);

  const handlePolicyUploadSuccess = () => fetchPolicies();

  const handleDeletePolicy = async (policyId) => {
    if (!window.confirm('Delete this policy? This will remove its text chunks and vector embeddings.')) return;
    try {
      await api.delete(`/policies/${policyId}`);
      fetchPolicies();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete policy');
    }
  };

  const handleStartChatWithPolicy = (policy) => {
    setChatTargetPolicy(policy);
    setActiveTab('chat');
  };

  // ── Auth loading ───────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#07070d' }}>
        <Starfield count={60} />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="relative w-20 h-20">
            <div className="animate-blob-float w-20 h-20" style={{
              borderRadius: '60% 40% 55% 45% / 50% 60% 40% 50%',
              background: 'radial-gradient(ellipse at 40% 35%, rgba(240,200,100,0.25) 0%, rgba(60,40,160,0.3) 100%)',
              filter: 'blur(2px)',
            }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <img src="/favicon_io/apple-touch-icon.png" alt="MedShield Logo" className="w-10 h-10 object-contain rounded-xl animate-pulse shadow-lg" />
            </div>
          </div>
          <p className="text-sm font-medium tracking-tight" style={{ color: 'rgba(255,255,255,0.45)' }}>Loading MedShield...</p>
        </div>
      </div>
    );
  }

  // ── Not logged in → Landing Page ───────────────────────
  if (!user) return <LandingPage />;

  // ── Render view ────────────────────────────────────────
  const renderView = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardView
            policies={policies}
            loadingPolicies={loadingPolicies}
            onPolicyUploadSuccess={handlePolicyUploadSuccess}
            onDeletePolicy={handleDeletePolicy}
            onStartChat={handleStartChatWithPolicy}
            onNavigateToCost={() => setActiveTab('cost')}
            onNavigateToCompare={() => setActiveTab('compare')}
          />
        );
      case 'chat':
        return <ChatBox initialPolicy={chatTargetPolicy} policies={policies} />;
      case 'cost':
        return <CostEstimatorView policies={policies} />;
      case 'compare':
        return <ComparisonView policies={policies} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen" style={{ background: '#07070d' }}>
      <Starfield count={70} />

      {/* Ambient nebula */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 15% 50%, rgba(60,40,160,0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 85% 20%, rgba(80,50,15,0.05) 0%, transparent 45%),
            radial-gradient(ellipse at 50% 100%, rgba(20,15,50,0.12) 0%, transparent 60%)
          `,
        }}
      />

      {/* Liquid blob hero (dashboard only) */}
      {activeTab === 'dashboard' && (
        <div
          aria-hidden
          className="fixed pointer-events-none"
          style={{
            right: '-5%',
            bottom: '-15%',
            width: 'clamp(360px, 55vw, 760px)',
            height: 'clamp(360px, 55vw, 760px)',
            zIndex: 0,
            opacity: 0.32,
          }}
        >
          <LiquidBlob className="w-full h-full" />
        </div>
      )}

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <MobileTopBar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl w-full mx-auto">
          <div key={activeTab} className="animate-fade-in">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}
