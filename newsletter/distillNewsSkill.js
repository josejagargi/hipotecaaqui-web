require('dotenv').config();
const fetch = require('node-fetch');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CRM_BASE_ID = process.env.CRM_BASE_ID || 'appdpPB3CK0d5R2oI';
const CRM_TOKEN = process.env.CRM_TOKEN || 'patapt61z0HwTUIDH.655a5a30d9af22ff222bfb5b53b427613dce343bff42e188665f34e8d5ff5171';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CANALES_TABLE = 'Canales';
const CONTENT_TABLE = 'Content';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Helper to call Airtable API */
async function airtableRequest({ baseId, table, method = 'GET', query = '', body = null }) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${query}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${CRM_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(url, options);
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Airtable request failed ${resp.status}: ${txt}`);
  }
  return resp.json();
}

/** Check if a URL already exists in the Content table */
async function checkIfUrlExists(url) {
  const formula = `{URL} = '${url.replace(/'/g, "\\'")}'`;
  const query = `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const data = await airtableRequest({ baseId: CRM_BASE_ID, table: CONTENT_TABLE, query });
  return data.records.length > 0;
}

/** Add a record to Content table */
async function addContentRecord({ titulo, url, duracion, detalles, channelId }) {
  const today = new Date().toISOString().split('T')[0];
  const fields = {
    Titulo: titulo,
    URL: url,
    Detalles: detalles,
    Fecha: today,
  };
  if (duracion !== undefined && duracion !== null) {
    fields.Duracion = duracion;
  }
  if (channelId) {
    fields.Canales = [channelId];
  }
  
  await airtableRequest({
    baseId: CRM_BASE_ID,
    table: CONTENT_TABLE,
    method: 'POST',
    body: { records: [{ fields }] }
  });
}

/** Get active channels from view "Distill news" */
async function getActiveChannels() {
  const query = `?view=${encodeURIComponent('Distill news')}`;
  const data = await airtableRequest({ baseId: CRM_BASE_ID, table: CANALES_TABLE, query });
  return data.records;
}

/** Clean HTML to text */
function cleanHtmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fetch video watch page to parse video duration */
async function fetchVideoDuration(videoUrl) {
  try {
    const res = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    const durationMatch = html.match(/itemprop="duration"\s+content="([^"]+)"/) || html.match(/"approxDurationMs":"([^"]+)"/);
    if (durationMatch) {
      const durationVal = durationMatch[1];
      if (durationVal.startsWith('PT')) {
        return parseISO8601DurationToSeconds(durationVal);
      } else {
        // approxDurationMs
        return Math.round(parseInt(durationVal, 10) / 1000);
      }
    }
  } catch (err) {
    console.error(`Error fetching video duration for ${videoUrl}:`, err.message);
  }
  return null;
}

/** Convert ISO 8601 duration string (e.g., PT10M52S) to seconds */
function parseISO8601DurationToSeconds(durationStr) {
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/** Call Gemini API to distill content */
async function distillWithGemini(promptText) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not defined");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: promptText }]
      }],
      generationConfig: {
        temperature: 0.2
      }
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API failed with status ${response.status}: ${errText}`);
  }
  const data = await response.json();
  try {
    return data.candidates[0].content.parts[0].text;
  } catch (e) {
    throw new Error(`Failed to parse Gemini response: ${JSON.stringify(data)}`);
  }
}

/** Scrape channel RSS feed from YouTube channel handle */
async function getChannelRssUrl(channelUrl) {
  console.log(`Scraping channel page to find RSS URL: ${channelUrl}`);
  const res = await fetch(channelUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    }
  });
  const html = await res.text();
  const feedMatch = html.match(/href="([^"]+feeds\/videos\.xml\?channel_id=[^"]+)"/) || html.match(/channel_id=([^"&]+)/);
  if (feedMatch) {
    if (feedMatch[1].startsWith('http')) {
      return feedMatch[1];
    } else {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${feedMatch[1]}`;
    }
  }
  // Try to find raw UC channel ID fallback
  const ucMatch = html.match(/"(UC[A-Za-z0-9_-]{22})"/);
  if (ucMatch) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${ucMatch[1]}`;
  }
  throw new Error(`Could not locate YouTube RSS feed URL or Channel ID in HTML for ${channelUrl}`);
}

/** Parse XML entries using Regex */
function parseRssXmlEntries(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    
    const idMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
    const linkMatch = entryXml.match(/<link[^>]+href="([^"]+)"/);
    const descMatch = entryXml.match(/<media:description>([\s\S]*?)<\/media:description>/);
    const pubMatch = entryXml.match(/<published>([^<]+)<\/published>/);
    
    if (idMatch && titleMatch && linkMatch) {
      entries.push({
        videoId: idMatch[1],
        title: titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
        url: linkMatch[1],
        description: descMatch ? descMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : '',
        published: new Date(pubMatch ? pubMatch[1] : Date.now())
      });
    }
  }
  return entries;
}

/** Fetch real news from Google News RSS */
async function fetchRealGoogleNews() {
  try {
    const query = encodeURIComponent('inmobiliario OR hipotecas España when:3d');
    const url = `https://news.google.com/rss/search?q=${query}&hl=es&gl=ES&ceid=ES:es`;
    console.log(`Fetching real news from Google News RSS: ${url}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      console.error(`Failed to fetch RSS: ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      const titleMatch = itemXml.match(/<title>([^<]+)<\/title>/);
      const linkMatch = itemXml.match(/<link>([^<]+)<\/link>/);
      const sourceMatch = itemXml.match(/<source[^>]*>([^<]+)<\/source>/);
      if (titleMatch) {
        items.push({
          title: titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
          link: linkMatch ? linkMatch[1] : '',
          source: sourceMatch ? sourceMatch[1] : ''
        });
      }
    }
    return items.slice(0, 12);
  } catch (err) {
    console.error("Error fetching Google News RSS:", err.message);
    return [];
  }
}

/** Main Skill runner */
async function runNewsDistillation({ forceDate = null } = {}) {
  try {
    const today = forceDate ? new Date(forceDate) : new Date();
    const dayOfMonth = today.getDate();
    console.log(`Starting news distillation execution for date: ${today.toISOString().split('T')[0]} (Day of month: ${dayOfMonth})`);
    
    // Determine allowed frequencies
    const allowedFrequencies = ['Diaria'];
    if (dayOfMonth === 10) {
      allowedFrequencies.push('Mensual');
      console.log("Today is the 10th! Mensual frequency channels will also be distilled.");
    } else {
      console.log("Today is not the 10th. Only Diaria frequency channels will be distilled.");
    }

    // 1. Fetch active channels
    const channels = await getActiveChannels();
    console.log(`Found ${channels.length} channels configured in view 'Distill news'.`);

    // 2. Filter channels in memory based on frequency
    const filteredChannels = channels.filter(c => {
      const freq = c.fields.Frecuencia;
      return allowedFrequencies.includes(freq);
    });
    console.log(`Processing ${filteredChannels.length} channels matching allowed frequencies [${allowedFrequencies.join(', ')}].`);

    let importedCount = 0;

    for (const channel of filteredChannels) {
      const name = channel.fields.Name;
      const url = channel.fields.URL;
      const red = channel.fields.Red ? channel.fields.Red.toLowerCase() : '';
      const freq = channel.fields.Frecuencia;

      console.log(`\n--- Processing Channel: ${name} (${red}, Freq: ${freq}, URL: ${url}) ---`);

      try {
        if (red === 'youtube' || url.includes('youtube.com')) {
          // Process YouTube channel
          const rssUrl = await getChannelRssUrl(url);
          console.log(`Found RSS Feed URL: ${rssUrl}`);
          
          const rssRes = await fetch(rssUrl);
          if (!rssRes.ok) {
            console.error(`Failed to fetch RSS XML: ${rssRes.status}`);
            continue;
          }
          const xml = await rssRes.ok ? await rssRes.text() : '';
          const entries = parseRssXmlEntries(xml);
          console.log(`Parsed ${entries.length} videos from the RSS feed.`);

          // Filter videos from the last 48 hours to avoid older videos
          const limitDate = new Date(today.getTime() - 48 * 60 * 60 * 1000);
          const recentVideos = entries.filter(e => e.published >= limitDate);
          console.log(`Found ${recentVideos.length} recent videos in the last 48 hours.`);

          // If no videos in the last 48 hours, process at least the absolute latest video
          const videosToProcess = recentVideos.length > 0 ? recentVideos : (entries.length > 0 ? [entries[0]] : []);
          console.log(`Selected ${videosToProcess.length} video(s) for processing/duplicate check.`);

          for (const video of videosToProcess) {
            console.log(`Checking video: "${video.title}" (URL: ${video.url})`);
            const exists = await checkIfUrlExists(video.url);
            if (exists) {
              console.log(`Video already exists in Content. Skipping.`);
              continue;
            }

            console.log(`Video is new! Initiating distillation...`);
            
            // 1. Fetch duration
            const duration = await fetchVideoDuration(video.url);
            console.log(`Scraped duration: ${duration} seconds`);

            // 2. Distill with Gemini
            const prompt = `Eres un analista de noticias financiero e inmobiliario experto de 'Hipoteca Aquí'. Tu objetivo es resumir y destilar videos de YouTube de manera sumamente profesional, directa, atractiva y con excelente estilo en español.
            
Proporciona una destilación clara, directa y muy estética del contenido utilizando Markdown elegante (negritas, viñetas de lista, secciones bien estructuradas y llamadas de atención sobre datos numéricos importantes).

IMPORTANTE: Comienza la respuesta directamente con el título o resumen estructurado en Markdown, sin ningún saludo, introducción o texto del tipo 'Aquí tienes el resumen' o '¡Excelente!' o '¡Entendido!'. Comienza directamente con el título o resumen del tema.

Detalles del Video:
- Creador/Canal: ${name}
- Título del Video: ${video.title}
- Descripción original del Video:
${video.description}

Genera tu destilación profesional de noticias ahora:`;

            const distilledSummary = await distillWithGemini(prompt);
            console.log("Distillation completed successfully!");

            // 3. Add to Airtable
            await addContentRecord({
              titulo: video.title,
              url: video.url,
              duracion: duration,
              detalles: distilledSummary,
              channelId: channel.id
            });
            console.log("Successfully created record in Content table!");
            importedCount++;
            await sleep(3000); // Prevent hitting rate limits (Airtable: 5 RPS, Gemini: RPM)
          }
        } else {
          // Process WWW web channels (typically Mensual frequency on the 10th)
          console.log(`Processing WWW source: ${url}`);
          const exists = await checkIfUrlExists(url);
          if (exists) {
            console.log(`Web URL already exists in Content. Skipping.`);
            continue;
          }

          console.log(`Scraping WWW content from URL: ${url}`);
          const webRes = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
          });
          if (!webRes.ok) {
            console.error(`Failed to fetch web content: ${webRes.status}`);
            continue;
          }
          const rawHtml = await webRes.text();
          const cleanText = cleanHtmlToText(rawHtml).substring(0, 15000); // limit to first 15k characters
          console.log(`Extracted text from page (Length: ${cleanText.length} characters)`);

          console.log("Initiating Gemini distillation for WWW content...");
          const prompt = `Eres un analista experto de noticias y estudios económicos/inmobiliarios de 'Hipoteca Aquí'. Tu objetivo es analizar el contenido de un sitio web, extraer los datos, noticias, estadísticas o conclusiones económicas e hipotecarias más importantes y recientes, y resumirlas en español.

Proporciona un reporte de destilación de noticias de alto valor, muy estructurado y estético en formato Markdown (títulos, negritas, listas y resaltados sobre datos numéricos importantes).

IMPORTANTE: Comienza la respuesta directamente con el título o resumen estructurado en Markdown, sin ningún saludo, introducción o texto del tipo 'Aquí tienes el resumen' o '¡Excelente!' o '¡Entendido!'. Comienza directamente con el título o resumen del tema.

Sitio Web Origen: ${name} (${url})
Contenido de la página:
${cleanText}

Genera la destilación inmobiliaria/financiera ahora:`;

          const distilledSummary = await distillWithGemini(prompt);
          console.log("Distillation completed successfully!");

          // Add to Airtable (duration undefined for web pages)
          await addContentRecord({
            titulo: `Destilación: ${name}`,
            url: url,
            duracion: null,
            detalles: distilledSummary,
            channelId: channel.id
          });
          console.log("Successfully created record in Content table!");
          importedCount++;
          await sleep(3000); // Prevent hitting rate limits
        }
      } catch (channelErr) {
        console.error(`Error processing channel ${name}:`, channelErr.message);
      }
    }

    // 3. Compile and distill the 5 most relevant real estate and mortgage news of the previous day from real sources
    console.log("\n=== Compiling the 5 most relevant mortgage and real estate news from real sources ===");
    try {
      const realNewsItems = await fetchRealGoogleNews();
      console.log(`Fetched ${realNewsItems.length} real news items from Google News.`);

      if (realNewsItems.length === 0) {
        console.log("No real news fetched. Skipping daily news compilation.");
      } else {
        const newsListText = realNewsItems.map((item, idx) => `${idx + 1}. [${item.source}] ${item.title}\n   URL: ${item.link}`).join('\n');

        const compilePrompt = `Eres un analista experto de 'Hipoteca Aquí'. A continuación tienes una lista de noticias reales y recientes del sector inmobiliario e hipotecario en España obtenidas hoy de medios de comunicación:
        
${newsListText}

Selecciona las 5 noticias más relevantes para un cliente de 'Hipoteca Aquí' (centrándote en euríbor, hipotecas, precios de vivienda, ahorro o mercado inmobiliario en España).
Para cada una de las 5 noticias seleccionadas, proporciona una destilación detallada, profesional y muy estética en Markdown en español, resaltando cifras clave, euríbor o datos del mercado.
IMPORTANTE: Para el campo "url", utiliza EXACTAMENTE la URL original proporcionada en la lista anterior (URL: ...) para la noticia correspondiente.

Proporciona la respuesta estrictamente en el siguiente formato JSON (un array de objetos):
[
  {
    "titulo": "Título de la noticia",
    "url": "URL original de la lista",
    "detalles": "Destilación detallada, profesional y muy estética en Markdown en español de la noticia, resaltando cifras clave, euríbor, tipos de interés o el mercado de vivienda."
  }
]

Devuelve ÚNICAMENTE el JSON válido, sin bloques de código de markdown de tipo \`\`\`json ni texto adicional.`;

        const geminiResponse = await distillWithGemini(compilePrompt);
        const cleanJsonStr = geminiResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const compiledNews = JSON.parse(cleanJsonStr);
        console.log(`Parsed ${compiledNews.length} compiled news articles from Gemini.`);
        
        for (const item of compiledNews.slice(0, 5)) {
          let urlToUse = item.url || '';
          
          console.log(`Checking compiled news article: "${item.titulo}"`);
          const exists = await checkIfUrlExists(urlToUse);
          if (exists) {
            console.log(`News article URL already exists in Content. Skipping.`);
            continue;
          }
          
          console.log(`News article is new! Adding to Content table...`);
          await addContentRecord({
            titulo: item.titulo,
            url: urlToUse,
            duracion: null,
            detalles: item.detalles,
            channelId: null
          });
          console.log("Successfully created record in Content table!");
          importedCount++;
          await sleep(3000);
        }
      }
    } catch (newsErr) {
      console.error("Error compiling and distilling news articles:", newsErr.message);
    }

    console.log(`\n=== News Distillation Completed. Imported/created ${importedCount} records. ===`);
    return { importedCount };
  } catch (err) {
    console.error("News distillation error:", err.message);
    throw err;
  }
}

module.exports = { runNewsDistillation };

