/**
 * hooks/useWebSocket.js
 * Custom hook — manages a persistent WebSocket connection to /ws/chat.
 * Returns { sendMessage, connected, available }.
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { WS_CHAT_URL, TOKEN_KEY } from '../constants';

export function useWebSocket() {
  const wsRef                 = useRef(null);
  const [connected, setConnected]   = useState(false);
  const [available, setAvailable]   = useState(false);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_CHAT_URL);
      ws.onopen  = () => { setConnected(true);  setAvailable(true); };
      ws.onclose = () => { setConnected(false); };
      ws.onerror = () => { setConnected(false); setAvailable(false); };
      wsRef.current = ws;
    } catch {
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  /**
   * Send a chat message over WebSocket.
   * @param {Object} payload  { question, policy_id, conversation_id, plain_language_mode }
   * @param {Object} callbacks  { onStatus, onChunk, onComplete, onError }
   */
  const sendMessage = useCallback((payload, callbacks) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      callbacks?.onError?.('WebSocket not connected');
      return false;
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'status':   callbacks?.onStatus?.(data.message);   break;
          case 'chunk':    callbacks?.onChunk?.(data.token);       break;
          case 'complete': callbacks?.onComplete?.(data);          break;
          case 'error':    callbacks?.onError?.(data.message);     break;
        }
      } catch (err) {
        callbacks?.onError?.('Failed to parse server message');
      }
    };

    ws.send(JSON.stringify({
      token: localStorage.getItem(TOKEN_KEY),
      ...payload,
    }));
    return true;
  }, []);

  return { sendMessage, connected, available };
}
