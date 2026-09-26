import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Sidebar, MobileTopBar } from './components/common/Navbar';
import AuthModal from './components/auth/AuthModal';
import DashboardView from './components/dashboard/DashboardView';
import ChatBox from './components/chat/ChatBox';
import CostEstimatorView from './components/cost/CostEstimatorView';
import ComparisonView from './components/comparison/ComparisonView';
import api from './services/api';
import { Spinner } from './components/common/ui';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [policies, setPolicies] = useState([]);
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
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center">
            <Spinner size={18} className="text-zinc-500" />
          </div>
          <p className="text-sm text-zinc-500">Loading MedShield...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthModal />;

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
    <div className="flex min-h-screen bg-[#f5f5f7]">
      {/* Desktop Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <MobileTopBar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Page content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl w-full mx-auto">
          <div key={activeTab} className="animate-fade-in">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}
