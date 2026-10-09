import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Headphones,
  Smartphone,
  Radio,
  Footprints,
  Compass,
  CheckCircle2,
  Volume2,
  VolumeX,
  Sparkles,
  Zap,
  Activity,
  Shield,
  HelpCircle,
  EyeOff,
  Send,
  Loader2,
  Brain,
  MessageSquare,
  Flame,
  ArrowRight,
} from 'lucide-react';
import {
  voiceRecognitionService,
  VoiceRecognitionState,
  RecognizedVoiceCommand,
} from '../services/voiceRecognitionService';
import {
  movementTrackingService,
  MovementTelemetry,
} from '../services/movementTrackingService';
import {
  geminiVoiceManager,
  HumanVoice,
} from '../services/geminiVoiceService';
import { LocalityWaypoint } from '../types';
import { GeneratedMission } from '../services/geminiMissionService';
import { hapticFeedback } from '../utils/haptics';

interface HandsFreeVoiceHUDProps {
  telemetry: MovementTelemetry;
  activeWaypoint: LocalityWaypoint | null;
  waypoints: LocalityWaypoint[];
  mission?: GeneratedMission | null;
  onSelectWaypoint: (wp: LocalityWaypoint) => void;
  onWaypointCompleted: (id: string) => void;
  onAdvanceToNextTask: () => void;
}

interface VoiceLogItem {
  id: string;
  sender: 'user' | 'guide';
  text: string;
  thought?: string;
  action?: string;
  time: string;
}

export const HandsFreeVoiceHUD: React.FC<HandsFreeVoiceHUDProps> = ({
  telemetry,
  activeWaypoint,
  waypoints,
  mission,
  onSelectWaypoint,
  onWaypointCompleted,
  onAdvanceToNextTask,
}) => {
  const [voiceState, setVoiceState] = useState<VoiceRecognitionState>(
    voiceRecognitionService.getState()
  );
  const [activeVoice, setActiveVoice] = useState<HumanVoice>(
    geminiVoiceManager.getSelectedVoice()
  );
  const [isPocketOledActive, setIsPocketOledActive] = useState(false);
  const [hasStartedExpedition, setHasStartedExpedition] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [currentThought, setCurrentThought] = useState<string>('');
  const [manualInput, setManualInput] = useState('');
  const [voiceLog, setVoiceLog] = useState<VoiceLogItem[]>([]);
  const isProcessingRef = useRef(false);

  // Subscribe to voice recognition events
  useEffect(() => {
    const unsub = voiceRecognitionService.subscribe((state) => {
      setVoiceState(state);
    });
    return () => unsub();
  }, []);

  // Update active voice when changed
  useEffect(() => {
    const unsubVoice = geminiVoiceManager.subscribe(() => {
      setActiveVoice(geminiVoiceManager.getSelectedVoice());
    });
    return () => unsubVoice();
  }, []);

  // Subscribe to verbal prompts triggered by movement changes (Resting / Moving)
  useEffect(() => {
    const unsubPrompts = movementTrackingService.onVerbalPrompt((promptText, reason) => {
      // Speak verbal prompt into earphones via Gemini Neural Voice
      geminiVoiceManager.speak(promptText, {
        voiceId: geminiVoiceManager.getSelectedVoiceId(),
      });
      addLogEntry('guide', promptText, `Movement trigger: ${reason}`);
    });
    return () => unsubPrompts();
  }, []);

  const addLogEntry = (
    sender: 'user' | 'guide',
    text: string,
    thought?: string,
    action?: string
  ) => {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setVoiceLog((prev) => [
      {
        id: `log-${Date.now()}-${Math.random()}`,
        sender,
        text,
        thought,
        action,
        time,
      },
      ...prev.slice(0, 19),
    ]);
  };

  /**
   * Interactive AI Guide Pipeline:
   * Takes the user's verbal command or question, passes it to the AI guide endpoint,
   * displays the thinking state, and speaks the response into the earphones using Gemini Neural Voice.
   */
  const handleInteractiveAI = async (queryText: string) => {
    if (!queryText.trim() || isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      hapticFeedback.buttonPress();
      addLogEntry('user', queryText);
      setIsAiThinking(true);
      setCurrentThought(`Analyzing explorer telemetry (${telemetry.state}) and query...`);

      const selectedVoice = geminiVoiceManager.getSelectedVoice();
      const recentHistory = voiceLog.slice(0, 4).map((item) => ({
        role: item.sender === 'user' ? 'user' : 'assistant',
        text: item.text,
      }));

      const response = await fetch('/api/voice-guide/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          guideVoiceId: selectedVoice.voice_id,
          guideName: selectedVoice.name,
          guideRole: selectedVoice.role,
          telemetry: {
            state: telemetry.state,
            speedMps: telemetry.speedMps,
            distanceCoveredMeters: telemetry.distanceCoveredMeters,
            stepCount: telemetry.stepCount,
            headingDegrees: telemetry.headingDegrees,
            latitude: telemetry.latitude,
            longitude: telemetry.longitude,
            localityName: telemetry.localityName,
            activeMovementTask: telemetry.activeMovementTask,
          },
          mission: mission
            ? {
                title: mission.title,
                objective: mission.objective,
                scavengerItems: mission.scavengerItems,
                craftInstructions: mission.craftInstructions,
                biome: mission.biome,
                timeOfDay: mission.timeOfDay,
              }
            : null,
          activeWaypoint: activeWaypoint
            ? {
                name: activeWaypoint.name,
                description: activeWaypoint.description,
                category: activeWaypoint.category,
                distanceMeters: activeWaypoint.distanceMeters,
                bearingDegrees: activeWaypoint.bearingDegrees,
              }
            : null,
          history: recentHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      const thought = data.thought || 'Considered explorer position and objectives.';
      const spokenText = data.spokenText || 'I am tracking your outdoor movement. Proceed forward.';
      const action = data.action || 'NONE';

      setCurrentThought(thought);
      addLogEntry('guide', spokenText, thought, action);

      // Speak answer into user's earphones via Gemini Neural Voice
      await geminiVoiceManager.speak(spokenText, {
        voiceId: selectedVoice.voice_id,
      });

      // Execute game action if signaled by the AI
      if (action === 'COMPLETE_TASK') {
        hapticFeedback.missionComplete();
        if (activeWaypoint) {
          onWaypointCompleted(activeWaypoint.id);
        }
      } else if (action === 'NEXT_TASK') {
        onAdvanceToNextTask();
      } else if (action === 'POCKET_MODE') {
        setIsPocketOledActive(true);
      }
    } catch (err) {
      console.error('Interactive AI error:', err);
      const fallbackReply = `Copy that Explorer. You are currently ${
        telemetry.state === 'MOVING' ? 'in motion' : 'at rest'
      }. Maintain your heading and scan the ground for your craft items.`;
      addLogEntry('guide', fallbackReply, 'Offline fallback executed');
      await geminiVoiceManager.speak(fallbackReply);
    } finally {
      setIsAiThinking(false);
      isProcessingRef.current = false;
    }
  };

  /**
   * Main verbal command handler registered to the speech recognition service
   */
  useEffect(() => {
    const unregister = voiceRecognitionService.registerCommandHandler(
      async (cmd: RecognizedVoiceCommand) => {
        if (cmd.intent === 'START_EXPEDITION') {
          handleStartExpedition();
          return;
        }

        if (cmd.intent === 'STOP_EXPEDITION') {
          voiceRecognitionService.stopListening();
          const stopPrompt = 'Expedition paused. Microphones are on standby.';
          addLogEntry('guide', stopPrompt);
          await geminiVoiceManager.speak(stopPrompt);
          return;
        }

        if (cmd.intent === 'POCKET_MODE') {
          setIsPocketOledActive(true);
          const pocketPrompt =
            'Pocket mode activated. Screen dimmed to black. Keep walking with your earphones on.';
          addLogEntry('guide', pocketPrompt);
          await geminiVoiceManager.speak(pocketPrompt);
          return;
        }

        // All questions and natural phrases route to the Interactive AI
        await handleInteractiveAI(cmd.transcript);
      }
    );

    return () => unregister();
  }, [telemetry, activeWaypoint, mission, onWaypointCompleted, onAdvanceToNextTask]);

  /**
   * Start expedition with voice prompt
   */
  const handleStartExpedition = async () => {
    hapticFeedback.buttonPress();
    setHasStartedExpedition(true);

    // 1. Start continuous hands-free voice recognition
    await voiceRecognitionService.startListening();

    // 2. Play initial voice prompt
    const welcomeVoicePrompt =
      'Expedition protocol initiated. Keep your phone in your pocket and wear your earphones. I am tracking your movement. All guidance is verbal. Speak to me anytime to ask what to do or how to proceed.';

    addLogEntry('guide', welcomeVoicePrompt, 'Initial hands-free startup prompt');

    await geminiVoiceManager.speak(welcomeVoicePrompt, {
      voiceId: geminiVoiceManager.getSelectedVoiceId(),
    });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const text = manualInput.trim();
    setManualInput('');
    handleInteractiveAI(text);
  };

  return (
    <>
      {/* POCKET OLED FULLSCREEN SHIELD (ZERO LIGHT, BATTERY SAVING FOR POCKET USE) */}
      {isPocketOledActive && (
        <div
          onClick={() => {
            hapticFeedback.tactileClick();
            setIsPocketOledActive(false);
          }}
          className="fixed inset-0 z-50 bg-black text-neutral-600 flex flex-col justify-between p-8 select-none cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-mono text-neutral-700 border-b border-neutral-900 pb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-400 font-bold uppercase tracking-wider">
                POCKET MODE ACTIVE · ZERO TOUCH
              </span>
            </div>
            <span>TAP ANYWHERE TO UNLOCK SCREEN</span>
          </div>

          <div className="text-center space-y-4 my-auto">
            <div className="inline-flex p-4 rounded-full bg-neutral-950 border border-neutral-900 text-neutral-600">
              <Headphones className="w-12 h-12 text-emerald-400/80 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-mono text-neutral-300 uppercase tracking-widest font-bold">
                Phone in Pocket · Earphones Active
              </h2>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Speak directly into your earphones: "What should I do?", "How should I proceed?", or "I found the items".
              </p>
            </div>

            {/* Movement Status HUD in pocket */}
            <div className="inline-flex items-center gap-4 px-4 py-2 rounded-xl bg-neutral-950 border border-neutral-900 text-xs font-mono">
              <span className={telemetry.state === 'MOVING' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                STATUS: {telemetry.state === 'MOVING' ? '🏃 IN MOTION' : '🛑 AT REST'}
              </span>
              <span className="text-neutral-700">|</span>
              <span className="text-neutral-400">{telemetry.stepCount} STEPS</span>
              <span className="text-neutral-700">|</span>
              <span className="text-neutral-400">{telemetry.distanceCoveredMeters}m</span>
            </div>

            {isAiThinking && (
              <div className="flex items-center justify-center gap-2 text-xs font-mono text-emerald-400 animate-pulse">
                <Brain className="w-4 h-4 animate-spin" />
                <span>{activeVoice.name} is thinking...</span>
              </div>
            )}
          </div>

          <div className="text-center text-[11px] font-mono text-neutral-800">
            Acoustic Earphone Transceiver · Tap screen to exit OLED mode
          </div>
        </div>
      )}

      {/* MAIN HANDS-FREE VOICE EXPEDITION HUD CARD */}
      <div className="relative overflow-hidden rounded-3xl bg-stone-900/95 backdrop-blur-xl border border-stone-800 text-stone-100 shadow-2xl p-6 lg:p-7 space-y-6">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        {/* Top Header: Voice Companion Identity & Audio Status */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-800/80 relative z-10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-stone-800 to-amber-500/20 border border-emerald-500/40 flex items-center justify-center text-2xl shadow-lg">
                {activeVoice.avatarEmoji || '🥾'}
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-stone-900 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-lg text-white tracking-tight">
                  {activeVoice.name}
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 text-[10px] font-mono uppercase tracking-wider font-semibold">
                  {activeVoice.role}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-mono">
                  Gemini Neural Voice
                </span>
              </div>
              <p className="text-xs text-stone-400 font-mono">
                Interactive AI Earphone Guide · Zero Touch Needed
              </p>
            </div>
          </div>

          {/* Real-time Listening / Thinking State Pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {isAiThinking ? (
              <div className="px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-600/70 text-amber-300 flex items-center gap-2 animate-pulse shadow-sm">
                <Brain className="w-4 h-4 animate-spin text-amber-400" />
                <span className="font-bold">{activeVoice.name} Thinking...</span>
              </div>
            ) : voiceState.isListening ? (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 flex items-center gap-2 shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold">EARPHONE MIC LISTENING</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-stone-800/80 border border-stone-700 text-stone-400 flex items-center gap-2">
                <MicOff className="w-4 h-4" />
                <span>STANDBY</span>
              </div>
            )}

            <button
              onClick={() => {
                hapticFeedback.tactileClick();
                setIsPocketOledActive(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-white border border-stone-700 text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer"
              title="Dim screen completely to put in pocket"
            >
              <Smartphone className="w-3.5 h-3.5 text-stone-400" />
              <span>POCKET OLED</span>
            </button>
          </div>
        </div>

        {/* Real-Time Movement Guidance Telemetry Deck */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              telemetry.state === 'MOVING'
                ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-200'
                : 'bg-amber-950/30 border-amber-600/40 text-amber-200'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-mono opacity-80 mb-1">
              <span>PHYSICAL STATE</span>
              {telemetry.state === 'MOVING' ? (
                <Footprints className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>
            <div className="text-base font-bold font-mono tracking-tight flex items-center gap-1.5">
              <span>{telemetry.state === 'MOVING' ? '🏃 IN MOTION' : '🛑 AT REST'}</span>
            </div>
            <div className="text-[11px] font-mono text-stone-400 mt-0.5">
              {telemetry.state === 'MOVING'
                ? `${telemetry.speedMps} m/s pacing`
                : 'Guide gives stationary prompts'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-stone-950/60 border border-stone-800">
            <div className="text-[11px] font-mono text-stone-400 mb-1 flex items-center justify-between">
              <span>DISTANCE COVERED</span>
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-base font-bold font-mono text-white">
              {telemetry.distanceCoveredMeters}m
            </div>
            <div className="text-[11px] font-mono text-stone-400 mt-0.5">
              {telemetry.stepCount} steps logged
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-stone-950/60 border border-stone-800">
            <div className="text-[11px] font-mono text-stone-400 mb-1 flex items-center justify-between">
              <span>LOCALITY SECTOR</span>
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            </div>
            <div className="text-sm font-bold font-mono text-white truncate">
              {telemetry.localityName || 'Local Sector'}
            </div>
            <div className="text-[11px] font-mono text-stone-400 mt-0.5 truncate">
              GPS Google Maps Linked
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-stone-950/60 border border-stone-800">
            <div className="text-[11px] font-mono text-stone-400 mb-1 flex items-center justify-between">
              <span>ACTIVE TARGET</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-sm font-bold font-mono text-emerald-400 truncate">
              {activeWaypoint ? activeWaypoint.name : mission ? mission.title : 'Woodland Scavenger'}
            </div>
            <div className="text-[11px] font-mono text-stone-400 mt-0.5">
              {activeWaypoint ? `${activeWaypoint.distanceMeters}m bearing` : 'Explore locality'}
            </div>
          </div>
        </div>

        {/* PRIMARY ACTION TRIGGER: START EXPEDITION (PHONE IN POCKET) */}
        {!hasStartedExpedition && (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-stone-900 to-emerald-950/60 border-2 border-emerald-500/60 shadow-xl space-y-3 relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Headphones className="w-5 h-5 text-emerald-400 animate-pulse" />
                  <h4 className="font-display font-bold text-base text-white">
                    Ready for Hands-Free Expedition?
                  </h4>
                </div>
                <p className="text-xs text-stone-300 font-mono">
                  Put on your earphones, place your phone in your pocket, and start moving.
                  All guidance is verbal — talk to {activeVoice.name} directly.
                </p>
              </div>

              <button
                onClick={handleStartExpedition}
                className="px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-mono font-bold text-xs uppercase tracking-wider shadow-[0_4px_16px_rgba(16,185,129,0.35)] transition-all flex items-center gap-2 select-none cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-stone-950" />
                <span>START EXPEDITION (PHONE IN POCKET)</span>
              </button>
            </div>
          </div>
        )}

        {/* LIVE INTERACTIVE AI SUGGESTION CHIPS (ONE-CLICK OR SPOKEN ALOUD) */}
        <div className="space-y-2 relative z-10">
          <div className="flex items-center justify-between text-xs font-mono text-stone-400">
            <span className="flex items-center gap-1.5 text-stone-300 font-semibold">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              SPOKEN VOICE COMMANDS & QUESTIONS (SPEAK INTO MIC OR TAP TO TEST):
            </span>
            <span className="text-[11px] text-stone-500">Interactive AI Powered</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              {
                text: 'What should I do how should proceed with it',
                label: '🎯 What should I do? How should I proceed?',
              },
              {
                text: 'Where do I find the scavenger items for this craft',
                label: '🍃 Where do I find the items?',
              },
              {
                text: telemetry.state === 'MOVING'
                  ? 'I am walking right now, guide me to the next waypoint'
                  : 'I am at rest right now, what should I look for here',
                label: telemetry.state === 'MOVING'
                  ? '🚶 Guide me while walking'
                  : '🛑 At rest: what to observe?',
              },
              {
                text: 'Where am I in my locality and how far is the waypoint',
                label: '📍 Where am I & distance?',
              },
              {
                text: 'I found the natural items task completed',
                label: '✨ I found the items! Mark complete',
              },
              {
                text: 'Give me an outdoor naturalist tip about this area',
                label: '🌲 Naturalist observation tip',
              },
            ].map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleInteractiveAI(chip.text)}
                disabled={isAiThinking}
                className="px-3 py-2 rounded-xl bg-stone-950/80 hover:bg-stone-800 active:bg-stone-700 text-stone-300 hover:text-white border border-stone-800 hover:border-emerald-500/50 text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ACOUSTIC COMM CHANNEL: PUSH-TO-TALK / MANUAL QUERY FIELD */}
        <div className="space-y-2 relative z-10">
          <form
            onSubmit={handleManualSubmit}
            className="flex items-center gap-2 p-1.5 rounded-2xl bg-stone-950 border border-stone-800 focus-within:border-emerald-500/70 transition-all shadow-inner"
          >
            <button
              type="button"
              onClick={() => voiceRecognitionService.toggleListening()}
              className={`p-3 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                voiceState.isListening
                  ? 'bg-emerald-600 text-stone-950 animate-pulse shadow-md'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200'
              }`}
              title={voiceState.isListening ? 'Microphone listening' : 'Start microphone'}
            >
              {voiceState.isListening ? (
                <Mic className="w-4 h-4 text-stone-950" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
            </button>

            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder={`Ask ${activeVoice.name} verbally into your mic, or type questions here...`}
              disabled={isAiThinking}
              className="flex-1 bg-transparent px-3 py-2 text-xs font-mono text-stone-100 placeholder:text-stone-500 outline-none"
            />

            <button
              type="submit"
              disabled={!manualInput.trim() || isAiThinking}
              className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-600 text-stone-950 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title="Transmit query to AI Guide"
            >
              {isAiThinking ? (
                <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
              ) : (
                <Send className="w-4 h-4 text-stone-950" />
              )}
            </button>
          </form>

          {/* Live Mic Audio Meter & Hearing Feedback */}
          {voiceState.isListening && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-xs font-mono text-emerald-400">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5, 6].map((i) => {
                    const active = (voiceState.audioLevel || 0) > i * 14;
                    return (
                      <div
                        key={i}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          active ? 'h-3 bg-emerald-400' : 'h-1 bg-stone-700'
                        }`}
                      />
                    );
                  })}
                </div>
                <span className="text-[11px] font-bold">
                  {voiceState.audioLevel > 14 ? 'Receiving sound...' : 'Mic active · speak to guide'}
                </span>
              </div>
              <span className="text-[10px] text-stone-500 font-mono">
                {voiceState.engineSource === 'web-speech' ? 'Web Speech Engine' : 'Gemini Multimodal Audio'}
              </span>
            </div>
          )}

          {/* Live Interim Transcript Bubble */}
          {voiceState.interimTranscript && (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 text-xs font-mono flex items-center gap-2 animate-pulse">
              <Mic className="w-3.5 h-3.5" />
              <span>Hearing you: "{voiceState.interimTranscript}"</span>
            </div>
          )}
        </div>

        {/* CONVERSATION TRANSCEIVER LOG: THOUGHTS & SPOKEN AUDIO RESPONSES */}
        <div className="space-y-3 relative z-10 pt-2 border-t border-stone-800/80">
          <div className="flex items-center justify-between text-xs font-mono text-stone-400">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              ACOUSTIC COMM TRANSCRIPT & GUIDE REASONING:
            </span>
            <span>{voiceLog.length} communications</span>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1">
            {voiceLog.length === 0 ? (
              <div className="p-4 rounded-xl bg-stone-950/40 border border-stone-800/60 text-center text-xs font-mono text-stone-500">
                Awaiting first voice command. Say "What should I do?" or "How should I proceed?" to interact with {activeVoice.name}.
              </div>
            ) : (
              voiceLog.map((log) => (
                <div
                  key={log.id}
                  className={`p-3.5 rounded-2xl border text-xs font-mono transition-all space-y-1.5 ${
                    log.sender === 'user'
                      ? 'bg-stone-950/90 border-stone-800 text-stone-200'
                      : 'bg-emerald-950/30 border-emerald-700/50 text-emerald-100 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] opacity-75">
                    <span className="font-bold flex items-center gap-1.5">
                      {log.sender === 'user' ? (
                        <>
                          <span>🗣️ Explorer</span>
                        </>
                      ) : (
                        <>
                          <span>{activeVoice.avatarEmoji || '🥾'} {activeVoice.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-900/60 text-emerald-300">
                            Voice Synthesized
                          </span>
                        </>
                      )}
                    </span>
                    <span className="text-stone-500">{log.time}</span>
                  </div>

                  {/* AI Internal Thought Display */}
                  {log.thought && log.sender === 'guide' && (
                    <div className="p-2 rounded-xl bg-stone-950/70 border border-stone-800/80 text-[11px] text-amber-300/90 flex items-start gap-1.5">
                      <Brain className="w-3.5 h-3.5 mt-0.5 text-amber-400 flex-shrink-0" />
                      <span>{log.thought}</span>
                    </div>
                  )}

                  {/* Spoken Text with Listen Replay Button */}
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-stone-100 font-sans text-sm leading-relaxed">
                      {log.text}
                    </p>

                    {log.sender === 'guide' && (
                      <button
                        onClick={() => {
                          hapticFeedback.tactileClick();
                          geminiVoiceManager.speak(log.text, {
                            voiceId: activeVoice.voice_id,
                          });
                        }}
                        className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-emerald-400 border border-stone-800 transition-colors flex-shrink-0 cursor-pointer"
                        title="Replay through earphones"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};
