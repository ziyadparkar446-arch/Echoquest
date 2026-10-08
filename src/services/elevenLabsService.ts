export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  role: string;
  category?: string;
  gender?: string;
  accent?: string;
  description?: string;
  preview_url?: string;
  preview_prompt?: string;
  avatarEmoji?: string;
  tagColor?: string;
}

export interface ElevenLabsModel {
  id: string;
  name: string;
  description: string;
  badge: string;
}

export interface ElevenLabsStatusResponse {
  configured: boolean;
  hasKey: boolean;
  models: ElevenLabsModel[];
  defaultVoiceId: string;
}

export interface PlaybackState {
  status: 'idle' | 'loading' | 'playing' | 'paused';
  engine: 'elevenlabs' | 'webspeech' | null;
  currentText: string;
  currentVoiceId: string;
  currentTime: number;
  duration: number;
  audioSourceUrl?: string;
}

export const ELEVENLABS_MODELS: ElevenLabsModel[] = [
  {
    id: 'eleven_turbo_v2_5',
    name: 'Eleven Turbo v2.5',
    description: 'High-speed generation with ultra-low latency & natural conversational cadence',
    badge: 'Recommended',
  },
  {
    id: 'eleven_multilingual_v2',
    name: 'Eleven Multilingual v2',
    description: 'Maximal emotional expressiveness and rich ecological tone',
    badge: 'High Fidelity',
  },
  {
    id: 'eleven_flash_v2_5',
    name: 'Eleven Flash v2.5',
    description: 'Blazing fast throughput for rapid tactical outdoor instructions',
    badge: 'Ultra Fast',
  },
];

export const CURATED_VOICES: ElevenLabsVoice[] = [
  {
    voice_id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Bella',
    role: 'Junior Scout Companion',
    gender: 'female',
    accent: 'American',
    avatarEmoji: '🎒',
    tagColor: 'teal',
    description: 'Bright, cheerful, and encouraging tone that celebrates every leaf, trail, and outdoor discovery.',
    preview_prompt:
      'Awesome work! You found the broad leaves! Now let’s craft the dragon wings on the forest floor!',
  },
];

// In-memory audio Blob cache to prevent redundant API calls
const audioBlobCache = new Map<string, string>();

class ElevenLabsVoiceManager {
  private currentAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private playbackListeners: Set<(state: PlaybackState) => void> = new Set();

  private currentState: PlaybackState = {
    status: 'idle',
    engine: null,
    currentText: '',
    currentVoiceId: 'EXAVITQu4vr4xnSDxMaL',
    currentTime: 0,
    duration: 0,
  };

  private selectedVoiceId: string = 'EXAVITQu4vr4xnSDxMaL';
  private selectedModelId: string = 'eleven_turbo_v2_5';
  private stability: number = 0.5;
  private similarityBoost: number = 0.75;
  private isServerKeyConfigured: boolean | null = null;
  private lastPlaybackEndedTimestamp: number = 0;

  constructor() {
    this.checkConfigStatus();
  }

  public async checkConfigStatus(): Promise<boolean> {
    try {
      const res = await fetch('/api/elevenlabs/status');
      if (res.ok) {
        const data = await res.json();
        this.isServerKeyConfigured = Boolean(data.hasKey);
        return this.isServerKeyConfigured;
      }
    } catch (_) {
      this.isServerKeyConfigured = false;
    }
    return false;
  }

  public getIsServerKeyConfigured(): boolean | null {
    return this.isServerKeyConfigured;
  }

  public getSelectedVoice(): ElevenLabsVoice {
    return (
      CURATED_VOICES.find((v) => v.voice_id === this.selectedVoiceId) ||
      CURATED_VOICES[0]
    );
  }

  public getSelectedVoiceId(): string {
    return this.selectedVoiceId;
  }

  public setSelectedVoiceId(id: string) {
    this.selectedVoiceId = id;
    this.notifyState();
  }

  public getSelectedModelId(): string {
    return this.selectedModelId;
  }

  public setSelectedModelId(model: string) {
    this.selectedModelId = model;
  }

  public getSettings() {
    return {
      stability: this.stability,
      similarityBoost: this.similarityBoost,
    };
  }

  public setSettings(stability: number, similarityBoost: number) {
    this.stability = stability;
    this.similarityBoost = similarityBoost;
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
    this.playbackListeners.forEach((listener) => listener(state));
  }

  /**
   * Speak the given text using ElevenLabs neural model with automated fallback
   */
  public async speak(
    text: string,
    options?: {
      voiceId?: string;
      modelId?: string;
      onEnd?: () => void;
    }
  ): Promise<'elevenlabs' | 'webspeech'> {
    this.stop();

    const voiceId = options?.voiceId || this.selectedVoiceId;
    const modelId = options?.modelId || this.selectedModelId;

    this.currentState = {
      status: 'loading',
      engine: 'elevenlabs',
      currentText: text,
      currentVoiceId: voiceId,
      currentTime: 0,
      duration: 0,
    };
    this.notifyState();

    const cacheKey = `${voiceId}_${modelId}_${this.stability}_${this.similarityBoost}_${text}`;

    // 1. Check if cached audio blob exists
    if (audioBlobCache.has(cacheKey)) {
      const cachedUrl = audioBlobCache.get(cacheKey)!;
      try {
        await this.playAudioUrl(cachedUrl, text, voiceId, options?.onEnd);
        return 'elevenlabs';
      } catch (err) {
        console.warn('Playback of cached audio failed, retrying fresh fetch:', err);
      }
    }

    // 2. Call backend ElevenLabs API proxy
    try {
      const response = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voiceId,
          modelId,
          stability: this.stability,
          similarityBoost: this.similarityBoost,
        }),
      });

      const contentType = response.headers.get('content-type') || '';

      // If we received an MP3 audio buffer from ElevenLabs
      if (response.ok && contentType.includes('audio')) {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        audioBlobCache.set(cacheKey, audioUrl);

        this.isServerKeyConfigured = true;
        await this.playAudioUrl(audioUrl, text, voiceId, options?.onEnd);
        return 'elevenlabs';
      }

      // If JSON was returned indicating no API key or fallback needed
      const jsonRes = await response.json();
      console.info('ElevenLabs TTS returned fallback flag:', jsonRes);
      if (jsonRes.reason === 'NO_API_KEY') {
        this.isServerKeyConfigured = false;
      }
    } catch (fetchErr) {
      console.warn('Could not contact ElevenLabs proxy endpoint, falling back to Web Speech:', fetchErr);
    }

    // 3. Graceful Fallback: Web Speech API with tailored pitch/voice matching
    this.speakWithWebSpeechFallback(text, voiceId, options?.onEnd);
    return 'webspeech';
  }

  private async playAudioUrl(
    url: string,
    text: string,
    voiceId: string,
    onEnd?: () => void
  ) {
    const audio = new Audio(url);
    this.currentAudio = audio;

    // Attach Web Audio API analyser for live audio visualizer
    this.setupAudioAnalyser(audio);

    audio.onloadedmetadata = () => {
      this.currentState = {
        status: 'playing',
        engine: 'elevenlabs',
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
      console.error('HTMLAudioElement error:', e);
      this.stop();
      if (onEnd) onEnd();
    };

    try {
      await audio.play();
      this.currentState.status = 'playing';
      this.notifyState();
    } catch (playErr) {
      console.error('Audio play() failed:', playErr);
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
      analyser.smoothingTimeConstant = 0.8;
      this.analyserNode = analyser;

      // Note: createMediaElementSource may only be called once per HTMLAudioElement
      const source = this.audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(this.audioContext.destination);
      this.sourceNode = source;
    } catch (e) {
      // AudioContext policy or multiple connect catches
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
    const voiceMeta = CURATED_VOICES.find((v) => v.voice_id === voiceId) || CURATED_VOICES[0];

    // Tailor prosody to character
    if (voiceMeta.gender === 'female') {
      utterance.pitch = 1.1;
      utterance.rate = 0.95;
    } else {
      utterance.pitch = 0.9;
      utterance.rate = 0.93;
    }

    const availableVoices = window.speechSynthesis.getVoices();
    const matchedVoice = availableVoices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (voiceMeta.gender === 'female'
          ? v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('samantha') || v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('natural')
          : v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('george'))
    ) || availableVoices.find((v) => v.lang.startsWith('en')) || availableVoices[0];

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

  public stop() {
    this.lastPlaybackEndedTimestamp = Date.now();
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (_) {}
      this.currentAudio = null;
    }

    if ('speechSynthesis' in window) {
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
    return this.isSpeaking() || (Date.now() - this.lastPlaybackEndedTimestamp < 1500);
  }

  public pause() {
    if (this.currentAudio && this.currentState.status === 'playing') {
      this.currentAudio.pause();
      this.currentState.status = 'paused';
      this.notifyState();
    } else if ('speechSynthesis' in window && this.currentState.status === 'playing') {
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
    } else if ('speechSynthesis' in window && this.currentState.status === 'paused') {
      window.speechSynthesis.resume();
      this.currentState.status = 'playing';
      this.notifyState();
    }
  }
}

// Global Singleton Instance
export const elevenLabsVoiceManager = new ElevenLabsVoiceManager();
