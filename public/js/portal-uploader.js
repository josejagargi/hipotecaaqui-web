/**
 * portal-uploader.js
 * Frontend application logic for the Hipoteca Aquí document gathering system.
 * Connects directly to Firebase Storage for uploads and calls Netlify Functions
 * to query/update Airtable Records under the Contacts table.
 */

// Firebase Configuration (Matching contascan-pro-jgg)
const firebaseConfig = {
    apiKey: "AIzaSyABbXdqKjMj4UtBic9GGCvlxY454ungydw",
    authDomain: "contascan-pro-jgg.firebaseapp.com",
    projectId: "contascan-pro-jgg",
    storageBucket: "contascan-pro-jgg.firebasestorage.app",
    messagingSenderId: "271199573526",
    appId: "1:271199573526:web:896d57c37ec4ba98d10737"
};

// Initialize Firebase Storage
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const storage = firebase.storage();

// Global State
let clientContactId = null;
let currentClientData = null;

// Initial Load Handler
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Get Contact ID from query parameters (?c=recXXXXXXXXXX)
    const params = new URLSearchParams(window.location.search);
    clientContactId = params.get('c') || params.get('contactId');

    // Detect if running inside an iframe (embed mode)
    if (params.get('embed') === 'true') {
        document.body.classList.add('embedded');
    }

    if (!clientContactId) {
        showErrorMessage('Falta el identificador del cliente en el enlace. Por favor, solicita a tu gestor hipotecario un enlace válido.');
        return;
    }

    console.log(`[DEBUG] Initializing document uploader for contact ID: ${clientContactId}`);

    // 2. Fetch current documentation state from Netlify Function
    await fetchClientDocumentationState();
});

/**
 * Fetches the current contact record fields and uploaded attachments from Airtable
 */
async function fetchClientDocumentationState() {
    showOverlay('Cargando tus documentos...');
    try {
        const response = await fetch(`/.netlify/functions/get-contact-docs?c=${clientContactId}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al obtener la información de contacto');
        }

        currentClientData = data;
        console.log('[DEBUG] Client docs state fetched successfully:', currentClientData);

        // 3. Render state to the UI
        renderClientDetails();
        hideOverlay();
    } catch (err) {
        console.error('Error fetching client documentation:', err);
        hideOverlay();
        showErrorMessage(`No se pudo verificar el estado de tu documentación. Detalles: ${err.message}`);
    }
}

/**
 * Renders client details, checks autonomous toggle, populates lists, and calculates progress
 */
function renderClientDetails() {
    if (!currentClientData) return;

    // Set Greeting
    const greeting = document.getElementById('clientGreeting');
    if (greeting) {
        greeting.textContent = `Hola, ${currentClientData.name}`;
    }

    // Set LOPD Consent checkbox state and locking logic
    const consentCheckbox = document.getElementById('consentCheckbox');
    const consentCard = document.getElementById('consent-card');
    const consentBadge = document.getElementById('badge-consent');
    const uploaderGrid = document.querySelector('.grid-docs');
    const acceptedLOPD = currentClientData.aceptacionLOPD || false;

    if (consentCheckbox) {
        consentCheckbox.checked = acceptedLOPD;
    }

    if (acceptedLOPD) {
        if (consentCard) {
            consentCard.classList.add('completed');
            consentCard.style.borderColor = 'var(--accent)';
            consentCard.style.boxShadow = 'var(--shadow-md), 0 0 16px var(--accent-glow)';
        }
        if (consentBadge) {
            consentBadge.textContent = 'Aceptado';
            consentBadge.className = 'status-badge completed';
            consentBadge.style.background = '';
            consentBadge.style.color = '';
        }
        if (uploaderGrid) {
            uploaderGrid.classList.remove('disabled');
        }
    } else {
        if (consentCard) {
            consentCard.classList.remove('completed');
            consentCard.style.borderColor = 'transparent';
            consentCard.style.boxShadow = 'var(--shadow-sm), 0 0 0 1px rgba(255,255,255,0.7) inset';
        }
        if (consentBadge) {
            consentBadge.textContent = 'Requerido';
            consentBadge.className = 'status-badge';
            consentBadge.style.background = '#fef3c7';
            consentBadge.style.color = '#d97706';
        }
        if (uploaderGrid) {
            uploaderGrid.classList.add('disabled');
        }
    }

    const isAutonomo = document.getElementById('autonomoToggle')?.checked || false;

    // Populate the lists for each category with custom completed conditions
    const docMapping = [
        { 
            key: 'nif', 
            listId: 'list-nif', 
            fieldName: 'NIF', 
            badgeId: 'badge-nif', 
            cardId: 'card-nif', 
            required: true,
            minFiles: 2,
            getBadgeText: (count) => count >= 2 ? 'Completado' : (count === 1 ? 'Falta 1 cara' : 'Pendiente (2 caras)')
        },
        { 
            key: 'nominas', 
            listId: 'list-nominas', 
            fieldName: 'Nominas', 
            badgeId: 'badge-nominas', 
            cardId: 'card-nominas', 
            required: !isAutonomo, // Required only if NOT autonomous
            minFiles: isAutonomo ? 0 : 3,
            getBadgeText: (count) => isAutonomo ? 'Opcional (Autónomo)' : (count >= 3 ? 'Completado' : (count > 0 ? `Faltan ${3 - count} nóminas` : 'Pendiente (3 nóminas)'))
        },
        { 
            key: 'vidaLaboral', 
            listId: 'list-vidaLaboral', 
            fieldName: 'Vida laboral', 
            badgeId: 'badge-vidaLaboral', 
            cardId: 'card-vidaLaboral', 
            required: true,
            minFiles: 1,
            getBadgeText: (count) => count >= 1 ? 'Completado' : 'Pendiente'
        },
        { 
            key: 'renta', 
            listId: 'list-renta', 
            fieldName: 'Renta', 
            badgeId: 'badge-renta', 
            cardId: 'card-renta', 
            required: true,
            minFiles: 1,
            getBadgeText: (count) => count >= 1 ? 'Completado' : (isAutonomo ? 'Pendiente (Mod. 100)' : 'Pendiente')
        },
        { 
            key: 'cuotasPrestamos', 
            listId: 'list-cuotasPrestamos', 
            fieldName: 'Cuotas prestamos', 
            badgeId: 'badge-cuotasPrestamos', 
            cardId: 'card-cuotasPrestamos', 
            required: false,
            minFiles: 0,
            getBadgeText: (count) => count > 0 ? 'Aportado' : 'Opcional'
        },
        { 
            key: 'extractosBancarios', 
            listId: 'list-extractosBancarios', 
            fieldName: 'Extractos bancarios', 
            badgeId: 'badge-extractosBancarios', 
            cardId: 'card-extractosBancarios', 
            required: true,
            minFiles: 1,
            getBadgeText: (count) => count >= 1 ? 'Completado' : 'Pendiente'
        },
        { 
            key: 'otrosAdjuntos', 
            listId: 'list-otrosAdjuntos', 
            fieldName: 'Otros adjuntos', 
            badgeId: 'badge-otrosAdjuntos', 
            cardId: 'card-otrosAdjuntos', 
            required: isAutonomo, // Required only if autonomous (for IVA trimestral)
            minFiles: isAutonomo ? 1 : 0, 
            getBadgeText: (count) => isAutonomo 
                ? (count >= 1 ? 'Completado' : 'Pendiente (IVA trimestral)')
                : (count > 0 ? 'Aportado' : 'Opcional')
        }
    ];

    let completedCategoriesCount = 0;
    let totalRequiredCount = 0;

    docMapping.forEach(mapping => {
        const filesArray = currentClientData.docs[mapping.key] || [];
        const listContainer = document.getElementById(mapping.listId);
        const cardElement = document.getElementById(mapping.cardId);
        const badgeElement = document.getElementById(mapping.badgeId);

        const isCompleted = filesArray.length >= mapping.minFiles;

        if (mapping.required) {
            totalRequiredCount++;
            if (isCompleted) {
                completedCategoriesCount++;
            }
        }

        // Render uploaded files list
        if (listContainer) {
            listContainer.innerHTML = '';
            
            // Render files if any
            filesArray.forEach(file => {
                const item = document.createElement('div');
                item.className = 'file-item';
                
                const isPDF = file.filename.toLowerCase().endsWith('.pdf');
                const fileIcon = isPDF ? 'fas fa-file-pdf' : 'fas fa-file-image';

                item.innerHTML = `
                    <div class="file-info" title="${file.filename}">
                        <i class="${fileIcon}"></i>
                        <span>${file.filename}</span>
                    </div>
                    <div class="file-actions">
                        <button type="button" class="btn-action btn-view" onclick="previewFile('${file.url}', '${file.filename}')" title="Visualizar archivo">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button type="button" class="btn-action btn-delete" onclick="deleteFile('${mapping.fieldName}', '${file.id}', '${file.filename}')" title="Eliminar archivo">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                `;
                listContainer.appendChild(item);
            });

            // Update Card completed and required visual states
            const cardTitleElement = cardElement.querySelector('.card-title');
            if (cardTitleElement) {
                // If the field is not required (like Nominas when Autónomo is checked), we can styling it softly
                if (!mapping.required && filesArray.length === 0) {
                    cardElement.style.opacity = '0.75';
                } else {
                    cardElement.style.opacity = '1';
                }
            }

            if (isCompleted) {
                if (cardElement) cardElement.classList.add('completed');
                if (badgeElement) {
                    badgeElement.textContent = mapping.getBadgeText(filesArray.length);
                    badgeElement.className = 'status-badge completed';
                }
            } else {
                if (cardElement) cardElement.classList.remove('completed');
                if (badgeElement) {
                    badgeElement.textContent = mapping.getBadgeText(filesArray.length);
                    badgeElement.className = 'status-badge';
                }
            }
        }
    });

    // Update Overall Progress indicators
    const progressStatusText = document.getElementById('progressStatusText');
    const overallProgressBar = document.getElementById('overallProgressBar');
    const overallProgressPercent = document.getElementById('overallProgressPercent');

    if (overallProgressBar && overallProgressPercent && progressStatusText) {
        const percent = totalRequiredCount > 0 ? Math.round((completedCategoriesCount / totalRequiredCount) * 100) : 0;
        overallProgressBar.style.width = `${percent}%`;
        overallProgressPercent.textContent = `${percent}%`;
        progressStatusText.textContent = `Requeridos: ${completedCategoriesCount} de ${totalRequiredCount}`;
    }
}

/**
 * Handles the upload process: uploads to Firebase Storage, then links in Airtable Contacts table
 */
async function handleFileUpload(inputElement, fieldName, cardKey) {
    const file = inputElement.files[0];
    if (!file) return;

    // Validate file size (10 MB maximum limit)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        alert('El archivo supera el límite de 10 MB. Por favor, selecciona un archivo más pequeño u optimiza la imagen.');
        inputElement.value = '';
        return;
    }

    // Validate file type
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        alert('Formato no permitido. Solo se aceptan PDFs, imágenes JPG, PNG o WEBP.');
        inputElement.value = '';
        return;
    }

    // Set UI to uploading state
    const cardElement = document.getElementById(`card-${cardKey}`);
    const dropArea = document.getElementById(`area-${cardKey}`);
    const fillBar = document.getElementById(`fill-${cardKey}`);
    const percentText = document.getElementById(`percent-${cardKey}`);

    if (dropArea) {
        dropArea.classList.add('uploading');
    }

    // Sanitize filename to avoid character bugs
    const cleanFileName = sanitizeFileName(file.name);
    const storagePath = `documents/${clientContactId}/${fieldName}/${Date.now()}_${cleanFileName}`;
    console.log(`[DEBUG] Uploading file to storage: ${storagePath}`);

    const storageRef = storage.ref().child(storagePath);
    const uploadTask = storageRef.put(file);

    // Track upload progress on Firebase Storage
    uploadTask.on('state_changed', 
        (snapshot) => {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            if (fillBar) fillBar.style.width = `${progress}%`;
            if (percentText) percentText.textContent = `${progress}%`;
        }, 
        (error) => {
            console.error('Firebase Storage upload failed:', error);
            alert(`Ocurrió un error al subir el archivo a la nube: ${error.message}`);
            if (dropArea) dropArea.classList.remove('uploading');
            inputElement.value = '';
        }, 
        async () => {
            // Upload complete, get download URL
            try {
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                console.log(`[DEBUG] Upload successful. Linking file in Airtable:`, downloadURL);

                // Update progress text to show AI verification is active
                const progressTextSpan = document.querySelector(`#progress-${cardKey} .mini-progress-text span:first-child`);
                if (progressTextSpan) {
                    progressTextSpan.textContent = 'Verificando con IA...';
                }

                // Update Airtable record
                const response = await fetch('/.netlify/functions/update-contact-docs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        c: clientContactId,
                        field: fieldName,
                        fileName: cleanFileName,
                        fileUrl: downloadURL,
                        action: 'add'
                    })
                });

                const resData = await response.json();
                if (!response.ok) {
                    if (resData.error === 'validation_failed') {
                        alert(`El documento no es válido para este apartado:\n\n${resData.message}`);
                        return; // Exit without throwing a generic error
                    }
                    throw new Error(resData.error || 'Error al vincular el archivo en Airtable.');
                }

                console.log(`[DEBUG] Document linked successfully in Airtable:`, resData);

                // Update global state and re-render
                currentClientData.docs[cardKey] = resData.attachments;
                renderClientDetails();

            } catch (err) {
                console.error('Error linking file to Airtable:', err);
                alert(`Error al guardar el archivo: ${err.message}`);
            } finally {
                // Reset dropzone
                if (dropArea) dropArea.classList.remove('uploading');
                inputElement.value = '';
            }
        }
    );
}

/**
 * Handles document deletion from the checklist and Airtable Contact record
 */
async function deleteFile(fieldName, fileId, fileName) {
    const confirmation = confirm(`¿Estás seguro de que deseas eliminar el archivo "${fileName}"?`);
    if (!confirmation) return;

    showOverlay('Eliminando archivo...');

    const docMapping = [
        { key: 'nif', fieldName: 'NIF' },
        { key: 'nominas', fieldName: 'Nominas' },
        { key: 'vidaLaboral', fieldName: 'Vida laboral' },
        { key: 'renta', fieldName: 'Renta' },
        { key: 'cuotasPrestamos', fieldName: 'Cuotas prestamos' },
        { key: 'extractosBancarios', fieldName: 'Extractos bancarios' },
        { key: 'otrosAdjuntos', fieldName: 'Otros adjuntos' }
    ];

    const mapping = docMapping.find(m => m.fieldName === fieldName);
    if (!mapping) return;

    try {
        const response = await fetch('/.netlify/functions/update-contact-docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                c: clientContactId,
                field: fieldName,
                fileId: fileId,
                action: 'delete'
            })
        });

        const resData = await response.json();
        if (!response.ok) {
            throw new Error(resData.error || 'Error al eliminar el archivo en Airtable.');
        }

        console.log(`[DEBUG] Document deleted successfully:`, resData);

        // Update local state and re-render
        currentClientData.docs[mapping.key] = resData.attachments;
        renderClientDetails();
        hideOverlay();

    } catch (err) {
        console.error('Error deleting document:', err);
        hideOverlay();
        alert(`Ocurrió un error al eliminar el archivo: ${err.message}`);
    }
}

/**
 * Toggles the visibility of autónomo specific fields (not needed if not autónomo)
 * Wait, in the current list, since the fields are standard, we can explain that Autónomos
 * fields are just visual or can map to Renta/Otros adjuntos.
 */
function toggleAutonomoFields(isAutonomo) {
    console.log(`[DEBUG] Toggle autónomo: ${isAutonomo}`);
    // If autonomous is checked, we can adapt the instruction cards or titles
    const rentaDesc = document.querySelector('#card-renta .card-desc');
    const otrosDesc = document.querySelector('#card-otrosAdjuntos .card-desc');

    if (rentaDesc && otrosDesc) {
        if (isAutonomo) {
            rentaDesc.innerHTML = 'Aporta tu <strong>Declaración de la Renta anual (modelo 100)</strong> y los últimos trimestres de IVA presentados (modelo 303/130).';
            otrosDesc.innerHTML = 'Aporta tus extractos de los últimos 6 meses (en vez de 3) y el último recibo mensual de la cuota de autónomo.';
        } else {
            rentaDesc.innerHTML = 'Última declaración anual de la renta presentada (documento completo de 10-12 páginas con código CSV).';
            otrosDesc.innerHTML = 'Extractos bancarios de los últimos 3 meses de tu cuenta principal donde se vean los ingresos de nóminas.';
        }
    }

    // Re-evaluate checklist requirements and counts immediately
    renderClientDetails();
}

/**
 * Preview file inside the custom modal
 */
function previewFile(url, fileName) {
    const modal = document.getElementById('previewModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    if (!modal || !modalBody || !modalTitle) return;

    modalTitle.textContent = `Visualizar: ${fileName}`;
    modalBody.innerHTML = '';

    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);

    if (isImage) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = fileName;
        modalBody.appendChild(img);
    } else {
        // Embed PDF inside iframe
        const iframe = document.createElement('iframe');
        iframe.src = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
        // Fallback for direct browser view if Google Viewer fails
        iframe.onerror = () => {
            iframe.src = url;
        };
        modalBody.appendChild(iframe);
    }

    modal.classList.add('show');
}

/**
 * Close modal preview
 */
window.closePreviewModal = function() {
    const modal = document.getElementById('previewModal');
    const modalBody = document.getElementById('modalBody');
    if (modal) modal.classList.remove('show');
    if (modalBody) modalBody.innerHTML = '';
};

/**
 * Utility functions for UI overlays and error messaging
 */
function showOverlay(msg) {
    const overlay = document.getElementById('mainOverlay');
    const text = document.getElementById('overlayMsg');
    if (overlay && text) {
        text.textContent = msg;
        overlay.classList.add('show');
    }
}

function hideOverlay() {
    const overlay = document.getElementById('mainOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
}

function showErrorMessage(message) {
    hideOverlay();
    // Beautiful full card replacement in case of fatal URL load errors
    const container = document.querySelector('.container');
    if (container) {
        container.innerHTML = `
            <div class="header-card" style="border-color: #fc8181; background: rgba(254, 242, 242, 0.05);">
                <div class="logo-container">
                    <div class="logo-fallback">Hipoteca<span>Aquí</span></div>
                </div>
                <h1 style="color: #f56565; margin-bottom: 1rem;"><i class="fas fa-exclamation-triangle"></i> Enlace No Válido</h1>
                <p style="color: #e2e8f0; font-size: 1.1rem; line-height: 1.6;">${message}</p>
                <div style="margin-top: 1.5rem;">
                    <a href="index.html" class="btn-primary" style="display: inline-flex; width: auto; padding: 0.75rem 1.8rem; text-decoration: none; border-radius: 8px;">Volver al Inicio</a>
                </div>
            </div>
        `;
    }
}

function sanitizeFileName(name) {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents/diacritics
        .replace(/[^a-zA-Z0-9.-]/g, '_'); // Replace spaces and special characters with underscore
}

/**
 * Handles checking/unchecking LOPD consent and syncs with Airtable checkbox field
 */
async function handleConsentChange(checked) {
    console.log(`[DEBUG] LOPD Consent changed: ${checked}`);
    showOverlay(checked ? 'Guardando tu consentimiento...' : 'Retirando tu consentimiento...');

    try {
        const response = await fetch('/.netlify/functions/update-contact-docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                c: clientContactId,
                field: 'Aceptacion LOPD',
                action: checked ? 'add' : 'delete'
            })
        });

        const resData = await response.json();
        if (!response.ok) {
            throw new Error(resData.error || 'Error al guardar el consentimiento en Airtable.');
        }

        console.log(`[DEBUG] Consent updated successfully in Airtable:`, resData);
        currentClientData.aceptacionLOPD = checked;
        renderClientDetails();
        hideOverlay();
    } catch (err) {
        console.error('Error updating LOPD consent:', err);
        hideOverlay();
        // Reset checkbox to previous state on failure
        const checkbox = document.getElementById('consentCheckbox');
        if (checkbox) {
            checkbox.checked = !checked;
        }
        alert(`Ocurrió un error al actualizar el consentimiento de datos: ${err.message}`);
    }
}
