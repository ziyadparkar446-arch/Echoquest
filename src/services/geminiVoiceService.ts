// Interactive AI Human Voice Service
// Powered by Google Gemini Neural Voice (gemini-3.8-flash-lite-tts & gemini-3.8-flash)
// Replaces external third-party speech engines with genuine, human-like voice synthesis

export interface HumanVoice {
  voice_id: string;
  name: string;
  role: string;
  category?: string;
  gender: 'female' | 'male';
  accent?: string;
  description: string;
  preview_prompt: string;
  avatarEmoji: string;
  tagColor: string;
  styleDescription: string;
}

export interface VoiceModelInfo {
  id: string;
  name: string;
  description: string;
  badge: string;
}

export interface PlaybackState {
  status: 'idle' | 'loading' | 'playing' | 'paused';
  engine: 'gemini-neural' | 'webspeech' | null;
  currentText: string;
  currentVoiceId: string;
  currentTime: number;
  duration: number;
  audioSourceUrl?: string;
}

export const HUMAN_VOICES: HumanVoice[] = [
  {
    voice_id: 'Zephyr',
    name: 'Zephyr',
    role: 'Warm Naturalist Companion',
    gender: 'female',
    accent: 'American',
    avatarEmoji: '🌿',
    tagColor: 'emerald',
    styleDescription: 'Enthusiastic, empathetic, and observant. Talks like a passionate best friend walking with you outdoors.',
    description: 'Brimming with curiosity and warmth. Celebrates every leaf, stone, and trail discovery in your ear like a real human companion.',
    preview_prompt:
      'Hey Explorer! Look around—the trail ahead is breathtaking. Take a deep breath of the pine air and tell me what you see!',
  },
  {
    voice_id: 'Puck',
    name: 'Puck',
    role: 'Witty Trail Scout',
    gender: 'male',
    accent: 'American',
    avatarEmoji: '🦊',
    tagColor: 'amber',
    styleDescription: 'Quick, upbeat, energetic, and playful. Keeps you moving with laughs and friendly tactical challenges.',
    description: 'High-energy scout partner who loves brisk trail walks, spotting critters, and discovering hidden nature wonders.',
    preview_prompt:
      'Awesome pace! The canopy up ahead is incredible. Keep your eyes sharp for curved twigs and dry leaves on the ground!',
  },
  {
    voice_id: 'Kore',
    name: 'Kore',
    role: 'Serene Forest Biologist',
    gender: 'female',
    accent: 'American',
    avatarEmoji: '🦉',
    tagColor: 'teal',
    styleDescription: 'Calming, mindful, articulate, and deeply knowledgeable about plants, soil, and living ecosystems.',
    description: 'Mindful nature guide who connects real botanical insight with gentle, soothing wilderness companionship.',
    preview_prompt:
      'Take a slow, mindful step. Feel the cool air moving gently through the trees. Let the forest rhythms guide our journey.',
  },
  {
    voice_id: 'Fenrir',
    name: 'Fenrir',
    role: 'Seasoned Wilderness Tracker',
    gender: 'male',
    accent: 'Deep / Steady',
    avatarEmoji: '🌲',
    tagColor: 'stone',
    styleDescription: 'Calm, confident, steady, and protective. An experienced mountain guide who watches the trail contours.',
    description: 'Reassuring veteran outdoor tracker with deep pathfinding wisdom and keen instincts for terrain and weather.',
    preview_prompt:
      'Steady your stride, Scout. Watch the edges of the trail and follow the natural contours of the earth.',
  },
  {
    voice_id: 'Charon',
    name: 'Charon',
    role: 'Deep Earth Naturalist',
    gender: 'male',
    accent: 'Resonant / Thoughtful',
    avatarEmoji: '🪨',
    tagColor: 'slate',
    styleDescription: 'Rich, resonant storyteller fascinated by geology, stone formations, and riverbeds.',
    description: 'Deep-voiced naturalist who unravels the ancient stories carved into river stones, mossy boulders, and woodland trails.',
    preview_prompt:
      'Listen closely to the earth beneath our boots. Every pebble and creek bed here holds thousands of years of living history.',
  },
];

// Audio cache to prevent redundant synthesis for identical prompts
const audioBlobCache = new Map<string, string>();

export class GeminiVoiceManager {
  private currentAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private playbackListeners: Set<(state: PlaybackState) => void> = new Set();

  private currentState: PlaybackState = {
    status: 'idle',
    engine: null,
    currentText: '',
    currentVoiceId: 'Zephyr',
    currentTime: 0,
    duration: 0,
  };

  private selectedVoiceId: string = 'Zephyr';
  private speechSpeed: number = 1.0;
  private speechWarmth: number = 0.8;
  private lastPlaybackEndedTimestamp: number = 0;
  private isServerConfigured: boolean = true;

  constructor() {
    this.checkConfigStatus();
  }

  public async checkConfigStatus(): Promise<boolean> {
    try {
      const res = await fetch('/api/voice-guide/status');
      if (res.ok) {
        const data = await res.json();
        this.isServerConfigured = Boolean(data.hasKey || data.configured);
        return this.isServerConfigured;
      }
    } catch (_) {
      this.isServerConfigured = true;
    }
    return true;
  }

  public getIsServerConfigured(): boolean {
    return this.isServerConfigured;
  }

  public getSelectedVoice(): HumanVoice {
    return (
      HUMAN_VOICES.find((v) => v.voice_id === this.selectedVoiceId) ||
      HUMAN_VOICES[0]
    );
  }

  public getSelectedVoiceId(): string {
    return this.selectedVoiceId;
  }

  public setSelectedVoiceId(id: string) {
    if (HUMAN_VOICES.some((v) => v.voice_id === id)) {
      this.selectedVoiceId = id;
      this.notifyState();
    }
  }

  public getSpeechSettings() {
    return {
      speed: this.speechSpeed,
      warmth: this.speechWarmth,
    };
  }

  public setSpeechSettings(speed: number, warmth: number) {
    this.speechSpeed = Math.max(0.75, Math.min(1.4, speed));
    this.speechWarmth = Math.max(0, Math.min(1, warmth));
  }

  public getState(): PlaybackState {
    return { ...this.currentState };
  }

  public subscribe(listener: (state: PlaybackState) => void): () => void {
    this.playbackListeners.add(listener);
    listener(this.getState());
    return () => {
      this.playbackListeners.delete(listener);
    };
  }

  private notifyState() {
    const state = this.getState();
    this.playbackListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (e) {
        console.error('Playback listener error:', e);
      }
    });
  }

  /**
   * Speak text with natural human voice synthesis using Gemini Neural Speech,
   * with seamless Web Speech fallback for instant response.
   */
  public async speak(
    text: string,
    options?: {
      voiceId?: string;
      onEnd?: () => void;
      onStart?: () => void;
    }
  ): Promise<'gemini-neural' | 'webspeech'> {
    this.stop();

    if (!text || !text.trim()) {
      return 'webspeech';
    }

    const cleanText = text.replace(/[*#_`]/g, '').trim();
    const voiceId = options?.voiceId || this.selectedVoiceId;

    this.currentState = {
      status: 'loading',
      engine: 'gemini-neural',
      currentText: cleanText,
      currentVoiceId: voiceId,
      currentTime: 0,
      duration: 0,
    };
    this.notifyState();

    const cacheKey = `${voiceId}_${cleanText}`;

    // 1. Check in-memory audio Blob cache
    if (audioBlobCache.has(cacheKey)) {
      const cachedUrl = audioBlobCache.get(cacheKey)!;
      try {
        if (options?.onStart) options.onStart();
        await this.playAudioUrl(cachedUrl, cleanText, voiceId, options?.onEnd);
        return 'gemini-neural';
      } catch (err) {
        console.warn('Playback of cached audio failed, attempting fresh synthesis:', err);
      }
    }

    // 2. Synthesize with Gemini Neural Voice endpoint
    try {
      const response = await fetch('/api/voice-guide/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanText,
          voiceName: voiceId,
          voiceId,
        }),
      });

      const contentType = response.headers.get('content-type') || '';

      if (response.ok && contentType.includes('audio')) {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        audioBlobCache.set(cacheKey, audioUrl);

        if (options?.onStart) options.onStart();
        await this.playAudioUrl(audioUrl, cleanText, voiceId, options?.onEnd);
        return 'gemini-neural';
      }
    } catch (fetchErr) {
      console.warn('Gemini Neural Voice synthesis network notice:', fetchErr);
    }

    // 3. Natural Web Speech API Fallback
    if (options?.onStart) options.onStart();
    this.speakWithWebSpeechFallback(cleanText, voiceId, options?.onEnd);
    return 'webspeech';
  }

  private async playAudioUrl(
    url: string,
    text: string,
    voiceId: string,
    onEnd?: () => void
  ) {
    const audio = new Audio(url);
    audio.playbackRate = this.speechSpeed;
    this.currentAudio = audio;

    // Attach Web Audio API analyser for live audio spectrum visualizer
    this.setupAudioAnalyser(audio);

    audio.onloadedmetadata = () => {
      this.currentState = {
        status: 'playing',
        engine: 'gemini-neural',
        currentText: text,
        currentVoiceId: voiceId,
        currentTime: 0,
        duration: audio.duration || 0,
        audioSourceUrl: url,
      };
      this.notifyState();
    };

    audio.ontimeupdate = () => {
      if (this.currentState.status === 'playing') {
        this.currentState.currentTime = audio.currentTime;
        this.notifyState();
      }
    };

    audio.onended = () => {
      this.lastPlaybackEndedTimestamp = Date.now();
      this.currentState = {
        ...this.currentState,
        status: 'idle',
        currentTime: 0,
      };
      this.notifyState();
      if (onEnd) onEnd();
    };

    audio.onerror = (e) => {
      console.warn('Audio playback notice:', e);
      this.stop();
      if (onEnd) onEnd();
    };

    try {
      await audio.play();
      this.currentState.status = 'playing';
      this.notifyState();
    } catch (playErr) {
      console.warn('Audio play() notice:', playErr);
      this.currentState.status = 'idle';
      this.notifyState();
      if (onEnd) onEnd();
    }
  }

  private setupAudioAnalyser(audio: HTMLAudioElement) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.82;
      this.analyserNode = analyser;

      const source = this.audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(this.audioContext.destination);
      this.sourceNode = source;
    } catch (e) {
      // AudioContext policy handled gracefully
    }
  }

  public getVisualizerData(): Uint8Array | null {
    if (!this.analyserNode || this.currentState.status !== 'playing') {
      return null;
    }
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserNode.getByteFrequencyData(dataArray);
    return dataArray;
  }

  private speakWithWebSpeechFallback(
    text: string,
    voiceId: string,
    onEnd?: () => void
  ) {
    if (!('speechSynthesis' in window)) {
      this.currentState = { ...this.currentState, status: 'idle' };
      this.notifyState();
      if (onEnd) onEnd();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voiceMeta = HUMAN_VOICES.find((v) => v.voice_id === voiceId) || HUMAN_VOICES[0];

    utterance.rate = this.speechSpeed;

    if (voiceMeta.gender === 'female') {
      utterance.pitch = voiceMeta.voice_id === 'Kore' ? 0.98 : 1.12;
    } else {
      utterance.pitch = voiceMeta.voice_id === 'Charon' ? 0.8 : 0.95;
    }

    const availableVoices = window.speechSynthesis.getVoices();
    const matchedVoice =
      availableVoices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (voiceMeta.gender === 'female'
            ? v.name.toLowerCase().includes('natural') ||
              v.name.toLowerCase().includes('female') ||
              v.name.toLowerCase().includes('samantha') ||
              v.name.toLowerCase().includes('victoria')
            : v.name.toLowerCase().includes('natural') ||
              v.name.toLowerCase().includes('male') ||
              v.name.toLowerCase().includes('george') ||
              v.name.toLowerCase().includes('daniel') ||
              v.name.toLowerCase().includes('david'))
      ) ||
      availableVoices.find((v) => v.lang.startsWith('en')) ||
      availableVoices[0];

    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    this.currentState = {
      status: 'playing',
      engine: 'webspeech',
      currentText: text,
      currentVoiceId: voiceId,
      currentTime: 0,
      duration: Math.max(2, text.split(' ').length * 0.38),
    };
    this.notifyState();

    utterance.onend = () => {
      this.lastPlaybackEndedTimestamp = Date.now();
      this.currentState = {
        ...this.currentState,
        status: 'idle',
        currentTime: 0,
      };
      this.notifyState();
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      this.lastPlaybackEndedTimestamp = Date.now();
      this.currentState = {
        ...this.currentState,
        status: 'idle',
      };
      this.notifyState();
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
  }

  /**
   * Immediately stops speech (Barge-in / interruption support)
   */
  public stop() {
    this.lastPlaybackEndedTimestamp = Date.now();
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (_) {}
      this.currentAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    this.currentState = {
      ...this.currentState,
      status: 'idle',
      currentTime: 0,
    };
    this.notifyState();
  }

  public isSpeaking(): boolean {
    const isSynthSpeaking =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      Boolean(window.speechSynthesis.speaking);

    return (
      this.currentState.status === 'playing' ||
      this.currentState.status === 'loading' ||
      isSynthSpeaking
    );
  }

  public isSpeakingOrRecentEcho(): boolean {
    return this.isSpeaking() || Date.now() - this.lastPlaybackEndedTimestamp < 1500;
  }

  public pause() {
    if (this.currentAudio && this.currentState.status === 'playing') {
      this.currentAudio.pause();
      this.currentState.status = 'paused';
      this.notifyState();
    } else if (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      this.currentState.status === 'playing'
    ) {
      window.speechSynthesis.pause();
      this.currentState.status = 'paused';
      this.notifyState();
    }
  }

  public resume() {
    if (this.currentAudio && this.currentState.status === 'paused') {
      this.currentAudio.play();
      this.currentState.status = 'playing';
      this.notifyState();
    } else if (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      this.currentState.status === 'paused'
    ) {
      window.speechSynthesis.resume();
      this.currentState.status = 'playing';
      this.notifyState();
    }
  }
}

// Global Singleton Instance
export const geminiVoiceManager = new GeminiVoiceManager();

// Backwards-compatible aliases to ensure zero breaks across the codebase
export const elevenLabsVoiceManager = geminiVoiceManager;
export type ElevenLabsVoice = HumanVoice;
export const CURATED_VOICES = HUMAN_VOICES;
export const ELEVENLABS_MODELS: VoiceModelInfo[] = [
  {
    id: 'gemini_neural_v3',
    name: 'Gemini Neural Voice Engine',
    description: 'Human-like voice cadence with emotional nuances, prosody, and contextual outdoor awareness',
    badge: 'Real-Time Human',
  },
];
