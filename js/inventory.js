// What the player owns but hasn't placed. Each item keeps its own HP, so damaged gear stays damaged.
SK.Inventory = {
  items: {}, // type -> [hp, hp, ...]

  init() {
    for (const t of SK.CONFIG.BUILD_ORDER) this.items[t] = [];
    for (const [t, n] of Object.entries(SK.CONFIG.START_INVENTORY))
      for (let k = 0; k < n; k++) this.items[t].push(SK.CONFIG.STRUCTURES[t].hp);
  },

  count(type) { return this.items[type].length; },

  // Take the healthiest item of this type. Returns its hp, or null if none.
  take(type) {
    const list = this.items[type];
    if (!list.length) return null;
    let best = 0;
    for (let k = 1; k < list.length; k++) if (list[k] > list[best]) best = k;
    return list.splice(best, 1)[0];
  },

  add(type, hp) { this.items[type].push(hp); },

  damagedCount(type) {
    const max = SK.CONFIG.STRUCTURES[type].hp;
    return this.items[type].filter((hp) => hp < max).length;
  }
};
