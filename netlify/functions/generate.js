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

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const { module: mod, input } = body;

  if (!mod || !PROMPTS[mod]) {
    return new Response(JSON.stringify({ error: 'Unknown module' }), { status: 400 });
  }
  if (!input || typeof input !== 'string' || !input.trim()) {
    return new Response(JSON.stringify({ error: 'Input is required' }), { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server is not configured with an API key' }), { status: 500 });
  }

  try {
    const response = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/messages`, {
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
      return new Response(JSON.stringify({ error: 'Upstream API error', detail: errText }), { status: 502 });
    }

    const data = await response.json();
    const rawText = (data.content && data.content[0] && data.content[0].text) || '[]';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    // Validate it's actually parseable JSON before sending to the client
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Model returned unparseable output' }), { status: 502 });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
