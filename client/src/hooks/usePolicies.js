/**
 * hooks/usePolicies.js
 * Custom hook — fetch, refresh, and delete policies for the current user.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export function usePolicies() {
  const [policies, setPolicies]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const fetchPolicies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/policies');
      setPolicies(res.data.policies || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch policies');
    } finally {
      setLoading(false);
    }
  }, []);

  const deletePolicy = useCallback(async (policyId) => {
    if (!window.confirm('Delete this policy? This will remove its text chunks and vector embeddings.')) return false;
    try {
      await api.delete(`/policies/${policyId}`);
      setPolicies(prev => prev.filter(p => p._id !== policyId));
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete policy');
      return false;
    }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  return { policies, loading, error, fetchPolicies, deletePolicy };
}
