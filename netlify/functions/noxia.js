exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const { prompt } = JSON.parse(event.body || "{}");
    if (!prompt) {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta el prompt" }) };
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar GEMINI_API_KEY en Netlify" }) };
    }
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    let data;
    try { data = await r.json(); } catch (e2) { data = {} }
    if (!r.ok) {
      const msg = (data && data.error && (data.error.message || JSON.stringify(data.error))) || ("Gemini respondió " + r.status + " (modelo saturado, intenta de nuevo en unos segundos)");
      return { statusCode: r.status, body: JSON.stringify({ error: msg }) };
    }
    const text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || [])
      .map(p => p.text || "").join("");
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
