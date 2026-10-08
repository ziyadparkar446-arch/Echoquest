import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  Radio,
  SlidersHorizontal,
  Check,
  ShieldCheck,
  Cpu,
  Info,
  ChevronRight,
  Headphones,
  Mic,
  MessageSquare,
  Heart,
  Compass,
  Footprints,
  Activity,
  Send,
  Loader2
} from 'lucide-react';
import {
  geminiVoiceManager,
  HUMAN_VOICES,
  HumanVoice,
  PlaybackState
} from '../services/geminiVoiceService';
import { hapticFeedback } from '../utils/haptics';

interface InteractiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMissionScript?: string;
}

export const InteractiveVoiceModal: React.FC<InteractiveVoiceModalProps> = ({
  isOpen,
  onClose,
  activeMissionScript,
}) => {
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    geminiVoiceManager.getSelectedVoiceId()
  );
  const [speechSettings, setSpeechSettings] = useState(
    geminiVoiceManager.getSpeechSettings()
  );
  const [playbackState, setPlaybackState] = useState<PlaybackState>(
    geminiVoiceManager.getState()
  );
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [testPrompt, setTestPrompt] = useState<string>('What kind of trees and birds should I look for around here?');
  const [isTestResponding, setIsTestResponding] = useState(false);
  const [interactiveMode, setInteractiveMode] = useState(true);

  // Canvas ref for real-time human audio spectrum visualizer
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Subscribe to playback updates
  useEffect(() => {
    const unsubscribe = geminiVoiceManager.subscribe((state) => {
      setPlaybackState(state);
      if (state.status === 'idle') {
        setPreviewingVoiceId(null);
      }
    });

    return () => {
      unsubscribe();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Real-time audio spectrum visualization
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

      const data = geminiVoiceManager.getVisualizerData();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const barCount = 32;
      const barWidth = Math.floor(width / barCount) - 2;

      for (let i = 0; i < barCount; i++) {
        let value = 15;
        if (data && data.length > i) {
          value = Math.max(12, (data[i] / 255) * height);
        } else {
          // Organic breathing wave when playing via audio element
          value = Math.sin(Date.now() / 150 + i * 0.4) * 20 + 35;
        }

        const x = i * (barWidth + 2);
        const y = height - value;

        // Warm organic gradients
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#10b981');
        gradient.addColorStop(0.6, '#38bdf8');
        gradient.addColorStop(1, '#a855f7');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, value, [3, 3, 0, 0]);
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

  const activeVoice =
    HUMAN_VOICES.find((v) => v.voice_id === selectedVoiceId) || HUMAN_VOICES[0];

  const handleSelectVoice = (voice: HumanVoice) => {
    hapticFeedback.tactileClick();
    setSelectedVoiceId(voice.voice_id);
    geminiVoiceManager.setSelectedVoiceId(voice.voice_id);
  };

  const handlePreviewVoice = (voice: HumanVoice, e: React.MouseEvent) => {
    e.stopPropagation();
    hapticFeedback.buttonPress();

    if (playbackState.status === 'playing' && previewingVoiceId === voice.voice_id) {
      geminiVoiceManager.stop();
      setPreviewingVoiceId(null);
      return;
    }

    setPreviewingVoiceId(voice.voice_id);
    geminiVoiceManager.speak(voice.preview_prompt, {
      voiceId: voice.voice_id,
      onEnd: () => setPreviewingVoiceId(null),
    });
  };

  const handlePlayMissionScript = () => {
    if (!activeMissionScript) return;
    hapticFeedback.buttonPress();

    if (playbackState.status === 'playing') {
      geminiVoiceManager.stop();
    } else {
      geminiVoiceManager.speak(activeMissionScript, {
        voiceId: selectedVoiceId,
      });
    }
  };

  const handleSpeedChange = (speed: number) => {
    const updated = { ...speechSettings, speed };
    setSpeechSettings(updated);
    geminiVoiceManager.setSpeechSettings(updated.speed, updated.warmth);
  };

  const handleWarmthChange = (warmth: number) => {
    const updated = { ...speechSettings, warmth };
    setSpeechSettings(updated);
    geminiVoiceManager.setSpeechSettings(updated.speed, updated.warmth);
  };

  const handleTestInteractiveChat = async () => {
    if (!testPrompt.trim() || isTestResponding) return;
    setIsTestResponding(true);
    hapticFeedback.buttonPress();

    try {
      const res = await fetch('/api/voice-guide/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: testPrompt,
          guideVoiceId: activeVoice.voice_id,
          guideName: activeVoice.name,
          guideRole: activeVoice.role,
        }),
      });

      const data = await res.json();
      const textToSpeak = data.spokenText || `Hey Explorer! I am right here with you. Look closely at the ground and let's explore!`;

      await geminiVoiceManager.speak(textToSpeak, {
        voiceId: activeVoice.voice_id,
      });
    } catch (e) {
      await geminiVoiceManager.speak(
        `Hey Explorer, I can hear you clearly! Let's keep exploring the woodland together.`,
        { voiceId: activeVoice.voice_id }
      );
    } finally {
      setIsTestResponding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl overflow-hidden text-stone-100">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-900/90 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-stone-100">Interactive AI Voice Companion</h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                  Gemini Neural Voice
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Natural human dialogue & audio in your earphones as you walk outside
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              geminiVoiceManager.stop();
              onClose();
            }}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Real-Time Live Waveform Visualizer Bar */}
        <div className="px-6 py-3 bg-stone-950/80 border-b border-stone-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-3 h-3 rounded-full ${playbackState.status === 'playing' ? 'bg-emerald-400 animate-ping' : 'bg-stone-600'}`} />
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-stone-300">
                  {playbackState.status === 'playing'
                    ? `Speaking in earphone (${activeVoice.name})`
                    : playbackState.status === 'loading'
                    ? 'Synthesizing neural voice...'
                    : 'Audio Idle · Ready for hands-free conversation'}
                </span>
                <span className="text-[10px] font-mono text-stone-400">
                  {playbackState.engine === 'gemini-neural' ? '24kHz WAV' : 'Neural Mode'}
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={360}
                height={28}
                className="w-full h-7 rounded-lg bg-stone-900/60 border border-stone-800/80"
              />
            </div>
          </div>

          {playbackState.status === 'playing' && (
            <button
              onClick={() => {
                hapticFeedback.tactileClick();
                geminiVoiceManager.stop();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">
          {/* Section 1: Select Human Voice Companion */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                  Choose Your Outdoor Companion
                </h3>
              </div>
              <span className="text-xs text-stone-400">
                Talks like a real human friend
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {HUMAN_VOICES.map((voice) => {
                const isSelected = voice.voice_id === selectedVoiceId;
                const isPlaying =
                  playbackState.status === 'playing' &&
                  previewingVoiceId === voice.voice_id;

                return (
                  <div
                    key={voice.voice_id}
                    onClick={() => handleSelectVoice(voice)}
                    className={`relative p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-500/30'
                        : 'bg-stone-850/60 hover:bg-stone-800/60 border-stone-800 text-stone-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl p-1.5 rounded-xl bg-stone-800/80 border border-stone-700/50">
                            {voice.avatarEmoji}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm text-stone-100">
                                {voice.name}
                              </h4>
                              {isSelected && (
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                  <Check className="w-3 h-3" /> Active
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-stone-400 font-medium">
                              {voice.role}
                            </span>
                          </div>
                        </div>

                        {/* Test Listen Button */}
                        <button
                          onClick={(e) => handlePreviewVoice(voice, e)}
                          title="Preview voice"
                          className={`p-2 rounded-xl transition-all ${
                            isPlaying
                              ? 'bg-emerald-500 text-stone-950 shadow-md shadow-emerald-500/30'
                              : 'bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-stone-100 border border-stone-700'
                          }`}
                        >
                          {isPlaying ? (
                            <Square className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
                          )}
                        </button>
                      </div>

                      <p className="text-xs text-stone-400 leading-relaxed mb-2">
                        {voice.styleDescription}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-stone-800/60 flex items-center justify-between text-[11px] text-stone-400">
                      <span>{voice.gender === 'female' ? 'Female tone' : 'Male tone'}</span>
                      <span className="italic text-stone-400 font-mono">
                        "{voice.preview_prompt.slice(0, 36)}..."
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Interactive Sandbox - Talk to Guide Now */}
          <div className="p-4 rounded-2xl bg-stone-950/60 border border-stone-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-200">
                  Interactive Test Conversation
                </h4>
              </div>
              <span className="text-xs text-stone-400">
                Ask a question to hear {activeVoice.name}
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestInteractiveChat()}
                placeholder="Ask anything: 'Where am I?', 'What should I look for?'..."
                className="flex-1 px-3.5 py-2 text-xs bg-stone-900 border border-stone-700 rounded-xl text-stone-100 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleTestInteractiveChat}
                disabled={isTestResponding || !testPrompt.trim()}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-stone-950 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
              >
                {isTestResponding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Ask</span>
              </button>
            </div>

            {/* Quick Prompts */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                'Where am I right now?',
                'What leaves should I find?',
                'I see a cool mossy stone!',
                'What is our next objective?',
              ].map((quick) => (
                <button
                  key={quick}
                  onClick={() => {
                    setTestPrompt(quick);
                    geminiVoiceManager.speak(
                      quick.includes('Where')
                        ? `You are right in your exploration area. I have centered the Google Map on your GPS location!`
                        : `Awesome eye, Explorer! Check the ground closely for two broad leaves and a curved twig.`,
                      { voiceId: activeVoice.voice_id }
                    );
                  }}
                  className="px-2.5 py-1 text-[11px] bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-stone-100 rounded-lg border border-stone-800 transition-colors"
                >
                  "{quick}"
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Conversational Settings & Sliders */}
          <div className="p-4 rounded-2xl bg-stone-950/40 border border-stone-800 space-y-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-200">
                Voice Rhythm & Expressiveness
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-stone-300 font-medium">Speaking Pace</span>
                  <span className="font-mono text-emerald-400 text-[11px]">
                    {speechSettings.speed}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.3"
                  step="0.05"
                  value={speechSettings.speed}
                  onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-400 mt-1">
                  <span>Relaxed Trail Walk</span>
                  <span>Normal</span>
                  <span>Brisk Scout</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-stone-300 font-medium">Warmth & Enthusiasm</span>
                  <span className="font-mono text-emerald-400 text-[11px]">
                    {Math.round(speechSettings.warmth * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="1.0"
                  step="0.05"
                  value={speechSettings.warmth}
                  onChange={(e) => handleWarmthChange(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-400 mt-1">
                  <span>Calm & Focused</span>
                  <span>Friendly Companion</span>
                  <span>High Energy</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Current Mission Script Readout */}
          {activeMissionScript && (
            <div className="p-4 rounded-2xl bg-stone-950/40 border border-stone-800 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  Current Quest Audio Briefing
                </span>
                <p className="text-xs text-stone-200 line-clamp-2">
                  "{activeMissionScript}"
                </p>
              </div>

              <button
                onClick={handlePlayMissionScript}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-100 rounded-xl text-xs font-semibold flex items-center gap-2 border border-stone-700 transition-colors shrink-0"
              >
                {playbackState.status === 'playing' ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current text-rose-400" />
                    <span>Stop Briefing</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Listen</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-stone-800 bg-stone-900 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-stone-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Active Companion: <strong className="text-stone-200">{activeVoice.name}</strong> ({activeVoice.role})</span>
          </div>

          <button
            onClick={() => {
              hapticFeedback.buttonPress();
              geminiVoiceManager.stop();
              onClose();
            }}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-500/20"
          >
            Apply & Continue Trek
          </button>
        </div>
      </div>
    </div>
  );
};
