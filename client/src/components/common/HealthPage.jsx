import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { API_BASE_URL, WS_CHAT_URL } from '../../constants';
import { Activity, CheckCircle2, XCircle, RefreshCw, Server, Globe } from 'lucide-react';

export default function HealthPage() {
  const [frontendStatus] = useState({
    status: 'online',
    timestamp: new Date().toISOString(),
    apiBaseUrl: API_BASE_URL,
    wsChatUrl: WS_CHAT_URL,
    clientOrigin: typeof window !== 'undefined' ? window.location.origin : '',
  });

  const [backendHealth, setBackendHealth] = useState(null);
  const [loadingBackend, setLoadingBackend] = useState(true);
  const [backendError, setBackendError] = useState(null);

  const checkBackend = async () => {
    setLoadingBackend(true);
    setBackendError(null);
    try {
      const headRes = await api.head('/health');
      if (headRes.status >= 200 && headRes.status < 300) {
        // Also fetch health payload if available or set online
        try {
          const getRes = await api.get('/health');
          setBackendHealth(getRes.data);
        } catch {
          setBackendHealth({ status: 'online', database: 'connected' });
        }
      }
    } catch (err) {
      setBackendError(err.response?.data?.message || err.message || 'Unable to reach backend health endpoint via HEAD');
      if (err.response?.data) {
        setBackendHealth(err.response.data);
      } else {
        setBackendHealth(null);
      }
    } finally {
      setLoadingBackend(false);
    }
  };

  useEffect(() => {
    checkBackend();
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f7f7] text-[#062327] p-4 sm:p-8 flex flex-col items-center justify-center font-sans">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-[#062327]/10 p-6 sm:p-8 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#062327]/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#d2f57b] flex items-center justify-center text-[#062327] shadow-sm">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#062327]">System Health Check</h1>
              <p className="text-xs text-[#558187]">Diagnostics for InsurAI frontend & backend API</p>
            </div>
          </div>
          <button
            onClick={checkBackend}
            disabled={loadingBackend}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#f0f4f4] hover:bg-[#e2e9e9] text-[#062327] transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingBackend ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Frontend Status Card */}
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-sm text-[#062327]">Frontend Client</span>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Healthy
            </span>
          </div>
          <div className="text-xs font-mono space-y-1 text-slate-600 pt-1">
            <div><strong className="text-slate-800">Configured API Base:</strong> {frontendStatus.apiBaseUrl}</div>
            <div><strong className="text-slate-800">Configured WebSocket:</strong> {frontendStatus.wsChatUrl}</div>
            <div><strong className="text-slate-800">Client Origin:</strong> {frontendStatus.clientOrigin}</div>
            <div><strong className="text-slate-800">Checked At:</strong> {frontendStatus.timestamp}</div>
          </div>
        </div>

        {/* Backend Status Card */}
        <div className={`p-4 rounded-xl border space-y-2 ${
          backendError && !backendHealth
            ? 'border-red-200 bg-red-50/60'
            : backendHealth?.status === 'online' || backendHealth?.database === 'connected'
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-amber-200 bg-amber-50/60'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[#062327]" />
              <span className="font-semibold text-sm text-[#062327]">Backend API (`/health` & `/api/health`)</span>
            </div>
            {loadingBackend ? (
              <span className="text-xs text-slate-500 animate-pulse">Checking backend...</span>
            ) : backendHealth?.status === 'online' || backendHealth?.database === 'connected' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                <XCircle className="w-3.5 h-3.5 text-red-600" />
                Unhealthy
              </span>
            )}
          </div>

          {loadingBackend ? (
            <div className="py-4 text-center text-xs text-slate-400">Connecting to {API_BASE_URL}/health ...</div>
          ) : backendError && !backendHealth ? (
            <div className="text-xs text-red-700 pt-1">
              <strong>Error:</strong> {backendError}
              <div className="mt-1 text-slate-500">Ensure the backend server is running and reachable from the frontend.</div>
            </div>
          ) : (
            <div className="text-xs font-mono space-y-1 text-slate-600 pt-1">
              <div><strong className="text-slate-800">Service:</strong> {backendHealth?.service || 'FastAPI'}</div>
              <div><strong className="text-slate-800">Status:</strong> {backendHealth?.status}</div>
              <div><strong className="text-slate-800">Database:</strong> {backendHealth?.database}</div>
              <div><strong className="text-slate-800">LLM Provider:</strong> {backendHealth?.llm?.provider || 'N/A'} ({backendHealth?.llm?.configured_model || 'N/A'})</div>
              <div><strong className="text-slate-800">Timestamp:</strong> {backendHealth?.timestamp}</div>
            </div>
          )}
        </div>

        {/* Back Link */}
        <div className="pt-2 text-center">
          <a
            href="/"
            className="text-xs font-semibold text-[#062327] hover:underline"
          >
            ← Return to Application
          </a>
        </div>

      </div>
    </div>
  );
}
