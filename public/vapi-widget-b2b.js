(function() {
  // Configuración de Vapi
  const VAPI_PUBLIC_KEY = 'b9144d9b-f50b-4a9b-a40d-a4d6cb269f9e';
  // NOTA: Reemplazar con el ID del nuevo agente B2B si es diferente del de por defecto.
  const ASSISTANT_ID = '0a0e1ed9-79d9-422b-bc7c-f423149e2124';

  let vapi = null;
  let isCallActive = false;

  // Cargar SDK de Vapi como módulo ES
  import('https://cdn.jsdelivr.net/npm/@vapi-ai/web/+esm')
    .then((module) => {
      const Vapi = module.default.default || module.default;
      initVapi(Vapi);
    })
    .catch((err) => {
      console.error('Failed to load Vapi SDK:', err);
    });

  function initVapi(VapiClass) {
    vapi = new VapiClass(VAPI_PUBLIC_KEY);

    // Elementos DOM (con prefijo b2b para evitar cualquier colisión)
    const container = document.getElementById('vapi-b2b-widget-container');
    const triggerBtn = document.getElementById('vapi-b2b-trigger-btn');
    const closeCardBtn = document.getElementById('vapi-b2b-close-card');
    const actionBtn = document.getElementById('vapi-b2b-action-btn');
    const statusBadge = document.getElementById('vapi-b2b-status-badge');
    const infoText = document.getElementById('vapi-b2b-info-text');
    const waveform = document.getElementById('vapi-b2b-waveform');
    const emailContainer = document.getElementById('vapi-b2b-email-container');
    const emailInput = document.getElementById('vapi-b2b-client-email');

    if (!container || !triggerBtn || !actionBtn) {
      console.warn('Vapi B2B Widget: Elementos HTML no encontrados.');
      return;
    }

    // Alternar visibilidad de la tarjeta del widget
    triggerBtn.addEventListener('click', () => {
      container.classList.toggle('vapi-widget-open');
    });

    if (closeCardBtn) {
      closeCardBtn.addEventListener('click', () => {
        container.classList.remove('vapi-widget-open');
      });
    }

    // Botón de acción (Iniciar/Terminar llamada)
    actionBtn.addEventListener('click', () => {
      if (!isCallActive) {
        startCall();
      } else {
        stopCall();
      }
    });

    // Eventos de Vapi
    vapi.on('call-start', () => {
      isCallActive = true;
      statusBadge.innerText = 'Llamada en curso';
      statusBadge.className = 'vapi-status-badge online';
      infoText.innerText = 'Estás conectado con AKIA. Puedes dictarle los datos de la operación de forma desordenada. Pulsa el botón de abajo para terminar.';
      actionBtn.innerHTML = '<i class="fas fa-phone-slash"></i> Terminar Llamada';
      actionBtn.className = 'btn vapi-btn-danger';
      waveform.classList.add('active');
    });

    vapi.on('call-end', () => {
      resetWidgetState();
    });

    vapi.on('error', (err) => {
      console.error('Vapi Error:', err);
      resetWidgetState();
      statusBadge.innerText = 'Error de conexión';
      statusBadge.className = 'vapi-status-badge error';
      infoText.innerText = 'Ocurrió un error al iniciar la llamada. Por favor, inténtalo de nuevo.';
    });

    // Animación de la onda de voz según el volumen
    vapi.on('volume-level', (volume) => {
      const bars = document.querySelectorAll('.vapi-bar-b2b');
      const multiplier = isCallActive ? 1.5 : 0;
      bars.forEach((bar, idx) => {
        const heightFactor = 10 + volume * 70 * (0.6 + Math.sin(idx + Date.now() / 100) * 0.4);
        bar.style.height = `${Math.min(90, heightFactor * multiplier)}px`;
      });
    });

    function validateEmail(email) {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(email);
    }

    function startCall() {
      const clientEmail = emailInput ? emailInput.value.trim() : '';

      if (!clientEmail || !validateEmail(clientEmail)) {
        alert('Por favor, introduce un email válido para el cliente antes de iniciar la llamada.');
        if (emailInput) emailInput.focus();
        return;
      }

      // Obtener el email y nombre del agente logueado en la plataforma
      const agentEmail = localStorage.getItem('currentUserEmail') || '';
      const agentName = localStorage.getItem('currentUserDisplayName') || '';
      console.log(`[Vapi B2B] Iniciando llamada para cliente: ${clientEmail} - Asociada al agente: ${agentName} (${agentEmail})`);

      statusBadge.innerText = 'Llamando...';
      statusBadge.className = 'vapi-status-badge calling';
      infoText.innerText = 'Conectando con el analista hipotecario. Permite el acceso al micrófono si te lo solicita tu navegador.';
      actionBtn.disabled = true;
      if (emailContainer) emailContainer.style.display = 'none';

      // Pasar el email del cliente, el del agente y su nombre como variables personalizadas a Vapi
      vapi.start(ASSISTANT_ID, {
        variableValues: {
          email: clientEmail,
          agentEmail: agentEmail,
          agentName: agentName
        }
      }).catch(err => {
        console.error('Failed to start Vapi B2B call:', err);
        resetWidgetState();
      });
      actionBtn.disabled = false;
    }

    function stopCall() {
      vapi.stop();
      resetWidgetState();
    }

    function resetWidgetState() {
      isCallActive = false;
      statusBadge.innerText = 'Desconectado';
      statusBadge.className = 'vapi-status-badge offline';
      infoText.innerText = 'Dicta las operaciones hipotecarias de tus clientes de manera rápida y desordenada. AKIA procesará todo y lo registrará.';
      if (emailContainer) emailContainer.style.display = 'block';
      actionBtn.innerHTML = '<i class="fas fa-phone-alt"></i> Iniciar Llamada';
      actionBtn.className = 'btn btn-primary';
      waveform.classList.remove('active');
      
      // Reiniciar altura de las barras de sonido
      const bars = document.querySelectorAll('.vapi-bar-b2b');
      bars.forEach(bar => bar.style.height = '6px');
    }
  }
})();
