// === widget.js ===

(function() {
  const USER_ID = 'abc123';

  // 1) Подключаем CSS
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = 'widget.css';
  document.head.appendChild(styleLink);

  // 2) Подгружаем marked.js для рендеринга Markdown
  const mdScript = document.createElement('script');
  mdScript.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  mdScript.onload = () => console.log('marked loaded');
  document.head.appendChild(mdScript);

  // 3) Создаём контейнер
  const container = document.createElement('div');
  container.id = 'chat-widget';
  container.innerHTML = `
    <button id="chat-fab" title="Помощник">
      <span class="material-icons">chat</span>
    </button>
    <div id="chat-panel">
      <div id="chat-messages"></div>
      <div id="chat-scenarios"></div>
      <div id="chat-quick"></div>
      <div id="chat-input-row">
        <input id="chat-input" type="text" placeholder="Введите сообщение..." autocomplete="off"/>
        <button id="chat-send"><span class="material-icons">send</span></button>
      </div>
    </div>`;
  document.body.appendChild(container);

  const fab       = container.querySelector('#chat-fab');
  const panel     = container.querySelector('#chat-panel');
  const messages  = container.querySelector('#chat-messages');
  const scenarios = container.querySelector('#chat-scenarios');
  const quick     = container.querySelector('#chat-quick');
  const input     = container.querySelector('#chat-input');
  const sendBtn   = container.querySelector('#chat-send');

  // Открытие/закрытие виджета
  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
    fab.classList.toggle('open');
    if (panel.classList.contains('open')) {
      input.focus();
      scrollToBottom();
    }
  });

  // Скрываем сценарии при вводе
  input.addEventListener('input', () => {
    const hasText = input.value.trim().length > 0;
    scenarios.style.opacity = hasText ? '0' : '1';
    scenarios.style.pointerEvents = hasText ? 'none' : 'auto';
  });

  // Загрузка public-сценариев
  async function loadScenarios() {
    try {
      const res = await fetch('/api/scenarios');
      const list = await res.json();
      list.filter(s => s.type === 'public').forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'scenario';
        btn.textContent = s.triggers[0] || s.name;
        btn.onclick = () => {
          addMessage(btn.textContent, 'user');
          send(btn.textContent);
        };
        scenarios.appendChild(btn);
      });
    } catch (e) {
      console.error(e);
    }
  }

  // Отправка сообщения кликом и Enter
  sendBtn.addEventListener('click', onSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') onSend(); });

  function onSend() {
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    input.value = '';
    scenarios.style.opacity = '1';
    scenarios.style.pointerEvents = 'auto';
    send(text);
  }

  // Добавление сообщения в чат
  function addMessage(text, from) {
    const div = document.createElement('div');
    div.className = `msg ${from}`;

    if (from === 'bot' && window.marked) {
      // рендерим Markdown
      div.innerHTML = marked.parse(text);
    } else {
      // обычный текст (пользовательские сообщения)
      div.textContent = text;
    }

    messages.appendChild(div);
    scrollToBottom();
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  // Основная отправка на сервер и получение ответа
  async function send(text) {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: text, userId: USER_ID})
      });
      const data = await res.json();

      // добавляем ответ бота
      addMessage(data.reply, 'bot');

      // быстрые подсказки
      quick.innerHTML = '';
      (data.followUps || []).forEach(t => {
        const b = document.createElement('button');
        b.className = 'quick';
        b.textContent = t;
        b.onclick = () => {
          addMessage(t, 'user');
          send(t);
        };
        quick.appendChild(b);
      });
    } catch (e) {
      console.error(e);
    }
  }

  loadScenarios();
})();