/**
 * hooks/useSpeechRecognition.js
 * Clean, production-ready hook wrapping the browser's native Web Speech API
 * (SpeechRecognition / webkitSpeechRecognition).
 *
 * Provides real-time interim results, full transcripts, language switching,
 * and robust error handling (mic permission denied, no speech, unsupported browser).
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// Common languages for medical/health insurance queries
export const SUPPORTED_VOICE_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'hi-IN', label: 'Hindi (भारत)' },
];

export function useSpeechRecognition({
  onResult,
  onError,
  initialLanguage = 'en-US',
} = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState(initialLanguage);

  const recognitionRef = useRef(null);
  const isManuallyStoppedRef = useRef(false);

  // Check browser compatibility
  const isSupported = typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore cleanup abort error
        }
      }
    };
  }, []);

  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Already stopped or not running
      }
    }
    setIsListening(false);
  }, []);

  const abortListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }
    setInterimTranscript('');
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      const msg = 'Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.';
      setError(msg);
      onError?.(msg);
      return false;
    }

    // Clear previous errors and reset manual stop flag
    setError(null);
    isManuallyStoppedRef.current = false;
    setInterimTranscript('');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Destroy existing instance if any
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event) => {
        let currentInterim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            finalChunk += text;
          } else {
            currentInterim += text;
          }
        }

        if (finalChunk) {
          setTranscript((prev) => {
            const updated = prev ? `${prev} ${finalChunk.trim()}` : finalChunk.trim();
            onResult?.({
              final: updated,
              interim: currentInterim,
              chunk: finalChunk.trim(),
            });
            return updated;
          });
        } else if (currentInterim) {
          onResult?.({
            final: transcript,
            interim: currentInterim,
            chunk: '',
          });
        }

        setInterimTranscript(currentInterim);
      };

      recognition.onerror = (event) => {
        let friendlyMsg = 'An error occurred during voice recognition.';

        switch (event.error) {
          case 'not-allowed':
          case 'permission-denied':
            friendlyMsg = 'Microphone access denied. Please click the lock/settings icon in your browser address bar to allow microphone permissions.';
            break;
          case 'no-speech':
            // Frequent in quiet rooms; don't disrupt if user just paused
            friendlyMsg = 'No speech detected. Please speak clearly into your microphone.';
            break;
          case 'audio-capture':
            friendlyMsg = 'No microphone detected. Please plug in or enable an audio input device.';
            break;
          case 'network':
            friendlyMsg = 'Network error during speech recognition service connection.';
            break;
          case 'aborted':
            // Manual abort; no need to show scary error
            return;
          default:
            friendlyMsg = `Voice recognition error: ${event.error}`;
        }

        setError(friendlyMsg);
        onError?.(friendlyMsg);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
      recognition.start();
      return true;
    } catch (err) {
      const msg = err?.message || 'Failed to initialize voice recognition.';
      setError(msg);
      onError?.(msg);
      setIsListening(false);
      return false;
    }
  }, [isSupported, language, onResult, onError, transcript]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, stopListening, startListening]);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    language,
    setLanguage,
    startListening,
    stopListening,
    abortListening,
    resetTranscript,
    toggleListening,
    setError,
  };
}
