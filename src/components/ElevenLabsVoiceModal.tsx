import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  Radio,
  Sliders,
  SlidersHorizontal,
  Check,
  ShieldCheck,
  Cpu,
  Info,
  KeyRound,
  ExternalLink,
  ChevronRight,
  Headphones
} from 'lucide-react';
import {
  elevenLabsVoiceManager,
  CURATED_VOICES,
  ELEVENLABS_MODELS,
  ElevenLabsVoice,
  PlaybackState
} from '../services/elevenLabsService';
import { hapticFeedback } from '../utils/haptics';

interface ElevenLabsVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMissionScript?: string;
}

export const ElevenLabsVoiceModal: React.FC<ElevenLabsVoiceModalProps> = ({
  isOpen,
  onClose,
  activeMissionScript,
}) => {
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    elevenLabsVoiceManager.getSelectedVoiceId()
  );
  const [selectedModelId, setSelectedModelId] = useState<string>(
    elevenLabsVoiceManager.getSelectedModelId()
  );
  const [stability, setStability] = useState<number>(0.5);
  const [similarity, setSimilarity] = useState<number>(0.75);
  const [hasServerKey, setHasServerKey] = useState<boolean | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(
    elevenLabsVoiceManager.getState()
  );
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  // Canvas ref for audio visualizer
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Subscribe to playback updates
  useEffect(() => {
    const unsubscribe = elevenLabsVoiceManager.subscribe((state) => {
      setPlaybackState(state);
      if (state.status === 'idle') {
        setPreviewingVoiceId(null);
      }
    });

    elevenLabsVoiceManager.checkConfigStatus().then((configured) => {
      setHasServerKey(configured);
    });

    return () => {
      unsubscribe();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Visualizer loop
  useEffect(() => {
    if (playbackState.status !== 'playing') {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const renderVisualizer = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const data = elevenLabsVoiceManager.getVisualizerData();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const barCount = 28;
      const barWidth = width / barCount - 2;

      for (let i = 0; i < barCount; i++) {
        let barHeight = 6;
        if (data && data.length > 0) {
          const dataIndex = Math.floor((i / barCount) * data.length);
          const value = data[dataIndex] || 0;
          barHeight = Math.max(6, (value / 255) * height * 0.9);
        } else {
          // Synthetic subtle wave during fallback playback
          const time = Date.now() / 200;
          barHeight = Math.max(6, Math.sin(time + i * 0.4) * (height * 0.35) + height * 0.4);
        }

        const x = i * (barWidth + 2);
        const y = height - barHeight;

        // Gradient
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#059669'); // emerald-600
        gradient.addColorStop(1, '#34d399'); // emerald-400

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }

      animationFrameRef.current = requestAnimationFrame(renderVisualizer);
    };

    renderVisualizer();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [playbackState.status]);

  if (!isOpen) return null;

  const handleSelectVoice = (voice: ElevenLabsVoice) => {
    hapticFeedback.tactileClick();
    setSelectedVoiceId(voice.voice_id);
    elevenLabsVoiceManager.setSelectedVoiceId(voice.voice_id);
  };

  const handlePreviewVoice = (voice: ElevenLabsVoice, e: React.MouseEvent) => {
    e.stopPropagation();
    hapticFeedback.buttonPress();

    if (playbackState.status === 'playing' && previewingVoiceId === voice.voice_id) {
      elevenLabsVoiceManager.stop();
      setPreviewingVoiceId(null);
      return;
    }

    setPreviewingVoiceId(voice.voice_id);
    elevenLabsVoiceManager.speak(voice.preview_prompt || 'Welcome explorer! Ready to explore the wilderness with me?', {
      voiceId: voice.voice_id,
      modelId: selectedModelId,
      onEnd: () => setPreviewingVoiceId(null),
    });
  };

  const handlePlayActiveMission = () => {
    if (!activeMissionScript) return;
    hapticFeedback.buttonPress();

    if (playbackState.status === 'playing') {
      elevenLabsVoiceManager.stop();
    } else {
      elevenLabsVoiceManager.speak(activeMissionScript, {
        voiceId: selectedVoiceId,
        modelId: selectedModelId,
      });
    }
  };

  const handleApplySettings = () => {
    elevenLabsVoiceManager.setSettings(stability, similarity);
    elevenLabsVoiceManager.setSelectedModelId(selectedModelId);
    elevenLabsVoiceManager.setSelectedVoiceId(selectedVoiceId);
    hapticFeedback.missionComplete();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-[#0b0f12] border border-emerald-500/30 rounded-2xl shadow-2xl overflow-hidden text-neutral-100">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-emerald-500/20 bg-[#0d1418]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Headphones className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-mono tracking-tight text-white flex items-center gap-2">
                  ELEVENLABS NEURAL VOICE STUDIO
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                  v2.5 Turbo
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono">
                Real-time ultra-realistic audio expedition companion
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              elevenLabsVoiceManager.stop();
              onClose();
            }}
            className="w-9 h-9 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 flex items-center justify-center text-neutral-400 hover:text-white transition-all border border-neutral-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Alert Banner */}
        <div className="px-5 sm:px-7 py-3 bg-[#0a1815] border-b border-emerald-500/20 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                hasServerKey
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                  : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
              }`}
            />
            <span className="text-neutral-200 font-semibold">
              {hasServerKey
                ? 'ELEVENLABS API CONNECTED · NEURAL ENGINE ACTIVE'
                : 'HYBRID VOICE ENGINE · READY WITH CLIENT FALLBACK'}
            </span>
          </div>

          {!hasServerKey && (
            <div className="flex items-center gap-2 text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-500/30 px-2.5 py-1 rounded-lg">
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span>Configure <code className="text-amber-200 font-bold">ELEVENLABS_API_KEY</code> in environment for ultra-HD neural voices</span>
            </div>
          )}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-6 scrollbar-thin scrollbar-thumb-emerald-800/50">
          {/* Active Audio Waveform Bar */}
          <div className="bg-[#0f171d] border border-emerald-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={handlePlayActiveMission}
                disabled={!activeMissionScript}
                className="w-12 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black flex items-center justify-center font-bold shadow-lg shadow-emerald-950/50 transition-all shrink-0"
              >
                {playbackState.status === 'playing' ? (
                  <Square className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>
              <div className="min-w-0">
                <div className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>
                    {playbackState.status === 'playing'
                      ? `SPEAKING (${playbackState.engine === 'elevenlabs' ? 'ELEVENLABS NEURAL' : 'HYBRID SPEECH'})`
                      : 'STANDBY MISSION AUDIO'}
                  </span>
                </div>
                <div className="text-xs text-neutral-300 truncate max-w-xs sm:max-w-md font-mono mt-0.5">
                  {playbackState.currentText || activeMissionScript || 'Select a voice below to preview natural wilderness instructions.'}
                </div>
              </div>
            </div>

            {/* Live Visualizer Canvas */}
            <div className="w-full sm:w-48 h-10 bg-black/50 border border-emerald-500/20 rounded-lg overflow-hidden flex items-center justify-center px-2 shrink-0">
              <canvas
                ref={canvasRef}
                width={192}
                height={40}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Voice Personas Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-mono uppercase font-bold text-neutral-400 tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>CHOOSE YOUR FIELD EXPEDITION GUIDE ({CURATED_VOICES.length})</span>
              </h3>
              <span className="text-[11px] font-mono text-emerald-400">
                Click Card to Select · Play to Preview
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CURATED_VOICES.map((voice) => {
                const isSelected = selectedVoiceId === voice.voice_id;
                const isPlayingThis =
                  playbackState.status === 'playing' &&
                  previewingVoiceId === voice.voice_id;

                return (
                  <div
                    key={voice.voice_id}
                    onClick={() => handleSelectVoice(voice)}
                    className={`relative p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-emerald-950/30 border-emerald-400 ring-1 ring-emerald-500/50'
                        : 'bg-[#0f171d]/80 border-neutral-800 hover:border-neutral-700 hover:bg-[#121c22]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-700 flex items-center justify-center text-xl shrink-0">
                          {voice.avatarEmoji || '🌲'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white font-mono">
                              {voice.name}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700">
                              {voice.accent}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-emerald-400/90 font-mono mt-0.5">
                            {voice.role}
                          </div>
                        </div>
                      </div>

                      {/* Preview Button */}
                      <button
                        onClick={(e) => handlePreviewVoice(voice, e)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0 ${
                          isPlayingThis
                            ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/50'
                            : 'bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
                        }`}
                        title="Preview voice"
                      >
                        {isPlayingThis ? (
                          <Square className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>
                    </div>

                    <p className="text-xs text-neutral-400 mt-2.5 line-clamp-2 leading-relaxed">
                      {voice.description}
                    </p>

                    <div className="mt-3 pt-2 border-t border-neutral-800/60 flex items-center justify-between text-[11px] font-mono text-neutral-500">
                      <span>ID: {voice.voice_id.slice(0, 10)}...</span>
                      <span className="text-neutral-400 italic truncate max-w-[170px]">
                        "{voice.preview_prompt?.slice(0, 30)}..."
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Model & Voice Acoustic Parameter Controls */}
          <div className="bg-[#0f171d] border border-neutral-800 rounded-xl p-4 sm:p-5 space-y-4">
            <h3 className="text-xs font-mono uppercase font-bold text-neutral-400 tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>NEURAL MODEL & ACOUSTIC TUNING</span>
            </h3>

            {/* Model Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {ELEVENLABS_MODELS.map((model) => {
                const isModelSelected = selectedModelId === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => {
                      hapticFeedback.tactileClick();
                      setSelectedModelId(model.id);
                    }}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isModelSelected
                        ? 'bg-emerald-950/40 border-emerald-400 ring-1 ring-emerald-500/40'
                        : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold font-mono text-white">
                        {model.name}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-emerald-400 border border-neutral-700">
                        {model.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-tight">
                      {model.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Sliders: Stability & Similarity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <div className="flex justify-between text-xs font-mono text-neutral-300 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Stability</span>
                  </span>
                  <span className="font-bold text-emerald-400">
                    {Math.round(stability * 100)}% ({stability < 0.4 ? 'Expressive' : stability > 0.7 ? 'Stable' : 'Balanced'})
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={stability}
                  onChange={(e) => setStability(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-neutral-500 mt-1">
                  <span>More Variable & Emotive</span>
                  <span>More Consistent</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono text-neutral-300 mb-1.5">
                  <span className="flex items-center gap-1">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Clarity + Similarity Boost</span>
                  </span>
                  <span className="font-bold text-emerald-400">
                    {Math.round(similarity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={similarity}
                  onChange={(e) => setSimilarity(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-neutral-500 mt-1">
                  <span>Low Artifacts</span>
                  <span>Maximum Accent Fidelity</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-7 py-4 border-t border-neutral-800 bg-[#0d1418] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-mono text-neutral-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Active: {elevenLabsVoiceManager.getSelectedVoice().name} ({elevenLabsVoiceManager.getSelectedVoice().role})</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                elevenLabsVoiceManager.stop();
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-mono font-semibold text-neutral-300 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleApplySettings}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black text-xs font-mono font-bold shadow-lg shadow-emerald-950/60 transition-all flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Apply Voice Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
