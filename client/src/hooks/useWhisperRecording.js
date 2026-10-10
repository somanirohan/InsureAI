/**
 * hooks/useWhisperRecording.js
 * High-performance audio recording hook for Whisper AI voice assistance.
 *
 * Uses browser MediaRecorder to capture crisp microphone audio,
 * measures real-time audio volume via Web Audio API for interactive waveforms,
 * and sends audio to the FastAPI backend Whisper AI endpoint (/api/chat/transcribe).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';

export const WHISPER_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi (हिंदी)' },
  { code: 'auto', label: 'Auto-detect' },
];

export function useWhisperRecording({
  onTranscribeComplete,
  onError,
  initialLanguage = 'en',
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0); // 0.0 to 1.0
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState(initialLanguage);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const isCancelledRef = useRef(false);

  // Check browser support for MediaRecorder and getUserMedia
  const isSupported =
    typeof window !== 'undefined' &&
    Boolean(
      navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia &&
        window.MediaRecorder
    );

  // Stop media tracks and audio context
  const cleanupMedia = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupMedia();
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [cleanupMedia]);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      const msg = 'Microphone recording is not supported in this browser. Please use Chrome, Edge, or Safari.';
      setError(msg);
      onError?.(msg);
      return false;
    }

    setError(null);
    isCancelledRef.current = false;
    audioChunksRef.current = [];
    setRecordingDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Real-time audio analyser for reactive waveform animation
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const monitorVolume = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            // Normalize roughly 0 to 1 with smooth curve
            const norm = Math.min(1, Math.max(0, (avg - 10) / 70));
            setAudioLevel(norm);
            animFrameRef.current = requestAnimationFrame(monitorVolume);
          };
          monitorVolume();
        }
      } catch {
        // Fallback gracefully if Web Audio analyser is unavailable
      }

      // Pick best supported MIME type
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      }

      const recorderOptions = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        cleanupMedia();
        setIsRecording(false);

        if (isCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }

        const chunks = audioChunksRef.current;
        if (chunks.length === 0) {
          setError('No audio recorded. Please try again.');
          return;
        }

        const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];

        // Send to backend Whisper API
        setIsTranscribing(true);
        setError(null);

        try {
          const formData = new FormData();
          const ext = (mediaRecorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
          formData.append('file', audioBlob, `voice_prompt.${ext}`);
          if (language && language !== 'auto') {
            formData.append('language', language);
          }

          const response = await api.post('/chat/transcribe', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });

          const transcribedText = response.data?.text || '';
          if (!transcribedText.trim()) {
            setError('Whisper did not detect any speech in the recording.');
          } else {
            onTranscribeComplete?.(transcribedText.trim());
          }
        } catch (err) {
          const errMsg =
            err.response?.data?.detail ||
            err.message ||
            'Failed to transcribe audio with Whisper AI.';
          setError(errMsg);
          onError?.(errMsg);
        } finally {
          setIsTranscribing(false);
        }
      };

      // Start recording with 200ms timeslices for smooth chunking
      mediaRecorder.start(200);
      setIsRecording(true);

      // Start duration counter
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 500);

      return true;
    } catch (err) {
      let friendly = 'Microphone access denied or audio device unavailable.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        friendly = 'Microphone permission denied. Please allow microphone access in your browser address bar.';
      } else if (err.name === 'NotFoundError') {
        friendly = 'No microphone device found. Please connect an audio input device.';
      }
      setError(friendly);
      onError?.(friendly);
      cleanupMedia();
      setIsRecording(false);
      return false;
    }
  }, [isSupported, cleanupMedia, language, onTranscribeComplete, onError]);

  const stopRecording = useCallback(() => {
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
  }, []);

  const cancelRecording = useCallback(() => {
    isCancelledRef.current = true;
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
    cleanupMedia();
    setIsRecording(false);
    setIsTranscribing(false);
    audioChunksRef.current = [];
  }, [cleanupMedia]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, stopRecording, startRecording]);

  return {
    isSupported,
    isRecording,
    isTranscribing,
    recordingDuration,
    audioLevel,
    error,
    language,
    setLanguage,
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
    setError,
  };
}
