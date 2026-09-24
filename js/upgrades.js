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

  render() {
    const C = SK.CONFIG, G = SK.Game, P = SK.Player;
    this.scrapEl.textContent = G.scrap;
    let html = '';
    for (const u of C.UPGRADES) {
      const lv = this.lvl(u.id), max = u.cost.length, maxed = lv >= max;
      const cost = maxed ? 0 : u.cost[lv];
      const pips = Array.from({ length: max }, (_, n) => `<i class="${n < lv ? 'on' : ''}"></i>`).join('');
      html += `<div class="shop-item${maxed ? ' maxed' : ''}">
        <div class="si-name">${u.name}</div><div class="si-desc">${u.desc}</div>
        <div class="pips">${pips}</div>
        <button data-buy="${u.id}" ${maxed || G.scrap < cost ? 'disabled' : ''}>${maxed ? 'MAXED' : '⚙ ' + cost}</button>
      </div>`;
    }
    const heal = C.CONSUMABLES.heal, med = C.CONSUMABLES.medkit;
    const full = P.hp >= P.maxHp;
    html += `<div class="shop-item heal">
        <div class="si-name">${heal.name}</div><div class="si-desc">${heal.desc}</div>
        <div class="pips small">${Math.ceil(P.hp)} / ${P.maxHp} HP</div>
        <button data-buy="heal" ${full || G.scrap < heal.cost ? 'disabled' : ''}>${full ? 'FULL HP' : '⚙ ' + heal.cost}</button>
      </div>
      <div class="shop-item heal">
        <div class="si-name">${med.name}</div><div class="si-desc">${med.desc}</div>
        <div class="pips small">Carrying ${this.medkits} / ${med.max}</div>
        <button data-buy="medkit" ${this.medkits >= med.max || G.scrap < med.cost ? 'disabled' : ''}>${this.medkits >= med.max ? 'FULL' : '⚙ ' + med.cost}</button>
      </div>`;
    this.grid.innerHTML = html;
  }
};
