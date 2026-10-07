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
    const models = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.8-flash"];
    let r, data;
    for (let attempt = 0; attempt < 6; attempt++) {
      const model = models[attempt % models.length];
      r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      data = await r.json();
      if (r.ok) break;
      if (r.status !== 503 && r.status !== 429) break;
      await new Promise(res => setTimeout(res, 700));
    }
    if (!r.ok) {
      return { statusCode: r.status, body: JSON.stringify({ error: data }) };
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
