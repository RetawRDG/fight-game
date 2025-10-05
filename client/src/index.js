// client/src/index.js - Главная точка входа React приложения
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';

// FIX: Получаем DOM элемент для рендера
const container = document.getElementById('app');

if (!container) {
  throw new Error('Элемент #app не найден в DOM!');
}

// FIX: Создаем React 18+ root для рендера
const root = createRoot(container);

try {
  // Рендерим главный App компонент
  root.render(<App />);
  
  console.log('🎮 Fight Game успешно запущен!');
} catch (error) {
  console.error('❌ Ошибка запуска приложения:', error);
  
  // Показываем сообщение об ошибке пользователю
  container.innerHTML = `
    <div style="
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      color: white;
      font-family: Arial, sans-serif;
      text-align: center;
      flex-direction: column;
    ">
      <h1>❌ Ошибка загрузки</h1>
      <p>Не удалось запустить Fight Game</p>
      <p><small>Проверьте консоль разработчика для подробностей</small></p>
    </div>
  `;
}