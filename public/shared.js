// ── Avatars ──────────────────────────────────────────────────────
const AVATAR_COLORS = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#F4A460','#87CEEB'];
const AVATAR_NAMES = ['Chat','Ours','Chien','Grenouille','Poussin','Hibou','Renard','Pingouin'];
const AVATAR_SHAPES = [
  `<svg viewBox="0 0 100 100" role="img" aria-label="Chat"><circle cx="50" cy="55" r="35" fill="COLOR"/><polygon points="22,30 30,55 15,55" fill="COLOR"/><polygon points="78,30 70,55 85,55" fill="COLOR"/><circle cx="38" cy="50" r="5" fill="white"/><circle cx="62" cy="50" r="5" fill="white"/><circle cx="39" cy="51" r="2.5" fill="#333"/><circle cx="63" cy="51" r="2.5" fill="#333"/><ellipse cx="50" cy="62" rx="4" ry="3" fill="#333"/></svg>`,
  `<svg viewBox="0 0 100 100" role="img" aria-label="Ours"><circle cx="28" cy="30" r="14" fill="COLOR"/><circle cx="72" cy="30" r="14" fill="COLOR"/><circle cx="50" cy="55" r="35" fill="COLOR"/><circle cx="38" cy="48" r="5" fill="white"/><circle cx="62" cy="48" r="5" fill="white"/><circle cx="39" cy="49" r="2.5" fill="#333"/><circle cx="63" cy="49" r="2.5" fill="#333"/><ellipse cx="50" cy="60" rx="6" ry="4" fill="#333"/></svg>`,
  `<svg viewBox="0 0 100 100" role="img" aria-label="Chien"><circle cx="50" cy="55" r="35" fill="COLOR"/><ellipse cx="25" cy="35" rx="12" ry="18" fill="COLOR" transform="rotate(-15,25,35)"/><ellipse cx="75" cy="35" rx="12" ry="18" fill="COLOR" transform="rotate(15,75,35)"/><circle cx="38" cy="48" r="5" fill="white"/><circle cx="62" cy="48" r="5" fill="white"/><circle cx="39" cy="49" r="2.5" fill="#333"/><circle cx="63" cy="49" r="2.5" fill="#333"/><ellipse cx="50" cy="62" rx="8" ry="5" fill="#333"/></svg>`,
  `<svg viewBox="0 0 100 100" role="img" aria-label="Grenouille"><circle cx="50" cy="58" r="35" fill="COLOR"/><circle cx="32" cy="30" r="14" fill="COLOR"/><circle cx="68" cy="30" r="14" fill="COLOR"/><circle cx="32" cy="28" r="8" fill="white"/><circle cx="68" cy="28" r="8" fill="white"/><circle cx="33" cy="29" r="4" fill="#333"/><circle cx="69" cy="29" r="4" fill="#333"/><path d="M35,65 Q50,75 65,65" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 100 100" role="img" aria-label="Poussin"><circle cx="50" cy="55" r="35" fill="COLOR"/><circle cx="38" cy="45" r="4" fill="#333"/><circle cx="62" cy="45" r="4" fill="#333"/><polygon points="50,52 43,58 57,58" fill="#E67E22"/><polygon points="42,18 50,10 58,18" fill="COLOR"/></svg>`,
  `<svg viewBox="0 0 100 100" role="img" aria-label="Hibou"><circle cx="50" cy="55" r="35" fill="COLOR"/><polygon points="25,30 35,50 18,50" fill="COLOR"/><polygon points="75,30 65,50 82,50" fill="COLOR"/><circle cx="37" cy="48" r="10" fill="white"/><circle cx="63" cy="48" r="10" fill="white"/><circle cx="38" cy="49" r="5" fill="#333"/><circle cx="64" cy="49" r="5" fill="#333"/><polygon points="50,58 46,64 54,64" fill="#E67E22"/></svg>`,
  `<svg viewBox="0 0 100 100" role="img" aria-label="Renard"><circle cx="50" cy="55" r="35" fill="COLOR"/><polygon points="20,25 32,52 15,52" fill="COLOR"/><polygon points="80,25 68,52 85,52" fill="COLOR"/><circle cx="38" cy="50" r="4" fill="#333"/><circle cx="62" cy="50" r="4" fill="#333"/><ellipse cx="50" cy="62" rx="4" ry="3" fill="#333"/><ellipse cx="50" cy="70" rx="14" ry="10" fill="white"/></svg>`,
  `<svg viewBox="0 0 100 100" role="img" aria-label="Pingouin"><circle cx="50" cy="55" r="35" fill="COLOR"/><ellipse cx="50" cy="62" rx="20" ry="22" fill="white"/><circle cx="38" cy="45" r="4" fill="white"/><circle cx="62" cy="45" r="4" fill="white"/><circle cx="39" cy="46" r="2" fill="#333"/><circle cx="63" cy="46" r="2" fill="#333"/><polygon points="50,53 44,58 56,58" fill="#F39C12"/></svg>`,
];

function avatarSVG(index, size = 56) {
  const color = AVATAR_COLORS[index] || AVATAR_COLORS[0];
  const svg = (AVATAR_SHAPES[index] || AVATAR_SHAPES[0]).replace(/COLOR/g, color);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;background:${color}22;flex-shrink:0">${svg}</div>`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderTopItems(id, items) {
  const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
  document.getElementById(id).innerHTML = items.map((item, i) => `
    <li><span class="medal">${medals[i]}</span>${escapeHtml(item)}</li>
  `).join('');
}
