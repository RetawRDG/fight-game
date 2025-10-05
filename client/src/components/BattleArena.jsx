// client/src/components/BattleArena.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';

// FIX: Локальные константы зон атаки (fallback для shared types)
const BATTLE_ZONES = {
  HEAD: 'head',
  BODY: 'body', 
  ARMS: 'arms',
  LEGS: 'legs'
};

const BattleLog = ({ battleLog }) => {
  const logRef = useRef(null); // FIX: useRef уже импортирован!
  
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [battleLog]);

  return (
    <div className="battle-log">
      <h3>📜 Лог боя</h3>
      <div ref={logRef} className="log-content">
        {battleLog.map((entry, index) => (
          <div key={index} className="log-entry">
            <span className="timestamp">[{entry.timestamp}]</span>
            <span className="message">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ZoneSelector = ({ title, selectedZone, onZoneSelect, zones }) => {
  return (
    <div className="zone-selector">
      <h4>{title}</h4>
      <div className="zones">
        {Object.values(zones).map(zone => (
          <button
            key={zone}
            className={`zone-btn ${selectedZone === zone ? 'selected' : ''}`}
            onClick={() => onZoneSelect(zone)}
          >
            {zone === 'head' && '🗿'}
            {zone === 'body' && '🛡️'}
            {zone === 'arms' && '💪'}
            {zone === 'legs' && '🦵'}
            <span>{zone.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const BattleArena = ({ socket, playerId }) => {
  const [gameState, setGameState] = useState({
    players: {
      [playerId]: { 
        id: playerId, 
        nickname: `Игрок_${playerId?.slice(-4)}`, 
        hp: 100, 
        ready: false,
        attackZone: null,
        blockZone: null 
      }
    },
    currentRound: 1,
    battleStatus: 'waiting', // waiting, fighting, finished
    battleLog: []
  });

  const [selectedAttackZone, setSelectedAttackZone] = useState(null);
  const [selectedBlockZone, setSelectedBlockZone] = useState(null);

  // Добавляем запись в лог боя
  const addLogEntry = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setGameState(prev => ({
      ...prev,
      battleLog: [...prev.battleLog, { timestamp, message }]
    }));
  }, []);

  // Socket.IO обработчики событий
  useEffect(() => {
    if (!socket) return;

    socket.on('searchingBattle', (data) => {
      addLogEntry(`🔍 ${data.message}`);
    });

    socket.on('battleFound', (data) => {
      addLogEntry(`⚔️ Противник найден! Бой начинается...`);
      setGameState(prev => ({
        ...prev,
        battleStatus: 'fighting',
        players: {
          ...prev.players,
          [data.opponent.id]: {
            ...data.opponent,
            hp: 100,
            ready: false
          }
        }
      }));
    });

    socket.on('battle:result', (result) => {
      addLogEntry(`💥 ${result.message}`);
      setGameState(prev => ({
        ...prev,
        players: result.players,
        currentRound: result.round
      }));
    });

    socket.on('battle:end', (result) => {
      addLogEntry(`🏆 Бой окончен! ${result.message}`);
      setGameState(prev => ({
        ...prev,
        battleStatus: 'finished',
        players: result.players
      }));
    });

    socket.on('battleError', (error) => {
      addLogEntry(`❌ Ошибка: ${error.error}`);
    });

    return () => {
      socket.off('searchingBattle');
      socket.off('battleFound');
      socket.off('battle:result');
      socket.off('battle:end');
      socket.off('battleError');
    };
  }, [socket, addLogEntry]);

  // Отправка действия игрока
  const handlePlayerAction = () => {
    if (!selectedAttackZone || !selectedBlockZone) {
      addLogEntry('❌ Выберите зоны атаки и блока!');
      return;
    }

    const action = {
      playerId,
      attackZone: selectedAttackZone,
      blockZone: selectedBlockZone,
      round: gameState.currentRound
    };

    socket.emit('player:action', action);
    addLogEntry(`✅ Ход отправлен: атака ${selectedAttackZone}, блок ${selectedBlockZone}`);
    
    // Помечаем игрока как готового
    setGameState(prev => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: {
          ...prev.players[playerId],
          ready: true,
          attackZone: selectedAttackZone,
          blockZone: selectedBlockZone
        }
      }
    }));
  };

  const players = Object.values(gameState.players);
  const currentPlayer = gameState.players[playerId];
  const opponent = players.find(p => p.id !== playerId);

  return (
    <div className="battle-arena">
      <div className="battle-header">
        <h2>⚔️ Арена боя - Раунд {gameState.currentRound}</h2>
        <div className="battle-status">
          Статус: <span className={`status-${gameState.battleStatus}`}>
            {gameState.battleStatus === 'waiting' && '⏳ Ожидание'}
            {gameState.battleStatus === 'fighting' && '⚔️ Бой'}
            {gameState.battleStatus === 'finished' && '🏁 Завершен'}
          </span>
        </div>
      </div>

      <div className="players-section">
        {/* Текущий игрок */}
        <div className="player-card current-player">
          <h3>👤 Вы ({currentPlayer?.nickname})</h3>
          <div className="player-hp">
            ❤️ HP: {currentPlayer?.hp || 100}/100
          </div>
          <div className="player-status">
            {currentPlayer?.ready ? '✅ Готов' : '⏳ Ожидание'}
          </div>
        </div>

        {/* Противник */}
        <div className="player-card opponent">
          <h3>🤖 Противник {opponent ? `(${opponent.nickname})` : '(поиск...)'}</h3>
          <div className="player-hp">
            ❤️ HP: {opponent?.hp || 100}/100
          </div>
          <div className="player-status">
            {opponent?.ready ? '✅ Готов' : '⏳ Ожидание'}
          </div>
        </div>
      </div>

      {gameState.battleStatus === 'fighting' && !currentPlayer?.ready && (
        <div className="controls-section">
          <ZoneSelector
            title="🗡️ Выберите зону атаки"
            selectedZone={selectedAttackZone}
            onZoneSelect={setSelectedAttackZone}
            zones={BATTLE_ZONES}
          />

          <ZoneSelector
            title="🛡️ Выберите зону блока"
            selectedZone={selectedBlockZone}
            onZoneSelect={setSelectedBlockZone}
            zones={BATTLE_ZONES}
          />

          <button 
            className="action-btn"
            onClick={handlePlayerAction}
            disabled={!selectedAttackZone || !selectedBlockZone}
          >
            ⚡ Выполнить ход
          </button>
        </div>
      )}

      <BattleLog battleLog={gameState.battleLog} />

      <style jsx>{`
        .battle-arena {
          background: rgba(0,0,0,0.4);
          padding: 20px;
          border-radius: 15px;
          color: white;
        }

        .battle-header {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid rgba(255,255,255,0.2);
        }

        .players-section {
          display: flex;
          justify-content: space-between;
          margin: 20px 0;
          gap: 20px;
        }

        .player-card {
          background: rgba(0,0,0,0.3);
          padding: 15px;
          border-radius: 10px;
          flex: 1;
          text-align: center;
        }

        .current-player {
          border: 2px solid #4CAF50;
        }

        .opponent {
          border: 2px solid #f44336;
        }

        .controls-section {
          margin: 30px 0;
          padding: 20px;
          background: rgba(0,0,0,0.2);
          border-radius: 10px;
        }

        .zone-selector {
          margin: 20px 0;
        }

        .zones {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .zone-btn {
          background: rgba(255,255,255,0.1);
          border: 2px solid transparent;
          color: white;
          padding: 10px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          transition: all 0.2s;
          min-width: 80px;
        }

        .zone-btn:hover {
          background: rgba(255,255,255,0.2);
        }

        .zone-btn.selected {
          border-color: #4CAF50;
          background: rgba(76, 175, 80, 0.3);
        }

        .action-btn {
          background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
          color: white;
          border: none;
          padding: 15px 30px;
          font-size: 1.2rem;
          border-radius: 25px;
          cursor: pointer;
          display: block;
          margin: 20px auto 0;
          transition: transform 0.2s;
        }

        .action-btn:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .battle-log {
          margin-top: 30px;
          background: rgba(0,0,0,0.5);
          padding: 15px;
          border-radius: 10px;
        }

        .log-content {
          max-height: 200px;
          overflow-y: auto;
          background: rgba(0,0,0,0.3);
          padding: 10px;
          border-radius: 5px;
        }

        .log-entry {
          margin: 5px 0;
          padding: 5px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .timestamp {
          color: #888;
          margin-right: 10px;
        }

        .status-waiting { color: #FFC107; }
        .status-fighting { color: #4CAF50; }
        .status-finished { color: #f44336; }
      `}</style>
    </div>
  );
};

export default BattleArena;