// Global namespace + all tunable numbers live here.
window.SK = {};

SK.CONFIG = {
  GRID: 40,          // map is GRID x GRID cells
  CELL: 2,           // world units per cell
  START_SCRAP: 120,
  PREP_TIME: 180,    // 3 minutes of top-down preparation between rounds
  // The fight itself has no time limit: the round ends once every enemy has spawned and been killed.

  // Enemies per round = base + perRound * roundNumber (see Waves.composition).
  // They arrive in packs from the same gate, all within the first `firstSpawn + window` seconds.
  SPAWN: {
    raider: { base: 20, perRound: 6 },
    mutant: { base: 0,  perRound: 5, from: 1 },
    brute:  { base: 0,  perRound: 1, from: 3 },
    drone:  { base: -2, perRound: 4, from: 2 },
    packMin: 2, packMax: 3,
    firstSpawn: 2,
    window: 56     // every enemy of the round spawns within firstSpawn + window seconds (< 60s)
  },
  BUILD_RANGE: 16,   // how far away you can place things in first/third person
  STASH_HP: 1500,
  STASH_STEAL: 2,    // scrap a raider steals per hit on the stash
  MOUSE_SENS: 0.0022,

  // What you own at the start. Everything you place returns here at the end of each round.
  START_INVENTORY: { wreck: 8, container: 2, turret: 2, flak: 1, spikes: 2, tar: 2, mine: 2 },

  // Enemies get tougher every round: multiplier = 1 + perRound * (round - 1)
  SCALING: { hp: 0.15, damage: 0.10, speed: 0.03, speedMax: 1.35 },

  // Path cost of breaking through a wall, per 100 wall HP.
  // Higher = enemies prefer walking around; lower = they smash through.
  WALL_COST_NORMAL: 25,
  WALL_COST_BRUTE: 3,
  TURRET_MAX_COVER: 1, // ground turrets can fire over at most this many walls/junk piles

  PLAYER: {
    speed: 6.5, sprint: 10, jump: 7.5, gravity: 24,
    radius: 0.4, eye: 1.62, maxHp: 100,
    regenDelay: 5, regenRate: 8, respawn: 6
  },

  STRUCTURES: {
    wreck:     { name: 'Car Wreck',   cost: 10, hp: 220, blocks: true,  height: 1.4, desc: 'Cheap wall' },
    container: { name: 'Container',   cost: 30, hp: 700, blocks: true,  height: 2.6, desc: 'Heavy wall' },
    turret:    { name: 'Junk Turret', cost: 45, hp: 180, blocks: true,  height: 1.8, desc: 'Ground only',
                 range: 15, fireRate: 0.4, damage: 11 },
    flak:      { name: 'Flak Cannon', cost: 55, hp: 160, blocks: true,  height: 2.0, desc: 'Air only',
                 range: 22, fireRate: 0.3, damage: 10, air: true },
    spikes:    { name: 'Spike Trap',  cost: 20, hp: 120, blocks: false, height: 0.4, desc: 'Wears out',
                 damage: 18, rate: 0.5, wear: 8 }, // wear = durability lost per enemy stabbed
    tar:       { name: 'Tar Pit',     cost: 15, hp: 100, blocks: false, height: 0.15, desc: 'Slows 55%',
                 slow: 0.45, wear: 4 },            // speed multiplier while inside; wear = durability/sec per enemy
    mine:      { name: 'Scrap Mine',  cost: 25, hp: 1,   blocks: false, height: 0.3, desc: 'Explodes once',
                 damage: 110, radius: 4 }          // splash damage, falls off with distance
  },
  BUILD_ORDER: ['wreck', 'container', 'turret', 'flak', 'spikes', 'tar', 'mine'],

  // Base Workshop (at the Stash). cost[n] = price of level n+1.
  UPGRADES: [
    { id: 'dmg',    name: 'Hot Loads',          desc: '+20% shotgun damage',        cost: [60, 100, 150, 220, 300] },
    { id: 'rate',   name: 'Greased Pump',       desc: '+12% fire rate',             cost: [70, 120, 180, 260] },
    { id: 'mag',    name: 'Extended Tube',      desc: '+2 shells per reload',       cost: [50, 90, 140] },
    { id: 'hp',     name: 'Scrap Plating',      desc: '+25 max health',             cost: [60, 100, 150, 220] },
    { id: 'armor',  name: 'Kevlar Lining',      desc: '-10% damage taken',          cost: [80, 130, 190, 260] },
    { id: 'speed',  name: 'Running Boots',      desc: '+8% move speed',             cost: [50, 90, 140] },
    { id: 'torch',  name: 'Torch Nozzle',       desc: '+50% repair per fuel',       cost: [60, 110, 170] },
    { id: 'turret', name: 'Turret Calibration', desc: '+15% turret & flak damage',  cost: [90, 150, 220, 300] }
  ],
  CONSUMABLES: {
    heal:   { name: 'Patch Up', desc: 'Restore full health now', cost: 25 },
    medkit: { name: 'Medkit',   desc: 'Carry up to 3 · press H to heal 50', cost: 35, max: 3, heal: 50 }
  },

  // aggroChance = share of this enemy type that will break off to chase the player within `aggro` range.
  ENEMIES: {
    raider: { name: 'Raider', hp: 60,  speed: 3.4, damage: 9,  attackRate: 1.0, range: 1.3, radius: 0.45,
              scrap: 5,  height: 1.9, barW: 1.0, hatesTurrets: true, steals: true, aggroChance: 0.4, aggro: 8 },
    mutant: { name: 'Mutant', hp: 32,  speed: 6.0, damage: 7,  attackRate: 0.7, range: 1.2, radius: 0.4,
              scrap: 3,  height: 1.5, barW: 0.9, aggroChance: 1, aggro: 16 },
    brute:  { name: 'Brute',  hp: 320, speed: 2.0, damage: 40, attackRate: 1.8, range: 1.7, radius: 0.8,
              scrap: 20, height: 2.9, barW: 1.6, wallBreaker: true, aggroChance: 0.3, aggro: 6 },
    drone:  { name: 'Scrap Drone', hp: 40, speed: 5.0, damage: 5, attackRate: 1.0, range: 7, radius: 0.6,
              scrap: 5, height: 6.8, barW: 0.9, flying: true, flyHeight: 6, aggroChance: 0.5, aggro: 10 }
  },

  WEAPONS: {
    shotgun: { name: 'Scrap Shotgun', pellets: 9, spread: 0.055, damage: 10, range: 45,
               fireRate: 0.7, mag: 6, reload: 1.8 },
    // Torch burns fuel while repairing. Refuel at the Stash (hold F) for scrap.
    repair:  { name: 'Repair Torch', range: 5.5, rate: 70, hpPerFuel: 10,
               refuelRate: 35, scrapPerFuel: 0.5, stationRange: 3.5 }
  }
};
