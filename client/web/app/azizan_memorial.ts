// Azizan Never Forget — optional first-launch memorial.
// This screen displays name cards while photo permissions are reviewed.
// It does not modify the VPN connection or request network access.

const MEMORIAL_KEY = 'azizan-never-forget-v1-shown';
const DURATION_MS = 6000;

const memorialNames = [
  ['ژینا مهسا امینی', 'Jina Mahsa Amini'],
  ['نیکا شاکرمی', 'Nika Shakarami'],
  ['سارینا اسماعیل‌زاده', 'Sarina Esmailzadeh'],
  ['حدیث نجفی', 'Hadis Najafi'],
  ['کیان پیرفلک', 'Kian Pirfalak'],
  ['مینو مجیدی', 'Minoo Majidi'],
  ['حنانه کیا', 'Hannaneh Kia'],
  ['غزاله چلابی', 'Ghazaleh Chelabi'],
  ['مهسا موگویی', 'Mahsa Mougouyi'],
  ['سیاوش محمودی', 'Siavash Mahmoudi'],
  ['فریدون محمودی', 'Fereydoun Mahmoudi'],
  ['محسن محمدی', 'Mohsen Mohammadi'],
  ['فؤاد قدیمی', 'Foad Ghadimi'],
  ['محمد رخشانی', 'Mohammad Rakhshani'],
  ['امید سارانی', 'Omid Sarani'],
  ['سدیس کشانی', 'Sodeys Keshani'],
  ['علی باراهویی', 'Ali Barahooei'],
  ['امیرحسین بساطی', 'Amirhossein Basati'],
  ['جمشید شارمهد', 'Jamshid Sharmahd'],
  ['اکبر محمدی', 'Akbar Mohammadi'],
];

const memorialStyles = `
.azizan-memorial {
  position: fixed; inset: 0; z-index: 2147483647;
  overflow: hidden; color: #fff; background: #100920;
  font-family: system-ui, -apple-system, sans-serif;
}
.azizan-memorial *, .azizan-memorial *::before, .azizan-memorial *::after {
  box-sizing: border-box;
}
.azizan-memorial__columns {
  position: absolute; inset: -18% 0 0; display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;
  padding: 0 8px;
}
.azizan-memorial__column { display: flex; flex-direction: column; gap: 8px; }
.azizan-memorial__column:nth-child(odd) { animation: azizan-up 6s linear both; }
.azizan-memorial__column:nth-child(even) { animation: azizan-down 6s linear both; }
.azizan-memorial__card {
  height: 154px; flex: 0 0 154px; border-radius: 12px;
  display: flex; flex-direction: column; align-items: center;
  justify-content: flex-end; text-align: center; padding: 10px 5px;
  background: linear-gradient(150deg, #4d345e, #2b2247 58%, #171126);
  border: 1px solid rgba(255,255,255,.16);
  box-shadow: inset 0 0 36px rgba(255,255,255,.025);
}
.azizan-memorial__symbol { font-size: 26px; margin: auto 0; opacity: .8; }
.azizan-memorial__fa { font-size: 11px; font-weight: 650; line-height: 1.5; direction: rtl; }
.azizan-memorial__en { font-size: 9px; line-height: 1.35; opacity: .75; margin-top: 4px; }
.azizan-memorial__shade {
  position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgba(16,9,32,.04) 12%, rgba(16,9,32,.05) 40%,
    rgba(16,9,32,.72) 73%, #100920 100%);
  pointer-events: none;
}
.azizan-memorial__heading {
  position: absolute; bottom: max(11%, env(safe-area-inset-bottom));
  left: 12px; right: 12px; text-align: center;
  text-shadow: 0 2px 20px rgba(0,0,0,.65);
}
.azizan-memorial__heading h1 { margin: 0 0 9px; font-size: clamp(23px, 7vw, 39px); font-weight: 350; }
.azizan-memorial__heading p { margin: 0; opacity: .85; font-size: 14px; }
.azizan-memorial__skip {
  position: absolute; top: max(18px, env(safe-area-inset-top)); right: 14px;
  min-width: 72px; min-height: 44px; padding: 8px 14px; border-radius: 25px;
  border: 1px solid rgba(255,255,255,.42); color: #fff;
  background: rgba(20,11,35,.8); font: inherit; cursor: pointer;
}
.azizan-memorial--exit { opacity: 0; transition: opacity .25s ease; }
@keyframes azizan-up { from { transform: translateY(0); } to { transform: translateY(-100px); } }
@keyframes azizan-down { from { transform: translateY(-100px); } to { transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .azizan-memorial__column { animation: none !important; }
}
`;

/** Show on first launch only. Invoke after the mobile UI has initialized. */
export function showAzizanMemorialOnce(): void {
  try {

  } catch (e) {
    // Continue without persistence if storage is disabled.
    console.warn('Memorial first-launch preference unavailable', e);
  }

  if (!document.body || document.querySelector('.azizan-memorial')) return;

  const style = document.createElement('style');
  style.textContent = memorialStyles;
  document.head.appendChild(style);

  const overlay = document.createElement('section');
  overlay.className = 'azizan-memorial';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Azizan Never Forget memorial');

  const columns = document.createElement('div');
  columns.className = 'azizan-memorial__columns';
  for (let column = 0; column < 4; column++) {
    const strip = document.createElement('div');
    strip.className = 'azizan-memorial__column';
    for (let row = 0; row < 5; row++) {
      const [persian, english] = memorialNames[row * 4 + column];
      const card = document.createElement('div');
      card.className = 'azizan-memorial__card';
      const symbol = document.createElement('span');
      symbol.className = 'azizan-memorial__symbol';
      symbol.textContent = '✦';
      symbol.setAttribute('aria-hidden', 'true');
      const fa = document.createElement('span');
      fa.className = 'azizan-memorial__fa';
      fa.textContent = persian;
      const en = document.createElement('span');
      en.className = 'azizan-memorial__en';
      en.textContent = english;
      card.append(symbol, fa, en);
      strip.appendChild(card);
    }
    columns.appendChild(strip);
  }
  overlay.appendChild(columns);

  const shade = document.createElement('div');
  shade.className = 'azizan-memorial__shade';
  overlay.appendChild(shade);

  const heading = document.createElement('div');
  heading.className = 'azizan-memorial__heading';
  const title = document.createElement('h1');
  title.lang = 'fa';
  title.dir = 'rtl';
  title.textContent = 'هرگز فراموش نمی‌کنیم';
  const subtitle = document.createElement('p');
  subtitle.textContent = 'NEVER FORGET';
  heading.append(title, subtitle);
  overlay.appendChild(heading);

  const skip = document.createElement('button');
  skip.className = 'azizan-memorial__skip';
  skip.type = 'button';
  skip.textContent = 'Skip / رد شدن';
  overlay.appendChild(skip);

  let finished = false;
  let timeoutId: number;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeoutId);
    try {
      window.localStorage.setItem(MEMORIAL_KEY, 'true');
    } catch (e) {
      console.warn('Could not save memorial preference', e);
    }
    overlay.classList.add('azizan-memorial--exit');
    window.setTimeout(() => {
      overlay.remove();
      style.remove();
    }, 260);
  };
  skip.addEventListener('click', finish, {once: true});
  document.body.appendChild(overlay);
  timeoutId = window.setTimeout(finish, DURATION_MS);
}
