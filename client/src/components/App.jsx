// client/src/components/App.jsx
import React, { useState, useEffect } from 'react';
import BattleArena from './BattleArena';
import { io } from 'socket.io-client';

// FIX: создаем основной App компонент для исправления импорта
const App = () => {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState({
    isConnected: false,
    isInBattle: false,
    playerId: null,
    error: null
  });

  // Инициализация Socket.IO соединения
  useEffect(() => {
    const newSocket = io('http://localhost:4000', {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('✅ Подключен к серверу:', newSocket.id);
      setGameState(prev => ({
        ...prev,
        isConnected: true,
        playerId: newSocket.id
      }));
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Отключен от сервера');
      setGameState(prev => ({
        ...prev,
        isConnected: false,
        isInBattle: false
      }));
    });

    newSocket.on('connect_error', (error) => {
      console.error('🚨 Ошибка подключения:', error);
      setGameState(prev => ({
        ...prev,
        error: `Ошибка подключения: ${error.message}`
      }));
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const handleFindBattle = () => {
    if (socket && gameState.isConnected) {
      console.log('🔍 Ищем противника...');
      socket.emit('findBattle', { 
        playerId: gameState.playerId,
        timestamp: new Date().toISOString()
      });
      
      setGameState(prev => ({
        ...prev,
        isInBattle: true
      }));
    }
  };

  return (
    <div className="app">
      <header className="game-header">
        <h1>⚔️ Fight Game - Моргиналово Западное</h1>
        <div className="connection-status">
          {gameState.isConnected ? (
            <span className="status-connected">🟢 Подключено</span>
          ) : (
            <span className="status-disconnected">🔴 Отключено</span>
          )}
          <span className="player-id">ID: {gameState.playerId}</span>
        </div>
      </header>

      <main className="game-content">
        {gameState.error && (
          <div className="error-message">
            🚨 {gameState.error}
          </div>
        )}

        {gameState.isConnected && !gameState.isInBattle && (
          <div className="menu">
            <h2>🏟️ Главное меню</h2>
            <button 
              className="find-battle-btn"
              onClick={handleFindBattle}
            >
              🔍 Найти бой
            </button>
          </div>
        )}

        {gameState.isInBattle && (
          <BattleArena 
            socket={socket}
            playerId={gameState.playerId}
          />
        )}
      </main>

      <style jsx>{`
        .app {
          font-family: 'Arial', sans-serif;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          color: white;
        }

        .game-header {
          text-align: center;
          margin-bottom: 30px;
          padding: 20px;
          background: rgba(0,0,0,0.3);
          border-radius: 10px;
        }

        .game-header h1 {
          margin: 0 0 10px 0;
          font-size: 2.5rem;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }

        .connection-status {
          display: flex;
          justify-content: center;
          gap: 20px;
          font-size: 1rem;
        }

        .status-connected {
          color: #4CAF50;
          font-weight: bold;
        }

        .status-disconnected {
          color: #f44336;
          font-weight: bold;
        }

        .error-message {
          background: #f44336;
          color: white;
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
          text-align: center;
        }

        .menu {
          text-align: center;
          padding: 40px;
          background: rgba(0,0,0,0.2);
          border-radius: 15px;
        }

        .find-battle-btn {
          background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
          color: white;
          border: none;
          padding: 15px 30px;
          font-size: 1.2rem;
          border-radius: 25px;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .find-battle-btn:hover {
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
};

export default App;