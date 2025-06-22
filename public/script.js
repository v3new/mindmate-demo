async function loadScenarios() {
  const res = await fetch('/api/scenarios');
  const scenarios = await res.json();
  const container = document.getElementById('scenarios');
  scenarios.filter(s => s.type === 'public').forEach(s => {
    const btn = document.createElement('button');
    btn.textContent = s.triggers[0] || s.name;
    btn.onclick = () => sendMessage(btn.textContent);
    container.appendChild(btn);
  });
}

function addMessage(text, from) {
  const div = document.createElement('div');
  div.className = from;
  div.textContent = text;
  document.getElementById('messages').appendChild(div);
}

async function sendMessage(text) {
  addMessage(text, 'user');
  document.getElementById('user-input').value = '';
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text })
  });
  const data = await res.json();
  addMessage(data.reply, 'bot');
  const qr = document.getElementById('quick-replies');
  qr.innerHTML = '';
  (data.followUps || []).forEach(fu => {
    const b = document.createElement('button');
    b.textContent = fu;
    b.onclick = () => sendMessage(fu);
    qr.appendChild(b);
  });
}

document.getElementById('send-btn').onclick = () => {
  const txt = document.getElementById('user-input').value.trim();
  if (txt) sendMessage(txt);
};

loadScenarios();
