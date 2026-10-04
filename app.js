const $ = s => document.querySelector(s);
const percent = v => Number.isFinite(v) && v >= 0 && v <= 1 ? Math.round(v * 100) + '%' : 'Unavailable';
const num = v => Number.isFinite(v) ? v.toFixed(1) : 'Unavailable';
const time = s => Number.isFinite(Date.parse(s))
  ? new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York', weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short'}).format(new Date(s))
  : 'Time unavailable';
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function isProbability(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1; }
function sourceUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; }
  catch { return null; }
}
function freshQuote(row, now = Date.now()) {
  const observed = Date.parse(row.retrieved_at);
  return Number.isFinite(observed) && observed <= now && now - observed <= 45 * 60 * 1000;
}
function countMarkets(g, odds) {
  return (odds.markets || []).filter(q => q.game_id === g.game_id &&
    q.market === 'alley_oop' && q.is_alley_oop === true &&
    q.target === 'made_alley_oop_count' && typeof q.bookmaker === 'string' && q.bookmaker.trim() &&
    ['Over', 'Under'].includes(q.outcome) &&
    Number.isFinite(q.line) && q.line >= 0 &&
    Number.isInteger(q.price_american) && Math.abs(q.price_american) >= 100 &&
    Number.isFinite(Date.parse(q.retrieved_at)) && Date.parse(q.retrieved_at) <= Date.now());
}
function mentionMarkets(g, odds) {
  const source = odds.mention_quotes || {};
  if (source.publication_authorized !== true) return [];
  return (source.markets || []).filter(q => q.game_id === g.game_id &&
    q.target === 'broadcast_phrase_mention' && q.phrase === 'alley-oop' &&
    typeof q.contract_id === 'string' && q.contract_id.trim() &&
    typeof q.provider === 'string' && q.provider.trim() && sourceUrl(q.source_url) &&
    q.rule_scope_verified === true && sourceUrl(q.rules_source_url) &&
    q.eligible_speakers === 'play_by_play_and_color' &&
    q.window === 'tipoff_to_game_end_including_overtime' &&
    ['national', 'home_local'].includes(q.feed_scope) &&
    Array.isArray(q.crew) && q.crew.length && q.crew.every(n => typeof n === 'string' && n.trim()) &&
    Date.parse(q.tip_utc) === Date.parse(g.tip_utc) &&
    [q.yes_bid, q.yes_ask, q.no_bid, q.no_ask].every(isProbability) &&
    q.yes_bid <= q.yes_ask && q.no_bid <= q.no_ask &&
    Number.isFinite(Date.parse(q.retrieved_at)) && Date.parse(q.retrieved_at) <= Date.now());
}
function cardHeader(g, cls) {
  const card = el('article', 'card ' + cls), top = el('div', 'card-top');
  top.append(el('span', '', time(g.tip_utc)), el('span', '', 'GAME ' + g.game_id));
  const matchup = el('div', 'matchup');
  matchup.append(el('span', '', g.away.abbreviation), el('span', 'at', '@'), el('span', '', g.home.abbreviation));
  card.append(top, matchup);
  return card;
}
function twoOutcomes(labels, values) {
  const pair = el('div', 'outcome-pair');
  labels.forEach((label, i) => {
    const cell = el('div'); cell.append(el('small', '', label), el('strong', '', percent(values[i]))); pair.append(cell);
  });
  return pair;
}
function mentionCard(g, odds) {
  const card = cardHeader(g, 'mention-card'), m = g.broadcast_mention;
  card.append(el('div', 'subhead', 'Model · spoken phrase probability'), el('span', 'model-badge', 'Experimental · unvalidated'));
  const valid = m && m.target === 'broadcast_phrase_mention' && m.validation_status === 'unvalidated_heuristic' && m.status !== 'unavailable';
  if (valid && m.status === 'experimental_documented_booth' && isProbability(m.probability) && m.booth) {
    card.append(twoOutcomes(['YES · phrase said', 'NO · phrase not said'], [m.probability, 1 - m.probability]));
    card.append(el('p', 'context-note', m.booth.crew.join(' & ') + ' · ' + (m.booth.feed_scope === 'national' ? 'National feed' : 'Home local feed')));
  } else card.append(el('p', 'context-note', valid ? 'Crew/feed not confirmed. A single game-specific Yes/No estimate is unavailable.' : 'Broadcast estimate unavailable.'));
  if (valid && m.scenario_range && isProbability(m.scenario_range.min) && isProbability(m.scenario_range.max)) {
    card.append(el('div', 'mention-range', percent(m.scenario_range.min) + '–' + percent(m.scenario_range.max) + ' · Yes scenario range'));
    card.append(el('p', 'context-note', 'Sensitivity to booth assumptions; not a confidence interval.'));
  }
  if (valid && m.scenarios?.length) {
    const detail = el('details', 'detail'); detail.append(el('summary', '', 'Compare booth scenarios'));
    for (const row of m.scenarios) {
      if (!isProbability(row.probability)) continue;
      const line = el('div', 'scenario-row');
      line.append(el('span', '', row.archetype.replaceAll('_', ' ') + ' · ' + (row.parameter_set === 'arena_freeze' ? 'Arena original' : 'Arena opening week')), el('b', '', percent(row.probability)));
      detail.append(line);
    }
    card.append(detail);
  }
  const market = el('section', 'market-panel');
  market.append(el('div', 'subhead', 'Mention market · observed Yes/No prices'));
  const quotes = mentionMarkets(g, odds);
  if (!quotes.length) market.append(el('p', 'context-note', 'No verified mention quote is connected for this game.'));
  for (const q of quotes) {
    const block = el('div', 'quote-block');
    block.append(el('strong', '', q.provider + ' · ' + q.contract_id));
    const link = el('a', 'market-link', 'View contract'); link.href = sourceUrl(q.source_url); link.rel = 'noopener noreferrer'; link.target = '_blank';
    block.append(link);
    const table = el('table', 'prob-table'), head = el('tr'), thead = el('thead'), body = el('tbody');
    for (const label of ['Contract', 'Bid', 'Ask']) head.append(el('th', '', label));
    thead.append(head); table.append(thead);
    for (const [side, bid, ask] of [['YES', q.yes_bid, q.yes_ask], ['NO', q.no_bid, q.no_ask]]) {
      const row = el('tr'); row.append(el('th', '', side), el('td', '', Math.round(bid * 100) + '¢'), el('td', '', Math.round(ask * 100) + '¢')); body.append(row);
    }
    table.append(body); block.append(table);
    block.append(el('p', 'context-note', (q.feed_scope === 'national' ? 'National feed' : 'Home local feed') + ' · ' + q.crew.join(' & ')));
    if (m?.booth && (m.booth.feed_scope !== q.feed_scope || [...m.booth.crew].sort().join('|') !== [...q.crew].sort().join('|'))) {
      block.append(el('p', 'context-note', 'This contract uses a different crew/feed from the model scenario. The estimate is not matched to this quote.'));
    }
    block.append(el('p', 'quote-time', (freshQuote(q) ? 'Recent quote' : 'Stale quote') + ' · ' + time(q.retrieved_at)));
    market.append(block);
  }
  market.append(el('p', 'context-note', 'Market prices and model estimates are separate. No trading edge is calculated.'));
  card.append(market, el('div', 'card-foot', 'Broadcast mention assumptions · Generated ' + time(g.generated_at)));
  return card;
}
function countProbabilities(parent, values, ks) {
  const table = el('table', 'prob-table'), head = el('tr'), thead = el('thead'), body = el('tbody');
  for (const label of ['AO O/U line', 'P(Over)', 'P(Under)']) head.append(el('th', '', label));
  thead.append(head); table.append(thead);
  for (const k of ks) {
    const p = values[String(k)], row = el('tr');
    row.append(el('th', '', (k - 0.5).toFixed(1)), el('td', '', percent(p)), el('td', '', isProbability(p) ? percent(1 - p) : 'Unavailable'));
    body.append(row);
  }
  table.append(body); parent.append(table);
}
function countCard(g, odds) {
  const card = cardHeader(g, 'count-card'), totals = el('div', 'totals');
  card.append(el('div', 'subhead', 'Model · expected made alley-oops'));
  for (const [label, value, cls] of [[g.away.abbreviation, g.away.expected, ''], [g.home.abbreviation, g.home.expected, ''], ['GAME', g.total.expected, 'total']]) {
    const cell = el('div', cls); cell.append(el('small', '', label), el('strong', '', num(value))); totals.append(cell);
  }
  card.append(totals, el('div', 'subhead', 'Game total · model O/U probabilities'));
  countProbabilities(card, g.total.probabilities, [1, 2, 3, 4, 5]);
  card.append(el('p', 'context-note', 'These are probability thresholds, not published sportsbook lines. Over 1.5 means at least 2 made alley-oops; Under means 0 or 1.'));
  const detail = el('details', 'detail'); detail.append(el('summary', '', 'Team O/U probabilities & game count distribution'));
  const teams = el('div', 'team-probs');
  for (const side of [g.away, g.home]) {
    const panel = el('div'); panel.append(el('div', 'subhead', side.abbreviation + ' · made alley-oops'));
    countProbabilities(panel, side.probabilities, [1, 2, 3, 4]); teams.append(panel);
  }
  detail.append(teams, el('div', 'subhead', 'Game total · 0, 1, 2, 3, 4, 5+'));
  const bars = el('div', 'histogram'), labels = el('div', 'hist-labels');
  for (let i = 0; i < 6; i++) {
    const bar = el('div', 'bar'); bar.style.height = Math.max(2, g.total.distribution[i] * 95) + 'px';
    bar.title = (i === 5 ? '5+' : i) + ': ' + percent(g.total.distribution[i]); bars.append(bar); labels.append(el('span', '', i === 5 ? '5+' : String(i)));
  }
  detail.append(bars, labels); card.append(detail);
  const market = el('section', 'market-panel'); market.append(el('div', 'subhead', 'Sportsbook · observed made-AO lines'));
  const quotes = countMarkets(g, odds);
  if (!quotes.length) market.append(el('p', 'context-note', 'No verified made alley-oop O/U line is connected for this game.'));
  for (const q of quotes) {
    const block = el('div', 'quote-block'), price = q.price_american > 0 ? '+' + q.price_american : String(q.price_american);
    block.append(el('strong', '', q.bookmaker + ' · ' + q.outcome + ' ' + q.line + ' (' + price + ')'));
    block.append(el('p', 'quote-time', (freshQuote(q) ? 'Recent line' : 'Stale line') + ' · ' + time(q.retrieved_at)));
    market.append(block);
  }
  card.append(market, el('div', 'card-foot', 'EXP-008 · Made-count forecast · Generated ' + time(g.generated_at)));
  return card;
}
function emptyBoard(data, target) {
  const empty = el('div', 'empty'); empty.append(el('strong', '', 'No games in the next 48 hours'));
  const next = data.next_scheduled_tip_utc && Number.isFinite(Date.parse(data.next_scheduled_tip_utc));
  empty.append(el('p', '', next ? 'Next scheduled tip: ' + time(data.next_scheduled_tip_utc) + '.' : 'Check back when the NBA schedule has upcoming games.'));
  empty.append(el('p', '', target === 'mention' ? 'Broadcast mention estimates and matching Yes/No prices will appear here.' : 'Made alley-oop projections, O/U probabilities and matching sportsbook lines will appear here.'));
  return empty;
}
function renderForecast(data, odds, perf) {
  const old = Date.now() - Date.parse(data.generated_at) > 45 * 60 * 1000;
  $('#freshness').textContent = old ? 'Last update may be delayed' : 'Forecasts current';
  $('#last-updated').textContent = 'Last successful update ' + time(data.generated_at);
  $('#model-label').textContent = 'Count model ' + data.model_version + ' · Trained through ' + data.training_cutoff_date;
  $('#mention-count').textContent = $('#count-count').textContent = data.games.length + ' games';
  const mentionSource = odds.mention_quotes || {};
  $('#mention-market-status').textContent = mentionSource.publication_authorized !== true ? 'Mention odds: not connected' :
    (mentionSource.markets?.length ? 'Mention odds: observed quotes · see timestamps' : 'Mention odds: no matching market reported');
  $('#count-market-status').textContent = odds.source_status === 'unavailable' ? 'Count odds: source unavailable' : odds.source_status === 'not_connected' ?
    'Count odds: not connected' : 'Count odds: ' + (odds.markets?.length ? 'observed lines · see timestamps' : 'no matching market reported');
  for (const [selector, target, factory] of [['#mention-board', 'mention', mentionCard], ['#count-board', 'count', countCard]]) {
    const board = $(selector); board.replaceChildren();
    if (!data.games.length) board.append(emptyBoard(data, target));
    else for (const g of data.games) board.append(factory(g, odds));
  }
  const box = $('#performance'); box.replaceChildren();
  if (perf.settled_games) {
    box.append(el('div', 'metric', num(perf.mae)), el('div', 'metric-note', 'MAE · ' + perf.settled_team_games + ' team forecasts settled'),
      el('p', '', 'P(1+) Brier score: ' + num(perf.brier_p1) + (perf.rolling_30d_mae === null ? '' : ' · Last 30 days MAE: ' + num(perf.rolling_30d_mae))));
  } else box.append(el('p', '', 'Forward count performance begins after published pregame forecasts settle.'));
}
async function optionalJson(path, fallback) {
  try { const response = await fetch(path, {cache:'no-store'}); return response.ok ? await response.json() : fallback; }
  catch { return fallback; }
}
async function load() {
  try {
    const [response, odds, perf] = await Promise.all([fetch('data/current.json', {cache:'no-store'}),
      optionalJson('data/odds.json', {source_status:'unavailable', markets:[]}), optionalJson('data/performance.json', {settled_games:0})]);
    if (!response.ok) throw Error('Forecast file unavailable');
    renderForecast(await response.json(), odds, perf);
  } catch {
    for (const selector of ['#mention-board', '#count-board']) $(selector).replaceChildren(el('p', 'empty', 'Forecast data is temporarily unavailable. Please check back.'));
    $('#freshness').textContent = 'Update unavailable';
    $('#mention-market-status').textContent = $('#count-market-status').textContent = 'Market status unavailable';
  }
}
load();
