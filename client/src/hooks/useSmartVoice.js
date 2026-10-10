/**
 * hooks/useSmartVoice.js
 * Ultra-Fast Voice Assistant Hook powered by WebRTC and Browser Real-Time Speech Processing.
 * Re-exports useWebRTCVoice for full backwards compatibility and unified API.
 */

export {
  useWebRTCVoice as useSmartVoice,
  useWebRTCVoice,
  VOICE_ENGINES,
  VOICE_LANGUAGES,
} from './useWebRTCVoice';
