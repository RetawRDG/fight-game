// server/start-simple.js - ПОЛНОЕ ИСПРАВЛЕНИЕ
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const server = http.createServer(app);

// FIX: правильная настройка Socket.IO CORS с множественными origins
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:1234", 
      "http://localhost:4000", 
      "http://localhost:3000",
      "http://127.0.0.1:1234"
    ], 
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true // совместимость с более старыми клиентами
});

const JWT_SECRET = process.env.JWT_SECRET || 'battle-game-test-secret-2024';
const PORT = process.env.PORT || 4000;

// Rate limiting - более мягкие настройки для разработки
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 200, // увеличено для тестирования
  message: { error: 'Слишком много запросов, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS для REST API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Статические файлы
app.use(express.static(path.join(__dirname, '../client/dist')));

// FIX: исправленный JWT middleware с безопасным парсингом
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    
    // FIX: безопасный парсинг токена
    if (!authHeader) {
      return res.status(401).json({ error: 'Заголовок авторизации отсутствует' });
    }
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Неверный формат токена. Используйте: Bearer <token>' });
    }
    
    const token = parts[1]; // безопасно получаем токен
    
    if (!token) {
      return res.status(401).json({ error: 'Токен доступа отсутствует' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        console.error('JWT verification error:', err.message);
        return res.status(403).json({ 
          error: 'Недействительный токен',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка авторизации' });
  }
};

// Хранилище активных игроков и матчей (в памяти для простоты)
const activePlayers = new Map();
const activeMatches = new Map();
const waitingQueue = [];

// FIX: улучшенные Socket.IO обработчики
io.on('connection', (socket) => {
  console.log(`🔗 Игрок подключился: ${socket.id}`);
  
  // Добавляем игрока в активные
  activePlayers.set(socket.id, {
    id: socket.id,
    nickname: `Игрок_${socket.id.slice(-4)}`,
    hp: 100,
    ready: false,
    joinedAt: new Date()
  });

  // Поиск боя
  socket.on('findBattle', async (data) => {
    try {
      console.log(`🔍 Поиск боя от ${socket.id}:`, data);
      
      // Проверяем, не в бою ли уже игрок
      if (activeMatches.has(socket.id)) {
        socket.emit('battleError', { error: 'Вы уже участвуете в бою!' });
        return;
      }

      // Добавляем в очередь поиска
      if (!waitingQueue.find(p => p.id === socket.id)) {
        waitingQueue.push({
          id: socket.id,
          socket: socket,
          timestamp: new Date()
        });
      }

      socket.emit('searchingBattle', { 
        message: 'Ищем противника...',
        playerId: socket.id,
        queuePosition: waitingQueue.length
      });

      // Пытаемся найти противника
      if (waitingQueue.length >= 2) {
        const player1 = waitingQueue.shift();
        const player2 = waitingQueue.shift();
        
        const matchId = `match_${Date.now()}`;
        
        // Создаем матч
        const match = {
          id: matchId,
          players: {
            [player1.id]: { 
              ...activePlayers.get(player1.id),
              socket: player1.socket,
              attackZone: null,
              blockZone: null
            },
            [player2.id]: { 
              ...activePlayers.get(player2.id),
              socket: player2.socket,
              attackZone: null,
              blockZone: null
            }
          },
          round: 1,
          status: 'fighting',
          createdAt: new Date()
        };

        activeMatches.set(player1.id, match);
        activeMatches.set(player2.id, match);

        // Уведомляем игроков
        player1.socket.emit('battleFound', {
          matchId: matchId,
          opponent: {
            id: player2.id,
            nickname: activePlayers.get(player2.id).nickname,
            hp: 100
          }
        });

        player2.socket.emit('battleFound', {
          matchId: matchId,
          opponent: {
            id: player1.id,
            nickname: activePlayers.get(player1.id).nickname,
            hp: 100
          }
        });

        console.log(`⚔️ Матч создан: ${matchId} - ${player1.id} vs ${player2.id}`);
      }

    } catch (error) {
      console.error('❌ Ошибка поиска боя:', error);
      socket.emit('battleError', { 
        error: 'Ошибка поиска противника',
        details: error.message
      });
    }
  });

  // Действие игрока в бою
  socket.on('player:action', async (action) => {
    try {
      const match = activeMatches.get(socket.id);
      if (!match) {
        socket.emit('battleError', { error: 'Вы не участвуете в активном бою!' });
        return;
      }

      const player = match.players[socket.id];
      if (!player) {
        socket.emit('battleError', { error: 'Игрок не найден в матче!' });
        return;
      }

      // Сохраняем действие игрока
      player.attackZone = action.attackZone;
      player.blockZone = action.blockZone;
      player.ready = true;

      console.log(`🎯 Действие игрока ${socket.id}:`, action);

      // Проверяем, готовы ли оба игрока
      const players = Object.values(match.players);
      const allReady = players.every(p => p.ready);

      if (allReady) {
        // Рассчитываем результат боя
        const [player1, player2] = players;
        let battleResult = calculateBattleResult(player1, player2);

        // Обновляем HP игроков
        match.players[player1.id].hp = Math.max(0, battleResult.player1.hp);
        match.players[player2.id].hp = Math.max(0, battleResult.player2.hp);

        // Отправляем результат обоим игрокам
        Object.values(match.players).forEach(p => {
          p.socket.emit('battle:result', {
            round: match.round,
            message: battleResult.message,
            players: {
              [player1.id]: { 
                id: player1.id, 
                nickname: player1.nickname, 
                hp: match.players[player1.id].hp,
                attackZone: player1.attackZone,
                blockZone: player1.blockZone
              },
              [player2.id]: { 
                id: player2.id, 
                nickname: player2.nickname, 
                hp: match.players[player2.id].hp,
                attackZone: player2.attackZone,
                blockZone: player2.blockZone
              }
            }
          });
        });

        // Проверяем победу
        if (match.players[player1.id].hp <= 0 || match.players[player2.id].hp <= 0) {
          const winner = match.players[player1.id].hp > 0 ? player1 : player2;
          
          Object.values(match.players).forEach(p => {
            p.socket.emit('battle:end', {
              winner: winner.id,
              message: `${winner.nickname} победил!`,
              players: {
                [player1.id]: { 
                  id: player1.id, 
                  nickname: player1.nickname, 
                  hp: match.players[player1.id].hp 
                },
                [player2.id]: { 
                  id: player2.id, 
                  nickname: player2.nickname, 
                  hp: match.players[player2.id].hp 
                }
              }
            });
          });

          // Удаляем матч
          activeMatches.delete(player1.id);
          activeMatches.delete(player2.id);
        } else {
          // Следующий раунд
          match.round++;
          Object.values(match.players).forEach(p => {
            p.ready = false;
            p.attackZone = null;
            p.blockZone = null;
          });
        }
      }

    } catch (error) {
      console.error('❌ Ошибка обработки действия:', error);
      socket.emit('battleError', { 
        error: 'Ошибка обработки действия',
        details: error.message
      });
    }
  });

  // Отключение игрока
  socket.on('disconnect', () => {
    console.log(`❌ Игрок отключился: ${socket.id}`);
    
    // Удаляем из активных игроков
    activePlayers.delete(socket.id);
    
    // Удаляем из очереди поиска
    const queueIndex = waitingQueue.findIndex(p => p.id === socket.id);
    if (queueIndex !== -1) {
      waitingQueue.splice(queueIndex, 1);
    }
    
    // Обрабатываем активный матч
    const match = activeMatches.get(socket.id);
    if (match) {
      const opponent = Object.values(match.players).find(p => p.id !== socket.id);
      if (opponent) {
        opponent.socket.emit('battle:end', {
          message: 'Противник отключился. Вы победили!',
          winner: opponent.id
        });
        activeMatches.delete(opponent.id);
      }
      activeMatches.delete(socket.id);
    }
  });
});

// FIX: расчет результата боя с правильной логикой
function calculateBattleResult(player1, player2) {
  const BASE_DAMAGE = 10;
  
  let damage1 = 0; // урон игроку 1
  let damage2 = 0; // урон игроку 2
  
  let actions = [];
  
  // Игрок 1 атакует игрока 2
  if (player1.attackZone !== player2.blockZone) {
    damage2 = BASE_DAMAGE;
    actions.push(`${player1.nickname} попал по зоне ${player1.attackZone} (${BASE_DAMAGE} урона)`);
  } else {
    actions.push(`${player1.nickname} атаковал в ${player1.attackZone}, но ${player2.nickname} заблокировал`);
  }
  
  // Игрок 2 атакует игрока 1
  if (player2.attackZone !== player1.blockZone) {
    damage1 = BASE_DAMAGE;
    actions.push(`${player2.nickname} попал по зоне ${player2.attackZone} (${BASE_DAMAGE} урона)`);
  } else {
    actions.push(`${player2.nickname} атаковал в ${player2.attackZone}, но ${player1.nickname} заблокировал`);
  }
  
  return {
    player1: { hp: player1.hp - damage1 },
    player2: { hp: player2.hp - damage2 },
    message: actions.join('; ')
  };
}

// API маршруты
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Fight Game API работает!',
    timestamp: new Date().toISOString(),
    stats: {
      activePlayers: activePlayers.size,
      activeMatches: activeMatches.size,
      waitingQueue: waitingQueue.length
    }
  });
});

// Статистика сервера (для отладки)
app.get('/api/stats', (req, res) => {
  res.json({
    activePlayers: Array.from(activePlayers.keys()),
    activeMatches: Array.from(activeMatches.keys()),
    waitingQueue: waitingQueue.map(p => ({ id: p.id, timestamp: p.timestamp }))
  });
});

// FIX: правильный wildcard для SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  res.status(500).json({ 
    error: 'Внутренняя ошибка сервера',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Что-то пошло не так'
  });
});

server.listen(PORT, () => {
  console.log(`🚀 ================================`);
  console.log(`🎮 FIGHT GAME SERVER (ИСПРАВЛЕНО)`);
  console.log(`🚀 ================================`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 API Health: http://localhost:${PORT}/api/health`);
  console.log(`📊 API Stats: http://localhost:${PORT}/api/stats`);
  console.log(`🎯 Game Client: http://localhost:1234`);
  console.log(`✅ Socket.IO готов для real-time боев!`);
  console.log(`🔧 CORS настроен для портов: 1234, 3000, 4000`);
});