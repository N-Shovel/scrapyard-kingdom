// Base Workshop: permanent gear upgrades + healing, bought with scrap at the Stash.
// Open it with U during preparation, or E next to the Stash during a fight (the fight pauses while you shop).
SK.Upgrades = {
  levels: {},
  medkits: 0,
  open: false,
  pausedFight: false,

  init() {
    for (const u of SK.CONFIG.UPGRADES) this.levels[u.id] = 0;
    this.el = document.getElementById('shop');
    this.grid = document.getElementById('shop-grid');
    this.scrapEl = document.getElementById('shop-scrap');
    this.grid.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-buy]');
      if (b && !b.disabled) this.buy(b.dataset.buy);
    });
    document.getElementById('shop-close').addEventListener('click', () => this.close());
  },

  lvl(id) { return this.levels[id] || 0; },

  // ---- effects used around the codebase ----
  dmgMul() { return 1 + 0.2 * this.lvl('dmg'); },
  fireRateMul() { return 1 / (1 + 0.12 * this.lvl('rate')); }, // multiplies the shot cooldown
  magSize() { return SK.CONFIG.WEAPONS.shotgun.mag + 2 * this.lvl('mag'); },
  maxHp() { return SK.CONFIG.PLAYER.maxHp + 25 * this.lvl('hp'); },
  armorMul() { return 1 - 0.1 * this.lvl('armor'); },
  speedMul() { return 1 + 0.08 * this.lvl('speed'); },
  torchMul() { return 1 + 0.5 * this.lvl('torch'); },
  turretMul() { return 1 + 0.15 * this.lvl('turret'); },

  useMedkit() {
    const P = SK.Player;
    if (!this.medkits || !P.alive) return;
    if (P.hp >= P.maxHp) { SK.HUD.message('Already at full health', '', 1); return; }
    this.medkits--;
    P.hp = Math.min(P.maxHp, P.hp + SK.CONFIG.CONSUMABLES.medkit.heal);
    SK.SFX.play('pickup');
    SK.FX.burst(P.pos.clone().setY(1.2), 0x7ddc5a, 10, 3, 0.1, 0.6);
    SK.HUD.message(`Medkit used (+${SK.CONFIG.CONSUMABLES.medkit.heal} HP) · ${this.medkits} left`, 'good');
  },

  buy(id) {
    const C = SK.CONFIG, P = SK.Player, G = SK.Game;
    const cons = C.CONSUMABLES[id];
    if (cons) {
      if (id === 'heal' && P.hp >= P.maxHp) return;
      if (id === 'medkit' && this.medkits >= cons.max) return;
      if (!G.spend(cons.cost)) return;
      if (id === 'heal') P.hp = P.maxHp;
      if (id === 'medkit') this.medkits++;
    } else {
      const u = C.UPGRADES.find((x) => x.id === id);
      const lv = this.lvl(id);
      if (!u || lv >= u.cost.length || !G.spend(u.cost[lv])) return;
      this.levels[id] = lv + 1;
      if (id === 'hp') { P.maxHp = this.maxHp(); P.hp = Math.min(P.maxHp, P.hp + 25); }
      if (id === 'mag') SK.Weapons.ammo = this.magSize();
    }
    SK.SFX.play('build');
    this.render();
  },

  // ---- UI ----
  toggle() { this.open ? this.close() : this.show(); },

  show() {
    if (this.open) return;
    this.open = true;
    // During a fight, shopping pauses the game.
    if (SK.Game.state === 'playing') {
      this.pausedFight = true;
      SK.Game.state = 'shop';
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.render();
    this.el.classList.remove('hidden');
  },

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    if (this.pausedFight) {
      this.pausedFight = false;
      SK.Game.state = 'paused';
      SK.HUD.showPause(true, 'BACK TO THE FIGHT', 'Click to resume');
      SK.Input.lock(); // resumes straight away if the browser allows it
    }
  },

  // Small inline SVG icons for the workshop cards (stroke = currentColor).
  ICONS: {
    dmg:    '<rect x="8" y="3" width="8" height="13" rx="1.5"/><path d="M8 7h8"/><rect x="7" y="16" width="10" height="5" rx="1"/>',
    rate:   '<path d="M3 13h11l2-3h5"/><path d="M6 13v4h3v-4"/><rect x="11" y="9" width="4" height="4" rx="1"/><path d="M18 6l2-2M18 14l2 2"/>',
    mag:    '<rect x="3" y="9" width="18" height="6" rx="3"/><path d="M8 9v6M13 9v6M18 9v6"/>',
    hp:     '<path d="M12 3l8 3v6c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V6z"/><path d="M12 8v8M8 12h8"/>',
    armor:  '<path d="M8 3l4 2 4-2 4 4-2 3v11H6V10L4 7z"/><path d="M9 12h6M9 16h6"/>',
    speed:  '<path d="M6 4h5v8l7 3c1.5.6 2 1.5 2 3v2H6z"/><path d="M6 17h14"/><path d="M2 9h2M1 13h3"/>',
    torch:  '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.5 1.5 1.5 2.5 3 2.5-1-2-1-4.5 0-7z"/><path d="M10 21h4"/>',
    turret: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    heal:   '<path d="M12 20s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 10-8 10z"/><path d="M12 10v5M9.5 12.5h5"/>',
    medkit: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3"/><path d="M12 10v7M8.5 13.5h7"/>'
  },

  icon(id) {
    return `<div class="si-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
           `stroke-linecap="round" stroke-linejoin="round">${this.ICONS[id] || ''}</svg></div>`;
  },

  card(id, cls, name, desc, status, btn) {
    return `<div class="shop-item${cls}">${this.icon(id)}
        <div class="si-info"><div class="si-name">${name}</div><div class="si-desc">${desc}</div></div>
        <div class="si-foot">${status}${btn}</div>
      </div>`;
  },

  render() {
    const C = SK.CONFIG, G = SK.Game, P = SK.Player;
    this.scrapEl.textContent = G.scrap;
    let html = '';
    for (const u of C.UPGRADES) {
      const lv = this.lvl(u.id), max = u.cost.length, maxed = lv >= max;
      const cost = maxed ? 0 : u.cost[lv];
      const pips = Array.from({ length: max }, (_, n) => `<i class="${n < lv ? 'on' : ''}"></i>`).join('');
      html += this.card(u.id, maxed ? ' maxed' : '', u.name, u.desc, `<div class="pips">${pips}</div>`,
        `<button data-buy="${u.id}" ${maxed || G.scrap < cost ? 'disabled' : ''}>${maxed ? 'MAXED' : '⚙ ' + cost}</button>`);
    }
    const heal = C.CONSUMABLES.heal, med = C.CONSUMABLES.medkit;
    const full = P.hp >= P.maxHp, medFull = this.medkits >= med.max;
    html += this.card('heal', ' heal', heal.name, heal.desc,
      `<div class="pips small">${Math.ceil(P.hp)} / ${P.maxHp} HP</div>`,
      `<button data-buy="heal" ${full || G.scrap < heal.cost ? 'disabled' : ''}>${full ? 'FULL HP' : '⚙ ' + heal.cost}</button>`);
    html += this.card('medkit', ' heal', med.name, med.desc,
      `<div class="pips small">Carrying ${this.medkits} / ${med.max}</div>`,
      `<button data-buy="medkit" ${medFull || G.scrap < med.cost ? 'disabled' : ''}>${medFull ? 'FULL' : '⚙ ' + med.cost}</button>`);
    this.grid.innerHTML = html;
  }
};
