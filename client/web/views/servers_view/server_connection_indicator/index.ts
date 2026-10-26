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

// Preserve exports used elsewhere by the existing Outline components.
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

    .iran-map {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
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

    @keyframes iran-pulse {
      0%, 100% { transform: scale(0.97); }
      50% { transform: scale(1.025); }
    }

    @media (prefers-reduced-motion: reduce) {
      .iran-map { animation: none !important; transition: none; }
    }
  `;

  render() {
    return html`<img
      class="iran-map"
      src=${iranMap}
      alt=""
      aria-hidden="true"
      draggable="false"
    />`;
  }
}
