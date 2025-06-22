// === server.js ===

const express = require('express');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const scenarios = JSON.parse(fs.readFileSync('./database/scenarios.json', 'utf-8'));
const products = JSON.parse(fs.readFileSync('./database/products.json', 'utf-8'));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://bothub.chat/api/v2/openai/v1',
});

// В памяти храним историю и последний сценарий для каждого пользователя
const conversations = {};

/**
 * Простое совпадение по триггерам, если классификация не сработала
 */
function matchScenario(input) {
  const text = input.toLowerCase();
  return scenarios.find(s => s.triggers.some(t => text.includes(t.toLowerCase())));
}

/**
 * Классификатор сценариев с учётом истории:
 * - Формируем JSON-сценариев
 * - Отдельным системным сообщением передаём последние N сообщений истории
 * - Затем user => новое сообщение
 */
async function classifyScenario(newText, history = []) {
  const promptBase =
    'Ты классификатор обращений. Тебе дан JSON со всеми сценариями. ' +
    'Верни только поле "name" того сценария, который лучше всего подходит для нового сообщения. ' +
    'Если ничего не подходит — верни "default".\n\n' +
    JSON.stringify(scenarios, null, 2);

  // Собираем последние 8 сообщений истории в читаемый вид
  const historyText = history
    .slice(-8)
    .map(m => {
      const who = m.role === 'assistant' ? 'Бот' : 'Пользователь';
      return `${who}: ${m.content}`;
    })
    .join('\n');

  const messages = [
    { role: "system", content: promptBase },
    { role: "system", content: `История диалога:\n${historyText}` },
    { role: "user", content: newText }
  ];

  console.log("GPT request (classifyScenario):", messages);
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages
  });
  const name = resp.choices[0].message.content.trim();
  console.log("GPT response (classifyScenario):", name);
  return name;
}

/**
 * Загружает данные лояльности (с учётом userId)
 */
function loadLoyaltyData(userId = 'default') {
  const file = path.join('database', `loyalty_${userId}.json`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    data = JSON.parse(fs.readFileSync(path.join('database', 'loyalty.json'), 'utf-8'));
  }
  return data;
}

/**
 * Загружает общие промокоды
 */
function loadPromoCodes() {
  return JSON.parse(fs.readFileSync(path.join('database', 'promoCodes.json'), 'utf-8'));
}

/**
 * Загружает персональные промокоды (с учётом userId)
 */
function loadPersonalPromoCodes(userId = 'default') {
  const file = path.join('database', `personalPromoCodes_${userId}.json`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    data = JSON.parse(fs.readFileSync(path.join('database', 'personalPromoCodes.json'), 'utf-8'));
  }
  return data;
}

/**
 * Загружает статусы заказов (с учётом userId)
 */
function loadOrderStatus(userId = 'default') {
  const file = path.join('database', `orderStatus_${userId}.json`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    data = JSON.parse(fs.readFileSync(path.join('database', 'orderStatus.json'), 'utf-8'));
  }
  return data;
}

function loadCart(userId = 'default') {
  const file = path.join('database', `cart_${userId}.json`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    data = JSON.parse(fs.readFileSync(path.join('database', 'cart.json'), 'utf-8'));
  }
  return data;
}

function loadContacts() {
  return JSON.parse(fs.readFileSync(path.join('database', 'contacts.json'), 'utf-8'));
}

function loadFaq() {
  return JSON.parse(fs.readFileSync(path.join('database', 'faq.json'), 'utf-8'));
}

function loadSections() {
  return JSON.parse(fs.readFileSync(path.join('database', 'sections.json'), 'utf-8'));
}

function loadNewsletters(userId = 'default') {
  const file = path.join('database', `newsletters_${userId}.json`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    data = JSON.parse(fs.readFileSync(path.join('database', 'newsletters.json'), 'utf-8'));
  }
  return data;
}

function loadPurchaseHistory(userId = 'default') {
  const file = path.join('database', `purchaseHistory_${userId}.json`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    data = JSON.parse(fs.readFileSync(path.join('database', 'purchaseHistory.json'), 'utf-8'));
  }
  return data;
}

app.get('/api/scenarios', (req, res) => {
  res.json(scenarios);
});

app.post('/api/chat', async (req, res) => {
  const { message, userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  // Инициализируем разговор, если надо
  if (!conversations[userId]) {
    conversations[userId] = { history: [], scenario: null };
  }
  const conv = conversations[userId];

  // 1) Классифицируем сценарий с учётом истории
  let scenario;
  try {
    const name = await classifyScenario(message, conv.history);
    scenario = scenarios.find(s => s.name === name);
  } catch (e) {
    console.error('classification error', e);
  }

  // 2) Фоллбэк на простое матчинговое правило
  if (!scenario) {
    scenario = matchScenario(message);
  }
  if (!scenario) {
    scenario = { name: 'default', script: 'Ты дружелюбный помощник интернет-магазина.' };
  }

  // 3) Подготовка системного промпта для основного чата
  let systemPrompt = scenario.script;
  if (scenario.name === 'bonusBalance') {
    const data = loadLoyaltyData(userId);
    const historyText = (data.history || [])
      .map(h => {
        if (h.event) {
          return `${h.date}: ${h.event} (${h.points})`;
        }
        const sign = h.change > 0 ? '+' : '';
        return `${h.date}: ${h.reason} (${sign}${h.change}${h.products ? `: ${h.products.join(', ')}` : ''})`;
      })
      .join('\n');
    systemPrompt =
      `Данные пользователя:\n` +
      `- Бонусный баланс: ${data.bonus_balance}\n` +
      `- Кэшбек: ${data.cashback_available}\n` +
      `- Уровень: ${data.loyalty_tier}\n` +
      `- Последнее обновление: ${data.last_updated}\n` +
      `- История: \n${historyText}\n\n` +
      `Используй эти данные, чтобы ответить на вопрос пользователя.`;
  } else if (scenario.name === 'viewPromoCodes') {
    const data = loadPromoCodes();
    const list = (data.promoCodes || [])
      .map(p => `${p.code}: ${p.description} (скидка ${p.discount}%)`)
      .join('\n');
    systemPrompt =
      `Актуальные промокоды:\n${list}\n\n` +
      `Используй эти данные, чтобы ответить на вопрос пользователя.`;
  } else if (scenario.name === 'personalDiscounts') {
    const data = loadPersonalPromoCodes(userId);
    const list = (data.personalPromoCodes || [])
      .map(p => {
        const val = p.type === 'percent' ? `${p.value}%` : `${p.value}₽`;
        const min = p.minOrderAmount ? `, от ${p.minOrderAmount}₽` : '';
        const items = p.appliesTo ? `, товары: ${p.appliesTo.join(', ')}` : '';
        return `${p.code}: ${p.description} (${val}${min}, до ${p.expires}${items})`;
      })
      .join('\n');
    systemPrompt =
      `Персональные промокоды пользователя:\n${list}\n\n` +
      `Используй эти данные, чтобы ответить на вопрос пользователя.`;
  } else if (scenario.name === 'orderTracking') {
    const data = loadOrderStatus(userId);
    const list = (data.orders || [])
      .map(o => `${o.id}: ${o.status}${o.deliveryDate ? `, доставка ${o.deliveryDate}` : ''}`)
      .join('\n');
    systemPrompt =
      `Статусы заказов пользователя:\n${list}\n\n` +
      `Используй эти данные, чтобы ответить на вопрос пользователя.`;
  } else if (scenario.name === 'itemsAdvisor') {
    const list = (products.products || [])
      .slice(0, 5)
      .map(p => `${p.name} (${p.category}) — ${p.price}₽`)
      .join('\n');
    systemPrompt =
      `Несколько популярных товаров из каталога:\n${list}\n\n` +
      `Используй эти данные, чтобы посоветовать товары.`;
  } else if (scenario.name === 'addToCartSuggestion') {
    const cart = loadCart(userId);
    const items = (cart.cart || []).map(c => c.name).join(', ');
    const cartCategories = (cart.cart || [])
      .map(c => {
        const prod = (products.products || []).find(p => p.name === c.name);
        return prod ? prod.category : null;
      })
      .filter(Boolean);
    const suggestion = (products.products || [])
      .find(p => cartCategories.includes(p.category) && !(cart.cart || []).some(c => c.name === p.name));
    const textSuggestion = suggestion ? `${suggestion.name} (${suggestion.price}₽)` : 'нет предложений';
    systemPrompt =
      `В корзине пользователя: ${items}.\nПредложи добавить товар: ${textSuggestion}.`;
  } else if (scenario.name === 'visitPromoPage') {
    const sections = loadSections();
    const promo = sections.sections.find(s => /акции/i.test(s.name)) || sections.sections[0];
    systemPrompt =
      `Предложи пользователю перейти по ссылке на промо страницу: ${promo.url}`;
  } else if (scenario.name === 'contactManager') {
    const info = loadContacts().contacts;
    systemPrompt =
      `Контактная информация:\nТелефон: ${info.phone}\nEmail: ${info.email}\nАдрес: ${info.address}\n\n` +
      `Уточни, как пользователю удобнее связаться.`;
  } else if (scenario.name === 'faq') {
    const faq = loadFaq().faq.slice(0, 5)
      .map(f => `${f.question} — ${f.answer}`)
      .join('\n');
    systemPrompt =
      `Часто задаваемые вопросы:\n${faq}\n\nОтвечай, используя эту информацию.`;
  } else if (scenario.name === 'siteNavigator') {
    const list = loadSections().sections.map(s => `${s.name}: ${s.url}`).join('\n');
    systemPrompt =
      `Разделы сайта:\n${list}\n\nПомоги найти нужный раздел.`;
  } else if (scenario.name === 'notificationSettings') {
    const list = loadNewsletters(userId).newsletters
      .map(n => `${n.name}: ${n.subscribed ? 'подписан' : 'не подписан'}`)
      .join('\n');
    systemPrompt =
      `Подписки пользователя на рассылки:\n${list}\n\nПомоги изменить настройки.`;
  } else if (scenario.name === 'purchaseHistory') {
    const list = loadPurchaseHistory(userId).purchases
      .map(p => `${p.date}: ${p.name} — ${p.price}₽, бонусы ${p.bonus}`)
      .join('\n');
    systemPrompt =
      `История покупок пользователя:\n${list}\n\nИспользуй эти данные для ответа.`;
  } else if (scenario.name === 'productReturn') {
    const last = loadPurchaseHistory(userId).purchases.slice(-5)
      .map(p => `${p.name} от ${p.date}`)
      .join('\n');
    systemPrompt =
      `Последние покупки пользователя:\n${last}\n\nПомоги оформить возврат одного из товаров.`;
  }

  // 4) Собираем сообщения для GPT-чата
  const historyMessages = conv.history.slice(-6);
  const gptMessages = [
    { role: "system", content: systemPrompt },
    { role: "system", content: `Последний сценарий: ${conv.scenario || "none"}` },
    ...historyMessages,
    { role: "user", content: message }
  ];

  try {
    console.log("GPT request (chat):", gptMessages);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: gptMessages
    });
    const reply = completion.choices[0].message.content.trim();
    console.log("GPT response (chat):", reply);

    // 5) Сохраняем в историю
    conv.history.push({ role: "user", content: message });
    conv.history.push({ role: "assistant", content: reply });
    conv.scenario = scenario.name;

    // 6) Отправляем ответ клиенту
    res.json({ reply, followUps: scenario.followUps || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'OpenAI error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));