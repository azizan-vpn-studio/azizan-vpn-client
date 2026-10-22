/* Personal, per-code usage. A usage code is cleared after each request. */
import {Localizer} from '@outline/infrastructure/i18n';
import {css, html, LitElement} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {AZIZAN_USAGE_ENDPOINT} from './azizan_usage_endpoint';

type UsageResponse = {
  used_gb: number;
  allowance_gb: number;
  remaining_gb: number;
  period_end: string;
  estimated: boolean;
  enforced: boolean;
};

@customElement('azizan-usage-panel')
export class AzizanUsagePanel extends LitElement {
  @property({type: Object}) localize: Localizer;
  @state() private code = '';
  @state() private busy = false;
  @state() private result: UsageResponse | undefined;
  @state() private error = '';

  static styles = css`
    :host { display: block; width: 100%; margin-top: 0.6rem; font: 0.8rem var(--outline-font-family); color: var(--outline-text-color); }
    .summary { display: grid; gap: .3rem; padding: .6rem; border-radius: .5rem; border: 1px solid var(--outline-label-color); }
    .title { font-weight: 650; }
    .small { color: var(--outline-label-color); font-size: .72rem; }
    .error { color: var(--outline-error); }
    form { display: flex; gap: .4rem; flex-wrap: wrap; align-items: center; }
    input { flex: 1; min-width: 8rem; box-sizing: border-box; font: inherit; padding: .55rem; border-radius: .3rem; border: 1px solid var(--outline-label-color); color: var(--outline-text-color); background: var(--outline-card-background); }
    button { font: inherit; padding: .55rem; border-radius: .3rem; border: 0; color: var(--outline-card-background); background: var(--outline-primary); cursor: pointer; }
    button:disabled { opacity: .55; cursor: not-allowed; }
  `;

  private onCodeInput(event: Event) {
    this.code = (event.target as HTMLInputElement).value.trim();
  }

  private async checkUsage(event: Event) {
    event.preventDefault();
    if (this.busy || !/^[A-Za-z0-9_-]{40,256}$/.test(this.code)) return;
    this.busy = true;
    this.error = '';
    this.result = undefined;
    const token = this.code;
    this.code = ''; // Do not keep the usage code after issuing a request.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10000);
    try {
      const response = await fetch(AZIZAN_USAGE_ENDPOINT, {
        method: 'GET',
        headers: {Authorization: `Bearer ${token}`},
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: abort.signal,
      });
      if (!response.ok) throw new Error('unavailable');
      const value: UsageResponse = await response.json();
      if (![value.used_gb, value.allowance_gb, value.remaining_gb].every(
        n => typeof n === 'number' && Number.isFinite(n) && n >= 0
      ) || value.remaining_gb > value.allowance_gb || value.enforced !== false) {
        throw new Error('invalid response');
      }
      this.result = value;
    } catch {
      this.error = this.localize('azizan-usage-check-failed');
    } finally {
      clearTimeout(timer);
      this.busy = false;
    }
  }

  render() {
    return html`
      <div class="summary">
        <span class="title">${this.localize('azizan-data-remaining')}</span>
        ${this.result ? html`
          <span>${this.localize('azizan-usage-used')}: ${this.result.used_gb.toFixed(3)} GB</span>
          <span>${this.localize('azizan-usage-limit')}: ${this.result.allowance_gb.toFixed(3)} GB</span>
          <span>${this.localize('azizan-data-remaining')}: ${this.result.remaining_gb.toFixed(3)} GB</span>
          <span class="small">${this.localize('azizan-usage-estimate')}</span>
          <button type="button" @click=${() => {this.result = undefined;}}>${this.localize('azizan-usage-check-again')}</button>
        ` : html`
          <form @submit=${this.checkUsage}>
            <input type="password" autocomplete="off" spellcheck="false"
              aria-label=${this.localize('azizan-usage-code')} placeholder=${this.localize('azizan-usage-code')}
              .value=${this.code} @input=${this.onCodeInput}/>
            <button type="submit" ?disabled=${this.busy || this.code.length < 40}>
              ${this.localize('azizan-usage-check')}
            </button>
          </form>
          <span class="small">${this.localize('azizan-usage-code-explain')}</span>
        `}
        ${this.error ? html`<span role="alert" class="error">${this.error}</span>` : ''}
      </div>
    `;
  }
}
