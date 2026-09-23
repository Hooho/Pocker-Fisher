export type Character = {
  id: number;
  name: string;
  style: string;
  level: number;
  aggression: number;
  bluff: number;
  bio: string;
};
export type Player = {
  profile: Character;
  chips: number;
  cards: number[];
  bet: number;
  total: number;
  folded: boolean;
  acted: boolean;
  last: string;
  start: number;
  raiseAt: number;
};
export type Game = {
  players: Player[];
  deck: number[];
  board: number[];
  dealer: number;
  turn: number;
  street: number;
  current: number;
  minRaise: number;
  bb: number;
  hand: number;
  done: boolean;
  log: string[];
  result: string;
  winners: number[];
};
export type Move = { type: "fold" | "call" | "raise"; amount?: number };
export type StartHandOptions = { debugFast?: boolean };
export const hero: Character = {
  id: -1,
  name: "你",
  style: "自由风格",
  level: 3,
  aggression: 0.5,
  bluff: 0.15,
  bio: "每一手，都是新的可能。",
};
export const rank = (c: number) => (c % 13) + 2;
export const suit = (c: number) => Math.floor(c / 13);
export function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    const j = b[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function evaluate(cards: number[]): {
  score: number;
  name: string;
  best: number[];
} {
  let best = { score: -1, name: "高牌", best: [] as number[] };
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const rs = five.map(rank).sort((x, y) => y - x);
            const counts = new Map<number, number>();
            rs.forEach((r) => counts.set(r, (counts.get(r) || 0) + 1));
            const groups = [...counts].sort(
              (x, y) => y[1] - x[1] || y[0] - x[0],
            );
            const flush = five.every((x) => suit(x) === suit(five[0]));
            const unique = [...new Set(rs)];
            const straight =
              unique.length === 5
                ? rs[0] - rs[4] === 4
                  ? rs[0]
                  : rs.join(",") === "14,5,4,3,2"
                    ? 5
                    : 0
                : 0;
            let category = 0;
            let values = rs;
            let name = "高牌";
            if (flush && straight) {
              category = 8;
              values = [straight];
              name = straight === 14 ? "皇家同花顺" : "同花顺";
            } else if (groups[0][1] === 4) {
              category = 7;
              values = groups.map((g) => g[0]);
              name = "四条";
            } else if (groups[0][1] === 3 && groups[1][1] === 2) {
              category = 6;
              values = groups.map((g) => g[0]);
              name = "葫芦";
            } else if (flush) {
              category = 5;
              name = "同花";
            } else if (straight) {
              category = 4;
              values = [straight];
              name = "顺子";
            } else if (groups[0][1] === 3) {
              category = 3;
              values = groups.map((g) => g[0]);
              name = "三条";
            } else if (groups[0][1] === 2 && groups[1][1] === 2) {
              category = 2;
              values = groups.map((g) => g[0]);
              name = "两对";
            } else if (groups[0][1] === 2) {
              category = 1;
              values = groups.map((g) => g[0]);
              name = "一对";
            }
            let score = category;
            for (let i = 0; i < 5; i++) score = score * 15 + (values[i] || 0);
            if (score > best.score) best = { score, name, best: five };
          }
  return best;
}
const rankLabel = (value: number) =>
  value === 14 ? "A" : value === 13 ? "K" : value === 12 ? "Q" : value === 11 ? "J" : String(value);
export function currentHandName(cards: number[]): string {
  if (cards.length >= 5) return evaluate(cards).name;
  if (!cards.length) return "等待发牌";
  const ranks = cards.map(rank).sort((a, b) => b - a);
  if (ranks.length === 2 && ranks[0] === ranks[1]) return "一对";
  return `${rankLabel(ranks[0])} 高牌`;
}
export const pot = (g: Game) => g.players.reduce((s, p) => s + p.total, 0);
function next(g: Game, from: number, can: (p: Player) => boolean) {
  for (let j = 1; j <= g.players.length; j++) {
    const i = (from + j) % g.players.length;
    if (can(g.players[i])) return i;
  }
  return -1;
}
export function newGame(
  profiles: Character[],
  bb = 100,
  stacks?: number[],
  options: StartHandOptions = {},
): Game {
  return startHand({
    players: profiles.map((profile, index) => ({
      profile,
      chips: stacks?.[index] ?? 10000,
      cards: [],
      bet: 0,
      total: 0,
      folded: false,
      acted: false,
      last: "",
      start: stacks?.[index] ?? 10000,
      raiseAt: -1,
    })),
    deck: [],
    board: [],
    dealer: profiles.length - 1,
    turn: 0,
    street: 0,
    current: 0,
    minRaise: bb,
    bb,
    hand: 0,
    done: true,
    log: [],
    result: "",
    winners: [],
  }, bb, options);
}
export function startHand(
  old: Game,
  bb = old.bb,
  options: StartHandOptions = {},
): Game {
  const g = structuredClone(old);
  g.deck = shuffled(Array.from({ length: 52 }, (_, i) => i));
  g.board = [];
  g.hand++;
  g.bb = bb;
  g.current = bb;
  g.minRaise = bb;
  g.street = 0;
  g.done = false;
  g.result = "";
  g.winners = [];
  g.players.forEach((p) => {
    p.cards = [];
    p.bet = 0;
    p.total = 0;
    p.folded = p.chips === 0;
    p.acted = false;
    p.last = p.folded ? "已出局" : "";
    p.start = p.chips;
    p.raiseAt = -1;
  });
  g.dealer = next(g, g.dealer, (p) => p.chips > 0);
  const alive = g.players.filter((p) => p.chips > 0).length;
  if (alive < 2) {
    g.done = true;
    g.result = "牌局结束";
    return g;
  }
  for (let j = 0; j < 2; j++)
    for (let k = 1; k <= g.players.length; k++) {
      const p = g.players[(g.dealer + k) % g.players.length];
      if (!p.folded) p.cards.push(g.deck.pop()!);
    }
  const sb = alive === 2 ? g.dealer : next(g, g.dealer, (p) => !p.folded);
  const big = next(g, sb, (p) => !p.folded);
  for (const [i, n] of [
    [sb, bb / 2],
    [big, bb],
  ]) {
    const p = g.players[i];
    const pay = Math.min(p.chips, n);
    p.chips -= pay;
    p.bet = pay;
    p.total = pay;
    p.last = i === sb ? "小盲" : "大盲";
  }
  g.turn = big;
  g.log = [`第 ${g.hand} 手 · 盲注 ${bb / 2} / ${bb}`, ...g.log].slice(0, 60);
  advance(g);
  return options.debugFast ? finishDebugHand(g) : g;
}

function finishDebugHand(g: Game): Game {
  if (g.done) return g;
  const heroIndex = g.players.findIndex((player) => player.profile.id === hero.id);
  if (heroIndex < 0 || g.players.filter((player) => player.chips > 0).length < 2) return g;
  const allInIndex = g.players.findIndex(
    (player, index) => index !== heroIndex && player.chips > 0,
  );
  if (allInIndex < 0) return g;

  const heroCards = [8, 9];
  const board = [10, 11, 12, 0, 1];
  const reserved = new Set([...heroCards, ...board]);
  const remaining = Array.from({ length: 52 }, (_, card) => card).filter(
    (card) => !reserved.has(card),
  );

  g.players.forEach((player, index) => {
    if (player.chips <= 0) {
      player.cards = [];
      player.folded = true;
      player.last = "已出局";
      return;
    }
    player.cards = index === heroIndex
      ? heroCards
      : [remaining.shift()!, remaining.shift()!];
    if (index !== heroIndex && index !== allInIndex) {
      player.folded = true;
      player.acted = true;
      player.last = "弃牌";
    }
  });
  const allInPlayer = g.players[allInIndex];
  const allIn = allInPlayer.chips;
  allInPlayer.folded = false;
  allInPlayer.chips = 0;
  allInPlayer.bet += allIn;
  allInPlayer.total += allIn;
  allInPlayer.acted = true;
  allInPlayer.raiseAt = g.current;
  allInPlayer.last = "全下";
  const heroPlayer = g.players[heroIndex];
  const call = Math.max(0, allInPlayer.total - heroPlayer.bet);
  const heroPay = Math.min(heroPlayer.chips, call);
  heroPlayer.chips -= heroPay;
  heroPlayer.bet += heroPay;
  heroPlayer.total += heroPay;
  heroPlayer.folded = false;
  heroPlayer.acted = true;
  heroPlayer.raiseAt = g.current;
  heroPlayer.last = heroPlayer.chips === 0 ? "全下" : `跟注 ${heroPay}`;
  g.board = board;
  g.street = 3;
  const holeCards = g.players.reduce((count, player) => count + player.cards.length, 0);
  const deckSize = 52 - g.street - g.board.length - holeCards;
  g.deck = remaining.slice(0, deckSize);
  g.current = Math.max(...g.players.map((player) => player.bet));
  g.turn = heroIndex;
  g.log = ["调试模式 · 你拿到皇家同花顺 · 一名选手全下", ...g.log].slice(0, 60);
  settle(g);
  return g;
}
export function legal(g: Game) {
  const p = g.players[g.turn];
  const toCall = Math.max(0, g.current - p.bet);
  const max = p.bet + p.chips;
  return {
    toCall,
    max,
    min: Math.min(max, g.current + g.minRaise),
    canRaise:
      max > g.current &&
      (p.raiseAt < 0 || g.current - p.raiseAt >= g.minRaise) &&
      g.players.some((x, i) => i !== g.turn && !x.folded && x.chips > 0),
  };
}
export function act(old: Game, move: Move): Game {
  if (old.done) return old;
  const g = structuredClone(old);
  const p = g.players[g.turn];
  const l = legal(g);
  if (p.folded || p.chips <= 0) return old;
  if (move.type === "fold") {
    p.folded = true;
    p.last = "弃牌";
  } else {
    let target =
      move.type === "raise" && l.canRaise
        ? Math.max(l.min, Math.min(l.max, Math.round(move.amount ?? l.min)))
        : Math.min(l.max, g.current);
    let pay = Math.max(0, target - p.bet);
    const prev = g.current;
    p.chips -= pay;
    p.bet += pay;
    p.total += pay;
    if (target > prev) {
      const increase = target - prev;
      if (increase >= g.minRaise) {
        g.minRaise = increase;
        g.players.forEach((x) => {
          if (x !== p) {
            x.acted = false;
            x.raiseAt = -1;
          }
        });
      }
      g.current = target;
      p.last = p.chips === 0 ? "全下" : `加注 ${target}`;
    } else p.last = pay === 0 ? "过牌" : p.chips === 0 ? "全下" : `跟注 ${pay}`;
  }
  p.acted = true;
  p.raiseAt = g.current;
  g.log = [`${p.profile.name} · ${p.last}`, ...g.log].slice(0, 60);
  advance(g);
  return g;
}
function advance(g: Game) {
  const live = g.players.filter((p) => !p.folded);
  if (live.length === 1) {
    settle(g);
    return;
  }
  const able = g.players.filter((p) => !p.folded && p.chips > 0);
  if (able.length <= 1 && able.every((p) => p.bet >= g.current)) {
    while (g.board.length < 5) dealStreet(g);
    settle(g);
    return;
  }
  const pending = (p: Player) =>
    !p.folded && p.chips > 0 && (!p.acted || p.bet < g.current);
  const i = next(g, g.turn, pending);
  if (i >= 0) {
    g.turn = i;
    return;
  }
  if (g.street === 3) {
    settle(g);
    return;
  }
  dealStreet(g);
  g.current = 0;
  g.minRaise = g.bb;
  g.players.forEach((p) => {
    p.bet = 0;
    p.acted = false;
    p.raiseAt = -1;
  });
  g.turn = g.dealer;
  advance(g);
}
function dealStreet(g: Game) {
  g.deck.pop();
  const n = g.board.length === 0 ? 3 : 1;
  for (let i = 0; i < n; i++) g.board.push(g.deck.pop()!);
  g.street = Math.min(3, g.street + 1);
}
export function settle(g: Game) {
  const levels = [
    ...new Set(g.players.map((p) => p.total).filter(Boolean)),
  ].sort((a, b) => a - b);
  let prev = 0;
  const wins = new Map<number, number>();
  for (const level of levels) {
    const contributors = g.players.filter((p) => p.total >= level);
    const pool = (level - prev) * contributors.length;
    prev = level;
    const eligible = g.players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.total >= level && !p.folded);
    if (!eligible.length) continue;
    const scored = eligible.map(({ p, i }) => ({
      i,
      score:
        eligible.length === 1 ? 0 : evaluate([...p.cards, ...g.board]).score,
    }));
    const high = Math.max(...scored.map((x) => x.score));
    const winners = scored
      .filter((x) => x.score === high)
      .map((x) => x.i)
      .sort(
        (a, b) =>
          ((a - g.dealer - 1 + g.players.length) % g.players.length) -
          ((b - g.dealer - 1 + g.players.length) % g.players.length),
      );
    const amount = Math.floor(pool / winners.length);
    winners.forEach((i, k) =>
      wins.set(
        i,
        (wins.get(i) || 0) + amount + (k < pool % winners.length ? 1 : 0),
      ),
    );
  }
  wins.forEach((n, i) => (g.players[i].chips += n));
  g.winners = [...wins.keys()];
  g.result = [...wins]
    .map(
      ([i, n]) =>
        `${g.players[i].profile.name} 赢得 ${n.toLocaleString()}${g.board.length === 5 ? " · " + evaluate([...g.players[i].cards, ...g.board]).name : ""}`,
    )
    .join(" / ");
  g.log = [g.result, ...g.log].slice(0, 60);
  g.done = true;
}
export type Observation = {
  cards: number[];
  board: number[];
  pot: number;
  call: number;
  min: number;
  max: number;
  canRaise: boolean;
  bb: number;
  opponents: number;
  profile: Character;
  history: string[];
  position: number;
  stacks: number[];
  stack: number;
  qualify?: number;
  memory?: string[];
};
export function observe(g: Game): Observation {
  const p = g.players[g.turn];
  const l = legal(g);
  return {
    cards: p.cards,
    board: g.board,
    pot: pot(g),
    call: l.toCall,
    min: l.min,
    max: l.max,
    canRaise: l.canRaise,
    bb: g.bb,
    opponents: g.players.filter((x) => !x.folded).length - 1,
    profile: p.profile,
    position: (g.turn - g.dealer + g.players.length) % g.players.length,
    stacks: g.players
      .filter((x) => !x.folded && x.chips > 0)
      .map((x) => x.chips),
    stack: p.chips,
    history: g.log.slice(0, 15),
  };
}
export function decide(o: Observation, options: { fast?: boolean } = {}): Move {
  let strength = 0;
  const rs = o.cards.map(rank);
  if (o.board.length < 3) {
    strength =
      (Math.max(...rs) / 14) * 0.45 +
      (Math.min(...rs) / 14) * 0.2 +
      (rs[0] === rs[1] ? 0.3 : 0) +
      (suit(o.cards[0]) === suit(o.cards[1]) ? 0.06 : 0) +
      (Math.abs(rs[0] - rs[1]) <= 2 ? 0.04 : 0);
  } else {
    const known = new Set([...o.cards, ...o.board]);
    const remaining = Array.from({ length: 52 }, (_, i) => i).filter(
      (x) => !known.has(x),
    );
    const iterations = options.fast ? 4 : 12 + o.profile.level * 9;
    let won = 0;
    for (let i = 0; i < iterations; i++) {
      const deck = shuffled(remaining);
      const board = [...o.board];
      while (board.length < 5) board.push(deck.pop()!);
      const ours = evaluate([...o.cards, ...board]).score;
      let high = ours;
      let ties = 1;
      for (let j = 0; j < o.opponents; j++) {
        const s = evaluate([deck.pop()!, deck.pop()!, ...board]).score;
        if (s > high) high = s;
        if (s === ours) ties++;
      }
      if (ours === high) won += 1 / ties;
    }
    strength = won / iterations;
  }
  const memory = o.memory || [];
  const observed = memory.filter((x) => x.startsWith("你 ·"));
  const foldRate =
    observed.filter((x) => x.includes("弃牌")).length /
    Math.max(1, observed.length);
  const adaptation =
    o.profile.level >= 3 && observed.length >= 8 ? (foldRate - 0.3) * 0.1 : 0;
  const bubble = !!o.qualify && o.stacks.length <= o.qualify + 1;
  const middle =
    bubble &&
    o.stack > Math.min(...o.stacks) &&
    o.stack < Math.max(...o.stacks);
  const noise = (Math.random() - 0.5) * (0.3 - o.profile.level * 0.045);
  strength += noise + adaptation + (o.position === 0 ? 0.025 : 0);
  if (middle) strength -= 0.09;
  if (o.stack < o.bb * 8 && strength > 0.48) strength += 0.1;
  const odds = o.call / (o.pot + o.call || 1);

  // Short-stack push/fold: under ~15 effective big blinds, real players stop
  // flat-calling preflop and just shove or fold. The shove range widens as the
  // stack gets shorter and as fewer opponents remain to run through, and
  // tightens back up on the money bubble for a stack that isn't already committed.
  const effectiveBB = o.stack / o.bb;
  if (o.canRaise && o.board.length === 0 && effectiveBB <= 15) {
    const wideness =
      Math.min(0.32, (15 - effectiveBB) * 0.024) +
      (o.opponents <= 2 ? 0.08 : 0) -
      (middle ? 0.07 : 0);
    const shoveAt = 0.52 - wideness;
    if (strength >= shoveAt) return { type: "raise", amount: o.max };
    if (o.call > 0) return { type: "fold" };
  }

  if (o.call > 0 && strength < odds + 0.07 + (1 - o.profile.aggression) * 0.09)
    return { type: "fold" };
  if (
    o.canRaise &&
    (strength > 0.68 || Math.random() < o.profile.bluff * 0.3) &&
    Math.random() < o.profile.aggression + 0.15
  ) {
    // Bet sizing scales smoothly with hand strength instead of jumping between
    // two fixed pot fractions, with a little noise so size alone never gives
    // the hand away (occasional small value bets, occasional big bluffs).
    const baseFraction = 0.34 + Math.max(0, strength - 0.5) * 1.1;
    const sizingNoise = (Math.random() - 0.5) * 0.22;
    const fraction = Math.min(1.15, Math.max(0.3, baseFraction + sizingNoise));
    return {
      type: "raise",
      amount: Math.max(
        o.min,
        Math.min(o.max, Math.round((o.pot * fraction + o.call) / 50) * 50),
      ),
    };
  }
  return { type: "call" };
}
