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
            <tr>
                <td>${new Date(record.created).toLocaleDateString()}</td>
                <td>${record.contactName || 'N/A'}</td>
                <td>${record.loanType || 'Hipotecario'}</td>
                <td><span class="status-badge status-${(record.status || 'pendiente').toLowerCase().replace(/\s+/g, '-')}">${record.status || 'Pendiente'}</span></td>
                <td><button class="btn btn-outline" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="openEditModal('estudio', '${record.id}')">Detalles</button></td>
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
            ${generateFormGroup('Nombre y apellidos', 'field_name', 'text', f['Nombre y apellidos'] || contact.name)}
            ${generateFormGroup('Email', 'field_email', 'email', f['Email'] || contact.email)}
            ${generateFormGroup('Teléfono', 'field_phone', 'tel', f['Telefono'] || contact.phone)}
        `;
    } else if (type === 'estudio') {
        modalTitle.textContent = 'Editar Estudio Hipotecario';
        const record = currentRecords.find(r => r.id === id);
        if (!record) return;
        
        const f = record.fields || {};
        
        const tipoInmuebleOpts = ['Piso', 'Casa/Chalet', 'Ático', 'Dúplex', 'Local comercial', 'Terreno', 'Otros'];
        const estadoInmuebleOpts = ['Obra nueva', 'Segunda mano', 'A reformar'];
        const finalidadOpts = ['Vivienda habitual', 'Segunda residencia', 'Inversión'];
        const tipoContratoOpts = ['Indefinido', 'Temporal', 'Autónomo', 'Funcionario', 'Otros'];
        
        const tipoTrabajoOpts = ['Cuenta ajena', 'Funcionario', 'Autonomo', 'Fijo discontinuo'];
        const pagasT1Opts = ['12', '14', '15'];
        const pagasT2Opts = ['12', '14'];
        const propiedadEncontradaOpts = ['Buscando', 'Si, no reservada', 'Si, reservada'];
        const tipoViviendaOpts = ['Nueva', 'Segunda mano'];
        const tipoPrestamoOpts = ['Hipotecario', 'ICO', 'Autopromocion', 'Hipoteca no residente'];

        fieldsContainer.innerHTML = `
            <!-- Titular 1 -->
            <div style="grid-column: span 2; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Datos del Titular 1</h4></div>
            ${generateFormGroup('Edad Titular 1', 'field_edad_sim', 'number', f['Edad sim'] || '')}
            ${generateFormGroup('Tipo de trabajo T1', 'field_tipo_trabajo_sim', 'select', f['Tipo trabajo sim'], tipoTrabajoOpts)}
            ${generateFormGroup('Años Antigüedad T1', 'field_antiguedad_sim', 'number', f['Antiguedad sim'] || '')}
            ${generateFormGroup('Ingresos mensuales T1 (€)', 'field_ingresos_t1', 'number', f['Ingresos titular 1'] || '')}
            ${generateFormGroup('Nº pagas T1', 'field_pagas_t1', 'select', f['Num pagas T1'], pagasT1Opts)}
            ${generateFormGroup('Ingresos mensuales (Airtable-Alt) (€)', 'field_ingresos_mensuales', 'number', f['Ingresos mensuales'] || '')}
            ${generateFormGroup('Tipo de contrato (Airtable-Alt)', 'field_tipo_contrato', 'select', f['Tipo de contrato'], tipoContratoOpts)}

            <!-- Titular 2 -->
            <div style="grid-column: span 2; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Datos del Titular 2 (Opcional)</h4></div>
            ${generateFormGroup('Ingresos mensuales T2 (€)', 'field_ingresos_t2', 'number', f['Ingresos titular 2'] || '')}
            ${generateFormGroup('Tipo de trabajo T2', 'field_tipo_trabajo_t2', 'select', f['Tipo trabajo T2'], tipoTrabajoOpts)}
            ${generateFormGroup('Nº pagas T2', 'field_pagas_t2', 'select', f['Num pagas T2'], pagasT2Opts)}
            ${generateFormGroup('Años Antigüedad T2', 'field_antiguedad_t2', 'number', f['Antiguedad T2'] || '')}

            <!-- Información Financiera -->
            <div style="grid-column: span 2; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Información Financiera</h4></div>
            ${generateFormGroup('Otros préstamos mensuales (€)', 'field_otros_prestamos', 'number', f['Otros prestamos mensuales'] || '')}
            ${generateFormGroup('Capital pendiente devolución (€)', 'field_capital_pendiente', 'number', f['Capital pendiente'] || '')}
            ${generateFormGroup('Ahorros disponibles (€)', 'field_ahorros', 'number', f['Ahorros'] || '')}
            ${generateFormGroup('Aportación (€)', 'field_aportacion', 'number', f['Aportación'] || '')}

            <!-- Propiedad y Préstamo -->
            <div style="grid-column: span 2; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Detalles de la Propiedad y Préstamo</h4></div>
            ${generateFormGroup('¿Habéis encontrado propiedad?', 'field_encontrado_propiedad', 'select', f['Habeis encontrado propiedad'], propiedadEncontradaOpts)}
            ${generateFormGroup('Precio del inmueble (€)', 'field_precio_inmueble', 'number', f['Precio del inmueble'] || '')}
            ${generateFormGroup('Precio de compra (€)', 'field_precio_compra', 'number', f['Precio de compra'] || '')}
            ${generateFormGroup('Tipo de inmueble', 'field_tipo_inmueble', 'select', f['Tipo de inmueble'], tipoInmuebleOpts)}
            ${generateFormGroup('Estado del inmueble', 'field_estado_inmueble', 'select', f['Estado del inmueble'], estadoInmuebleOpts)}
            ${generateFormGroup('Finalidad', 'field_finalidad', 'select', f['Finalidad'], finalidadOpts)}
            ${generateFormGroup('Tipo vivienda', 'field_tipo_vivienda', 'select', f['Tipo vivienda'], tipoViviendaOpts)}
            ${generateFormGroup('Localidad inmueble', 'field_localidad_inmueble', 'text', f['Localidad inmueble'] || '')}
            ${generateFormGroup('CP Localidad', 'field_cp_localidad', 'text', f['CP Localidad'] || '')}
            ${generateFormGroup('Provincia', 'field_provincia', 'text', f['Provincia'] || '')}
            ${generateFormGroup('Tipo préstamo', 'field_tipo_prestamo', 'select', f['Tipo prestamo'], tipoPrestamoOpts)}
        `;
    }
    
    modalOverlay.classList.add('active');
}

function generateFormGroup(label, id, type, value, options = null) {
    let inputHTML = '';
    if (type === 'select' && options) {
        inputHTML = `<select id="${id}" class="form-control" style="padding: 0.8rem; border: 1px solid #ddd; border-radius: 8px; width: 100%; font-family: 'Inter', sans-serif; font-size: 0.95rem; background: white; color: var(--primary);">
            <option value="" ${!value ? 'selected' : ''}>-- Seleccionar --</option>
            ${options.map(opt => `<option value="${opt}" ${opt === value ? 'selected' : ''}>${opt}</option>`).join('')}
        </select>`;
    } else {
        inputHTML = `<input type="${type}" id="${id}" class="form-control" value="${value || ''}" style="padding: 0.8rem; border: 1px solid #ddd; border-radius: 8px; width: 100%; font-family: 'Inter', sans-serif; font-size: 0.95rem; color: var(--primary);">`;
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
            'Edad sim': parseInt(document.getElementById('field_edad_sim').value) || null,
            'Tipo trabajo sim': document.getElementById('field_tipo_trabajo_sim').value || null,
            'Antiguedad sim': parseInt(document.getElementById('field_antiguedad_sim').value) || null,
            'Ingresos titular 1': parseFloat(document.getElementById('field_ingresos_t1').value) || null,
            'Num pagas T1': parseInt(document.getElementById('field_pagas_t1').value) || null,
            'Ingresos mensuales': parseFloat(document.getElementById('field_ingresos_mensuales').value) || null,
            'Tipo de contrato': document.getElementById('field_tipo_contrato').value || null,

            'Ingresos titular 2': parseFloat(document.getElementById('field_ingresos_t2').value) || null,
            'Tipo trabajo T2': document.getElementById('field_tipo_trabajo_t2').value || null,
            'Num pagas T2': parseInt(document.getElementById('field_pagas_t2').value) || null,
            'Antiguedad T2': parseInt(document.getElementById('field_antiguedad_t2').value) || null,

            'Otros prestamos mensuales': parseFloat(document.getElementById('field_otros_prestamos').value) || null,
            'Capital pendiente': parseFloat(document.getElementById('field_capital_pendiente').value) || null,
            'Ahorros': parseFloat(document.getElementById('field_ahorros').value) || null,
            'Aportación': parseFloat(document.getElementById('field_aportacion').value) || null,

            'Habeis encontrado propiedad': document.getElementById('field_encontrado_propiedad').value || null,
            'Precio del inmueble': parseFloat(document.getElementById('field_precio_inmueble').value) || null,
            'Precio de compra': parseFloat(document.getElementById('field_precio_compra').value) || null,
            'Tipo de inmueble': document.getElementById('field_tipo_inmueble').value || null,
            'Estado del inmueble': document.getElementById('field_estado_inmueble').value || null,
            'Finalidad': document.getElementById('field_finalidad').value || null,
            'Tipo vivienda': document.getElementById('field_tipo_vivienda').value || null,
            'Localidad inmueble': document.getElementById('field_localidad_inmueble').value || null,
            'CP Localidad': document.getElementById('field_cp_localidad').value || null,
            'Provincia': document.getElementById('field_provincia').value || null,
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

// Initial load
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        loadDashboardData();
    }
});
