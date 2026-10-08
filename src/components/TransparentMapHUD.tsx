import React, { useState, useEffect, useRef } from 'react';
import { Compass, Eye, EyeOff, Layers, MapPin, Navigation, Sparkles, Footprints, Sliders, Maximize2, Shield, Crosshair } from 'lucide-react';

interface POI {
  id: string;
  name: string;
  type: 'flora' | 'fauna' | 'sanctuary' | 'cache';
  distance: number; // meters
  bearing: number;  // degrees
  coords: [number, number];
  discovered: boolean;
  biome: string;
  rarity: 'Common' | 'Rare' | 'Mythic';
}

interface TransparentMapHUDProps {
  onStepSimulate?: () => void;
  className?: string;
}

export const TransparentMapHUD: React.FC<TransparentMapHUDProps> = ({
  onStepSimulate,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Map state
  const [mapOpacity, setMapOpacity] = useState<number>(0.55);
  const [mapTheme, setMapTheme] = useState<'transparent' | 'tactical' | 'forest' | 'amoled'>('transparent');
  const [revealRadius, setRevealRadius] = useState<number>(75);
  const [heading, setHeading] = useState<number>(42);
  const [selectedPoiId, setSelectedPoiId] = useState<string>('poi-1');
  const [playerPos, setPlayerPos] = useState<{ x: number; y: number }>({ x: 300, y: 240 });
  const [explorationPercent, setExplorationPercent] = useState<number>(38.4);
  const [stepsCount, setStepsCount] = useState<number>(1420);
  const [showControls, setShowControls] = useState<boolean>(true);

  // Cleared fog trail points
  const [trail, setTrail] = useState<Array<{ x: number; y: number }>>([
    { x: 300, y: 240 },
    { x: 290, y: 230 },
    { x: 275, y: 215 },
    { x: 260, y: 200 },
    { x: 240, y: 190 },
  ]);

  // Points of Interest in the park
  const [pois, setPois] = useState<POI[]>([
    {
      id: 'poi-1',
      name: 'Old Growth Redwood Hollow',
      type: 'sanctuary',
      distance: 380,
      bearing: 335,
      coords: [210, 110],
      discovered: true,
      biome: 'Ancient Woodland',
      rarity: 'Rare',
    },
    {
      id: 'poi-2',
      name: 'Bioluminescent Moss Clearing',
      type: 'flora',
      distance: 640,
      bearing: 45,
      coords: [440, 130],
      discovered: true,
      biome: 'Humid Understory',
      rarity: 'Mythic',
    },
    {
      id: 'poi-3',
      name: 'Alpine Spring Basin',
      type: 'sanctuary',
      distance: 920,
      bearing: 185,
      coords: [320, 390],
      discovered: false,
      biome: 'Riparian Glade',
      rarity: 'Rare',
    },
    {
      id: 'poi-4',
      name: 'Whispering Lichen Overlook',
      type: 'cache',
      distance: 1250,
      bearing: 260,
      coords: [120, 260],
      discovered: false,
      biome: 'Basalt Ridge',
      rarity: 'Common',
    },
  ]);

  const activePoi = pois.find(p => p.id === selectedPoiId) || pois[0];

  // Calculate audio panning stereo value from current heading & target bearing
  // -1.0 (Full Left) to +1.0 (Full Right)
  const relativeAngle = ((activePoi.bearing - heading + 540) % 360) - 180;
  const stereoPan = Math.max(-1, Math.min(1, Math.sin((relativeAngle * Math.PI) / 180)));

  // Simulate GPS walk step
  const handleWalkStep = () => {
    const angleRad = (heading * Math.PI) / 180;
    const stepDistance = 14;
    const newX = playerPos.x + Math.sin(angleRad) * stepDistance;
    const newY = playerPos.y - Math.cos(angleRad) * stepDistance;

    // Boundary wrap
    const clampedX = Math.max(50, Math.min(550, newX));
    const clampedY = Math.max(50, Math.min(430, newY));

    setPlayerPos({ x: clampedX, y: clampedY });
    setTrail(prev => [{ x: clampedX, y: clampedY }, ...prev.slice(0, 25)]);
    setStepsCount(prev => prev + 18);
    setExplorationPercent(prev => Math.min(100, Number((prev + 0.35).toFixed(1))));

    // Check if POI discovered
    setPois(prev =>
      prev.map(p => {
        const dist = Math.hypot(p.coords[0] - clampedX, p.coords[1] - clampedY);
        if (dist < revealRadius) {
          return { ...p, discovered: true };
        }
        return p;
      })
    );

    if (onStepSimulate) {
      onStepSimulate();
    }
  };

  // Draw transparent canvas map and dynamic fog of war
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Map Base Layer depending on theme
    if (mapTheme === 'amoled') {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, width, height);
    } else if (mapTheme === 'tactical') {
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(0, 0, width, height);
    } else if (mapTheme === 'forest') {
      ctx.fillStyle = '#14281d';
      ctx.fillRect(0, 0, width, height);
    } else {
      // 'transparent' mode: subtle grid with soft frosted backing
      ctx.fillStyle = 'rgba(235, 234, 229, 0.2)';
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Tactical Coordinate Grid
    ctx.strokeStyle = mapTheme === 'transparent' ? 'rgba(28, 25, 23, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    const gridSize = 40;
    for (let x = 0; x <= width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3. Topographic Elevation Contour Lines
    ctx.strokeStyle = mapTheme === 'transparent' ? 'rgba(74, 222, 128, 0.25)' : 'rgba(74, 222, 128, 0.18)';
    ctx.lineWidth = 1.5;

    // Organic contour rings
    const contours = [
      { cx: 220, cy: 130, rx: 110, ry: 75, rot: 0.2 },
      { cx: 220, cy: 130, rx: 80, ry: 50, rot: 0.2 },
      { cx: 430, cy: 150, rx: 90, ry: 60, rot: -0.3 },
      { cx: 330, cy: 370, rx: 130, ry: 85, rot: 0.1 },
    ];

    contours.forEach(c => {
      ctx.beginPath();
      ctx.ellipse(c.cx, c.cy, c.rx, c.ry, c.rot, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 4. Meandering River / Wetland Waterway
    ctx.strokeStyle = mapTheme === 'transparent' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(40, 360);
    ctx.bezierCurveTo(160, 340, 260, 280, 340, 220);
    ctx.bezierCurveTo(420, 160, 480, 100, 560, 60);
    ctx.stroke();

    // 5. Draw Dynamic Fog of War Layer
    // We render a semi-translucent fog, then punch clear circular masks around player & trail
    ctx.save();
    
    // Draw unexplored fog sheet
    const fogColor = mapTheme === 'transparent' 
      ? 'rgba(40, 37, 34, 0.45)' 
      : 'rgba(10, 10, 12, 0.72)';
    
    ctx.fillStyle = fogColor;
    ctx.fillRect(0, 0, width, height);

    // Punch out cleared areas using destination-out composite mode
    ctx.globalCompositeOperation = 'destination-out';

    // Cleared trail paths
    trail.forEach((pt, index) => {
      const radius = revealRadius * (1 - index * 0.02);
      if (radius > 15) {
        const grad = ctx.createRadialGradient(pt.x, pt.y, 5, pt.x, pt.y, radius);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.85)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Primary player clearing bubble
    const playerGrad = ctx.createRadialGradient(playerPos.x, playerPos.y, 10, playerPos.x, playerPos.y, revealRadius);
    playerGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    playerGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.9)');
    playerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = playerGrad;
    ctx.beginPath();
    ctx.arc(playerPos.x, playerPos.y, revealRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 6. Draw POIs Markers
    pois.forEach(poi => {
      const [px, py] = poi.coords;
      const isTargeted = poi.id === selectedPoiId;

      ctx.save();
      if (poi.discovered) {
        // Discovered nature marker
        ctx.fillStyle = isTargeted ? '#10b981' : '#34d399';
        ctx.beginPath();
        ctx.arc(px, py, isTargeted ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing target ring
        if (isTargeted) {
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, 15, 0, Math.PI * 2);
          ctx.stroke();
        }

        // POI Label
        ctx.fillStyle = '#1c1917';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(poi.name, px + 12, py + 4);
      } else {
        // Unexplored undiscovered ghost blip
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    });

    // 7. Draw Vector Line from Player to Targeted POI (Audio Radar Vector)
    if (activePoi) {
      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(playerPos.x, playerPos.y);
      ctx.lineTo(activePoi.coords[0], activePoi.coords[1]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 8. Draw Player Avatar Blip and Heading Cone
    ctx.save();
    ctx.translate(playerPos.x, playerPos.y);
    ctx.rotate((heading * Math.PI) / 180);

    // Directional FOV Cone
    const fovGrad = ctx.createRadialGradient(0, 0, 5, 0, -45, 50);
    fovGrad.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    fovGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = fovGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 50, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
    ctx.closePath();
    ctx.fill();

    // Player central locator ring
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

  }, [playerPos, trail, heading, selectedPoiId, mapOpacity, mapTheme, revealRadius, pois]);

  return (
    <div className={`relative rounded-2xl overflow-hidden border border-stone-800/10 shadow-sm bg-[#ebeae5]/40 backdrop-blur-md ${className}`}>
      {/* Top HUD Telemetry Ribbon */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-stone-800/10 bg-[#ebeae5]/80 backdrop-blur-md text-xs font-mono text-stone-700">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-stone-900">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>TRANSPARENT HUD OVERLAY</span>
          </div>
          <span className="text-stone-400">/</span>
          <span className="hidden sm:inline text-stone-500">OPENSTREETMAP VECTOR GRID</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-emerald-600" />
            <span>37°46'29.8"N 122°25'09.6"W</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5">
            <Footprints className="w-3.5 h-3.5 text-stone-500" />
            <span>{stepsCount} STEPS</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{explorationPercent}% UNVEILED</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Map Canvas Box */}
      <div className="relative w-full aspect-16/10 min-h-[380px] overflow-hidden bg-stone-900/5">
        <canvas
          ref={canvasRef}
          width={600}
          height={480}
          className="w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: mapOpacity }}
        />

        {/* Minimalist Floating Overlay Compass (Top Right) */}
        <div className="absolute top-4 right-4 bg-[#ebeae5]/90 backdrop-blur-md border border-stone-800/10 rounded-xl p-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 flex items-center justify-center border border-stone-300 rounded-full">
              <Compass
                className="w-6 h-6 text-stone-800 transition-transform duration-300"
                style={{ transform: `rotate(${heading}deg)` }}
              />
              <span className="absolute -top-1.5 text-[9px] font-mono font-bold text-emerald-700">N</span>
            </div>
            <div>
              <div className="text-[10px] font-mono text-stone-500 uppercase">Heading</div>
              <div className="text-sm font-mono font-bold text-stone-900">{heading}° NW</div>
            </div>
          </div>
        </div>

        {/* Spatial Audio Ear Radar Panning Indicator (Top Left) */}
        <div className="absolute top-4 left-4 bg-[#ebeae5]/90 backdrop-blur-md border border-stone-800/10 rounded-xl p-3 shadow-xs max-w-xs">
          <div className="text-[10px] font-mono text-stone-500 uppercase tracking-wide">
            Spatial Audio Compass
          </div>
          <div className="text-xs font-semibold text-stone-900 truncate mt-0.5">
            Target: {activePoi.name}
          </div>
          
          {/* Stereo Panning Bar: Left Ear vs Right Ear */}
          <div className="mt-2.5">
            <div className="flex justify-between text-[10px] font-mono text-stone-500 mb-1">
              <span className={stereoPan < -0.2 ? 'text-emerald-600 font-bold' : ''}>LEFT EAR</span>
              <span className="text-[9px] text-stone-400">CENTER</span>
              <span className={stereoPan > 0.2 ? 'text-emerald-600 font-bold' : ''}>RIGHT EAR</span>
            </div>
            <div className="relative w-full h-2 bg-stone-200 rounded-full overflow-hidden">
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-stone-400" />
              <div
                className="absolute top-0 bottom-0 h-full bg-emerald-500 transition-all duration-200"
                style={{
                  left: stereoPan < 0 ? `${(stereoPan + 1) * 50}%` : '50%',
                  width: `${Math.abs(stereoPan) * 50}%`,
                }}
              />
            </div>
            <div className="flex justify-between items-center mt-1 text-[10px] font-mono text-stone-600">
              <span>{activePoi.distance}m away</span>
              <span>StereoPan: {stereoPan.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Floating Quick Action: Simulate GPS Step */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <button
            onClick={handleWalkStep}
            className="flex items-center gap-2 px-3.5 py-2 bg-stone-900 text-stone-50 text-xs font-mono font-medium rounded-lg hover:bg-stone-800 transition-colors shadow-sm"
          >
            <Footprints className="w-3.5 h-3.5 text-emerald-400" />
            <span>SIMULATE WALK STEP</span>
          </button>
          <button
            onClick={() => setHeading((prev) => (prev + 30) % 360)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#ebeae5]/90 backdrop-blur-md border border-stone-800/10 text-stone-800 text-xs font-mono rounded-lg hover:bg-[#ebeae5] transition-colors"
            title="Rotate Compass Bearing"
          >
            <Navigation className="w-3.5 h-3.5 text-stone-600" />
            <span>ROTATE HEADING</span>
          </button>
        </div>

        {/* Toggle HUD Controls Drawer */}
        <div className="absolute bottom-4 right-4">
          <button
            onClick={() => setShowControls(!showControls)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#ebeae5]/90 backdrop-blur-md border border-stone-800/10 text-stone-800 text-xs font-mono rounded-lg hover:bg-[#ebeae5] transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 text-stone-600" />
            <span>{showControls ? 'HIDE HUD SLIDERS' : 'MAP SETTINGS'}</span>
          </button>
        </div>
      </div>

      {/* Interactive HUD Sliders & POI List Drawer */}
      {showControls && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 border-t border-stone-800/10 bg-[#ebeae5]/90 backdrop-blur-md">
          {/* Controls: Opacity, Fog Radius, Theme */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-mono text-stone-700 mb-1.5">
                <span>TRANSPARENT LAYER OPACITY</span>
                <span className="font-semibold text-stone-900">{Math.round(mapOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={mapOpacity}
                onChange={(e) => setMapOpacity(parseFloat(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-stone-300 rounded-lg"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono text-stone-700 mb-1.5">
                <span>FOG OF WAR CLEARANCE RADIUS</span>
                <span className="font-semibold text-stone-900">{revealRadius}m</span>
              </div>
              <input
                type="range"
                min="40"
                max="140"
                step="5"
                value={revealRadius}
                onChange={(e) => setRevealRadius(parseInt(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-stone-300 rounded-lg"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-mono text-stone-600">MAP THEME:</span>
              <div className="flex items-center gap-1">
                {(['transparent', 'tactical', 'forest', 'amoled'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setMapTheme(theme)}
                    className={`px-2.5 py-1 text-xs font-mono rounded transition-colors uppercase ${
                      mapTheme === theme
                        ? 'bg-stone-900 text-stone-50 font-medium'
                        : 'bg-stone-200/80 text-stone-700 hover:bg-stone-300'
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* POI Selector for Spatial Radar Target */}
          <div>
            <div className="text-xs font-mono text-stone-700 mb-2 flex items-center justify-between">
              <span>SELECT NATURE POI TARGET</span>
              <span className="text-stone-500">{pois.filter(p => p.discovered).length}/{pois.length} DISCOVERED</span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {pois.map((poi) => (
                <button
                  key={poi.id}
                  onClick={() => setSelectedPoiId(poi.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-mono transition-colors ${
                    selectedPoiId === poi.id
                      ? 'bg-emerald-900/10 border border-emerald-600/30 text-emerald-950 font-medium'
                      : 'bg-stone-200/50 hover:bg-stone-200/90 text-stone-700 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MapPin className={`w-3.5 h-3.5 shrink-0 ${selectedPoiId === poi.id ? 'text-emerald-600' : 'text-stone-500'}`} />
                    <span className="truncate">{poi.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-stone-500">
                    <span>{poi.distance}m</span>
                    <span className="text-[10px] text-stone-400">·</span>
                    <span>{poi.bearing}°</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
