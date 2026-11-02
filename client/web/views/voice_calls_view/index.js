// Azizan VPN calling pilot — separate from the Outline VPN tunnel.
// Browser and Cordova foreground-only prototype. Not production-ready for Iran.
// In particular this does NOT implement end-to-end encryption or background calls.
import {LitElement, html, css} from 'lit';
import {Room, RoomEvent, Track} from 'livekit-client';
import {VOICE_API_BASE_URL} from './config';

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
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.poller) this.poller = setInterval(() => this.refresh(), 2500);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.poller);
    this.poller = null;
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

  async login() {
    if (this.busy) return;
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

  async callFriend() {
    if (this.busy) return;
    this.busy = true;
    try {
      const {call} = await this.api('calls', 'POST', {to: normalizeUsername(this.friend)});
      this.selectedCall = call;
      this.notice = 'Ringing…';
    } catch (err) { this.notice = errorMessage(err); }
    finally {this.busy = false;}
  }

  async respondToCall(action) {
    const call = this.selectedCall;
    if (!call || this.busy) return;
    this.busy = true;
    try {
      const answer = await this.api(`calls/${call.id}/${action}`, 'POST');
      this.selectedCall = answer.call;
      if (action === 'accept') await this.joinRoom();
      else this.notice = 'Call declined.';
    } catch (err) {this.notice = errorMessage(err);}
    finally {this.busy = false;}
  }

  async endCall() {
    const call = this.selectedCall;
    try { if (call) await this.api(`calls/${call.id}/end`, 'POST'); }
    catch (err) {this.notice = errorMessage(err);}
    finally {await this.leaveRoom(); this.selectedCall = null; this.notice = 'Call ended.';}
  }

  async joinRoom() {
    if (this.room || !this.selectedCall || this.selectedCall.status !== 'accepted') return;
    let room;
    try {
      const {url, token} = await this.api(`calls/${this.selectedCall.id}/token`, 'POST');
      room = new Room({adaptiveStream: false, dynacast: false});
      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.autoplay = true;
        el.dataset.azizanVoice = 'true';
        this.shadowRoot?.appendChild(el);
        el.play().catch(() => {this.notice = 'Tap Join audio again to allow playback.';});
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        track.detach().forEach(el => el.remove());
      });
      room.on(RoomEvent.Disconnected, () => {
        if (this.room === room) {
          this.room = null;
          this.roomConnected = false;
          this.notice = 'Voice connection ended.';
        }
      });
      await room.connect(url, token);
      this.room = room;
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      this.roomConnected = true;
      this.notice = 'Connected to voice room. Microphone on.';
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
    if (current) await current.disconnect().catch(() => {});
    this.shadowRoot?.querySelectorAll('audio[data-azizan-voice]').forEach(el => el.remove());
  }

  async toggleMute() {
    if (!this.room) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(this.muted);
      this.muted = !this.muted;
    } catch (err) {this.notice = errorMessage(err);}
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
    finally {this.polling = false;}
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
        <label>Private invitation secret<input type="password" autocomplete="off" .value=${this.secret} @input=${e => this.secret = e.target.value}></label>
        <button type="button" ?disabled=${this.busy || !configured} @click=${this.login}>Sign in</button>
      ` : html`
        <p class="small">Signed in as @${this.account.username}. Keep the app open to receive a call.</p>
        <label>Friend's username<input placeholder="username" .value=${this.friend} @input=${e => this.friend = e.target.value}></label>
        <button type="button" ?disabled=${this.busy || !!ongoing} @click=${this.callFriend}>Call friend</button>
        ${c ? html`<div class="call">
          <strong>@${c.from === this.account.username ? c.to : c.from}</strong>
          <p>${c.status === 'ringing' ? (ringingToMe ? 'Incoming voice call' : 'Ringing…') : this.roomConnected ? 'Connected to voice room' : c.status === 'accepted' ? 'Answered — join audio' : c.status}</p>
          ${ringingToMe ? html`<button type="button" ?disabled=${this.busy} @click=${() => this.respondToCall('accept')}>Answer</button><button type="button" ?disabled=${this.busy} @click=${() => this.respondToCall('decline')}>Decline</button>` : ''}
          ${c.status === 'accepted' && !this.roomConnected ? html`<button type="button" @click=${this.joinRoom}>Join audio</button>` : ''}
          ${this.roomConnected ? html`<button type="button" @click=${this.toggleMute}>${this.muted ? 'Unmute' : 'Mute'}</button>` : ''}
          ${ongoing ? html`<button class="danger" type="button" @click=${this.endCall}>End call</button>` : ''}
        </div>` : ''}
      `}
      <p class="status" role="status" aria-live="polite">${this.notice}</p>
    </section>`;
  }
}

customElements.define('azizan-voice-calls-view', AzizanVoiceCallsView);
