// This function runs on Netlify's server, not in the browser.
// Your ANTHROPIC_API_KEY stays here and is never sent to the user's device.

const PROMPTS = {
  hooks: (input) => `You are a short-form content hook writer. Given the niche or topic "${input}", generate exactly 3 scroll-stopping hook ideas, each under 12 words. For each, give the hook text and a short trigger tag (one of: bold claim, curiosity, usefulness, contrarian, story opener, relatable).
Respond with ONLY a JSON array, no other text, no markdown formatting:
[{"title": "...", "tag": "..."}, {"title": "...", "tag": "..."}, {"title": "...", "tag": "..."}]`,

  script: (input) => `You are a short-form video scriptwriter. Given the hook or topic "${input}", write a complete script structured as: hook (0-2 seconds), build (the main content), payoff (the key insight), and cta (one simple call to action).
Respond with ONLY a JSON array, no other text, no markdown formatting:
[{"label": "0:00-0:02 hook", "t": "..."}, {"label": "build", "t": "..."}, {"label": "payoff", "t": "..."}, {"label": "cta", "t": "..."}]`,

  clips: (input) => `You are a content repurposing assistant. Given this description of a longer video or podcast: "${input}", suggest exactly 2 clip-worthy moments. For each, give a plausible timestamp range and a suggested standalone hook for that clip.
Respond with ONLY a JSON array, no other text, no markdown formatting:
[{"label": "MM:SS-MM:SS", "t": "Suggested hook: ..."}, {"label": "MM:SS-MM:SS", "t": "Suggested hook: ..."}]`,

  caption: (input) => `You are a social media caption writer. Given the topic "${input}", write exactly 2 caption variants for Instagram: one punchy/direct, one question-driven for engagement.
Respond with ONLY a JSON array, no other text, no markdown formatting:
[{"t": "..."}, {"t": "..."}]`,

  plan: (input) => `You are a content posting planner. Given this goal: "${input}", suggest a realistic week of posting with 2-3 specific days and a topic idea for each.
Respond with ONLY a JSON array, no other text, no markdown formatting:
[{"label": "Mon", "t": "..."}, {"label": "Wed", "t": "..."}]`
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { module: mod, input } = body;

  if (!mod || !PROMPTS[mod]) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown module' }) };
  }
  if (!input || typeof input !== 'string' || !input.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Input is required' }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is missing from environment variables');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is not configured with an API key' }) };
  }

  console.log('Calling Anthropic API for module:', mod);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: PROMPTS[mod](input.trim().slice(0, 500)) }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API returned an error, status:', response.status, 'body:', errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Upstream API error', detail: errText }) };
    }

    const data = await response.json();
    const rawText = (data.content && data.content[0] && data.content[0].text) || '[]';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    // Validate it's actually parseable JSON before sending to the client
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Model returned unparseable output' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    console.error('Unexpected error in generate function:', err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
