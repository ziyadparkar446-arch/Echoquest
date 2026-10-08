import React, { useState, useEffect, useRef } from 'react';
import { Compass, ExternalLink, Eye, EyeOff, Layers, MapPin, Navigation, Radio, Satellite, Trees, Crosshair, Footprints } from 'lucide-react';
import { GPSCoordinate } from '../types';
import { GeneratedMission } from '../services/geminiMissionService';

interface RealWorldMapProps {
  mission?: GeneratedMission | null;
  playerPos: GPSCoordinate;
  onPlayerPosChange?: (newPos: GPSCoordinate) => void;
  isWalking: boolean;
  onToggleWalk: () => void;
}

export const RealWorldMap: React.FC<RealWorldMapProps> = ({
  mission,
  playerPos,
  onPlayerPosChange,
  isWalking,
  onToggleWalk,
}) => {
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'terrain'>('terrain');
  const [showFog, setShowFog] = useState(true);
  const [gpsAccuracy, setGpsAccuracy] = useState('±3.2m');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Target mission waypoint
  const targetCoords = {
    lat: playerPos.lat + 0.0024,
    lng: playerPos.lng - 0.0018,
    name: mission ? mission.targetLandmark : 'Ancient Redwood Hollow',
    distance: mission ? mission.targetDistanceMeters : 280,
    bearing: mission ? mission.targetBearingDegrees : 335,
  };

  // Google Maps external link
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${targetCoords.lat},${targetCoords.lng}`;

  // Canvas drawing for realistic map styling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = canvas.parentElement?.clientWidth || 700);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 450);

    ctx.clearRect(0, 0, width, height);

    // 1. Basemap color based on Google Maps style
    if (mapType === 'satellite') {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, width, height);
      // Dark canopy textures
      ctx.fillStyle = '#14532d';
      ctx.beginPath();
      ctx.arc(width * 0.35, height * 0.4, 180, 0, Math.PI * 2);
      ctx.arc(width * 0.7, height * 0.6, 220, 0, Math.PI * 2);
      ctx.fill();
    } else if (mapType === 'roadmap') {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, width, height);
      // Road lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.4);
      ctx.lineTo(width, height * 0.5);
      ctx.stroke();
    } else {
      // Terrain mode (Google Maps Terrain with park greens and topographic contours)
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, width, height);

      // National Park Green Zone
      ctx.fillStyle = '#c7ebd1';
      ctx.beginPath();
      ctx.moveTo(width * 0.1, 0);
      ctx.bezierCurveTo(width * 0.3, height * 0.5, width * 0.7, height * 0.3, width, height * 0.2);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // Topo curves
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
      ctx.lineWidth = 1.5;
      for (let r = 50; r < 400; r += 50) {
        ctx.beginPath();
        ctx.ellipse(width * 0.5, height * 0.45, r * 1.2, r * 0.8, 0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // River
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.85);
    ctx.bezierCurveTo(width * 0.4, height * 0.7, width * 0.6, height * 0.3, width * 0.9, 0);
    ctx.stroke();

    // Player position (Center)
    const px = width * 0.45;
    const py = height * 0.55;

    // Target Waypoint Position
    const tx = width * 0.32;
    const ty = height * 0.26;

    // Connecting GPS Bearing Line
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);

    // Player Radar Pulse
    ctx.beginPath();
    ctx.arc(px, py, 26, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#059669';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Target Waypoint Pin
    ctx.beginPath();
    ctx.arc(tx, ty, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Waypoint text label
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText(targetCoords.name, tx + 14, ty + 4);
  }, [mapType, showFog, mission, playerPos]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-stone-800/20 bg-stone-900 shadow-md text-stone-100 select-none">
      {/* Top Map Ribbon */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-stone-800 bg-stone-900/90 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>REAL-WORLD GPS MAP</span>
          </div>
          <span className="text-stone-600">/</span>
          <span className="text-stone-400">GOOGLE MAPS PLATFORM ROUTING</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-emerald-400">
            {playerPos.lat.toFixed(4)}°N, {Math.abs(playerPos.lng).toFixed(4)}°W
          </span>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded text-[11px] transition-colors"
          >
            <span>OPEN IN GOOGLE MAPS</span>
            <ExternalLink className="w-3 h-3 text-stone-400" />
          </a>
        </div>
      </div>

      {/* Main Map Canvas Display */}
      <div className="relative w-full aspect-16/10 min-h-[360px] overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full object-cover" />

        {/* Map Type Controls (Roadmap, Satellite, Terrain) */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-stone-900/85 backdrop-blur-md p-1 rounded-xl border border-stone-700/60 text-xs font-mono">
          <button
            onClick={() => setMapType('terrain')}
            className={`px-2.5 py-1 rounded transition-colors ${
              mapType === 'terrain' ? 'bg-emerald-600 text-stone-950 font-bold' : 'text-stone-300 hover:text-white'
            }`}
          >
            Terrain
          </button>
          <button
            onClick={() => setMapType('satellite')}
            className={`px-2.5 py-1 rounded transition-colors ${
              mapType === 'satellite' ? 'bg-emerald-600 text-stone-950 font-bold' : 'text-stone-300 hover:text-white'
            }`}
          >
            Satellite
          </button>
          <button
            onClick={() => setMapType('roadmap')}
            className={`px-2.5 py-1 rounded transition-colors ${
              mapType === 'roadmap' ? 'bg-emerald-600 text-stone-950 font-bold' : 'text-stone-300 hover:text-white'
            }`}
          >
            Roads
          </button>
        </div>

        {/* Floating Real-World Waypoint Card */}
        <div className="absolute bottom-4 left-4 z-10 bg-stone-900/90 backdrop-blur-md border border-stone-700/80 p-3.5 rounded-2xl max-w-xs text-xs font-mono shadow-lg">
          <div className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            <span>REAL NATURE BEACON:</span>
          </div>
          <div className="text-sm font-display font-bold text-white truncate">
            {targetCoords.name}
          </div>
          <div className="flex justify-between items-center text-stone-400 mt-2 pt-2 border-t border-stone-800">
            <span>Distance: <strong className="text-white">{targetCoords.distance}m</strong></span>
            <span>Bearing: <strong className="text-emerald-400">{targetCoords.bearing}° NW</strong></span>
          </div>
        </div>

        {/* Auto Walk / GPS Step Control */}
        <div className="absolute bottom-4 right-4 z-10">
          <button
            onClick={onToggleWalk}
            className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all shadow-md flex items-center gap-2 ${
              isWalking
                ? 'bg-emerald-500 text-stone-950 scale-102'
                : 'bg-stone-900/90 hover:bg-stone-800 text-white border border-stone-700'
            }`}
          >
            <Footprints className="w-4 h-4" />
            <span>{isWalking ? 'GPS ADVANCING (WALKING)' : 'SIMULATE REAL STEP'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
