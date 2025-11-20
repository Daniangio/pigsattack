import React, { useState } from 'react';
import { Shield, Zap, Settings, Sword, X, Users } from 'lucide-react';

const VIEW_MODES = {
  PLAYER: 'player',
  CENTRAL: 'central',
  TABLE: 'table',
};

const WEAPON_HAND_LIMIT = 2;

const THREAT_LIBRARY = [
  { id: 't1', name: 'Razorback Matriarch', ferocity: 4, cunning: 2, mass: 5, era: 'Day', reward: '+1 Trophy' },
  { id: 't2', name: 'Ironhide Grunter', ferocity: 3, cunning: 3, mass: 3, era: 'Day', reward: '+1 Scrap' },
  { id: 't3', name: 'Soot Tusker', ferocity: 2, cunning: 4, mass: 4, era: 'Twilight', reward: 'Gain Sensor Clue' },
  { id: 't4', name: 'Night Howler', ferocity: 5, cunning: 5, mass: 2, era: 'Night', reward: '+3 VP' },
  { id: 't5', name: 'Bone Crusher', ferocity: 4, cunning: 1, mass: 6, era: 'Twilight', reward: '+1 Plate' },
  { id: 't6', name: 'Ashen Raider', ferocity: 2, cunning: 5, mass: 3, era: 'Night', reward: 'Steal 1 Scrap' },
  { id: 't7', name: 'Hive Boar', ferocity: 3, cunning: 2, mass: 4, era: 'Day', reward: 'Gain 2 Wiring' },
  { id: 't8', name: 'Grim Charger', ferocity: 5, cunning: 3, mass: 4, era: 'Twilight', reward: 'Earn Trophy' },
  { id: 't9', name: 'Blight Runner', ferocity: 1, cunning: 4, mass: 3, era: 'Day', reward: 'Scout Next Era' },
  { id: 't10', name: 'Obsidian Titan', ferocity: 6, cunning: 4, mass: 6, era: 'Night', reward: '+2 VP' },
];

const UPGRADE_LIBRARY = [
  { id: 'u1', title: 'Reinforced Plating', type: 'upgrade', description: '+1 Green Def. Permanent.', cost: 4, color: 'border-green-500' },
  { id: 'u2', title: 'Auto-Turret', type: 'upgrade', description: 'Deal 1 dmg before combat.', cost: 6, color: 'border-red-500' },
  { id: 'u3', title: 'Scrap Magnet', type: 'upgrade', description: 'Gain +1 Scrap when scavenging.', cost: 3, color: 'border-blue-500' },
  { id: 'u4', title: 'Night Vision', type: 'upgrade', description: 'Ignore darkness penalties.', cost: 5, color: 'border-yellow-500' },
  { id: 'u5', title: 'Spiked Barricade', type: 'upgrade', description: 'Reflects 1 dmg to attacker.', cost: 4, color: 'border-red-600' },
  { id: 'u6', title: 'Field Rations', type: 'upgrade', description: 'Heal 1 each dawn.', cost: 2, color: 'border-amber-500' },
  { id: 'u7', title: 'Sensor Sweep', type: 'upgrade', description: 'Reveal traps before triggering.', cost: 7, color: 'border-cyan-500' },
  { id: 'u8', title: 'Hardened Cabin', type: 'upgrade', description: '+2 Mass defense while hunkered.', cost: 6, color: 'border-emerald-500' },
  { id: 'u9', title: 'Pulse Relay', type: 'upgrade', description: '+1 Tactical defense.', cost: 4, color: 'border-blue-400' },
  { id: 'u10', title: 'Inferno Mines', type: 'upgrade', description: 'Deal 2 dmg on repel.', cost: 8, color: 'border-orange-500' },
];

const WEAPON_LIBRARY = [
  { id: 'w1', title: 'Rusty Shotgun', type: 'weapon', description: 'High dmg. Requires reload.', cost: 8, color: 'border-orange-600' },
  { id: 'w2', title: 'Shock Baton', type: 'weapon', description: 'Stuns enemy on hit.', cost: 5, color: 'border-blue-400' },
  { id: 'w3', title: 'Scatter Laser', type: 'weapon', description: 'Multi-target beam.', cost: 9, color: 'border-purple-500' },
  { id: 'w4', title: 'Bone Saw', type: 'weapon', description: 'Armor piercing.', cost: 4, color: 'border-slate-400' },
  { id: 'w5', title: 'Molotov Rack', type: 'weapon', description: 'Splash damage, 2 uses.', cost: 6, color: 'border-amber-400' },
  { id: 'w6', title: 'Harpoon Net', type: 'weapon', description: 'Lower Mass by 2.', cost: 7, color: 'border-cyan-400' },
  { id: 'w7', title: 'Rail Spike', type: 'weapon', description: 'High Ferocity check.', cost: 5, color: 'border-fuchsia-500' },
  { id: 'w8', title: 'Auto Crossbow', type: 'weapon', description: 'Two quick shots.', cost: 6, color: 'border-lime-500' },
  { id: 'w9', title: 'Cryo Bomb', type: 'weapon', description: 'Freeze cunning by 3.', cost: 7, color: 'border-sky-500' },
  { id: 'w10', title: 'Pulse Blade', type: 'weapon', description: '+2 VP if used on kill.', cost: 5, color: 'border-indigo-500' },
];

const PLAYER_PRESETS = [
  {
    id: 'p1',
    name: 'Alex "Bulwark" Kade',
    scrap: { red: 4, blue: 2, green: 3 },
    injuries: 1,
    stance: 'survivor',
    techLevels: { aggressive: 2, tactical: 1, hunkered: 2, survivor: 1 },
    upgrades: ['u1', 'u3'],
    weaponHand: ['w1', 'w2'],
    engagementThreat: 't2',
  },
  {
    id: 'p2',
    name: 'Mira "Spark" Rhee',
    scrap: { red: 2, blue: 5, green: 1 },
    injuries: 0,
    stance: 'tactical',
    techLevels: { aggressive: 1, tactical: 3, hunkered: 1, survivor: 1 },
    upgrades: ['u4'],
    weaponHand: ['w3'],
    engagementThreat: null,
  },
  {
    id: 'p3',
    name: 'Jonah "Forge" Hale',
    scrap: { red: 3, blue: 2, green: 4 },
    injuries: 2,
    stance: 'hunkered',
    techLevels: { aggressive: 1, tactical: 1, hunkered: 3, survivor: 2 },
    upgrades: ['u5', 'u2'],
    weaponHand: ['w4'],
    engagementThreat: 't3',
  },
  {
    id: 'p4',
    name: 'Vera "Whisper" Lin',
    scrap: { red: 1, blue: 4, green: 2 },
    injuries: 0,
    stance: 'aggressive',
    techLevels: { aggressive: 3, tactical: 1, hunkered: 1, survivor: 1 },
    upgrades: ['u6'],
    weaponHand: ['w5', 'w6'],
    engagementThreat: null,
  },
  {
    id: 'p5',
    name: 'Holt "Breaker" Ruiz',
    scrap: { red: 5, blue: 1, green: 2 },
    injuries: 1,
    stance: 'survivor',
    techLevels: { aggressive: 2, tactical: 1, hunkered: 1, survivor: 2 },
    upgrades: ['u7'],
    weaponHand: ['w7'],
    engagementThreat: 't4',
  },
];

let globalCardCounter = 1;
const instantiateCard = (template, suffix) => ({
  ...template,
  instanceId: suffix ?? `${template.id}-${globalCardCounter++}`,
});

const findTemplate = (library, cardId) => library.find((card) => card.id === cardId);

const createPlayers = () =>
  PLAYER_PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    scrap: preset.scrap,
    injuries: preset.injuries ?? 0,
    stance: preset.stance ?? 'survivor',
    techLevels:
      preset.techLevels ?? {
        aggressive: 1,
        tactical: 1,
        hunkered: 1,
        survivor: 1,
      },
    upgrades: preset.upgrades.map((cardId, idx) =>
      instantiateCard(findTemplate(UPGRADE_LIBRARY, cardId), `${preset.id}-up-${idx}`),
    ),
    weaponHand: preset.weaponHand.map((cardId, idx) =>
      instantiateCard(findTemplate(WEAPON_LIBRARY, cardId), `${preset.id}-wp-${idx}`),
    ),
    stagedWeapons: [],
    submittedWeapons: [],
    engagementThreat: preset.engagementThreat
      ? instantiateCard(findTemplate(THREAT_LIBRARY, preset.engagementThreat), `${preset.id}-threat`)
      : null,
  }));

const createCentralState = () => {
  const threatInstances = THREAT_LIBRARY.map((card) => instantiateCard(card));
  const upgradeInstances = UPGRADE_LIBRARY.map((card) => instantiateCard(card));
  const weaponInstances = WEAPON_LIBRARY.map((card) => instantiateCard(card));

  return {
    revealedThreats: threatInstances.slice(0, 6),
    threatDeck: threatInstances.slice(6),
    upgradeMarket: upgradeInstances.slice(0, 4),
    upgradeDeck: upgradeInstances.slice(4),
    weaponMarket: weaponInstances.slice(0, 3),
    weaponDeck: weaponInstances.slice(3),
  };
};

const PLAYERS_INITIAL = createPlayers();
const CENTRAL_INITIAL = createCentralState();

const cardKey = (card) => card?.instanceId ?? card?.id;

const ScrapCounter = ({ type, count }) => {
  const configMap = {
    red: { icon: Settings, color: 'text-red-500', bg: 'bg-red-950/50', border: 'border-red-900' },
    blue: { icon: Zap, color: 'text-blue-400', bg: 'bg-blue-950/50', border: 'border-blue-900' },
    green: { icon: Shield, color: 'text-green-500', bg: 'bg-green-950/50', border: 'border-green-900' },
  };

  const config = configMap[type];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.border} ${config.bg} shadow-md backdrop-blur-sm`}>
      <Icon className={`w-5 h-5 ${config.color}`} />
      <span className="text-xl font-bold text-white font-mono">{count}</span>
    </div>
  );
};

const GameCard = ({
  card,
  index,
  stackSize = 1,
  enableOverlap = true,
  onClick,
  isSelected = false,
  statusBadge,
  size = 'regular',
}) => {
  if (!card) return null;
  const overlapSpacing = Math.max(12, 36 - stackSize * 3);
  const marginLeft = enableOverlap && index > 0 ? -overlapSpacing : 0;
  const isClickable = typeof onClick === 'function';
  const dimensions = size === 'compact' ? 'w-20 h-28' : 'w-24 h-36';

  return (
    <div
      className={`
        relative ${dimensions} rounded-lg border-2 ${card.color}
        bg-slate-800 shadow-xl transition-all duration-200 origin-bottom
        group flex flex-col overflow-visible bg-opacity-95 backdrop-blur-sm
        ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-yellow-500' : 'cursor-default'}
        ${isSelected ? 'ring-2 ring-yellow-400' : ''}
      `}
      style={{ zIndex: 10 + index, marginLeft }}
      onClick={isClickable ? onClick : undefined}
    >
      <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-32 bg-slate-900/95 border border-slate-700 rounded-lg p-2 text-[10px] text-gray-100 shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200">
        <h4 className="font-bold mb-1">{card.title}</h4>
        <p className="text-[9px] text-gray-300 mb-1 leading-tight">{card.description}</p>
        <div className="flex justify-between text-[9px] uppercase text-gray-400">
          <span>{card.type}</span>
          <span>Cost {card.cost}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col rounded-lg overflow-hidden border border-white/5">
        <div className="h-1/3 bg-black/40 p-1">
          <div className="text-[8px] font-bold text-white leading-tight">{card.title}</div>
        </div>
        <div className="flex-1 flex items-center justify-center opacity-30">
          {card.type === 'weapon' ? <Sword size={20} /> : <Settings size={20} />}
        </div>
        <div className="bg-black/60 p-1 flex justify-between items-center">
          <span className="text-[8px] text-gray-300 uppercase">{card.type}</span>
          <span className="text-[10px] font-bold text-yellow-500">{card.cost}</span>
        </div>
      </div>

      {statusBadge && (
        <span className="absolute -top-3 right-0 bg-black/80 text-[8px] text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
          {statusBadge}
        </span>
      )}
    </div>
  );
};

const ThreatCard = ({ threat, onPick, compact = false, badge }) => {
  if (!threat) {
    return (
      <div className={`flex flex-col items-center justify-center border border-dashed border-white/20 rounded-xl ${compact ? 'w-28 h-36' : 'w-40 h-52'} text-xs text-slate-500`}>
        Empty Slot
      </div>
    );
  }

  return (
    <div className={`relative bg-slate-900/80 border border-slate-700 rounded-xl p-3 shadow-xl ${compact ? 'w-28 h-36' : 'w-40 h-52'}`}>
      <div className="text-[10px] uppercase text-slate-400">{threat.era}</div>
      <h4 className="text-sm font-bold text-white">{threat.name}</h4>
      <div className="grid grid-cols-3 gap-1 text-center text-[9px] mt-2">
        <div className="bg-red-900/40 rounded p-1">
          <div className="text-[8px] text-red-300">FER</div>
          <div className="text-lg font-black text-red-200">{threat.ferocity}</div>
        </div>
        <div className="bg-blue-900/40 rounded p-1">
          <div className="text-[8px] text-blue-300">CUN</div>
          <div className="text-lg font-black text-blue-200">{threat.cunning}</div>
        </div>
        <div className="bg-green-900/40 rounded p-1">
          <div className="text-[8px] text-green-300">MAS</div>
          <div className="text-lg font-black text-green-200">{threat.mass}</div>
        </div>
      </div>
      <p className="text-[10px] text-slate-300 mt-2 leading-tight">Reward: {threat.reward}</p>
      {onPick && (
        <button
          type="button"
          onClick={() => onPick(threat)}
          className="mt-2 text-[10px] uppercase tracking-wide w-full px-2 py-1 border border-amber-400 text-amber-300 rounded-full hover:bg-amber-500/10"
        >
          Pick Threat
        </button>
      )}
      {badge && (
        <span className="absolute -top-3 right-2 bg-red-600 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide">{badge}</span>
      )}
    </div>
  );
};

const TechTree = ({ levels }) => {
  const items = [
    { label: 'Aggressive', key: 'aggressive', color: 'bg-red-500/30' },
    { label: 'Tactical', key: 'tactical', color: 'bg-blue-500/30' },
    { label: 'Hunkered', key: 'hunkered', color: 'bg-green-500/30' },
    { label: 'Survivor', key: 'survivor', color: 'bg-slate-200/30' },
  ];

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
      <span className="text-[11px] text-gray-400 uppercase tracking-[0.3em]">Tech Tracks</span>
      <div className="mt-3 flex flex-col gap-3">
        {items.map((track) => {
          const level = levels?.[track.key] ?? 0;
          return (
            <div key={track.key}>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>{track.label}</span>
                <span>Lv. {level}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full mt-1 overflow-hidden">
                <div className={`${track.color} h-full`} style={{ width: `${(level / 4) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StanceNode = ({ active, color, onClick, position }) => (
  <button
    onClick={onClick}
    type="button"
    className={`
      absolute w-8 h-8 rounded-full border-2 flex items-center justify-center
      transition-all duration-300 z-10
      ${active ? 'scale-125 shadow-[0_0_15px_rgba(255,255,255,0.5)] bg-white' : 'bg-slate-900 hover:scale-110'}
      ${color} ${position}
    `}
  >
    <div className={`w-3 h-3 rounded-full ${active ? 'bg-slate-900' : 'bg-current'}`} />
  </button>
);

const StancePanel = ({ currentStance, setStance, onClose }) => (
  <div className="absolute bottom-full right-0 mb-4 w-64 h-64 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur-md p-4">
    <div className="flex justify-between items-start mb-2">
      <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Stance System</h3>
      <button type="button" onClick={onClose} className="text-gray-500 hover:text-white">
        <X size={16} />
      </button>
    </div>
    <div className="relative w-full h-40 mt-4">
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
        <line x1="50%" y1="10%" x2="15%" y2="90%" stroke="white" strokeWidth="2" />
        <line x1="50%" y1="10%" x2="85%" y2="90%" stroke="white" strokeWidth="2" />
        <line x1="15%" y1="90%" x2="85%" y2="90%" stroke="white" strokeWidth="2" />
        <line x1="50%" y1="10%" x2="50%" y2="55%" stroke="gray" strokeWidth="1" strokeDasharray="4" />
        <line x1="15%" y1="90%" x2="50%" y2="55%" stroke="gray" strokeWidth="1" strokeDasharray="4" />
        <line x1="85%" y1="90%" x2="50%" y2="55%" stroke="gray" strokeWidth="1" strokeDasharray="4" />
      </svg>
      <StanceNode
        active={currentStance === 'aggressive'}
        color="border-red-500 text-red-500"
        position="top-0 left-1/2 -translate-x-1/2"
        onClick={() => setStance('aggressive')}
      />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-5 text-[10px] text-red-500 font-bold">RED</div>
      <StanceNode
        active={currentStance === 'tactical'}
        color="border-blue-500 text-blue-500"
        position="bottom-0 left-[10%]"
        onClick={() => setStance('tactical')}
      />
      <div className="absolute bottom-[-20px] left-[10%] text-[10px] text-blue-400 font-bold">BLUE</div>
      <StanceNode
        active={currentStance === 'hunkered'}
        color="border-green-500 text-green-500"
        position="bottom-0 right-[10%]"
        onClick={() => setStance('hunkered')}
      />
      <div className="absolute bottom-[-20px] right-[10%] text-[10px] text-green-500 font-bold">GREEN</div>
      <StanceNode
        active={currentStance === 'survivor'}
        color="border-white text-white"
        position="top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2"
        onClick={() => setStance('survivor')}
      />
    </div>
    <div className="mt-6 text-center text-xs text-gray-400">
      Current: <span className="text-white font-bold uppercase">{currentStance}</span>
    </div>
  </div>
);

const PlayerDashboard = ({
  player,
  canDrawUpgrade,
  canDrawWeapon,
  onDrawUpgrade,
  onDrawWeapon,
  onToggleWeapon,
  openStancePanel,
  closeStancePanel,
  isStanceOpen,
  onStanceChange,
}) => {
  if (!player) return null;
  const playerBorderColorMap = {
    aggressive: 'border-red-500 shadow-red-500/50',
    tactical: 'border-blue-500 shadow-blue-500/50',
    hunkered: 'border-green-500 shadow-green-500/50',
    survivor: 'border-gray-200 shadow-white/20',
  };
  const playerBorderColor = playerBorderColorMap[player.stance] || playerBorderColorMap.survivor;

  return (
    <div className="relative bg-slate-900/80 border-t border-slate-800 px-10 py-6 backdrop-blur-sm">
      {isStanceOpen && (
        <div className="absolute top-0 right-10 -translate-y-full">
          <StancePanel currentStance={player.stance} setStance={onStanceChange} onClose={closeStancePanel} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div
            className={`
              w-20 h-20 rounded-full bg-slate-800 border-4 ${playerBorderColor} shadow-lg
              flex items-center justify-center overflow-hidden
            `}
          >
            {/* <img
              src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${player.id}&clothing=graphicShirt&eyes=surprised&top=shortHairShaggyMullet`}
              alt={player.name}
              className="w-full h-full object-cover"
            /> */}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Active Survivor</p>
            <h2 className="text-2xl font-bold text-white">{player.name}</h2>
            <div className="flex items-center gap-4 text-sm text-slate-300 mt-1">
              <span>Stance: <strong className="text-white uppercase">{player.stance}</strong></span>
              <span>Injuries: <strong className="text-rose-400">{player.injuries}</strong></span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ScrapCounter type="red" count={player.scrap.red} />
          <ScrapCounter type="blue" count={player.scrap.blue} />
          <ScrapCounter type="green" count={player.scrap.green} />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openStancePanel}
            className="px-4 py-2 rounded-full border border-slate-600 text-xs uppercase tracking-wider text-slate-200 hover:bg-slate-800"
          >
            Adjust Stance
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        <div className="lg:col-span-9 flex flex-row gap-6 min-w-0">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400 uppercase tracking-[0.2em]">Installed Upgrades ({player.upgrades.length})</span>
              <button
                type="button"
                onClick={onDrawUpgrade}
                disabled={!canDrawUpgrade}
                className={`text-[10px] uppercase tracking-wide px-3 py-1 rounded-full border ${
                  canDrawUpgrade ? 'border-emerald-500 text-emerald-400 hover:bg-emerald-500/10' : 'border-slate-700 text-slate-600 cursor-not-allowed'
                }`}
              >
                Draw Upgrade
              </button>
            </div>
            <div className="flex items-end flex-nowrap gap-2 mt-3 overflow-x-auto pb-2 pr-1">
              {player.upgrades.map((card, idx) => (
                <GameCard key={cardKey(card)} card={card} index={idx} stackSize={player.upgrades.length} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400 uppercase tracking-[0.2em]">
                Arsenal ({player.weaponHand.length + player.stagedWeapons.length}/{WEAPON_HAND_LIMIT})
              </span>
              <button
                type="button"
                onClick={onDrawWeapon}
                disabled={!canDrawWeapon}
                className={`text-[10px] uppercase tracking-wide px-3 py-1 rounded-full border ${
                  canDrawWeapon ? 'border-sky-500 text-sky-300 hover:bg-sky-500/10' : 'border-slate-700 text-slate-600 cursor-not-allowed'
                }`}
              >
                Draw Weapon
              </button>
            </div>
            <div className="flex items-end flex-nowrap gap-2 mt-3 overflow-x-auto pb-2 pr-1">
              {player.weaponHand.length === 0 ? (
                <span className="text-xs text-gray-500">No ready weapons.</span>
              ) : (
                player.weaponHand.map((card, idx) => (
                  <GameCard
                  key={cardKey(card)}
                  card={card}
                  index={idx}
                  stackSize={player.weaponHand.length}
                  onClick={() => onToggleWeapon(card)}
                  />
                ))
              )}
            </div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Click a weapon to send it to the Play Zone.</p>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-6">
          <TechTree levels={player.techLevels} />
        </div>
      </div>
    </div>
  );
};

const PlayerActionZone = ({ player, onToggleWeapon, onSubmitWeapons }) => (
  <div className="w-full h-full flex flex-col gap-6">
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 uppercase tracking-[0.3em]">Engagement Zone</span>
        <span className="text-[10px] text-gray-500">Pick from central panel</span>
      </div>
      <div className="mt-4 flex justify-center">
        {player.engagementThreat ? (
          <ThreatCard threat={player.engagementThreat} badge="Engaged" />
        ) : (
          <div className="w-full h-48 border border-dashed border-white/20 rounded-xl flex items-center justify-center text-xs text-gray-500">
            No threat selected. Claim one from the central panel.
          </div>
        )}
      </div>
    </div>

    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 uppercase tracking-[0.3em]">Play / Defense Zone</span>
        <span className="text-[10px] text-gray-500">{player.stagedWeapons.length} ready · {player.submittedWeapons.length} locked</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {player.stagedWeapons.length === 0 ? (
          <span className="text-xs text-gray-500">Stage weapons from your arsenal to prepare the clash.</span>
        ) : (
          player.stagedWeapons.map((card, idx) => (
            <GameCard
              key={cardKey(card)}
              card={card}
              index={idx}
              enableOverlap={false}
              onClick={() => onToggleWeapon(card)}
              isSelected
              statusBadge="In Play"
              size="compact"
            />
          ))
        )}
      </div>
      {player.submittedWeapons.length > 0 && (
        <div className="mt-4">
          <span className="text-[11px] text-gray-400 uppercase tracking-[0.2em]">Locked Defenses</span>
          <div className="mt-2 flex flex-wrap gap-3">
            {player.submittedWeapons.map((card, idx) => (
              <GameCard key={cardKey(card)} card={card} index={idx} enableOverlap={false} size="compact" statusBadge="Submitted" />
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onSubmitWeapons}
        disabled={!player.stagedWeapons.length}
        className={`mt-4 w-full px-4 py-2 rounded-full text-sm font-semibold uppercase tracking-wider border ${
          player.stagedWeapons.length ? 'border-red-500 text-white bg-red-500/80 hover:bg-red-500' : 'border-slate-700 text-slate-600 cursor-not-allowed'
        }`}
      >
        Submit Decision
      </button>
    </div>
  </div>
);

const PlayerMiniBoard = ({ player, isActive, onSelect }) => {
  const defenseCards = [
    ...player.stagedWeapons.map((card) => ({ card, status: 'Staged' })),
    ...player.submittedWeapons.map((card) => ({ card, status: 'Submitted' })),
  ];

  return (
    <div
      className={`flex-1 min-w-[280px] bg-slate-900/70 border rounded-2xl p-4 text-left transition-all duration-200 ${
        isActive ? 'border-amber-400 shadow-lg shadow-amber-500/20' : 'border-slate-700 hover:border-slate-500'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onSelect(player.id, true)} className="text-left">
          <h4 className="font-semibold text-white text-sm">{player.name}</h4>
          <div className="mt-1 flex gap-3 text-[10px] text-slate-400">
            <span>Scrap {player.scrap.red}/{player.scrap.blue}/{player.scrap.green}</span>
            <span>Inj {player.injuries}</span>
          </div>
        </button>
        <span className="text-[10px] uppercase tracking-wider text-slate-400">{player.stance}</span>
      </div>
      <div className="mt-3 flex gap-3 items-stretch">
        <div className="flex-shrink-0">
          {player.engagementThreat ? (
            <ThreatCard threat={player.engagementThreat} compact badge="Engaged" />
          ) : (
            <div className="w-28 h-36 border border-dashed border-white/20 rounded-xl flex items-center justify-center text-[10px] text-slate-500">
              Awaiting Threat
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <div className="text-[10px] uppercase text-slate-400">Defense &amp; Play</div>
          <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 pr-1 items-end">
            {defenseCards.length > 0 ? (
              defenseCards.map((entry, idx) => (
                <GameCard
                  key={cardKey(entry.card)}
                  card={entry.card}
                  index={idx}
                  enableOverlap={false}
                  size="compact"
                  statusBadge={entry.status}
                />
              ))
            ) : (
              <span className="text-[10px] text-slate-500">No defenses staged.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const CentralPanel = ({ state, assignLabel, onPickThreat }) => (
  <div className="relative bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-[0_0_50px_rgba(0,0,0,0.6)] w-full max-w-none h-full">
    <div className="text-center mb-4">
      <h3 className="text-lg font-bold uppercase tracking-[0.4em] text-white">Central Wilderness Panel</h3>
      <p className="text-xs text-slate-400">Threat Draft &bull; Upgrade Market &bull; Arsenal Market</p>
    </div>
    <div className="flex flex-col gap-4 h-full">
      <section className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-400">
          <span>Threat Deck</span>
          <span>{state.threatDeck.length} Remaining</span>
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          {state.revealedThreats.map((threat) => (
            <ThreatCard key={cardKey(threat)} threat={threat} compact onPick={onPickThreat} />
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-3">Reveal N+1 pigs (N=5). {assignLabel || 'Select a threat to engage.'}</p>
      </section>
      <div className="grid grid-rows-2 gap-4 flex-1">
        <section className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-400">
            <span>Upgrade Market</span>
            <span>{state.upgradeDeck.length} In Deck</span>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            {state.upgradeMarket.map((card, idx) => (
              <GameCard key={cardKey(card)} card={card} index={idx} enableOverlap={false} size="compact" />
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-3">Click Draw on a player board to claim one of the revealed upgrades.</p>
        </section>
        <section className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-400">
            <span>Arsenal Market</span>
            <span>{state.weaponDeck.length} In Deck</span>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            {state.weaponMarket.map((card, idx) => (
              <GameCard key={cardKey(card)} card={card} index={idx} enableOverlap={false} size="compact" />
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-3">Weapons obey a 2-card hand limit. Stage them into Play Zones before submitting.</p>
        </section>
      </div>
    </div>
  </div>
);

const TableOverview = ({
  players,
  centralState,
  activePlayerId,
  onSelectPlayer,
  onPickThreat,
  assignLabel,
}) => (
  <div className="w-full h-full flex flex-col">
    <div className="flex-1 flex items-center justify-center px-6">
      <CentralPanel state={centralState} assignLabel={assignLabel} onPickThreat={onPickThreat} />
    </div>
    <div className="w-full px-6 pb-6 flex gap-4 overflow-x-auto">
      {players.map((player) => (
        <PlayerMiniBoard key={player.id} player={player} isActive={player.id === activePlayerId} onSelect={onSelectPlayer} />
      ))}
    </div>
  </div>
);

const InitiativeRail = ({ players, activePlayerId, onSelect }) => (
  <div className="w-32 bg-slate-950/80 border-r border-slate-900 flex flex-col gap-4 py-10 px-4">
    <h4 className="text-xs uppercase tracking-[0.3em] text-slate-500">Initiative</h4>
    <div className="flex-1 flex flex-col gap-4">
      {players.map((player) => (
        <button
          key={player.id}
          type="button"
          onClick={() => onSelect(player.id, false)}
          className={`flex flex-col items-center gap-1 p-2 rounded-2xl border transition ${
            player.id === activePlayerId
              ? 'border-amber-400 bg-amber-400/10 text-white'
              : 'border-slate-800 text-slate-400 hover:border-slate-600'
          }`}
        >
          <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-700">
            <img
              src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${player.id}&clothing=graphicShirt&eyes=surprised&top=shortHairShaggyMullet`}
              alt={player.name}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-[10px] uppercase text-center leading-tight">{player.name.split(' ')[0]}</span>
          <div className="text-[9px] text-slate-400">
            Scrap {player.scrap.red}/{player.scrap.blue}/{player.scrap.green}
          </div>
          <div className="text-[9px] text-rose-300">Inj {player.injuries}</div>
        </button>
      ))}
    </div>
  </div>
);

const TopNavigation = ({ viewMode, onChangeView }) => {
  const buttons = [
    { id: VIEW_MODES.PLAYER, label: 'Battlefield' },
    { id: VIEW_MODES.TABLE, label: 'Whole Table' },
  ];

  return (
    <div className="h-16 px-10 flex items-center gap-4 border-b border-slate-900 bg-slate-950/80">
      {buttons.map((btn) => (
        <button
          key={btn.id}
          type="button"
          onClick={() => onChangeView(btn.id)}
          className={`px-4 py-2 rounded-full border text-xs uppercase tracking-wider transition ${
            viewMode === btn.id
              ? 'border-amber-400 text-amber-200 bg-amber-500/10'
              : 'border-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
};

export default function App() {
  const [players, setPlayers] = useState(() => PLAYERS_INITIAL);
  const [centralState, setCentralState] = useState(() => CENTRAL_INITIAL);
  const [activePlayerId, setActivePlayerId] = useState(() => PLAYERS_INITIAL[0]?.id ?? 'p1');
  const [viewMode, setViewMode] = useState(VIEW_MODES.PLAYER);
  const [statusMessage, setStatusMessage] = useState('');
  const [isStanceOpen, setIsStanceOpen] = useState(false);

  const activePlayer = players.find((player) => player.id === activePlayerId) ?? players[0];

  const updatePlayer = (playerId, updater) => {
    setPlayers((prev) => prev.map((player) => (player.id === playerId ? updater(player) : player)));
  };

  const replenishMarket = (market, deck) => {
    if (!deck.length) return { market, deck };
    const [nextCard, ...restDeck] = deck;
    return { market: [...market, nextCard], deck: restDeck };
  };

  const drawFromMarket = (marketKey, deckKey) => {
    let drawnCard = null;
    setCentralState((prev) => {
      const market = prev[marketKey];
      if (!market.length) return prev;
      const [card, ...restMarket] = market;
      drawnCard = card;
      const replenished = replenishMarket(restMarket, prev[deckKey]);
      return {
        ...prev,
        [marketKey]: replenished.market,
        [deckKey]: replenished.deck,
      };
    });
    return drawnCard;
  };

  const drawUpgrade = (playerId) => {
    const drawnCard = drawFromMarket('upgradeMarket', 'upgradeDeck');

    if (drawnCard) {
      updatePlayer(playerId, (player) => ({ ...player, upgrades: [...player.upgrades, drawnCard] }));
      setStatusMessage(`${activePlayer.name} installs ${drawnCard.title}.`);
    }
  };

  const drawWeapon = (playerId) => {
    const player = players.find((p) => p.id === playerId);
    const totalWeapons = (player?.weaponHand.length ?? 0) + (player?.stagedWeapons.length ?? 0);
    if (totalWeapons >= WEAPON_HAND_LIMIT) return;

    const drawnCard = drawFromMarket('weaponMarket', 'weaponDeck');

    if (drawnCard) {
      updatePlayer(playerId, (playerData) => ({ ...playerData, weaponHand: [...playerData.weaponHand, drawnCard] }));
      setStatusMessage(`${activePlayer.name} draws ${drawnCard.title}.`);
    }
  };

  const toggleWeaponPlay = (playerId, card) => {
    updatePlayer(playerId, (player) => {
      const key = cardKey(card);
      const inHand = player.weaponHand.some((c) => cardKey(c) === key);
      if (inHand) {
        return {
          ...player,
          weaponHand: player.weaponHand.filter((c) => cardKey(c) !== key),
          stagedWeapons: [...player.stagedWeapons, card],
        };
      }
      const inStaged = player.stagedWeapons.some((c) => cardKey(c) === key);
      if (inStaged) {
        return {
          ...player,
          stagedWeapons: player.stagedWeapons.filter((c) => cardKey(c) !== key),
          weaponHand: [...player.weaponHand, card],
        };
      }
      return player;
    });
    setStatusMessage(`${activePlayer.name} adjusts the Play Zone.`);
  };

  const submitWeapons = (playerId) => {
    updatePlayer(playerId, (player) => ({
      ...player,
      submittedWeapons: [...player.submittedWeapons, ...player.stagedWeapons],
      stagedWeapons: [],
    }));
    setStatusMessage(`${activePlayer.name} locks their plan for the clash.`);
  };

  const assignThreat = (playerId, threat) => {
    if (!threat) return;
    setCentralState((prev) => {
      const remaining = prev.revealedThreats.filter((card) => cardKey(card) !== cardKey(threat));
      const replenished = replenishMarket(remaining, prev.threatDeck);
      return {
        ...prev,
        revealedThreats: replenished.market.slice(0, 6),
        threatDeck: replenished.deck,
      };
    });
    updatePlayer(playerId, (player) => ({ ...player, engagementThreat: threat }));
    setStatusMessage(`${activePlayer.name} engages ${threat.name}.`);
  };

  const canDrawUpgrade = centralState.upgradeMarket.length > 0;
  const canDrawWeapon =
    centralState.weaponMarket.length > 0 &&
    activePlayer.weaponHand.length + activePlayer.stagedWeapons.length < WEAPON_HAND_LIMIT;

  const changeView = (mode) => {
    setViewMode(mode);
    setIsStanceOpen(false);
  };

  const handleSelectPlayer = (playerId, jumpToPlayerView) => {
    setActivePlayerId(playerId);
    if (viewMode === VIEW_MODES.PLAYER || jumpToPlayerView) {
      setViewMode(VIEW_MODES.PLAYER);
    }
  };

  const assignLabel = `Assign to ${activePlayer.name}`;

  return (
    <div className="w-full h-screen bg-slate-950 overflow-hidden relative font-sans selection:bg-red-500 selection:text-white flex">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black opacity-60 pointer-events-none" />

      <InitiativeRail players={players} activePlayerId={activePlayerId} onSelect={handleSelectPlayer} />

      <div className="flex-1 flex flex-col relative z-10">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center text-white/30 text-xs uppercase tracking-[0.4em] pointer-events-none">
          Wild Pigs Will Attack! &bull; Tabletop Sandbox v2.1
        </div>
        {statusMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-black/60 border border-slate-700 rounded-full px-6 py-2 text-sm text-amber-200 z-30">
            {statusMessage}
          </div>
        )}

        <TopNavigation viewMode={viewMode} onChangeView={changeView} />

        <div className="flex-1 relative overflow-hidden">
          {viewMode === VIEW_MODES.PLAYER && activePlayer && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 px-10 py-6 overflow-hidden">
                <div className="xl:col-span-5 min-h-[520px] flex flex-col">
                  <PlayerActionZone
                    player={activePlayer}
                    onToggleWeapon={(card) => toggleWeaponPlay(activePlayer.id, card)}
                    onSubmitWeapons={() => submitWeapons(activePlayer.id)}
                  />
                </div>
                <div className="xl:col-span-7 h-full">
                  <CentralPanel
                    state={centralState}
                    assignLabel={assignLabel}
                    onPickThreat={(threat) => assignThreat(activePlayerId, threat)}
                  />
                </div>
              </div>
              <PlayerDashboard
                player={activePlayer}
                canDrawUpgrade={canDrawUpgrade}
                canDrawWeapon={canDrawWeapon}
                onDrawUpgrade={() => drawUpgrade(activePlayer.id)}
                onDrawWeapon={() => drawWeapon(activePlayer.id)}
                onToggleWeapon={(card) => toggleWeaponPlay(activePlayer.id, card)}
                openStancePanel={() => setIsStanceOpen(true)}
                closeStancePanel={() => setIsStanceOpen(false)}
                isStanceOpen={isStanceOpen}
                onStanceChange={(stance) => updatePlayer(activePlayer.id, (player) => ({ ...player, stance }))}
              />
            </div>
          )}

          {viewMode === VIEW_MODES.TABLE && (
            <TableOverview
              players={players}
              centralState={centralState}
              activePlayerId={activePlayerId}
              onSelectPlayer={handleSelectPlayer}
              onPickThreat={(threat) => assignThreat(activePlayerId, threat)}
              assignLabel={assignLabel}
            />
          )}
        </div>

        {viewMode === VIEW_MODES.PLAYER && (
          <PlayerDashboard
            player={activePlayer}
            canDrawUpgrade={canDrawUpgrade}
            canDrawWeapon={canDrawWeapon}
            onDrawUpgrade={() => drawUpgrade(activePlayer.id)}
            onDrawWeapon={() => drawWeapon(activePlayer.id)}
            onToggleWeapon={(card) => toggleWeaponPlay(activePlayer.id, card)}
            openStancePanel={() => setIsStanceOpen(true)}
            closeStancePanel={() => setIsStanceOpen(false)}
            isStanceOpen={isStanceOpen}
            onStanceChange={(stance) => updatePlayer(activePlayer.id, (player) => ({ ...player, stance }))}
          />
        )}
      </div>

      {viewMode !== VIEW_MODES.PLAYER && (
        <button
          type="button"
          onClick={() => setViewMode(VIEW_MODES.PLAYER)}
          className="absolute bottom-6 right-6 flex items-center gap-2 px-4 py-2 rounded-full border border-amber-400 text-xs uppercase tracking-wider text-amber-200 hover:bg-amber-500/10 z-20"
        >
          <Users size={14} />
          Return to Player View
        </button>
      )}
    </div>
  );
}
