import React from 'react';
import { Check, Lock, Sparkles, Star, Trophy, Footprints, Shield, Flag } from 'lucide-react';
import { GeneratedMission } from '../services/geminiMissionService';
import { hapticFeedback } from '../utils/haptics';

export interface ProgressionLevel {
  id: number;
  title: string;
  biome: string;
  status: 'completed' | 'active' | 'locked';
  stars: number;
  hasLadderUp?: boolean;
  stickerName: string;
  stickerEmoji: string;
  xpReward: number;
}

interface VirtualProgressionMapProps {
  currentLevel: number;
  onSelectLevel: (level: number) => void;
  activeMission?: GeneratedMission | null;
  onOpenScavengerHunt: () => void;
}

export const VirtualProgressionMap: React.FC<VirtualProgressionMapProps> = ({
  currentLevel = 3,
  onSelectLevel,
  activeMission,
  onOpenScavengerHunt,
}) => {
  // 7 Levels styled like a winding Candy Crush mountain trail with ladders
  const levels: ProgressionLevel[] = [
    {
      id: 1,
      title: 'Mossy Footpath',
      biome: 'Meadow',
      status: 'completed',
      stars: 3,
      hasLadderUp: false,
      stickerName: 'Forest Snail Shell',
      stickerEmoji: '🐌',
      xpReward: 150,
    },
    {
      id: 2,
      title: 'The Whispering Creek',
      biome: 'Riparian',
      status: 'completed',
      stars: 3,
      hasLadderUp: true, // Ladder 1 up to tier 2
      stickerName: 'Smooth River Pebble',
      stickerEmoji: '🪨',
      xpReward: 250,
    },
    {
      id: 3,
      title: activeMission ? activeMission.title : 'The Leaf Dragon Clearing',
      biome: 'Old Growth Forest',
      status: 'active',
      stars: 0,
      hasLadderUp: false,
      stickerName: 'Verdant Leaf Dragon',
      stickerEmoji: '🐉',
      xpReward: 350,
    },
    {
      id: 4,
      title: 'Pinecone Sentry Crag',
      biome: 'Alpine Woods',
      status: 'locked',
      stars: 0,
      hasLadderUp: true, // Ladder 2 up to tier 3
      stickerName: 'Pinecone Sentry Owl',
      stickerEmoji: '🦉',
      xpReward: 400,
    },
    {
      id: 5,
      title: 'Lichen Basalt Terrace',
      biome: 'Rock Ridge',
      status: 'locked',
      stars: 0,
      hasLadderUp: false,
      stickerName: 'Whispering Lichen',
      stickerEmoji: '🌿',
      xpReward: 450,
    },
    {
      id: 6,
      title: 'The Solar Mandala Peak',
      biome: 'High Summit',
      status: 'locked',
      stars: 0,
      hasLadderUp: true, // Ladder 3 up to Dragon Summit
      stickerName: 'Solar Sunburst',
      stickerEmoji: '☀️',
      xpReward: 500,
    },
    {
      id: 7,
      title: 'Ancient Sky Dragon Sanctuary',
      biome: 'Apex Summit',
      status: 'locked',
      stars: 0,
      hasLadderUp: false,
      stickerName: 'Grand Gaia Crest',
      stickerEmoji: '👑',
      xpReward: 1000,
    },
  ];

  return (
    <div className="relative w-full rounded-2xl bg-gradient-to-b from-stone-900 via-emerald-950/40 to-stone-900 border border-stone-800 p-6 overflow-hidden select-none text-stone-100 shadow-md">
      {/* Decorative Grid & Nature Background */}
      <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

      {/* Top Map Ribbon */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-800 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-display font-bold text-sm tracking-wide text-white">
            VIRTUAL EXPEDITION MAP
          </span>
          <span className="text-stone-500">·</span>
          <span className="text-emerald-400 font-semibold">LADDER PROGRESSION</span>
        </div>

        <div className="flex items-center gap-4 text-stone-300">
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>LEVEL 3 / 7</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>6 STARS</span>
          </div>
          <div className="text-emerald-400 font-bold">750 XP</div>
        </div>
      </div>

      {/* Candy Crush Style Winding Serpentine Path */}
      <div className="relative py-8 max-w-2xl mx-auto flex flex-col items-center gap-8">
        {levels.map((lvl, index) => {
          const isActive = lvl.id === currentLevel;
          const isCompleted = lvl.status === 'completed';
          const isLocked = lvl.status === 'locked';

          // Serpentine alternating offset (left, center, right, center, left)
          const offsets = ['translate-x-0', 'sm:translate-x-24', 'sm:-translate-x-20', 'sm:translate-x-16', 'sm:-translate-x-24', 'sm:translate-x-20', 'translate-x-0'];
          const currentOffset = offsets[index % offsets.length];

          return (
            <div key={lvl.id} className="relative flex flex-col items-center">
              {/* Illustrated Ladder if this node ascends to the next tier */}
              {lvl.hasLadderUp && (
                <div className="mb-4 flex flex-col items-center">
                  <div className="text-[10px] font-mono text-amber-400/80 font-bold flex items-center gap-1">
                    <span>🪜 MOUNTAIN LADDER TIER</span>
                  </div>
                  {/* SVG Illustrated Wooden Ladder */}
                  <svg width="36" height="52" viewBox="0 0 36 52" className="text-amber-700/80 my-1">
                    {/* Rails */}
                    <line x1="6" y1="0" x2="6" y2="52" stroke="#b45309" strokeWidth="4" strokeLinecap="round" />
                    <line x1="30" y1="0" x2="30" y2="52" stroke="#b45309" strokeWidth="4" strokeLinecap="round" />
                    {/* Rungs */}
                    <line x1="6" y1="10" x2="30" y2="10" stroke="#d97706" strokeWidth="3" />
                    <line x1="6" y1="24" x2="30" y2="24" stroke="#d97706" strokeWidth="3" />
                    <line x1="6" y1="38" x2="30" y2="38" stroke="#d97706" strokeWidth="3" />
                  </svg>
                </div>
              )}

              {/* Connecting Trail Line between nodes */}
              {index > 0 && !lvl.hasLadderUp && (
                <div className="w-1.5 h-8 bg-stone-700 rounded-full mb-3" />
              )}

              {/* Main Circular Level Node (Candy Crush Style Badge) */}
              <div className={`relative transition-transform duration-300 ${currentOffset}`}>
                {/* Active Level Pulsing Aura */}
                {isActive && (
                  <div className="absolute -inset-3 rounded-full bg-emerald-500/30 animate-ping opacity-75 pointer-events-none" />
                )}

                <button
                  onClick={() => {
                    hapticFeedback.tactileClick();
                    onSelectLevel(lvl.id);
                    if (isActive) onOpenScavengerHunt();
                  }}
                  className={`group relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-lg border-2 ${
                    isActive
                      ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 border-white text-stone-950 scale-110 shadow-emerald-500/50'
                      : isCompleted
                      ? 'bg-gradient-to-b from-amber-400 to-amber-600 border-amber-200 text-stone-950 hover:scale-105 shadow-amber-500/30'
                      : 'bg-stone-800/90 border-stone-700 text-stone-500 hover:border-stone-500'
                  }`}
                  title={`${lvl.title} - ${lvl.status.toUpperCase()}`}
                >
                  {/* Node Badge Content */}
                  {isCompleted ? (
                    <>
                      <span className="text-xl sm:text-2xl">{lvl.stickerEmoji}</span>
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <Star className="w-2.5 h-2.5 fill-stone-950 text-stone-950" />
                        <Star className="w-2.5 h-2.5 fill-stone-950 text-stone-950" />
                        <Star className="w-2.5 h-2.5 fill-stone-950 text-stone-950" />
                      </div>
                    </>
                  ) : isActive ? (
                    <>
                      <div className="text-[10px] font-mono font-extrabold uppercase tracking-tight text-white">
                        ACTIVE
                      </div>
                      <span className="text-2xl">{lvl.stickerEmoji}</span>
                      <span className="text-[9px] font-mono font-bold text-stone-950">LVL {lvl.id}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5 text-stone-500" />
                      <span className="text-[10px] font-mono mt-0.5">LVL {lvl.id}</span>
                    </>
                  )}
                </button>

                {/* Level Title Tag Pill */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-mono px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-sm transition-all ${
                    index % 2 === 0 ? 'left-full ml-3' : 'right-full mr-3 text-right'
                  } ${
                    isActive
                      ? 'bg-emerald-900/80 border-emerald-500/40 text-emerald-200 font-bold'
                      : isCompleted
                      ? 'bg-stone-900/90 border-stone-700 text-stone-200'
                      : 'bg-stone-900/60 border-stone-800/80 text-stone-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {isCompleted && <Check className="w-3 h-3 text-amber-400" />}
                    <span>{lvl.title}</span>
                  </div>
                  <div className="text-[10px] text-stone-400">
                    Reward: {lvl.stickerName} ({lvl.stickerEmoji})
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom CTA for Active Scavenger Mission */}
      <div className="relative z-10 pt-4 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-emerald-400 font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>CURRENT STAGE TASK: {activeMission ? activeMission.title : 'The Leaf Dragon Awakening'}</span>
          </div>
          <p className="text-xs text-stone-400 font-mono mt-0.5">
            Collect 2 leaves, 1 twig, 2 pebbles ➔ Craft dragon on ground ➔ Snap photo to claim sticker & climb next ladder!
          </p>
        </div>

        <button
          onClick={onOpenScavengerHunt}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-stone-950 font-display font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
        >
          <span>OPEN PHOTO TASK & CRAFT</span>
          <Footprints className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
