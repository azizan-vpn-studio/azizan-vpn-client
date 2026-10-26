/*
  Copyright 2026 The Outline Authors
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

import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';

import iranMap from '../../../assets/iran-lion-sun-map.png';

// Keep these exports compatible with the existing Outline components.
export const SERVER_CONNECTION_INDICATOR_DURATION_MS = 1750;
export const SERVER_CONNECTION_INDICATOR_DELAY_MS = 500;

export enum ServerConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
}

@customElement('server-connection-indicator')
export class ServerConnectionIndicator extends LitElement {
  @property({attribute: 'connection-state', reflect: true})
  connectionState: ServerConnectionState = ServerConnectionState.DISCONNECTED;

  @property({type: Boolean, reflect: true}) darkMode = false;

  static styles = css`
    :host {
      display: inline-flex;
      height: 100%;
      aspect-ratio: 1;
      position: relative;
      align-items: center;
      justify-content: center;
      outline: 0;
    }

    /* The original Iran map is retained, including its VPN-state colors. */
    .iran-map {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      position: relative;
      z-index: 1;
      pointer-events: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      transition: filter 350ms ease, opacity 350ms ease;
    }

    :host([connection-state='connected']) .iran-map {
      opacity: 1;
      filter: drop-shadow(0 0 5px rgba(37, 255, 196, 0.94))
        drop-shadow(0 0 16px rgba(37, 255, 196, 0.58));
    }

    :host([connection-state='connecting']) .iran-map,
    :host([connection-state='reconnecting']) .iran-map {
      opacity: 0.92;
      filter: drop-shadow(0 0 9px rgba(37, 255, 196, 0.65));
      animation: iran-pulse 1.75s ease-in-out infinite;
    }

    :host([connection-state='disconnected']) .iran-map,
    :host([connection-state='disconnecting']) .iran-map {
      opacity: 0.64;
      filter: grayscale(1) brightness(0.68);
    }

    /* Azizan Live Pulse: decorative particles, visible only when connected. */
    .pulse-field {
      position: absolute;
      inset: 0;
      opacity: 0;
      pointer-events: none;
      transition: opacity 350ms ease;
    }

    :host([connection-state='connected']) .pulse-field {
      opacity: 1;
    }

    .orbit {
      box-sizing: border-box;
      position: absolute;
      top: 50%;
      left: 50%;
      border: 1px solid rgba(37, 255, 196, 0.28);
      border-radius: 50%;
      animation-play-state: paused;
    }

    :host([connection-state='connected']) .orbit {
      animation-play-state: running;
    }

    .orbit::before,
    .orbit::after {
      content: '';
      position: absolute;
      display: block;
      border-radius: 50%;
      background: #43ffda;
      box-shadow: 0 0 5px 2px rgba(37, 255, 196, 0.75),
        0 0 12px 4px rgba(37, 255, 196, 0.40);
    }

    .orbit::before {
      width: 7px;
      height: 7px;
      top: 50%;
      left: -4px;
    }

    .orbit::after {
      width: 4px;
      height: 4px;
      right: 10%;
      top: 4%;
      opacity: 0.75;
    }

    .orbit-one {
      width: 116%;
      height: 72%;
      animation: azizan-orbit-one 9s linear infinite;
    }

    .orbit-two {
      width: 112%;
      height: 80%;
      border-color: rgba(37, 255, 196, 0.16);
      animation: azizan-orbit-two 12s linear infinite;
    }

    .orbit-three {
      width: 121%;
      height: 64%;
      border-color: rgba(37, 255, 196, 0.13);
      animation: azizan-orbit-three 15s linear infinite;
    }

    @keyframes azizan-orbit-one {
      from { transform: translate(-50%, -50%) rotate(-18deg); }
      to   { transform: translate(-50%, -50%) rotate(342deg); }
    }

    @keyframes azizan-orbit-two {
      from { transform: translate(-50%, -50%) rotate(60deg); }
      to   { transform: translate(-50%, -50%) rotate(-300deg); }
    }

    @keyframes azizan-orbit-three {
      from { transform: translate(-50%, -50%) rotate(112deg); }
      to   { transform: translate(-50%, -50%) rotate(472deg); }
    }

    @keyframes iran-pulse {
      0%, 100% { transform: scale(0.97); }
      50% { transform: scale(1.025); }
    }

    @media (prefers-reduced-motion: reduce) {
      .iran-map { animation: none !important; transition: none; }
      .pulse-field { display: none; }
    }
  `;

  render() {
    return html`
      <span class="pulse-field" aria-hidden="true">
        <span class="orbit orbit-one"></span>
        <span class="orbit orbit-two"></span>
        <span class="orbit orbit-three"></span>
      </span>
      <img
        class="iran-map"
        src=${iranMap}
        alt=""
        aria-hidden="true"
        draggable="false"
      />
    `;
  }
}
