const rounds = [];

// ทบ 3 ไม้: x1 -> x2 -> x4 แล้วตัดจบกลับไม้ 1. Back to the original steeper
// progression on request (was softened to [1,1.5,2] for a while — a full
// 3-step loss costs 7x baseBet again instead of 4.5x).
const MULTIPLIERS = [1, 2, 4];
// Lowered from 6 to 4 on request, to start recommending sooner.
const WARMUP_ROUNDS = 4;
// Room-fit needs more data than the betting warmup: 6 rounds is enough to
// start betting, but stats like tie% and pattern-readability% are still too
// noisy at 6 to say "stay or switch rooms" honestly (e.g. one tie in 6
// rounds reads as 16.7%, versus the true ~9.5% base rate). 20 rounds is
// where those percentages stop swinging wildly round to round.
const ROOM_FIT_MIN_ROUNDS = 20;

// Standard 8-deck baccarat probabilities (widely published reference odds).
// House edge per 1 unit staked, after Banker's 5% commission on wins.
const ODDS = {
  P: 0.4462, B: 0.4586, T: 0.0952,
  edgeP: 0.0124, edgeB: 0.0106, edgeT: 0.1436,
};

const els = {
  total: document.getElementById('total'),
  playerCount: document.getElementById('player-count'),
  bankerCount: document.getElementById('banker-count'),
  tieCount: document.getElementById('tie-count'),
  playerPct: document.getElementById('player-pct'),
  bankerPct: document.getElementById('banker-pct'),
  suggestCall: document.getElementById('suggest-call'),
  accGauge: document.getElementById('accGauge'),
  accGaugeArc: document.getElementById('accGaugeArc'),
  accGaugePct: document.getElementById('accGaugePct'),
  accGaugeSub: document.getElementById('accGaugeSub'),
  suggestReason: document.getElementById('suggest-reason'),
  chipIcon: document.getElementById('chipIcon'),
  chipLabel: document.getElementById('chipLabel'),
  rounds: document.getElementById('rounds'),
  beadGrid: document.getElementById('beadGrid'),
  bigRoadGrid: document.getElementById('bigRoadGrid'),
  streakLine: document.getElementById('streakLine'),
  barP: document.getElementById('barP'),
  barB: document.getElementById('barB'),
  barT: document.getElementById('barT'),
  btnUndo: document.getElementById('btn-undo'),
  baseBet: document.getElementById('baseBet'),
  stepsIndicator: document.getElementById('stepsIndicator'),
  nextBetAmount: document.getElementById('nextBetAmount'),
  stepTag: document.getElementById('stepTag'),
  moneyWins: document.getElementById('moneyWins'),
  moneyLosses: document.getElementById('moneyLosses'),
  moneyPushes: document.getElementById('moneyPushes'),
  netProfit: document.getElementById('netProfit'),
  hitRate: document.getElementById('hitRate'),
  maxStep: document.getElementById('maxStep'),
  moneyLog: document.getElementById('moneyLog'),
  tableStatus: document.getElementById('tableStatus'),
  tableStatusTitle: document.getElementById('tableStatusTitle'),
  tableStatusReasons: document.getElementById('tableStatusReasons'),
  roomFit: document.getElementById('roomFit'),
  roomFitTitle: document.getElementById('roomFitTitle'),
  roomFitGood: document.getElementById('roomFitGood'),
  roomFitBad: document.getElementById('roomFitBad'),
  tieStreakText: document.getElementById('tieStreakText'),
  gameFix: document.getElementById('gameFix'),
  gameFixTitle: document.getElementById('gameFixTitle'),
  gameFixText: document.getElementById('gameFixText'),
  bebStrip: document.getElementById('bebStrip'),
  bebLatest: document.getElementById('bebLatest'),
  oddEvenLine: document.getElementById('oddEvenLine'),
}

document.getElementById('btn-player').addEventListener('click', ()=>addResult('P'))
document.getElementById('btn-banker').addEventListener('click', ()=>addResult('B'))
document.getElementById('btn-tie').addEventListener('click', ()=>addResult('T'))
document.getElementById('btn-undo').addEventListener('click', undo)
document.getElementById('btn-clear').addEventListener('click', clearAll)
document.getElementById('btn-reset-stats').addEventListener('click', clearAll)
document.getElementById('btn-reset-money').addEventListener('click', resetMoney)
els.baseBet.addEventListener('input', updateUI)

// Keyboard shortcuts for fast entry while watching a live table: P/B/T add a
// result, Z or Backspace undoes the last one. Ignored while typing in an
// input (e.g. the base-bet field) so they don't hijack normal text entry.
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const key = e.key.toLowerCase();
  if (key === 'p'){ e.preventDefault(); addResult('P'); }
  else if (key === 'b'){ e.preventDefault(); addResult('B'); }
  else if (key === 't'){ e.preventDefault(); addResult('T'); }
  else if (key === 'z' || key === 'backspace'){ e.preventDefault(); undo(); }
});

function addResult(r){
  rounds.push({r,winner:r});
  updateUI();
}

function undo(){
  rounds.pop();
  updateUI();
}

// Scoped to the money-management card: resets the base bet back to its
// default without touching the recorded rounds, stats, or history —
// "รีเซ็ตทั้งหมด" (btn-clear) is the one that clears everything.
function resetMoney(){
  els.baseBet.value = 20;
  updateUI();
}

function clearAll(){
  rounds.length = 0;
  updateUI();
}

function computeStats(){
  let player=0,banker=0,tie=0;
  for(const x of rounds){
    if(x.winner==='P') player++;
    else if(x.winner==='B') banker++;
    else if(x.winner==='T') tie++;
  }
  const total = player+banker+tie;
  const pPct = total? Math.round((player/total)*100):0;
  const bPct = total? Math.round((banker/total)*100):0;
  return {player,banker,tie,total,pPct,bPct};
}

function currentStreakFor(winners){
  let len = 0;
  let side = null;
  for (let i = winners.length - 1; i >= 0; i--){
    const r = winners[i];
    if (r === 'T') continue;
    if (side === null){ side = r; len = 1; continue; }
    if (r === side){ len++; } else { break; }
  }
  return { side, len };
}

function nonTieFor(winners){
  return winners.filter(r => r !== 'T');
}

// Hands since the last Tie (or since the start, if none yet). Standard
// 8-deck odds put Tie at 9.52% per hand, so it "should" land roughly every
// ~10.5 hands on average — this is just an observed gap, not a prediction:
// ties are exactly as independent as everything else in this game.
function tieGapFor(winners){
  let gap = 0;
  for (let i = winners.length - 1; i >= 0; i--){
    if (winners[i] === 'T') break;
    gap++;
  }
  return gap;
}

// Groups a winners sequence into Big Road columns: consecutive same-side
// wins stack into the same column; a change of side starts a new column;
// ties don't break a column, they're just skipped (Big Road doesn't track
// them beyond an overlay marker, which isn't needed for the road math).
function buildBigRoadColumns(winners){
  const columns = [];
  let lastSide = null;
  for (const w of winners){
    if (w === 'T') continue;
    if (lastSide === null || w !== lastSide){
      columns.push([w]);
      lastSide = w;
    } else {
      columns[columns.length - 1].push(w);
    }
  }
  return columns;
}

// Same grouping as buildBigRoadColumns, but keeps a tie counter per cell
// (attached to whichever cell was most recently plotted) purely for the
// Big Road grid's overlay marker — the road math never needs tie counts.
function buildBigRoadCells(winners){
  const columns = [];
  let lastSide = null;
  for (const w of winners){
    if (w === 'T'){
      if (columns.length){
        const col = columns[columns.length - 1];
        col[col.length - 1].ties++;
      }
      continue;
    }
    if (lastSide === null || w !== lastSide){
      columns.push([{ side: w, ties: 0 }]);
      lastSide = w;
    } else {
      columns[columns.length - 1].push({ side: w, ties: 0 });
    }
  }
  return columns;
}

const sideName = s => (s === 'B' ? 'Banker' : 'Player');

// All named-pattern detection (Dragon, Ping-Pong, Two/Three/Four-Cut-One)
// removed on request, pending a new formula to replace them. getSuggestion()
// below now always reports "no pattern" until that's written.

// "คู่-คี่" (odd/even): weakest, last-resort read — looks at whether the
// CURRENT (still-open) column's length is even or odd. Even ("คู่") reads as
// "the streak keeps going", odd ("คี่") reads as "due to switch". Checked
// dead last, after every stronger named pattern has failed to match, and
// scored low (50-58) on the confidence gauge since it's the least-confirmed
// heuristic here — same disclaimer as every other pattern: this doesn't
// change the real win probability, which never moves off the game's fixed
// base rate no matter how this column's length parity falls.
function detectOddEven(columns){
  if (columns.length === 0) return null;
  const last = columns[columns.length - 1];
  const lastLen = last.length;
  const lastSide = last[0];
  const isEven = lastLen % 2 === 0;

  if (isEven){
    return {
      pick: lastSide,
      label: 'คู่-คี่ (Odd-Even)',
      parity: 'even',
      strength: Math.min(58, 52 + lastLen),
      reasonText: `คอลัมน์ปัจจุบันของฝั่ง ${sideName(lastSide)} ยาว ${lastLen} ตา (เลขคู่) จึงมองว่ายังไปต่อในฝั่งเดิม — เป็นการอ่านที่มั่นใจต่ำสุดในระบบนี้`,
    };
  }
  const pick = lastSide === 'P' ? 'B' : 'P';
  return {
    pick,
    label: 'คู่-คี่ (Odd-Even)',
    parity: 'odd',
    strength: 50,
    reasonText: `คอลัมน์ปัจจุบันของฝั่ง ${sideName(lastSide)} ยาว ${lastLen} ตา (เลขคี่) จึงมองว่าใกล้ถึงตาตัดสลับไปฝั่ง ${sideName(pick)} — เป็นการอ่านที่มั่นใจต่ำสุดในระบบนี้`,
  };
}

// Big Eye Boy ("เค้าตาแดง/ตาน้ำเงินเล็ก") is a road *derived* from Big Road:
// it doesn't look at P/B directly, but compares the shape of the current
// Big Road column against the column one before it. Red = the columns match
// (same length, or the gap between the last two column-lengths repeats) —
// read as "the pattern repeats" (Banker signal on physical scoreboards).
// Blue = they don't match — "the pattern breaks" (Player signal). Only
// plots once there are enough columns to compare.
function deriveBigEyeBoy(columns){
  const points = [];
  const k = 1;
  for (let c = 0; c < columns.length; c++){
    for (let r = 0; r < columns[c].length; r++){
      if (r > 0){
        if (c - k < 0) continue;
        points.push({ c, r, color: columns[c - k].length > r ? 'red' : 'blue' });
      } else {
        if (c - k - 1 < 0) continue;
        points.push({ c, r, color: columns[c - k].length === columns[c - k - 1].length ? 'red' : 'blue' });
      }
    }
  }
  return points;
}

// All named-pattern detection was removed on request, pending a new formula
// — this always reports "no pattern" for now, so nothing gets bet on.
// Important: baccarat hands are independent draws — a new formula won't
// change that. Real long-run accuracy sits at the game's base rate
// (~45-50%), same as a coin flip weighted by house odds, no matter what
// eventually replaces this.
//
// Pattern engine (provided by the user, "Production Version" — supersedes
// the earlier 16-shape version): run-length-encodes the last `maxHistory`
// raw results (ties included, then stripped) into groups, flags 8 named
// shapes, and resolves them into one pattern via getPattern()'s own
// priority order. detect() says WHICH shape won, not which side to bet —
// PATTERN_PICKS right after adds that layer for the recommend card/betting
// logic, following the same streak-continues vs cut-switches logic as
// before.
class BaccaratPatternEngine {
  constructor(results = [], options = {}) {
    this.maxHistory = options.maxHistory ?? 20;
    this.dragonMin = options.dragonMin ?? 4;

    this.results = results
      .map(v => String(v).toUpperCase())
      .filter(v => ['B', 'P', 'T'].includes(v));

    this.results = this.results.slice(-this.maxHistory);

    this.playResults = this.removeTie(this.results);

    this.groups = this.buildGroups();
  }

  removeTie(data) {
    return data.filter(v => v !== 'T');
  }

  buildGroups() {
    const groups = [];
    for (const side of this.playResults) {
      const last = groups[groups.length - 1];
      if (!last || last.side !== side) {
        groups.push({ side, count: 1 });
      } else {
        last.count++;
      }
    }
    return groups;
  }

  counts() {
    return this.groups.map(g => g.count);
  }

  isDragon() {
    return this.groups.some(g => g.count >= this.dragonMin);
  }

  isShortDragon() {
    return this.groups.some(g => g.count >= 4 && g.count <= 6);
  }

  isLongDragon() {
    return this.groups.some(g => g.count >= 7);
  }

  isPingPong() {
    return this.groups.length >= 4 && this.groups.every(g => g.count === 1);
  }

  isNCut(n) {
    return this.groups.length >= 2 && this.groups.every(g => g.count === n);
  }

  isTwoCut() { return this.isNCut(2); }
  isThreeCut() { return this.isNCut(3); }

  isBrokenDragon() {
    const g = this.groups;
    for (let i = 1; i < g.length - 1; i++) {
      if (g[i].count === 1 && g[i - 1].count >= this.dragonMin && g[i + 1].count >= this.dragonMin && g[i - 1].side === g[i + 1].side) {
        return true;
      }
    }
    return false;
  }

  isDoubleDragon() {
    let streak = 0;
    for (const g of this.groups) {
      streak = g.count >= this.dragonMin ? streak + 1 : 0;
      if (streak >= 2) return true;
    }
    return false;
  }

  getPattern() {
    if (this.isBrokenDragon()) return 'BROKEN_DRAGON';
    if (this.isLongDragon()) return 'LONG_DRAGON';
    if (this.isThreeCut()) return 'THREE_CUT';
    if (this.isTwoCut()) return 'TWO_CUT';
    if (this.isPingPong()) return 'PING_PONG';
    if (this.isDoubleDragon()) return 'DOUBLE_DRAGON';
    if (this.isShortDragon()) return 'SHORT_DRAGON';
    if (this.isDragon()) return 'DRAGON';
    return 'MIXED';
  }

  detect() {
    return {
      maxHistory: this.maxHistory,
      originalResults: this.results,
      playResults: this.playResults,
      groups: this.groups,
      dragon: this.isDragon(),
      shortDragon: this.isShortDragon(),
      longDragon: this.isLongDragon(),
      pingPong: this.isPingPong(),
      twoCut: this.isTwoCut(),
      threeCut: this.isThreeCut(),
      brokenDragon: this.isBrokenDragon(),
      doubleDragon: this.isDoubleDragon(),
      pattern: this.getPattern(),
    };
  }
}

// Maps each of getPattern()'s 8 outcomes (MIXED excluded — no clear
// direction) to a pick rule and a confidence score (0-100, this pattern's
// own confidence in itself — not a claim about the real win probability,
// which stays at the game's fixed base rate regardless of which pattern
// fired). 'streak' bets the current run continues; 'cut' bets the next
// group switches to the other side.
const PATTERN_PICKS = {
  BROKEN_DRAGON: { label: 'Broken Dragon', type: 'streak', strength: 66 },
  LONG_DRAGON: { label: 'Long Dragon', type: 'streak', strength: 85 },
  THREE_CUT: { label: '3-Cut', type: 'cut', strength: 63 },
  TWO_CUT: { label: '2-Cut', type: 'cut', strength: 62 },
  PING_PONG: { label: 'Ping Pong', type: 'cut', strength: 65 },
  DOUBLE_DRAGON: { label: 'Double Dragon', type: 'streak', strength: 74 },
  SHORT_DRAGON: { label: 'Short Dragon', type: 'streak', strength: 72 },
  DRAGON: { label: 'Dragon', type: 'streak', strength: 70 },
};

function pickForDetection(engine, result){
  const meta = PATTERN_PICKS[result.pattern];
  if (!meta || engine.groups.length === 0) return null;

  const last = engine.groups[engine.groups.length - 1];
  const lastSide = last.side;
  const opposite = lastSide === 'P' ? 'B' : 'P';

  if (meta.type === 'streak'){
    return {
      pick: lastSide,
      label: meta.label,
      strength: meta.strength,
      reasonText: `${sideName(lastSide)} ออกติดต่อกัน ${last.count} ตา (${meta.label}) คาดว่าจะไปต่อฝั่งเดิม`,
    };
  }
  return {
    pick: opposite,
    label: meta.label,
    strength: meta.strength,
    reasonText: `รูปแบบ ${meta.label} คาดว่าจะสลับไปฝั่ง ${sideName(opposite)}`,
  };
}

function getSuggestion(winners){
  if (winners.length === 0){
    return { pick: null, confidence: null, strength: null, reasonText: 'ยังไม่มีข้อมูลให้วิเคราะห์' };
  }
  const nt = nonTieFor(winners);
  if (nt.length === 0){
    return { pick: null, confidence: null, strength: null, reasonText: 'มีแต่ผลเสมอในประวัติ ลองบันทึกผล Player หรือ Banker เพิ่มอีกสักตา' };
  }

  const engine = new BaccaratPatternEngine(winners, { maxHistory: 20, dragonMin: 4 });
  const result = engine.detect();
  const found = pickForDetection(engine, result);
  if (found){
    return { pick: found.pick, confidence: found.label, strength: found.strength, reasonText: found.reasonText };
  }

  return { pick: null, confidence: null, strength: null, reasonText: 'ไม่มีเค้าที่ชัดเจนพอ (Mixed) ระบบจะรอจนกว่าจะมั่นใจ' };
}

// Plain pass-through to getSuggestion — kept as its own function (rather
// than replacing every call site) since simulateMoney/renderRecommendation/
// renderGameFix/evaluateRoomFit all call this name. Previously flipped the
// pick against recent stats or a loss streak ("แทงสวนแพทเทิร์น"); removed
// on request. `faded` stays in the return shape for compatibility but is
// now always false.
function getFinalSuggestion(winners, consecutiveLosses){
  const sugg = getSuggestion(winners);
  return { ...sugg, faded: false };
}

// Replays the history: the first WARMUP_ROUNDS results are observation only
// (no bet placed, nothing tallied) so there's a baseline read on the room
// before any money moves. From round 7 onward every round is bet on the
// fixed EV pick above, compared to the actual result to drive the 3-step
// (1x/2x/4x) progression. A cycle only counts as "เสีย" once all 3 steps
// have lost in a row — a loss on step 1 or 2 just carries it forward.
function simulateMoney(baseBet){
  let step = 0; // 0-indexed into MULTIPLIERS
  let netProfit = 0;
  let wins = 0, losses = 0, pushes = 0, maxStep = 1;
  let consecutiveLosses = 0, maxConsecutiveLosses = 0;
  const log = [];

  for (let i = WARMUP_ROUNDS; i < rounds.length; i++){
    const priorWinners = rounds.slice(0, i).map(x => x.winner);
    const sugg = getFinalSuggestion(priorWinners, consecutiveLosses);
    if (!sugg.pick) continue;

    const actual = rounds[i].winner;
    const betAmount = baseBet * MULTIPLIERS[step];
    maxStep = Math.max(maxStep, step + 1);

    if (actual === 'T'){
      pushes++;
      log.push({ round: i + 1, step: step + 1, pick: sugg.pick, actual, betAmount, outcome: 'push', profit: 0 });
      continue;
    }

    if (actual === sugg.pick){
      wins++;
      consecutiveLosses = 0;
      const commission = actual === 'B' ? 0.95 : 1;
      const profit = betAmount * commission;
      netProfit += profit;
      log.push({ round: i + 1, step: step + 1, pick: sugg.pick, actual, betAmount, outcome: 'win', profit });
      step = 0;
    } else {
      netProfit -= betAmount;
      const isFinalStep = step === MULTIPLIERS.length - 1;
      if (isFinalStep){
        losses++;
        consecutiveLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
      }
      log.push({ round: i + 1, step: step + 1, pick: sugg.pick, actual, betAmount, outcome: isFinalStep ? 'loss' : 'carry', profit: -betAmount });
      step = isFinalStep ? 0 : step + 1;
    }
  }

  return { step, netProfit, wins, losses, pushes, maxStep, log, consecutiveLosses, maxConsecutiveLosses };
}

// Bankroll-management guardrail: flags when this table looks bad enough
// that the honest advice is to stop and walk away, not "bet smarter".
// None of these thresholds change the underlying math (still independent
// hands) — they're a practical stop-loss/tilt check on the session so far.
function evaluateTableHealth(sim, baseBet){
  const decided = sim.wins + sim.losses;
  const hitRatePct = decided ? (sim.wins / decided) * 100 : null;
  const lossMultiple = baseBet > 0 ? -sim.netProfit / baseBet : 0;
  const reasons = [];

  if (sim.consecutiveLosses >= 2){
    reasons.push(`แพ้ครบ 3 ไม้ติดต่อกัน ${sim.consecutiveLosses} รอบซ้อน`);
  }
  if (decided >= 5 && hitRatePct < 35){
    reasons.push(`อัตราถูกแค่ ${Math.round(hitRatePct)}% จาก ${decided} รอบที่ตัดสินแล้ว (ต่ำกว่าเกณฑ์ 35%)`);
  }
  if (lossMultiple >= 5){
    reasons.push(`ขาดทุนสะสมแล้ว ${formatMoney(lossMultiple)} เท่าของเงินเดิมพันตั้งต้น`);
  }

  return { shouldStop: reasons.length > 0, reasons, decided, hitRatePct };
}

// "แก้เกม" (game-fix) advisory: triggers right after a loss. Since
// getSuggestion() re-reads the Big Road from scratch every round anyway,
// there's no separate "broken strategy" to swap out — the honest fix here is
// just to surface, in plain language, what just happened and what the
// freshly re-read pattern says now, so a loss doesn't get chased blindly.
function evaluateGameFix(sim, freshSugg){
  const last = sim.log[sim.log.length - 1];
  if (!last || last.outcome === 'win' || last.outcome === 'push') return null;

  const lastSideName = last.pick === 'P' ? 'Player' : 'Banker';

  if (last.outcome === 'carry'){
    const nextPick = freshSugg.pick;

    // Lost 2 steps in a row (about to bet the final, highest-stake step) —
    // treat this as urgent: re-read the pattern right now rather than
    // waiting for the full 3-step cycle to lose before flagging it.
    if (last.step >= 2){
      const switched = nextPick && nextPick !== last.pick;
      return {
        severity: 'urgent',
        title: `ผิดมาแล้ว 2 ไม้ติด (แทง ${lastSideName}) — รีบวิเคราะห์ใหม่ด่วน`,
        text: nextPick
          ? `ไม้สุดท้าย (x${MULTIPLIERS[MULTIPLIERS.length - 1]}) กำลังจะมาถึง ระบบอ่าน Big Road ปัจจุบันใหม่ทันที และ${switched ? `เปลี่ยนฝั่งเป็น ${nextPick === 'P' ? 'Player' : 'Banker'} (${freshSugg.confidence}) แล้ว เพราะรูปแบบเปลี่ยนไปจากเดิม` : `ยังคงชี้ไปทาง ${nextPick === 'P' ? 'Player' : 'Banker'} (${freshSugg.confidence}) เหมือนเดิม แต่ผิดมาแล้ว 2 ไม้ ให้ทบทวนก่อนลงไม้สุดท้าย`}`
          : `ไม้สุดท้าย (x${MULTIPLIERS[MULTIPLIERS.length - 1]}) กำลังจะมาถึง แต่ตอนนี้อ่าน Big Road ใหม่แล้วไม่เข้ารูปแบบไหนชัดเจน (รอวิเคราะห์) — ควรพิจารณาหยุดไม้นี้แทนที่จะฝืนแทงต่อ`,
      };
    }

    return {
      severity: 'carry',
      title: `แพ้ไม้ ${last.step} เมื่อกี้ (แทง ${lastSideName})`,
      text: nextPick
        ? `กำลังทบไปไม้ถัดไป ระบบวิเคราะห์รูปแบบใหม่จาก Big Road ปัจจุบันแล้ว ไม้นี้ชี้ไปทาง ${nextPick === 'P' ? 'Player' : 'Banker'} (${freshSugg.confidence}) — ไม่ใช่การไล่ตามฝั่งเดิมโดยอัตโนมัติ`
        : `กำลังทบไปไม้ถัดไป แต่ตอนนี้ยังไม่เข้ารูปแบบไหนชัดเจน (รอวิเคราะห์) พิจารณาความเสี่ยงก่อนเดิมพันไม้ถัดไป`,
    };
  }

  // last.outcome === 'loss': lost the full 3-step cycle.
  const nextPick = freshSugg.pick;
  return {
    severity: 'loss',
    title: `แพ้ครบ 3 ไม้ล่าสุด (เสียเต็มรอบ)`,
    text: nextPick
      ? `รอบใหม่เริ่มที่ไม้ 1 ระบบวิเคราะห์ Big Road ใหม่ทั้งหมดแล้ว รอบนี้ชี้ไปทาง ${nextPick === 'P' ? 'Player' : 'Banker'} (${freshSugg.confidence}) หากแพ้ติดกันหลายรอบให้ดูสถานะห้องด้านล่างประกอบการตัดสินใจเปลี่ยนโต๊ะ`
      : `รอบใหม่เริ่มที่ไม้ 1 แต่ตอนนี้ยังไม่เข้ารูปแบบไหนชัดเจน (รอวิเคราะห์) หากแพ้ติดกันหลายรอบให้ดูสถานะห้องด้านล่างประกอบการตัดสินใจเปลี่ยนโต๊ะ`,
  };
}

// A "which room to sit at" read, separate from table-status (which is about
// whether to keep playing once you're already betting). Replays the whole
// session the same way simulateMoney does — for each round after the first,
// ask getSuggestion what the prior rounds implied — and scores how often a
// named pattern actually showed up (readability), how often ties interrupt
// play, and whether a pattern is live right now. A room that reads easily
// and doesn't tie constantly is what pattern players look for on the
// physical scoreboard before sitting down; this mirrors that read using the
// session recorded so far.
function evaluateRoomFit(consecutiveLosses){
  const winners = rounds.map(x => x.winner);
  const total = winners.length;

  if (total < ROOM_FIT_MIN_ROUNDS){
    return { verdict: 'pending', remaining: ROOM_FIT_MIN_ROUNDS - total };
  }

  let readable = 0;
  for (let i = 1; i < winners.length; i++){
    if (getSuggestion(winners.slice(0, i)).pick) readable++;
  }
  const readabilityPct = Math.round((readable / (winners.length - 1)) * 100);

  const ties = winners.filter(w => w === 'T').length;
  const tiePct = Math.round((ties / total) * 100);

  // Same fade-aware pick as the recommend card, so this box never names a
  // different side than what's actually being bet right now.
  const current = getFinalSuggestion(winners, consecutiveLosses);
  const good = [];
  const bad = [];

  if (readabilityPct >= 40){
    good.push(`รูปแบบขึ้นให้เห็นบ่อย (${readabilityPct}% ของตาที่ผ่านมาเข้ารูปแบบใดรูปแบบหนึ่ง)`);
  } else {
    bad.push(`รูปแบบยังไม่ค่อยชัดเจน (อ่านออกแค่ ${readabilityPct}% ของตาที่ผ่านมา)`);
  }

  if (tiePct > 12){
    bad.push(`เสมอบ่อยกว่าปกติ (${tiePct}% ของตาทั้งหมด ปกติควรอยู่ราว 9-10%)`);
  } else {
    good.push(`อัตราเสมออยู่ในเกณฑ์ปกติ (${tiePct}%)`);
  }

  if (current.pick){
    good.push(`ตอนนี้กำลังเข้าจังหวะ ${current.confidence}`);
  } else {
    bad.push('ตอนนี้ยังไม่เข้ารูปแบบไหนชัดเจน (รอวิเคราะห์)');
  }

  const verdict = good.length > bad.length ? 'good' : good.length === bad.length ? 'neutral' : 'bad';
  return { verdict, good, bad, readabilityPct, tiePct };
}

function renderBeadRoad(){
  els.beadGrid.innerHTML = '';
  const winners = rounds.map(x=>x.winner);
  const rows = 6;
  const cols = Math.max(1, Math.ceil(winners.length / rows) + 1);
  const cells = new Array(rows * cols).fill(null);
  winners.forEach((r, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    cells[col * rows + row] = r;
  });
  cells.forEach(r => {
    const el = document.createElement('div');
    if (r === null){
      el.className = 'bead-empty';
    } else {
      el.className = 'bead ' + (r === 'P' ? 'player' : r === 'B' ? 'banker' : 'tie');
      el.textContent = r;
      el.title = r === 'P' ? 'Player' : r === 'B' ? 'Banker' : 'เสมอ';
    }
    els.beadGrid.appendChild(el);
  });
  els.beadGrid.parentElement.scrollLeft = els.beadGrid.scrollWidth;
}

// Renders a faithful Big Road grid: consecutive same-side wins stack
// vertically in one column (max 6 rows); once a column hits 6 rows, a
// continuing streak overflows sideways along the bottom row (the classic
// "dragon tail") instead of growing a 7th row. Ties overlay a small count
// badge on the cell they landed on rather than taking their own cell.
function renderBigRoad(){
  const winners = rounds.map(x => x.winner);
  const columns = buildBigRoadCells(winners);
  const grid = els.bigRoadGrid;
  grid.innerHTML = '';

  const ROWS = 6;
  const cellMap = new Map();
  let visualCol = 0;

  columns.forEach(colCells => {
    const startCol = visualCol;
    colCells.forEach((cell, idx) => {
      if (idx < ROWS){
        cellMap.set(`${startCol},${idx}`, cell);
      } else {
        const overflowCol = startCol + (idx - ROWS + 1);
        cellMap.set(`${overflowCol},${ROWS - 1}`, cell);
      }
    });
    const consumed = colCells.length <= ROWS ? 1 : (colCells.length - ROWS + 1);
    visualCol = startCol + consumed;
  });

  const totalCols = Math.max(visualCol, 1) + 1;
  grid.style.gridTemplateColumns = `repeat(${totalCols}, 22px)`;

  for (let r = 0; r < ROWS; r++){
    for (let c = 0; c < totalCols; c++){
      const cell = cellMap.get(`${c},${r}`);
      const el = document.createElement('div');
      if (!cell){
        el.className = 'bigroad-empty';
      } else {
        el.className = 'bigroad-cell ' + (cell.side === 'P' ? 'player' : 'banker');
        el.textContent = cell.side;
        el.title = cell.side === 'P' ? 'Player' : 'Banker';
        if (cell.ties > 0){
          const tie = document.createElement('span');
          tie.className = 'bigroad-tie';
          tie.textContent = cell.ties > 1 ? String(cell.ties) : '';
          tie.title = `เสมอ ${cell.ties} ครั้ง`;
          el.appendChild(tie);
        }
      }
      grid.appendChild(el);
    }
  }
  grid.parentElement.scrollLeft = grid.parentElement.scrollWidth;
}

function renderBigEyeBoy(){
  const winners = rounds.map(x => x.winner);
  const columns = buildBigRoadColumns(winners);
  const points = deriveBigEyeBoy(columns);

  els.bebStrip.innerHTML = '';
  const shown = points.slice(-16);
  if (shown.length === 0){
    els.bebStrip.innerHTML = '<span class="beb-empty">ยังไม่มีข้อมูลพอ</span>';
  } else {
    shown.forEach(p => {
      const dot = document.createElement('span');
      dot.className = 'beb-dot ' + p.color;
      els.bebStrip.appendChild(dot);
    });
  }

  const latest = points.length ? points[points.length - 1].color : null;
  els.bebLatest.className = 'beb-latest' + (latest ? ' ' + latest : '');
  els.bebLatest.textContent = latest === 'red' ? 'แดง · Banker' : latest === 'blue' ? 'น้ำเงิน · Player' : 'รอข้อมูล';
}

// Display-only — not used to trigger a bet (this heuristic fires almost
// every column, so wiring it into getSuggestion made the system bet nearly
// every round instead of waiting for a real pattern). Just shows what the
// odd/even read of the current column would say, for reference alongside
// the other roads.
function renderOddEven(){
  const winners = rounds.map(x => x.winner);
  const columns = buildBigRoadColumns(winners);
  const read = detectOddEven(columns);
  els.oddEvenLine.textContent = read
    ? `คู่-คี่ (ข้อมูลประกอบ): ${read.parity === 'even' ? 'คู่' : 'คี่'} → มองไปทาง ${sideName(read.pick)}`
    : 'คู่-คี่ (ข้อมูลประกอบ): รอข้อมูล';
}

// Circumference of the gauge ring (r=26): 2 * PI * 26.
const ACC_GAUGE_CIRCUMFERENCE = 163.36;

// Draws the CURRENT suggestion's own confidence score (sugg.strength, 0-100)
// as a ring — how well-confirmed the pattern that fired this round is (a
// longer dragon or a twice-confirmed rhythm scores higher). This is not the
// game's real win probability, which never moves off its fixed base rate —
// it's just how strict a read this particular call is. Hidden whenever
// there's no active pick to score.
function renderConfidenceGauge(sugg){
  if (!sugg.pick || sugg.strength == null){
    els.accGauge.hidden = true;
    return;
  }

  const pct = sugg.strength;
  els.accGauge.hidden = false;
  els.accGauge.className = 'acc-gauge' + (pct >= 70 ? '' : pct >= 60 ? ' warn' : ' bad');
  els.accGaugeArc.style.strokeDashoffset =
    String(ACC_GAUGE_CIRCUMFERENCE * (1 - pct / 100));
  els.accGaugePct.textContent = Math.round(pct) + '%';
  els.accGaugeSub.textContent = `ความมั่นใจของ ${sugg.confidence}`;
}

function renderRecommendation(sim, baseBet){
  const chip = els.chipIcon;
  const chipLabel = els.chipLabel;
  const call = els.suggestCall;
  const reason = els.suggestReason;

  if (rounds.length < WARMUP_ROUNDS){
    const remaining = WARMUP_ROUNDS - rounds.length;
    chip.className = 'side-chip none';
    chipLabel.textContent = String(rounds.length);
    call.textContent = `กำลังเก็บข้อมูล (${rounds.length}/${WARMUP_ROUNDS} ตา)`;
    reason.textContent = `บันทึกผลอีก ${remaining} ตาก่อน ระบบจะเริ่มแนะนำฝั่งที่ควรแทงและจำนวนเงิน`;
    els.nextBetAmount.textContent = '—';
    els.stepTag.textContent = `รออีก ${remaining} ตา`;
    els.accGauge.hidden = true;
    return;
  }

  const sugg = getFinalSuggestion(rounds.map(x => x.winner), sim.consecutiveLosses);
  renderConfidenceGauge(sugg);

  if (!sugg.pick){
    chip.className = 'side-chip none';
    chipLabel.textContent = '?';
    call.textContent = 'รอวิเคราะห์';
    reason.textContent = sugg.reasonText;
    els.nextBetAmount.textContent = '—';
    els.stepTag.textContent = `ไม้ ${sim.step + 1}/${MULTIPLIERS.length}`;
    return;
  }

  chip.className = 'side-chip ' + (sugg.pick === 'P' ? 'player' : 'banker');
  chipLabel.textContent = sugg.pick;
  const sideClass = sugg.pick === 'P' ? 'player' : 'banker';
  const sideLabel = sugg.pick === 'P' ? 'Player' : 'Banker';
  call.innerHTML = `แทง <span class="call-side ${sideClass}">${sideLabel}</span> — ${sugg.confidence}`;
  reason.textContent = sugg.reasonText;

  const nextAmount = baseBet * MULTIPLIERS[sim.step];
  els.nextBetAmount.textContent = '฿' + formatMoney(nextAmount);
  els.stepTag.textContent = `ไม้ ${sim.step + 1}/${MULTIPLIERS.length}`;
}

function renderGameFix(sim){
  if (rounds.length < WARMUP_ROUNDS){
    els.gameFix.hidden = true;
    return;
  }

  const winners = rounds.map(x => x.winner);
  const freshSugg = getFinalSuggestion(winners, sim.consecutiveLosses);
  const fix = evaluateGameFix(sim, freshSugg);

  if (!fix){
    els.gameFix.hidden = true;
    return;
  }

  els.gameFix.hidden = false;
  els.gameFix.className = 'game-fix ' + fix.severity;
  els.gameFixTitle.textContent = fix.title;
  els.gameFixText.textContent = fix.text;
}

function renderTieLine(){
  const winners = rounds.map(x => x.winner);
  if (winners.length === 0){
    els.tieStreakText.textContent = 'รอข้อมูล';
    return;
  }
  const gap = tieGapFor(winners);
  if (gap === 0){
    els.tieStreakText.textContent = 'เพิ่งออกเสมอตาที่แล้ว';
  } else if (gap >= 15){
    els.tieStreakText.textContent = `ไม่ออกมา ${gap} ตาแล้ว (เกินค่าเฉลี่ย ~10 ตา แต่ EV แทงเสมอแย่ที่สุด −14.36% จึงยังไม่แนะนำ)`;
  } else {
    els.tieStreakText.textContent = `ไม่ออกมา ${gap} ตาแล้ว (เฉลี่ยควรออกทุก ~10 ตา)`;
  }
}

// Note: this only judges bankroll health (losses/hit-rate/drawdown so far),
// a separate concern from evaluateRoomFit's pattern-readability read — the
// two can legitimately disagree (money still fine, but patterns unclear).
// The roomFitVerdict param exists purely so the "ok" copy here doesn't read
// like a blanket "keep playing" when the room-fit box right below is telling
// the user the opposite for a different reason.
function renderTableStatus(sim, baseBet, roomFitVerdict){
  const health = evaluateTableHealth(sim, baseBet);
  const box = els.tableStatus;

  if (!health.shouldStop){
    box.className = 'table-status ok';
    if (health.decided === 0){
      els.tableStatusTitle.textContent = 'ยังไม่มีข้อมูลพอประเมินห้องนี้';
    } else if (roomFitVerdict === 'bad'){
      els.tableStatusTitle.textContent = 'การเงินยังปกติ (ยังไม่ถึงเกณฑ์หยุด) แต่รูปแบบไพ่ยังไม่ชัด — ดูช่องประเมินห้องด้านล่างประกอบ';
    } else {
      els.tableStatusTitle.textContent = 'ห้องนี้ยังอยู่ในเกณฑ์ปกติ เล่นต่อได้';
    }
    els.tableStatusReasons.innerHTML = '';
    return;
  }

  box.className = 'table-status bad';
  els.tableStatusTitle.textContent = 'ห้องนี้ไม่ควรเล่นต่อ — แนะนำเปลี่ยนห้อง';
  els.tableStatusReasons.innerHTML = '';
  health.reasons.forEach(r => {
    const li = document.createElement('li');
    li.textContent = r;
    els.tableStatusReasons.appendChild(li);
  });
}

function renderRoomFit(fit){
  const box = els.roomFit;
  els.roomFitGood.innerHTML = '';
  els.roomFitBad.innerHTML = '';

  if (fit.verdict === 'pending'){
    box.className = 'room-fit pending';
    els.roomFitTitle.textContent = `บันทึกผลอีก ${fit.remaining} ตา เพื่อประเมินห้องนี้`;
    return;
  }

  const titles = {
    good: 'ห้องนี้เข้าข่ายน่าเล่นต่อ',
    neutral: 'ห้องนี้ยังกลาง ๆ — ตัดสินใจยากอยู่',
    bad: 'ห้องนี้ยังไม่น่าเข้า ลองพิจารณาห้องอื่น',
  };
  box.className = 'room-fit ' + fit.verdict;
  els.roomFitTitle.textContent = titles[fit.verdict];

  fit.good.forEach(g => {
    const li = document.createElement('li');
    li.className = 'good';
    li.textContent = g;
    els.roomFitGood.appendChild(li);
  });
  fit.bad.forEach(b => {
    const li = document.createElement('li');
    li.className = 'bad';
    li.textContent = b;
    els.roomFitBad.appendChild(li);
  });
}

function renderMoney(sim){
  els.stepsIndicator.querySelectorAll('.step-chip').forEach((el, idx) => {
    el.classList.toggle('active', idx === sim.step);
  });

  els.moneyWins.textContent = sim.wins;
  els.moneyLosses.textContent = sim.losses;
  els.moneyPushes.textContent = sim.pushes;
  els.maxStep.textContent = sim.maxStep;

  const decided = sim.wins + sim.losses;
  els.hitRate.textContent = decided ? Math.round((sim.wins / decided) * 100) + '%' : '0%';

  els.netProfit.textContent = (sim.netProfit >= 0 ? '+' : '-') + '฿' + formatMoney(Math.abs(sim.netProfit));
  els.netProfit.className = sim.netProfit > 0 ? 'pos' : sim.netProfit < 0 ? 'neg' : '';

  els.moneyLog.innerHTML = '';
  if (sim.log.length === 0){
    const li = document.createElement('li');
    li.className = 'money-log-empty';
    li.textContent = rounds.length < WARMUP_ROUNDS
      ? `ยังอยู่ในช่วงเก็บข้อมูล (${rounds.length}/${WARMUP_ROUNDS} ตา) ยังไม่เริ่มแทงจริง`
      : 'ยังไม่มีตาที่เดิมพัน กดบันทึกผลด้านบนเพื่อเริ่ม';
    els.moneyLog.appendChild(li);
    return;
  }
  sim.log.slice().reverse().slice(0, 12).forEach(entry => {
    const li = document.createElement('li');
    const sideLabel = entry.pick === 'P' ? 'Player' : 'Banker';
    const outcomeLabel = entry.outcome === 'win' ? 'ถูก'
      : entry.outcome === 'loss' ? 'เสีย (ครบ 3 ไม้)'
      : entry.outcome === 'carry' ? 'แพ้ไม้นี้ (ทบต่อ)'
      : 'เสมอ';
    const signedProfit = entry.profit > 0 ? '+฿' + formatMoney(entry.profit) : entry.profit < 0 ? '-฿' + formatMoney(Math.abs(entry.profit)) : '฿0';
    li.innerHTML = `<span>ตา ${entry.round} · ไม้ ${entry.step} · แทง ${sideLabel} ฿${formatMoney(entry.betAmount)}</span><span class="tag ${entry.outcome}">${outcomeLabel} ${signedProfit}</span>`;
    els.moneyLog.appendChild(li);
  });
}

function formatMoney(n){
  return Math.round(n).toLocaleString('th-TH');
}

function updateUI(){
  const s = computeStats();
  els.total.textContent = s.total;
  els.playerCount.textContent = s.player;
  els.bankerCount.textContent = s.banker;
  els.tieCount.textContent = s.tie;
  els.playerPct.textContent = '(' + s.pPct + '%)';
  els.bankerPct.textContent = '(' + s.bPct + '%)';

  const total = s.total || 1;
  els.barP.style.width = (s.player / total * 100) + '%';
  els.barB.style.width = (s.banker / total * 100) + '%';
  els.barT.style.width = (s.tie / total * 100) + '%';

  if (s.total === 0){
    els.streakLine.innerHTML = 'รวมรอบ: <strong>0</strong>';
  } else {
    const streak = currentStreakFor(rounds.map(x=>x.winner));
    if (streak.side && streak.len > 0){
      const name = streak.side === 'P' ? 'Player' : 'Banker';
      els.streakLine.innerHTML = `รวมรอบ: <strong>${s.total}</strong> · สตรีคปัจจุบัน: <strong>${name} ${streak.len} ตาติด</strong>`;
    } else {
      els.streakLine.innerHTML = `รวมรอบ: <strong>${s.total}</strong> · เสมอเป็นผลล่าสุด`;
    }
  }

  renderBeadRoad();
  renderBigRoad();
  renderBigEyeBoy();
  renderOddEven();

  const baseBet = Math.max(1, Number(els.baseBet.value) || 20);
  const sim = simulateMoney(baseBet);
  renderRecommendation(sim, baseBet);
  renderGameFix(sim);
  renderTieLine();
  renderMoney(sim);
  const fit = evaluateRoomFit(sim.consecutiveLosses);
  renderTableStatus(sim, baseBet, fit.verdict);
  renderRoomFit(fit);

  els.btnUndo.disabled = rounds.length === 0;

  els.rounds.innerHTML = '';
  rounds.slice().reverse().forEach((r)=>{
    const li = document.createElement('li');
    let text = r.winner==='P'? 'Player' : (r.winner==='B'? 'Banker' : 'เสมอ');
    li.textContent = text;
    els.rounds.appendChild(li);
  });
}

// initial
updateUI();
