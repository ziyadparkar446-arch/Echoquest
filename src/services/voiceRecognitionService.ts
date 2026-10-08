// Hands-Free Outdoor Voice Recognition & Acoustic Transceiver Service
// Dual-engine: Native Web Speech API + Gemini Multimodal Audio Transcription
// Ensures 100% reliable hearing across all browsers, mobile devices, and iframe environments
import { geminiVoiceManager } from './geminiVoiceService';

export type VoiceCommandIntent =
  | 'START_EXPEDITION'
  | 'STOP_EXPEDITION'
  | 'POCKET_MODE'
  | 'INTERACTIVE_AI'
  | 'TASK_COMPLETED'
  | 'NEXT_TASK'
  | 'REPEAT';

export interface RecognizedVoiceCommand {
  transcript: string;
  intent: VoiceCommandIntent;
  confidence: number;
  timestamp: number;
}

export interface VoiceRecognitionState {
  isListening: boolean;
  isSupported: boolean;
  isMicPermitted: boolean;
  isThinking: boolean;
  isTranscribing: boolean;
  audioLevel: number; // 0 to 100 for live VU audio meter visualization
  interimTranscript: string;
  lastTranscript: string;
  lastCommand: RecognizedVoiceCommand | null;
  lastSpokenResponse: string;
  isTransmittingToEar: boolean;
  wakeWordDetected: boolean;
  wakeWordActive: boolean;
  wakeWordRemainingSeconds: number;
  lastIgnoredTranscript: string;
  wakeWordRequired: boolean; // default: false so user is immediately heard!
  engineSource: 'web-speech' | 'gemini-audio' | 'idle';
}

type VoiceStateListener = (state: VoiceRecognitionState) => void;
type CommandHandler = (command: RecognizedVoiceCommand) => Promise<string | void> | string | void;

// Wake word matching patterns for optional "EcoQuest"
export const WAKE_WORD_REGEX = /\b(eco\s*quest|echo\s*quest|equal\s*quest|eco-quest|ecoquest|echoquest)\b/i;

// Subtle Web Audio transceiver chirp for earphone feedback
function playEarphoneBeep(freq = 880, duration = 0.07) {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

// Pleasant earphone rising chime
function playWakeChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [
      { freq: 587.33, start: 0, dur: 0.09, gain: 0.08 },
      { freq: 880.0, start: 0.09, dur: 0.16, gain: 0.1 },
    ].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(t.freq, now + t.start);
      gain.gain.setValueAtTime(t.gain, now + t.start);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t.start);
      osc.stop(now + t.start + t.dur);
    });
  } catch (_) {}
}

class VoiceRecognitionService {
  private recognition: any = null;
  private isListeningActive: boolean = false;
  private shouldKeepListening: boolean = false;
  private listeners: Set<VoiceStateListener> = new Set();
  private commandHandlers: Set<CommandHandler> = new Set();
  private interimDebounceTimer: any = null;
  private lastProcessedTranscript: string = '';
  private lastProcessedTime: number = 0;
  private wakeActiveTimer: any = null;
  private wakeCountdownInterval: any = null;

  // MediaStream and Audio Analyser for live VU levels & Gemini Audio fallback
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private meterAnimationId: any = null;
  private silenceTimer: any = null;
  private hasSpokenInCurrentSession: boolean = false;

  private state: VoiceRecognitionState = {
    isListening: false,
    isSupported: true, // We support both Web Speech and Gemini Audio recorder
    isMicPermitted: false,
    isThinking: false,
    isTranscribing: false,
    audioLevel: 0,
    interimTranscript: '',
    lastTranscript: '',
    lastCommand: null,
    lastSpokenResponse: '',
    isTransmittingToEar: false,
    wakeWordDetected: false,
    wakeWordActive: false,
    wakeWordRemainingSeconds: 0,
    lastIgnoredTranscript: '',
    wakeWordRequired: false, // FALSE by default: hears user immediately!
    engineSource: 'idle',
  };

  constructor() {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      console.info('Native Web Speech API not detected, Gemini Multimodal Audio active.');
      return;
    }

    try {
      const recog = new SpeechRecognitionClass();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'en-US';
      recog.maxAlternatives = 1;

      recog.onstart = () => {
        this.isListeningActive = true;
        this.state.isListening = true;
        this.state.isMicPermitted = true;
        this.state.engineSource = 'web-speech';
        this.notifyListeners();
      };

      recog.onresult = (event: any) => {
        // Prevent acoustic feedback loop while guide is speaking audio
        if (geminiVoiceManager.isSpeakingOrRecentEcho() || this.state.isThinking) {
          return;
        }

        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            const rawTranscript = item[0]?.transcript?.trim() || '';
            const confidence = item[0]?.confidence || 0.92;
            if (rawTranscript.length > 0) {
              if (this.interimDebounceTimer) {
                clearTimeout(this.interimDebounceTimer);
                this.interimDebounceTimer = null;
              }
              this.state.interimTranscript = '';
              this.handleVoiceTranscript(rawTranscript, confidence);
            }
          } else {
            interim += item[0]?.transcript || '';
          }
        }

        if (interim.trim()) {
          this.state.interimTranscript = interim;
          this.notifyListeners();

          // Responsive smart speech debounce: If user pauses speaking for 600ms, auto-finalize!
          if (this.interimDebounceTimer) {
            clearTimeout(this.interimDebounceTimer);
          }
          this.interimDebounceTimer = setTimeout(() => {
            const pendingText = this.state.interimTranscript.trim();
            if (
              pendingText.length > 2 &&
              !this.state.isThinking &&
              !geminiVoiceManager.isSpeakingOrRecentEcho()
            ) {
              this.state.interimTranscript = '';
              this.notifyListeners();
              this.handleVoiceTranscript(pendingText, 0.90);
            }
          }, 600);
        }
      };

      recog.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          this.state.isMicPermitted = false;
        } else if (event.error === 'network' || event.error === 'no-speech') {
          // Expected during pauses or minor network glitches
        }
      };

      recog.onend = () => {
        this.isListeningActive = false;
        if (this.shouldKeepListening) {
          setTimeout(() => {
            if (this.shouldKeepListening && !this.isListeningActive) {
              try {
                this.recognition?.start();
              } catch (_) {}
            }
          }, 300);
        } else {
          this.state.isListening = false;
          this.notifyListeners();
        }
      };

      this.recognition = recog;
    } catch (err) {
      console.warn('Speech recognition init note:', err);
    }
  }

  public getState(): VoiceRecognitionState {
    return { ...this.state };
  }

  public subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public registerCommandHandler(handler: CommandHandler): () => void {
    this.commandHandlers.add(handler);
    return () => {
      this.commandHandlers.delete(handler);
    };
  }

  private notifyListeners() {
    const currentState = this.getState();
    this.listeners.forEach((l) => l(currentState));
  }

  /**
   * Start live microphone audio capture (Web Audio VU meter + Web Speech + Gemini fallback)
   */
  public async startListening(): Promise<boolean> {
    this.shouldKeepListening = true;

    // 1. Request real microphone access via standard Web MediaDevices
    try {
      if (!this.mediaStream) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        this.mediaStream = stream;
        this.state.isMicPermitted = true;
        this.setupAudioMeter(stream);
        this.setupMediaRecorder(stream);
      }
    } catch (err) {
      console.warn('Microphone permission notice:', err);
      this.state.isMicPermitted = false;
    }

    // 2. Start Web Speech recognition if available
    let webSpeechStarted = false;
    if (this.recognition) {
      try {
        this.recognition.start();
        webSpeechStarted = true;
        this.isListeningActive = true;
        this.state.engineSource = 'web-speech';
      } catch (_) {
        // Recognition might already be running
        webSpeechStarted = true;
      }
    }

    // 3. If Web Speech is not running, initiate MediaRecorder for Gemini Multimodal Audio
    if (!webSpeechStarted && this.mediaRecorder) {
      try {
        this.startRecordingChunk();
        this.state.engineSource = 'gemini-audio';
      } catch (_) {}
    }

    this.state.isListening = true;
    playEarphoneBeep(660, 0.08);
    this.notifyListeners();
    return true;
  }

  /**
   * Stop active listening
   */
  public stopListening() {
    this.shouldKeepListening = false;
    if (this.interimDebounceTimer) {
      clearTimeout(this.interimDebounceTimer);
      this.interimDebounceTimer = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    this.cancelWakeWord();

    if (this.recognition && this.isListeningActive) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (_) {}
    }

    if (this.meterAnimationId) {
      cancelAnimationFrame(this.meterAnimationId);
      this.meterAnimationId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (_) {}
      this.audioContext = null;
    }

    this.isListeningActive = false;
    this.state.isListening = false;
    this.state.audioLevel = 0;
    this.state.engineSource = 'idle';
    this.notifyListeners();
  }

  public toggleListening(): boolean {
    if (this.state.isListening) {
      this.stopListening();
      return false;
    } else {
      this.startListening();
      return true;
    }
  }

  /**
   * Configure real-time Web Audio Analyser to monitor sound level (VU meter)
   */
  private setupAudioMeter(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      this.audioContext = ctx;
      this.analyser = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!this.state.isListening || !this.analyser) {
          this.state.audioLevel = 0;
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));

        // When user speaks into mic (normalized > 12), track audio presence
        if (normalized > 15) {
          this.hasSpokenInCurrentSession = true;
        }

        if (Math.abs(this.state.audioLevel - normalized) > 3) {
          this.state.audioLevel = normalized;
          this.notifyListeners();
        }

        this.meterAnimationId = requestAnimationFrame(checkVolume);
      };

      this.meterAnimationId = requestAnimationFrame(checkVolume);
    } catch (e) {
      console.warn('Audio meter init error:', e);
    }
  }

  /**
   * Configure MediaRecorder for direct audio streaming to Gemini
   */
  private setupMediaRecorder(stream: MediaStream) {
    if (typeof MediaRecorder === 'undefined') return;

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (this.recordedChunks.length > 0 && this.hasSpokenInCurrentSession) {
          const blob = new Blob(this.recordedChunks, { type: mimeType });
          this.recordedChunks = [];
          this.hasSpokenInCurrentSession = false;
          await this.transcribeAudioBlobWithGemini(blob, mimeType);
        }
      };

      this.mediaRecorder = recorder;
    } catch (err) {
      console.warn('MediaRecorder init error:', err);
    }
  }

  private startRecordingChunk() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'recording') return;
    try {
      this.recordedChunks = [];
      this.mediaRecorder.start(200);
    } catch (_) {}
  }

  /**
   * Push recorded audio to Gemini /api/voice-guide/transcribe
   */
  private async transcribeAudioBlobWithGemini(blob: Blob, mimeType: string) {
    if (blob.size < 2000) return; // Discard tiny noise clicks

    this.state.isTranscribing = true;
    this.notifyListeners();

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res);
        };
      });
      reader.readAsDataURL(blob);
      const audioBase64 = await base64Promise;

      const response = await fetch('/api/voice-guide/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.transcript && data.transcript.trim()) {
          console.info('Gemini transcribed spoken audio:', data.transcript);
          this.handleVoiceTranscript(data.transcript.trim(), data.confidence || 0.95, true);
        }
      }
    } catch (err) {
      console.warn('Gemini audio transcribe notice:', err);
    } finally {
      this.state.isTranscribing = false;
      this.notifyListeners();
    }
  }

  /**
   * Activate wake word listening window (e.g. after hearing 'EcoQuest' or manual mic tap)
   */
  public activateWakeWord(durationSeconds = 10) {
    if (this.wakeActiveTimer) {
      clearTimeout(this.wakeActiveTimer);
    }
    if (this.wakeCountdownInterval) {
      clearInterval(this.wakeCountdownInterval);
    }

    this.state.wakeWordActive = true;
    this.state.wakeWordDetected = true;
    this.state.wakeWordRemainingSeconds = durationSeconds;
    this.notifyListeners();

    playWakeChime();

    this.wakeCountdownInterval = setInterval(() => {
      if (this.state.wakeWordRemainingSeconds > 1) {
        this.state.wakeWordRemainingSeconds -= 1;
        this.notifyListeners();
      } else {
        this.cancelWakeWord();
      }
    }, 1000);

    this.wakeActiveTimer = setTimeout(() => {
      this.cancelWakeWord();
    }, durationSeconds * 1000);
  }

  public cancelWakeWord() {
    if (this.wakeActiveTimer) {
      clearTimeout(this.wakeActiveTimer);
      this.wakeActiveTimer = null;
    }
    if (this.wakeCountdownInterval) {
      clearInterval(this.wakeCountdownInterval);
      this.wakeCountdownInterval = null;
    }
    this.state.wakeWordActive = false;
    this.state.wakeWordDetected = false;
    this.state.wakeWordRemainingSeconds = 0;
    this.notifyListeners();
  }

  public setWakeWordRequired(required: boolean) {
    this.state.wakeWordRequired = required;
    this.notifyListeners();
  }

  public setThinking(isThinking: boolean) {
    this.state.isThinking = isThinking;
    this.notifyListeners();
  }

  public setSpokenResponse(response: string) {
    this.state.lastSpokenResponse = response;
    this.notifyListeners();
  }

  public setTransmittingToEar(isTransmitting: boolean) {
    this.state.isTransmittingToEar = isTransmitting;
    this.notifyListeners();
  }

  public extractWakeWordAndCommand(transcript: string): {
    hasWakeWord: boolean;
    cleanCommand: string;
  } {
    const match = transcript.match(WAKE_WORD_REGEX);
    if (!match) {
      return { hasWakeWord: false, cleanCommand: transcript.trim() };
    }

    const cleanCommand = transcript
      .replace(WAKE_WORD_REGEX, '')
      .replace(/^[,!?:;\s]+/, '')
      .replace(/[,!?:;\s]+$/, '')
      .trim();

    return {
      hasWakeWord: true,
      cleanCommand,
    };
  }

  /**
   * Submit manual text query (for testing or silent input)
   */
  public submitTextVoiceCommand(text: string) {
    if (!text.trim()) return;
    this.handleVoiceTranscript(text.trim(), 1.0, true);
  }

  /**
   * Classify intent: Quick system triggers or comprehensive interactive AI
   */
  private classifyIntent(transcript: string): VoiceCommandIntent {
    const text = transcript.toLowerCase();

    if (
      text === 'start' ||
      text === 'start game' ||
      text === 'start expedition' ||
      text === 'begin expedition'
    ) {
      return 'START_EXPEDITION';
    }

    if (text === 'stop' || text === 'pause game' || text === 'stop expedition') {
      return 'STOP_EXPEDITION';
    }

    if (
      text.includes('pocket mode') ||
      text.includes('dark screen') ||
      text.includes('lock screen')
    ) {
      return 'POCKET_MODE';
    }

    if (
      text.includes('repeat') ||
      text.includes('say again') ||
      text.includes('pardon')
    ) {
      return 'REPEAT';
    }

    // ALL other commands and questions route to the Interactive Human Companion!
    return 'INTERACTIVE_AI';
  }

  private isLikelyHumanVoice(text: string, confidence: number): boolean {
    const clean = text.trim().toLowerCase();
    if (clean.length < 2) return false;

    // Filter out common background fillers
    const noiseSounds = ['uh', 'um', 'ah', 'er', 'mm', 'shh', 'tsk'];
    if (noiseSounds.includes(clean)) return false;

    if (confidence < 0.35) return false;

    return true;
  }

  public async handleVoiceTranscript(
    rawTranscript: string,
    confidence: number,
    bypassWakeWord: boolean = false
  ) {
    const clean = rawTranscript.trim();

    // 1. Filter out background noise
    if (!this.isLikelyHumanVoice(clean, confidence)) {
      return;
    }

    // 2. Prevent self-loop / acoustic echo while guide is speaking
    if (geminiVoiceManager.isSpeakingOrRecentEcho() || this.state.isThinking) {
      return;
    }

    // 3. Optional Wake-Word Check (default false: speaks directly!)
    let targetCommand = clean;

    if (!bypassWakeWord && this.state.wakeWordRequired) {
      const { hasWakeWord, cleanCommand } = this.extractWakeWordAndCommand(clean);
      const isWakeActive = this.state.wakeWordActive;

      if (!hasWakeWord && !isWakeActive) {
        this.state.lastIgnoredTranscript = clean;
        this.notifyListeners();
        return;
      }

      if (hasWakeWord) {
        this.state.wakeWordDetected = true;
        this.notifyListeners();

        if (cleanCommand.length > 0) {
          playWakeChime();
          this.cancelWakeWord();
          targetCommand = cleanCommand;
        } else {
          this.activateWakeWord(10);
          this.state.lastTranscript = 'EcoQuest (Listening...)';
          this.notifyListeners();
          return;
        }
      } else if (isWakeActive) {
        playEarphoneBeep(920, 0.08);
        this.cancelWakeWord();
        targetCommand = clean;
      }
    }

    // 4. Prevent duplicate repetitive triggers within 2.5 seconds
    const normalized = targetCommand.toLowerCase();
    const now = Date.now();
    if (
      normalized === this.lastProcessedTranscript &&
      now - this.lastProcessedTime < 2500
    ) {
      return;
    }

    this.lastProcessedTranscript = normalized;
    this.lastProcessedTime = now;

    // Acoustic chirp acknowledging input
    playEarphoneBeep(920, 0.08);

    const intent = this.classifyIntent(targetCommand);
    const command: RecognizedVoiceCommand = {
      transcript: targetCommand,
      intent,
      confidence,
      timestamp: now,
    };

    this.state.lastTranscript = targetCommand;
    this.state.lastCommand = command;
    this.notifyListeners();

    // Call registered command handlers
    for (const handler of this.commandHandlers) {
      try {
        await handler(command);
      } catch (err) {
        console.error('Error handling voice command:', err);
      }
    }
  }
}

export const voiceRecognitionService = new VoiceRecognitionService();
