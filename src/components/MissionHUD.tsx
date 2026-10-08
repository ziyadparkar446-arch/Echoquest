import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Headphones,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Camera,
  RefreshCw,
  SlidersHorizontal,
  Play,
  Square,
  CheckCircle2,
  Brain,
  Smartphone,
  Flame,
  ArrowRight,
  Shield,
  Radio,
  Footprints,
  MapPin,
  Compass,
  X,
  Send
} from 'lucide-react';
import { CharacterGender, OutfitColor } from '../types';
import { CharacterCanvas } from './CharacterCanvas';
import { PhotoScavengerModal } from './PhotoScavengerModal';
import { StickerBookModal, StickerEntry } from './StickerBookModal';
import {
  geminiVoiceManager,
  HumanVoice,
  HUMAN_VOICES,
  PlaybackState
} from '../services/geminiVoiceService';
import { InteractiveVoiceModal } from './InteractiveVoiceModal';
import {
  GeneratedMission,
  generateOutdoorMission,
  getCurrentTimeOfDay,
  DailyNatureChallenge
} from '../services/geminiMissionService';
import {
  movementTrackingService,
  MovementTelemetry
} from '../services/movementTrackingService';
import {
  voiceRecognitionService,
  VoiceRecognitionState,
  RecognizedVoiceCommand
} from '../services/voiceRecognitionService';
import { LocalityGoogleMap, LocalityWaypoint } from './LocalityGoogleMap';
import { hapticFeedback } from '../utils/haptics';

interface MissionHUDProps {
  gender: CharacterGender;
  outfitColor?: OutfitColor;
  explorerName: string;
  isWalking: boolean;
  setIsWalking: (walking: boolean) => void;
  onOpenPocketMode: () => void;
  onBackToCharacterSelect: () => void;
  onOpenDailyChallenges?: () => void;
  onOpenStickers?: () => void;
  unlockedStickers: StickerEntry[];
  setUnlockedStickers: React.Dispatch<React.SetStateAction<StickerEntry[]>>;
  currentLevel: number;
  setCurrentLevel: React.Dispatch<React.SetStateAction<number>>;
  totalXp: number;
  setTotalXp: React.Dispatch<React.SetStateAction<number>>;
  dailyChallenges?: DailyNatureChallenge[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  thought?: string;
  timestamp: number;
}

export const MissionHUD: React.FC<MissionHUDProps> = ({
  gender,
  outfitColor = 'charcoal',
  explorerName,
  isWalking,
  setIsWalking,
  onOpenPocketMode,
  onBackToCharacterSelect,
  onOpenDailyChallenges,
  onOpenStickers,
  unlockedStickers,
  setUnlockedStickers,
  currentLevel,
  setCurrentLevel,
  totalXp,
  setTotalXp,
  dailyChallenges = [],
}) => {
  // Modals
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isStickerBookModalOpen, setIsStickerBookModalOpen] = useState(false);
  const [isVoicePickerModalOpen, setIsVoicePickerModalOpen] = useState(false);

  // Audio Playback & Active Speaker State
  const [playbackState, setPlaybackState] = useState<PlaybackState>(
    geminiVoiceManager.getState()
  );
  const [activeVoice, setActiveVoice] = useState<HumanVoice>(
    geminiVoiceManager.getSelectedVoice()
  );
  const isPlayingAudio = playbackState.status === 'playing';

  useEffect(() => {
    const unsub = geminiVoiceManager.subscribe((state) => {
      setPlaybackState(state);
      setActiveVoice(geminiVoiceManager.getSelectedVoice());
    });
    return () => unsub();
  }, []);

  // Movement Telemetry (Runs in background)
  const [telemetry, setTelemetry] = useState<MovementTelemetry>(
    movementTrackingService.getTelemetry()
  );

  useEffect(() => {
    const unsub = movementTrackingService.subscribe((t) => {
      setTelemetry(t);
      setIsWalking(t.state === 'MOVING');
    });
    return () => unsub();
  }, [setIsWalking]);

  // Movement auto-verbal cues into earphones (Registered once, no leak)
  useEffect(() => {
    const unsubPrompts = movementTrackingService.onVerbalPrompt((promptText, reason) => {
      geminiVoiceManager.speak(promptText, {
        voiceId: geminiVoiceManager.getSelectedVoiceId(),
      });
      setLatestAgentSpeech(promptText);
      setLatestAgentThought(`Movement guidance: ${reason}`);
    });
    return () => unsubPrompts();
  }, []);

  // GPS Nature Waypoints for Locality Google Map
  const [localWaypoints, setLocalWaypoints] = useState<LocalityWaypoint[]>([]);
  const [activeWaypoint, setActiveWaypoint] = useState<LocalityWaypoint | null>(null);

  useEffect(() => {
    const baseLat = telemetry.latitude || 37.7749;
    const baseLng = telemetry.longitude || -122.4194;

    const initialWaypoints: LocalityWaypoint[] = [
      {
        id: 'wp-dragon-1',
        name: 'Broad Fallen Leaves Cache',
        category: 'Botanical',
        description: 'Look beneath shaded oak or maple canopy for broad fallen leaves.',
        audioPrompt: 'Find two broad fallen leaves on the ground for your craft dragon wings.',
        lat: baseLat + 0.0006,
        lng: baseLng + 0.0008,
        icon: '🍃',
        completed: false,
        distanceMeters: 75,
      },
      {
        id: 'wp-dragon-2',
        name: 'Curved Twig Haven',
        category: 'Canopy',
        description: 'Search near fallen branches for a sturdy, curved dry twig.',
        audioPrompt: 'Pick up one curved twig about the length of your hand for the dragon spine.',
        lat: baseLat - 0.0005,
        lng: baseLng + 0.0007,
        icon: '🪵',
        completed: false,
        distanceMeters: 60,
      },
      {
        id: 'wp-dragon-3',
        name: 'Polished River Pebbles',
        category: 'Geo',
        description: 'Locate two smooth round pebbles on the path.',
        audioPrompt: 'Gather two smooth pebbles from the soil to serve as glowing dragon eyes.',
        lat: baseLat + 0.0003,
        lng: baseLng - 0.0009,
        icon: '🪨',
        completed: false,
        distanceMeters: 90,
      },
    ];

    setLocalWaypoints(initialWaypoints);
    setActiveWaypoint(initialWaypoints[0]);
  }, [telemetry.isGpsActive]);

  const handleWaypointCompleted = (id: string) => {
    setLocalWaypoints((prev) =>
      prev.map((wp) => (wp.id === id ? { ...wp, completed: true } : wp))
    );
    setTotalXp((prev) => prev + 150);
  };

  // Active Outdoor Mission
  const [activeMission, setActiveMission] = useState<GeneratedMission>({
    id: 'mission-dragon-default',
    title: 'The Forest Leaf Dragon',
    objective: 'Gather natural items and craft a miniature dragon on the soil.',
    audioScript:
      'Listen closely explorer. Scan the ground around your feet. Find two broad fallen leaves, a sturdy twig, and two smooth pebbles. Assemble a forest dragon on the earth, then snap a photo for your Field Codex!',
    biome: 'Redwood & Oak Woodland',
    timeOfDay: 'Afternoon',
    scavengerItems: [
      '2x Broad Leaves (Wings)',
      '1x Curved Twig (Spine)',
      '2x River Pebbles (Eyes)',
    ],
    craftInstructions:
      'Lay the curved twig flat as the dragon spine. Place the two broad leaves on either side as wings. Crown the top with two pebbles as dragon eyes!',
    targetLandmark: 'Ancient Canopy Clearing',
    targetDistanceMeters: 180,
    targetBearingDegrees: 335,
    rewardXp: 350,
    stickerReward: {
      id: 'stk-dragon',
      name: 'Verdant Leaf Dragon',
      rarity: 'Mythic',
      badgeEmoji: '🐉',
      lore: 'A gentle woodland guardian crafted on the soil from autumn leaves and river pebbles.',
    },
  });

  const [isGeneratingMission, setIsGeneratingMission] = useState(false);

  // =========================================================================
  // VOICE & INTERACTIVE AGENT WORKFLOW STATE
  // =========================================================================
  const [isExpeditionStarted, setIsExpeditionStarted] = useState(false);
  const [voiceRecognitionState, setVoiceRecognitionState] = useState<VoiceRecognitionState>(
    voiceRecognitionService.getState()
  );
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [latestUserQuery, setLatestUserQuery] = useState<string>('');
  const [latestAgentThought, setLatestAgentThought] = useState<string>(
    'Standing by. Ready to think and answer your outdoor questions.'
  );
  const [latestAgentSpeech, setLatestAgentSpeech] = useState<string>(
    'Keep your phone in your pocket and wear your earphones. Speak to me anytime to ask what to do or how to proceed.'
  );
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [samplePlayingVoiceId, setSamplePlayingVoiceId] = useState<string | null>(null);
  const [focusLocationTrigger, setFocusLocationTrigger] = useState(0);
  const [textQuery, setTextQuery] = useState('');
  const mapSectionRef = useRef<HTMLDivElement | null>(null);

  const isProcessingRef = useRef(false);

  // Subscribe to voice recognition
  useEffect(() => {
    const unsub = voiceRecognitionService.subscribe((state) => {
      setVoiceRecognitionState(state);
    });
    return () => unsub();
  }, []);

  // Main voice agent reasoning & response workflow (Thoughtful, Anti-Repetitive)
  const handleInteractiveVoiceQuery = async (queryText: string) => {
    if (!queryText.trim() || isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      hapticFeedback.buttonPress();
      setLatestUserQuery(queryText);
      setIsAiThinking(true);
      setLatestAgentThought(`Thinking carefully about: "${queryText}"...`);

      const isLocationQuery =
        queryText.toLowerCase().includes('location') ||
        queryText.toLowerCase().includes('where am i') ||
        queryText.toLowerCase().includes('where are we') ||
        queryText.toLowerCase().includes('locate me') ||
        queryText.toLowerCase().includes('coordinates') ||
        queryText.toLowerCase().includes('show me');

      let currentLat = telemetry.latitude;
      let currentLng = telemetry.longitude;

      if (isLocationQuery) {
        try {
          const fresh = await movementTrackingService.requestCurrentLocation();
          currentLat = fresh.lat;
          currentLng = fresh.lng;
          setFocusLocationTrigger((prev) => prev + 1);
          setTimeout(() => {
            mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        } catch (_) {}
      }

      const currentVoice = geminiVoiceManager.getSelectedVoice();
      const recentHistory = conversationHistory.slice(-4).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const response = await fetch('/api/voice-guide/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          guideVoiceId: currentVoice.voice_id,
          guideName: currentVoice.name,
          guideRole: currentVoice.role,
          telemetry: {
            state: telemetry.state,
            speedMps: telemetry.speedMps,
            distanceCoveredMeters: telemetry.distanceCoveredMeters,
            stepCount: telemetry.stepCount,
            headingDegrees: telemetry.headingDegrees,
            localityName: telemetry.localityName,
            activeMovementTask: telemetry.activeMovementTask,
            latitude: currentLat,
            longitude: currentLng,
          },
          mission: {
            title: activeMission.title,
            objective: activeMission.objective,
            scavengerItems: activeMission.scavengerItems,
            craftInstructions: activeMission.craftInstructions,
            biome: activeMission.biome,
            timeOfDay: activeMission.timeOfDay,
          },
          activeWaypoint: activeWaypoint
            ? {
                name: activeWaypoint.name,
                description: activeWaypoint.description,
                category: activeWaypoint.category,
                distanceMeters: activeWaypoint.distanceMeters,
              }
            : null,
          history: recentHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const thought = data.thought || 'Assessed outdoor question against surroundings.';
      const spokenText =
        data.spokenText ||
        `Understood Explorer. You are currently ${
          telemetry.state === 'MOVING' ? 'moving' : 'standing at rest'
        }. Search the ground for your craft items.`;
      const action = data.action || 'NONE';

      setLatestAgentThought(thought);
      setLatestAgentSpeech(spokenText);

      // Save to conversation history to avoid repetition
      setConversationHistory((prev) => [
        ...prev.slice(-6),
        { role: 'user', text: queryText, timestamp: Date.now() },
        { role: 'assistant', text: spokenText, thought, timestamp: Date.now() },
      ]);

      // Speak directly into user's earphones via Gemini Neural Voice
      await geminiVoiceManager.speak(spokenText, {
        voiceId: currentVoice.voice_id,
      });

      if (action === 'SHOW_LOCATION' || isLocationQuery) {
        setFocusLocationTrigger((prev) => prev + 1);
        mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (action === 'COMPLETE_TASK') {
        hapticFeedback.missionComplete();
        if (activeWaypoint) {
          handleWaypointCompleted(activeWaypoint.id);
        }
      } else if (action === 'POCKET_MODE') {
        onOpenPocketMode();
      }
    } catch (err) {
      console.error('Interactive voice error:', err);
      const fallback = `Copy that. You are ${
        telemetry.state === 'MOVING' ? 'moving along the trail' : 'standing still'
      }. Check the soil for broad leaves and dry twigs to assemble the dragon.`;
      setLatestAgentSpeech(fallback);
      setLatestAgentThought('Contextual offline fallback applied');
      await geminiVoiceManager.speak(fallback);
    } finally {
      setIsAiThinking(false);
      isProcessingRef.current = false;
    }
  };

  // Register hands-free verbal commands
  useEffect(() => {
    const unregister = voiceRecognitionService.registerCommandHandler(
      async (cmd: RecognizedVoiceCommand) => {
        if (cmd.intent === 'START_EXPEDITION') {
          handleToggleExpedition(true);
          return;
        }
        if (cmd.intent === 'STOP_EXPEDITION') {
          handleToggleExpedition(false);
          return;
        }
        if (cmd.intent === 'POCKET_MODE') {
          onOpenPocketMode();
          return;
        }

        // All questions and natural phrases route to interactive AI
        await handleInteractiveVoiceQuery(cmd.transcript);
      }
    );
    return () => unregister();
  }, [telemetry, activeMission, activeWaypoint, conversationHistory]);

  // =========================================================================
  // USER ACTIONS: START EXPEDITION, REPLAY AUDIO, SPEAKER CHANGE
  // =========================================================================

  const handleToggleExpedition = async (forceStart?: boolean) => {
    hapticFeedback.startPlaying();
    const shouldStart = forceStart !== undefined ? forceStart : !isExpeditionStarted;

    movementTrackingService.setExpeditionActive(shouldStart);

    if (shouldStart) {
      setIsExpeditionStarted(true);
      await voiceRecognitionService.startListening();

      const startPrompt =
        'Expedition protocol initiated. Keep your phone in your pocket and wear your earphones. I am tracking your movement. All guidance is verbal. Speak to me anytime to ask what to do or how to proceed.';

      setLatestAgentSpeech(startPrompt);
      setLatestAgentThought('Initial outdoor briefing broadcasted to earphones');

      await geminiVoiceManager.speak(startPrompt, {
        voiceId: activeVoice.voice_id,
      });
    } else {
      setIsExpeditionStarted(false);
      voiceRecognitionService.stopListening();
      geminiVoiceManager.stop();
      const pausePrompt = 'Expedition paused. Microphones are now on standby.';
      setLatestAgentSpeech(pausePrompt);
      setLatestAgentThought('Expedition placed on standby');
      await geminiVoiceManager.speak(pausePrompt);
    }
  };

  const handlePlayLatestSpeech = async () => {
    hapticFeedback.tactileClick();
    if (isPlayingAudio) {
      geminiVoiceManager.stop();
    } else {
      await geminiVoiceManager.speak(latestAgentSpeech, {
        voiceId: activeVoice.voice_id,
      });
    }
  };

  // Speaker change handler with instant audio sample preview
  const handleSelectSpeaker = async (voice: HumanVoice) => {
    hapticFeedback.tactileClick();
    geminiVoiceManager.setSelectedVoiceId(voice.voice_id);
    setActiveVoice(voice);

    // Play quick introduction sample in this guide's voice
    setSamplePlayingVoiceId(voice.voice_id);
    try {
      const sampleText =
        voice.preview_prompt ||
        `Greetings explorer. I am ${voice.name}, your ${voice.role}. I will guide you outdoors through your earphones.`;
      setLatestAgentSpeech(sampleText);
      setLatestAgentThought(`Switched active speaker to ${voice.name}`);
      await geminiVoiceManager.speak(sampleText, {
        voiceId: voice.voice_id,
      });
    } finally {
      setSamplePlayingVoiceId(null);
    }
  };

  // Gemini AI New Mission Generator
  const handleGenerateGeminiMission = async () => {
    setIsGeneratingMission(true);
    try {
      hapticFeedback.buttonPress();
      const newMission = await generateOutdoorMission({
        biome: activeMission.biome,
        timeOfDay: getCurrentTimeOfDay(),
        difficulty: 'Adventurer',
      });
      setActiveMission(newMission);
      const announce = `New expedition mission received: ${newMission.title}. ${newMission.audioScript}`;
      setLatestAgentSpeech(announce);
      setLatestAgentThought('New mission received from Gemini Game Master');
      await geminiVoiceManager.speak(announce, {
        voiceId: activeVoice.voice_id,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingMission(false);
    }
  };

  // Complete mission with photo craft
  const handleMissionCompleted = (photoDataUrl: string) => {
    hapticFeedback.missionCompleted();
    setIsPhotoModalOpen(false);
    setTotalXp((prev) => prev + activeMission.rewardXp);
    setCurrentLevel((prev) => Math.min(prev + 1, 7));

    const newSticker: StickerEntry = {
      id: `stk-${Date.now()}`,
      name: activeMission.stickerReward.name,
      badgeEmoji: activeMission.stickerReward.badgeEmoji,
      rarity: activeMission.stickerReward.rarity,
      category: 'craft',
      biome: activeMission.biome,
      dateUnlocked: 'Just Now',
      lore: activeMission.stickerReward.lore,
      ingredients: activeMission.scavengerItems,
      photoUrl: photoDataUrl,
      xpEarned: activeMission.rewardXp,
    };

    setUnlockedStickers((prev) => [newSticker, ...prev]);
    if (onOpenStickers) {
      onOpenStickers();
    } else {
      setIsStickerBookModalOpen(true);
    }
  };

  return (
    <div className="relative z-10 w-full max-w-4xl mx-auto px-3 sm:px-6 py-3 sm:py-6 space-y-5 select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* =========================================================================
          HERO STATUS STRIP: CLEAN GAME STATS + COMPACT SPEAKER POP BOX BUTTON
          ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 sm:p-3.5 bg-stone-300/75 backdrop-blur-md rounded-2xl border border-stone-400/50 shadow-inner">
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 font-bold text-stone-900">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isExpeditionStarted ? 'bg-emerald-600 animate-pulse' : 'bg-stone-500'
              }`}
            />
            <span className="text-[11px] sm:text-xs">
              {isExpeditionStarted ? 'EXPEDITION LIVE' : 'EXPEDITION READY'}
            </span>
          </div>
          <span className="text-stone-400">/</span>
          <span className="text-stone-700 text-[11px] sm:text-xs">
            <strong>{explorerName}</strong>
          </span>
          <span className="hidden sm:inline text-stone-400">/</span>
          <span className="hidden sm:inline font-bold text-stone-900 text-xs">
            Stage {currentLevel}/7
          </span>
          <span className="hidden sm:inline text-stone-400">/</span>
          <span className="hidden sm:inline font-bold text-emerald-800 text-xs tabular-nums">
            {totalXp} XP
          </span>
        </div>

        {/* Action Controls: Compact Speaker Pop Box & Pocket Mode */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* COMPACT SPEAKER SWITCH BUTTON (OPENS SMALL POP BOX FOR MOBILE) */}
          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              setIsVoicePickerModalOpen(true);
            }}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-stone-200/90 hover:bg-stone-300 text-stone-900 font-mono text-[11px] sm:text-xs font-bold border-t border-white/60 shadow-[0_2px_0_0_#a8a29e] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
            title="Change voice speaker in popup box"
          >
            <span>{activeVoice.avatarEmoji || '🌲'}</span>
            <span className="hidden xs:inline">{activeVoice.name}</span>
            <SlidersHorizontal className="w-3 h-3 text-stone-500" />
          </button>

          {/* Pocket Mode Quick Dim */}
          <button
            onClick={onOpenPocketMode}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-50 font-mono text-[11px] sm:text-xs font-bold border-t border-stone-600 shadow-[0_2px_0_0_#0c0a09] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden xs:inline">POCKET</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          HERO 3D EXPLORER AVATAR VIEWPORT (MATCHES PAGE 1 AESTHETIC)
          ========================================================================= */}
      <div className="relative w-full h-[220px] sm:h-[280px] mx-auto flex items-center justify-center rounded-3xl overflow-hidden bg-stone-300/40 border border-stone-400/40 shadow-inner">
        <CharacterCanvas
          gender={gender}
          outfitColor={outfitColor}
          isWalking={isWalking}
          gamePage="playing"
        />

        {/* Ambient Overlay Tag */}
        <div className="absolute bottom-3 left-3 sm:left-4 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-900/85 backdrop-blur-md text-stone-50 text-[11px] font-mono border border-stone-700/50">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Explorer {explorerName}</span>
          <span className="text-stone-400">·</span>
          <span>{isWalking ? '🏃 Walking' : '🛑 Stationary'}</span>
        </div>
      </div>

      {/* =========================================================================
          1. BRIEF TASK INFO (MINIMAL TEXT · 3D PHYSICAL CARD)
          ========================================================================= */}
      <section className="p-4 sm:p-6 rounded-3xl bg-stone-100/95 border border-stone-300/80 shadow-[0_6px_0_0_#d6d3d1] space-y-3.5">
        {/* Header with Title and AI Re-roll */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-stone-300/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-stone-900 text-emerald-400 flex items-center justify-center font-bold text-base shadow-sm">
              🎯
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-emerald-800 tracking-wider">
                CURRENT EXPEDITION TASK
              </span>
              <h2 className="text-lg sm:text-2xl font-display font-extrabold text-stone-900 tracking-tight leading-tight">
                {activeMission.title}
              </h2>
            </div>
          </div>

          <button
            onClick={handleGenerateGeminiMission}
            disabled={isGeneratingMission}
            className="px-2.5 py-1.5 rounded-xl bg-stone-200/90 hover:bg-stone-300 text-stone-800 font-mono text-[11px] sm:text-xs font-bold border-t border-white/60 shadow-[0_2px_0_0_#a8a29e] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-stone-600 ${isGeneratingMission ? 'animate-spin' : ''}`} />
            <span>{isGeneratingMission ? 'Generating...' : 'New Task (AI)'}</span>
          </button>
        </div>

        {/* 1-Sentence Brief Objective */}
        <p className="text-xs sm:text-sm font-mono text-stone-800 font-medium leading-relaxed bg-stone-200/70 p-2.5 sm:p-3 rounded-xl border border-stone-300/70">
          {activeMission.objective}
        </p>

        {/* Scavenger Items (Compact Horizontal Badges) */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono text-stone-500 uppercase font-semibold">
            Gather Items:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {activeMission.scavengerItems.map((item, idx) => (
              <div
                key={idx}
                className="p-2 sm:p-2.5 rounded-xl bg-stone-200/90 border border-stone-300 flex items-center gap-2 text-[11px] sm:text-xs font-mono font-medium text-stone-800"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                <span className="truncate">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reward & Craft Photo Button */}
        <div className="pt-1 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-stone-700 bg-stone-200/70 px-2.5 py-1.5 rounded-xl border border-stone-300">
            <span className="text-base">{activeMission.stickerReward.badgeEmoji}</span>
            <span>+{activeMission.rewardXp} XP · {activeMission.stickerReward.name}</span>
          </div>

          <button
            onClick={() => {
              hapticFeedback.buttonPress();
              setIsPhotoModalOpen(true);
            }}
            className="py-2.5 sm:py-3 px-4 rounded-xl font-mono text-xs font-bold uppercase tracking-wider bg-stone-900 hover:bg-stone-800 text-stone-50 border-t border-stone-600 shadow-[0_4px_0_0_#0c0a09] active:shadow-[0_1px_0_0_#0c0a09] active:translate-y-1 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Camera className="w-4 h-4 text-emerald-400" />
            <span>CRAFT ON SOIL & SNAP PHOTO</span>
          </button>
        </div>
      </section>

      {/* =========================================================================
          2. START EXPEDITION (PROMINENT TACTILE 3D ACTUATOR)
          ========================================================================= */}
      <section className="space-y-2">
        <button
          onClick={() => handleToggleExpedition()}
          className={`w-full py-3.5 sm:py-4 px-6 rounded-2xl font-display font-extrabold text-sm sm:text-base uppercase tracking-wider transition-all flex items-center justify-center gap-3 cursor-pointer select-none ${
            isExpeditionStarted
              ? 'bg-emerald-700 hover:bg-emerald-600 text-stone-50 border-t border-emerald-400 shadow-[0_6px_0_0_#064e3b] active:translate-y-1.5 active:shadow-[0_1px_0_0_#064e3b]'
              : 'bg-stone-900 hover:bg-stone-800 text-stone-50 border-t border-stone-600 shadow-[0_6px_0_0_#0c0a09] active:translate-y-1.5 active:shadow-[0_1px_0_0_#0c0a09]'
          }`}
        >
          {isExpeditionStarted ? (
            <>
              <Square className="w-4 h-4 text-emerald-300 fill-emerald-300 animate-pulse" />
              <span>EXPEDITION LIVE · TAP TO PAUSE</span>
            </>
          ) : (
            <>
              <Headphones className="w-5 h-5 text-emerald-400" />
              <span>START EXPEDITION · WEAR EARPHONES</span>
              <ArrowRight className="w-5 h-5 text-emerald-400 ml-auto" />
            </>
          )}
        </button>

        <p className="text-center text-[11px] font-mono text-stone-600">
          {isExpeditionStarted
            ? '🎧 Live voice beacon active in earphones · Phone stays in pocket · Zero hands required'
            : '💡 Wear your earphones, put your phone in your pocket, and start moving. All instructions are verbal.'}
        </p>
      </section>

      {/* =========================================================================
          3. VOICE: INTERACTIVE AI AGENT & WORKFLOW (HUMAN VOICE FOCUS & ANTI-REPETITION)
          ========================================================================= */}
      <section className="p-4 sm:p-6 rounded-3xl bg-stone-100/95 border border-stone-300/80 shadow-[0_6px_0_0_#d6d3d1] space-y-3.5">
        {/* Voice Agent Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-stone-300/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-stone-900 text-emerald-400 flex items-center justify-center font-bold text-sm shadow-sm">
              <Radio className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-emerald-800 tracking-wider">
                VOICE GUIDE
              </span>
              <h3 className="text-sm sm:text-base font-display font-extrabold text-stone-900">
                {activeVoice.name} · {activeVoice.role}
              </h3>
            </div>
          </div>

          {/* Live Agent Status Beacon */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-200/90 border border-stone-300 font-mono text-xs font-bold text-stone-800">
            {isAiThinking ? (
              <>
                <Brain className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                <span className="text-purple-700">THINKING PROPERLY...</span>
              </>
            ) : isPlayingAudio ? (
              <>
                <div className="flex items-center gap-0.5 h-3">
                  <span className="w-1 bg-emerald-600 h-2 animate-bounce" />
                  <span className="w-1 bg-emerald-600 h-3 animate-bounce delay-75" />
                  <span className="w-1 bg-emerald-600 h-1.5 animate-bounce delay-150" />
                </div>
                <span className="text-emerald-800">SPEAKING IN EAR</span>
              </>
            ) : voiceRecognitionState.isListening ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                <span className="text-emerald-800">LISTENING TO YOU</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-stone-500" />
                <span>VOICE STANDBY</span>
              </>
            )}
          </div>
        </div>

        {/* Spoken Speech Display & Agent Reasoning */}
        <div className="space-y-2">
          {latestUserQuery && (
            <div className="p-2.5 rounded-xl bg-stone-200/60 border border-stone-300/60 text-xs font-mono text-stone-700 flex items-start gap-2">
              <span className="font-bold text-stone-900 shrink-0">YOU ASKED:</span>
              <span>"{latestUserQuery}"</span>
            </div>
          )}

          <div className="p-3.5 rounded-2xl bg-stone-200/90 border border-stone-300 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-stone-500">
              <span className="flex items-center gap-1.5">
                <Brain className="w-3 h-3 text-stone-600" />
                <span>{latestAgentThought}</span>
              </span>
              <button
                onClick={handlePlayLatestSpeech}
                className="hover:text-stone-900 transition-colors font-bold flex items-center gap-1 cursor-pointer"
              >
                {isPlayingAudio ? (
                  <>
                    <VolumeX className="w-3 h-3 text-emerald-700" />
                    <span>STOP</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3 h-3 text-emerald-700" />
                    <span>REPLAY</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-xs sm:text-sm font-mono font-medium text-stone-900 leading-relaxed italic">
              "{latestAgentSpeech}"
            </p>
          </div>
        </div>

        {/* Voice Actuators: Push-to-Talk & Quick Spoken Commands */}
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => {
                hapticFeedback.buttonPress();
                voiceRecognitionService.toggleListening();
              }}
              className={`py-3 px-4 rounded-xl font-mono text-xs font-bold uppercase tracking-wider border-t transition-all flex items-center justify-center gap-2 cursor-pointer ${
                voiceRecognitionState.isListening
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-stone-50 border-emerald-400 shadow-[0_4px_0_0_#064e3b] active:translate-y-1'
                  : 'bg-stone-900 hover:bg-stone-800 text-stone-50 border-stone-600 shadow-[0_4px_0_0_#0c0a09] active:translate-y-1'
              }`}
            >
              {voiceRecognitionState.isListening ? (
                <>
                  <Mic className="w-4 h-4 text-stone-50 animate-bounce" />
                  <span>MIC LIVE · LISTENING TO YOU</span>
                </>
              ) : (
                <>
                  <MicOff className="w-4 h-4 text-stone-400" />
                  <span>TAP TO ACTIVATE MIC</span>
                </>
              )}
            </button>

            <button
              onClick={handlePlayLatestSpeech}
              className="py-3 px-4 rounded-xl font-mono text-xs font-bold uppercase tracking-wider bg-stone-200/90 hover:bg-stone-300 text-stone-800 border-t border-white/60 shadow-[0_2px_0_0_#a8a29e] active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Headphones className="w-4 h-4 text-emerald-700" />
              <span>{isPlayingAudio ? 'STOP AUDIO' : 'LISTEN IN EAR'}</span>
            </button>
          </div>

          {/* Live Mic Audio Meter & Hearing Feedback */}
          {voiceRecognitionState.isListening && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-600/40 text-xs font-mono text-emerald-900 animate-fadeIn">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5, 6].map((i) => {
                    const active = (voiceRecognitionState.audioLevel || 0) > i * 14;
                    return (
                      <div
                        key={i}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          active ? 'h-3.5 bg-emerald-600' : 'h-1.5 bg-stone-300'
                        }`}
                      />
                    );
                  })}
                </div>
                <span className="font-bold">
                  {voiceRecognitionState.audioLevel > 14 ? 'Receiving voice audio...' : 'Microphone open — speak freely'}
                </span>
              </div>
              {voiceRecognitionState.interimTranscript ? (
                <span className="italic text-emerald-700 max-w-[200px] truncate font-medium">
                  "{voiceRecognitionState.interimTranscript}"
                </span>
              ) : (
                <span className="text-[10px] text-stone-500 font-semibold">Gemini Audio Ready</span>
              )}
            </div>
          )}

          {/* Direct Text Question Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (textQuery.trim()) {
                handleInteractiveVoiceQuery(textQuery.trim());
                setTextQuery('');
              }
            }}
            className="flex items-center gap-2 pt-1"
          >
            <input
              type="text"
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              placeholder={`Ask ${activeVoice.name} verbally into mic, or type questions here...`}
              className="flex-1 px-3 py-2 text-xs font-mono rounded-xl bg-stone-100 border border-stone-300 text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-emerald-600 shadow-inner"
            />
            <button
              type="submit"
              disabled={!textQuery.trim() || isAiThinking}
              className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-stone-50 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>ASK</span>
            </button>
          </form>

          {/* Quick Verbal Question Chips */}
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-stone-500 uppercase font-semibold">
              Tap or Speak These Commands:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleInteractiveVoiceQuery('Where am I right now? Show my location on the map.')}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs font-mono border border-emerald-500 transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                📍 "Where am I? (Show My Location)"
              </button>
              {[
                'What should I do now?',
                'How should I proceed?',
                'Where do I find leaves?',
                'I finished crafting the dragon!',
              ].map((query, idx) => (
                <button
                  key={idx}
                  onClick={() => handleInteractiveVoiceQuery(query)}
                  className="px-2.5 py-1.5 rounded-lg bg-stone-200/80 hover:bg-stone-300 text-stone-700 text-xs font-mono border border-stone-300/80 transition-colors cursor-pointer"
                >
                  💬 "{query}"
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. LOCALITY GOOGLE MAP (BROUGHT BACK PER USER REQUEST)
          Shows real-world GPS location and nearby nature waypoints!
          ========================================================================= */}
      <section ref={mapSectionRef} className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-emerald-700" />
            <h3 className="font-display font-extrabold text-sm sm:text-base text-stone-900">
              Locality Outdoor Map (Google Maps)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                movementTrackingService.requestCurrentLocation();
                setFocusLocationTrigger((prev) => prev + 1);
              }}
              className="text-xs font-mono font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
            >
              🎯 Center My Position
            </button>
            <span className="text-xs font-mono text-stone-500">
              {localWaypoints.filter((w) => w.completed).length}/{localWaypoints.length} Waypoints
            </span>
          </div>
        </div>

        <LocalityGoogleMap
          telemetry={telemetry}
          activeWaypoint={activeWaypoint}
          waypoints={localWaypoints}
          onSelectWaypoint={(wp) => setActiveWaypoint(wp)}
          onWaypointCompleted={handleWaypointCompleted}
          focusLocationTrigger={focusLocationTrigger}
          onRequestLocation={() => setFocusLocationTrigger((prev) => prev + 1)}
        />
      </section>

      {/* =========================================================================
          INTERACTIVE AI VOICE COMPANION MODAL (GEMINI NEURAL VOICE STUDIO)
          ========================================================================= */}
      <InteractiveVoiceModal
        isOpen={isVoicePickerModalOpen}
        onClose={() => setIsVoicePickerModalOpen(false)}
        activeMissionScript={activeMission.audioScript}
      />

      {/* =========================================================================
          MODALS: PHOTO SCAVENGER & STICKER BOOK (OPENED ON DEMAND)
          ========================================================================= */}
      {isPhotoModalOpen && (
        <PhotoScavengerModal
          mission={activeMission}
          onClose={() => setIsPhotoModalOpen(false)}
          onMissionCompleted={handleMissionCompleted}
        />
      )}

      {isStickerBookModalOpen && (
        <StickerBookModal
          onClose={() => setIsStickerBookModalOpen(false)}
          unlockedStickers={unlockedStickers}
        />
      )}
    </div>
  );
};
