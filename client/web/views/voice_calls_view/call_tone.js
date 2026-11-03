// Azizan VPN experimental foreground call tones (no copyrighted audio files).
// Ringing is local to the calling screen; iOS background calls need native CallKit/push support.
export class CallTone {
  constructor() {
    this.audio = null;
    this.timer = null;
    this.mode = null;
    this.key = null;
    this.silencedKey = null;
    this.oscillators = new Set();
    this.expiresAt = 0;
  }

  // Call only from a user tap (sign in, call, or Enable ringing sound).
  async unlock() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      if (!this.audio || this.audio.state === 'closed') this.audio = new Context();
      if (this.audio.state !== 'running') await this.audio.resume();
      return this.audio.state === 'running';
    } catch {
      return false;
    }
  }

  tone(at, duration, frequencies) {
    const context = this.audio;
    if (!context || context.state !== 'running') return;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.045, at + 0.025);
    gain.gain.setValueAtTime(0.045, at + duration - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    gain.connect(context.destination);
    let remaining = frequencies.length;
    for (const frequency of frequencies) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      oscillator.connect(gain);
      this.oscillators.add(oscillator);
      oscillator.onended = () => {
        this.oscillators.delete(oscillator);
        oscillator.disconnect();
        if (--remaining === 0) gain.disconnect();
      };
      oscillator.start(at);
      oscillator.stop(at + duration + 0.015);
    }
  }

  pulse() {
    if (document.hidden || this.audio?.state !== 'running') return;
    const at = this.audio.currentTime + 0.015;
    if (this.mode === 'incoming') {
      // Distinct double-chime for a ringing incoming call.
      this.tone(at, 0.32, [440, 660]);
      this.tone(at + 0.53, 0.32, [440, 660]);
    } else if (this.mode === 'outgoing') {
      // Softer ringback for the caller before the recipient answers.
      this.tone(at, 1.25, [440, 480]);
    }
  }

  setMode(mode, callId = '') {
    const key = mode ? mode + ':' + callId : null;
    if (key === this.key) return;
    this.stop();
    if (!mode) { this.silencedKey = null; return; }
    if (document.hidden || key === this.silencedKey) return;
    this.mode = mode;
    this.key = key;
    this.expiresAt = Date.now() + 60000; // Prevent endless audio if updates stop.
    this.pulse();
    this.timer = window.setInterval(() => {
      if (Date.now() >= this.expiresAt) {
        this.silencedKey = this.key;
        this.stop();
      } else if (document.hidden) {
        this.stop();
      } else {
        this.pulse();
      }
    }, mode === 'incoming' ? 3100 : 4500);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.mode = null;
    this.key = null;
    for (const oscillator of this.oscillators) {
      try { oscillator.stop(); } catch { /* already finished */ }
    }
    this.oscillators.clear();
  }

  close() {
    this.stop();
    const context = this.audio;
    this.audio = null;
    if (context) void context.close().catch(() => {});
  }
}
