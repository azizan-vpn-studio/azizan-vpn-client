/*
  Copyright 2021 The Outline Authors
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at
       http://www.apache.org/licenses/LICENSE-2.0
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import {Corner, type Menu} from '@material/web/menu/menu';

import {Localizer} from '@outline/infrastructure/i18n';
import {css, html, LitElement, type PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {createRef, Ref, ref} from 'lit/directives/ref.js';

import '../../server_connection_indicator';
import './server_rename_dialog';
import './server_info_dialog';
import {ServerListItem, ServerListItemElement, ServerListItemEvent} from '..';
import {ServerConnectionState} from '../../server_connection_indicator';

// Azizan Live Pulse receives real counts only from a supported native VPN.
// The Capacitor iPhone bootstrap installs this optional, read-only bridge.
// Other platforms remain unavailable rather than showing invented counters.
type AzizanVpnTrafficStats =
  | {available: false}
  | {
      available: true;
      sessionId: string;
      downloadBytes: number;
      uploadBytes: number;
    };

declare global {
  interface Window {
    azizanGetTrafficStats?: (tunnelId: string) => Promise<AzizanVpnTrafficStats>;
  }
}

const sharedCSS = css`
  /* TODO(daniellacosse): reset via postcss */
  h2,
  span,
  footer,
  button,
  div {
    all: initial;
  }

  * {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  :host {
    --server-name-size: 1rem;
    --server-address-size: 0.875rem;

    display: inline-block;
    height: 100%;
    position: relative;
    width: 100%;
  }

  .card {
    align-items: center;
    background: var(--outline-card-background);
    border-radius: var(--outline-corner);
    box-shadow: var(--outline-elevation);
    display: grid;
    gap: var(--outline-slim-gutter);
    grid-gap: var(--outline-slim-gutter);
    overflow: hidden;
    width: 100%;
  }

  .card-metadata {
    font-family: var(--outline-font-family);
    color: var(--outline-text-color);
    gap: var(--outline-slim-gutter);
    grid-area: metadata;
    display: flex;
    align-items: center;
  }

  server-connection-indicator {
    min-height: var(--min-indicator-size);
    max-height: var(--max-indicator-size);
  }

  .card-metadata-server-name,
  .card-metadata-server-address {
    -webkit-box-orient: vertical;
    display: -webkit-box;
    font-family: var(--outline-font-family);
    overflow: hidden;
    text-overflow: ellipsis;
    -webkit-user-select: text;
    user-select: text;
  }

  .card-metadata-server-name {
    /* https://caniuse.com/?search=line-clamp */
    -webkit-line-clamp: 3;
    color: var(--outline-text-color);
    font-size: var(--server-name-size);
    margin-bottom: var(--outline-mini-gutter);
    word-break: break-all;
  }

  .card-metadata-server-address {
    /* https://caniuse.com/?search=line-clamp */
    -webkit-line-clamp: 2;
    color: var(--outline-label-color);
    font-size: var(--server-address-size);
    word-break: break-all;
  }

  .card-menu {
    --md-menu-container-color: var(--outline-card-background);
  }

  .card-menu-button {
    align-self: start;
    grid-area: menu;
    position: relative;
  }

  .card-menu-button md-icon {
    color: var(--outline-text-color);
  }

  .card-footer {
    background: var(--outline-card-footer);
    border-top: var(--outline-hairline);
    box-sizing: border-box;
    grid-area: footer;
    padding: var(--outline-mini-gutter) var(--outline-gutter);
    text-align: end;
  }

  .card-error {
    color: var(--outline-error);
    margin: 0 var(--outline-slim-gutter);
  }

  .card-footer-button {
    --md-sys-color-primary: var(--outline-primary);
    text-transform: uppercase;
  }
`;

// Original Outline shared card controls are retained.
const getSharedComponents = (element: ServerListItemElement & LitElement) => {
  const {server, localize, menu, menuButton} = element;
  const isConnectedState = [
    ServerConnectionState.CONNECTING,
    ServerConnectionState.CONNECTED,
    ServerConnectionState.RECONNECTING,
  ].includes(server.connectionState);
  const hasErrorMessage = Boolean(server.errorMessageId);

  const messages = {
    serverName: server.name,
    error: hasErrorMessage ? localize(server.errorMessageId) : '',
    connectButton: localize(
      isConnectedState ? 'disconnect-button-label' : 'connect-button-label'
    ),
  };

  const dispatchers = {
    beginRename: () => (element.isRenameDialogOpen = true),
    submitRename: (event: CustomEvent) => {
      element.isRenameDialogOpen = false;

      element.dispatchEvent(
        new CustomEvent(ServerListItemEvent.RENAME, {
          detail: {serverId: event.detail.id, newName: event.detail.name},
          bubbles: true,
          composed: true,
        })
      );
    },
    forget: () =>
      element.dispatchEvent(
        new CustomEvent(ServerListItemEvent.FORGET, {
          detail: {serverId: server.id},
          bubbles: true,
          composed: true,
        })
      ),
    connectToggle: () =>
      element.dispatchEvent(
        new CustomEvent(
          isConnectedState
            ? ServerListItemEvent.DISCONNECT
            : ServerListItemEvent.CONNECT,
          {
            detail: {serverId: server.id},
            bubbles: true,
            composed: true,
          }
        )
      ),
  };

  const handleMenuOpen = () => {
    const menuElement = menu.value;
    const menuButtonElement = menuButton.value;

    if (!menuElement) {
      return;
    }

    if (!menuElement.anchorElement) {
      menuElement.anchorElement = menuButtonElement;
    }

    menuElement.show();
  };

  return {
    messages,
    dispatchers,
    elements: {
      metadataText: html`
        <div class="card-metadata-text">
          <h2 class="card-metadata-server-name" id="server-name">
            ${messages.serverName}
          </h2>
          <label class="card-metadata-server-address">${server.address}</label>
        </div>
      `,
      menu: html`
        <md-menu
          ${ref(menu)}
          class="card-menu"
          menuCorner=${Corner.END_END}
          quick
        >
          <md-menu-item @click="${dispatchers.beginRename}">
            ${localize('server-rename')}
          </md-menu-item>
          <md-menu-item @click="${dispatchers.forget}">
            ${localize('server-forget')}
          </md-menu-item>
        </md-menu>
      `,
      menuButton: html`
        <md-icon-button
          ${ref(menuButton)}
          class="card-menu-button"
          @click=${handleMenuOpen}
        >
          <md-icon>more_vert</md-icon>
        </md-icon-button>
      `,
      footer: html`
        <footer class="card-footer">
          <span class="card-error">${messages.error}</span>
          <md-text-button
            class="card-footer-button"
            @click="${dispatchers.connectToggle}"
            ?disabled=${hasErrorMessage}
          >
            ${messages.connectButton}
          </md-text-button>
        </footer>
      `,
      renameDialog: html`<server-rename-dialog
        .open=${element.isRenameDialogOpen}
        .localize=${localize}
        .serverId=${server.id}
        .serverName=${server.name}
        @cancel=${() => (element.isRenameDialogOpen = false)}
        @submit=${dispatchers.submitRename}
      ></server-rename-dialog>`,
    },
  };
};

/**
 * Display a Server as a part of a larger collection.
 */
@customElement('server-row-card')
export class ServerRowCard extends LitElement implements ServerListItemElement {
  @property({type: Boolean}) darkMode = false;
  @property({type: Object}) server: ServerListItem;
  @property({type: Object}) localize: Localizer;

  @state() isRenameDialogOpen = false;

  menu: Ref<Menu> = createRef();
  menuButton: Ref<HTMLElement> = createRef();

  static styles = [
    sharedCSS,
    css`
      .card {
        --min-indicator-size: calc(
          var(--server-name-size) + var(--outline-mini-gutter) +
            var(--server-address-size)
        );
        --max-indicator-size: calc(
          var(--outline-slim-gutter) + var(--server-name-size) +
            var(--outline-mini-gutter) + var(--server-address-size) +
            var(--outline-slim-gutter)
        );

        grid-template-columns: 0 1fr auto 0;
        grid-template-rows: 0 minmax(0, 1fr) auto;
        grid-template-areas:
          '. . . .'
          '. metadata menu .'
          'footer footer footer footer';
      }

      server-connection-indicator {
        float: left;
      }
    `,
  ];

  render() {
    const {elements} = getSharedComponents(this);

    return html`
      <div class="card">
        <div class="card-metadata" aria-labelledby="server-name">
          <server-connection-indicator
            ?darkMode=${this.darkMode}
            connection-state="${this.server.connectionState}"
          ></server-connection-indicator>
          ${elements.metadataText}
        </div>
        ${elements.menuButton} ${elements.footer}
      </div>
      ${elements.menu} ${elements.renameDialog}
    `;
  }
}

/**
 * Display a featured Server in a showcase.
 */
@customElement('server-hero-card')
export class ServerHeroCard
  extends LitElement
  implements ServerListItemElement
{
  @property({type: Object}) server: ServerListItem;
  @property({type: Object}) localize: Localizer;
  @property({type: Boolean}) darkMode = false;

  @state() isRenameDialogOpen = false;
  @state() private connectionElapsedSeconds = 0;
  @state() private trafficDownloadBytes: number | null = null;
  @state() private trafficUploadBytes: number | null = null;
  @state() private trafficDownloadMbps: number | null = null;
  @state() private trafficUploadMbps: number | null = null;

  private trafficPollingTicker: number | undefined;
  private trafficRequestInFlight = false;
  private trafficGeneration = 0;
  private lastTrafficSample:
    | {
        sessionId: string;
        downloadBytes: number;
        uploadBytes: number;
        sampledAt: number;
      }
    | undefined;

  // Time observed by this visible card, not an unverified server-side duration.
  private connectedSince: number | null = null;
  private observedServerId: string | null = null;
  private connectionTicker: number | undefined;

  menu: Ref<Menu> = createRef();
  menuButton: Ref<HTMLElement> = createRef();

  static styles = [
    sharedCSS,
    css`
      .card {
        --min-indicator-size: 192px;
        --max-indicator-size: var(--min-indicator-size);

        grid-template-columns: 0 1fr auto 0;
        grid-template-rows: 0 auto minmax(0, 1fr) auto;
        grid-template-areas:
          '. . . .'
          '. metadata menu .'
          '. button button .'
          'footer footer footer footer';
      }

      .card-connection-button-container {
        grid-area: button;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        height: 100%;
        gap: var(--outline-slim-gutter);
        box-sizing: border-box;
        padding: var(--outline-large-gutter) 0;
      }

      server-connection-indicator {
        cursor: pointer;
      }

      .card-connection-label {
        color: var(--outline-label-color);
        font-size: var(--server-address-size);
        font-family: var(--outline-font-family);
        padding-top: 0.5rem;
      }

      /* Azizan Live Pulse: a real on-screen connection timer. */
      .azizan-live-pulse-timer {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        max-width: 92%;
        padding: 7px 12px;
        border-radius: 16px;
        border: 1px solid rgba(20, 200, 168, 0.33);
        background: rgba(20, 200, 168, 0.07);
        font-family: var(--outline-font-family);
      }

      .azizan-live-pulse-dot {
        box-sizing: border-box;
        display: block;
        flex: 0 0 8px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #19d6b4;
        box-shadow: 0 0 7px rgba(25, 214, 180, 0.75);
        animation: azizan-timer-pulse 1.8s ease-in-out infinite;
      }

      .azizan-live-pulse-label {
        color: var(--outline-label-color);
        font: 0.72rem var(--outline-font-family);
        white-space: nowrap;
      }

      .azizan-live-pulse-value {
        color: var(--outline-primary);
        font: 700 0.88rem var(--outline-font-family);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      /* Real tunnel byte totals and calculated, observed Mbps. */
      .azizan-traffic-panel {
        box-sizing: border-box;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        width: min(330px, 92%);
        padding: 10px;
        border: 1px solid rgba(20, 200, 168, 0.28);
        border-radius: 17px;
        background: rgba(20, 200, 168, 0.045);
        font-family: var(--outline-font-family);
      }

      .azizan-traffic-stat {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        gap: 3px;
        text-align: center;
      }

      .azizan-traffic-title {
        color: var(--outline-label-color);
        font: 0.72rem var(--outline-font-family);
        white-space: nowrap;
      }

      .azizan-traffic-bytes {
        color: var(--outline-primary);
        font: 700 1.02rem var(--outline-font-family);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .azizan-traffic-rate {
        color: var(--outline-text-color);
        font: 0.72rem var(--outline-font-family);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      @keyframes azizan-timer-pulse {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 1; }
      }

      @media (prefers-reduced-motion: reduce) {
        .azizan-live-pulse-dot { animation: none; }
      }
    `,
  ];

  protected override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);
    this.syncConnectionTimer();
  }

  override disconnectedCallback() {
    this.stopConnectionTimer();
    super.disconnectedCallback();
  }

  private syncConnectionTimer() {
    const isConnected =
      this.server?.connectionState === ServerConnectionState.CONNECTED;

    if (!isConnected) {
      this.stopConnectionTimer();
      return;
    }

    // Keep timing for the same server; reset if the user switches servers.
    if (this.connectedSince !== null && this.observedServerId === this.server.id) {
      return;
    }

    this.stopConnectionTimer();
    this.observedServerId = this.server.id;
    this.connectedSince = Date.now();
    this.connectionElapsedSeconds = 0;
    this.connectionTicker = window.setInterval(() => {
      if (this.connectedSince === null) return;
      this.connectionElapsedSeconds = Math.max(
        0,
        Math.floor((Date.now() - this.connectedSince) / 1000)
      );
    }, 1000);
    // Only the iPhone native bootstrap provides this real-data bridge.
    this.startTrafficPolling();
  }

  private startTrafficPolling() {
    if (!window.azizanGetTrafficStats) return;
    this.trafficPollingTicker = window.setInterval(() => {
      void this.pollTrafficStats();
    }, 2000);
    void this.pollTrafficStats();
  }

  private clearTrafficReadings() {
    this.lastTrafficSample = undefined;
    this.trafficDownloadBytes = null;
    this.trafficUploadBytes = null;
    this.trafficDownloadMbps = null;
    this.trafficUploadMbps = null;
  }

  private stopTrafficPolling() {
    if (this.trafficPollingTicker !== undefined) {
      window.clearInterval(this.trafficPollingTicker);
      this.trafficPollingTicker = undefined;
    }
    // Ignore an old asynchronous reply after disconnect or server switch.
    this.trafficGeneration += 1;
    this.trafficRequestInFlight = false;
    this.clearTrafficReadings();
  }

  private async pollTrafficStats() {
    const reader = window.azizanGetTrafficStats;
    const tunnelId = this.observedServerId;
    if (!reader || !tunnelId || this.trafficRequestInFlight) return;

    const generation = this.trafficGeneration;
    this.trafficRequestInFlight = true;
    try {
      const result = await reader(tunnelId);
      if (
        generation !== this.trafficGeneration ||
        this.observedServerId !== tunnelId ||
        this.server?.connectionState !== ServerConnectionState.CONNECTED
      ) return;

      if (
        !result.available ||
        !result.sessionId ||
        !Number.isSafeInteger(result.downloadBytes) ||
        !Number.isSafeInteger(result.uploadBytes) ||
        result.downloadBytes < 0 ||
        result.uploadBytes < 0
      ) {
        this.clearTrafficReadings();
        return;
      }

      const timestamp = performance.now();
      const previous = this.lastTrafficSample;
      if (
        previous &&
        previous.sessionId === result.sessionId &&
        result.downloadBytes >= previous.downloadBytes &&
        result.uploadBytes >= previous.uploadBytes &&
        timestamp > previous.sampledAt
      ) {
        // A live observed rate, not a simulated speed test.
        const seconds = (timestamp - previous.sampledAt) / 1000;
        this.trafficDownloadMbps =
          ((result.downloadBytes - previous.downloadBytes) * 8) /
          (seconds * 1_000_000);
        this.trafficUploadMbps =
          ((result.uploadBytes - previous.uploadBytes) * 8) /
          (seconds * 1_000_000);
      } else {
        // First reading, a restarted VPN extension, or reset counters.
        this.trafficDownloadMbps = null;
        this.trafficUploadMbps = null;
      }

      this.trafficDownloadBytes = result.downloadBytes;
      this.trafficUploadBytes = result.uploadBytes;
      this.lastTrafficSample = {
        sessionId: result.sessionId,
        downloadBytes: result.downloadBytes,
        uploadBytes: result.uploadBytes,
        sampledAt: timestamp,
      };
    } catch {
      // Never claim a measurement succeeded if the tunnel could not supply it.
      if (generation === this.trafficGeneration) this.clearTrafficReadings();
    } finally {
      if (generation === this.trafficGeneration) {
        this.trafficRequestInFlight = false;
      }
    }
  }

  private formatTrafficBytes(bytes: number | null): string {
    if (bytes === null) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
      value /= 1000;
      unit += 1;
    }
    const digits = unit === 0 || value >= 100 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unit]}`;
  }

  private formatTrafficMbps(mbps: number | null): string {
    if (mbps === null || !Number.isFinite(mbps)) return '—';
    return `${mbps.toFixed(2)} Mbps`;
  }

  private stopConnectionTimer() {
    this.stopTrafficPolling();
    if (this.connectionTicker !== undefined) {
      window.clearInterval(this.connectionTicker);
      this.connectionTicker = undefined;
    }
    this.connectedSince = null;
    this.observedServerId = null;
    if (this.connectionElapsedSeconds !== 0) {
      this.connectionElapsedSeconds = 0;
    }
  }

  private get formattedConnectionDuration(): string {
    const totalSeconds = this.connectionElapsedSeconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map(value => value.toString().padStart(2, '0'))
      .join(':');
  }

  render() {
    const {elements, dispatchers, messages} = getSharedComponents(this);

    const connectionStatusText = this.localize(
      `${this.server.connectionState}-server-state`
    );
    const connectToggleKeyboardDispatcher = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.key === 'Enter') {
        dispatchers.connectToggle();
      }
    };

    return html`
      <div class="card">
        <div class="card-metadata" aria-labelledby="server-name">
          ${elements.metadataText}
        </div>
        ${elements.menuButton}
        <div class="card-connection-button-container">
          <server-connection-indicator
            @click="${!this.server.errorMessageId && dispatchers.connectToggle}"
            @keydown="${connectToggleKeyboardDispatcher}"
            connection-state="${this.server.connectionState}"
            ?darkMode="${this.darkMode}"
            id="${messages.connectButton}"
            role="button"
            tabindex="0"
            title="${connectionStatusText}"
          ></server-connection-indicator>
          <label class="card-connection-label" for="${messages.connectButton}">
            ${connectionStatusText}
          </label>
          ${this.server.connectionState === ServerConnectionState.CONNECTED
            ? html`
                <div
                  class="azizan-live-pulse-timer"
                  role="timer"
                  aria-label="Time observed connected since this screen appeared"
                >
                  <span class="azizan-live-pulse-dot" aria-hidden="true"></span>
                  <span class="azizan-live-pulse-label">Live Pulse · متصل</span>
                  <span class="azizan-live-pulse-value">${this.formattedConnectionDuration}</span>
                </div>
                <div class="azizan-traffic-panel" role="group" aria-label="Measured VPN session traffic">
                  <div class="azizan-traffic-stat">
                    <span class="azizan-traffic-title">↓ Download · دریافت</span>
                    <span class="azizan-traffic-bytes">${this.formatTrafficBytes(this.trafficDownloadBytes)}</span>
                    <span class="azizan-traffic-rate">${this.formatTrafficMbps(this.trafficDownloadMbps)}</span>
                  </div>
                  <div class="azizan-traffic-stat">
                    <span class="azizan-traffic-title">↑ Upload · ارسال</span>
                    <span class="azizan-traffic-bytes">${this.formatTrafficBytes(this.trafficUploadBytes)}</span>
                    <span class="azizan-traffic-rate">${this.formatTrafficMbps(this.trafficUploadMbps)}</span>
                  </div>
                </div>
              `
            : ''}
        </div>
        ${elements.footer}
      </div>
      ${elements.menu} ${elements.renameDialog}
    `;
  }
}
