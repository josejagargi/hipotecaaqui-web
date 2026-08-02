const nodemailer = require('nodemailer');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

/**
 * Netlify Function to send the Abreviated Viability Report to a client.
 * Sender: gerente@hipotecaaqui.com
 * Triggerable via HTTP POST or Airtable Webhook.
 * 
 * Expected Payload (JSON):
 * {
 *   "studyId": "recXXXXXXXXXXXXXX",      // Airtable Hipoteca record ID
 *   "recipientEmail": "client@email.com", // Optional override email
 *   "customNote": "Opcional nota personalizada del asesor"
 * }
 */

exports.handler = async function(event, context) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    let payload = {};
    try {
        if (event.body) {
            payload = JSON.parse(event.body);
        }
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Payload JSON no válido' }) };
    }

    const studyId = payload.studyId || payload.recordId || (payload.record && payload.record.id);
    if (!studyId) {
        return { 
            statusCode: 400, 
            headers, 
            body: JSON.stringify({ error: 'Falta el parámetro studyId o recordId en la solicitud.' }) 
        };
    }

    const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
    const BASE_ID = process.env.AIRTABLE_BASE_ID;
    const BREVO_USER = process.env.BREVO_SMTP_USER;
    const BREVO_PASS = process.env.BREVO_SMTP_PASS;

    if (!AIRTABLE_PAT || !BASE_ID) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta configuración de Airtable' }) };
    }

    if (!BREVO_USER || !BREVO_PASS) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta configuración del servidor SMTP (Brevo)' }) };
    }

    try {
        // ── 1. Fetch study record from Airtable ───────────────────────────────
        const recordRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Hipoteca/${studyId}`, {
            headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
        });

        if (!recordRes.ok) {
            const errText = await recordRes.text();
            return { statusCode: recordRes.status, headers, body: JSON.stringify({ error: 'No se pudo obtener el estudio de Airtable', details: errText }) };
        }

        const record = await recordRes.json();
        const f = record.fields || {};

        // Extract contact info
        const rawName = f['Nombre y apellidos (from Ficha cliente)'] || f['Nombre contacto'] || f['Nombre'] || 'Cliente';
        const contactName = Array.isArray(rawName) ? rawName[0] : rawName;
        
        const rawEmail = payload.recipientEmail || f['email contacto'] || f['Email'] || f['Email cliente'];
        const targetEmail = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail;

        if (!targetEmail) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: `El estudio ${studyId} no tiene un email de cliente asociado.` }) };
        }

        const createdDate = record.createdTime ? new Date(record.createdTime).toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES');
        const viability = f['Viabilidad'] || 'Pendiente';

        // Helper formatters
        const formatPercent = (val) => {
            if (val === undefined || val === null || isNaN(val)) return 'N/D';
            const num = parseFloat(val);
            const finalVal = num <= 1 ? num * 100 : num;
            return `${finalVal.toFixed(0)}%`;
        };

        const formatCurrencyLocal = (val) => {
            if (val === undefined || val === null || isNaN(val)) return 'N/D';
            return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);
        };

        const formatCurrencyArrayOrValue = (val) => {
            const value = Array.isArray(val) ? val[0] : val;
            return formatCurrencyLocal(value);
        };

        const getSemaforoColor = (val) => {
            if (!val) return '#94a3b8';
            const str = String(val).toLowerCase();
            if (str.includes('verde') || str.includes('green') || str.includes('🟢')) return '#10b981';
            if (str.includes('amarillo') || str.includes('yellow') || str.includes('🟡')) return '#f59e0b';
            if (str.includes('rojo') || str.includes('red') || str.includes('🔴')) return '#ef4444';
            return '#94a3b8';
        };

        const getSemaforoText = (val) => {
            if (!val) return 'Sin datos';
            return String(val).replace(/[🟢🟡🔴\s]+/g, '').trim();
        };

        const getViabilityBadge = (viableVal) => {
            let viableColorClass = 'badge-pending';
            let viableText = 'No analizado';
            if (viableVal) {
                const str = String(viableVal).toLowerCase();
                if (str.includes('no viable') || str.includes('no_viable') || str.includes('🔴')) {
                    viableColorClass = 'badge-no-viable';
                    viableText = 'No Viable';
                } else if (str.includes('viable') || str.includes('🟢')) {
                    viableColorClass = 'badge-viable';
                    viableText = 'Viable';
                } else {
                    viableText = viableVal;
                }
            }
            return `<span class="badge ${viableColorClass}">${viableText}</span>`;
        };

        const getConditionalAdvisorNotes = (viableVal) => {
            if (payload.customNote) return payload.customNote;
            const str = String(viableVal || '').toLowerCase();
            if (str.includes('no viable') || str.includes('no_viable') || str.includes('🔴')) {
                return `Estimado/a <strong>${contactName}</strong>, tras evaluar detenidamente los datos de tu solicitud, la operación en las condiciones actuales presenta un riesgo elevado o requiere realizar ajustes en la aportación inicial de ahorros o el precio del inmueble para su aprobación bancaria. Tu asesor asignado de <strong>Hipoteca Aquí</strong> contactará contigo para estudiar alternativas de financiación.`;
            } else if (str.includes('viable') || str.includes('🟢')) {
                return `Estimado/a <strong>${contactName}</strong>, nos complace informarte de que tu estudio de financiación es <strong>VIABLE</strong>. Tu perfil reúne los requisitos idóneos para acceder a las mejores condiciones hipotecarias del mercado. Un asesor especialista de <strong>Hipoteca Aquí</strong> se pondrá en contacto contigo para coordinar la presentación de ofertas formales.`;
            } else {
                return `Estimado/a <strong>${contactName}</strong>, tu estudio de viabilidad se encuentra en fase de análisis detallado. Requiere revisar aspectos concretos (como documentación complementaria o detalle de garantías) para optimizar la respuesta bancaria. Un asesor especialista de <strong>Hipoteca Aquí</strong> te guiará en los siguientes pasos.`;
            }
        };

        // ── 2. Build Abreviated HTML Viability Report Document ────────────────
        const logoUrl = 'https://hipotecaaqui.com/logo-transparente.png';

        const reportHtmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Informe de Viabilidad Hipotecaria - ${contactName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; color: #1e293b; margin: 0; padding: 1.2cm 1.5cm; line-height: 1.4; background-color: #fff; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.8rem; margin-bottom: 1.2rem; gap: 1rem; }
        .logo-container { display: flex; align-items: center; flex-shrink: 0; }
        .logo-container img { height: 44px; max-width: 220px; object-fit: contain; }
        .header-title { text-align: right; flex-grow: 1; }
        .header-title h1 { margin: 0; font-size: 1.35rem; font-weight: 800; color: #33475b; }
        .header-title p { margin: 0.15rem 0 0 0; font-size: 0.82rem; color: #64748b; }
        .section { margin-bottom: 1.5rem; page-break-inside: avoid; }
        .section-title { font-size: 1.05rem; font-weight: 800; color: #33475b; border-bottom: 2px solid #ff5a5f; padding-bottom: 0.35rem; margin-bottom: 0.8rem; letter-spacing: 0.5px; }
        .summary-row-grid { background: #f8fafc; border: 1px solid #cbd5e1; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 0.8rem; display: grid; grid-template-columns: min-content min-content min-content 1fr 1fr 1.3fr; gap: 0.8rem; align-items: center; }
        .summary-col { padding: 0 0.2rem; }
        .summary-col:not(:first-child) { border-left: 1px solid #e2e8f0; padding-left: 0.7rem; }
        .summary-label { font-size: 0.68rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; display: block; margin-bottom: 0.2rem; white-space: nowrap; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.6rem; }
        .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 0.9rem; }
        .card-title { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 0.2rem; }
        .card-value { font-size: 1.05rem; font-weight: 800; color: #0f172a; }
        .badge { display: inline-flex; align-items: center; padding: 0.25rem 0.7rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; }
        .badge-viable { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .badge-no-viable { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
        .badge-pending { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
        .progress-bar-container { width: 100%; height: 5px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-top: 0.3rem; }
        .progress-bar { height: 100%; border-radius: 4px; }
        .semaforos-container { display: flex; flex-direction: column; gap: 0.25rem; }
        .semaforo-item { display: flex; align-items: center; gap: 0.35rem; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
        .semaforo-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.7rem 0.9rem; }
        .info-item { font-size: 0.8rem; display: flex; justify-content: space-between; padding: 0.15rem 0; border-bottom: 1px dashed #e2e8f0; }
        .info-item:last-child { border-bottom: none; }
        .info-label { color: #64748b; font-weight: 600; }
        .info-value { font-weight: 700; color: #0f172a; }
        .footer-note { text-align: center; font-size: 0.72rem; color: #94a3b8; margin-top: 2rem; border-top: 1px solid #e2e8f0; padding-top: 0.7rem; page-break-inside: avoid; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-container">
            <img src="${logoUrl}" alt="Hipoteca Aquí">
        </div>
        <div class="header-title">
            <h1>Informe de Viabilidad Hipotecaria (Abreviado)</h1>
            <p>Cliente: <strong>${contactName}</strong> | Fecha: ${createdDate}</p>
        </div>
    </div>

    <!-- 1. Resultado de Viabilidad y Cuotas -->
    <div class="section">
        <div class="section-title">1. Resultado de Viabilidad y Cuotas</div>
        <div class="summary-row-grid">
            <div class="summary-col">
                <span class="summary-label">Resultado Análisis</span>
                ${getViabilityBadge(f['Viabilidad'])}
            </div>
            <div class="summary-col">
                <span class="summary-label">Estabilidad Laboral</span>
                <span style="font-weight: 800; font-size: 0.92rem; color: #33475b;">${f['Estabilidad conjunta'] || 'N/D'}</span>
            </div>
            <div class="summary-col">
                <span class="summary-label">Ahorros Disponibles</span>
                <span style="font-weight: 800; font-size: 0.92rem; color: #33475b;">${formatCurrencyLocal(f['Ahorros'])}</span>
            </div>
            <div class="summary-col">
                <span class="summary-label">Esfuerzo Mensual</span>
                <span style="font-weight: 800; font-size: 0.92rem; color: #0f172a;">${formatPercent(f['Esfuerzo mensual'])}</span>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${Math.min(parseFloat(f['Esfuerzo mensual'] || 0) * (parseFloat(f['Esfuerzo mensual']) <= 1 ? 100 : 1), 100)}%; background: ${parseFloat(f['Esfuerzo mensual'] || 0) > 0.4 ? '#ef4444' : '#10b981'};"></div>
                </div>
            </div>
            <div class="summary-col">
                <span class="summary-label">% Financiación</span>
                <span style="font-weight: 800; font-size: 0.92rem; color: #0f172a;">${formatPercent(f['% a financiar'])}</span>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${Math.min(parseFloat(f['% a financiar'] || 0) * (parseFloat(f['% a financiar']) <= 1 ? 100 : 1), 100)}%; background: #33475b;"></div>
                </div>
            </div>
            <div class="summary-col">
                <span class="summary-label">Semáforos de Riesgo</span>
                <div class="semaforos-container">
                    <div class="semaforo-item">
                        <div class="semaforo-dot" style="background: ${getSemaforoColor(f['SemaforoEstabilidad'])}"></div>
                        <span>Estabilidad: ${getSemaforoText(f['SemaforoEstabilidad'])}</span>
                    </div>
                    <div class="semaforo-item">
                        <div class="semaforo-dot" style="background: ${getSemaforoColor(f['SemaforoEsfuerzo'])}"></div>
                        <span>Esfuerzo: ${getSemaforoText(f['SemaforoEsfuerzo'])}</span>
                    </div>
                    <div class="semaforo-item">
                        <div class="semaforo-dot" style="background: ${getSemaforoColor(f['Semafor20masgatos'])}"></div>
                        <span>Aportación (20%+Gastos): ${getSemaforoText(f['Semafor20masgatos'])}</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="grid-5">
            <div class="card">
                <div class="card-title">Cuota Scoring</div>
                <div class="card-value">${formatCurrencyLocal(f['Cuota scoring'])}</div>
            </div>
            <div class="card">
                <div class="card-title">Cuota Máx. Endeudamiento</div>
                <div class="card-value">${formatCurrencyLocal(f['Cuota maxima endeudamiento'])}</div>
            </div>
            <div class="card" style="border-left: 4px solid #33475b;">
                <div class="card-title">Mejor Cuota Fija</div>
                <div class="card-value" style="color: #33475b;">${formatCurrencyArrayOrValue(f['Mejor cuota Fija'])}</div>
            </div>
            <div class="card" style="border-left: 4px solid #f59e0b;">
                <div class="card-title">Mejor Cuota Mixta</div>
                <div class="card-value" style="color: #f59e0b;">${formatCurrencyArrayOrValue(f['Mejor cuota Mixta'])}</div>
            </div>
            <div class="card" style="border-left: 4px solid #10b981;">
                <div class="card-title">Mejor Cuota Variable</div>
                <div class="card-value" style="color: #10b981;">${formatCurrencyArrayOrValue(f['Mejor cuota Variable'])}</div>
            </div>
        </div>
    </div>

    <!-- 2. Condiciones Declaradas por el Cliente -->
    <div class="section">
        <div class="section-title">2. Condiciones Declaradas por el Cliente</div>
        <div class="grid-2">
            <div>
                <h4 style="margin: 0 0 0.4rem 0; font-size: 0.85rem; color: #33475b; text-transform: uppercase;">Titular 1</h4>
                <div class="info-grid" style="margin-bottom: 0.8rem;">
                    <div class="info-item"><span class="info-label">Edad:</span><span class="info-value">${f['Edad sim'] ? f['Edad sim'] + ' años' : 'N/D'}</span></div>
                    <div class="info-item"><span class="info-label">Tipo de trabajo:</span><span class="info-value">${f['Tipo trabajo sim'] || 'N/D'}</span></div>
                    <div class="info-item"><span class="info-label">Antigüedad laboral:</span><span class="info-value">${f['Antiguedad sim'] ? f['Antiguedad sim'] + ' años' : 'N/D'}</span></div>
                    <div class="info-item"><span class="info-label">Ingresos mensuales:</span><span class="info-value">${formatCurrencyLocal(f['Ingresos titular 1'])}</span></div>
                    <div class="info-item"><span class="info-label">Nº de pagas:</span><span class="info-value">${f['Num pagas T1'] || 'N/D'}</span></div>
                </div>

                ${f['Ingresos titular 2'] || f['Tipo trabajo T2'] ? `
                <h4 style="margin: 0 0 0.4rem 0; font-size: 0.85rem; color: #33475b; text-transform: uppercase;">Titular 2</h4>
                <div class="info-grid">
                    <div class="info-item"><span class="info-label">Tipo de trabajo:</span><span class="info-value">${f['Tipo trabajo T2'] || 'N/D'}</span></div>
                    <div class="info-item"><span class="info-label">Antigüedad laboral:</span><span class="info-value">${f['Antiguedad T2'] ? f['Antiguedad T2'] + ' años' : 'N/D'}</span></div>
                    <div class="info-item"><span class="info-label">Ingresos mensuales:</span><span class="info-value">${formatCurrencyLocal(f['Ingresos titular 2'])}</span></div>
                    <div class="info-item"><span class="info-label">Nº de pagas:</span><span class="info-value">${f['Num pagas T2'] || 'N/D'}</span></div>
                </div>
                ` : `
                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 0.8rem; text-align: center; font-size: 0.8rem; color: #64748b; font-weight: 500;">
                    Sin Segundo Titular declarado
                </div>
                `}
            </div>

            <div>
                <h4 style="margin: 0 0 0.4rem 0; font-size: 0.85rem; color: #33475b; text-transform: uppercase;">Finanzas y Operación</h4>
                <div class="info-grid" style="margin-bottom: 0.8rem;">
                    <div class="info-item"><span class="info-label">Ahorros disponibles:</span><span class="info-value">${formatCurrencyLocal(f['Ahorros'])}</span></div>
                    <div class="info-item"><span class="info-label">Otros préstamos:</span><span class="info-value">${formatCurrencyLocal(f['Otros prestamos mensuales'])}</span></div>
                    <div class="info-item"><span class="info-label">Capital pendiente dev.:</span><span class="info-value">${formatCurrencyLocal(f['Capital pendiente'])}</span></div>
                    <div class="info-item"><span class="info-label">Plazo solicitado:</span><span class="info-value">${f['Años hipoteca'] ? f['Años hipoteca'] + ' años' : 'N/D'}</span></div>
                </div>

                <h4 style="margin: 0 0 0.4rem 0; font-size: 0.85rem; color: #33475b; text-transform: uppercase;">Propiedad</h4>
                <div class="info-grid">
                    <div class="info-item"><span class="info-label">Precio del inmueble:</span><span class="info-value">${formatCurrencyLocal(f['Precio del inmueble'])}</span></div>
                    <div class="info-item"><span class="info-label">Finalidad:</span><span class="info-value">${f['Finalidad'] || 'N/D'}</span></div>
                    <div class="info-item"><span class="info-label">Tipo de vivienda:</span><span class="info-value">${f['Tipo vivienda'] || 'N/D'}</span></div>
                    <div class="info-item"><span class="info-label">Ubicación:</span><span class="info-value">${[f['Localidad inmueble'], f['Provincia']].filter(Boolean).join(', ') || 'N/D'}</span></div>
                </div>
            </div>
        </div>
    </div>

    <!-- 3. Observaciones y Recomendaciones del Asesor -->
    <div class="section">
        <div class="section-title">3. Observaciones y Recomendaciones del Asesor</div>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #ff5a5f; border-radius: 8px; padding: 1.2rem; font-size: 0.9rem; line-height: 1.5; color: #33475b;">
            ${getConditionalAdvisorNotes(viability)}
        </div>
    </div>

    <div class="footer-note">
        <p>Este informe de viabilidad tiene carácter meramente informativo y está condicionado a la verificación real de la documentación aportada. Hipoteca Aquí no se responsabiliza de los cambios de condiciones que las entidades financieras puedan realizar en sus productos.</p>
        <p>&copy; ${new Date().getFullYear()} Hipoteca Aquí. Todos los derechos reservados.</p>
    </div>
</body>
</html>`;

        // ── 3. Render PDF Buffer with Puppeteer Chromium ────────────────────
        let pdfBuffer = null;
        try {
            const executablePath = await chromium.executablePath();
            const browser = await puppeteer.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: executablePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                headless: chromium.headless
            });
            const page = await browser.newPage();
            await page.setContent(reportHtmlContent, { waitUntil: 'networkidle0' });
            pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }
            });
            await browser.close();
            console.log('[DEBUG] PDF generated successfully with Puppeteer');
        } catch (pdfErr) {
            console.warn('[WARN] Puppeteer PDF rendering fallback:', pdfErr.message);
        }

        // ── 4. Build HTML Email Body ──────────────────────────────────────────
        const emailBodyHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #f4f7f9; color: #33475b; margin: 0; padding: 20px; }
        .email-card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .email-header { background: #33475b; padding: 25px; text-align: center; }
        .email-header img { height: 42px; }
        .email-body { padding: 30px; line-height: 1.6; font-size: 15px; }
        .result-box { background: #f8fafc; border-left: 4px solid #ff5a5f; padding: 15px 20px; border-radius: 6px; margin: 20px 0; }
        .btn-cta { display: inline-block; background: linear-gradient(135deg, #ff5a5f 0%, #e04a4f 100%); color: #ffffff !important; text-decoration: none; padding: 12px 26px; border-radius: 8px; font-weight: bold; font-size: 15px; margin-top: 15px; box-shadow: 0 4px 12px rgba(255,90,95,0.3); }
        .email-footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
    </style>
</head>
<body>
    <div class="email-card">
        <div class="email-header">
            <img src="${logoUrl}" alt="Hipoteca Aquí">
        </div>
        <div class="email-body">
            <h2 style="color: #33475b; margin-top: 0;">Informe de Viabilidad Hipotecaria</h2>
            <p>Hola <strong>${contactName}</strong>,</p>
            <p>Hemos completado la evaluación de tu solicitud de estudio financiero en <strong>Hipoteca Aquí</strong>.</p>

            <div class="result-box">
                ${getConditionalAdvisorNotes(viability)}
            </div>

            <p>Te adjuntamos en este correo tu <strong>Informe de Viabilidad Hipotecaria</strong> oficial adjunto para que puedas revisar cómodamente todas tus métricas y cuotas estimadas.</p>

            <div style="text-align: center; margin: 25px 0;">
                <a href="https://hipotecaaqui.com/portal.html" class="btn-cta">Acceder a tu Panel de Cliente</a>
            </div>

            <p style="margin-bottom: 0;">Atentamente,<br>
            <strong>Dirección de Gerencia</strong><br>
            <span style="color: #64748b; font-size: 13px;">Hipoteca Aquí - Estudio de Financiación</span></p>
        </div>
        <div class="email-footer">
            <p>&copy; ${new Date().getFullYear()} Hipoteca Aquí. Todos los derechos reservados.<br>
            Este correo es confidencial y dirigido exclusivamente a su destinatario.</p>
        </div>
    </div>
</body>
</html>`;

        // ── 5. Transporter setup & Email dispatch ──────────────────────────────
        const transporter = nodemailer.createTransport({
            host: 'smtp-relay.brevo.com',
            port: 587,
            secure: false,
            auth: {
                user: BREVO_USER,
                pass: BREVO_PASS
            }
        });

        const safeFileName = contactName.replace(/[^a-zA-Z0-9]/g, '_');
        const attachmentObj = pdfBuffer ? {
            filename: `Informe_Viabilidad_Hipotecaria_${safeFileName}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
        } : {
            filename: `Informe_Viabilidad_Hipotecaria_${safeFileName}.html`,
            content: Buffer.from(reportHtmlContent, 'utf-8'),
            contentType: 'text/html'
        };

        const mailOptions = {
            from: '"Hipoteca Aquí - Gerencia" <gerente@hipotecaaqui.com>',
            to: targetEmail,
            subject: `Informe de Viabilidad Hipotecaria - ${contactName}`,
            html: emailBodyHtml,
            attachments: [attachmentObj]
        };

        const mailResult = await transporter.sendMail(mailOptions);
        console.log(`[DEBUG] Email sent successfully to ${targetEmail} from gerente@hipotecaaqui.com. ID: ${mailResult.messageId}`);

        // ── 6. Update Airtable record status ──────────────────────────────────
        try {
            await fetch(`https://api.airtable.com/v0/${BASE_ID}/Hipoteca/${studyId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_PAT}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fields: {
                        'Estado envio informe': 'Enviado por Email'
                    }
                })
            });
        } catch (updateErr) {
            console.warn('[DEBUG] Non-critical warning updating Airtable status field:', updateErr.message);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: `Informe de Viabilidad enviado con éxito desde gerente@hipotecaaqui.com a ${targetEmail}`,
                studyId,
                contactName,
                recipientEmail: targetEmail,
                messageId: mailResult.messageId
            })
        };

    } catch (err) {
        console.error('[ERROR] Failure in send-viability-report function:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Error procesando y enviando el informe de viabilidad', details: err.message })
        };
    }
};
