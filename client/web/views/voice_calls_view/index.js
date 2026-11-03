// Azizan VPN calling pilot — separate from the Outline VPN tunnel.
// Browser and Cordova foreground-only prototype. Not production-ready for Iran.
// In particular this does NOT implement end-to-end encryption or background calls.
import {LitElement, html, css} from 'lit';
import {Room, RoomEvent, Track} from 'livekit-client';
import {VOICE_API_BASE_URL} from './config';
import {CallTone} from './call_tone';
import {
  getOrCreateDevicePublicKey,
  signDeviceChallenge,
} from './device_auth';

function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}
function errorMessage(error) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

class AzizanVoiceCallsView extends LitElement {
  static properties = {
    username: {state: true},
    secret: {state: true},
    friend: {state: true},
    account: {state: true},
    notice: {state: true},
    selectedCall: {state: true},
    muted: {state: true},
    roomConnected: {state: true},
    busy: {state: true},
    cameraOn: {state: true},
    cameraBusy: {state: true},
    remoteVideoOn: {state: true},
    messagesOpen: {state: true},
    messages: {state: true},
    messageText: {state: true},
    messageBusy: {state: true},
    messageNotice: {state: true},
  };

  constructor() {
    super();
    this.username = '';
    this.secret = '';
    this.friend = '';
    this.account = null;
    this.notice = '';
    this.selectedCall = null;
    this.muted = false;
    this.roomConnected = false;
    this.busy = false;
    this.room = null;
    this.poller = null;
    this.polling = false;
    this.cameraOn = false;
    this.cameraBusy = false;
    this.remoteVideoOn = false;
    this.videoPreferred = false;
    this.messagesOpen = false;
    this.messages = [];
    this.messageText = '';
    this.messageBusy = false;
    this.messageNotice = '';
    this.messageRefreshing = false;
    this.messagePeer = '';
    this.callTone = new CallTone();
    this.onVisibility = () => {
      if (document.hidden) this.callTone.stop();
      else this.syncCallSound();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('visibilitychange', this.onVisibility);
    if (!this.poller) this.poller = setInterval(() => this.refresh(), 2500);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.poller);
    this.poller = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.callTone.close();
    // End media locally when component is removed, independent of VPN state.
    void this.leaveRoom();
  }

  static styles = css`
    :host { display:block; height:100%; width:100%; overflow-y:auto;
      color:var(--outline-text-color,#e4f8f5); background:var(--outline-background,#091c29);
      box-sizing:border-box; padding:20px 16px 48px; font-family:system-ui,sans-serif; }
    .panel { max-width:470px; margin:0 auto; padding:18px; border-radius:16px;
      border:1px solid var(--outline-hairline,#2d5e63); background:var(--outline-background,#0d2531); }
    h1 { font-size:21px; margin:0 0 12px; }
    .warning { border-left:3px solid #e3ad43; padding:10px 12px; font-size:13px;
      background:rgba(210,160,40,.08); margin:14px 0; }
    label {display:block; font-size:14px; margin:16px 0 10px;}
    input {display:block; box-sizing:border-box; width:100%; min-height:44px; font-size:16px;
      border:1px solid #527479; border-radius:10px; padding:10px; margin-top:6px;
      background:var(--outline-background,#071c2a); color:var(--outline-text-color,#f4ffff);}
    button {margin:10px 8px 0 0; border:0; border-radius:9px; min-height:42px;
      background:#19ad9d; padding:10px 14px; color:#042023; font-size:14px; font-weight:700;}
    button:disabled {opacity:.5;} button.danger {background:#e68892;color:#280710;}
    .call {border:1px solid #46827a; border-radius:12px; padding:12px; margin-top:16px;}
    .status {min-height:20px; margin:12px 0; font-size:14px;}
    .small {font-size:13px; opacity:.8; line-height:1.5;}
    [hidden] {display:none!important;}
    .azizan-camera-video {display:grid;gap:10px;margin-top:14px;}
    .azizan-camera-video video {display:block;width:100%;max-height:260px;object-fit:contain;background:#000;border-radius:10px;}
    .azizan-camera-video .local-video video {max-height:140px;}
    .azizan-camera-video .local-video, .azizan-camera-video .remote-video {min-height:0;}
    .azizan-messages-panel {border:1px solid #46827a;border-radius:12px;padding:12px;margin-top:16px;}
    .azizan-messages-panel .thread {max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin:12px 0;}
    .azizan-messages-panel .bubble {padding:9px 12px;border-radius:12px;max-width:85%;overflow-wrap:anywhere;white-space:pre-wrap;background:#2b4654;align-self:flex-start;}
    .azizan-messages-panel .bubble.mine {background:#0e746d;align-self:flex-end;}
    .azizan-messages-panel textarea {width:100%;box-sizing:border-box;min-height:64px;background:#071c2a;color:#f4ffff;border:1px solid #527479;border-radius:10px;padding:10px;font:inherit;}
    .azizan-messages-panel .meta {font-size:11px;opacity:.8;display:block;margin-top:4px;}
  `;

  async api(path, method='GET', data) {
    if (!VOICE_API_BASE_URL || !/^https:\/\//.test(VOICE_API_BASE_URL)) {
      throw new Error('Voice calling is not configured yet. An HTTPS calling backend is required.');
    }
    const response = await fetch(`${VOICE_API_BASE_URL.replace(/\/$/, '')}/api/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.account ? {Authorization: `Bearer ${this.account.token}`} : {}),
      },
      ...(data ? {body: JSON.stringify(data)} : {}),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Server error: ${response.status}`);
    return result;
  }

  syncCallSound() {
    const call = this.selectedCall;
    const mode = this.account && call?.status === 'ringing'
      ? (call.to === this.account.username ? 'incoming' : 'outgoing')
      : null;
    this.callTone.setMode(mode, call?.id);
  }

  // Build 14: invitation-free, device-based voice login.
  async loginWithDevice() {
    if (this.busy) return;
    void this.callTone.unlock();
    this.busy = true;

    try {
      const username = normalizeUsername(this.username);
      if (!username) throw new Error('Enter a username.');

      const publicKey = await getOrCreateDevicePublicKey();

      // Attempt device login first, preserving existing accounts.
      let challenge;

      try {
        const result = await this.api('build14/login/start', 'POST', {
          username,
        });
        challenge = result.challenge;
      } catch (error) {
        // Only register when the account does not exist.
        if (!/Device account not found/.test(errorMessage(error))) {
          throw error;
        }

        const start = await this.api('build14/register/start', 'POST', {
          username,
          publicKey,
        });

        const signature = await signDeviceChallenge(start.challenge);

        await this.api('build14/register/finish', 'POST', {
          username,
          publicKey,
          challenge: start.challenge,
          signature,
        });

        const loginStart = await this.api('build14/login/start', 'POST', {
          username,
        });
        challenge = loginStart.challenge;
      }

      const signature = await signDeviceChallenge(challenge);

      const account = await this.api('build14/login/finish', 'POST', {
        username,
        challenge,
        signature,
      });

      this.account = account;
      this.notice = 'Signed in securely without an invitation.';
      await this.refresh();

    } catch (error) {
      this.notice = errorMessage(error);
    } finally {
      this.busy = false;
    }
  }
  async login() {
    if (this.busy) return;
    void this.callTone.unlock();
    this.busy = true;
    try {
      const account = await this.api('login', 'POST', {
        username: normalizeUsername(this.username), secret: this.secret,
      });
      this.account = account;
      this.secret = ''; // Never store an invitation secret in app storage.
      this.notice = 'Signed in. Keep this page open to receive calls.';
      await this.refresh();
    } catch (err) { this.notice = errorMessage(err); }
    finally {this.busy = false;}
  }

  async callFriend(withVideo = false) {
    if (this.busy) return;
    this.videoPreferred = !!withVideo;
    void this.callTone.unlock();
    this.busy = true;
    try {
      const {call} = await this.api('calls', 'POST', {to: normalizeUsername(this.friend)});
      this.selectedCall = call;
      this.syncCallSound();
      this.notice = 'Ringing…';
    } catch (err) { this.videoPreferred = false; this.notice = errorMessage(err); }
    finally {this.busy = false;}
  }

  async respondToCall(action, withVideo = false) {
    const call = this.selectedCall;
    if (!call || this.busy) return;
    this.busy = true;
    try {
      this.videoPreferred = action === 'accept' && !!withVideo;
      const answer = await this.api(`calls/${call.id}/${action}`, 'POST');
      this.selectedCall = answer.call;
      this.syncCallSound();
      if (action === 'accept') await this.joinRoom();
      else this.notice = 'Call declined.';
    } catch (err) {this.notice = errorMessage(err);}
    finally {this.busy = false;}
  }

  async endCall() {
    const call = this.selectedCall;
    try { if (call) await this.api(`calls/${call.id}/end`, 'POST'); }
    catch (err) {this.notice = errorMessage(err);}
    finally {await this.leaveRoom(); this.selectedCall = null; this.syncCallSound(); this.notice = 'Call ended.';}
  }

  async joinRoom() {
    if (this.room || !this.selectedCall || this.selectedCall.status !== 'accepted') return;
    let room;
    try {
      const {url, token} = await this.api(`calls/${this.selectedCall.id}/token`, 'POST');
      room = new Room({adaptiveStream: false, dynacast: false});
      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind === Track.Kind.Video) {
          const video = track.attach();
          video.autoplay = true;
          video.playsInline = true;
          video.dataset.azizanVideo = 'remote';
          const target = this.renderRoot?.querySelector('.remote-video');
          if (target) {
            target.replaceChildren(video);
            this.remoteVideoOn = true;
            void video.play().catch(() => {});
          } else {
            track.detach().forEach(el => el.remove());
          }
          return;
        }
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.autoplay = true;
        el.dataset.azizanVoice = 'true';
        this.shadowRoot?.appendChild(el);
        el.play().catch(() => {this.notice = 'Tap Join audio again to allow playback.';});
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        track.detach().forEach(el => el.remove());
        if (track.kind === Track.Kind.Video) this.remoteVideoOn = false;
      });
      room.on(RoomEvent.Disconnected, () => {
        if (this.room === room) {
          this.room = null;
          this.roomConnected = false;
          this.cameraOn = false;
          this.remoteVideoOn = false;
          this.videoPreferred = false;
          this.renderRoot?.querySelectorAll('video[data-azizan-video]').forEach(el => el.remove());
          this.notice = 'Voice connection ended.';
        }
      });
      await room.connect(url, token);
      this.room = room;
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      this.roomConnected = true;
      this.notice = 'Connected to voice room. Microphone on.';
      if (this.videoPreferred) await this.setCameraOn(true);
    } catch (err) {
      if (room) await room.disconnect().catch(() => {});
      if (this.room === room) this.room = null;
      this.roomConnected = false;
      this.notice = `Could not join audio: ${errorMessage(err)}`;
    }
  }

  async leaveRoom() {
    const current = this.room;
    this.room = null;
    this.roomConnected = false;
    this.muted = false;
    this.cameraOn = false;
    this.cameraBusy = false;
    this.remoteVideoOn = false;
    this.videoPreferred = false;
    if (current) await current.disconnect().catch(() => {});
    this.shadowRoot?.querySelectorAll('audio[data-azizan-voice]').forEach(el => el.remove());
    this.shadowRoot?.querySelectorAll('video[data-azizan-video]').forEach(el => el.remove());
  }

  // Camera only activates after the user chooses a video option.
  // A camera failure must never end a working voice call.
  async setCameraOn(enabled) {
    if (!this.room || !this.roomConnected || this.cameraBusy) return;
    this.cameraBusy = true;
    try {
      const publication = await this.room.localParticipant.setCameraEnabled(enabled);
      const target = this.renderRoot?.querySelector('.local-video');
      if (target) target.replaceChildren();
      if (enabled) {
        const track = publication?.videoTrack ||
          this.room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
        if (!track) {
          await this.room.localParticipant.setCameraEnabled(false);
          throw new Error('Camera could not start. Check camera permission.');
        }
        const video = track.attach();
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.dataset.azizanVideo = 'local';
        target?.appendChild(video);
        void video.play().catch(() => {});
      }
      this.cameraOn = enabled;
      this.notice = enabled ? 'Camera on. Your video is shared with the other caller.'
        : 'Camera off. Voice call continues.';
    } catch (err) {
      this.cameraOn = false;
      this.notice = 'Video unavailable: ' + errorMessage(err) + '. Voice call continues.';
    } finally {
      this.cameraBusy = false;
    }
  }

  async toggleMute() {
    if (!this.room) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(this.muted);
      this.muted = !this.muted;
    } catch (err) {this.notice = errorMessage(err);}
  }


  // Experimental Build 16 chat. Server-side storage is transient and NOT end-to-end encrypted.
  async toggleMessages() {
    this.messagesOpen = !this.messagesOpen;
    this.messages = [];
    this.messagePeer = '';
    this.messageNotice = '';
    if (this.messagesOpen) await this.refreshMessages();
  }

  async refreshMessages() {
    const peer = normalizeUsername(this.friend);
    if (!this.account || !this.messagesOpen || !peer || this.messageRefreshing) return;
    this.messageRefreshing = true;
    try {
      const result = await this.api('messages?with=' + encodeURIComponent(peer));
      // Ignore an old response if the friend username changed while loading.
      if (normalizeUsername(this.friend) === peer) {
        this.messages = Array.isArray(result.messages) ? result.messages : [];
        this.messagePeer = peer;
        this.messageNotice = '';
      }
    } catch (err) {
      this.messageNotice = 'Messaging unavailable: ' + errorMessage(err);
    } finally {
      this.messageRefreshing = false;
    }
  }

  async sendMessage() {
    const peer = normalizeUsername(this.friend);
    const text = this.messageText.trim();
    if (!this.account || this.messageBusy || !peer || !text || text.length > 1000) return;
    this.messageBusy = true;
    try {
      await this.api('messages', 'POST', {to: peer, text});
      this.messageText = '';
      this.messageNotice = 'Message sent to server.';
      await this.refreshMessages();
    } catch (err) {
      this.messageNotice = 'Message not sent: ' + errorMessage(err);
    } finally {
      this.messageBusy = false;
    }
  }

  async refresh() {
    if (!this.account || this.polling || !VOICE_API_BASE_URL) return;
    this.polling = true;
    try {
      const {calls} = await this.api('state');
      const current = calls.find(c => c.id === this.selectedCall?.id);
      if (current && ['ended', 'declined', 'missed'].includes(current.status)) {
        if (this.room) await this.leaveRoom();
        this.selectedCall = null;
        return;
      }
      const next = current || calls.find(c => ['ringing', 'accepted'].includes(c.status));
      if (next) {
        this.selectedCall = next;
        if (['ended', 'declined', 'missed'].includes(next.status) && this.room) await this.leaveRoom();
      } else if (this.selectedCall) {
        if (this.room) await this.leaveRoom();
        this.selectedCall = null;
      }
    } catch (err) {this.notice = errorMessage(err);}
    finally {this.syncCallSound(); this.polling = false; if (this.messagesOpen) void this.refreshMessages();}
  }

  render() {
    const c = this.selectedCall;
    const ringingToMe = c?.status === 'ringing' && c.to === this.account?.username;
    const ongoing = c && ['ringing', 'accepted'].includes(c.status);
    const configured = /^https:\/\//.test(VOICE_API_BASE_URL);
    return html`<section class="panel">
      <h1>Voice calls / تماس صوتی</h1>
      <p class="small">Call another Azizan user by username. No phone number required.</p>
      <p class="warning">Pilot only. End-to-end encryption and background calling are NOT enabled. Do not use for sensitive conversations.</p>
      ${!configured ? html`<p class="warning" role="status">Calls are not available yet. A separate HTTPS voice-calling backend must be configured before phone testing.</p>` : ''}
      ${!this.account ? html`
        <label>Username<input autocomplete="username" placeholder="azizan1" .value=${this.username} @input=${e => this.username = e.target.value}></label>
        <button type="button"
          ?disabled=${true}
          @click=${this.loginWithDevice}>
          Create account / Sign in without invitation
        </button>        <label>Private invitation secret<input type="password" autocomplete="off" .value=${this.secret} @input=${e => this.secret = e.target.value}></label>
        <button type="button" ?disabled=${this.busy || !configured} @click=${this.login}>Sign in</button>
      ` : html`
        <p class="small">Signed in as @${this.account.username}. Keep the app open to receive a call.</p>
        <button type="button" @click=${async () => {
          const enabled = await this.callTone.unlock();
          this.notice = enabled
            ? 'Ringing sound enabled while this page stays open.'
            : 'Unable to enable ringing sound. Check phone audio settings.';
          this.syncCallSound();
        }}>Enable ringing sound</button>
        <label>Friend's username<input placeholder="username" .value=${this.friend} @input=${e => this.friend = e.target.value}></label>
        <button type="button" ?disabled=${this.busy || !!ongoing} @click=${() => this.callFriend(false)}>Voice call</button>
        <button type="button" ?disabled=${this.busy || !!ongoing} @click=${() => this.callFriend(true)}>Video call</button>
        <button type="button" @click=${this.toggleMessages}>${this.messagesOpen ? 'Hide messages' : 'Messages / پیام‌ها'}</button>
        ${this.messagesOpen ? html`<div class="azizan-messages-panel">
          <strong>Chat with @${normalizeUsername(this.friend) || 'friend'}</strong>
          <p class="small">Experimental messaging. Messages are not end-to-end encrypted, can be read by the server, and disappear after a server restart. Do not send sensitive information. Both users should keep this screen open.</p>
          ${!normalizeUsername(this.friend) ? html`<p class="small">Enter your friend's username above to start messaging.</p>` : html`
            <div class="thread" role="log" aria-label="Message history">
              ${this.messages.map(m => html`<div class="bubble ${m.from === this.account.username ? 'mine' : ''}">
                ${m.text}<span class="meta">@${m.from} · ${new Date(m.created).toLocaleTimeString()}</span>
              </div>`)}
            </div>
            <label>Message<textarea maxlength="1000" placeholder="Type a message..." .value=${this.messageText} @input=${e => this.messageText = e.target.value}></textarea></label>
            <button type="button" ?disabled=${this.messageBusy || !this.messageText.trim()} @click=${this.sendMessage}>Send message</button>
            <button type="button" ?disabled=${this.messageRefreshing} @click=${this.refreshMessages}>Refresh messages</button>
          `}
          <p class="small" role="status">${this.messageNotice}</p>
        </div>` : ''}
        ${c ? html`<div class="call">
          <strong>@${c.from === this.account.username ? c.to : c.from}</strong>
          <p>${c.status === 'ringing' ? (ringingToMe ? 'Incoming voice call' : 'Ringing…') : this.roomConnected ? 'Connected to voice room' : c.status === 'accepted' ? 'Answered — join audio' : c.status}</p>
          ${ringingToMe ? html`<button type="button" ?disabled=${this.busy} @click=${() => this.respondToCall('accept', false)}>Answer voice</button><button type="button" ?disabled=${this.busy} @click=${() => this.respondToCall('accept', true)}>Answer with video</button><button type="button" ?disabled=${this.busy} @click=${() => this.respondToCall('decline')}>Decline</button>` : ''}
          ${c.status === 'accepted' && !this.roomConnected ? html`<button type="button" @click=${this.joinRoom}>Join audio</button>` : ''}
          ${this.roomConnected ? html`<button type="button" @click=${this.toggleMute}>${this.muted ? 'Unmute' : 'Mute'}</button><button type="button" ?disabled=${this.cameraBusy} @click=${() => this.setCameraOn(!this.cameraOn)}>${this.cameraOn ? 'Turn camera off' : 'Turn camera on'}</button>` : ''}
          ${ongoing ? html`<button class="danger" type="button" @click=${this.endCall}>End call</button>` : ''}
        </div>` : ''}
      `}
      <div class="azizan-camera-video" ?hidden=${!this.roomConnected || (!this.cameraOn && !this.remoteVideoOn)}>
        <div class="remote-video"></div>
        <div class="local-video"></div>
      </div>
      <p class="status" role="status" aria-live="polite">${this.notice}</p>
    </section>`;
  }
}

customElements.define('azizan-voice-calls-view', AzizanVoiceCallsView);
