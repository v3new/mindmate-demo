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

app.get('/api/scenarios', (req, res) => {
  res.json(scenarios);
});

function matchScenario(input) {
  const text = input.toLowerCase();
  return scenarios.find(s => s.triggers.some(t => text.includes(t.toLowerCase())));
}

async function classifyScenario(text) {
  const prompt =
    'Ты классификатор обращений. Тебе дан JSON со сценариями. ' +
    'Верни только поле "name" сценария, который лучше всего подходит для сообщения пользователя. ' +
    'Если ничего не подходит, ответь "default".\n\n' +
    JSON.stringify(scenarios, null, 2);

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: text }
    ]
  });

  return resp.choices[0].message.content.trim();
}

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

app.post('/api/chat', async (req, res) => {
  const { message, userId } = req.body;
  let scenario;

  try {
    const name = await classifyScenario(message);
    scenario = scenarios.find(s => s.name === name);
  } catch (e) {
    console.error('classification error', e);
  }

  if (!scenario) {
    scenario = matchScenario(message);
  }

  if (!scenario) {
    scenario = { name: 'default', script: 'Ты дружелюбный помощник интернет-магазина.' };
  }

  let systemPrompt = scenario.script;

  if (scenario.name === 'bonusBalance') {
    const data = loadLoyaltyData(userId);
    const history = (data.history || [])
      .map(h => {
        if (h.event) {
          return `${h.date}: ${h.event} (${h.points})`;
        }
        const sign = h.change > 0 ? '+' : '';
        return `${h.date}: ${h.reason} (${sign}${h.change}: ${h.products.map(p => p.name).join(', ')})`;
      })
      .join('\n');
    systemPrompt =
      `Данные пользователя:\n` +
      `- Бонусный баланс: ${data.bonus_balance}\n` +
      `- Кэшбек: ${data.cashback_available}\n` +
      `- Уровень: ${data.loyalty_tier}\n` +
      `- Последнее обновление: ${data.last_updated}\n` +
      `- История: \n${history}\n` +
      `\nИспользуй эти данные, чтобы ответить на вопрос пользователя.`;
  }

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: message }
      ]
    });

    const reply = completion.choices[0].message.content.trim();

    res.json({ reply, followUps: scenario.followUps || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'OpenAI error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
