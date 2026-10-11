const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

exports.handler = async function (event) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar GEMINI_API_KEY en Netlify" }) };
  }

  // Abrir /.netlify/functions/noxia en el navegador muestra los modelos disponibles para tu clave
  if (event.httpMethod === "GET") {
    try {
      const r = await fetch(BASE + "?pageSize=100&key=" + apiKey);
      const d = await r.json().catch(() => ({}));
      const models = (d.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => m.name.replace("models/", ""));
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: r.status, modelos_disponibles: models, detalle: models.length ? undefined : d })
      };
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
    }
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { prompt } = JSON.parse(event.body || "{}");
    if (!prompt) {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta el prompt" }) };
    }

    // El modelo se puede cambiar desde Netlify (variable GEMINI_MODEL) sin tocar el código
    const primary = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const candidates = [primary, "gemini-flash-latest"].filter((m, i, a) => a.indexOf(m) === i);

    let lastStatus = 500, lastMsg = "Sin respuesta de Gemini";
    for (const model of candidates) {
      try {
        const r = await fetch(BASE + "/" + model + ":generateContent?key=" + apiKey, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          }),
          signal: AbortSignal.timeout(4500)
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
          const text = parts.map(p => p.text || "").join("");
          return {
            statusCode: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text, model })
          };
        }
        lastStatus = r.status;
        lastMsg = (data.error && data.error.message) || ("Gemini respondió " + r.status);
        if (r.status !== 503 && r.status !== 429 && r.status !== 404) break;
      } catch (e) {
        lastStatus = 504;
        lastMsg = "Gemini tardó demasiado en responder (" + model + ")";
      }
    }
    return { statusCode: lastStatus, body: JSON.stringify({ error: lastMsg }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
