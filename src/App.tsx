import React, { useState, useEffect } from 'react';
import { CharacterCanvas } from './components/CharacterCanvas';
import { MissionHUD } from './components/MissionHUD';
import { DailyChallengesView } from './components/DailyChallengesView';
import { StickerAlbumView } from './components/StickerAlbumView';
import { PocketModeHUD } from './components/PocketModeHUD';
import { NatureTopoBackground } from './components/NatureTopoBackground';
import { WelcomeIntroOverlay } from './components/WelcomeIntroOverlay';
import { StickerEntry } from './components/StickerBookModal';
import { CharacterGender, OutfitColor, GamePage } from './types';
import { hapticFeedback } from './utils/haptics';
import { geminiVoiceManager } from './services/geminiVoiceService';
import { voiceRecognitionService } from './services/voiceRecognitionService';
import { LocalityGoogleMap, LocalityWaypoint } from './components/LocalityGoogleMap';
import {
  movementTrackingService,
  MovementTelemetry,
} from './services/movementTrackingService';
import {
  DailyNatureChallenge,
  fetchDailyNatureChallenges
} from './services/geminiMissionService';
import {
  ArrowRight,
  Smartphone,
  X,
  Compass,
  RotateCcw,
  Headphones,
  Sparkles,
  Award,
  BookOpen,
  Calendar,
  MapPin,
  LocateFixed,
  Radio,
} from 'lucide-react';

export default function App() {
  // Navigation & Page State (Explorer, Mission, Map, Daily Challenges, My Stickers)
  const [currentPage, setCurrentPage] = useState<GamePage>('welcome');
  const [isPocketModalOpen, setIsPocketModalOpen] = useState(false);

  // Real-time GPS movement telemetry
  const [telemetry, setTelemetry] = useState<MovementTelemetry>(
    movementTrackingService.getTelemetry()
  );
  const [mapFocusTrigger, setMapFocusTrigger] = useState(0);

  useEffect(() => {
    const unsub = movementTrackingService.subscribe((t) => {
      setTelemetry(t);
    });
    return () => unsub();
  }, []);

  // Welcome Intro Preloader
  const [showWelcomeIntro, setShowWelcomeIntro] = useState(true);
  const [introAnimated, setIntroAnimated] = useState(false);

  // Character Customization State
  const [selectedGender, setSelectedGender] = useState<CharacterGender>('male');
  const [selectedOutfitColor, setSelectedOutfitColor] = useState<OutfitColor>('charcoal');
  const [explorerName, setExplorerName] = useState<string>('Ranger_01');

  // Gameplay movement state
  const [isWalking, setIsWalking] = useState(false);

  // Progression & Score State
  const [currentLevel, setCurrentLevel] = useState(3);
  const [totalXp, setTotalXp] = useState(850);

  // Daily Nature Challenges State
  const [dailyChallenges, setDailyChallenges] = useState<DailyNatureChallenge[]>([
    {
      id: 'daily-leaf-default',
      title: 'Find 2 Broad Leaves',
      description: 'Scan beneath mature canopy trees for two intact leaves with clear veining.',
      category: 'Flora',
      icon: '🍃',
      difficulty: 'Quick',
      xpReward: 100,
      completed: true,
    },
    {
      id: 'daily-bird-default',
      title: 'Identify a Local Bird',
      description: 'Stop silently for 60 seconds and locate a wild bird in the branches. Note its song.',
      category: 'Fauna',
      icon: '🐦',
      difficulty: 'Explorer',
      xpReward: 150,
      completed: false,
    },
    {
      id: 'daily-bark-default',
      title: 'Inspect Tree Bark Texture',
      description: 'Feel the ridges and fissures of a tree trunk and check for green moss or velvet lichen.',
      category: 'Tactile',
      icon: '🪵',
      difficulty: 'Tracker',
      xpReward: 125,
      completed: false,
    },
  ]);
  const [isFetchingChallenges, setIsFetchingChallenges] = useState(false);

  // Field Sticker Codex State
  const [unlockedStickers, setUnlockedStickers] = useState<StickerEntry[]>([
    {
      id: 'stk-dragon',
      name: 'Verdant Leaf Dragon',
      badgeEmoji: '🐉',
      rarity: 'Mythic',
      category: 'craft',
      biome: 'Oak & Redwood Woodland',
      dateUnlocked: 'Stage 1 Complete',
      lore: 'A gentle woodland guardian crafted on the soil from fallen autumn leaves and river pebbles.',
      ingredients: ['2x Fallen Leaves (Wings)', '1x Curved Twig (Spine)', '2x River Pebbles (Eyes)'],
      xpEarned: 350,
    },
    {
      id: 'stk-turtle',
      name: 'Moss Pebble Turtle',
      badgeEmoji: '🐢',
      rarity: 'Rare',
      category: 'craft',
      biome: 'Riparian Creek',
      dateUnlocked: 'Stage 2 Complete',
      lore: 'Sculpted from river stones and damp moss fronds. Absorbs cool mountain water currents.',
      ingredients: ['1x Flat Palm Stone', '4x Small Pebbles', '1x Moss Frond'],
      xpEarned: 300,
    },
  ]);

  const handleWelcomeComplete = () => {
    setShowWelcomeIntro(false);
    setTimeout(() => {
      setIntroAnimated(true);
    }, 100);
  };

  const handleReplayIntro = () => {
    setIntroAnimated(false);
    setShowWelcomeIntro(true);
  };

  const handleToggleDailyChallenge = (challengeId: string) => {
    setDailyChallenges((prev) =>
      prev.map((c) => {
        if (c.id === challengeId) {
          const nextState = !c.completed;
          if (nextState) {
            hapticFeedback.challengeCompleted();
            setTotalXp((xp) => xp + c.xpReward);
          } else {
            hapticFeedback.tactileClick();
            setTotalXp((xp) => Math.max(0, xp - c.xpReward));
          }
          return { ...c, completed: nextState };
        }
        return c;
      })
    );
  };

  const handleRefreshChallenges = async () => {
    setIsFetchingChallenges(true);
    try {
      const fresh = await fetchDailyNatureChallenges({
        biome: 'Oak Woodland',
        timeOfDay: 'Afternoon',
      });
      setDailyChallenges(fresh);
    } catch (err) {
      console.error('Failed to fetch challenges:', err);
    } finally {
      setIsFetchingChallenges(false);
    }
  };

  const completedChallengesCount = dailyChallenges.filter((c) => c.completed).length;

  return (
    <div className="relative min-h-screen bg-[#ebeae5] text-stone-900 selection:bg-stone-900 selection:text-stone-50 font-['Plus_Jakarta_Sans',sans-serif] overflow-x-hidden">
      {/* RICARDO CHANCE STYLE WELCOME PRELOADER */}
      {showWelcomeIntro && (
        <WelcomeIntroOverlay
          onComplete={handleWelcomeComplete}
          appName="ECOQUEST"
          tagline="BIO-ACOUSTIC EXPEDITION ENGINE"
        />
      )}

      {/* NATURE TOPOGRAPHICAL BACKGROUND */}
      <NatureTopoBackground />

      {/* =========================================================================
          TOP BAR: STRICT 3-ZONE LAYOUT (BRAND · UNIFIED NAV BAR · ACTION)
          Now features seamless direct navigation for:
          01. EXPLORER | 02. MISSION | 03. DAILY CHALLENGES | 04. MY STICKERS
          ========================================================================= */}
      <header className="relative z-40 sticky top-0 flex items-center justify-between px-3 sm:px-6 lg:px-10 py-2.5 sm:py-3.5 bg-[#ebeae5]/85 backdrop-blur-md border-b border-stone-800/10 select-none">
        {/* Zone 1: Wordmark */}
        <div
          onClick={() => {
            hapticFeedback.tactileClick();
            setCurrentPage('welcome');
          }}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <span className="font-display font-extrabold text-base sm:text-lg lg:text-xl tracking-tight text-stone-900 group-hover:text-emerald-900 transition-colors">
            ECOQUEST
          </span>
          <span className="hidden sm:inline text-[9px] lg:text-[10px] font-mono text-emerald-800 tracking-wider uppercase font-bold bg-emerald-700/10 px-2 py-0.5 rounded-md border border-emerald-800/20">
            FIELD EDITION
          </span>
        </div>

        {/* Zone 2: Navigation Bar (Tactile Segmented Control) */}
        <nav className="flex items-center gap-1 p-1 bg-stone-300/75 backdrop-blur-xs rounded-xl text-xs font-mono border border-stone-400/40 shadow-inner">
          {/* 01. EXPLORER (Character Selection) */}
          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              setCurrentPage('welcome');
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              currentPage === 'welcome'
                ? 'bg-stone-900 text-stone-50 font-bold shadow-[0_2px_0_0_#0c0a09]'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            <span className="hidden lg:inline">01. </span>
            <span>EXPLORER</span>
          </button>

          {/* 02. MISSION (Active Playing Game) */}
          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              setCurrentPage('playing');
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              currentPage === 'playing'
                ? 'bg-stone-900 text-stone-50 font-bold shadow-[0_2px_0_0_#0c0a09]'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            <span className="hidden lg:inline">02. </span>
            <span>MISSION</span>
          </button>

          {/* 03. GOOGLE MAP & GPS RADAR */}
          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              setCurrentPage('map');
              movementTrackingService.requestCurrentLocation();
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              currentPage === 'map'
                ? 'bg-stone-900 text-stone-50 font-bold shadow-[0_2px_0_0_#0c0a09]'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            <span className="hidden lg:inline">03. </span>
            <span>MAP</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </button>

          {/* 04. DAILY CHALLENGES (Direct Nav Access) */}
          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              setCurrentPage('challenges');
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              currentPage === 'challenges'
                ? 'bg-stone-900 text-stone-50 font-bold shadow-[0_2px_0_0_#0c0a09]'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            <span className="hidden lg:inline">04. </span>
            <span>CHALLENGES</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                currentPage === 'challenges'
                  ? 'bg-emerald-500 text-stone-950'
                  : 'bg-stone-200 text-stone-800'
              }`}
            >
              {completedChallengesCount}/{dailyChallenges.length}
            </span>
          </button>

          {/* 05. MY STICKERS (Direct Nav Access) */}
          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              setCurrentPage('stickers');
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              currentPage === 'stickers'
                ? 'bg-stone-900 text-stone-50 font-bold shadow-[0_2px_0_0_#0c0a09]'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            <span className="hidden lg:inline">05. </span>
            <span>STICKERS</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                currentPage === 'stickers'
                  ? 'bg-amber-400 text-stone-950'
                  : 'bg-stone-200 text-stone-800'
              }`}
            >
              {unlockedStickers.length}
            </span>
          </button>
        </nav>

        {/* Zone 3: Quick Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={handleReplayIntro}
            title="Replay Welcome Intro Animation"
            className="flex items-center gap-1 px-2 py-1.5 bg-stone-200/90 hover:bg-stone-300 text-stone-700 text-xs font-mono rounded-lg transition-colors border border-stone-300/80 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-stone-600" />
            <span className="hidden xl:inline text-[11px]">INTRO</span>
          </button>

          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              setIsPocketModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-50 text-xs font-mono rounded-lg transition-colors border-t border-stone-700/40 shadow-[0_2px_0_0_#0c0a09] active:translate-y-0.5 cursor-pointer"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">POCKET</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          PAGE 1: WELCOME & CHARACTER SELECT (THE USER'S BELOVED PAGE)
          ========================================================================= */}
      {currentPage === 'welcome' && (
        <main className="relative z-10 min-h-[calc(100vh-69px)] flex flex-col justify-between p-4 sm:p-8 lg:p-12">
          {/* Typographic Intro */}
          <div className="max-w-3xl mx-auto text-center space-y-2 sm:space-y-3 select-none">
            <div className="overflow-hidden">
              <h1
                className={`text-3xl sm:text-5xl lg:text-7xl font-display font-extrabold text-stone-900 tracking-tight leading-[1.05] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  introAnimated
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-full opacity-0'
                }`}
              >
                Choose Your Explorer
              </h1>
            </div>

            <div className="overflow-hidden">
              <p
                className={`text-xs sm:text-sm md:text-base font-mono text-stone-600 max-w-xl mx-auto transition-all duration-700 delay-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  introAnimated
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-full opacity-0'
                }`}
              >
                A voice-first outdoor scavenger game. Connect with real nature, assemble organic crafts on the soil, and touch grass.
              </p>
            </div>
          </div>

          {/* Mobile Gender Select Dock */}
          <div className="lg:hidden w-full max-w-xs sm:max-w-sm mx-auto flex flex-col items-center gap-1.5 my-2 z-20">
            <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider font-semibold">
              Explorer Avatar
            </span>
            <div className="w-full grid grid-cols-2 gap-2 p-1 bg-stone-300/70 backdrop-blur-xs rounded-xl border border-stone-400/50 shadow-inner">
              <button
                onClick={() => setSelectedGender('male')}
                className={`relative py-2.5 px-3 rounded-lg font-mono text-xs font-bold transition-all select-none cursor-pointer flex items-center justify-center gap-2 ${
                  selectedGender === 'male'
                    ? 'bg-stone-900 text-stone-50 border-t border-stone-600 shadow-[0_3px_0_0_#0c0a09] translate-y-0'
                    : 'bg-stone-200/90 hover:bg-stone-300 text-stone-800'
                }`}
              >
                <span className="text-sm">♂</span>
                <span>MALE</span>
              </button>
              <button
                onClick={() => setSelectedGender('female')}
                className={`relative py-2.5 px-3 rounded-lg font-mono text-xs font-bold transition-all select-none cursor-pointer flex items-center justify-center gap-2 ${
                  selectedGender === 'female'
                    ? 'bg-stone-900 text-stone-50 border-t border-stone-600 shadow-[0_3px_0_0_#0c0a09] translate-y-0'
                    : 'bg-stone-200/90 hover:bg-stone-300 text-stone-800'
                }`}
              >
                <span className="text-sm">♀</span>
                <span>FEMALE</span>
              </button>
            </div>
          </div>

          {/* 3D Character Viewport Stage */}
          <div className="relative w-full max-w-4xl h-[360px] sm:h-[440px] lg:h-[520px] mx-auto my-1 sm:my-2 flex items-center justify-center">
            {/* Centered 3D WebGL Canvas */}
            <div className="w-full h-full">
              <CharacterCanvas
                gender={selectedGender}
                outfitColor={selectedOutfitColor}
                isWalking={false}
                gamePage="welcome"
              />
            </div>

            {/* Desktop Left Dock: Gender Select */}
            <div className="hidden lg:flex absolute left-4 xl:left-6 top-1/2 -translate-y-1/2 flex-col gap-3 z-20">
              <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider font-semibold">
                Explorer Avatar
              </span>

              <button
                onClick={() => setSelectedGender('male')}
                className={`relative px-4 py-3 rounded-xl font-mono text-xs font-bold transition-all select-none cursor-pointer flex items-center gap-2.5 ${
                  selectedGender === 'male'
                    ? 'bg-stone-900 text-stone-50 border-t border-stone-600 shadow-[0_5px_0_0_#0c0a09] translate-y-0'
                    : 'bg-stone-200/90 hover:bg-stone-300 text-stone-800 border-t border-white/60 shadow-[0_4px_0_0_#a8a29e] active:translate-y-1 active:shadow-none'
                }`}
              >
                <span className="text-sm">♂</span>
                <span>MALE EXPLORER</span>
              </button>

              <button
                onClick={() => setSelectedGender('female')}
                className={`relative px-4 py-3 rounded-xl font-mono text-xs font-bold transition-all select-none cursor-pointer flex items-center gap-2.5 ${
                  selectedGender === 'female'
                    ? 'bg-stone-900 text-stone-50 border-t border-stone-600 shadow-[0_5px_0_0_#0c0a09] translate-y-0'
                    : 'bg-stone-200/90 hover:bg-stone-300 text-stone-800 border-t border-white/60 shadow-[0_4px_0_0_#a8a29e] active:translate-y-1 active:shadow-none'
                }`}
              >
                <span className="text-sm">♀</span>
                <span>FEMALE EXPLORER</span>
              </button>
            </div>

            {/* Desktop Right Dock: Tech Gear Styling */}
            <div className="hidden lg:flex absolute right-4 xl:right-6 top-1/2 -translate-y-1/2 flex-col items-end gap-3 z-20">
              <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider font-semibold">
                Gear Palette
              </span>

              {(['charcoal', 'forest', 'sand'] as OutfitColor[]).map((col) => (
                <button
                  key={col}
                  onClick={() => setSelectedOutfitColor(col)}
                  className={`relative px-4 py-2.5 rounded-xl font-mono text-xs capitalize transition-all select-none cursor-pointer flex items-center gap-2 ${
                    selectedOutfitColor === col
                      ? 'bg-stone-900 text-stone-50 font-bold border-t border-stone-600 shadow-[0_5px_0_0_#0c0a09]'
                      : 'bg-stone-200/90 hover:bg-stone-300 text-stone-800 font-medium border-t border-white/60 shadow-[0_4px_0_0_#a8a29e] active:translate-y-1 active:shadow-none'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        col === 'charcoal' ? '#27272a' : col === 'forest' ? '#1b4332' : '#926c48',
                    }}
                  />
                  <span>{col} Finish</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Gear Palette Dock */}
          <div className="lg:hidden w-full max-w-xs sm:max-w-sm mx-auto flex flex-col items-center gap-1.5 my-2 z-20">
            <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider font-semibold">
              Tech Gear Palette
            </span>
            <div className="w-full grid grid-cols-3 gap-2">
              {(['charcoal', 'forest', 'sand'] as OutfitColor[]).map((col) => (
                <button
                  key={col}
                  onClick={() => setSelectedOutfitColor(col)}
                  className={`relative py-2 px-2 rounded-xl font-mono text-xs capitalize transition-all select-none cursor-pointer flex items-center justify-center gap-1.5 ${
                    selectedOutfitColor === col
                      ? 'bg-stone-900 text-stone-50 font-bold border-t border-stone-600 shadow-[0_3px_0_0_#0c0a09]'
                      : 'bg-stone-200/90 hover:bg-stone-300 text-stone-800 font-medium border-t border-white/60 shadow-[0_2px_0_0_#a8a29e]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        col === 'charcoal' ? '#27272a' : col === 'forest' ? '#1b4332' : '#926c48',
                    }}
                  />
                  <span>{col}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Explorer Deck & Launch Actuator */}
          <div
            className={`max-w-md w-full mx-auto space-y-3 pt-2 transition-all duration-700 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              introAnimated ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
            }`}
          >
            <div className="flex items-center gap-2 p-1.5 bg-stone-200/80 rounded-xl border border-stone-300 shadow-inner">
              <span className="pl-3 text-xs font-mono text-stone-500 uppercase font-semibold">CODENAME:</span>
              <input
                type="text"
                value={explorerName}
                onChange={(e) => setExplorerName(e.target.value)}
                placeholder="Enter explorer name..."
                className="flex-1 bg-transparent text-sm font-mono font-bold text-stone-900 outline-none px-2"
              />
            </div>

            {/* Launch Game Actuator */}
            <button
              onClick={() => {
                hapticFeedback.startPlaying();
                setCurrentPage('playing');
                voiceRecognitionService.startListening();
                geminiVoiceManager.speak(
                  'Expedition protocol initiated. Put on your earphones, place your phone securely in your pocket, and let us explore. All guidance is verbal. Speak your commands directly into your mic without touching the screen. I am tracking your movement.',
                  {
                    voiceId: geminiVoiceManager.getSelectedVoiceId(),
                  }
                );
              }}
              className="relative w-full py-3.5 sm:py-4 px-6 bg-stone-900 hover:bg-stone-800 active:bg-stone-900 text-stone-50 font-display font-bold text-base rounded-2xl transition-all border-t border-stone-600/50 shadow-[0_6px_0_0_#0c0a09] active:shadow-[0_1px_0_0_#0c0a09] active:translate-y-1.5 flex items-center justify-center gap-3 cursor-pointer group"
            >
              <Headphones className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>START PLAYING · WEAR EARPHONES</span>
              <ArrowRight className="w-5 h-5 text-emerald-400 group-hover:translate-x-1 transition-transform ml-auto" />
            </button>

            {/* Direct Google Map Actuator */}
            <button
              onClick={() => {
                hapticFeedback.tactileClick();
                setCurrentPage('map');
                movementTrackingService.requestCurrentLocation();
              }}
              className="w-full py-3 px-5 bg-stone-200/90 hover:bg-stone-300 text-stone-900 font-mono text-xs font-bold rounded-2xl transition-all border border-stone-300 shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Compass className="w-4 h-4 text-emerald-700" />
              <span>VIEW INTERACTIVE GOOGLE MAP & LOCATION</span>
            </button>
          </div>
        </main>
      )}

      {/* =========================================================================
          PAGE 2: PLAYING GAME (MISSION HUD, 3D HERO STAGE, GOOGLE MAPS, EASY UI)
          No virtual map! Minimal text, hands-free earphone voice first!
          ========================================================================= */}
      {currentPage === 'playing' && (
        <main className="relative z-10 min-h-[calc(100vh-69px)]">
          <MissionHUD
            gender={selectedGender}
            outfitColor={selectedOutfitColor}
            explorerName={explorerName}
            isWalking={isWalking}
            setIsWalking={setIsWalking}
            onOpenPocketMode={() => setIsPocketModalOpen(true)}
            onBackToCharacterSelect={() => setCurrentPage('welcome')}
            onOpenDailyChallenges={() => setCurrentPage('challenges')}
            onOpenStickers={() => setCurrentPage('stickers')}
            unlockedStickers={unlockedStickers}
            setUnlockedStickers={setUnlockedStickers}
            currentLevel={currentLevel}
            setCurrentLevel={setCurrentLevel}
            totalXp={totalXp}
            setTotalXp={setTotalXp}
            dailyChallenges={dailyChallenges}
          />
        </main>
      )}

      {/* =========================================================================
          PAGE 3: DEDICATED FULL-SCREEN GOOGLE MAP & GPS LOCALITY RADAR
          ========================================================================= */}
      {currentPage === 'map' && (
        <main className="relative z-10 min-h-[calc(100vh-69px)] p-3 sm:p-6 lg:p-10 max-w-5xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-stone-200/80 backdrop-blur-md rounded-2xl border border-stone-300 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-stone-900 text-emerald-400 flex items-center justify-center font-bold text-lg shadow-md">
                <Compass className="w-5 h-5 text-emerald-400 animate-spin" style={{ animationDuration: '12s' }} />
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-emerald-800 tracking-wider">
                  REAL-TIME SATELLITE & TACTICAL NAVIGATION
                </span>
                <h2 className="text-xl sm:text-2xl font-display font-extrabold text-stone-900">
                  Google Maps Platform Explorer
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  hapticFeedback.buttonPress();
                  const coords = await movementTrackingService.requestCurrentLocation();
                  setMapFocusTrigger((prev) => prev + 1);
                  geminiVoiceManager.speak(
                    `Centering map on your GPS coordinates: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}.`,
                    { voiceId: geminiVoiceManager.getSelectedVoiceId() }
                  );
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <LocateFixed className="w-4 h-4" />
                <span>LOCATE ME (GPS FIX)</span>
              </button>
            </div>
          </div>

          {/* Real-World Telemetry Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            <div className="p-3 rounded-xl bg-stone-200/70 border border-stone-300">
              <div className="text-[10px] text-stone-500 uppercase">LOCALITY</div>
              <div className="font-bold text-stone-900 truncate">
                {telemetry.localityName || 'Locating area...'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-stone-200/70 border border-stone-300">
              <div className="text-[10px] text-stone-500 uppercase">COORDINATES</div>
              <div className="font-bold text-emerald-800">
                {telemetry.latitude.toFixed(4)}°, {telemetry.longitude.toFixed(4)}°
              </div>
            </div>
            <div className="p-3 rounded-xl bg-stone-200/70 border border-stone-300">
              <div className="text-[10px] text-stone-500 uppercase">GPS ACCURACY</div>
              <div className="font-bold text-stone-900">
                ±{Math.round(telemetry.accuracy || 5)} meters
              </div>
            </div>
            <div className="p-3 rounded-xl bg-stone-200/70 border border-stone-300">
              <div className="text-[10px] text-stone-500 uppercase">MOVEMENT</div>
              <div className="font-bold text-stone-900">
                {telemetry.state === 'MOVING' ? `Walking (${telemetry.speedMps} m/s)` : 'Stationary'}
              </div>
            </div>
          </div>

          {/* Interactive Google Map */}
          <LocalityGoogleMap
            telemetry={telemetry}
            activeWaypoint={null}
            waypoints={[
              {
                id: 'map-wp-1',
                name: 'Mature Canopy Trees',
                category: 'Canopy',
                description: 'Search for fallen broad leaves and textured bark specimens.',
                audioPrompt: 'Scan the ground near the canopy trees.',
                lat: telemetry.latitude + 0.0007,
                lng: telemetry.longitude + 0.0009,
                icon: '🌲',
                completed: false,
                distanceMeters: 85,
              },
              {
                id: 'map-wp-2',
                name: 'Botanical Foliage Cache',
                category: 'Botanical',
                description: 'Lush ground vegetation with diverse wild plant specimens.',
                audioPrompt: 'Look for intact leaf veins and natural colors.',
                lat: telemetry.latitude - 0.0006,
                lng: telemetry.longitude + 0.0008,
                icon: '🍃',
                completed: false,
                distanceMeters: 70,
              },
              {
                id: 'map-wp-3',
                name: 'Riverbed Stone Deposit',
                category: 'Geo',
                description: 'Smooth mineral pebbles and natural gravel.',
                audioPrompt: 'Collect two smooth pebbles for crafting.',
                lat: telemetry.latitude + 0.0004,
                lng: telemetry.longitude - 0.0007,
                icon: '🪨',
                completed: false,
                distanceMeters: 95,
              },
            ]}
            onSelectWaypoint={(wp) => {
              geminiVoiceManager.speak(`Selected ${wp.name}. ${wp.description}`, {
                voiceId: geminiVoiceManager.getSelectedVoiceId(),
              });
            }}
            onWaypointCompleted={() => {
              setTotalXp((xp) => xp + 100);
            }}
            focusLocationTrigger={mapFocusTrigger}
            onRequestLocation={() => setMapFocusTrigger((prev) => prev + 1)}
          />
        </main>
      )}

      {/* =========================================================================
          PAGE 3: DAILY CHALLENGES (DEDICATED FULL VIEW)
          ========================================================================= */}
      {currentPage === 'challenges' && (
        <main className="relative z-10 min-h-[calc(100vh-69px)]">
          <DailyChallengesView
            challenges={dailyChallenges}
            onToggleChallenge={handleToggleDailyChallenge}
            onRefreshChallenges={handleRefreshChallenges}
            isRefreshing={isFetchingChallenges}
            onStartMission={() => setCurrentPage('playing')}
            selectedBiome="Redwood & Oak Woodland"
            totalXp={totalXp}
          />
        </main>
      )}

      {/* =========================================================================
          PAGE 4: MY FIELD STICKERS (DEDICATED FULL VIEW)
          ========================================================================= */}
      {currentPage === 'stickers' && (
        <main className="relative z-10 min-h-[calc(100vh-69px)]">
          <StickerAlbumView
            unlockedStickers={unlockedStickers}
            onStartMission={() => setCurrentPage('playing')}
          />
        </main>
      )}

      {/* FULLSCREEN OLED POCKET MODE MODAL */}
      {isPocketModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-black border border-white/20 shadow-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
              <div className="flex items-center gap-2 font-mono text-sm text-white font-bold">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>OLED POCKET MODE SIMULATOR</span>
              </div>
              <button
                onClick={() => setIsPocketModalOpen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <PocketModeHUD isFullScreen={true} onClose={() => setIsPocketModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
