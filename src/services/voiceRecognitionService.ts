// Hands-Free Earphone Voice Recognition Service
// Enables zero-touch verbal interaction for outdoor expedition gameplay
import { elevenLabsVoiceManager } from './elevenLabsService';

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
  interimTranscript: string;
  lastTranscript: string;
  lastCommand: RecognizedVoiceCommand | null;
  lastSpokenResponse: string;
  isTransmittingToEar: boolean;
  wakeWordDetected: boolean;
  wakeWordActive: boolean;
  wakeWordRemainingSeconds: number;
  lastIgnoredTranscript: string;
  wakeWordRequired: boolean;
}

type VoiceStateListener = (state: VoiceRecognitionState) => void;
type CommandHandler = (command: RecognizedVoiceCommand) => Promise<string | void> | string | void;

// Wake word matching patterns for "EcoQuest"
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

// Pleasant earphone rising chime when wake-word "EcoQuest" is detected
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

// Web Speech API interface declarations
interface IWindowSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: IWindowSpeechRecognition, ev: Event) => any) | null;
  onend: ((this: IWindowSpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: IWindowSpeechRecognition, ev: any) => any) | null;
  onresult: ((this: IWindowSpeechRecognition, ev: any) => any) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => IWindowSpeechRecognition;
    webkitSpeechRecognition?: new () => IWindowSpeechRecognition;
  }
}

class VoiceRecognitionService {
  private recognition: IWindowSpeechRecognition | null = null;
  private isListeningActive: boolean = false;
  private shouldKeepListening: boolean = false;
  private listeners: Set<VoiceStateListener> = new Set();
  private commandHandlers: Set<CommandHandler> = new Set();
  private interimDebounceTimer: any = null;
  private lastProcessedTranscript: string = '';
  private lastProcessedTime: number = 0;
  private wakeActiveTimer: any = null;
  private wakeCountdownInterval: any = null;

  private state: VoiceRecognitionState = {
    isListening: false,
    isSupported: false,
    isMicPermitted: false,
    isThinking: false,
    interimTranscript: '',
    lastTranscript: '',
    lastCommand: null,
    lastSpokenResponse: '',
    isTransmittingToEar: false,
    wakeWordDetected: false,
    wakeWordActive: false,
    wakeWordRemainingSeconds: 0,
    lastIgnoredTranscript: '',
    wakeWordRequired: true,
  };

  constructor() {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      this.state.isSupported = false;
      this.notifyListeners();
      return;
    }

    this.state.isSupported = true;

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
        this.notifyListeners();
      };

      recog.onresult = (event: any) => {
        // Prevent feedback loop while guide is speaking audio or during echo cooldown
        if (elevenLabsVoiceManager.isSpeakingOrRecentEcho() || this.state.isThinking) {
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
          if (WAKE_WORD_REGEX.test(interim)) {
            this.state.wakeWordDetected = true;
          }
          this.notifyListeners();

          // Responsive smart speech debounce: If user pauses speaking for 750ms, auto-finalize!
          if (this.interimDebounceTimer) {
            clearTimeout(this.interimDebounceTimer);
          }
          this.interimDebounceTimer = setTimeout(() => {
            const pendingText = this.state.interimTranscript.trim();
            if (
              pendingText.length > 2 &&
              !this.state.isThinking &&
              !elevenLabsVoiceManager.isSpeakingOrRecentEcho()
            ) {
              this.state.interimTranscript = '';
              this.notifyListeners();
              this.handleVoiceTranscript(pendingText, 0.90);
            }
          }, 750);
        }
      };

      recog.onerror = (event: any) => {
        // 'no-speech' is expected during silent walking pauses
        if (event.error === 'not-allowed') {
          this.state.isMicPermitted = false;
          this.shouldKeepListening = false;
          this.isListeningActive = false;
          this.state.isListening = false;
          this.notifyListeners();
        } else if (event.error === 'network') {
          console.warn('Speech recognition network glitch; auto-reconnecting...');
        }
      };

      recog.onend = () => {
        this.isListeningActive = false;
        // Auto-restart loop to keep hands-free listening alive while phone is in pocket
        if (this.shouldKeepListening) {
          setTimeout(() => {
            if (this.shouldKeepListening && !this.isListeningActive) {
              try {
                this.recognition?.start();
              } catch (_) {
                // Ignore start collision
              }
            }
          }, 350);
        } else {
          this.state.isListening = false;
          this.notifyListeners();
        }
      };

      this.recognition = recog;
    } catch (err) {
      console.warn('Failed to initialize speech recognition:', err);
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
   * Start hands-free speech recognition (e.g. when putting phone in pocket with earphones)
   */
  public async startListening(): Promise<boolean> {
    if (!this.state.isSupported || !this.recognition) {
      return false;
    }

    this.shouldKeepListening = true;

    try {
      this.recognition.start();
      playEarphoneBeep(660, 0.08);
      return true;
    } catch (err) {
      this.isListeningActive = true;
      this.state.isListening = true;
      this.notifyListeners();
      return true;
    }
  }

  /**
   * Stop hands-free speech recognition
   */
  public stopListening() {
    this.shouldKeepListening = false;
    if (this.interimDebounceTimer) {
      clearTimeout(this.interimDebounceTimer);
      this.interimDebounceTimer = null;
    }
    this.cancelWakeWord();
    if (this.recognition && this.isListeningActive) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }
    this.isListeningActive = false;
    this.state.isListening = false;
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

  /**
   * Cancel or finish active wake word mode
   */
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

  /**
   * Configure whether saying "EcoQuest" is strictly required before listening
   */
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

  /**
   * Helper to inspect transcript for "EcoQuest" and extract trailing command
   */
  public extractWakeWordAndCommand(transcript: string): {
    hasWakeWord: boolean;
    cleanCommand: string;
  } {
    const match = transcript.match(WAKE_WORD_REGEX);
    if (!match) {
      return { hasWakeWord: false, cleanCommand: transcript.trim() };
    }

    // Strip wake word and surrounding punctuation
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

    // ALL other commands and questions (including "what should I do", "how should I proceed",
    // "where am I", "guide me", "what is this", "I found it") are routed to the Interactive AI!
    return 'INTERACTIVE_AI';
  }

  private isLikelyHumanVoice(text: string, confidence: number): boolean {
    const clean = text.trim().toLowerCase();
    // Too short to be a meaningful command or speech
    if (clean.length < 3) return false;

    // Filter out common background noises or fillers
    const noiseSounds = ['uh', 'um', 'ah', 'er', 'mm', 'shh', 'tsk', 'oh', 'huh', 'eh'];
    if (noiseSounds.includes(clean)) return false;

    // Reject extremely low confidence
    if (confidence < 0.45) return false;

    return true;
  }

  private async handleVoiceTranscript(
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
    if (elevenLabsVoiceManager.isSpeakingOrRecentEcho() || this.state.isThinking) {
      return;
    }

    // 3. WAKE-WORD DETECTION ENGINE ("EcoQuest")
    // Ensures AI agent only listens when user says 'EcoQuest', ignoring background chatter!
    let targetCommand = clean;

    if (!bypassWakeWord && this.state.wakeWordRequired) {
      const { hasWakeWord, cleanCommand } = this.extractWakeWordAndCommand(clean);
      const isWakeActive = this.state.wakeWordActive;

      if (!hasWakeWord && !isWakeActive) {
        // Neither wake-word spoken nor in active wake window:
        // Ignore this background noise completely!
        this.state.lastIgnoredTranscript = clean;
        this.notifyListeners();
        return;
      }

      if (hasWakeWord) {
        // "EcoQuest" detected in speech!
        this.state.wakeWordDetected = true;
        this.notifyListeners();

        // Check if user spoke a command along with the wake word (e.g. "EcoQuest, what do I do?")
        if (cleanCommand.length > 0) {
          // Both wake word & command were provided in single utterance!
          playWakeChime();
          this.cancelWakeWord();
          targetCommand = cleanCommand;
        } else {
          // User said ONLY "EcoQuest" to wake up Bella:
          // Activate 10-second listening window & play welcoming chime
          this.activateWakeWord(10);
          this.state.lastTranscript = 'EcoQuest (Listening...)';
          this.notifyListeners();
          return;
        }
      } else if (isWakeActive) {
        // User previously woke up EcoQuest and is now speaking their command!
        playEarphoneBeep(920, 0.08);
        this.cancelWakeWord();
        targetCommand = clean;
      }
    }

    // 4. Prevent duplicate repetitive triggers within 3.5 seconds
    const normalized = targetCommand.toLowerCase();
    const now = Date.now();
    if (
      normalized === this.lastProcessedTranscript &&
      now - this.lastProcessedTime < 3500
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
