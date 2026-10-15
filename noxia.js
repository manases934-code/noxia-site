const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function callModel(model, apiKey, prompt, image) {
  const r = await fetch(BASE + "/" + model + ":generateContent?key=" + apiKey, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }].concat(image ? [{ inlineData: { mimeType: "image/jpeg", data: image } }] : []) }],
      generationConfig: { responseMimeType: "application/json" }
    }),
    signal: AbortSignal.timeout(9000)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((data.error && data.error.message) || ("HTTP " + r.status));
    err.status = r.status;
    err.model = model;
    throw err;
  }
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.map(p => p.text || "").join("");
  if (!text) {
    const err = new Error("respuesta vacía");
    err.model = model;
    throw err;
  }
  return { text, model };
}

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
        body: JSON.stringify({
          status: r.status,
          modelo_configurado: process.env.GEMINI_MODEL || null,
          modelos_disponibles: models
        })
      };
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
    }
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let prompt, image;
  try {
    const b = JSON.parse(event.body || "{}");
    prompt = b.prompt;
    image = typeof b.image === "string" && b.image.length < 4000000 ? b.image : null;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Solicitud inválida" }) };
  }
  if (!prompt) {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta el prompt" }) };
  }

  // Se prueban varios modelos a la vez y gana el primero que responda
  const candidates = [
    process.env.GEMINI_MODEL,
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash"
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  try {
    const out = await Promise.any(candidates.map(m => callModel(m, apiKey, prompt, image)));
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: out.text, model: out.model })
    };
  } catch (agg) {
    const detalle = (agg.errors || [agg])
      .map(e => (e.model || "?") + ": " + (e.status ? e.status + " " : "") + (e.message || "error"))
      .join(" | ");
    return { statusCode: 503, body: JSON.stringify({ error: detalle }) };
  }
};
