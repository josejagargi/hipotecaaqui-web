let currentRecords = [];
let currentContacts = [];

async function loadDashboardData() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    const recordsBody = document.getElementById('recordsBody');
    const estudiosBody = document.getElementById('estudiosBody');
    const totalRecordsEl = document.getElementById('totalRecords');
    const pendingRecordsEl = document.getElementById('pendingRecords');
    const approvedRecordsEl = document.getElementById('approvedRecords');
    const profileNameEl = document.getElementById('profileName');
    const profileEmailEl = document.getElementById('profileEmail');

    try {
        const token = await user.getIdToken();
        
        const response = await fetch(`/.netlify/functions/get-portal-data?t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        console.log("Dashboard Data Received:", data);

        if (!response.ok) throw new Error(data.error || 'Error al obtener los datos');

        // Retrieve the portal role we requested from localStorage
        const portalRole = localStorage.getItem('portal_role') || 'cliente';
        console.log("Active Portal Role:", portalRole);

        // Security role authorization check
        let isAuthorized = false;
        
        if (data.user.role === 'admin') {
            isAuthorized = true; // Admin has universal access
        } else if (portalRole === 'inmobiliaria') {
            // Associate / franchise partner access check
            if (data.user.existsInFranquiciados === true || data.user.role === 'associate') {
                isAuthorized = true;
            }
        } else {
            // Client portal access check (portalRole === 'cliente')
            if (data.user.existsInContacts === true) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            // If not authorized, show blocking screen overlay
            const blockingOverlay = document.getElementById('blockingOverlay');
            const blockingTitle = document.getElementById('blockingTitle');
            const blockingMessage = document.getElementById('blockingMessage');
            const blockingCta = document.getElementById('blockingCta');

            if (blockingOverlay) {
                blockingOverlay.style.display = 'flex';
                
                if (portalRole === 'inmobiliaria') {
                    blockingTitle.textContent = 'Acceso de Inmobiliaria';
                    blockingMessage.innerHTML = 'Tu correo electrónico <strong>' + data.user.email + '</strong> no está registrado en nuestra base de datos de franquiciados y asociados.<br><br>Si eres un profesional del sector inmobiliario interesado en colaborar con nosotros para obtener hasta el 100% de financiación para tus clientes de forma rápida con IA y recibir comisiones recurrentes, únete ahora.';
                    blockingCta.textContent = 'Ver Ventajas y Registrarse';
                    blockingCta.href = 'asociados-info.html';
                } else {
                    blockingTitle.textContent = 'Portal de Clientes';
                    blockingMessage.innerHTML = '¡Hola! Para acceder a tu área de cliente, primero debes solicitar un estudio de viabilidad hipotecaria.<br><br>No hemos encontrado ningún estudio registrado con tu dirección de correo electrónico <strong>' + data.user.email + '</strong>.<br><br>Solicita tu estudio gratuito en menos de 2 minutos para que podamos analizar tu caso e iniciar tu expediente.';
                    blockingCta.textContent = 'Solicitar Estudio Gratis';
                    blockingCta.href = 'index.html#estudio';
                }
            }
            return; // Halt dashboard rendering!
        }

        // Hide contacts tab link for clients
        const navContactos = document.getElementById('nav-contactos');
        if (navContactos) {
            if (data.user.role === 'client' || portalRole === 'cliente') {
                navContactos.parentElement.style.display = 'none';
            } else {
                navContactos.parentElement.style.display = 'block';
            }
        }
        
        // Update UI
        const displayName = (data.user.name || user.email.split('@')[0]).trim();
        userNameEl.textContent = displayName;
        
        let roleDisplay = 'Cliente';
        if (data.user.role === 'associate') roleDisplay = 'Asociado AKIA';
        if (data.user.role === 'admin') roleDisplay = 'Administrador';
        userRoleEl.textContent = roleDisplay;
        
        document.getElementById('userInitial').textContent = (displayName.charAt(0) || 'U').toUpperCase();

        // Populate profile form
        if (profileNameEl) profileNameEl.value = displayName;
        if (profileEmailEl) profileEmailEl.value = user.email;

        // Stats
        totalRecordsEl.textContent = data.records.length;
        pendingRecordsEl.textContent = data.records.filter(r => r.status === 'En proceso' || !r.status).length;
        approvedRecordsEl.textContent = data.records.filter(r => r.status === 'Aprobado').length;

        // Table
        currentRecords = data.records || [];
        currentContacts = data.contacts || [];

        if (data.records.length === 0) {
            const emptyRow = '<tr><td colspan="5" style="text-align: center; padding: 3rem;">No se encontraron registros vinculados a tu cuenta.</td></tr>';
            recordsBody.innerHTML = emptyRow;
            if (estudiosBody) estudiosBody.innerHTML = emptyRow;
            return;
        }

        const rowsHTML = data.records.map(record => `
            <tr style="cursor: pointer;" onclick="if (!event.target.closest('button')) openEditModal('estudio', '${record.id}')">
                <td>${new Date(record.created).toLocaleDateString()}</td>
                <td>${record.contactName || 'N/A'}</td>
                <td>${record.loanType || 'Hipotecario'}</td>
                <td>
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.4rem;">
                        <span class="status-badge status-${(record.status || 'pendiente').toLowerCase().replace(/\s+/g, '-')}">${record.status || 'Pendiente'}</span>
                        <button class="btn" style="padding: 0.15rem 0.5rem; font-size: 0.7rem; border-radius: 4px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem; font-weight: 700; transition: all 0.2s;" onmouseover="this.style.background='#bae6fd'" onmouseout="this.style.background='#e0f2fe'" onclick="event.stopPropagation(); openViabilityModal('${record.id}')">
                            <i class="fas fa-traffic-light"></i> Viabilidad
                        </button>
                    </div>
                </td>
                <td><button class="btn btn-outline" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="event.stopPropagation(); openEditModal('estudio', '${record.id}')">Detalles</button></td>
            </tr>
        `).join('');
        
        recordsBody.innerHTML = rowsHTML;
        if (estudiosBody) estudiosBody.innerHTML = rowsHTML;

        // Render Contacts (if provided)
        const contactsTabBody = document.querySelector('#tab-contactos tbody');
        if (contactsTabBody && data.contacts) {
            if (data.contacts.length === 0) {
                contactsTabBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 3rem; color: #999;">No hay contactos disponibles actualmente.</td></tr>';
            } else {
                contactsTabBody.innerHTML = data.contacts.map(contact => `
                    <tr>
                        <td>${contact.name}</td>
                        <td>${contact.email}</td>
                        <td>${contact.phone}</td>
                        <td><button class="btn btn-outline" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="openEditModal('contact', '${contact.id}')">Detalles</button></td>
                    </tr>
                `).join('');
            }
        }

    } catch (error) {
        console.error("Dashboard data error:", error);
        const errorRow = `<tr><td colspan="5" style="text-align: center; padding: 3rem; color: var(--secondary);">Error al cargar los datos: ${error.message}</td></tr>`;
        recordsBody.innerHTML = errorRow;
        if (estudiosBody) estudiosBody.innerHTML = errorRow;
    }
}

async function updateProfile(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    const newName = document.getElementById('profileName').value;
    
    if (!newName) return;
    
    const originalText = btn.textContent;
    btn.textContent = 'Guardando...';
    btn.disabled = true;

    try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error('No estás autenticado');
        const token = await user.getIdToken();

        const response = await fetch('/.netlify/functions/update-portal-profile', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newName })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al actualizar el perfil');

        alert('Perfil guardado exitosamente');
        document.getElementById('userName').textContent = newName;
        document.getElementById('userInitial').textContent = newName.charAt(0).toUpperCase();
    } catch (error) {
        console.error("Error updating profile:", error);
        alert(error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ── Edit Modal Functions ──────────────────────────────────────────────────────

function openEditModal(type, id) {
    const modalOverlay = document.getElementById('editModalOverlay');
    const modalTitle = document.getElementById('editModalTitle');
    const recordTypeInput = document.getElementById('editRecordType');
    const recordIdInput = document.getElementById('editRecordId');
    const fieldsContainer = document.getElementById('editFormFields');
    
    if (!modalOverlay || !fieldsContainer) return;
    
    recordTypeInput.value = type;
    recordIdInput.value = id;
    fieldsContainer.innerHTML = '';
    
    if (type === 'contact') {
        modalTitle.textContent = 'Editar Contacto';
        const contact = currentContacts.find(c => c.id === id);
        if (!contact) return;
        
        const f = contact.fields || {};
        fieldsContainer.innerHTML = `
            ${generateFormGroup('Nombre y apellidos', 'field_name', 'text', f['Nombre y apellidos'] !== undefined ? f['Nombre y apellidos'] : contact.name)}
            ${generateFormGroup('Email', 'field_email', 'email', f['Email'] !== undefined ? f['Email'] : contact.email)}
            ${generateFormGroup('Teléfono', 'field_phone', 'tel', f['Telefono'] !== undefined ? f['Telefono'] : contact.phone)}
        `;
    } else if (type === 'estudio') {
        modalTitle.textContent = 'Editar Estudio Hipotecario';
        const record = currentRecords.find(r => r.id === id);
        if (!record) return;
        
        const f = record.fields || {};
        
        const finalidadOpts = ['Vivienda habitual', 'Segunda residencia', 'Inversión'];
        
        const tipoTrabajoOpts = ['Cuenta ajena', 'Funcionario', 'Autonomo', 'Fijo discontinuo'];
        const pagasT1Opts = ['12', '14', '15'];
        const pagasT2Opts = ['12', '14'];
        const propiedadEncontradaOpts = ['Buscando', 'Si, no reservada', 'Si, reservada'];
        const tipoViviendaOpts = ['Nueva', 'Segunda mano'];
        const tipoPrestamoOpts = ['Hipotecario', 'ICO', 'Autopromocion', 'Hipoteca no residente'];

        fieldsContainer.innerHTML = `
            <!-- ANALISIS DE VIABILIDAD (Dashboard Premium en Detalles) -->
            <div style="grid-column: span 2; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 20px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.2rem; box-sizing: border-box; width: 100%; margin-bottom: 1.5rem;">
                <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-traffic-light" style="color: var(--secondary); font-size: 1.2rem;"></i>
                    <h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif; margin: 0; font-size: 1.1rem;">Análisis de Viabilidad (Calculado)</h4>
                </div>
                
                <!-- Viabilidad & Estabilidad -->
                <div style="display: flex; flex-direction: column; gap: 1rem; width: 100%; box-sizing: border-box;">
                    ${renderViabilitySummary(f['Viabilidad'], f['Estabilidad conjunta'])}
                </div>

                <!-- Métricas Financieras -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; width: 100%; box-sizing: border-box;">
                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.8rem 1rem; display: flex; flex-direction: column; gap: 0.2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <span style="font-size: 0.75rem; color: #64748b; font-weight: 700; font-family: 'Inter', sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">Cuota Scoring</span>
                        <span style="font-size: 1.1rem; font-weight: 800; color: var(--primary); font-family: 'Inter', sans-serif;">${formatCurrency(f['Cuota scoring'])}</span>
                    </div>
                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.8rem 1rem; display: flex; flex-direction: column; gap: 0.2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <span style="font-size: 0.75rem; color: #64748b; font-weight: 700; font-family: 'Inter', sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">Cuota Máx. Endeudamiento</span>
                        <span style="font-size: 1.1rem; font-weight: 800; color: var(--primary); font-family: 'Inter', sans-serif;">${formatCurrency(f['Cuota maxima endeudamiento'])}</span>
                    </div>
                </div>

                <!-- Esfuerzo & Financiacion -->
                <div style="display: flex; flex-direction: column; gap: 0.8rem; width: 100%; box-sizing: border-box;">
                    ${renderProgressBar('Esfuerzo Mensual', f['Esfuerzo mensual'], true)}
                    ${renderProgressBar('% Financiación Solicitada', f['% a financiar'], false)}
                </div>

                <!-- Semáforos de Riesgo -->
                <div style="display: flex; flex-direction: column; gap: 0.6rem; width: 100%; box-sizing: border-box;">
                    <span style="font-size: 0.8rem; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.2rem;">Semáforos de Riesgo</span>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.8rem; width: 100%; box-sizing: border-box;">
                        ${renderSemaforoCard('Estabilidad Laboral', f['SemaforoEstabilidad'])}
                        ${renderSemaforoCard('Nivel de Esfuerzo', f['SemaforoEsfuerzo'])}
                        ${renderSemaforoCard('Gasto Imprevisto T2', f['Semafor20masgatos'])}
                    </div>
                </div>
            </div>

            <!-- Titular 1 -->
            <div style="grid-column: span 2; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Datos del Titular 1</h4></div>
            ${generateFormGroup('Edad Titular 1', 'field_edad_sim', 'number', f['Edad sim'])}
            ${generateFormGroup('Tipo de trabajo T1', 'field_tipo_trabajo_sim', 'select', f['Tipo trabajo sim'], tipoTrabajoOpts)}
            ${generateFormGroup('Años Antigüedad T1', 'field_antiguedad_sim', 'number', f['Antiguedad sim'])}
            ${generateFormGroup('Ingresos mensuales T1 (€)', 'field_ingresos_t1', 'number', f['Ingresos titular 1'])}
            ${generateFormGroup('Nº pagas T1', 'field_pagas_t1', 'select', f['Num pagas T1'], pagasT1Opts)}

            <!-- Titular 2 -->
            <div style="grid-column: span 2; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Datos del Titular 2 (Opcional)</h4></div>
            ${generateFormGroup('Ingresos mensuales T2 (€)', 'field_ingresos_t2', 'number', f['Ingresos titular 2'])}
            ${generateFormGroup('Tipo de trabajo T2', 'field_tipo_trabajo_t2', 'select', f['Tipo trabajo T2'], tipoTrabajoOpts)}
            ${generateFormGroup('Nº pagas T2', 'field_pagas_t2', 'select', f['Num pagas T2'], pagasT2Opts)}
            ${generateFormGroup('Años Antigüedad T2', 'field_antiguedad_t2', 'number', f['Antiguedad T2'])}

            <!-- Información Financiera -->
            <div style="grid-column: span 2; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Información Financiera</h4></div>
            ${generateFormGroup('Otros préstamos mensuales (€)', 'field_otros_prestamos', 'number', f['Otros prestamos mensuales'])}
            ${generateFormGroup('Capital pendiente devolución (€)', 'field_capital_pendiente', 'number', f['Capital pendiente'])}
            ${generateFormGroup('Ahorros disponibles (€)', 'field_ahorros', 'number', f['Ahorros'])}

            <!-- Propiedad y Préstamo -->
            <div style="grid-column: span 2; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Detalles de la Propiedad y Préstamo</h4></div>
            ${generateFormGroup('¿Habéis encontrado propiedad?', 'field_encontrado_propiedad', 'select', f['Habeis encontrado propiedad'], propiedadEncontradaOpts)}
            ${generateFormGroup('Precio del inmueble (€)', 'field_precio_inmueble', 'number', f['Precio del inmueble'])}
            ${generateFormGroup('Finalidad', 'field_finalidad', 'select', f['Finalidad'], finalidadOpts)}
            ${generateFormGroup('Tipo vivienda', 'field_tipo_vivienda', 'select', f['Tipo vivienda'], tipoViviendaOpts)}
            ${generateFormGroup('Localidad inmueble', 'field_localidad_inmueble', 'text', f['Localidad inmueble'])}
            ${generateFormGroup('CP Localidad', 'field_cp_localidad', 'text', f['CP Localidad'])}
            ${generateFormGroup('Tipo préstamo', 'field_tipo_prestamo', 'select', f['Tipo prestamo'], tipoPrestamoOpts)}
        `;
    }
    
    modalOverlay.classList.add('active');
}

function generateFormGroup(label, id, type, value, options = null) {
    let inputHTML = '';
    if (type === 'select' && options) {
        inputHTML = `<select id="${id}" class="form-control" style="padding: 0.8rem; border: 1px solid #ddd; border-radius: 8px; width: 100%; font-family: 'Inter', sans-serif; font-size: 0.95rem; background: white; color: var(--primary);">
            <option value="" ${value === undefined || value === null || value === '' ? 'selected' : ''}>-- Seleccionar --</option>
            ${options.map(opt => `<option value="${opt}" ${String(opt) === String(value) ? 'selected' : ''}>${opt}</option>`).join('')}
        </select>`;
    } else {
        inputHTML = `<input type="${type}" id="${id}" class="form-control" value="${value !== undefined && value !== null ? value : ''}" style="padding: 0.8rem; border: 1px solid #ddd; border-radius: 8px; width: 100%; font-family: 'Inter', sans-serif; font-size: 0.95rem; color: var(--primary);">`;
    }
    return `
        <div class="form-group" style="display: flex; flex-direction: column; gap: 0.5rem;">
            <label style="font-weight: 600; color: #475569; font-size: 0.88rem; text-align: left;">${label}</label>
            ${inputHTML}
        </div>
    `;
}

function closeEditModal() {
    const modalOverlay = document.getElementById('editModalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
}

function hasFieldChanged(newValue, originalValue) {
    const isEmptyNew = newValue === null || newValue === undefined || newValue === '';
    const isEmptyOrig = originalValue === null || originalValue === undefined || originalValue === '';
    if (isEmptyNew && isEmptyOrig) return false;
    return String(newValue).trim() !== String(originalValue).trim();
}

function getNumberFromInput(id, isInt = false) {
    const el = document.getElementById(id);
    if (!el || el.value.trim() === '') return null;
    const val = isInt ? parseInt(el.value, 10) : parseFloat(el.value);
    return isNaN(val) ? null : val;
}

async function saveRecordChanges(event) {
    event.preventDefault();
    const type = document.getElementById('editRecordType').value;
    const id = document.getElementById('editRecordId').value;
    const btn = document.getElementById('btnSaveRecord');
    
    let fields = {};
    if (type === 'contact') {
        const originalRecord = currentContacts.find(c => c.id === id);
        const origFields = originalRecord ? (originalRecord.fields || {}) : {};
        
        const newFields = {
            'Nombre y apellidos': document.getElementById('field_name').value.trim(),
            'Email': document.getElementById('field_email').value.trim(),
            'Telefono': document.getElementById('field_phone').value.trim()
        };
        
        for (const [key, val] of Object.entries(newFields)) {
            const origVal = origFields[key] !== undefined ? origFields[key] : (originalRecord ? originalRecord[key === 'Telefono' ? 'phone' : (key === 'Email' ? 'email' : 'name')] : null);
            if (hasFieldChanged(val, origVal)) {
                fields[key] = val;
            }
        }
    } else if (type === 'estudio') {
        const originalRecord = currentRecords.find(r => r.id === id);
        const origFields = originalRecord ? (originalRecord.fields || {}) : {};
        
        const newFields = {
            'Edad sim': getNumberFromInput('field_edad_sim', true),
            'Tipo trabajo sim': document.getElementById('field_tipo_trabajo_sim').value || null,
            'Antiguedad sim': getNumberFromInput('field_antiguedad_sim', true),
            'Ingresos titular 1': getNumberFromInput('field_ingresos_t1'),
            'Num pagas T1': getNumberFromInput('field_pagas_t1', true),

            'Ingresos titular 2': getNumberFromInput('field_ingresos_t2'),
            'Tipo trabajo T2': document.getElementById('field_tipo_trabajo_t2').value || null,
            'Num pagas T2': getNumberFromInput('field_pagas_t2', true),
            'Antiguedad T2': getNumberFromInput('field_antiguedad_t2', true),

            'Otros prestamos mensuales': getNumberFromInput('field_otros_prestamos'),
            'Capital pendiente': getNumberFromInput('field_capital_pendiente'),
            'Ahorros': getNumberFromInput('field_ahorros'),

            'Habeis encontrado propiedad': document.getElementById('field_encontrado_propiedad').value || null,
            'Precio del inmueble': getNumberFromInput('field_precio_inmueble'),
            'Finalidad': document.getElementById('field_finalidad').value || null,
            'Tipo vivienda': document.getElementById('field_tipo_vivienda').value || null,
            'Localidad inmueble': document.getElementById('field_localidad_inmueble').value || null,
            'CP Localidad': document.getElementById('field_cp_localidad').value || null,
            'Tipo prestamo': document.getElementById('field_tipo_prestamo').value || null
        };
        
        for (const [key, val] of Object.entries(newFields)) {
            if (hasFieldChanged(val, origFields[key])) {
                fields[key] = val;
            }
        }
    }
    
    if (Object.keys(fields).length === 0) {
        alert('No se detectaron cambios para guardar.');
        closeEditModal();
        return;
    }
    
    const originalText = btn.textContent;
    btn.textContent = 'Guardando...';
    btn.disabled = true;
    
    try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error('No estás autenticado');
        const token = await user.getIdToken();
        
        const response = await fetch('/.netlify/functions/update-portal-record', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type, id, fields })
        });
        
        let responseData = {};
        const responseText = await response.text();
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            console.error("Non-JSON response from server:", responseText);
            throw new Error(`Error del servidor (${response.status}): El servidor tardó demasiado en responder (Timeout) o devolvió un formato no válido.`);
        }
        
        if (!response.ok) {
            throw new Error(responseData.details || responseData.error || 'Error al guardar los cambios');
        }
        
        alert('Cambios guardados con éxito en Airtable');
        closeEditModal();
        loadDashboardData(); // Refresh the grid!
    } catch (err) {
        console.error("Error saving changes:", err);
        alert('Error: ' + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ── Viability Modal Functions ──────────────────────────────────────────────────

function formatCurrency(value) {
    if (value === undefined || value === null) return 'N/D';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(num);
}

function renderSemaforoCard(label, val) {
    let color = '#94a3b8'; // neutral Slate
    let text = 'N/D';
    
    if (val) {
        const valStr = String(val).toLowerCase();
        if (valStr.includes('🟢') || valStr.includes('verde') || valStr.includes('green') || valStr.includes('viable') || valStr.includes('alta') || valStr.includes('estable')) {
            color = '#10b981'; // emerald green
            text = String(val).replace('🟢', '').trim() || 'Verde';
        } else if (valStr.includes('🟡') || valStr.includes('🟠') || valStr.includes('naranja') || valStr.includes('orange') || valStr.includes('amarillo') || valStr.includes('yellow') || valStr.includes('media')) {
            color = '#f59e0b'; // amber orange
            text = String(val).replace(/[🟡🟠]/g, '').trim() || 'Naranja';
        } else if (valStr.includes('🔴') || valStr.includes('rojo') || valStr.includes('red') || valStr.includes('baja') || valStr.includes('no viable') || valStr.includes('critico')) {
            color = '#ef4444'; // red
            text = String(val).replace('🔴', '').trim() || 'Rojo';
        } else {
            text = String(val);
        }
    }
    
    // Capitalize first letter
    text = text.charAt(0).toUpperCase() + text.slice(1);
    
    return `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; align-items: center; text-align: center;">
            <span style="font-size: 0.8rem; color: #64748b; font-weight: 700; font-family: 'Inter', sans-serif;">${label}</span>
            <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 1rem; font-weight: 800; color: ${color}; font-family: 'Inter', sans-serif;">
                <span style="width: 12px; height: 12px; border-radius: 50%; background: ${color}; box-shadow: 0 0 10px ${color}; display: inline-block;"></span>
                <span>${text}</span>
            </div>
        </div>
    `;
}

function renderProgressBar(label, value, isEffort = false) {
    if (value === undefined || value === null) {
        return `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <span style="font-size: 0.85rem; color: #64748b; font-weight: 700; font-family: 'Inter', sans-serif;">${label}</span>
                <span style="font-weight: 800; color: #94a3b8;">N/D</span>
            </div>
        `;
    }
    
    const num = parseFloat(value);
    if (isNaN(num)) {
        return `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <span style="font-size: 0.85rem; color: #64748b; font-weight: 700; font-family: 'Inter', sans-serif;">${label}</span>
                <span style="font-weight: 800; color: var(--primary);">${value}</span>
            </div>
        `;
    }
    
    const finalVal = num <= 1 ? num * 100 : num;
    let color = '#10b981'; // Green
    
    if (isEffort) {
        if (finalVal > 40) color = '#ef4444';
        else if (finalVal > 35) color = '#f59e0b';
    } else {
        if (finalVal > 90) color = '#ef4444';
        else if (finalVal > 80) color = '#f59e0b';
    }
    
    return `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; width: 100%; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-family: 'Inter', sans-serif;">
                <span style="font-size: 0.85rem; color: #64748b; font-weight: 700;">${label}</span>
                <span style="font-size: 1.1rem; font-weight: 800; color: var(--primary);">${finalVal.toFixed(0)}%</span>
            </div>
            <div style="width: 100%; height: 10px; background: #e2e8f0; border-radius: 10px; overflow: hidden;">
                <div style="width: ${Math.min(finalVal, 100)}%; height: 100%; background: ${color}; border-radius: 10px; transition: width 0.5s ease-out;"></div>
            </div>
        </div>
    `;
}

function renderViabilitySummary(viableVal, estabilidadVal) {
    let viableColor = '#94a3b8';
    let viableBg = '#f1f5f9';
    let viableText = 'No analizado';
    let viableDesc = 'No se ha calculado la viabilidad aún.';
    
    if (viableVal) {
        const str = String(viableVal).toLowerCase();
        if (str.includes('no viable') || str.includes('no_viable') || str.includes('🔴')) {
            viableColor = '#ef4444';
            viableBg = '#fee2e2';
            viableText = 'No Viable';
            viableDesc = 'El estudio presenta un nivel de riesgo por encima de los límites recomendados.';
        } else if (str.includes('viable') || str.includes('🟢')) {
            viableColor = '#10b981';
            viableBg = '#dcfce7';
            viableText = 'Viable';
            viableDesc = '¡Excelente! El perfil del cliente cumple con los estándares óptimos de viabilidad.';
        } else {
            viableText = viableVal;
            viableDesc = 'Estado actual de la viabilidad.';
        }
    }
    
    let estColor = '#94a3b8';
    let estBg = '#f1f5f9';
    let estText = 'N/D';
    
    if (estabilidadVal) {
        const str = String(estabilidadVal).toLowerCase();
        if (str.includes('estable')) {
            estColor = '#10b981';
            estBg = '#dcfce7';
            estText = 'Estable';
        } else if (str.includes('no estable') || str.includes('inestable')) {
            estColor = '#ef4444';
            estBg = '#fee2e2';
            estText = 'No Estable';
        } else {
            estText = String(estabilidadVal);
        }
    }
    
    return `
        <div style="background: ${viableBg}; border: 1.5px solid ${viableColor}; border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; box-sizing: border-box; width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-family: 'Inter', sans-serif;">
                <span style="font-size: 0.9rem; color: #475569; font-weight: 700;">Resultado Viabilidad</span>
                <span style="padding: 0.4rem 1rem; border-radius: 50px; background: white; border: 1.5px solid ${viableColor}; color: ${viableColor}; font-weight: 800; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 0.4rem;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: ${viableColor}; animation: pulse 1.5s infinite;"></span>
                    ${viableText}
                </span>
            </div>
            <p style="font-size: 0.95rem; color: #1e293b; font-weight: 500; line-height: 1.4; margin: 0.5rem 0 0 0; font-family: 'Inter', sans-serif;">${viableDesc}</p>
        </div>
        
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.2rem; display: flex; justify-content: space-between; align-items: center; font-family: 'Inter', sans-serif; box-sizing: border-box; width: 100%;">
            <span style="font-size: 0.95rem; color: #475569; font-weight: 700;">Estabilidad Conjunta</span>
            <span style="padding: 0.4rem 1rem; border-radius: 8px; background: ${estBg}; color: ${estColor}; font-weight: 800; font-size: 0.9rem;">
                ${estText}
            </span>
        </div>
    `;
}

function openViabilityModal(recordId) {
    const record = currentRecords.find(r => r.id === recordId);
    if (!record) {
        alert('No se pudo encontrar el registro.');
        return;
    }

    const f = record.fields || {};
    
    // Ensure styles are injected
    if (!document.getElementById('viabilityStyles')) {
        const style = document.createElement('style');
        style.id = 'viabilityStyles';
        style.textContent = `
            @keyframes pulse {
                0% { transform: scale(0.95); opacity: 0.6; }
                50% { transform: scale(1.05); opacity: 1; }
                100% { transform: scale(0.95); opacity: 0.6; }
            }
        `;
        document.head.appendChild(style);
    }

    // Get modal DOM elements (or create programmatically if they don't exist yet)
    let modalOverlay = document.getElementById('viabilityModalOverlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'viabilityModalOverlay';
        modalOverlay.className = 'edit-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="edit-modal-card" style="max-width: 650px; width: 100%; max-height: 90vh; display: flex; flex-direction: column;">
                <div class="edit-modal-header" style="border-bottom: 1px solid #e2e8f0; padding: 1.5rem 2rem;">
                    <h3 id="viabilityModalTitle" style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-traffic-light" style="color: var(--secondary);"></i> Análisis de Viabilidad
                    </h3>
                    <button type="button" class="edit-modal-close" onclick="closeViabilityModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="edit-modal-body" style="padding: 2rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 1.5rem;">
                    <div id="viabilityFieldsContainer" style="display: flex; flex-direction: column; gap: 1.5rem; width: 100%;">
                        <!-- Content will be injected here -->
                    </div>
                </div>
                <div class="edit-modal-footer" style="border-top: 1px solid #e2e8f0; padding: 1.5rem 2rem; background: #f8fafc;">
                    <button type="button" class="btn btn-primary" style="padding: 0.6rem 1.5rem;" onclick="closeViabilityModal()">Entendido</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
    }

    const container = document.getElementById('viabilityFieldsContainer');
    if (!container) return;

    const contactName = record.contactName || 'N/A';
    const createdDate = new Date(record.created).toLocaleDateString();

    let html = `
        <!-- Sub-header metadata -->
        <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; border-left: 4px solid var(--secondary); font-family: 'Inter', sans-serif; width: 100%; box-sizing: border-box;">
            <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700;">Expediente del Cliente</div>
            <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary); margin-top: 0.2rem;">${contactName}</div>
            <div style="font-size: 0.85rem; color: #64748b; margin-top: 0.1rem;">Fecha de creación: ${createdDate}</div>
        </div>

        <!-- Viabilidad & Estabilidad Conjunta -->
        ${renderViabilitySummary(f['Viabilidad'], f['Estabilidad conjunta'])}

        <!-- Key Financial Metrics Section -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 1.5rem; width: 100%; box-sizing: border-box;">
            <h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif; font-size: 1rem; margin: 0 0 1rem 0;">Métricas Financieras Clave</h4>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; margin-bottom: 1.2rem; width: 100%; box-sizing: border-box;">
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.3rem;">
                    <span style="font-size: 0.8rem; color: #64748b; font-weight: 700; font-family: 'Inter', sans-serif;">Cuota Scoring</span>
                    <span style="font-size: 1.2rem; font-weight: 800; color: var(--primary); font-family: 'Inter', sans-serif;">${formatCurrency(f['Cuota scoring'])}</span>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.3rem;">
                    <span style="font-size: 0.8rem; color: #64748b; font-weight: 700; font-family: 'Inter', sans-serif;">Cuota Máxima Endeudamiento</span>
                    <span style="font-size: 1.2rem; font-weight: 800; color: var(--primary); font-family: 'Inter', sans-serif;">${formatCurrency(f['Cuota maxima endeudamiento'])}</span>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 1.2rem; width: 100%; box-sizing: border-box;">
                ${renderProgressBar('Esfuerzo Mensual', f['Esfuerzo mensual'], true)}
                ${renderProgressBar('% Financiación Solicitada', f['% a financiar'], false)}
            </div>
        </div>

        <!-- Semáforos de Riesgo Section -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 1.5rem; margin-bottom: 0.5rem; width: 100%; box-sizing: border-box;">
            <h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif; font-size: 1rem; margin: 0 0 1rem 0;">Semáforos de Riesgo</h4>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; width: 100%; box-sizing: border-box;">
                ${renderSemaforoCard('Estabilidad Laboral', f['SemaforoEstabilidad'])}
                ${renderSemaforoCard('Nivel de Esfuerzo', f['SemaforoEsfuerzo'])}
                ${renderSemaforoCard('Gasto Imprevisto T2', f['Semafor20masgatos'])}
            </div>
        </div>
    `;

    container.innerHTML = html;
    modalOverlay.classList.add('active');
}

function closeViabilityModal() {
    const modalOverlay = document.getElementById('viabilityModalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
}

// Initial load
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        loadDashboardData();
    }
});
