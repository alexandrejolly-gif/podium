const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3000;
const FILL_TIME = 60;
const GUESS_TIME = 30;

// ── Rate limiter (in-memory) ────────────────────────────────────────────────
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 min
const RATE_LIMIT_MAX = 5;            // max 5 rooms/min/IP

function checkRateLimit(ip) {
  const now = Date.now();
  const timestamps = rateLimits.get(ip) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  rateLimits.set(ip, recent);
  return true;
}

// Cleanup rate limiter every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of rateLimits) {
    const recent = ts.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (recent.length === 0) rateLimits.delete(ip);
    else rateLimits.set(ip, recent);
  }
}, 5 * 60 * 1000);

// ── Themes (50 questions, 9 catégories) ─────────────────────────────────────
const THEME_CATEGORIES = [
  // Culture pop
  [
    "Tes 3 séries que tu ne te lasseras jamais de revoir",
    "Tes 3 films qui t'ont marqué pour toujours",
    "Tes 3 personnages de série que tu voudrais avoir comme ami",
    "Tes 3 méchants de films que tu adores secrètement",
    "Tes 3 jeux vidéo préférés de tous les temps",
    "Tes 3 personnages fictifs pour qui tu as eu un crush",
  ],
  // Nourriture & cuisine
  [
    "Tes 3 plats que tu commanderais pour ton dernier repas",
    "Tes 3 repas de honte totalement assumés",
    "Tes 3 trucs que tu manges d'une façon que personne ne comprend",
    "Tes 3 combos alimentaires bizarres que tu adores",
    "Tes 3 plus gros fails en cuisine",
  ],
  // Musique & sons
  [
    "Tes 3 chansons que tu écoutes en boucle quand tu es triste",
    "Tes 3 chansons que tu chantes à fond seul en voiture",
    "Tes 3 artistes ou groupes que tu as honte d'écouter",
    "Les 3 sons ou bruits que tu ne supportes absolument pas",
  ],
  // Nostalgie & enfance
  [
    "Tes 3 dessins animés ou émissions que tu regardais en boucle",
    "Tes 3 jeux auxquels tu jouais dans la cour de récré",
    "Tes 3 trucs que tu faisais enfant et que tu fais encore aujourd'hui",
  ],
  // Habitudes & quotidien
  [
    "Les 3 trucs que tu fais quand tu es vraiment seul chez toi",
    "Les 3 applications que tu ouvres en premier le matin",
    "Tes 3 petits plaisirs coupables du quotidien",
    "Tes 3 pires habitudes que tu assumes complètement",
    "Tes 3 mots ou expressions que tu dis tout le temps",
    "Les 3 trucs qui te rendent instantanément de bonne humeur",
    "Les 3 trucs que tu fais en réunion/cours quand tu t'ennuies",
  ],
  // Aveux & faiblesses
  [
    "Tes 3 talents cachés (vrais ou imaginaires)",
    "Les 3 trucs qui t'énervent instantanément",
    "Tes 3 plus gros mensonges que tu répètes régulièrement",
    "Tes 3 phobies ou trucs irrationnels qui te font flipper",
    "Tes 3 excuses préférées pour annuler un plan",
    "Tes 3 trucs que tu fais semblant de comprendre",
    "Tes 3 compétences les plus inutiles",
    "Les 3 trucs que tu ne sais toujours pas faire à ton âge",
  ],
  // Imaginaire & rêves
  [
    "3 métiers que tu aurais aimé faire dans une autre vie",
    "Tes 3 objets indispensables sur une île déserte",
    "Les 3 lois que tu instaurerais si tu étais président",
    "Les 3 trucs que tu ferais avec 10 millions d'euros",
    "Les 3 époques où tu aurais aimé vivre",
    "Les 3 trucs que tu voudrais apprendre si tu avais tout le temps du monde",
  ],
  // Social & relations
  [
    "Tes 3 trucs qui te dégoûtent instantanément chez quelqu'un",
    "Les 3 trucs que tu remarques en premier chez quelqu'un",
    "Les 3 trucs que tu fais qui énervent ton entourage",
    "Tes 3 compliments qu'on te fait le plus souvent",
    "Tes 3 célébrités avec qui tu aimerais être ami",
  ],
  // Goûts & attachements
  [
    "Tes 3 sports ou activités que tu détestes",
    "Tes 3 destinations si tu pouvais partir demain",
    "Tes 3 endroits où tu te sens le mieux au monde",
    "Tes 3 plus grosses dépenses inutiles",
    "Tes 3 objets auxquels tu tiens le plus",
    "Tes 3 trucs que tu achètes toujours en trop grande quantité",
  ],
];

// Sélectionne N thèmes en piochant max 1 par catégorie
function pickThemes(count) {
  const cats = shuffleArray(THEME_CATEGORIES.map(cat => shuffleArray([...cat])));
  const picked = [];
  let round = 0;
  while (picked.length < count) {
    for (const cat of cats) {
      if (picked.length >= count) break;
      if (round < cat.length) picked.push(cat[round]);
    }
    round++;
  }
  return shuffleArray(picked);
}

// ── State ───────────────────────────────────────────────────────────────────
const rooms = new Map();

// ── Helpers ─────────────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function sanitize(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  })[c]).substring(0, maxLen);
}

function send(ws, type, payload = {}) {
  try {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type, payload }));
    }
  } catch (err) {
    console.error('[WS send error]', err.message);
  }
}

function broadcastToRoom(room, type, payload = {}, excludeId = null) {
  for (const [id, player] of room.players) {
    if (id !== excludeId) send(player.ws, type, payload);
  }
}

function sendToHost(room, type, payload = {}) {
  send(room.hostWs, type, payload);
}

function sendToHostOrAll(room, type, payload = {}) {
  if (room.mode === 'online') {
    broadcastToRoom(room, type, payload);
  } else {
    sendToHost(room, type, payload);
  }
}

function getPlayersArray(room) {
  return Array.from(room.players.values()).map(p => ({
    id: p.id, name: p.name, avatar: p.avatar, score: p.score, ready: p.ready
  }));
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clearRoomTimer(room) {
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
  if (room.tickInterval) { clearInterval(room.tickInterval); room.tickInterval = null; }
}

function activePlayerCount(room) {
  let count = 0;
  for (const p of room.players.values()) {
    if (p.ws && p.ws.readyState === 1) count++;
  }
  return count;
}

function transferHostPlayer(room) {
  room.hostPlayerId = null;
  // Find first connected player
  for (const [id, player] of room.players) {
    if (player.ws && player.ws.readyState === 1) {
      room.hostPlayerId = id;
      player.ws._isHostPlayer = true;
      send(player.ws, 'promoted_to_host', {});
      console.log(`[host-player] transferred to ${player.name} in room ${room.code}`);
      return;
    }
  }
  console.log(`[host-player] no connected player to transfer to in room ${room.code}`);
}

// ── Express middleware ──────────────────────────────────────────────────────
app.set('trust proxy', true);
app.use(express.json());

// HTTPS redirect in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, `https://${req.hostname}${req.url}`);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ──────────────────────────────────────────────────────────────────
app.post('/api/create-room', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(ip)) {
    console.warn(`[rate-limit] blocked room creation from ${ip}`);
    return res.status(429).json({ error: 'Trop de salles créées, réessaie dans 1 minute' });
  }

  const mode = req.body.mode === 'online' ? 'online' : 'presentiel';
  const code = generateCode();
  rooms.set(code, {
    code,
    mode,
    hostWs: null,
    hostPlayerId: null,
    players: new Map(),
    state: 'lobby',
    rounds: 5,
    currentRound: 0,
    themes: [],
    currentTheme: '',
    tops: new Map(),
    guessingOrder: [],
    currentTopIndex: 0,
    guessesForTop: new Map(),
    revealIndex: 0,
    timer: null,
    tickInterval: null,
    timerEnd: 0,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  });
  console.log(`[room] created ${code} (${mode}) from ${ip}`);
  res.json({ code, mode });
});

app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.json({ exists: false });
  res.json({
    exists: true,
    playerCount: room.players.size,
    state: room.state,
    mode: room.mode,
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── WebSocket ───────────────────────────────────────────────────────────────
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  ws._playerId = null;
  ws._roomCode = null;
  ws._isHost = false;
  ws._isHostPlayer = false;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (err) {
      console.error('[WS parse error]', err.message);
      return;
    }
    const { type, payload = {} } = msg;
    handleMessage(ws, type, payload);
  });

  ws.on('close', () => {
    const room = rooms.get(ws._roomCode);
    if (!room) return;

    if (ws._isHost) {
      room.hostWs = null;
      broadcastToRoom(room, 'host_disconnected');
      console.log(`[host] disconnected from room ${ws._roomCode}`);
    }

    if (ws._playerId && room.players.has(ws._playerId)) {
      const player = room.players.get(ws._playerId);
      player.ws = null;

      if (room.state !== 'lobby') {
        const pid = ws._playerId;
        const rcode = ws._roomCode;
        const wasHostPlayer = ws._isHostPlayer;
        setTimeout(() => {
          const r = rooms.get(rcode);
          if (r && r.players.has(pid)) {
            const p = r.players.get(pid);
            if (!p.ws) {
              console.log(`[player] removed ${p.name} from room ${rcode} (timeout)`);
              r.players.delete(pid);
              // Transfer host-player role if needed
              if (wasHostPlayer && r.mode === 'online' && r.hostPlayerId === pid) {
                transferHostPlayer(r);
              }
              broadcastToRoom(r, 'player_left', { players: getPlayersArray(r) });
              sendToHost(r, 'player_left', { players: getPlayersArray(r) });
              checkMinPlayers(r);
              checkPhaseProgress(r);
            }
          }
        }, 15000);
      } else {
        console.log(`[player] ${player.name} left room ${ws._roomCode}`);
        room.players.delete(ws._playerId);
        // Transfer host-player role if needed
        if (ws._isHostPlayer && room.mode === 'online' && room.hostPlayerId === ws._playerId) {
          transferHostPlayer(room);
        }
        broadcastToRoom(room, 'player_left', { players: getPlayersArray(room) });
        sendToHost(room, 'player_left', { players: getPlayersArray(room) });
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[WS error]', err.message);
  });
});

function handleMessage(ws, type, payload) {
  switch (type) {
    case 'join_as_host': {
      const code = (payload.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, 'error', { message: 'Salle introuvable' });
      room.hostWs = ws;
      ws._roomCode = code;
      ws._isHost = true;
      room.lastActivity = Date.now();
      send(ws, 'host_joined', { code, players: getPlayersArray(room), state: room.state });
      console.log(`[host] joined room ${code}`);
      break;
    }

    case 'join_room': {
      const code = (payload.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, 'error', { message: 'Salle introuvable' });
      if (room.state !== 'lobby') return send(ws, 'error', { message: 'Partie déjà en cours' });
      if (room.players.size >= 12) return send(ws, 'error', { message: 'Salle pleine (max 12)' });

      const name = sanitize(payload.playerName || '', 20).trim();
      if (!name) return send(ws, 'error', { message: 'Prénom requis' });

      // Duplicate name check
      for (const p of room.players.values()) {
        if (p.name.toLowerCase() === name.toLowerCase()) {
          return send(ws, 'error', { message: 'Ce prénom est déjà pris' });
        }
      }

      const avatar = Math.max(0, Math.min(7, parseInt(payload.avatar) || 0));
      const playerId = generateId();

      room.players.set(playerId, {
        id: playerId, name, avatar, score: 0, ready: false, ws
      });
      ws._playerId = playerId;
      ws._roomCode = code;
      room.lastActivity = Date.now();

      // In online mode, first player becomes host-player
      let isHostPlayer = false;
      if (room.mode === 'online' && !room.hostPlayerId) {
        room.hostPlayerId = playerId;
        ws._isHostPlayer = true;
        isHostPlayer = true;
        console.log(`[host-player] ${name} is host-player in room ${code}`);
      }

      console.log(`[player] ${name} joined room ${code} (${room.players.size} players)`);

      send(ws, 'room_joined', { code, playerId, players: getPlayersArray(room), mode: room.mode, isHostPlayer });
      broadcastToRoom(room, 'player_joined', { players: getPlayersArray(room) }, playerId);
      sendToHost(room, 'player_joined', { players: getPlayersArray(room) });
      break;
    }

    case 'reconnect': {
      const code = (payload.code || '').toUpperCase();
      const playerId = payload.playerId;
      const room = rooms.get(code);
      if (!room || !room.players.has(playerId)) {
        return send(ws, 'error', { message: 'Session introuvable' });
      }
      const player = room.players.get(playerId);
      player.ws = ws;
      ws._playerId = playerId;
      ws._roomCode = code;

      // Restore host-player flag on reconnect
      if (room.mode === 'online' && room.hostPlayerId === playerId) {
        ws._isHostPlayer = true;
      }

      const reconnectData = {
        code, playerId, players: getPlayersArray(room),
        state: room.state, theme: room.currentTheme,
        round: room.currentRound, totalRounds: room.rounds,
        mode: room.mode, isHostPlayer: room.hostPlayerId === playerId,
      };

      // Send current guessing state if applicable
      if (room.state === 'guessing' && room.currentTopIndex < room.guessingOrder.length) {
        const current = room.guessingOrder[room.currentTopIndex];
        reconnectData.currentTop = {
          topIndex: room.currentTopIndex,
          items: current.items,
          isOwnTop: playerId === current.ownerId,
          totalTops: room.guessingOrder.length,
          players: getPlayersArray(room).filter(p => p.id !== playerId),
        };
      }

      console.log(`[player] ${player.name} reconnected to room ${code}`);
      send(ws, 'reconnected', reconnectData);
      break;
    }

    case 'set_rounds': {
      const room = rooms.get(ws._roomCode);
      if (!room || !(ws._isHost || ws._isHostPlayer)) return;
      const r = parseInt(payload.rounds);
      if ([3, 5, 7].includes(r)) room.rounds = r;
      break;
    }

    case 'start_game': {
      const room = rooms.get(ws._roomCode);
      if (!room || !(ws._isHost || ws._isHostPlayer)) return;
      if (room.players.size < 3) return send(ws, 'error', { message: '3 joueurs minimum' });
      if (room.state !== 'lobby') return;
      console.log(`[game] started in room ${ws._roomCode} with ${room.players.size} players, ${room.rounds} rounds`);
      startGame(room);
      break;
    }

    case 'submit_top': {
      const room = rooms.get(ws._roomCode);
      if (!room || room.state !== 'filling') return;
      const items = (payload.items || []).slice(0, 3).map(s => sanitize(String(s), 60).trim());
      if (items.length !== 3 || items.some(i => !i)) return send(ws, 'error', { message: '3 réponses requises' });
      handleTopSubmission(room, ws._playerId, items);
      break;
    }

    case 'submit_guess': {
      const room = rooms.get(ws._roomCode);
      if (!room || room.state !== 'guessing') return;
      // Le joueur envoie topIndex (pas topOwnerId) — resolution serveur-side
      const topIdx = parseInt(payload.topIndex);
      if (isNaN(topIdx) || topIdx < 0 || topIdx >= room.guessingOrder.length) return;
      const topOwnerId = room.guessingOrder[topIdx].ownerId;
      handleGuess(room, ws._playerId, topOwnerId, payload.guessedPlayerId, topIdx);
      break;
    }

    case 'next_reveal': {
      const room = rooms.get(ws._roomCode);
      if (!room || !(ws._isHost || ws._isHostPlayer) || room.state !== 'revealing') return;
      handleNextReveal(room);
      break;
    }

    case 'next_round': {
      const room = rooms.get(ws._roomCode);
      if (!room || !(ws._isHost || ws._isHostPlayer) || room.state !== 'scores') return;
      if (room.currentRound < room.rounds) {
        clearRoomTimer(room);
        startRound(room);
      }
      break;
    }

    case 'play_again': {
      const room = rooms.get(ws._roomCode);
      if (!room || !(ws._isHost || ws._isHostPlayer)) return;
      resetRoom(room);
      break;
    }
  }
}

// ── Game Logic ──────────────────────────────────────────────────────────────

function startGame(room) {
  room.themes = pickThemes(room.rounds);
  room.currentRound = 0;
  for (const p of room.players.values()) p.score = 0;
  startRound(room);
}

function startRound(room) {
  room.currentRound++;
  room.currentTheme = room.themes[room.currentRound - 1];
  room.tops.clear();
  room.guessingOrder = [];
  room.currentTopIndex = 0;
  room.guessesForTop.clear();
  room.revealIndex = 0;
  for (const p of room.players.values()) p.ready = false;

  room.state = 'filling';
  const data = {
    theme: room.currentTheme,
    round: room.currentRound,
    totalRounds: room.rounds,
    timeLeft: FILL_TIME,
  };
  broadcastToRoom(room, 'game_started', data);
  sendToHost(room, 'game_started', { ...data, players: getPlayersArray(room) });

  startTimer(room, FILL_TIME, () => {
    for (const [id, player] of room.players) {
      if (!room.tops.has(id)) {
        room.tops.set(id, ['???', '???', '???']);
        player.ready = true;
      }
    }
    transitionToGuessing(room);
  });
}

function handleTopSubmission(room, playerId, items) {
  if (room.tops.has(playerId)) return;
  room.tops.set(playerId, items);
  const player = room.players.get(playerId);
  if (player) player.ready = true;

  const readyCount = room.tops.size;
  const totalCount = room.players.size;

  if (room.mode === 'online') {
    broadcastToRoom(room, 'player_ready', { playerId, readyCount, totalCount, players: getPlayersArray(room) });
  } else {
    broadcastToRoom(room, 'player_ready', { playerId, readyCount, totalCount });
    sendToHost(room, 'player_ready', { playerId, readyCount, totalCount, players: getPlayersArray(room) });
  }

  if (readyCount >= totalCount) {
    clearRoomTimer(room);
    transitionToGuessing(room);
  }
}

function transitionToGuessing(room) {
  room.state = 'guessing';
  const owners = shuffleArray(Array.from(room.tops.keys()));
  room.guessingOrder = owners.map(ownerId => ({
    ownerId,
    items: room.tops.get(ownerId),
  }));
  room.currentTopIndex = 0;
  room.guessesForTop.clear();

  broadcastToRoom(room, 'all_tops_in', {});
  sendToHost(room, 'all_tops_in', {});

  setTimeout(() => showNextTop(room), 1500);
}

function showNextTop(room) {
  if (room.currentTopIndex >= room.guessingOrder.length) {
    transitionToRevealing(room);
    return;
  }

  const current = room.guessingOrder[room.currentTopIndex];
  room.guessesForTop.set(current.ownerId, []);

  sendToHost(room, 'show_top', {
    topIndex: room.currentTopIndex,
    items: current.items,
    totalTops: room.guessingOrder.length,
    timeLeft: GUESS_TIME,
    round: room.currentRound,
    totalRounds: room.rounds,
  });

  for (const [id, player] of room.players) {
    const isOwnTop = id === current.ownerId;
    send(player.ws, 'show_top', {
      topIndex: room.currentTopIndex,
      // Ne PAS envoyer topOwnerId — le joueur utilise topIndex pour voter
      items: current.items,
      isOwnTop,
      totalTops: room.guessingOrder.length,
      timeLeft: GUESS_TIME,
      round: room.currentRound,
      totalRounds: room.rounds,
      players: getPlayersArray(room).filter(p => p.id !== id),
    });
  }

  startTimer(room, GUESS_TIME, () => {
    room.currentTopIndex++;
    showNextTop(room);
  });
}

function handleGuess(room, voterId, topOwnerId, guessedPlayerId, topIdx) {
  if (!room.guessesForTop.has(topOwnerId)) return;
  if (voterId === topOwnerId) return;

  const guesses = room.guessesForTop.get(topOwnerId);
  if (guesses.some(g => g.voterId === voterId)) return;

  guesses.push({ voterId, guessedPlayerId, timestamp: Date.now() });

  // Renvoyer topIndex (pas topOwnerId) au joueur
  send(room.players.get(voterId)?.ws, 'guess_received', { topIndex: topIdx });

  const expectedGuesses = room.players.size - 1;
  sendToHostOrAll(room, 'guess_progress', {
    count: guesses.length,
    total: expectedGuesses,
  });

  if (guesses.length >= expectedGuesses) {
    clearRoomTimer(room);
    room.currentTopIndex++;
    setTimeout(() => showNextTop(room), 500);
  }
}

function transitionToRevealing(room) {
  room.state = 'revealing';
  room.revealIndex = 0;

  if (room.mode === 'online') {
    broadcastToRoom(room, 'guessing_complete', { totalReveals: room.guessingOrder.length });
  } else {
    broadcastToRoom(room, 'guessing_complete', {});
    sendToHost(room, 'guessing_complete', { totalReveals: room.guessingOrder.length });
  }
}

function handleNextReveal(room) {
  if (room.revealIndex >= room.guessingOrder.length) {
    endRound(room);
    return;
  }

  const entry = room.guessingOrder[room.revealIndex];
  const owner = room.players.get(entry.ownerId);
  const guesses = room.guessesForTop.get(entry.ownerId) || [];

  const revealGuesses = [];
  let correctCount = 0;
  let firstCorrectTimestamp = Infinity;

  for (const g of guesses) {
    const correct = g.guessedPlayerId === entry.ownerId;
    if (correct) {
      correctCount++;
      if (g.timestamp < firstCorrectTimestamp) firstCorrectTimestamp = g.timestamp;
    }
    revealGuesses.push({
      voterId: g.voterId,
      voterName: room.players.get(g.voterId)?.name || '?',
      voterAvatar: room.players.get(g.voterId)?.avatar ?? 0,
      guessedId: g.guessedPlayerId,
      guessedName: room.players.get(g.guessedPlayerId)?.name || '?',
      guessedAvatar: room.players.get(g.guessedPlayerId)?.avatar ?? 0,
      correct,
    });
  }

  const deltas = new Map();
  for (const g of guesses) {
    const correct = g.guessedPlayerId === entry.ownerId;
    if (correct) {
      const player = room.players.get(g.voterId);
      if (player) {
        let pts = 3;
        if (g.timestamp === firstCorrectTimestamp) pts += 1;
        player.score += pts;
        deltas.set(g.voterId, (deltas.get(g.voterId) || 0) + pts);
      }
    }
  }

  if (owner) {
    let ownerPts = 0;
    if (correctCount === 0) ownerPts = 3;
    else if (correctCount === 1) ownerPts = 1;
    if (ownerPts > 0) {
      owner.score += ownerPts;
      deltas.set(entry.ownerId, (deltas.get(entry.ownerId) || 0) + ownerPts);
    }
  }

  if (room.mode === 'online') {
    // In online mode, send reveal_top to ALL players with personalized fields
    for (const [id, player] of room.players) {
      const delta = deltas.get(id) || 0;
      const wasCorrect = guesses.some(g => g.voterId === id && g.guessedPlayerId === entry.ownerId);
      const isOwner = id === entry.ownerId;
      send(player.ws, 'reveal_top', {
        topIndex: room.revealIndex,
        totalTops: room.guessingOrder.length,
        theme: room.currentTheme,
        ownerId: entry.ownerId,
        ownerName: owner?.name || '?',
        ownerAvatar: owner?.avatar ?? 0,
        items: entry.items,
        guesses: revealGuesses,
        correctCount,
        totalVoters: room.players.size - 1,
        myPointsEarned: delta,
        myScore: player.score,
        myCorrect: wasCorrect,
        isMyTop: isOwner,
      });
    }
  } else {
    sendToHost(room, 'reveal_top', {
      topIndex: room.revealIndex,
      totalTops: room.guessingOrder.length,
      theme: room.currentTheme,
      ownerId: entry.ownerId,
      ownerName: owner?.name || '?',
      ownerAvatar: owner?.avatar ?? 0,
      items: entry.items,
      guesses: revealGuesses,
      correctCount,
      totalVoters: room.players.size - 1,
    });

    // Delay player results to sync with host drumroll (2.5s)
    const revealIdx = room.revealIndex;
    const code = room.code;
    setTimeout(() => {
      const r = rooms.get(code);
      if (!r) return;
      for (const [id, player] of r.players) {
        const delta = deltas.get(id) || 0;
        const wasCorrect = guesses.some(g => g.voterId === id && g.guessedPlayerId === entry.ownerId);
        const isOwner = id === entry.ownerId;
        send(player.ws, 'reveal_player_result', {
          topIndex: revealIdx,
          theme: room.currentTheme,
          ownerId: entry.ownerId,
          ownerName: owner?.name || '?',
          ownerAvatar: owner?.avatar ?? 0,
          items: entry.items,
          correct: wasCorrect,
          isOwnTop: isOwner,
          pointsEarned: delta,
          myScore: player.score,
        });
      }
    }, 2500);
  }

  room.revealIndex++;
}

function endRound(room) {
  const scores = getPlayersArray(room)
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const isLastRound = room.currentRound >= room.rounds;

  if (isLastRound) {
    endGame(room, scores);
  } else {
    room.state = 'scores';
    const data = {
      scores,
      round: room.currentRound,
      totalRounds: room.rounds,
      isLastRound: false,
    };
    broadcastToRoom(room, 'round_complete', data);
    sendToHost(room, 'round_complete', data);
  }
}

function endGame(room, scores) {
  room.state = 'scores';

  const badges = {};

  if (scores.length > 0) {
    badges.bestGuesser = { id: scores[0].id, name: scores[0].name, avatar: scores[0].avatar };
  }

  let minGuessed = Infinity;
  let mysteryPlayer = null;
  for (const [playerId, player] of room.players) {
    let timesGuessed = 0;
    for (const [ownerId, guesses] of room.guessesForTop) {
      if (ownerId === playerId) {
        timesGuessed = guesses.filter(g => g.guessedPlayerId === playerId).length;
      }
    }
    if (timesGuessed < minGuessed) {
      minGuessed = timesGuessed;
      mysteryPlayer = player;
    }
  }
  if (mysteryPlayer) badges.biggestMystery = { id: mysteryPlayer.id, name: mysteryPlayer.name, avatar: mysteryPlayer.avatar };

  let maxSurprise = 0;
  let surprisePlayer = null;
  for (const [playerId, player] of room.players) {
    let wrongGuessesFor = 0;
    for (const [ownerId, guesses] of room.guessesForTop) {
      if (ownerId !== playerId) {
        wrongGuessesFor += guesses.filter(g => g.guessedPlayerId === playerId).length;
      }
    }
    if (wrongGuessesFor > maxSurprise) {
      maxSurprise = wrongGuessesFor;
      surprisePlayer = player;
    }
  }
  if (surprisePlayer) badges.biggestSurprise = { id: surprisePlayer.id, name: surprisePlayer.name, avatar: surprisePlayer.avatar };

  broadcastToRoom(room, 'game_over', { finalScores: scores, badges });
  sendToHost(room, 'game_over', { finalScores: scores, badges });
}

function resetRoom(room) {
  clearRoomTimer(room);
  room.state = 'lobby';
  room.currentRound = 0;
  room.tops.clear();
  room.guessingOrder = [];
  room.guessesForTop.clear();
  room.revealIndex = 0;
  for (const p of room.players.values()) {
    p.score = 0;
    p.ready = false;
  }
  room.lastActivity = Date.now();

  broadcastToRoom(room, 'room_reset', { players: getPlayersArray(room) });
  sendToHost(room, 'room_reset', { players: getPlayersArray(room) });
}

function checkMinPlayers(room) {
  if (room.state === 'lobby') return;
  if (room.players.size < 2) {
    clearRoomTimer(room);
    room.state = 'lobby';
    broadcastToRoom(room, 'game_suspended', { message: 'Pas assez de joueurs, partie suspendue' });
    sendToHost(room, 'game_suspended', { message: 'Pas assez de joueurs, partie suspendue', players: getPlayersArray(room) });
    console.log(`[game] suspended in room ${room.code} — not enough players`);
  }
}

function checkPhaseProgress(room) {
  if (room.state === 'filling') {
    const allReady = Array.from(room.players.keys()).every(id => room.tops.has(id));
    if (allReady && room.players.size > 0) {
      clearRoomTimer(room);
      transitionToGuessing(room);
    }
  }
  if (room.state === 'guessing') {
    const current = room.guessingOrder[room.currentTopIndex];
    if (!current) return;
    const guesses = room.guessesForTop.get(current.ownerId) || [];
    const expected = room.players.size - 1;
    if (guesses.length >= expected) {
      clearRoomTimer(room);
      room.currentTopIndex++;
      showNextTop(room);
    }
  }
}

// ── Timer ───────────────────────────────────────────────────────────────────
function startTimer(room, seconds, onExpire) {
  clearRoomTimer(room);
  room.timerEnd = Date.now() + seconds * 1000;

  room.tickInterval = setInterval(() => {
    const left = Math.max(0, Math.ceil((room.timerEnd - Date.now()) / 1000));
    broadcastToRoom(room, 'timer_tick', { timeLeft: left });
    sendToHost(room, 'timer_tick', { timeLeft: left });
    if (left <= 0) clearInterval(room.tickInterval);
  }, 1000);

  room.timer = setTimeout(() => {
    clearRoomTimer(room);
    onExpire();
  }, seconds * 1000);
}

// ── Room cleanup ────────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 2 * 60 * 60 * 1000) {
      clearRoomTimer(room);
      rooms.delete(code);
      console.log(`[cleanup] removed room ${code}`);
    }
  }
}, 30 * 60 * 1000);

// ── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Podium running on http://localhost:${PORT}`);
});
