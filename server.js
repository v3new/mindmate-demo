const express = require('express');
const fs = require('fs');
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

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  const scenario = matchScenario(message) || scenarios.find(s => s.name === 'default');
  const prompt = scenario.script;

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user',   content: message }
      ]
    });

    // ← вот исправление:
    const reply = completion.choices[0].message.content.trim();

    res.json({ reply, followUps: scenario.followUps || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'OpenAI error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
