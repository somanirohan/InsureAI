import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Sidebar, MobileTopBar } from './components/common/Navbar';
import LandingPage from './components/landing/LandingPage';
import DashboardView from './components/dashboard/DashboardView';
import ChatBox from './components/chat/ChatBox';
import CostEstimatorView from './components/cost/CostEstimatorView';
import ComparisonView from './components/comparison/ComparisonView';
import ClaimsWorkflowView from './claims/ClaimsWorkflowView';
import { LiquidBlob } from './components/common/LiquidBlob';
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f4f7f7' }}>
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="relative w-20 h-20">
            <div className="animate-blob-float w-20 h-20" style={{
              borderRadius: '60% 40% 55% 45% / 50% 60% 40% 50%',
              background: 'radial-gradient(ellipse at 40% 35%, rgba(210,245,123,0.55) 0%, rgba(200,235,200,0.3) 100%)',
              filter: 'blur(2px)',
            }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-11 h-11 rounded-2xl bg-[#d2f57b] border-2 border-[#062327] flex items-center justify-center text-[#062327] font-black text-xl shadow-lg">
                <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-8 h-8 object-contain rounded-xl" />
              </div>
            </div>
          </div>
          <p className="text-sm font-semibold tracking-tight text-[#558187]">Loading InsurAI…</p>
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
            onNavigateToClaims={() => setActiveTab('claims')}
          />
        );
      case 'chat':
        return <ChatBox initialPolicy={chatTargetPolicy} policies={policies} />;
      case 'claims':
        return <ClaimsWorkflowView policies={policies} />;
      case 'cost':
        return <CostEstimatorView policies={policies} />;
      case 'compare':
        return <ComparisonView policies={policies} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen relative text-[#062327]" style={{ background: '#f4f7f7' }}>
      {/* Subtle ambient background — light watermark clover shapes */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 5% 0%, rgba(210,245,123,0.18) 0%, transparent 45%),
            radial-gradient(ellipse at 95% 5%, rgba(210,245,123,0.12) 0%, transparent 40%),
            radial-gradient(ellipse at 50% 100%, rgba(6,35,39,0.04) 0%, transparent 60%)
          `,
        }}
      />

      {/* Subtle organic clover watermark in background */}
      <div className="fixed -top-16 -right-16 pointer-events-none opacity-30 select-none" aria-hidden>
        <svg width="420" height="420" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="65" r="46" fill="rgba(6,35,39,0.03)" />
          <circle cx="135" cy="100" r="46" fill="rgba(6,35,39,0.03)" />
          <circle cx="100" cy="135" r="46" fill="rgba(6,35,39,0.03)" />
          <circle cx="65" cy="100" r="46" fill="rgba(6,35,39,0.03)" />
          <circle cx="100" cy="100" r="38" fill="rgba(6,35,39,0.03)" />
        </svg>
      </div>

      {/* Liquid blob accent (dashboard only) */}
      {activeTab === 'dashboard' && (
        <div
          aria-hidden
          className="fixed pointer-events-none"
          style={{
            right: '-6%',
            bottom: '-12%',
            width: 'clamp(380px, 50vw, 720px)',
            height: 'clamp(380px, 50vw, 720px)',
            zIndex: 0,
            opacity: 0.22,
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
