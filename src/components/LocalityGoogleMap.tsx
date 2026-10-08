import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  MapPin,
  Navigation,
  Maximize2,
  Minimize2,
  Volume2,
  Radio,
  CheckCircle2,
  LocateFixed,
  Crosshair,
  Layers,
} from 'lucide-react';
import { MovementTelemetry, movementTrackingService } from '../services/movementTrackingService';
import { elevenLabsVoiceManager } from '../services/elevenLabsService';
import { hapticFeedback } from '../utils/haptics';

export interface LocalityWaypoint {
  id: string;
  name: string;
  category: 'Canopy' | 'Botanical' | 'Geo' | 'Fauna';
  description: string;
  audioPrompt: string;
  lat: number;
  lng: number;
  icon: string;
  completed: boolean;
  distanceMeters: number;
  bearingDegrees?: number;
}

interface LocalityGoogleMapProps {
  telemetry: MovementTelemetry;
  activeWaypoint: LocalityWaypoint | null;
  waypoints: LocalityWaypoint[];
  onSelectWaypoint: (waypoint: LocalityWaypoint) => void;
  onWaypointCompleted: (waypointId: string) => void;
  focusLocationTrigger?: number;
  onRequestLocation?: () => void;
}

// Dark Wilderness Tactical Map Style
const DARK_WILDERNESS_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#161d19' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111714' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#88998d' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4ade80' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6ee7b7' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#1a3325' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#34d399' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#27332c' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#18241e' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ca3af' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2e4236' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2d25' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0f242b' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#38bdf8' }],
  },
];

// Map controller inside APIProvider to smoothly pan & zoom
const MapCameraController: React.FC<{
  center: { lat: number; lng: number };
  isFollowEnabled: boolean;
  focusTrigger?: number;
}> = ({ center, isFollowEnabled, focusTrigger }) => {
  const map = useMap();
  const prevTrigger = useRef(focusTrigger);

  // Smooth follow
  useEffect(() => {
    if (!map || !isFollowEnabled) return;
    map.panTo(center);
  }, [map, center.lat, center.lng, isFollowEnabled]);

  // Urgent focus when user asks "where am I"
  useEffect(() => {
    if (!map) return;
    if (focusTrigger && focusTrigger !== prevTrigger.current) {
      prevTrigger.current = focusTrigger;
      map.panTo(center);
      map.setZoom(18);
    }
  }, [map, center, focusTrigger]);

  return null;
};

export const LocalityGoogleMap: React.FC<LocalityGoogleMapProps> = ({
  telemetry,
  activeWaypoint,
  waypoints,
  onSelectWaypoint,
  onWaypointCompleted,
  focusLocationTrigger,
  onRequestLocation,
}) => {
  const [apiKey, setApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [selectedPin, setSelectedPin] = useState<LocalityWaypoint | null>(null);
  const [showUserLocationInfo, setShowUserLocationInfo] = useState(false);
  const [isFollowMode, setIsFollowMode] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [mapTheme, setMapTheme] = useState<'wilderness' | 'standard'>('wilderness');

  // Fallback: Fetch config if key was empty initially
  useEffect(() => {
    if (!apiKey) {
      fetch('/api/config')
        .then((res) => res.json())
        .then((data) => {
          if (data.googleMapsApiKey) {
            setApiKey(data.googleMapsApiKey);
          }
        })
        .catch(() => {});
    }
  }, [apiKey]);

  const userPosition = useMemo(
    () => ({
      lat: telemetry.latitude,
      lng: telemetry.longitude,
    }),
    [telemetry.latitude, telemetry.longitude]
  );

  // When parent signals focus trigger (e.g. user asks "where am I"), open the user InfoWindow!
  useEffect(() => {
    if (focusLocationTrigger && focusLocationTrigger > 0) {
      setShowUserLocationInfo(true);
      setIsFollowMode(true);
    }
  }, [focusLocationTrigger]);

  const handleManualLocateMe = async () => {
    hapticFeedback.buttonPress();
    setIsLocating(true);
    try {
      if (onRequestLocation) {
        onRequestLocation();
      }
      const coords = await movementTrackingService.requestCurrentLocation();
      setShowUserLocationInfo(true);
      setIsFollowMode(true);
      elevenLabsVoiceManager.speak(
        `GPS lock acquired. Your location is ${
          telemetry.localityName || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
        }.`,
        { voiceId: elevenLabsVoiceManager.getSelectedVoiceId() }
      );
    } finally {
      setIsLocating(false);
    }
  };

  const handleSpeakWaypoint = (wp: LocalityWaypoint, e: React.MouseEvent) => {
    e.stopPropagation();
    hapticFeedback.buttonPress();
    elevenLabsVoiceManager.speak(
      `Waypoint objective: ${wp.name}. ${wp.description}. Distance is ${wp.distanceMeters} meters away.`,
      {
        voiceId: elevenLabsVoiceManager.getSelectedVoiceId(),
      }
    );
  };

  if (!apiKey) {
    return (
      <div className="p-8 rounded-3xl bg-stone-900 border border-stone-800 text-center text-stone-300 font-mono text-xs space-y-3">
        <MapPin className="w-10 h-10 mx-auto text-emerald-400 animate-pulse" />
        <p className="text-white font-bold text-sm tracking-wide">CONNECTING GOOGLE MAPS PLATFORM</p>
        <p className="text-stone-400 max-w-sm mx-auto">
          Loading Google Maps API credentials to display your live position and outdoor waypoints.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-3xl overflow-hidden border border-emerald-500/40 bg-[#0d1413] shadow-2xl transition-all duration-300 flex flex-col ${
        isExpanded ? 'h-[640px] ring-2 ring-emerald-500/50' : 'h-[400px] sm:h-[460px]'
      }`}
    >
      {/* Top Tactical Map Ribbon */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none gap-2">
        <div className="pointer-events-auto flex items-center gap-2 bg-black/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-emerald-500/40 text-xs font-mono text-white shadow-lg">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            <span className="hidden xs:inline">GPS RADAR</span>
          </div>
          <span className="text-stone-600">|</span>
          <span className="text-emerald-300 font-bold truncate max-w-[140px] sm:max-w-[200px]">
            {telemetry.localityName || `${userPosition.lat.toFixed(4)}, ${userPosition.lng.toFixed(4)}`}
          </span>
          <span className="text-stone-600 hidden sm:inline">|</span>
          <span className="text-[10px] text-stone-400 hidden sm:inline">
            ±{Math.round(telemetry.accuracy || 5)}m
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          {/* Ask/Locate Me Quick Button */}
          <button
            onClick={handleManualLocateMe}
            disabled={isLocating}
            title="Locate me right now"
            className="px-2.5 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 backdrop-blur-md transition-all bg-emerald-500 text-stone-950 hover:bg-emerald-400 shadow-md active:scale-95 cursor-pointer disabled:opacity-75"
          >
            <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
            <span>{isLocating ? 'LOCATING...' : 'LOCATE ME'}</span>
          </button>

          {/* Map theme switcher */}
          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              setMapTheme(mapTheme === 'wilderness' ? 'standard' : 'wilderness');
            }}
            title="Toggle map theme"
            className="px-2 py-1.5 rounded-xl bg-black/80 hover:bg-neutral-800 border border-stone-700 text-stone-300 hover:text-white font-mono text-xs flex items-center gap-1 backdrop-blur-md transition-all cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{mapTheme === 'wilderness' ? 'Dark' : 'Road'}</span>
          </button>

          {/* Follow toggle */}
          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              setIsFollowMode(!isFollowMode);
            }}
            title={isFollowMode ? 'Auto-centering GPS active' : 'Click to re-center on player'}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border font-mono text-xs flex items-center gap-1.5 backdrop-blur-md transition-all cursor-pointer ${
              isFollowMode
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                : 'bg-black/80 border-stone-700 text-stone-400 hover:text-white'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Follow</span>
          </button>

          {/* Expand/Minimize */}
          <button
            onClick={() => {
              hapticFeedback.tactileClick();
              setIsExpanded(!isExpanded);
            }}
            className="w-8 h-8 rounded-xl bg-black/80 hover:bg-neutral-800 border border-stone-700 text-stone-300 hover:text-white flex items-center justify-center backdrop-blur-md transition-all cursor-pointer"
            aria-label={isExpanded ? 'Minimize map' : 'Expand map'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Google Maps Container */}
      <div className="flex-1 w-full h-full relative">
        <APIProvider apiKey={apiKey}>
          <Map
            mapId="DEMO_MAP_ID"
            defaultCenter={userPosition}
            defaultZoom={17}
            minZoom={13}
            maxZoom={20}
            gestureHandling="greedy"
            disableDefaultUI={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            styles={mapTheme === 'wilderness' ? DARK_WILDERNESS_STYLES : []}
            className="w-full h-full"
          >
            <MapCameraController
              center={userPosition}
              isFollowEnabled={isFollowMode}
              focusTrigger={focusLocationTrigger}
            />

            {/* User Real-Time Position Marker */}
            <AdvancedMarker
              position={userPosition}
              title="Your Real-Time GPS Location"
              onClick={() => {
                hapticFeedback.tactileClick();
                setShowUserLocationInfo(!showUserLocationInfo);
              }}
            >
              <div className="relative flex items-center justify-center cursor-pointer group">
                {/* Sonar pulses */}
                <span className="absolute w-14 h-14 rounded-full bg-emerald-400/25 animate-ping" />
                <span className="absolute w-9 h-9 rounded-full bg-emerald-500/40 animate-pulse" />
                {/* Core Player Avatar Pin */}
                <div
                  className="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-[0_0_15px_rgba(52,211,153,0.95)] flex items-center justify-center text-white transition-transform group-hover:scale-110"
                  style={{
                    transform: `rotate(${telemetry.headingDegrees || 0}deg)`,
                  }}
                >
                  <Navigation className="w-4 h-4 fill-white" />
                </div>
                {/* Badge Tag */}
                <div className="absolute -top-7 whitespace-nowrap bg-emerald-950/90 text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border border-emerald-400 shadow-md">
                  YOU ARE HERE
                </div>
              </div>
            </AdvancedMarker>

            {/* User Location Info Window */}
            {showUserLocationInfo && (
              <InfoWindow
                position={userPosition}
                onCloseClick={() => setShowUserLocationInfo(false)}
              >
                <div className="p-1 max-w-[240px] text-stone-900 font-sans">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900 mb-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    <span>YOUR CURRENT LOCATION</span>
                  </div>
                  <p className="text-xs font-semibold text-stone-800 mb-1 leading-snug">
                    {telemetry.localityName || 'GPS Location Detected'}
                  </p>
                  <div className="text-[10px] font-mono text-stone-500 space-y-0.5 border-t pt-1.5">
                    <div>Lat: {userPosition.lat.toFixed(5)}°</div>
                    <div>Lng: {userPosition.lng.toFixed(5)}°</div>
                    <div>Accuracy: ±{Math.round(telemetry.accuracy || 5)}m</div>
                    <div>Status: {telemetry.state === 'MOVING' ? `Moving (${telemetry.speedMps} m/s)` : 'Stationary at rest'}</div>
                  </div>
                </div>
              </InfoWindow>
            )}

            {/* Localized Exploration Waypoints */}
            {waypoints.map((wp) => {
              const isActive = activeWaypoint?.id === wp.id;

              return (
                <AdvancedMarker
                  key={wp.id}
                  position={{ lat: wp.lat, lng: wp.lng }}
                  onClick={() => {
                    hapticFeedback.tactileClick();
                    setSelectedPin(wp);
                    onSelectWaypoint(wp);
                  }}
                  title={wp.name}
                >
                  <div
                    className={`relative cursor-pointer transition-transform hover:scale-110 ${
                      isActive ? 'scale-110 z-20' : 'z-10'
                    }`}
                  >
                    <div
                      className={`px-2 py-1 rounded-xl flex items-center gap-1.5 shadow-lg font-mono text-xs border ${
                        wp.completed
                          ? 'bg-stone-900/90 border-stone-700 text-stone-400'
                          : isActive
                          ? 'bg-emerald-950/95 border-emerald-400 text-emerald-300 ring-2 ring-emerald-500/50'
                          : 'bg-black/90 border-stone-600 text-white'
                      }`}
                    >
                      <span className="text-sm select-none">{wp.icon}</span>
                      <span className="font-bold text-[11px] truncate max-w-[90px]">
                        {wp.name}
                      </span>
                      {wp.completed && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                    </div>

                    {/* Ground target beacon pin */}
                    <div className="w-1.5 h-3 mx-auto bg-emerald-400 rounded-b-full shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                  </div>
                </AdvancedMarker>
              );
            })}

            {/* Waypoint Info Window */}
            {selectedPin && (
              <InfoWindow
                position={{ lat: selectedPin.lat, lng: selectedPin.lng }}
                onCloseClick={() => setSelectedPin(null)}
              >
                <div className="p-1 max-w-[220px] text-stone-900 font-sans">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900 mb-1">
                    <span>{selectedPin.icon}</span>
                    <span>{selectedPin.name}</span>
                  </div>
                  <p className="text-[11px] text-stone-600 mb-2 leading-relaxed">
                    {selectedPin.description}
                  </p>
                  <div className="flex items-center justify-between gap-2 border-t pt-2 text-[10px] font-mono text-stone-500">
                    <span>{selectedPin.distanceMeters}m away</span>
                    <button
                      onClick={(e) => handleSpeakWaypoint(selectedPin, e)}
                      className="px-2 py-1 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>Audio</span>
                    </button>
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>

      {/* Bottom Locality Navigation Bar */}
      <div className="p-3 bg-black/95 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-stone-300">
            <Compass className="w-4 h-4 text-emerald-400" />
            <span className="font-bold">
              {activeWaypoint ? `${activeWaypoint.name}` : 'Free Roam Locality'}
            </span>
          </div>
          {activeWaypoint && (
            <span className="text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
              {activeWaypoint.distanceMeters}m AHEAD
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (activeWaypoint) {
                hapticFeedback.missionComplete();
                onWaypointCompleted(activeWaypoint.id);
                elevenLabsVoiceManager.speak(
                  `Objective ${activeWaypoint.name} completed! Great observation, Scout. Marking waypoint complete.`,
                  { voiceId: elevenLabsVoiceManager.getSelectedVoiceId() }
                );
              }
            }}
            disabled={!activeWaypoint || activeWaypoint.completed}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeWaypoint && !activeWaypoint.completed
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black active:scale-95 shadow-md shadow-emerald-950/50'
                : 'bg-stone-800 text-stone-500 cursor-not-allowed'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Mark Arrived</span>
          </button>
        </div>
      </div>
    </div>
  );
};
