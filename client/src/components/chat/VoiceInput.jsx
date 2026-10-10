/**
 * components/chat/VoiceInput.jsx
 * Clean, minimal Real-Time Voice Input Component.
 * Powered by WebRTC MediaStream and real-time streaming speech recognition.
 */

import React from 'react';
import {
  Mic,
  MicOff,
  Square,
  X,
  AlertCircle,
  Loader2,
  Send,
  CheckCheck,
} from 'lucide-react';

/**
 * Microphone toggle button placed next to chat input bar.
 */
export function VoiceInputButton({
  isListening,
  isSpeaking,
  isPauseDetected,
  isTranscribing,
  isSupported,
  disabled,
  onClick,
}) {
  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        className="
          h-12 w-12 p-0 rounded-2xl flex-shrink-0 flex items-center justify-center
          bg-[#e9eff0] border border-[#062327]/10 text-[#558187]/50 cursor-not-allowed
        "
        title="Microphone recording is not supported in this browser."
        aria-label="Microphone not supported"
      >
        <MicOff size={18} />
      </button>
    );
  }

  if (isTranscribing) {
    return (
      <button
        type="button"
        disabled
        className="
          h-12 w-12 p-0 rounded-2xl flex-shrink-0 flex items-center justify-center
          bg-[#d2f57b]/30 text-[#062327] border border-[#062327]/15 animate-pulse
        "
        title="Transcribing audio..."
        aria-label="Transcribing audio"
      >
        <Loader2 size={18} className="animate-spin text-[#062327]" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        h-12 w-12 p-0 rounded-2xl flex-shrink-0 flex items-center justify-center
        transition-all duration-200 relative group
        ${
          isListening
            ? 'bg-[#d2f57b] text-[#062327] border border-[#062327]/30 shadow-sm'
            : 'bg-[#e9eff0] hover:bg-[#dfe7e8] text-[#062327] border border-[#062327]/10 hover:border-[#062327]/20 hover:scale-[1.02] active:scale-[0.98]'
        }
      `}
      title={isListening ? 'Stop voice input (Alt+V)' : 'Voice input (Alt+V)'}
      aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
    >
      {isListening ? (
        <Square size={16} className="fill-current text-[#062327]" />
      ) : (
        <Mic size={18} className="text-[#062327] transition-colors" />
      )}
    </button>
  );
}

/**
 * Minimal Voice Banner with dark white background, waveform, duration, transcript, and action buttons.
 */
export function VoiceInputBanner({
  isListening,
  isSpeaking,
  isTranscribing,
  transcript = '',
  interimTranscript = '',
  fullTranscript: passedFullTranscript,
  recordingDuration = 0,
  audioLevel = 0,
  onCommitTranscript,
  onSendImmediately,
  onDone,
  onStopAndTranscribe,
  onCancel,
  error,
  onErrorDismiss,
}) {
  // Unify handlers
  const handleCommit = () => {
    if (onCommitTranscript) onCommitTranscript();
    else if (onDone) onDone();
    else if (onStopAndTranscribe) onStopAndTranscribe();
  };

  const handleSend = () => {
    if (onSendImmediately) onSendImmediately();
    else handleCommit();
  };

  const activeTranscript = (
    passedFullTranscript !== undefined
      ? passedFullTranscript
      : transcript + (interimTranscript ? ` ${interimTranscript}` : '')
  ).trim();

  // Error Banner
  if (error) {
    return (
      <div className="mb-3 px-4 py-3 rounded-2xl bg-[#fceded] border border-[#f0c2c2] flex items-center justify-between text-xs text-[#9c2b2b] animate-slide-up shadow-sm">
        <div className="flex items-center gap-2 pr-2">
          <AlertCircle size={16} className="flex-shrink-0 text-[#9c2b2b]" />
          <span className="font-medium">{error}</span>
        </div>
        <button
          type="button"
          onClick={onErrorDismiss}
          className="p-1 rounded-lg text-[#9c2b2b] hover:bg-[#f5dada] transition-colors flex-shrink-0"
          title="Dismiss error"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Transcribing State
  if (isTranscribing) {
    return (
      <div className="mb-3 p-4 rounded-2xl bg-[#e5ecec] border border-[#062327]/12 shadow-sm animate-slide-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Loader2 size={18} className="animate-spin text-[#062327]" />
            <div>
              <p className="text-xs font-semibold text-[#062327]">
                Processing your speech...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not listening and not transcribing
  if (!isListening) return null;

  // Format recording MM:SS
  const mins = Math.floor(recordingDuration / 60)
    .toString()
    .padStart(2, '0');
  const secs = (recordingDuration % 60).toString().padStart(2, '0');

  // Waveform equalizer scale from real WebRTC audio volume
  const dynamicScale = Math.max(0.4, 0.4 + (audioLevel || 0) * 1.8);

  return (
    <div
      className="mb-3 p-4 rounded-2xl bg-[#e5ecec] border border-[#062327]/12 shadow-sm animate-slide-up transition-all duration-200"
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {/* Left: Duration timer & red soundwave visualizer */}
        <div className="flex items-center gap-2.5">
          {/* Duration display without any dot/ring */}
          <div className="px-2.5 py-1 rounded-full bg-[#d8e3e3] border border-[#062327]/10 text-xs font-mono font-semibold text-[#062327]">
            {mins}:{secs}
          </div>

          {/* Equalizer Waveform - Red Bars */}
          <div
            className="flex items-end gap-1 h-5 px-2 py-0.5 rounded-lg bg-[#d8e3e3] border border-[#062327]/08 text-[#ef4444]"
            title={`Audio level: ${Math.round(audioLevel * 100)}%`}
          >
            <span
              className="sound-wave-bar"
              style={{
                animationPlayState: isSpeaking ? 'running' : 'paused',
                transform: `scaleY(${dynamicScale * 0.9})`,
              }}
            />
            <span
              className="sound-wave-bar"
              style={{
                animationPlayState: isSpeaking ? 'running' : 'paused',
                transform: `scaleY(${dynamicScale * 1.3})`,
              }}
            />
            <span
              className="sound-wave-bar"
              style={{
                animationPlayState: isSpeaking ? 'running' : 'paused',
                transform: `scaleY(${dynamicScale * 1.5})`,
              }}
            />
            <span
              className="sound-wave-bar"
              style={{
                animationPlayState: isSpeaking ? 'running' : 'paused',
                transform: `scaleY(${dynamicScale * 1.1})`,
              }}
            />
            <span
              className="sound-wave-bar"
              style={{
                animationPlayState: isSpeaking ? 'running' : 'paused',
                transform: `scaleY(${dynamicScale * 0.7})`,
              }}
            />
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Use Transcript button */}
          <button
            type="button"
            onClick={handleCommit}
            disabled={!activeTranscript}
            className={`
              px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-sm
              ${
                activeTranscript
                  ? 'bg-[#d2f57b] hover:bg-[#c4ed66] text-[#062327] border border-[#062327]/15 cursor-pointer'
                  : 'bg-[#d8e3e3] text-[#558187]/60 cursor-not-allowed border border-[#062327]/05'
              }
            `}
            title="Insert transcript into message box"
          >
            <CheckCheck size={14} />
            <span>Use Transcript</span>
          </button>

          {/* Send Immediately button */}
          {activeTranscript && (
            <button
              type="button"
              onClick={handleSend}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 bg-[#062327] text-white hover:bg-[#062327]/90 transition-all shadow-sm cursor-pointer"
              title="Send to chat immediately"
            >
              <Send size={12} />
              <span className="hidden sm:inline">Send Now</span>
            </button>
          )}

          {/* Cancel Button */}
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-xl text-[#558187] hover:text-[#062327] hover:bg-[#d8e3e3] transition-colors"
            title="Cancel voice input"
            aria-label="Cancel voice input"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Interactive Live Transcript Box ── */}
      <div
        onClick={() => {
          if (activeTranscript) {
            handleCommit();
          }
        }}
        className={`
          px-3.5 py-3 rounded-xl border transition-all duration-150
          ${
            activeTranscript
              ? 'cursor-pointer bg-[#dce5e5] hover:bg-[#d4dede] border-[#062327]/12 text-[#062327]'
              : 'cursor-default bg-[#dce5e5]/60 border-[#062327]/08 text-[#558187]'
          }
        `}
        title={activeTranscript ? 'Click here to insert this transcript' : ''}
      >
        {activeTranscript ? (
          <p className="text-xs text-[#062327] font-medium leading-relaxed">
            <span>{transcript}</span>
            {interimTranscript && (
              <span className="text-[#558187] font-normal italic ml-1">
                {interimTranscript}
              </span>
            )}
          </p>
        ) : (
          <p className="text-xs text-[#558187] italic">
            Listening... speak clearly into your microphone
          </p>
        )}
      </div>
    </div>
  );
}

