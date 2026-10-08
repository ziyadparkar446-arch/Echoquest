import React, { useEffect, useRef, useState } from 'react';
import { Compass, Eye, EyeOff, Layers, MapPin, Navigation, Radio, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { GPSCoordinate, PointOfInterest } from '../types';

interface TransparentMapLayerProps {
  opacity: number; // 0.0 to 1.0
  onOpacityChange?: (newVal: number) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  playerPos: GPSCoordinate;
  onPlayerPosChange: React.Dispatch<React.SetStateAction<GPSCoordinate>>;
  selectedPOI: PointOfInterest | null;
  onSelectPOI: (poi: PointOfInterest) => void;
}

export const INITIAL_POIS: PointOfInterest[] = [
  {
    id: 'poi-1',
    name: 'Ancient Redwood Sentinel',
    category: 'flora',
    lat: 37.7765,
    lng: -122.4182,
    distanceMeters: 245,
    bearingDegrees: 34,
    stereoPan: 0.58, // slightly right
    rarity: 'Legendary',
    discovered: true,
    lore: 'A 600-year-old coastal sequoia emitting deep sub-bass acoustic resonations in coastal fog.',
    ecoStat: { bioMass: 940, airPurity: 98, symbiosis: 92 },
  },
  {
    id: 'poi-2',
    name: 'Moss Fox Hollow',
    category: 'fauna',
    lat: 37.7732,
    lng: -122.4218,
    distanceMeters: 310,
    bearingDegrees: 215,
    stereoPan: -0.74, // hard left
    rarity: 'Mythic',
    discovered: true,
    lore: 'Bio-symbiotic woodland spirit covered in velvet ferns; tracks water veins beneath loam.',
    ecoStat: { bioMass: 610, airPurity: 86, symbiosis: 95 },
  },
  {
    id: 'poi-3',
    name: 'Celestial Spore Glade',
    category: 'flora',
    lat: 37.7788,
    lng: -122.4231,
    distanceMeters: 520,
    bearingDegrees: 320,
    stereoPan: -0.42, // mid left
    rarity: 'Rare',
    discovered: false,
    lore: 'Indigo mycological colony that illuminates during dusk humidity peaks.',
    ecoStat: { bioMass: 420, airPurity: 91, symbiosis: 88 },
  },
  {
    id: 'poi-4',
    name: 'Crystalline Brook Weft',
    category: 'water',
    lat: 37.7718,
    lng: -122.4155,
    distanceMeters: 480,
    bearingDegrees: 142,
    stereoPan: 0.81, // hard right
    rarity: 'Common',
    discovered: false,
    lore: 'Natural mineral spring filtering runoff through quartz gravel beds.',
    ecoStat: { bioMass: 780, airPurity: 99, symbiosis: 79 },
  },
];

export const TransparentMapLayer: React.FC<TransparentMapLayerProps> = ({
  opacity,
  onOpacityChange,
  isExpanded = false,
  onToggleExpand,
  playerPos,
  onPlayerPosChange,
  selectedPOI,
  onSelectPOI,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const [mapScale, setMapScale] = useState(1);
  const [showFog, setShowFog] = useState(true);
  const [exploredPercent, setExploredPercent] = useState(38);
  const [mapTheme, setMapTheme] = useState<'minimal' | 'contour' | 'satellite'>('contour');
  const [isSimulatingWalk, setIsSimulatingWalk] = useState(false);
  const walkIntervalRef = useRef<number | null>(null);

  // Fog of war persistent explored points
  const exploredPointsRef = useRef<Array<{ x: number; y: number; r: number }>>([
    { x: 300, y: 300, r: 120 },
    { x: 340, y: 260, r: 90 },
    { x: 260, y: 330, r: 80 },
  ]);

  // Center coordinate reference
  const centerLat = 37.7749;
  const centerLng = -122.4194;

  const latLngToScreen = (lat: number, lng: number, width: number, height: number) => {
    const scale = 36000 * mapScale;
    const x = width / 2 + (lng - centerLng) * scale;
    const y = height / 2 - (lat - centerLat) * scale;
    return { x, y };
  };

  const screenToLatLng = (x: number, y: number, width: number, height: number) => {
    const scale = 36000 * mapScale;
    const lng = centerLng + (x - width / 2) / scale;
    const lat = centerLat - (y - height / 2) / scale;
    return { lat, lng };
  };

  // Render Map Background & Tactical Contours
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 600);

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Map Theme Background
    if (mapTheme === 'satellite') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
    } else if (mapTheme === 'minimal') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);
    } else {
      // Contour Tactical
      ctx.fillStyle = '#1c1f24';
      ctx.fillRect(0, 0, width, height);
    }

    // Grid Lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = mapTheme === 'minimal' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)';
    const gridSize = 48 * mapScale;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Topo Contour Lines (procedural organic curves)
    ctx.strokeStyle = mapTheme === 'minimal' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.15)';
    ctx.lineWidth = 1.2;
    for (let radius = 60; radius < Math.max(width, height) * 0.9; radius += 55 * mapScale) {
      ctx.beginPath();
      const numPoints = 36;
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const noise = Math.sin(angle * 4 + radius * 0.01) * 16 + Math.cos(angle * 2) * 8;
        const px = width / 2 + Math.cos(angle) * (radius + noise);
        const py = height / 2 + Math.sin(angle) * (radius + noise) * 0.75;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // River / Creek Trail
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    const creekStart = latLngToScreen(37.771, -122.424, width, height);
    const creekEnd = latLngToScreen(37.78, -122.414, width, height);
    ctx.moveTo(creekStart.x, creekStart.y);
    ctx.bezierCurveTo(
      width * 0.4,
      height * 0.7,
      width * 0.6,
      height * 0.3,
      creekEnd.x,
      creekEnd.y
    );
    ctx.stroke();
    ctx.setLineDash([]);

    // POI Markers
    INITIAL_POIS.forEach((poi) => {
      const pos = latLngToScreen(poi.lat, poi.lng, width, height);
      const isSelected = selectedPOI?.id === poi.id;

      // Glow ring
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isSelected ? 16 : 8, 0, Math.PI * 2);
      ctx.fillStyle = isSelected
        ? 'rgba(16, 185, 129, 0.3)'
        : poi.discovered
        ? 'rgba(52, 211, 153, 0.15)'
        : 'rgba(148, 163, 184, 0.15)';
      ctx.fill();

      // Core point
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isSelected ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#10b981' : poi.discovered ? '#34d399' : '#94a3b8';
      ctx.fill();

      // Label
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillStyle = mapTheme === 'minimal' ? '#0f172a' : '#f8fafc';
      ctx.fillText(poi.name, pos.x + 12, pos.y + 4);
    });

    // Player Live GPS Marker & Heading Vector
    const pPos = latLngToScreen(playerPos.lat, playerPos.lng, width, height);

    // Sonar pulse rings
    ctx.beginPath();
    ctx.arc(pPos.x, pPos.y, 24, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pPos.x, pPos.y, 44, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Directional Cone (Heading)
    const headingRad = (playerPos.heading - 90) * (Math.PI / 180);
    const coneAngle = Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(pPos.x, pPos.y);
    ctx.arc(pPos.x, pPos.y, 64, headingRad - coneAngle / 2, headingRad + coneAngle / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.fill();

    // Player Pin Core
    ctx.beginPath();
    ctx.arc(pPos.x, pPos.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [mapScale, mapTheme, playerPos, selectedPOI]);

  // Render Dynamic Fog of War Layer
  useEffect(() => {
    if (!showFog) return;
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas) return;
    const fCtx = fogCanvas.getContext('2d');
    if (!fCtx) return;

    const width = (fogCanvas.width = fogCanvas.parentElement?.clientWidth || 800);
    const height = (fogCanvas.height = fogCanvas.parentElement?.clientHeight || 600);

    // 1. Fill entire canvas with dark misty fog
    fCtx.globalCompositeOperation = 'source-over';
    fCtx.fillStyle = mapTheme === 'minimal' ? 'rgba(235, 234, 229, 0.94)' : 'rgba(11, 14, 17, 0.93)';
    fCtx.fillRect(0, 0, width, height);

    // 2. Clear out player's explored radius using 'destination-out'
    fCtx.globalCompositeOperation = 'destination-out';

    // Player current spot
    const pPos = latLngToScreen(playerPos.lat, playerPos.lng, width, height);

    // Add current position to explored points
    const lastPoint = exploredPointsRef.current[exploredPointsRef.current.length - 1];
    const distFromLast = Math.hypot(pPos.x - lastPoint.x, pPos.y - lastPoint.y);
    if (distFromLast > 18) {
      exploredPointsRef.current.push({ x: pPos.x, y: pPos.y, r: 100 });
      setExploredPercent((prev) => Math.min(99, prev + 1));
    }

    // Carve out each explored node
    exploredPointsRef.current.forEach((node) => {
      const fogGrad = fCtx.createRadialGradient(node.x, node.y, node.r * 0.4, node.x, node.y, node.r);
      fogGrad.addColorStop(0, 'rgba(0,0,0,1)');
      fogGrad.addColorStop(0.7, 'rgba(0,0,0,0.85)');
      fogGrad.addColorStop(1, 'rgba(0,0,0,0)');
      fCtx.fillStyle = fogGrad;
      fCtx.beginPath();
      fCtx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      fCtx.fill();
    });

    // Reset composite operation
    fCtx.globalCompositeOperation = 'source-over';
  }, [playerPos, showFog, mapTheme, mapScale]);

  // Handle click on map to move player or select POI
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const width = rect.width;
    const height = rect.height;

    // Check if clicked close to a POI
    for (const poi of INITIAL_POIS) {
      const poiPos = latLngToScreen(poi.lat, poi.lng, width, height);
      const d = Math.hypot(clickX - poiPos.x, clickY - poiPos.y);
      if (d < 24) {
        onSelectPOI(poi);
        return;
      }
    }

    // Otherwise move player towards click
    const newCoords = screenToLatLng(clickX, clickY, width, height);
    const bearing =
      (Math.atan2(newCoords.lng - playerPos.lng, newCoords.lat - playerPos.lat) * (180 / Math.PI) + 360) % 360;

    onPlayerPosChange((prev) => ({
      ...prev,
      lat: Number(newCoords.lat.toFixed(5)),
      lng: Number(newCoords.lng.toFixed(5)),
      heading: Math.round(bearing),
    }));
  };

  // Walk Simulator (moving forward hands-free)
  const toggleWalkSimulation = () => {
    if (isSimulatingWalk) {
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
      setIsSimulatingWalk(false);
    } else {
      setIsSimulatingWalk(true);
      walkIntervalRef.current = window.setInterval(() => {
        onPlayerPosChange((prev) => {
          const stepSize = 0.00015;
          const rad = (prev.heading * Math.PI) / 180;
          return {
            ...prev,
            lat: prev.lat + Math.cos(rad) * stepSize,
            lng: prev.lng + Math.sin(rad) * stepSize,
            altitude: prev.altitude + (Math.random() - 0.5) * 0.4,
          };
        });
      }, 350);
    }
  };

  useEffect(() => {
    return () => {
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
    };
  }, []);

  return (
    <div
      className={`relative w-full h-full transition-opacity duration-300 pointer-events-auto ${
        isExpanded ? 'bg-stone-900/90 backdrop-blur-md' : ''
      }`}
      style={{ opacity }}
    >
      {/* Background Vector Map Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Dynamic Fog of War Canvas Overlay */}
      {showFog && (
        <canvas
          ref={fogCanvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}

      {/* Interactive Click Layer */}
      <div
        className="absolute inset-0 w-full h-full cursor-crosshair z-10"
        onClick={handleMapClick}
      />

      {/* Minimalist Floating Tactical Map Controls */}
      <div className="absolute top-20 right-6 z-20 flex flex-col gap-2">
        <div className="bg-stone-900/85 backdrop-blur-md border border-stone-700/60 p-1.5 flex flex-col gap-1 text-stone-200">
          <button
            onClick={() => setMapScale((s) => Math.min(2.2, s + 0.25))}
            title="Zoom In"
            className="p-2 hover:bg-stone-800 text-stone-300 hover:text-white transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMapScale((s) => Math.max(0.6, s - 0.25))}
            title="Zoom Out"
            className="p-2 hover:bg-stone-800 text-stone-300 hover:text-white transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowFog(!showFog)}
            title={showFog ? 'Hide Fog of War' : 'Show Fog of War'}
            className={`p-2 transition-colors ${
              showFog ? 'text-emerald-400 bg-emerald-950/40' : 'text-stone-400 hover:bg-stone-800'
            }`}
          >
            {showFog ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              exploredPointsRef.current = [{ x: 300, y: 300, r: 120 }];
              setExploredPercent(15);
            }}
            title="Reset Fog"
            className="p-2 hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Walk Simulator Toggle */}
        <button
          onClick={toggleWalkSimulation}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-mono font-medium border backdrop-blur-md transition-colors ${
            isSimulatingWalk
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
              : 'bg-stone-900/80 border-stone-700/60 text-stone-300 hover:text-white hover:bg-stone-800'
          }`}
        >
          <Navigation className={`w-3.5 h-3.5 ${isSimulatingWalk ? 'animate-pulse' : ''}`} />
          <span>{isSimulatingWalk ? 'WALKING...' : 'SIMULATE WALK'}</span>
        </button>
      </div>

      {/* Bottom Telemetry Bar */}
      <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Coordinates readout */}
        <div className="bg-stone-900/85 backdrop-blur-md border border-stone-800/80 px-4 py-2 pointer-events-auto flex items-center gap-4 text-xs font-mono text-stone-300">
          <div>
            <span className="text-stone-500 mr-1.5">LAT</span>
            <span className="text-white font-semibold tabular-nums">{playerPos.lat.toFixed(5)}°N</span>
          </div>
          <span className="text-stone-700">|</span>
          <div>
            <span className="text-stone-500 mr-1.5">LON</span>
            <span className="text-white font-semibold tabular-nums">{Math.abs(playerPos.lng).toFixed(5)}°W</span>
          </div>
          <span className="text-stone-700">|</span>
          <div>
            <span className="text-stone-500 mr-1.5">HEADING</span>
            <span className="text-emerald-400 font-semibold tabular-nums">{playerPos.heading}°</span>
          </div>
          <span className="text-stone-700">|</span>
          <div>
            <span className="text-stone-500 mr-1.5">FOG CLEARED</span>
            <span className="text-emerald-400 font-semibold tabular-nums">{exploredPercent}%</span>
          </div>
        </div>

        {/* Selected POI Stereo Pan Compass */}
        {selectedPOI && (
          <div className="bg-stone-900/90 backdrop-blur-md border border-emerald-500/30 px-4 py-2 pointer-events-auto flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-white font-semibold">{selectedPOI.name}</span>
              <span className="text-stone-400">({selectedPOI.distanceMeters}m)</span>
            </div>

            {/* Binaural Spatial Stereo Panner Meter */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className={`text-[10px] ${selectedPOI.stereoPan < -0.2 ? 'text-emerald-400 font-bold' : 'text-stone-500'}`}>
                EAR: L
              </span>
              <div className="w-20 h-2 bg-stone-800 rounded-full overflow-hidden relative">
                <div
                  className="absolute top-0 bottom-0 w-2.5 bg-emerald-400 rounded-full transition-all duration-300"
                  style={{
                    left: `${((selectedPOI.stereoPan + 1) / 2) * 85}%`,
                  }}
                />
              </div>
              <span className={`text-[10px] ${selectedPOI.stereoPan > 0.2 ? 'text-emerald-400 font-bold' : 'text-stone-500'}`}>
                R
              </span>
            </div>
          </div>
        )}

        {/* Opacity slider control */}
        {onOpacityChange && (
          <div className="bg-stone-900/85 backdrop-blur-md border border-stone-800/80 px-3 py-2 pointer-events-auto flex items-center gap-2 text-xs font-mono text-stone-300">
            <span className="text-stone-500">MAP OPACITY</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
              className="w-20 accent-emerald-500 cursor-pointer"
            />
            <span className="text-emerald-400 tabular-nums">{Math.round(opacity * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
};
