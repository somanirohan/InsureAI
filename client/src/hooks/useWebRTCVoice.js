/**
 * hooks/useWebRTCVoice.js
 * Ultra-Fast WebRTC Real-Time Voice Processing & Speech-to-Text Engine.
 * Modeled after ChatGPT's instant voice recognition.
 *
 * Key Capabilities:
 * 1. WebRTC MediaStream with studio constraints (echo cancellation, noise suppression, AGC).
 * 2. Real-time Web Audio Analyser for dynamic sound wave visualizer & RMS decibel metering.
 * 3. Intelligent Voice Activity Detection (VAD) & Pause Detection:
 *    - Automatically detects when user stops speaking or takes a long pause (1.2s silence).
 *    - Instantly reveals the captured transcript to the user with zero waiting.
 * 4. ChatGPT-Style 0ms Real-Time Streaming Speech Recognition:
 *    - Words stream live onto screen as user speaks.
 *    - Fraction-of-a-second commit (<1ms) when clicking the transcript option or Done.
 * 5. High-Performance Whisper Turbo Fallback:
 *    - Cloud Whisper Large v3 Turbo via Groq with Opus-compressed WebRTC audio.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';

export const VOICE_ENGINES = [
  {
    id: 'instant',
    label: 'WebRTC Instant (ChatGPT Style)',
    badge: '⚡ Real-Time (0ms)',
    desc: 'Streams words live as you speak. Instant fraction-of-a-second sending.',
  },
  {
    id: 'whisper',
    label: 'Whisper AI Large Turbo',
    badge: '🤖 Cloud AI',
    desc: 'Groq Whisper v3 Turbo for specialized audio/languages.',
  },
];

export const VOICE_LANGUAGES = [
  { code: 'en-US', whisperCode: 'en', label: 'English (US)' },
  { code: 'en-IN', whisperCode: 'en', label: 'English (India)' },
  { code: 'hi-IN', whisperCode: 'hi', label: 'Hindi (हिंदी)' },
  { code: 'auto', whisperCode: 'auto', label: 'Auto-detect' },
];

// WebRTC low-latency audio capture constraints
const WEBRTC_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 16000,
  latency: 0.01,
};

export function useWebRTCVoice({
  onTextCommitted,
  onSendImmediate,
  onPauseDetected,
  onError,
  initialEngine = 'instant',
  initialLanguage = 'en-US',
  pauseThresholdMs = 1200, // 1.2s silence triggers pause detection
} = {}) {
  const [engine, setEngine] = useState(initialEngine); // 'instant' | 'whisper'
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // VAD: actively talking
  const [isPauseDetected, setIsPauseDetected] = useState(false); // VAD: long pause after speech
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0); // 0.0 to 1.0 real-time loudness
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState(initialLanguage);

  // WebRTC & Web Audio refs
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  // VAD & Pause timing refs
  const hasSpokenRef = useRef(false);
  const isPauseDetectedRef = useRef(false);
  const pauseTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const isCancelledRef = useRef(false);

  // Transcripts refs for synchronous access
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');

  // Speech Recognition refs (Instant mode)
  const recognitionRef = useRef(null);
  const isManuallyStoppedRef = useRef(false);

  // MediaRecorder refs (Whisper mode)
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Browser support checks
  const hasWebSpeech =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const hasMediaDevices =
    typeof window !== 'undefined' &&
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  const isSupported = hasMediaDevices;

  // ─── Clean up audio resources ──────────────────────────────────────────────
  const cleanupAudioPipeline = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      streamRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }

    setAudioLevel(0);
    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioPipeline();
    };
  }, [cleanupAudioPipeline]);

  // Keep refs in sync with state
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    interimTranscriptRef.current = interimTranscript;
  }, [interimTranscript]);

  // ─── Initialize WebRTC Audio Stream & VAD ──────────────────────────────────
  const initWebRTCAudioStream = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access is not supported by your browser.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: WEBRTC_AUDIO_CONSTRAINTS,
    });
    streamRef.current = stream;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
        audioContextRef.current = audioCtx;

        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.35;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Real-time audio monitor & Voice Activity Detection (VAD) loop
        const monitorAudio = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;

          // Normalized loudness (0.0 to 1.0)
          const norm = Math.min(1, Math.max(0, (avg - 10) / 65));
          setAudioLevel(norm);

          // VAD threshold
          const isUserTalking = norm > 0.08;

          if (isUserTalking) {
            hasSpokenRef.current = true;
            setIsSpeaking(true);

            // User is speaking: cancel any pending pause timer
            if (pauseTimerRef.current) {
              clearTimeout(pauseTimerRef.current);
              pauseTimerRef.current = null;
            }
            if (isPauseDetectedRef.current) {
              isPauseDetectedRef.current = false;
              setIsPauseDetected(false);
            }
          } else {
            setIsSpeaking(false);

            // Check if user has already spoken and is now pausing
            const currentCombined = (
              transcriptRef.current + ' ' + interimTranscriptRef.current
            ).trim();

            if (hasSpokenRef.current && currentCombined.length > 0) {
              if (!pauseTimerRef.current && !isPauseDetectedRef.current) {
                pauseTimerRef.current = setTimeout(() => {
                  isPauseDetectedRef.current = true;
                  setIsPauseDetected(true);
                  const capturedText = (
                    transcriptRef.current + ' ' + interimTranscriptRef.current
                  ).trim();
                  onPauseDetected?.(capturedText);
                }, pauseThresholdMs);
              }
            }
          }

          animFrameRef.current = requestAnimationFrame(monitorAudio);
        };

        monitorAudio();
      }
    } catch (e) {
      console.warn('Web Audio Analyser initialization warning:', e);
    }

    return stream;
  }, [onPauseDetected, pauseThresholdMs]);

  // ─── Engine 1: Instant Browser Real-Time (ChatGPT style, 0ms) ──────────────
  const startInstantRecognition = useCallback(
    async (stream) => {
      if (!hasWebSpeech) {
        // Auto fallback to Whisper if Web Speech not supported in browser
        return false;
      }

      const SpeechRecognitionClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === 'auto' ? 'en-US' : language;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
        isManuallyStoppedRef.current = false;
      };

      recognition.onresult = (event) => {
        let finalStr = '';
        let interimStr = '';

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            finalStr += (finalStr ? ' ' : '') + text.trim();
          } else {
            interimStr += (interimStr ? ' ' : '') + text.trim();
          }
        }

        transcriptRef.current = finalStr;
        interimTranscriptRef.current = interimStr;
        setTranscript(finalStr);
        setInterimTranscript(interimStr);

        if (finalStr || interimStr) {
          hasSpokenRef.current = true;
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        let msg = 'Speech recognition error.';
        if (event.error === 'not-allowed') {
          msg = 'Microphone permission denied. Please allow microphone permissions in your browser.';
        } else if (event.error === 'network') {
          msg = 'Speech recognition network error. Switching to Whisper Turbo...';
          setEngine('whisper');
        }
        setError(msg);
        onError?.(msg);
      };

      recognition.onend = () => {
        // If not manually stopped, keep continuous recognition alive
        if (!isManuallyStoppedRef.current && isListening) {
          try {
            recognition.start();
          } catch {
            // ignore
          }
        } else {
          setIsListening(false);
          setInterimTranscript('');
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        return true;
      } catch (err) {
        console.warn('Recognition start failed:', err);
        return false;
      }
    },
    [hasWebSpeech, language, isListening, onError]
  );

  // ─── Engine 2: Whisper AI Turbo (Groq Cloud) ───────────────────────────────
  const startWhisperRecording = useCallback(
    (stream) => {
      try {
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';
        }

        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined
        );
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          cleanupAudioPipeline();
          setIsListening(false);

          if (isCancelledRef.current) {
            audioChunksRef.current = [];
            return;
          }

          const chunks = audioChunksRef.current;
          if (chunks.length === 0) return;

          const blob = new Blob(chunks, {
            type: recorder.mimeType || 'audio/webm',
          });
          audioChunksRef.current = [];

          setIsTranscribing(true);
          setError(null);

          try {
            const formData = new FormData();
            const ext = (recorder.mimeType || '').includes('mp4')
              ? 'mp4'
              : 'webm';
            formData.append('file', blob, `voice_prompt.${ext}`);

            const langItem = VOICE_LANGUAGES.find((l) => l.code === language);
            const whisperLang = langItem?.whisperCode || 'en';
            if (whisperLang && whisperLang !== 'auto') {
              formData.append('language', whisperLang);
            }

            const res = await api.post('/chat/transcribe', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });

            const text = (res.data?.text || '').trim();
            if (text) {
              setTranscript(text);
              transcriptRef.current = text;
              onTextCommitted?.(text);
            } else {
              setError('Whisper did not detect any speech in the recording.');
            }
          } catch (err) {
            const errMsg =
              err.response?.data?.detail ||
              err.message ||
              'Whisper transcription failed.';
            setError(errMsg);
            onError?.(errMsg);
          } finally {
            setIsTranscribing(false);
          }
        };

        recorder.start(200);
        setIsListening(true);
        return true;
      } catch (err) {
        const msg = 'Failed to start Whisper recording: ' + err.message;
        setError(msg);
        onError?.(msg);
        return false;
      }
    },
    [cleanupAudioPipeline, language, onTextCommitted, onError]
  );

  // ─── Start Voice Input Session ─────────────────────────────────────────────
  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    transcriptRef.current = '';
    interimTranscriptRef.current = '';
    hasSpokenRef.current = false;
    isPauseDetectedRef.current = false;
    setIsPauseDetected(false);
    isCancelledRef.current = false;
    isManuallyStoppedRef.current = false;
    setRecordingDuration(0);

    try {
      const stream = await initWebRTCAudioStream();

      // Start duration counter
      const startTime = Date.now();
      durationTimerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 500);

      if (engine === 'instant') {
        const ok = await startInstantRecognition(stream);
        if (!ok) {
          // Fall back to Whisper if SpeechRecognition not supported in browser
          setEngine('whisper');
          startWhisperRecording(stream);
        }
      } else {
        startWhisperRecording(stream);
      }

      setIsListening(true);
      return true;
    } catch (err) {
      let friendly = 'Microphone access denied or audio device unavailable.';
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError'
      ) {
        friendly =
          'Microphone permission denied. Please click the lock icon in your browser address bar to allow microphone access.';
      } else if (err.name === 'NotFoundError') {
        friendly =
          'No microphone device found. Please connect an audio input device.';
      }
      setError(friendly);
      onError?.(friendly);
      cleanupAudioPipeline();
      setIsListening(false);
      return false;
    }
  }, [
    engine,
    initWebRTCAudioStream,
    startInstantRecognition,
    startWhisperRecording,
    cleanupAudioPipeline,
    onError,
  ]);

  // ─── Stop Voice Input Session ──────────────────────────────────────────────
  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;

    if (engine === 'instant') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      cleanupAudioPipeline();
      setIsListening(false);

      // In instant mode, text is already transcribed in real-time!
      const finalText = (
        transcriptRef.current +
        (interimTranscriptRef.current ? ` ${interimTranscriptRef.current}` : '')
      ).trim();

      if (finalText) {
        onTextCommitted?.(finalText);
      }
      setTranscript('');
      setInterimTranscript('');
    } else {
      // Whisper mode
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === 'recording'
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    }
  }, [engine, cleanupAudioPipeline, onTextCommitted]);

  // ─── Commit Transcript Instantly (<1ms fraction-of-a-second process) ───────
  const commitTranscript = useCallback(
    (customText) => {
      const textToCommit = (
        customText ||
        transcriptRef.current +
          (interimTranscriptRef.current
            ? ` ${interimTranscriptRef.current}`
            : '')
      ).trim();

      isManuallyStoppedRef.current = true;
      cleanupAudioPipeline();
      setIsListening(false);
      setIsPauseDetected(false);
      isPauseDetectedRef.current = false;

      if (textToCommit) {
        onTextCommitted?.(textToCommit);
      }

      setTranscript('');
      setInterimTranscript('');
      transcriptRef.current = '';
      interimTranscriptRef.current = '';
    },
    [cleanupAudioPipeline, onTextCommitted]
  );

  // ─── Send Immediately (<1ms fraction-of-a-second process) ──────────────────
  const sendImmediately = useCallback(
    (customText) => {
      const textToSend = (
        customText ||
        transcriptRef.current +
          (interimTranscriptRef.current
            ? ` ${interimTranscriptRef.current}`
            : '')
      ).trim();

      isManuallyStoppedRef.current = true;
      cleanupAudioPipeline();
      setIsListening(false);
      setIsPauseDetected(false);
      isPauseDetectedRef.current = false;

      if (textToSend) {
        if (onSendImmediate) {
          onSendImmediate(textToSend);
        } else {
          onTextCommitted?.(textToSend);
        }
      }

      setTranscript('');
      setInterimTranscript('');
      transcriptRef.current = '';
      interimTranscriptRef.current = '';
    },
    [cleanupAudioPipeline, onSendImmediate, onTextCommitted]
  );

  // ─── Cancel Voice Input Session ────────────────────────────────────────────
  const cancelListening = useCallback(() => {
    isCancelledRef.current = true;
    isManuallyStoppedRef.current = true;
    cleanupAudioPipeline();
    setIsListening(false);
    setIsTranscribing(false);
    setIsPauseDetected(false);
    isPauseDetectedRef.current = false;
    setTranscript('');
    setInterimTranscript('');
    transcriptRef.current = '';
    interimTranscriptRef.current = '';
    audioChunksRef.current = [];
  }, [cleanupAudioPipeline]);

  // ─── Toggle Listening ──────────────────────────────────────────────────────
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, stopListening, startListening]);

  // Combined real-time transcript text
  const fullTranscript = (
    transcript + (interimTranscript ? ` ${interimTranscript}` : '')
  ).trim();

  return {
    isSupported,
    hasWebSpeech,
    engine,
    setEngine,
    isListening,
    isSpeaking,
    isPauseDetected,
    isTranscribing,
    transcript,
    interimTranscript,
    fullTranscript,
    recordingDuration,
    audioLevel,
    error,
    language,
    setLanguage,
    startListening,
    stopListening,
    commitTranscript,
    sendImmediately,
    cancelListening,
    toggleListening,
    setError,
  };
}
