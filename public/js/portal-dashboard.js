let currentRecords = [];
let currentContacts = [];
let currentUserFranquiciadoId = null;
let currentCompatibleProducts = [];
let activeStudyLinkedContactIds = [];

// Instant Greeting from localStorage to prevent any loading flashes or caching issues
const cachedName = localStorage.getItem('currentUserDisplayName');
if (cachedName) {
    document.addEventListener('DOMContentLoaded', () => {
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = cachedName;
        const profileNameEl = document.getElementById('profileName');
        if (profileNameEl) profileNameEl.value = cachedName;
    });
}

async function loadDashboardData() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    const recordsBody = document.getElementById('recordsBody');
    const estudiosBody = document.getElementById('estudiosBody');
    const totalRecordsEl = document.getElementById('totalRecords');
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

        // Setup Contacts / Referidos sidebar navigation based on role
        const navContactos = document.getElementById('nav-contactos');
        const isClient = data.user.role === 'client' || portalRole === 'cliente';
        
        if (navContactos) {
            if (isClient) {
                navContactos.innerHTML = '<i class="fas fa-gift"></i> Referidos';
            } else {
                navContactos.innerHTML = '<i class="fas fa-user-friends"></i> Mis Contactos';
            }
            navContactos.parentElement.style.display = 'block'; // Always visible!
        }
        
        // Update UI
        const displayName = (data.user.name || user.email.split('@')[0]).trim();
        currentUserFranquiciadoId = data.user.id || null;
        if (currentUserFranquiciadoId) {
            localStorage.setItem('currentUserFranquiciadoId', currentUserFranquiciadoId);
            localStorage.setItem('currentUserEmail', data.user.email);
            localStorage.setItem('currentUserDisplayName', displayName);
        } else {
            localStorage.removeItem('currentUserFranquiciadoId');
            localStorage.removeItem('currentUserEmail');
            localStorage.removeItem('currentUserDisplayName');
        }
        
        let roleDisplay = 'Cliente';
        if (data.user.role === 'associate') roleDisplay = 'Asociado AKIA';
        if (data.user.role === 'admin') roleDisplay = 'Administrador';
        userRoleEl.textContent = roleDisplay;
        if (userNameEl) userNameEl.textContent = displayName;
        
        document.getElementById('userInitial').textContent = (displayName.charAt(0) || 'U').toUpperCase();

        // Populate profile form
        if (profileNameEl) profileNameEl.value = displayName;
        if (profileEmailEl) profileEmailEl.value = user.email;

        // Stats
        if (totalRecordsEl) totalRecordsEl.textContent = data.records.length;
        renderProcessGraphics(data.records);

        // Table
        currentRecords = data.records || [];
        currentContacts = data.contacts || [];

        // ------------------ Unified Referidos / Contacts view system ------------------
        let referralLink = data.user.linkReferidos;
        if (!referralLink || referralLink.includes('app.cliente.com') || referralLink.includes('cliente.com')) {
            referralLink = `${window.location.origin}/referidos/?ref=${data.user.id}`;
        }
        
        const clientHeader = document.getElementById('clientReferralHeader');
        const tabTitle = document.getElementById('contactsTabTitle');
        const tabDesc = document.getElementById('contactsTabDesc');
        const tabNewBtn = document.getElementById('contactsTabNewBtn');
        const tabHead = document.getElementById('contactsTabHead');
        const tabBody = document.getElementById('contactsTabBody');

        if (isClient) {
            // Setup Referidos view for Client role
            if (tabTitle) tabTitle.textContent = 'Referencias y Créditos';
            if (tabDesc) tabDesc.textContent = 'Sigue el estado en tiempo real de tus recomendados y mira cómo progresa su estudio hipotecario.';
            if (tabNewBtn) tabNewBtn.style.display = 'none';
            if (clientHeader) clientHeader.style.display = 'block';

            // Set referral inputs
            const referralInput = document.getElementById('referralLinkInput');
            if (referralInput) {
                referralInput.value = referralLink;
            }

            const waBtn = document.getElementById('shareWhatsAppBtn');
            if (waBtn) {
                waBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(`¡Hola! Te recomiendo utilizar Hipoteca Aquí para conseguir las mejores condiciones para tu hipoteca de forma 100% gratuita. Solicita tu asesoramiento gratis en: ` + referralLink)}`;
            }

            const mailBtn = document.getElementById('shareEmailBtn');
            if (mailBtn) {
                mailBtn.href = `mailto:?subject=${encodeURIComponent(`Te recomiendo Hipoteca Aquí`)}&body=${encodeURIComponent(`Hola,\n\nTe recomiendo utilizar Hipoteca Aquí para conseguir las mejores condiciones para tu hipoteca de forma 100% gratuita.\n\nRegístrate gratis para tu estudio de viabilidad con mi enlace de recomendación:\n` + referralLink)}`;
            }

            // Adjust table columns for referral tracking
            if (tabHead) {
                tabHead.innerHTML = `
                    <tr>
                        <th>Nombre</th>
                        <th>Email</th>
                        <th>Teléfono</th>
                        <th>Estado del Estudio</th>
                    </tr>
                `;
            }

            renderContactsTable(currentContacts, true);
        } else {
            // Setup Directory of Contacts view for Associate role
            if (tabTitle) tabTitle.textContent = 'Directorio de Contactos';
            if (tabDesc) tabDesc.textContent = 'Gestiona la información de tus clientes y contactos.';
            if (tabNewBtn) tabNewBtn.style.display = 'block';
            if (clientHeader) clientHeader.style.display = 'none';

            if (tabHead) {
                tabHead.innerHTML = `
                    <tr>
                        <th>Nombre</th>
                        <th>Email</th>
                        <th>Teléfono</th>
                        <th>Acciones</th>
                    </tr>
                `;
            }

            renderContactsTable(currentContacts, false);
        }

        populateFilterDropdowns(currentRecords);
        applyFilters();

        // Dynamically refresh the linked contacts inside study modal if active
        const modalOverlay = document.getElementById('editModalOverlay');
        const recordTypeInput = document.getElementById('editRecordType');
        if (modalOverlay && modalOverlay.classList.contains('active') && recordTypeInput && recordTypeInput.value === 'estudio') {
            renderLinkedContactsSection();
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
        localStorage.setItem('currentUserDisplayName', newName);
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
            <div style="grid-column: 1 / -1; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 20px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.2rem; box-sizing: border-box; width: 100%; margin-bottom: 1.5rem;">
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
                        ${renderSemaforoCard('20% + gastos', f['Semafor20masgatos'])}
                    </div>
                </div>
            </div>

            <!-- Titular 1 -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Datos del Titular 1</h4></div>
            ${generateFormGroup('Edad Titular 1', 'field_edad_sim', 'number', f['Edad sim'])}
            ${generateFormGroup('Tipo de trabajo T1', 'field_tipo_trabajo_sim', 'select', f['Tipo trabajo sim'], tipoTrabajoOpts)}
            ${generateFormGroup('Años Antigüedad T1', 'field_antiguedad_sim', 'number', f['Antiguedad sim'])}
            ${generateFormGroup('Ingresos mensuales T1 (€)', 'field_ingresos_t1', 'number', f['Ingresos titular 1'])}
            ${generateFormGroup('Nº pagas T1', 'field_pagas_t1', 'select', f['Num pagas T1'], pagasT1Opts)}

            <!-- Titular 2 -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Datos del Titular 2 (Opcional)</h4></div>
            ${generateFormGroup('Ingresos mensuales T2 (€)', 'field_ingresos_t2', 'number', f['Ingresos titular 2'])}
            ${generateFormGroup('Tipo de trabajo T2', 'field_tipo_trabajo_t2', 'select', f['Tipo trabajo T2'], tipoTrabajoOpts)}
            ${generateFormGroup('Nº pagas T2', 'field_pagas_t2', 'select', f['Num pagas T2'], pagasT2Opts)}
            ${generateFormGroup('Años Antigüedad T2', 'field_antiguedad_t2', 'number', f['Antiguedad T2'])}

            <!-- Información Financiera -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Información Financiera</h4></div>
            ${generateFormGroup('Otros préstamos mensuales (€)', 'field_otros_prestamos', 'number', f['Otros prestamos mensuales'])}
            ${generateFormGroup('Capital pendiente devolución (€)', 'field_capital_pendiente', 'number', f['Capital pendiente'])}
            ${generateFormGroup('Ahorros disponibles (€)', 'field_ahorros', 'number', f['Ahorros'])}
            ${generateFormGroup('Años hipoteca', 'field_anos_hipoteca', 'number', f['Años hipoteca'])}

            <!-- Propiedad y Préstamo -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Detalles de la Propiedad y Préstamo</h4></div>
            ${generateFormGroup('¿Habéis encontrado propiedad?', 'field_encontrado_propiedad', 'select', f['Habeis encontrado propiedad'], propiedadEncontradaOpts)}
            ${generateFormGroup('Precio del inmueble (€)', 'field_precio_inmueble', 'number', f['Precio del inmueble'])}
            ${generateFormGroup('Finalidad', 'field_finalidad', 'select', f['Finalidad'], finalidadOpts)}
            ${generateFormGroup('Tipo vivienda', 'field_tipo_vivienda', 'select', f['Tipo vivienda'], tipoViviendaOpts)}
            ${generateFormGroup('Localidad inmueble', 'field_localidad_inmueble', 'text', f['Localidad inmueble'])}
            ${generateFormGroup('CP Localidad', 'field_cp_localidad', 'text', f['CP Localidad'])}
            ${generateFormGroup('Provincia', 'field_provincia', 'readonly', (f['Provincia'] || [])[0] || f['Provincia'] || '')}
            ${generateFormGroup('Tipo préstamo', 'field_tipo_prestamo', 'select', f['Tipo prestamo'], tipoPrestamoOpts)}

            <!-- Detalle Gastos Operación -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Detalle Gastos operación</h4></div>
            ${generateFormGroup('Deducción ITP', 'field_deduccion_itp', 'select', f['Deduccion ITP'], ['1%', '2%', '2.5%', '3%', '3.33%', '4%', '5%', '6%', '7%', '7.5%', '8%', '9%', '10%'])}
            ${generateFormGroup('ITP', 'field_itp', 'readonly', (() => {
                const itpVal = (f['ITP'] || [])[0] !== undefined ? (f['ITP'] || [])[0] : f['ITP'];
                return itpVal !== undefined && itpVal !== null ? `${(parseFloat(itpVal) * 100).toFixed(2).replace(/\.00$/, '')}%` : '';
            })())}
            ${generateFormGroup('Notaría compraventa', 'field_notaria_compraventa', 'readonly', formatCurrency(f['Notaria compraventa']))}
            ${generateFormGroup('Tasación (€)', 'field_tasacion', 'number', f['Tasacion'])}
            ${generateFormGroup('Registro compraventa', 'field_registro_compraventa', 'readonly', formatCurrency(f['Registro compraventa']))}
            ${generateFormGroup('AJD compraventa', 'field_ajd_compraventa', 'readonly', formatCurrency(f['AJD compraventa']))}
            ${generateFormGroup('Impuesto transmisión', 'field_impuesto_transmision', 'readonly', formatCurrency(f['Impuesto transmision']))}
            ${generateFormGroup('Honorarios', 'field_honorarios', 'readonly', formatCurrency(f['Honorarios']))}

            <!-- Límite según cuota de esfuerzo máximo -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Límite según cuota de esfuerzo máximo</h4></div>
            ${generateFormGroup('Otros gastos operación', 'field_limite_otros_gastos', 'readonly', formatCurrency(f['Otros gastos operación']))}
            ${generateFormGroup('20% Valor Compra', 'field_limite_20_valor_compra', 'readonly', formatCurrency(f['20%ValorCompra']))}
            ${generateFormGroup('Financiación máx.', 'field_limite_financiacion_max', 'readonly', formatCurrency(f['Financiacion max']))}
            ${generateFormGroup('Financiación máx. con avalista', 'field_limite_financiacion_max_avalista', 'readonly', formatCurrency(f['Financiacion max con avalista']))}
            ${generateFormGroup('Precio máximo', 'field_limite_precio_maximo', 'readonly', formatCurrency(f['Precio maximo']))}
            ${generateFormGroup('Ahorros', 'field_limite_ahorros', 'readonly', formatCurrency(f['Ahorros']))}
            ${generateFormGroup('Aportación necesaria', 'field_limite_aportacion_necesaria', 'readonly', formatCurrency(f['Aportacion necesaria']))}
            ${generateFormGroup('Semáforo 20% + gastos', 'field_limite_semaforo', 'readonly', f['Semafor20masgatos'] || '')}

            <!-- Viabilidad Scoring -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Viabilidad Scoring</h4></div>
            ${generateFormGroup('Viabilidad', 'field_scoring_viabilidad', 'readonly', f['Viabilidad'] || '')}
            ${generateFormGroup('Nº viables', 'field_scoring_viables', 'readonly', f['Nº viables'] !== undefined ? f['Nº viables'] : '')}
            ${generateFormGroup('Nº estudiar', 'field_scoring_estudiar', 'readonly', f['Nº estudiar'] !== undefined ? f['Nº estudiar'] : '')}
            ${generateFormGroup('Mejor cuota Fija', 'field_scoring_cuota_fija', 'readonly', formatCurrency(Array.isArray(f['Mejor cuota Fija']) ? f['Mejor cuota Fija'][0] : f['Mejor cuota Fija']))}
            ${generateFormGroup('Mejor cuota Mixta', 'field_scoring_cuota_mixta', 'readonly', formatCurrency(Array.isArray(f['Mejor cuota Mixta']) ? f['Mejor cuota Mixta'][0] : f['Mejor cuota Mixta']))}
            ${generateFormGroup('Mejor cuota Variable', 'field_scoring_cuota_variable', 'readonly', formatCurrency(Array.isArray(f['Mejor cuota Variable']) ? f['Mejor cuota Variable'][0] : f['Mejor cuota Variable']))}
            ${generateFormGroup('Nº comparado', 'field_scoring_comparado', 'readonly', f['Nº comparado'] !== undefined ? f['Nº comparado'] : '')}
            <!-- Clientes Asociados -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Clientes</h4></div>
            <div id="linked-contacts-section-container" style="grid-column: 1 / -1; width: 100%; display: flex; flex-direction: column; gap: 1rem; box-sizing: border-box;">
                <!-- Dynamically populated by renderLinkedContactsSection -->
            </div>

            <!-- Documentos -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Documentos</h4></div>
            <div id="documentos-section-container" style="grid-column: 1 / -1; width: 100%; display: flex; flex-direction: column; gap: 1rem; box-sizing: border-box;">
                <!-- Dynamically populated by renderDocumentosSection -->
            </div>

            <!-- Productos hipotecarios compatibles -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Productos hipotecarios compatibles</h4></div>
            <div id="compatible-products-container" style="grid-column: 1 / -1; width: 100%; min-height: 100px; display: flex; flex-direction: column; gap: 0.5rem; justify-content: center; box-sizing: border-box;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; color: #64748b;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--secondary);"></i>
                    <span style="font-family: 'Inter', sans-serif; font-size: 0.95rem;">Cargando productos compatibles...</span>
                </div>
            </div>

            <!-- Productos hipotecarios a estudiar -->
            <div style="grid-column: 1 / -1; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 1.5rem;"><h4 style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif;">Productos hipotecarios a estudiar</h4></div>
            <div id="estudiar-products-container" style="grid-column: 1 / -1; width: 100%; min-height: 100px; display: flex; flex-direction: column; gap: 0.5rem; justify-content: center; box-sizing: border-box;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; color: #64748b;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--secondary);"></i>
                    <span style="font-family: 'Inter', sans-serif; font-size: 0.95rem;">Cargando productos a estudiar...</span>
                </div>
            </div>
        `;
        
        // Initialize and render Clientes section dynamically
        let rawContacts = f['Contact'] || [];
        if (!Array.isArray(rawContacts)) {
            rawContacts = rawContacts ? [rawContacts] : [];
        }
        activeStudyLinkedContactIds = [...rawContacts];
        renderLinkedContactsSection();

        // Render Documentos section
        renderDocumentosSection();

        // Carga asíncrona de los productos compatibles y a estudiar
        loadCompatibleProducts(id);
    }
    
    modalOverlay.classList.add('active');
}

async function loadCompatibleProducts(studyId) {
    const container = document.getElementById('compatible-products-container');
    const estudiarContainer = document.getElementById('estudiar-products-container');
    if (!container || !estudiarContainer) return;

    try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error('No estás autenticado');
        const token = await user.getIdToken();

        const response = await fetch(`/.netlify/functions/get-comparador-data?studyId=${studyId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al obtener productos');

        const products = data.products || [];

        // Store globally to prevent quoting issues when passing variables to inline event handlers
        currentCompatibleProducts = products;

        // Split products by outcome
        const viableProducts = products.filter(p => p.resultado === 'Viable');
        const estudiarProducts = products.filter(p => p.resultado === 'Estudiar');

        // Render Viable (Compatible) Products Table
        if (viableProducts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-info-circle"></i>
                    <div style="font-weight: 700; font-family: 'Inter', sans-serif; font-size: 0.95rem; color: #475569;">Sin productos compatibles</div>
                    <div style="font-size: 0.85rem; color: #64748b; font-family: 'Inter', sans-serif;">No hay propuestas viables asociadas a este estudio.</div>
                </div>
            `;
        } else {
            // Sort viable products by interests ascending
            viableProducts.sort((a, b) => {
                const intA = a.intereses !== null && a.intereses !== undefined ? parseFloat(a.intereses) : Infinity;
                const intB = b.intereses !== null && b.intereses !== undefined ? parseFloat(b.intereses) : Infinity;
                return intA - intB;
            });

            container.innerHTML = `
                <div class="compatible-products-table-wrapper">
                    <table class="compatible-products-table">
                        <thead>
                            <tr>
                                <th>Hipoteca</th>
                                <th style="text-align: right;">Total intereses pagados</th>
                                <th style="text-align: right;">Cuota Periodo Inicial</th>
                                <th style="text-align: right;">Cuota Periodo final</th>
                                <th style="text-align: center;">TIN Bonificado</th>
                                <th>Detalle hipoteca</th>
                                <th style="text-align: center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${viableProducts.map(p => {
                                const tinBonifPct = p.tinBonif !== null && p.tinBonif !== undefined
                                    ? `${(parseFloat(p.tinBonif) * 100).toFixed(2)}%`
                                    : 'N/D';
                                
                                const cleanDetails = p.detalle 
                                    ? p.detalle.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() 
                                    : 'Sin detalles';

                                return `
                                    <tr>
                                        <td>
                                            <span class="product-tag">${p.producto || 'N/D'}</span>
                                        </td>
                                        <td style="text-align: right; font-weight: 600;">
                                            ${formatCurrency(p.intereses)}
                                        </td>
                                        <td style="text-align: right; font-weight: 600; color: var(--primary);">
                                            ${formatCurrency(p.cuotaP1)}
                                        </td>
                                        <td style="text-align: right; font-weight: 600; color: var(--primary);">
                                            ${formatCurrency(p.cuotaP2)}
                                        </td>
                                        <td style="text-align: center;">
                                            <span class="percentage-badge">${tinBonifPct}</span>
                                        </td>
                                        <td style="font-size: 0.85rem; color: #475569; max-width: 500px; white-space: normal; word-break: break-word;">
                                            ${cleanDetails}
                                        </td>
                                        <td style="text-align: center;">
                                            <button type="button" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; border-radius: 6px; font-family: 'Inter', sans-serif; background: #64748b; border: none; color: white; cursor: pointer; font-weight: 600;" onclick="openEuriborModal('${p.id}')">Euribor</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // Render Estudiar Products Table
        if (estudiarProducts.length === 0) {
            estudiarContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-info-circle"></i>
                    <div style="font-weight: 700; font-family: 'Inter', sans-serif; font-size: 0.95rem; color: #475569;">Sin productos a estudiar</div>
                    <div style="font-size: 0.85rem; color: #64748b; font-family: 'Inter', sans-serif;">No hay propuestas a estudiar asociadas a este estudio.</div>
                </div>
            `;
        } else {
            // Sort estudiar products by interests ascending
            estudiarProducts.sort((a, b) => {
                const intA = a.intereses !== null && a.intereses !== undefined ? parseFloat(a.intereses) : Infinity;
                const intB = b.intereses !== null && b.intereses !== undefined ? parseFloat(b.intereses) : Infinity;
                return intA - intB;
            });

            estudiarContainer.innerHTML = `
                <div class="compatible-products-table-wrapper">
                    <table class="compatible-products-table">
                        <thead>
                            <tr>
                                <th>Hipoteca</th>
                                <th style="text-align: right;">Total intereses pagados</th>
                                <th style="text-align: right;">Cuota Periodo Inicial</th>
                                <th style="text-align: right;">Cuota Periodo final</th>
                                <th style="text-align: center;">TIN Bonificado</th>
                                <th>💡Requisitos</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${estudiarProducts.map(p => {
                                const tinBonifPct = p.tinBonif !== null && p.tinBonif !== undefined
                                    ? `${(parseFloat(p.tinBonif) * 100).toFixed(2)}%`
                                    : 'N/D';
                                
                                const cleanRequisitos = p.requisitos 
                                    ? p.requisitos.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() 
                                    : 'Sin requisitos';

                                return `
                                    <tr>
                                        <td>
                                            <span class="product-tag" style="background: #fff7ed; color: #c2410c; border: 1px solid #ffedd5;">${p.producto || 'N/D'}</span>
                                        </td>
                                        <td style="text-align: right; font-weight: 600;">
                                            ${formatCurrency(p.intereses)}
                                        </td>
                                        <td style="text-align: right; font-weight: 600; color: var(--primary);">
                                            ${formatCurrency(p.cuotaP1)}
                                        </td>
                                        <td style="text-align: right; font-weight: 600; color: var(--primary);">
                                            ${formatCurrency(p.cuotaP2)}
                                        </td>
                                        <td style="text-align: center;">
                                            <span class="percentage-badge" style="background: #fffbeb; color: #b45309;">${tinBonifPct}</span>
                                        </td>
                                        <td style="font-size: 0.85rem; color: #475569; max-width: 500px; white-space: normal; word-break: break-word;">
                                            ${cleanRequisitos}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

    } catch (err) {
        console.error("Error loading products:", err);
        const errMsg = `
            <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 12px; padding: 1rem; color: #b91c1c; display: flex; align-items: center; gap: 0.5rem; font-family: 'Inter', sans-serif; font-size: 0.9rem;">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Error al cargar productos: ${err.message}</span>
            </div>
        `;
        container.innerHTML = errMsg;
        estudiarContainer.innerHTML = errMsg;
    }
}

function openEuriborModal(productId) {
    const product = currentCompatibleProducts.find(p => p.id === productId);
    if (!product) return;

    const modalOverlay = document.getElementById('euriborModalOverlay');
    const modalTitle = document.getElementById('euriborModalTitle');
    const productIdInput = document.getElementById('euriborProductId');
    
    const fEuribor = document.getElementById('field_euribor');
    const fMejorEuribor = document.getElementById('field_mejor_euribor');
    const fEuriborPromedio = document.getElementById('field_euribor_promedio');
    const fPeorEuribor = document.getElementById('field_peor_euribor');

    if (!modalOverlay || !productIdInput) return;

    modalOverlay.style.zIndex = '20000';

    modalTitle.textContent = `Ajustes Euribor - ${product.producto || 'N/D'}`;
    productIdInput.value = productId;

    const euribor = product.euribor;
    const mejorEuribor = product.mejorEuribor;
    const euriborPromedio = product.euriborPromedio;
    const peorEuribor = product.peorEuribor;

    // Display values in % form (multiply by 100). If null/undefined, keep empty.
    fEuribor.value = euribor !== null && euribor !== undefined ? parseFloat((parseFloat(euribor) * 100).toFixed(3)) : '';
    fMejorEuribor.value = mejorEuribor !== null && mejorEuribor !== undefined ? parseFloat((parseFloat(mejorEuribor) * 100).toFixed(3)) : '';
    fEuriborPromedio.value = euriborPromedio !== null && euriborPromedio !== undefined ? parseFloat((parseFloat(euriborPromedio) * 100).toFixed(3)) : '';
    fPeorEuribor.value = peorEuribor !== null && peorEuribor !== undefined ? parseFloat((parseFloat(peorEuribor) * 100).toFixed(3)) : '';

    modalOverlay.classList.add('active');
}

function closeEuriborModal() {
    const modalOverlay = document.getElementById('euriborModalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
}

async function saveEuriborChanges(event) {
    event.preventDefault();
    const id = document.getElementById('euriborProductId').value;
    const btn = document.getElementById('btnSaveEuribor');

    const fEuribor = document.getElementById('field_euribor').value.trim();
    const fMejorEuribor = document.getElementById('field_mejor_euribor').value.trim();
    const fEuriborPromedio = document.getElementById('field_euribor_promedio').value.trim();
    const fPeorEuribor = document.getElementById('field_peor_euribor').value.trim();

    // Convert % to decimal (divide by 100) or null if empty
    const fields = {
        'Euribor': fEuribor !== '' ? parseFloat(fEuribor) / 100 : null,
        'Mejor Euribor': fMejorEuribor !== '' ? parseFloat(fMejorEuribor) / 100 : null,
        'Euribor promedio': fEuriborPromedio !== '' ? parseFloat(fEuriborPromedio) / 100 : null,
        'Peor Euribor': fPeorEuribor !== '' ? parseFloat(fPeorEuribor) / 100 : null
    };

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
            body: JSON.stringify({ type: 'comparador', id, fields })
        });

        let responseData = {};
        const responseText = await response.text();
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            console.error("Non-JSON response from server:", responseText);
            throw new Error(`Error del servidor (${response.status}): devuelto un formato no válido.`);
        }

        if (!response.ok) {
            throw new Error(responseData.details || responseData.error || 'Error al guardar los cambios');
        }

        alert('Ajustes de Euribor guardados con éxito');
        closeEuriborModal();
        
        // Refresh the compatible products table! We need the active studyId.
        const studyIdInput = document.getElementById('editRecordId');
        if (studyIdInput && studyIdInput.value) {
            loadCompatibleProducts(studyIdInput.value);
        }
    } catch (err) {
        console.error("Error saving Euribor changes:", err);
        alert('Error: ' + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function generateFormGroup(label, id, type, value, options = null) {
    let inputHTML = '';
    if (type === 'select' && options) {
        inputHTML = `<select id="${id}" class="form-control" style="padding: 0.8rem; border: 1px solid #ddd; border-radius: 8px; width: 100%; font-family: 'Inter', sans-serif; font-size: 0.95rem; background: white; color: var(--primary);">
            <option value="" ${value === undefined || value === null || value === '' ? 'selected' : ''}>-- Seleccionar --</option>
            ${options.map(opt => `<option value="${opt}" ${String(opt) === String(value) ? 'selected' : ''}>${opt}</option>`).join('')}
        </select>`;
    } else if (type === 'readonly') {
        inputHTML = `<input type="text" id="${id}" class="form-control" value="${value !== undefined && value !== null ? value : ''}" readonly style="padding: 0.8rem; border: 1px solid #e2e8f0; border-radius: 8px; width: 100%; font-family: 'Inter', sans-serif; font-size: 0.95rem; background-color: #f8fafc; color: #64748b; cursor: not-allowed;">`;
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

// ── Clientes Management Functions inside Estudio Hipotecario Modal ───────────────────
function renderLinkedContactsSection() {
    const container = document.getElementById('linked-contacts-section-container');
    if (!container) return;

    // Find the active study in currentRecords
    const activeStudyIdInput = document.getElementById('editRecordId');
    if (!activeStudyIdInput || !activeStudyIdInput.value) return;
    const record = currentRecords.find(r => r.id === activeStudyIdInput.value);
    const f = record ? (record.fields || {}) : {};

    // Map through the active study's linked contact IDs
    const linkedContacts = activeStudyLinkedContactIds.map(contactId => {
        const cc = currentContacts.find(c => c.id === contactId);
        if (cc) {
            return {
                id: cc.id,
                name: cc.name || 'Sin nombre',
                email: cc.email || 'Sin email',
                phone: cc.phone || 'Sin teléfono',
                isExternal: false
            };
        } else {
            // Find in study rollups as fallback
            const index = activeStudyLinkedContactIds.indexOf(contactId);
            let name = 'Contacto Externo';
            let phone = 'N/D';
            
            if (index !== -1) {
                if (f['Nombre y apellidos (from Contact)'] && f['Nombre y apellidos (from Contact)'][index]) {
                    name = f['Nombre y apellidos (from Contact)'][index];
                }
                if (f['Telefono'] && f['Telefono'][index]) {
                    phone = f['Telefono'][index];
                }
            }
            return {
                id: contactId,
                name: name,
                email: 'N/D',
                phone: phone,
                isExternal: true
            };
        }
    });

    // Find contacts available to link (present in currentContacts but not already linked)
    // Filter to ensure associates/admins only see contacts matching the active study's associate record(s)
    const studyAssocIds = f['Franquiciados'] || [];
    const loggedInAssocId = currentUserFranquiciadoId || localStorage.getItem('currentUserFranquiciadoId');

    const availableContacts = currentContacts.filter(c => {
        // Must not be already linked
        if (activeStudyLinkedContactIds.includes(c.id)) return false;

        // Filter to ensure associate sees only their own clients
        const contactAssocIds = c.fields?.['Franquiciados'] || [];

        // 1. If study is linked to specific associates, the contact must belong to one of those associates
        if (studyAssocIds.length > 0) {
            return contactAssocIds.some(id => studyAssocIds.includes(id));
        }

        // 2. If study is not linked to any associate yet, check if the contact belongs to the logged-in associate
        if (loggedInAssocId) {
            return contactAssocIds.includes(loggedInAssocId);
        }

        // 3. Fallback: allow if no associate IDs are defined anywhere
        return true;
    });

    let contactsGridHTML = '';
    if (linkedContacts.length === 0) {
        contactsGridHTML = `
            <div style="background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 16px; padding: 2.5rem 1.5rem; text-align: center; color: #64748b;">
                <i class="fas fa-user-friends" style="font-size: 2rem; color: #cbd5e1; margin-bottom: 0.75rem;"></i>
                <div style="font-weight: 700; font-family: 'Inter', sans-serif; font-size: 0.95rem; color: #475569;">Sin clientes vinculados</div>
                <div style="font-size: 0.85rem; color: #64748b; font-family: 'Inter', sans-serif; margin-top: 0.25rem;">Vincule un cliente existente abajo o cree uno nuevo.</div>
            </div>
        `;
    } else {
        contactsGridHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; width: 100%; box-sizing: border-box;">
                ${linkedContacts.map(c => {
                    const nameParts = c.name.trim().split(/\s+/);
                    const initials = (nameParts[0]?.charAt(0) || '') + (nameParts[1]?.charAt(0) || '');
                    
                    return `
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.2rem; position: relative; display: flex; align-items: center; gap: 1rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)'; this.style.borderColor='var(--secondary)'; this.querySelector('.edit-pencil-icon').style.opacity='1'; this.querySelector('.edit-pencil-icon').style.transform='scale(1.1)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)'; this.style.borderColor='#e2e8f0'; this.querySelector('.edit-pencil-icon').style.opacity='0.4'; this.querySelector('.edit-pencil-icon').style.transform='none';" onclick="openContactDetailOverlay('${c.id}')">
                            <div style="width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); color: #1d4ed8; font-size: 1rem; flex-shrink: 0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.04);">
                                ${initials.toUpperCase()}
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 0.25rem; overflow: hidden; font-family: 'Inter', sans-serif;">
                                <span style="font-weight: 800; color: var(--primary); font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;" title="${c.name}">
                                    ${c.name}
                                </span>
                                <span style="font-size: 0.8rem; color: #64748b; display: flex; align-items: center; gap: 0.35rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;" title="${c.email}">
                                    <i class="fas fa-envelope" style="font-size: 0.75rem; color: #94a3b8;"></i> ${c.email}
                                </span>
                                <span style="font-size: 0.8rem; color: #64748b; display: flex; align-items: center; gap: 0.35rem;">
                                    <i class="fas fa-phone-alt" style="font-size: 0.75rem; color: #94a3b8;"></i> ${c.phone}
                                </span>
                            </div>
                            
                            <!-- Edit Pencil Icon -->
                            <div class="edit-pencil-icon" style="position: absolute; bottom: 0.8rem; right: 0.8rem; font-size: 0.85rem; color: var(--secondary); opacity: 0.4; transition: all 0.2s; pointer-events: none;" title="Editar ficha de cliente">
                                <i class="fas fa-pencil-alt"></i>
                            </div>

                            <!-- Unlink Action -->
                            <button type="button" style="position: absolute; top: 0.6rem; right: 0.6rem; background: none; border: none; color: #cbd5e1; font-size: 0.9rem; cursor: pointer; padding: 0.25rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s; border-radius: 50%; width: 22px; height: 22px;" onmouseover="this.style.color='#ef4444'; this.style.background='#fef2f2';" onmouseout="this.style.color='#cbd5e1'; this.style.background='none';" onclick="event.stopPropagation(); unlinkContactFromActiveStudy('${c.id}')" title="Desvincular cliente">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1rem; width: 100%; box-sizing: border-box;">
            <!-- Linked grid -->
            ${contactsGridHTML}

            <!-- Link new client panel -->
            <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 16px; padding: 1.2rem; display: flex; flex-direction: column; gap: 0.8rem; box-sizing: border-box;">
                <div style="font-size: 0.85rem; font-weight: 800; color: #475569; display: flex; align-items: center; justify-content: space-between; font-family: 'Inter', sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
                    <span>Vincular un cliente existente</span>
                    <button type="button" style="background: none; border: none; color: var(--secondary); font-weight: 800; cursor: pointer; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.3rem; font-family: 'Inter', sans-serif; padding: 0;" onclick="openNewContactModal()">
                        <i class="fas fa-plus-circle" style="font-size: 0.9rem;"></i> + Crear Nuevo
                    </button>
                </div>
                <div style="display: flex; gap: 0.75rem; width: 100%; box-sizing: border-box; align-items: center;">
                    <select id="select-contact-to-link" style="flex: 1; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 10px; font-family: 'Inter', sans-serif; font-size: 0.92rem; background: white; color: var(--primary); outline: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: border-color 0.2s;" onfocus="this.style.borderColor='var(--secondary)'" onblur="this.style.borderColor='#cbd5e1'">
                        <option value="">-- Seleccionar cliente --</option>
                        ${availableContacts.length === 0 
                            ? `<option value="" disabled>Todos tus contactos ya están vinculados</option>` 
                            : availableContacts.map(c => `<option value="${c.id}">${c.name} (${c.email})</option>`).join('')}
                    </select>
                    <button type="button" class="btn btn-secondary" style="padding: 0.75rem 1.5rem; font-size: 0.88rem; font-family: 'Inter', sans-serif; font-weight: 700; border-radius: 10px; cursor: pointer;" onclick="linkContactToActiveStudy()">
                        Vincular
                    </button>
                </div>
            </div>
        </div>
    `;
}

function linkContactToActiveStudy() {
    const select = document.getElementById('select-contact-to-link');
    if (!select) return;
    const contactId = select.value;
    if (!contactId) {
        alert('Por favor, selecciona un contacto para vincular.');
        return;
    }
    
    if (!activeStudyLinkedContactIds.includes(contactId)) {
        activeStudyLinkedContactIds.push(contactId);
        renderLinkedContactsSection();
    }
}

function unlinkContactFromActiveStudy(contactId) {
    activeStudyLinkedContactIds = activeStudyLinkedContactIds.filter(id => id !== contactId);
    renderLinkedContactsSection();
}

function openContactDetailOverlay(contactId) {
    let contact = currentContacts.find(c => c.id === contactId);
    let f = contact ? (contact.fields || {}) : {};

    if (!contact) {
        // Fallback builder using active study rollup fields
        const activeStudyIdInput = document.getElementById('editRecordId');
        const record = activeStudyIdInput ? currentRecords.find(r => r.id === activeStudyIdInput.value) : null;
        const studyFields = record ? (record.fields || {}) : {};
        
        const index = activeStudyLinkedContactIds.indexOf(contactId);
        let fallbackName = 'Contacto Externo';
        let fallbackPhone = '';
        let fallbackEmail = '';
        
        if (index !== -1) {
            if (studyFields['Nombre y apellidos (from Contact)'] && studyFields['Nombre y apellidos (from Contact)'][index]) {
                fallbackName = studyFields['Nombre y apellidos (from Contact)'][index];
            }
            if (studyFields['Telefono'] && studyFields['Telefono'][index]) {
                fallbackPhone = studyFields['Telefono'][index];
            }
            if (studyFields['Email (from Contact)'] && studyFields['Email (from Contact)'][index]) {
                fallbackEmail = studyFields['Email (from Contact)'][index];
            } else if (studyFields['email contacto'] && studyFields['email contacto'][index]) {
                fallbackEmail = studyFields['email contacto'][index];
            } else if (studyFields['Email'] && studyFields['Email'][index]) {
                fallbackEmail = studyFields['Email'][index];
            }
        }

        contact = {
            id: contactId,
            name: fallbackName,
            email: fallbackEmail || 'N/D',
            phone: fallbackPhone || 'N/D',
            fields: {
                'Nombre y apellidos': fallbackName,
                'Email': fallbackEmail,
                'Telefono': fallbackPhone,
                'Numero documento': '',
                'Notas': ''
            }
        };
        f = contact.fields;
    }

    let modalOverlay = document.getElementById('contactDetailModalOverlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'contactDetailModalOverlay';
        modalOverlay.className = 'edit-modal-overlay';
        document.body.appendChild(modalOverlay);
    }
    modalOverlay.style.zIndex = '20000';

    modalOverlay.innerHTML = `
        <div class="edit-modal-card" style="max-width: 600px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.15);">
            <div class="edit-modal-header" style="border-bottom: 1px solid #e2e8f0; padding: 1.5rem 2rem; display: flex; justify-content: space-between; align-items: center;">
                <h3 id="contactDetailModalTitle" style="color: var(--primary); font-weight: 800; font-family: 'Inter', sans-serif; display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1.25rem;">
                    <i class="fas fa-id-card" style="color: var(--secondary);"></i> Editar Ficha del Cliente
                </h3>
                <button type="button" class="edit-modal-close" style="background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #64748b;" onclick="closeContactDetailOverlay()"><i class="fas fa-times"></i></button>
            </div>
            <div class="edit-modal-body" id="contactDetailModalBody" style="padding: 2rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 1.5rem;">
                <!-- Content will be injected dynamically -->
            </div>
            <div class="edit-modal-footer" style="border-top: 1px solid #e2e8f0; padding: 1.5rem 2rem; background: #f8fafc; display: flex; justify-content: flex-end; gap: 0.75rem;">
                <button type="button" class="btn btn-outline" style="padding: 0.6rem 1.5rem;" onclick="closeContactDetailOverlay()">Cancelar</button>
                <button type="button" id="btnSaveOverlayContact" class="btn btn-primary" style="padding: 0.6rem 1.5rem;" onclick="saveOverlayContactChanges('${contactId}')">Guardar Cambios</button>
            </div>
        </div>
    `;

    const body = document.getElementById('contactDetailModalBody');
    if (!body) return;

    const nameParts = contact.name.trim().split(/\s+/);
    const initials = (nameParts[0]?.charAt(0) || '') + (nameParts[1]?.charAt(0) || '');

    const status = f['Estado'] || 'Pendiente';
    let statusBg = '#fef3c7';
    let statusColor = '#d97706';
    if (status === 'Cerrado' || status === 'Aprobado') {
        statusBg = '#dcfce7';
        statusColor = '#16a34a';
    } else if (status === 'Rechazado' || status === 'Baja') {
        statusBg = '#fee2e2';
        statusColor = '#ef4444';
    }

    body.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1.5rem; background: #f8fafc; border-radius: 16px; padding: 1.5rem; border: 1px solid #e2e8f0;">
            <div style="width: 70px; height: 70px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.75rem; background: linear-gradient(135deg, var(--secondary) 0%, #1e3a8a 100%); color: white;">
                ${initials.toUpperCase()}
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.35rem; font-family: 'Inter', sans-serif;">
                <span style="font-size: 1.25rem; font-weight: 800; color: var(--primary);">${contact.name}</span>
                <span style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; background: ${statusBg}; color: ${statusColor}; width: fit-content; text-transform: uppercase;">
                    ${status}
                </span>
            </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 1.2rem; font-family: 'Inter', sans-serif;">
            <h4 style="color: var(--primary); font-weight: 800; font-size: 1rem; margin: 0 0 0.2rem 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.4rem;">Datos de Contacto (Editables)</h4>
            
            <div style="display: grid; grid-template-columns: 1fr; gap: 1.2rem;">
                ${generateFormGroup('Nombre y apellidos', 'overlay_contact_name', 'text', contact.name)}
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.2rem;">
                ${generateFormGroup('Email', 'overlay_contact_email', 'email', contact.email)}
                ${generateFormGroup('Teléfono', 'overlay_contact_phone', 'tel', contact.phone)}
            </div>

            <h4 style="color: var(--primary); font-weight: 800; font-size: 1rem; margin: 1rem 0 0.2rem 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.4rem;">Información Adicional (Editable)</h4>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.2rem;">
                ${generateFormGroup('NIF/NIE', 'overlay_contact_nif', 'text', f['Numero documento'] || f['NIF'] || f['DNI'] || f['NIF (from Contact)'] || '')}
                ${generateFormGroup('Origen / Recomendado por (Lectura)', 'overlay_contact_origen', 'readonly', f['referido por'] || f['Recomendado por'] || 'Directo')}
                
                <div class="form-group" style="display: flex; flex-direction: column; gap: 0.5rem; grid-column: span 2;">
                    <label style="font-weight: 600; color: #475569; font-size: 0.88rem; text-align: left;">Notas / Comentarios</label>
                    <textarea id="overlay_contact_notas" class="form-control" style="padding: 0.8rem; border: 1px solid #ddd; border-radius: 8px; width: 100%; font-family: 'Inter', sans-serif; font-size: 0.95rem; color: var(--primary); min-height: 80px; box-sizing: border-box; resize: vertical;">${f['Notas'] || f['Comentarios'] || ''}</textarea>
                </div>
            </div>
        </div>
    `;

    modalOverlay.classList.add('active');
}

function closeContactDetailOverlay() {
    const modalOverlay = document.getElementById('contactDetailModalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
}

async function saveOverlayContactChanges(contactId) {
    const btn = document.getElementById('btnSaveOverlayContact');
    if (!btn) return;

    const name = document.getElementById('overlay_contact_name').value.trim();
    const email = document.getElementById('overlay_contact_email').value.trim();
    const phone = document.getElementById('overlay_contact_phone').value.trim();
    const nif = document.getElementById('overlay_contact_nif').value.trim();
    const notas = document.getElementById('overlay_contact_notas').value.trim();

    if (!name || !email || !phone) {
        alert('Nombre, Email y Teléfono son obligatorios.');
        return;
    }

    const phoneRegex = /^[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
        alert('El teléfono debe tener exactamente 9 dígitos.');
        return;
    }

    const originalText = btn.textContent;
    btn.textContent = 'Guardando...';
    btn.disabled = true;

    try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error('No estás autenticado');
        const token = await user.getIdToken();

        const fields = {
            'Nombre y apellidos': name,
            'Email': email,
            'Telefono': phone,
            'Numero documento': nif,
            'Notas': notas
        };

        const response = await fetch('/.netlify/functions/update-portal-record', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: 'contact', id: contactId, fields })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al guardar los cambios del cliente');

        alert('¡Cliente actualizado correctamente!');
        closeContactDetailOverlay();
        await loadDashboardData();
    } catch (err) {
        console.error("Error saving overlay contact:", err);
        alert('Error: ' + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ── Documentos Section inside Estudio Hipotecario Modal ───────────────────
function renderDocumentosSection() {
    const container = document.getElementById('documentos-section-container');
    if (!container) return;

    const activeStudyIdInput = document.getElementById('editRecordId');
    if (!activeStudyIdInput || !activeStudyIdInput.value) return;
    const studyId = activeStudyIdInput.value;
    const record = currentRecords.find(r => r.id === studyId);
    if (!record) return;
    const f = record.fields || {};

    const aeropageUrl = f['Aeropage'] || '';
    const enviarFirma = !!f['Enviar a firma'];

    // Descargar Análisis PDF Button styling
    let downloadBtnHTML = '';
    if (aeropageUrl) {
        downloadBtnHTML = `
            <a href="${aeropageUrl}" target="_blank" class="btn" style="flex: 1; min-width: 200px; display: inline-flex; align-items: center; justify-content: center; gap: 0.8rem; padding: 0.9rem 1.5rem; border-radius: 12px; font-weight: 700; font-family: 'Inter', sans-serif; font-size: 0.95rem; text-decoration: none; transition: all 0.2s ease; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.2), 0 2px 4px -1px rgba(37,99,235,0.1); cursor: pointer; text-align: center; box-sizing: border-box;">
                <i class="fas fa-file-pdf" style="font-size: 1.2rem;"></i>
                Descargar análisis pdf
            </a>
        `;
    } else {
        downloadBtnHTML = `
            <button class="btn" disabled style="flex: 1; min-width: 200px; display: inline-flex; align-items: center; justify-content: center; gap: 0.8rem; padding: 0.9rem 1.5rem; border-radius: 12px; font-weight: 700; font-family: 'Inter', sans-serif; font-size: 0.95rem; background: #e2e8f0; color: #94a3b8; border: none; cursor: not-allowed; opacity: 0.7; text-align: center; box-sizing: border-box;">
                <i class="fas fa-file-pdf" style="font-size: 1.2rem;"></i>
                Descargar análisis pdf (No disponible)
            </button>
        `;
    }

    // Enviar a firma digital Button styling
    let signatureBtnHTML = '';
    if (enviarFirma) {
        signatureBtnHTML = `
            <button onclick="toggleEnviarFirma('${studyId}', false)" class="btn" style="flex: 1; min-width: 200px; display: inline-flex; align-items: center; justify-content: center; gap: 0.8rem; padding: 0.9rem 1.5rem; border-radius: 12px; font-weight: 700; font-family: 'Inter', sans-serif; font-size: 0.95rem; transition: all 0.2s ease; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; box-shadow: 0 4px 6px -1px rgba(16,185,129,0.2), 0 2px 4px -1px rgba(16,185,129,0.1); cursor: pointer; text-align: center; box-sizing: border-box;">
                <i class="fas fa-file-signature" style="font-size: 1.2rem;"></i>
                Enviado a firma digital (Desmarcar)
            </button>
        `;
    } else {
        signatureBtnHTML = `
            <button onclick="toggleEnviarFirma('${studyId}', true)" class="btn" style="flex: 1; min-width: 200px; display: inline-flex; align-items: center; justify-content: center; gap: 0.8rem; padding: 0.9rem 1.5rem; border-radius: 12px; font-weight: 700; font-family: 'Inter', sans-serif; font-size: 0.95rem; transition: all 0.2s ease; background: transparent; color: #475569; border: 2px solid #cbd5e1; cursor: pointer; text-align: center; box-sizing: border-box;">
                <i class="fas fa-file-signature" style="font-size: 1.2rem; color: #64748b;"></i>
                Enviar a firma digital
            </button>
        `;
    }

    container.innerHTML = `
        <div style="display: flex; flex-wrap: wrap; gap: 1rem; width: 100%; box-sizing: border-box;">
            ${downloadBtnHTML}
            ${signatureBtnHTML}
        </div>
    `;
}

async function toggleEnviarFirma(studyId, targetValue) {
    const container = document.getElementById('documentos-section-container');
    if (!container) return;
    
    const originalHTML = container.innerHTML;
    
    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 1rem; color: #64748b; width: 100%;">
            <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--secondary);"></i>
            <span style="font-family: 'Inter', sans-serif; font-size: 0.95rem;">Actualizando firma digital...</span>
        </div>
    `;

    try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error('No estás autenticado');
        const token = await user.getIdToken();

        const fields = {
            'Enviar a firma': targetValue
        };

        const response = await fetch('/.netlify/functions/update-portal-record', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: 'estudio', id: studyId, fields })
        });

        let responseData = {};
        const responseText = await response.text();
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            console.error("Non-JSON response from server:", responseText);
            throw new Error(`Error del servidor (${response.status}): Formato no válido.`);
        }

        if (!response.ok) {
            throw new Error(responseData.details || responseData.error || 'Error al actualizar firma');
        }

        const record = currentRecords.find(r => r.id === studyId);
        if (record) {
            if (!record.fields) record.fields = {};
            record.fields['Enviar a firma'] = targetValue;
        }

        renderDocumentosSection();
        
        loadDashboardData().catch(err => console.error("Error refreshing dashboard background:", err));

        alert(targetValue ? '¡Solicitud de firma digital activada con éxito!' : '¡Solicitud de firma digital desactivada con éxito!');
    } catch (err) {
        console.error("Error toggling signature:", err);
        alert('Error: ' + err.message);
        container.innerHTML = originalHTML;
    }
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
            'Años hipoteca': getNumberFromInput('field_anos_hipoteca', true),

            'Habeis encontrado propiedad': document.getElementById('field_encontrado_propiedad').value || null,
            'Precio del inmueble': getNumberFromInput('field_precio_inmueble'),
            'Finalidad': document.getElementById('field_finalidad').value || null,
            'Tipo vivienda': document.getElementById('field_tipo_vivienda').value || null,
            'Localidad inmueble': document.getElementById('field_localidad_inmueble').value || null,
            'CP Localidad': document.getElementById('field_cp_localidad').value || null,
            'Tipo prestamo': document.getElementById('field_tipo_prestamo').value || null,
            'Deduccion ITP': document.getElementById('field_deduccion_itp').value || null,
            'Tasacion': getNumberFromInput('field_tasacion')
        };
        
        for (const [key, val] of Object.entries(newFields)) {
            if (hasFieldChanged(val, origFields[key])) {
                fields[key] = val;
            }
        }

        // Compare Contact array carefully to see if clients linkage has changed
        const origContact = origFields['Contact'] || [];
        const activeContact = activeStudyLinkedContactIds || [];
        
        // Sort both arrays to ensure order differences don't trigger a false change
        const sortedOrig = [...origContact].sort();
        const sortedActive = [...activeContact].sort();
        
        const contactsChanged = sortedOrig.length !== sortedActive.length || 
                                sortedOrig.some((val, idx) => val !== sortedActive[idx]);
        
        if (contactsChanged) {
            fields['Contact'] = activeStudyLinkedContactIds;
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
                ${renderSemaforoCard('20% + gastos', f['Semafor20masgatos'])}
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

// ── Studies Filtering Functions ───────────────────────────────────────────────

function populateFilterDropdowns(records) {
    const estadoSelect = document.getElementById('filter-estado');
    const etapaSelect = document.getElementById('filter-etapa');
    
    if (!estadoSelect || !etapaSelect) return;
    
    // Save current selection to restore it if possible
    const prevEstado = estadoSelect.value;
    const prevEtapa = etapaSelect.value;

    // Reset selects but keep first option
    estadoSelect.innerHTML = '<option value="">Todos los estados</option>';
    etapaSelect.innerHTML = '<option value="">Todas las etapas</option>';

    const uniqueEstados = new Set();
    const uniqueEtapas = new Set();

    records.forEach(r => {
        const f = r.fields || {};
        if (r.status) uniqueEstados.add(r.status);
        if (f['Etapa']) uniqueEtapas.add(f['Etapa']);
    });

    // Populate unique estados
    Array.from(uniqueEstados).sort().forEach(est => {
        const opt = document.createElement('option');
        opt.value = est;
        opt.textContent = est;
        if (est === prevEstado) opt.selected = true;
        estadoSelect.appendChild(opt);
    });

    // Populate unique etapas
    Array.from(uniqueEtapas).sort().forEach(etp => {
        const opt = document.createElement('option');
        opt.value = etp;
        opt.textContent = etp;
        if (etp === prevEtapa) opt.selected = true;
        etapaSelect.appendChild(opt);
    });
}

function applyFilters() {
    const contactQuery = document.getElementById('filter-contacto').value.toLowerCase().trim();
    const selectedEstado = document.getElementById('filter-estado').value;
    const selectedEtapa = document.getElementById('filter-etapa').value;
    const selectedViabilidad = document.getElementById('filter-viabilidad').value;

    const filtered = currentRecords.filter(record => {
        const f = record.fields || {};
        
        // 1. Contacto filter (search name)
        const name = (record.contactName || 'N/A').toLowerCase();
        if (contactQuery && !name.includes(contactQuery)) {
            return false;
        }

        // 2. Estado filter
        const estado = record.status || 'Pendiente';
        if (selectedEstado && estado !== selectedEstado) {
            return false;
        }

        // 3. Etapa filter
        const etapa = f['Etapa'] || '';
        if (selectedEtapa && etapa !== selectedEtapa) {
            return false;
        }

        // 4. Viabilidad filter
        const viabilidad = (f['Viabilidad'] || '').toLowerCase();
        if (selectedViabilidad) {
            if (selectedViabilidad === 'viable') {
                if (!viabilidad.includes('viable') || viabilidad.includes('no viable') || viabilidad.includes('🔴') || viabilidad.includes('no_viable')) return false;
            } else if (selectedViabilidad === 'no viable') {
                if (!viabilidad.includes('no viable') && !viabilidad.includes('🔴') && !viabilidad.includes('no_viable')) return false;
            } else if (selectedViabilidad === 'pendiente') {
                if (viabilidad) return false;
            }
        }

        return true;
    });

    renderEstudiosTable(filtered);
}

function getStageColor(etapa) {
    const map = {
        'Op. No Viable': '#ef4444',       // Rojo brillante (Riesgo/Negativo)
        'Baja': '#b91c1c',                // Rojo oscuro
        'No contrata': '#f87171',         // Rojo claro/salmón
        'Lead': '#f97316',                // Naranja (Inicio)
        'Viable': '#f59e0b',              // Naranja-Amarillo
        'Etapa 1 Presentada': '#eab308',   // Amarillo
        'Etapa 2 Pte tasación': '#a3e635',  // Amarillo-Verde / Verde Lima
        'Etapa 3 FEIN': '#4ade80',          // Verde Claro
        'Pendiente firma': '#10b981',      // Verde Esmeralda
        'Firmada': '#059669',              // Verde Éxito
        'Etapa 4 Firmada': '#047857'       // Verde Éxito Profundo
    };
    return map[etapa] || '#94a3b8'; // Slate grey for unmapped
}

function resetEstudiosFilters() {
    const contactInput = document.getElementById('filter-contacto');
    const estadoSelect = document.getElementById('filter-estado');
    const etapaSelect = document.getElementById('filter-etapa');
    const viabilidadSelect = document.getElementById('filter-viabilidad');
    
    if (contactInput) contactInput.value = '';
    if (estadoSelect) estadoSelect.value = '';
    if (etapaSelect) etapaSelect.value = '';
    if (viabilidadSelect) viabilidadSelect.value = '';
    
    applyFilters();
}

function renderEstudiosTable(records) {
    const recordsBody = document.getElementById('recordsBody');
    const estudiosBody = document.getElementById('estudiosBody');
    
    if (!recordsBody) return;

    // 1. Render Recent Records (Home Page - 5 Columns)
    if (records.length === 0) {
        const emptyRowRecent = '<tr><td colspan="5" style="text-align: center; padding: 3rem; color: #999;">No se encontraron registros que coincidan con los filtros.</td></tr>';
        recordsBody.innerHTML = emptyRowRecent;
    } else {
        const rowsRecentHTML = records.slice(0, 5).map(record => `
            <tr style="cursor: pointer;">
                <td onclick="openEditModal('estudio', '${record.id}')" style="vertical-align: middle;">${new Date(record.created).toLocaleDateString()}</td>
                <td onclick="openEditModal('estudio', '${record.id}')" style="vertical-align: middle;">
                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <span style="font-weight: 700;">${record.contactName || 'N/A'}</span>
                        <div style="display: flex; margin-top: 0.1rem;">
                            <button class="btn" style="padding: 0.15rem 0.45rem; font-size: 0.65rem; border-radius: 4px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; cursor: pointer; display: inline-flex; align-items: center; gap: 0.2rem; font-weight: 700; transition: all 0.2s;" onmouseover="this.style.background='#bae6fd'" onmouseout="this.style.background='#e0f2fe'" onclick="event.stopPropagation(); openViabilityModal('${record.id}')">
                                <i class="fas fa-traffic-light"></i> Viabilidad
                            </button>
                        </div>
                    </div>
                </td>
                <td onclick="openEditModal('estudio', '${record.id}')" style="vertical-align: middle;">${record.loanType || 'Hipotecario'}</td>
                <td style="vertical-align: middle;">
                    <span class="status-badge status-${(record.status || 'pendiente').toLowerCase().replace(/\s+/g, '-')}">${record.status || 'Pendiente'}</span>
                </td>
                <td style="vertical-align: middle;"><button class="btn btn-outline" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="openEditModal('estudio', '${record.id}')">Detalles</button></td>
            </tr>
        `).join('');
        recordsBody.innerHTML = rowsRecentHTML;
    }

    // 2. Render Estudios Management (Mis Estudios Tab - 8 Columns with ID Estudio and Telefono, removing Tipo prestamo)
    if (estudiosBody) {
        if (records.length === 0) {
            const emptyRowEstudios = '<tr><td colspan="8" style="text-align: center; padding: 3rem; color: #999;">No se encontraron registros que coincidan con los filtros.</td></tr>';
            estudiosBody.innerHTML = emptyRowEstudios;
        } else {
            const rowsEstudiosHTML = records.map(record => {
                const f = record.fields || {};
                const etapa = f['Etapa'] || 'Lead';
                const viabilidadVal = (f['Viabilidad'] || '').toLowerCase();
                
                // Get ID Estudio safely
                const idEstudio = f['ID Estudio'] || record.id || 'N/A';
                
                // Get Telefono from fields lookup (can be array or string)
                let telefono = 'N/A';
                if (f['Telefono']) {
                    if (Array.isArray(f['Telefono'])) {
                        telefono = f['Telefono'][0] || 'N/A';
                    } else {
                        telefono = f['Telefono'];
                    }
                }

                // Format Telefono as tel link
                let telefonoHTML = '';
                if (telefono !== 'N/A') {
                    telefonoHTML = `
                        <a href="tel:${telefono}" onclick="event.stopPropagation();" style="color: inherit; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 500; transition: color 0.2s;" onmouseover="this.style.color='var(--secondary)'" onmouseout="this.style.color='inherit'">
                            <i class="fas fa-phone-alt" style="color: var(--secondary); font-size: 0.8rem;"></i> ${telefono}
                        </a>`;
                } else {
                    telefonoHTML = `<span style="color: #94a3b8;">N/A</span>`;
                }
                
                let viabilidadHTML = '';
                if (viabilidadVal.includes('no viable') || viabilidadVal.includes('🔴') || viabilidadVal.includes('no_viable')) {
                    viabilidadHTML = `
                        <span style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.6rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 700; background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; cursor: pointer; transition: all 0.2s;" onclick="event.stopPropagation(); openViabilityModal('${record.id}')" title="Ver análisis de viabilidad">
                            <span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444;"></span>
                            No Viable
                        </span>`;
                } else if (viabilidadVal.includes('viable') || viabilidadVal.includes('🟢')) {
                    viabilidadHTML = `
                        <span style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.6rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 700; background: #ecfdf5; color: #10b981; border: 1px solid #a7f3d0; cursor: pointer; transition: all 0.2s;" onclick="event.stopPropagation(); openViabilityModal('${record.id}')" title="Ver análisis de viabilidad">
                            <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span>
                            Viable
                        </span>`;
                } else {
                    viabilidadHTML = `
                        <span style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.6rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 700; background: #f8fafc; color: #64748b; border: 1px solid #cbd5e1; cursor: pointer; transition: all 0.2s;" onclick="event.stopPropagation(); openViabilityModal('${record.id}')" title="Ver análisis de viabilidad">
                            <span style="width: 6px; height: 6px; border-radius: 50%; background: #94a3b8;"></span>
                            Sin analizar
                        </span>`;
                }

                const etapaColor = getStageColor(etapa);
                const etapaHTML = `
                    <span style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.6rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 700; background: ${etapaColor}15; color: ${etapaColor}; border: 1px solid ${etapaColor}30;">
                        <span style="width: 6px; height: 6px; border-radius: 50%; background: ${etapaColor};"></span>
                        ${etapa}
                    </span>`;

                return `
                    <tr style="cursor: pointer;" onclick="openEditModal('estudio', '${record.id}')">
                        <td style="vertical-align: middle;">${new Date(record.created).toLocaleDateString()}</td>
                        <td style="vertical-align: middle;">
                            <span style="font-weight: 700; color: #475569; background: #f1f5f9; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.8rem; border: 1px solid #e2e8f0; font-family: monospace;">
                                #${idEstudio}
                            </span>
                        </td>
                        <td style="vertical-align: middle; font-weight: 700; color: var(--primary);">${record.contactName || 'N/A'}</td>
                        <td style="vertical-align: middle;">${telefonoHTML}</td>
                        <td style="vertical-align: middle;">${etapaHTML}</td>
                        <td style="vertical-align: middle;">${viabilidadHTML}</td>
                        <td style="vertical-align: middle;">
                            <span class="status-badge status-${(record.status || 'pendiente').toLowerCase().replace(/\s+/g, '-')}">${record.status || 'Pendiente'}</span>
                        </td>
                        <td style="vertical-align: middle;">
                            <button class="btn btn-outline" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="event.stopPropagation(); openEditModal('estudio', '${record.id}')">Detalles</button>
                        </td>
                    </tr>
                `;
            }).join('');
            estudiosBody.innerHTML = rowsEstudiosHTML;
        }
    }
}

// ── +Nuevo Estudio Modal Functions ───────────────────────────────────────────

function openNewEstudioModal() {
    const modal = document.getElementById('newEstudioModalOverlay');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeNewEstudioModal() {
    const modal = document.getElementById('newEstudioModalOverlay');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

function toggleNewT2Block() {
    const isChecked = document.getElementById('new_hay_segundo_titular').checked;
    const block = document.getElementById('new-titular-2-block');
    const inputIngresos = document.getElementById('new_ingresos_t2');
    const inputTrabajo = document.getElementById('new_tipo_trabajo_t2');
    
    if (isChecked) {
        block.style.display = 'block';
        if (inputIngresos) inputIngresos.required = true;
        if (inputTrabajo) inputTrabajo.required = true;
    } else {
        block.style.display = 'none';
        if (inputIngresos) inputIngresos.required = false;
        if (inputTrabajo) inputTrabajo.required = false;
    }
}

function toggleNewPropBlock() {
    const val = document.getElementById('new_encontrado_propiedad').value;
    const block = document.getElementById('new-propiedad-block');
    const inputPrecio = document.getElementById('new_precio_inmueble');
    const inputLocalidad = document.getElementById('new_localidad_inmueble');
    
    if (val !== 'Buscando') {
        block.style.display = 'block';
        if (inputPrecio) inputPrecio.required = true;
        if (inputLocalidad) inputLocalidad.required = true;
    } else {
        block.style.display = 'none';
        if (inputPrecio) inputPrecio.required = false;
        if (inputLocalidad) inputLocalidad.required = false;
    }
}

async function submitNewEstudio(event) {
    event.preventDefault();
    const form = document.getElementById('newEstudioForm');
    const submitBtn = document.getElementById('btnSaveNewEstudio');
    if (!form || !submitBtn) return;

    const originalBtnText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = 'Enviando...';

    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => {
        if (value !== '') {
            data[key] = value;
        }
    });

    // Handle "Hay segundo titular" mapping
    const isT2 = document.getElementById('new_hay_segundo_titular').checked;
    data['Hay segundo titular'] = isT2 ? 'Si' : 'No';

    // If no second titular, remove related fields to prevent Airtable errors
    if (!isT2) {
        delete data['Ingresos titular 2'];
        delete data['Tipo trabajo T2'];
        delete data['Num pagas T2'];
        delete data['Antiguedad T2'];
    }

    // If property not found, remove property details
    const toggleProp = document.getElementById('new_encontrado_propiedad');
    if (toggleProp && toggleProp.value === 'Buscando') {
        delete data['Precio del inmueble'];
        delete data['Tipo vivienda'];
        delete data['Localidad inmueble'];
        delete data['CP Localidad'];
        delete data['Tipo prestamo'];
    }

    // If franquiciado ID is available, link this Hipoteca record to the Franquiciado!
    if (currentUserFranquiciadoId) {
        data['Franquiciados'] = [currentUserFranquiciadoId];
    }

    console.log("[DEBUG] Submitting new study with data:", data);

    try {
        const response = await fetch('/.netlify/functions/save-to-airtable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            alert('¡Estudio hipotecario creado correctamente!');
            closeNewEstudioModal();
            form.reset();
            
            // Reset toggles visual states
            document.getElementById('new-titular-2-block').style.display = 'none';
            document.getElementById('new-propiedad-block').style.display = 'none';
            
            // Reload the table!
            loadDashboardData();
        } else {
            console.error('Airtable Error Details:', result);
            alert('Error al crear el estudio: ' + (result.error?.message || result.message || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Submission error:', error);
        alert('Error de conexión al enviar la solicitud.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
    }
}

async function copyReferralLink() {
    const copyText = document.getElementById('referralLinkInput');
    if (!copyText) return;
    
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices
    
    try {
        await navigator.clipboard.writeText(copyText.value);
        alert('¡Enlace de referencia copiado al portapapeles!');
    } catch (err) {
        // Fallback
        document.execCommand('copy');
        alert('¡Enlace de referencia copiado al portapapeles!');
    }
}

async function submitReferralFromDashboard(event) {
    event.preventDefault();
    
    const nombre = document.getElementById('refNombre').value.trim();
    const email = document.getElementById('refEmail').value.trim();
    const telefono = document.getElementById('refTelefono').value.trim();
    const statusEl = document.getElementById('inviteFormStatus');
    const submitBtn = document.getElementById('btnInviteSubmit');
    
    if (!nombre || !email || !telefono) {
        alert('Por favor, completa todos los campos.');
        return;
    }
    
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    
    if (statusEl) {
        statusEl.style.display = 'none';
    }
    
    const refCode = currentUserFranquiciadoId || localStorage.getItem('currentUserFranquiciadoId');
    
    try {
        const res = await fetch('/.netlify/functions/submit-referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, telefono, refCode: refCode || null })
        });
        
        const result = await res.json();
        
        if (res.ok && result.success) {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.background = '#dcfce7';
                statusEl.style.color = '#16a34a';
                statusEl.innerHTML = '<i class="fas fa-check-circle"></i> ¡Invitación enviada con éxito!';
            }
            document.getElementById('inviteReferralForm').reset();
            
            // Reload dashboard to see the new contact in history!
            loadDashboardData();
        } else {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.background = '#fee2e2';
                statusEl.style.color = '#ef4444';
                statusEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${result.error || 'Error al enviar invitación.'}`;
            }
        }
    } catch (err) {
        console.error('Error sending referral:', err);
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = '#fee2e2';
            statusEl.style.color = '#ef4444';
            statusEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error de conexión.';
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// ── Contact Management & Filtering Functions ─────────────────────────────────

function renderContactsTable(contacts, isClient) {
    const tabBody = document.getElementById('contactsTabBody');
    if (!tabBody) return;

    if (contacts.length === 0) {
        tabBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 3rem; color: #999;">${isClient ? 'Aún no has recomendado a ningún contacto. ¡Comparte tu enlace de arriba para empezar!' : 'No hay contactos disponibles.'}</td></tr>`;
        return;
    }

    if (isClient) {
        tabBody.innerHTML = contacts.map(c => `
            <tr>
                <td style="font-weight: 700; color: var(--primary);">${c.name}</td>
                <td>${c.email}</td>
                <td>${c.phone}</td>
                <td>
                    <span class="status-badge" style="background: ${c.status === 'Cerrado' ? '#dcfce7; color: #16a34a;' : (c.status === 'Rechazado' ? '#fee2e2; color: #ef4444;' : '#fef3c7; color: #d97706;')}">
                        ${c.status || 'Pendiente'}
                    </span>
                </td>
            </tr>
        `).join('');
    } else {
        tabBody.innerHTML = contacts.map(contact => `
            <tr>
                <td style="font-weight: 700; color: var(--primary);">${contact.name}</td>
                <td>${contact.email}</td>
                <td>${contact.phone}</td>
                <td><button class="btn btn-outline" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="openEditModal('contact', '${contact.id}')">Detalles</button></td>
            </tr>
        `).join('');
    }
}

function applyContactFilters() {
    const query = (document.getElementById('filter-contactos-general')?.value || '').toLowerCase().trim();
    const portalRole = localStorage.getItem('portal_role') || 'cliente';
    const isClient = portalRole === 'cliente';

    if (!query) {
        renderContactsTable(currentContacts, isClient);
        return;
    }

    const filtered = currentContacts.filter(c => {
        const name = (c.name || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return name.includes(query) || email.includes(query) || phone.includes(query);
    });

    renderContactsTable(filtered, isClient);
}

function openNewContactModal() {
    const modal = document.getElementById('newContactModalOverlay');
    if (modal) {
        modal.style.zIndex = '20000';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeNewContactModal() {
    const modal = document.getElementById('newContactModalOverlay');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        document.getElementById('newContactForm').reset();
    }
}

async function submitNewContact(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSaveNewContact');
    const name = document.getElementById('newContactName').value.trim();
    const email = document.getElementById('newContactEmail').value.trim();
    const phone = document.getElementById('newContactPhone').value.trim();

    if (!name || !email || !phone) {
        alert('Nombre, Email y Teléfono son obligatorios.');
        return;
    }

    const phoneRegex = /^[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
        alert('El teléfono debe tener exactamente 9 dígitos.');
        return;
    }

    const originalText = btn.textContent;
    btn.textContent = 'Guardando...';
    btn.disabled = true;

    try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error('No estás autenticado');
        const token = await user.getIdToken();

        const response = await fetch('/.netlify/functions/create-portal-contact', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, phone })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al guardar el contacto');

        alert('¡Contacto creado correctamente!');
        
        // Auto-attach to active study if edit modal is active
        const editModal = document.getElementById('editModalOverlay');
        const editType = document.getElementById('editRecordType');
        if (editModal && editModal.classList.contains('active') && editType && editType.value === 'estudio') {
            if (data.contact && data.contact.id) {
                activeStudyLinkedContactIds.push(data.contact.id);
            }
        }

        closeNewContactModal();
        await loadDashboardData(); // Refresh list
    } catch (err) {
        console.error("Error creating contact:", err);
        alert(err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function renderProcessGraphics(records) {
    const etapaContainer = document.getElementById('etapaChartContainer');
    const viabilidadContainer = document.getElementById('viabilidadChartContainer');

    if (!records || records.length === 0) {
        if (etapaContainer) etapaContainer.innerHTML = '<span style="font-size: 0.85rem; color: #94a3b8; font-style: italic;">Sin estudios registrados</span>';
        if (viabilidadContainer) viabilidadContainer.innerHTML = '<span style="font-size: 0.85rem; color: #94a3b8; font-style: italic;">Sin estudios registrados</span>';
        return;
    }

    const total = records.length;

    // 1. Process "Etapa" (Funnel)
    const etapaCounts = {};
    records.forEach(r => {
        const f = r.fields || {};
        const etapa = f['Etapa'] || 'Sin asignar';
        etapaCounts[etapa] = (etapaCounts[etapa] || 0) + 1;
    });

    // Logical Sort Order defined by the user
    const logicalSortOrder = [
        'Lead',
        'Op. No Viable',
        'Viable',
        'No contrata',
        'Etapa 1 Presentada',
        'Etapa 2 Pte tasación',
        'Etapa 3 FEIN',
        'Pendiente firma',
        'Firmada',
        'Etapa 4 Firmada',
        'Baja'
    ];

    // Helper to get progressive colors is now defined globally for table and chart reuse

    const sortedEtapas = Object.entries(etapaCounts).sort((a, b) => {
        const idxA = logicalSortOrder.indexOf(a[0]);
        const idxB = logicalSortOrder.indexOf(b[0]);
        const valA = idxA === -1 ? 999 : idxA;
        const valB = idxB === -1 ? 999 : idxB;
        return valA - valB;
    });

    if (etapaContainer) {
        etapaContainer.innerHTML = sortedEtapas.map(([etapa, count]) => {
            const pct = (count / total) * 100;
            const barColor = getStageColor(etapa);
            return `
                <div style="display: flex; flex-direction: column; gap: 0.2rem; width: 100%;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; font-weight: 600; color: #475569;">
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75%; font-family: 'Inter', sans-serif;">${etapa}</span>
                        <span style="color: var(--primary); font-weight: 700; font-family: 'Inter', sans-serif;">${count} (${pct.toFixed(0)}%)</span>
                    </div>
                    <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                        <div style="width: ${pct}%; height: 100%; background: ${barColor}; border-radius: 4px; transition: width 0.6s ease-out;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 2. Process "Viabilidad"
    let viableCount = 0;
    let noViableCount = 0;
    let pendienteCount = 0;

    records.forEach(r => {
        const f = r.fields || {};
        const viabilidad = (f['Viabilidad'] || '').toLowerCase();
        
        if (viabilidad.includes('no viable') || viabilidad.includes('🔴') || viabilidad.includes('no_viable')) {
            noViableCount++;
        } else if (viabilidad.includes('viable') || viabilidad.includes('🟢')) {
            viableCount++;
        } else {
            pendienteCount++;
        }
    });

    if (viabilidadContainer) {
        const viablePct = (viableCount / total) * 100;
        const noViablePct = (noViableCount / total) * 100;
        const pendientePct = (pendienteCount / total) * 100;

        viabilidadContainer.innerHTML = `
            <!-- Segmented Bar -->
            <div style="width: 100%; height: 12px; background: #e2e8f0; border-radius: 6px; overflow: hidden; display: flex; box-shadow: inset 0 1px 2px rgba(0,0,0,0.06); margin-bottom: 0.4rem;">
                ${viableCount > 0 ? `<div style="width: ${viablePct}%; height: 100%; background: #10b981; transition: width 0.6s ease-out;" title="Viables: ${viableCount}"></div>` : ''}
                ${noViableCount > 0 ? `<div style="width: ${noViablePct}%; height: 100%; background: #ef4444; transition: width 0.6s ease-out;" title="No Viables: ${noViableCount}"></div>` : ''}
                ${pendienteCount > 0 ? `<div style="width: ${pendientePct}%; height: 100%; background: #94a3b8; transition: width 0.6s ease-out;" title="Sin Analizar: ${pendienteCount}"></div>` : ''}
            </div>
            <!-- Legend and Details -->
            <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.4rem; font-size: 0.75rem; font-weight: 700; font-family: 'Inter', sans-serif; width: 100%;">
                <div style="display: flex; align-items: center; gap: 0.25rem;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
                    <span style="color: #10b981;">Viables: ${viableCount}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.25rem;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
                    <span style="color: #ef4444;">No Viables: ${noViableCount}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.25rem;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; display: inline-block;"></span>
                    <span style="color: #64748b;">Pendientes: ${pendienteCount}</span>
                </div>
            </div>
        `;
    }
}

