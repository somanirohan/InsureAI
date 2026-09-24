import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import Navbar from './components/common/Navbar';
import AuthModal from './components/auth/AuthModal';
import DashboardView from './components/dashboard/DashboardView';
import ChatBox from './components/chat/ChatBox';
import CostEstimatorView from './components/cost/CostEstimatorView';
import ComparisonView from './components/comparison/ComparisonView';
import api from './services/api';

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
    if (user) {
      fetchPolicies();
    }
  }, [user]);

  const handlePolicyUploadSuccess = (newPolicy) => {
    fetchPolicies();
  };

  const handleDeletePolicy = async (policyId) => {
    if (window.confirm('Are you sure you want to delete this policy? This will cascade delete its text chunks, ChromaDB vectors, and associated estimates.')) {
      try {
        await api.delete(`/policies/${policyId}`);
        fetchPolicies();
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to delete policy');
      }
    }
  };

  const handleStartChatWithPolicy = (policy) => {
    setChatTargetPolicy(policy);
    setActiveTab('chat');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-2" />
      </div>
    );
  }

  if (!user) {
    return <AuthModal />;
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-['Plus_Jakarta_Sans']">
      {/* Top Navigation */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            policies={policies}
            onPolicyUploadSuccess={handlePolicyUploadSuccess}
            onDeletePolicy={handleDeletePolicy}
            onStartChat={handleStartChatWithPolicy}
            onNavigateToCost={() => setActiveTab('cost')}
            onNavigateToCompare={() => setActiveTab('compare')}
          />
        )}

        {activeTab === 'chat' && (
          <ChatBox
            initialPolicy={chatTargetPolicy}
            policies={policies}
          />
        )}

        {activeTab === 'cost' && (
          <CostEstimatorView
            policies={policies}
          />
        )}

        {activeTab === 'compare' && (
          <ComparisonView
            policies={policies}
          />
        )}
      </main>
    </div>
  );
}
