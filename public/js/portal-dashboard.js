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
                <td><button class="btn btn-outline" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="alert('Funcionalidad en desarrollo para abrir el registro ${record.id}')">Detalles</button></td>
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
                        <td><button class="btn btn-outline" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="alert('Detalles de ${contact.name}')">Ver</button></td>
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

// Initial load
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        loadDashboardData();
    }
});
