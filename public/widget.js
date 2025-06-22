// Chat widget script

(function() {
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = 'widget.css';
  document.head.appendChild(styleLink);

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
        <input id="chat-input" type="text" placeholder="Введите сообщение..." />
        <button id="chat-send"><span class="material-icons">send</span></button>
      </div>
    </div>`;
  document.body.appendChild(container);

  const fab = container.querySelector('#chat-fab');
  const panel = container.querySelector('#chat-panel');
  const messages = container.querySelector('#chat-messages');
  const scenarios = container.querySelector('#chat-scenarios');
  const quick = container.querySelector('#chat-quick');
  const input = container.querySelector('#chat-input');
  const sendBtn = container.querySelector('#chat-send');

  async function loadScenarios() {
    try {
      const res = await fetch('/api/scenarios');
      const list = await res.json();
      list.filter(s => s.type === 'public').forEach(s => {
        const b = document.createElement('button');
        b.className = 'scenario';
        b.textContent = s.triggers[0] || s.name;
        b.onclick = () => {
          addMessage(b.textContent, 'user');
          send(b.textContent);
        };
        scenarios.appendChild(b);
      });
    } catch (e) {
      console.error(e);
    }
  }

  function toggleChat() {
    panel.classList.toggle('open');
    fab.classList.toggle('open');
    if (panel.classList.contains('open')) {
      input.focus();
      scrollToBottom();
    }
  }

  fab.addEventListener('click', toggleChat);

  loadScenarios();

  sendBtn.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    input.value = '';
    send(text);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendBtn.click();
    }
  });

  function addMessage(text, from) {
    const div = document.createElement('div');
    div.className = 'msg ' + from;
    div.textContent = text;
    messages.appendChild(div);
    scrollToBottom();
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  async function send(text) {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      addMessage(data.reply, 'bot');
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
})();