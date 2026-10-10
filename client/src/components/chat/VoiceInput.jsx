/**
 * components/chat/VoiceInput.jsx
 * Ultra-Fast ChatGPT-Style Real-Time Voice Input Component.
 * Powered by WebRTC MediaStream, real-time VAD (Voice Activity Detection),
 * and instant 0ms streaming speech recognition.
 */

import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Square,
  Check,
  X,
  AlertCircle,
  Globe,
  Sparkles,
  Loader2,
  Zap,
  Cpu,
  Send,
  Volume2,
  CheckCheck,
} from 'lucide-react';
import { VOICE_ENGINES, VOICE_LANGUAGES } from '../../hooks/useWebRTCVoice';

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
          h-11 w-11 p-0 rounded-xl flex-shrink-0 flex items-center justify-center
          bg-white/[0.02] border border-white/[0.04] text-zinc-600 cursor-not-allowed
        "
        title="Microphone recording is not supported in this browser."
        aria-label="Microphone not supported"
      >
        <MicOff size={16} />
      </button>
    );
  }

  if (isTranscribing) {
    return (
      <button
        type="button"
        disabled
        className="
          h-11 w-11 p-0 rounded-xl flex-shrink-0 flex items-center justify-center
          bg-brand-500/20 text-brand-300 border border-brand-500/40 animate-pulse
        "
        title="Transcribing audio with Whisper AI..."
        aria-label="Transcribing audio"
      >
        <Loader2 size={16} className="animate-spin text-brand-400" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        h-11 w-11 p-0 rounded-xl flex-shrink-0 flex items-center justify-center
        transition-all duration-200 relative group
        ${
          isListening
            ? isPauseDetected
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_18px_rgba(245,158,11,0.35)] animate-pulse'
              : 'bg-rose-500/20 text-rose-400 border border-rose-500/50 animate-voice-glow shadow-[0_0_20px_rgba(244,63,94,0.35)]'
            : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 border border-white/[0.08] hover:border-white/[0.16] hover:scale-[1.03] active:scale-[0.97]'
        }
      `}
      title={
        isListening
          ? isPauseDetected
            ? 'Pause detected! Click to finish or use transcript (Alt+V)'
            : 'Stop voice input (Alt+V)'
          : 'WebRTC Instant Voice Input (ChatGPT style, Alt+V)'
      }
      aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
    >
      {isListening ? (
        <Square size={13} className={`fill-current ${isPauseDetected ? 'text-amber-400' : 'text-rose-400'}`} />
      ) : (
        <Mic size={16} className="group-hover:text-brand-300 transition-colors" />
      )}
    </button>
  );
}

/**
 * Rich WebRTC Voice Banner showing real-time waveform, streaming transcript,
 * pause detection alerts, and fraction-of-a-second commit/send buttons.
 */
export function VoiceInputBanner({
  isListening,
  isSpeaking,
  isPauseDetected,
  isTranscribing,
  engine = 'instant',
  onEngineChange,
  transcript = '',
  interimTranscript = '',
  fullTranscript: passedFullTranscript,
  recordingDuration = 0,
  audioLevel = 0,
  language = 'en-US',
  onLanguageChange,
  onCommitTranscript,
  onSendImmediately,
  onDone,
  onStopAndTranscribe,
  onCancel,
  error,
  onErrorDismiss,
}) {
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Unify handlers for backward compatibility
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
      <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300 animate-slide-up">
        <div className="flex items-center gap-2 pr-2">
          <AlertCircle size={15} className="flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={onErrorDismiss}
          className="p-1 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 transition-colors flex-shrink-0"
          title="Dismiss error"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Whisper Cloud Processing State
  if (isTranscribing) {
    return (
      <div className="mb-3 p-3.5 rounded-2xl bg-[#12121c]/95 border border-brand-500/30 shadow-2xl backdrop-blur-md animate-slide-up relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Loader2 size={16} className="animate-spin text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-200">
                Transcribing with Whisper AI Turbo...
              </p>
              <p className="text-2xs text-zinc-500">
                Processing cloud speech audio via Groq
              </p>
            </div>
          </div>
          <span className="text-2xs text-brand-400/90 font-mono bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded-full">
            Groq Whisper v3
          </span>
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

  const currentLangLabel =
    VOICE_LANGUAGES.find((l) => l.code === language)?.label || 'English (US)';

  // Waveform equalizer scale from real WebRTC audio volume
  const dynamicScale = Math.max(0.4, 0.4 + (audioLevel || 0) * 1.8);

  return (
    <div
      className={`
        mb-3 p-3.5 rounded-2xl bg-[#12121c]/95 border shadow-2xl backdrop-blur-md
        animate-slide-up relative overflow-hidden transition-all duration-300
        ${
          isPauseDetected
            ? 'border-amber-500/50 shadow-[0_4px_30px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/30'
            : 'border-rose-500/30'
        }
      `}
    >
      {/* Top Accent Line */}
      <div
        className={`
          absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r transition-all duration-300
          ${
            isPauseDetected
              ? 'from-transparent via-amber-400/90 to-transparent'
              : 'from-transparent via-rose-500/70 to-transparent'
          }
        `}
      />

      {/* Top Controls Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 mb-2.5">
        {/* Left: Duration timer, soundwave visualizer & VAD pause badge */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Duration Pill */}
          <div
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
              ${
                isPauseDetected
                  ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                  : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
              }
            `}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isPauseDetected
                  ? 'bg-amber-400 animate-ping'
                  : isSpeaking
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-rose-500 animate-pulse'
              }`}
            />
            <span className="font-mono font-semibold">{mins}:{secs}</span>
          </div>

          {/* WebRTC Real-Time Equalizer Waveform */}
          <div
            className={`
              flex items-end gap-1 h-5 px-1.5 py-0.5 rounded-md bg-white/[0.02] border border-white/[0.04]
              ${isPauseDetected ? 'text-amber-400' : 'text-rose-400'}
            `}
            title={`Real-time WebRTC audio level: ${Math.round(audioLevel * 100)}%`}
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

          {/* VAD Speech / Pause Status Badge */}
          {isPauseDetected ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-2xs font-semibold animate-pulse">
              <span>⏸️ Pause detected (1.2s silence)</span>
              <span className="text-amber-200/80 font-normal">· Click transcript below to use</span>
            </div>
          ) : isSpeaking ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-2xs font-medium">
              <Volume2 size={11} className="animate-pulse" />
              <span>Voice active</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] text-zinc-400 text-2xs">
              <span>Listening...</span>
            </div>
          )}

          {/* Engine Selector Pills */}
          {onEngineChange && (
            <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.06]">
              <button
                type="button"
                onClick={() => onEngineChange('instant')}
                className={`
                  px-2 py-0.5 text-2xs rounded-md flex items-center gap-1 transition-all
                  ${
                    engine === 'instant'
                      ? 'bg-brand-500 text-black font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                `}
                title="WebRTC browser real-time speech engine (0ms latency like ChatGPT)"
              >
                <Zap size={10} />
                <span>Instant (ChatGPT)</span>
              </button>
              <button
                type="button"
                onClick={() => onEngineChange('whisper')}
                className={`
                  px-2 py-0.5 text-2xs rounded-md flex items-center gap-1 transition-all
                  ${
                    engine === 'whisper'
                      ? 'bg-rose-500 text-white font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                `}
                title="Cloud Whisper AI Large Turbo (Groq)"
              >
                <Cpu size={10} />
                <span>Whisper Turbo</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Language Selector & Fast Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
          {/* Language dropdown */}
          {onLanguageChange && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLangMenu((v) => !v)}
                className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-2xs text-zinc-300 flex items-center gap-1.5 transition-colors"
                title="Change speech language"
              >
                <Globe size={12} className="text-zinc-400" />
                <span>{currentLangLabel}</span>
              </button>

              {showLangMenu && (
                <div className="absolute right-0 bottom-full mb-1.5 w-36 py-1 rounded-xl bg-[#1c1c28] border border-white/[0.12] shadow-2xl z-30">
                  {VOICE_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        onLanguageChange(l.code);
                        setShowLangMenu(false);
                      }}
                      className={`
                        w-full text-left px-3 py-1.5 text-xs transition-colors
                        ${
                          l.code === language
                            ? 'bg-brand-500/20 text-brand-300 font-medium'
                            : 'text-zinc-300 hover:bg-white/[0.06]'
                        }
                      `}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fraction-of-a-second "Use Transcript" button */}
          <button
            type="button"
            onClick={handleCommit}
            disabled={!activeTranscript}
            className={`
              btn px-3 py-1 text-xs gap-1.5 rounded-lg h-7 font-medium shadow-md transition-all
              ${
                isPauseDetected && activeTranscript
                  ? 'bg-amber-400 hover:bg-amber-300 text-black font-semibold ring-2 ring-amber-400/50 scale-[1.02]'
                  : activeTranscript
                  ? 'btn-primary'
                  : 'bg-white/[0.05] text-zinc-500 cursor-not-allowed border border-white/[0.06]'
              }
            `}
            title="Insert transcript into message box in a fraction of a second (0ms wait)"
          >
            <CheckCheck size={13} />
            <span>Use Transcript</span>
          </button>

          {/* Send Immediately button (fraction-of-a-second direct send) */}
          {activeTranscript && (
            <button
              type="button"
              onClick={handleSend}
              className="btn btn-primary px-2.5 py-1 text-xs gap-1 rounded-lg h-7 font-medium bg-brand-500 text-black hover:bg-brand-400 shadow-md"
              title="Send to chat immediately (fraction of a second)"
            >
              <Send size={11} />
              <span className="hidden sm:inline">Send Now</span>
            </button>
          )}

          {/* Cancel Button */}
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
            title="Cancel voice input"
            aria-label="Cancel voice input"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Interactive Live Transcript Box ── */}
      {/* Clicking anywhere on this box inserts the transcript in a fraction of a second */}
      <div
        onClick={() => {
          if (activeTranscript) {
            handleCommit();
          }
        }}
        className={`
          px-3.5 py-2.5 rounded-xl border transition-all duration-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2
          ${
            activeTranscript
              ? 'cursor-pointer hover:bg-white/[0.04] active:scale-[0.99]'
              : 'cursor-default'
          }
          ${
            isPauseDetected && activeTranscript
              ? 'bg-amber-500/[0.08] border-amber-500/40 hover:border-amber-500/70'
              : 'bg-black/40 border-white/[0.07] hover:border-white/[0.14]'
          }
        `}
        title={activeTranscript ? 'Click here to insert this transcript in a fraction of a second!' : ''}
      >
        <div className="flex-1 min-w-0 pr-2">
          {activeTranscript ? (
            <div className="flex items-start gap-2">
              <p className="text-xs text-zinc-100 leading-relaxed font-sans">
                <span>{transcript}</span>
                {interimTranscript && (
                  <span className="text-brand-300 font-medium italic opacity-90 ml-1">
                    {interimTranscript}
                  </span>
                )}
              </p>
            </div>
          ) : (
            <p className="text-xs text-zinc-400 italic flex items-center gap-1.5">
              <Sparkles size={13} className="text-brand-400 flex-shrink-0" />
              <span>
                {engine === 'instant'
                  ? 'Speak now — words stream onto your screen in real time (like ChatGPT)...'
                  : 'Speak clearly into your microphone — click "Use Transcript" when done...'}
              </span>
            </p>
          )}
        </div>

        {/* Micro-hint badge */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto flex-shrink-0">
          {activeTranscript ? (
            <span
              className={`
                text-[10px] font-mono px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1
                ${
                  isPauseDetected
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-semibold'
                    : 'bg-white/[0.05] text-zinc-400 border-white/[0.08]'
                }
              `}
            >
              <Zap size={9} className="text-amber-400" />
              <span>Click transcript to insert (0s wait)</span>
            </span>
          ) : (
            <span className="text-[10px] text-zinc-500 font-mono">
              {engine === 'instant' ? 'WebRTC Real-Time (0ms)' : 'Groq Whisper v3'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
