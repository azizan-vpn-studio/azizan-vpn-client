/**
 * Copyright 2026 The Outline Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {PluginListenerHandle} from '@capacitor/core';

/**
 * Aggregate packet counts returned by the iOS VPN extension.
 * Counts are for the current extension session, not lifetime totals.
 * Not available on other platforms until implemented there.
 */
export type AzizanTrafficStats =
  | {available: false}
  | {
      available: true;
      sessionId: string;
      downloadBytes: number;
      uploadBytes: number;
    };

export interface CapacitorPluginOutline {
  invokeMethod(options: {
    method: string;
    input: string;
  }): Promise<{value: string}>;
  start(options: {
    tunnelId: string;
    serverName: string;
    transportConfig: string;
  }): Promise<void>;
  stop(options: {tunnelId: string}): Promise<void>;
  isRunning(options: {tunnelId: string}): Promise<{isRunning: boolean}>;
  /**
   * Read-only counters for the specified tunnel from its VPN extension.
   * Returns available:false if the session is disconnected or has no counters.
   * No simulated or estimated byte values are returned by this method.
   */
  getTrafficStats(options: {tunnelId: string}): Promise<AzizanTrafficStats>;
  initializeErrorReporting(options: {apiKey: string}): Promise<void>;
  reportEvents(options: {uuid: string}): Promise<void>;
  /**
   * Reads the localStorage written by the Cordova build under its file://
   * origin, which Capacitor's https://localhost origin cannot see. Android only.
   *
   * Resolves with the legacy key/value pairs. An empty object means the origin
   * was read and held nothing, which completes the migration — it is not a
   * failure. Rejects when the origin could not be read at all, in which case
   * nothing is known about it and the caller should retry on a later launch.
   */
  getLegacyCordovaLocalStorage(): Promise<Record<string, string>>;
  quitApplication(): Promise<void>;
  addListener(
    eventName: string,
    listenerFunc: (data: {id: string; status: number}) => void
  ): Promise<PluginListenerHandle>;
}
