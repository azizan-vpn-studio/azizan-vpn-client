/**
 * AZIZAN VPN — Never Forget memorial (photo-ready, offline-first).
 *
 * Drop approved, correctly identified portraits in:
 *     client/web/assets/memorial/<filename>.jpg
 * The Capacitor webpack configuration copies client/web/assets to www/assets.
 * Images are bundled in the app; NEVER fetch victim portraits at startup.
 *
 * Keep the exported function name unchanged because the existing Capacitor
 * entry point already imports showAzizanMemorialOnce(). It now plays on
 * every call, as requested — NOT once per installation.
 *
 * Memorial display does not start/stop VPN tunnels or modify VPN data.
 */

const DURATION_MS = 6000;
const FADE_OUT_MS = 260;

interface MemorialPerson {
  fa: string;
  en: string;
  portrait: string;
  /** Brief visible attribution for externally licensed portraits, if needed. */
  credit?: string;
  /** Original source page; should be documented for every reused portrait. */
  source?: string;
}

// One photo per person: the file name MUST match exactly.
// No image is ever displayed against a different person's name.
// A missing or corrupt local image leaves the name-only memorial card.
const people: readonly MemorialPerson[] = [
  {fa: 'ژینا مهسا امینی', en: 'Jina Mahsa Amini', portrait: 'jina-mahsa-amini.jpg'},
  {fa: 'نیکا شاکرمی', en: 'Nika Shakarami', portrait: 'nika-shakarami.jpg'},
  {fa: 'سارینا اسماعیل‌زاده', en: 'Sarina Esmailzadeh', portrait: 'sarina-esmailzadeh.jpg'},
  {fa: 'حدیث نجفی', en: 'Hadis Najafi', portrait: 'hadis-najafi.jpg'},
  {fa: 'کیان پیرفلک', en: 'Kian Pirfalak', portrait: 'kian-pirfalak.jpg'},
  {fa: 'مینو مجیدی', en: 'Minoo Majidi', portrait: 'minoo-majidi.jpg'},
  {fa: 'حنانه کیا', en: 'Hannaneh Kia', portrait: 'hannaneh-kia.jpg'},
  {fa: 'غزاله چلابی', en: 'Ghazaleh Chelabi', portrait: 'ghazaleh-chelabi.jpg'},
  {fa: 'مهسا موگویی', en: 'Mahsa Mougouyi', portrait: 'mahsa-mougouyi.jpg'},
  {fa: 'سیاوش محمودی', en: 'Siavash Mahmoudi', portrait: 'siavash-mahmoudi.jpg'},
  {fa: 'فریدون محمودی', en: 'Fereydoun Mahmoudi', portrait: 'fereydoun-mahmoudi.jpg'},
  {fa: 'محسن محمدی', en: 'Mohsen Mohammadi', portrait: 'mohsen-mohammadi.jpg'},
  {fa: 'فؤاد قدیمی', en: 'Foad Ghadimi', portrait: 'foad-ghadimi.jpg'},
  {fa: 'محمد رخشانی', en: 'Mohammad Rakhshani', portrait: 'mohammad-rakhshani.jpg'},
  {fa: 'امید سارانی', en: 'Omid Sarani', portrait: 'omid-sarani.jpg'},
  {fa: 'سدیس کشانی', en: 'Sodeys Keshani', portrait: 'sodeys-keshani.jpg'},
  {fa: 'علی باراهویی', en: 'Ali Barahooei', portrait: 'ali-barahooei.jpg'},
  {fa: 'امیرحسین بساطی', en: 'Amirhossein Basati', portrait: 'amirhossein-basati.jpg'},
  {
    fa: 'جمشید شارمهد',
    en: 'Jamshid Sharmahd',
    portrait: 'jamshid-sharmahd.jpg',
    credit: 'Photo: Gazelle Sharmahd · CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Jamshid_Sharmahd_in_California_(cropped).jpg',
  },
  {fa: 'اکبر محمدی', en: 'Akbar Mohammadi', portrait: 'akbar-mohammadi.jpg'},
];

const memorialCss = `
.azizan-memorial {
  position: fixed; inset: 0; z-index: 2147483647;
  overflow: hidden; background: #100920; color: white;
  font-family: system-ui, -apple-system, sans-serif;
  isolation: isolate;
}
.azizan-memorial *, .azizan-memorial *::before,
.azizan-memorial *::after { box-sizing: border-box; }
.azizan-memorial__columns {
  position: absolute; inset: -10% 0 0; display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px;
  padding: 0 6px;
}
.azizan-memorial__column { display: flex; flex-direction: column; gap: 6px; }
.azizan-memorial__column:nth-child(odd) {
  animation: azizan-portraits-up 6s linear both;
}
.azizan-memorial__column:nth-child(even) {
  animation: azizan-portraits-down 6s linear both;
}
.azizan-memorial__card {
  position: relative; height: 174px; flex: 0 0 174px;
  overflow: hidden; border-radius: 9px;
  background: linear-gradient(150deg, #4d345e, #2b2247 58%, #171126);
  border: 1px solid rgba(255,255,255,.13);
  text-align: center;
}
.azizan-memorial__image {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; object-position: center 28%;
  opacity: 0; transition: opacity .25s ease;
}
.azizan-memorial__card--photo .azizan-memorial__image { opacity: 1; }
.azizan-memorial__symbol {
  position: absolute; top: 32%; left: 0; right: 0;
  font-size: 25px; opacity: .7;
}
.azizan-memorial__card--photo .azizan-memorial__symbol { display: none; }
.azizan-memorial__card::after {
  content: ''; position: absolute; inset: 35% 0 0;
  background: linear-gradient(transparent, rgba(12,8,22,.6) 52%, rgba(12,8,22,.96));
  pointer-events: none;
}
.azizan-memorial__names {
  position: absolute; z-index: 1; left: 3px; right: 3px; bottom: 6px;
  text-shadow: 0 1px 3px rgba(0,0,0,.8);
}
.azizan-memorial__fa { display: block; font-size: 10px; font-weight: 700; direction: rtl; line-height: 1.5; }
.azizan-memorial__en { display: block; font-size: 8px; margin-top: 2px; line-height: 1.2; }
.azizan-memorial__credit { display: none; margin-top: 4px; font-size: 5.5px; line-height: 1.2; color: #f1dbff; }
.azizan-memorial__card--photo .azizan-memorial__credit { display: block; }
.azizan-memorial__credit a { color: inherit; }
.azizan-memorial__shade {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(to bottom, rgba(16,9,32,.05) 0%, rgba(16,9,32,.05) 48%,
    rgba(16,9,32,.78) 75%, #100920 98%);
}
.azizan-memorial__heading {
  position: absolute; bottom: max(11%, env(safe-area-inset-bottom));
  left: 12px; right: 12px; text-align: center;
  text-shadow: 0 2px 20px rgba(0,0,0,.85);
  pointer-events: none;
}
.azizan-memorial__heading h1 {
  margin: 0 0 9px; font-size: clamp(23px, 7vw, 39px); font-weight: 500;
}
.azizan-memorial__heading p { margin: 0; font-size: 14px; letter-spacing: .17em; }
.azizan-memorial__skip {
  position: absolute; z-index: 2;
  top: max(18px, env(safe-area-inset-top)); right: 14px;
  min-width: 72px; min-height: 44px; padding: 8px 14px;
  border-radius: 25px; border: 1px solid rgba(255,255,255,.5);
  color: white; background: rgba(20,11,35,.85); font: inherit;
  cursor: pointer;
}
.azizan-memorial--exit { opacity: 0; transition: opacity .26s ease; }
@keyframes azizan-portraits-up { from { transform: translateY(0); } to { transform: translateY(-175px); } }
@keyframes azizan-portraits-down { from { transform: translateY(-175px); } to { transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .azizan-memorial__column { animation: none !important; }
}
`;

/**
 * Plays every time it is called (normal launch or return from background).
 * We keep this older exported name for compatibility with existing index.ts.
 */
export function showAzizanMemorialOnce(): void {
  if (!document.body || document.querySelector('.azizan-memorial')) return;

  const style = document.createElement('style');
  style.textContent = memorialCss;
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
      const person = people[row * 4 + column];
      const card = document.createElement('div');
      card.className = 'azizan-memorial__card';

      const star = document.createElement('span');
      star.className = 'azizan-memorial__symbol';
      star.textContent = '✦';
      star.setAttribute('aria-hidden', 'true');
      card.appendChild(star);

      // Relative URLs resolve to Capacitor's bundled www/assets directory.
      // Inaccessible or absent portraits safely leave the original name-card UI.
      const picture = document.createElement('img');
      picture.className = 'azizan-memorial__image';
      picture.alt = person.en;
      picture.decoding = 'async';
      picture.loading = 'eager';
      picture.addEventListener('load', () => card.classList.add('azizan-memorial__card--photo'));
      picture.addEventListener('error', () => { picture.remove(); });
      picture.src = `assets/memorial/${person.portrait}`;
      card.appendChild(picture);

      const names = document.createElement('div');
      names.className = 'azizan-memorial__names';
      const fa = document.createElement('span');
      fa.className = 'azizan-memorial__fa';
      fa.lang = 'fa';
      fa.textContent = person.fa;
      const en = document.createElement('span');
      en.className = 'azizan-memorial__en';
      en.textContent = person.en;
      names.append(fa, en);

      // Show visible license attribution when that portrait loads.
      if (person.credit) {
        const credit = document.createElement('span');
        credit.className = 'azizan-memorial__credit';
        if (person.source) {
          const link = document.createElement('a');
          link.href = person.source;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = person.credit;
          credit.appendChild(link);
        } else {
          credit.textContent = person.credit;
        }
        names.appendChild(credit);
      }
      card.appendChild(names);
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
  let timeoutId = 0;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeoutId);
    overlay.classList.add('azizan-memorial--exit');
    window.setTimeout(() => {
      overlay.remove();
      style.remove();
    }, FADE_OUT_MS);
  };
  skip.addEventListener('click', finish, {once: true});
  document.body.appendChild(overlay);
  timeoutId = window.setTimeout(finish, DURATION_MS);
}
