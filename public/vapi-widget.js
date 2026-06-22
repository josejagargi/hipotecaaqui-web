(function() {
  const VAPI_PUBLIC_KEY = 'b9144d9b-f50b-4a9b-a40d-a4d6cb269f9e';
  const ASSISTANT_ID = '067c6387-f1d6-40bc-9628-7912ba7652b7';

  let vapi = null;
  let isCallActive = false;

  // Load Vapi SDK as ES Module
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

    // DOM Elements
    const container = document.getElementById('vapi-widget-container');
    const triggerBtn = document.getElementById('vapi-trigger-btn');
    const closeCardBtn = document.getElementById('vapi-close-card');
    const actionBtn = document.getElementById('vapi-action-btn');
    const statusBadge = document.getElementById('vapi-status-badge');
    const infoText = document.getElementById('vapi-info-text');
    const waveform = document.getElementById('vapi-waveform');
    const emailContainer = document.getElementById('vapi-email-container');
    const emailInput = document.getElementById('vapi-user-email');

    // Toggle card visibility
    triggerBtn.addEventListener('click', () => {
      container.classList.toggle('vapi-widget-open');
    });

    closeCardBtn.addEventListener('click', () => {
      container.classList.remove('vapi-widget-open');
    });

    // Action button logic
    actionBtn.addEventListener('click', () => {
      if (!isCallActive) {
        startCall();
      } else {
        stopCall();
      }
    });

    // Vapi Event Listeners
    vapi.on('call-start', () => {
      isCallActive = true;
      statusBadge.innerText = 'Llamada en curso';
      statusBadge.className = 'vapi-status-badge online';
      infoText.innerText = 'Habla con el analista para tu pre-scoring. Puedes colgar en cualquier momento pulsando el botón de abajo.';
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
      infoText.innerText = 'Ocurrió un error de conexión al iniciar la llamada. Por favor, inténtalo de nuevo.';
    });

    // Dynamic wave animation based on voice volume
    vapi.on('volume-level', (volume) => {
      // Scale bars dynamically based on volume (from 0 to 1)
      const bars = document.querySelectorAll('.vapi-bar');
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
      const emailValue = emailInput ? emailInput.value.trim() : '';

      if (!emailValue || !validateEmail(emailValue)) {
        alert('Por favor, introduce un email válido para iniciar la llamada.');
        if (emailInput) emailInput.focus();
        return;
      }

      statusBadge.innerText = 'Llamando...';
      statusBadge.className = 'vapi-status-badge calling';
      infoText.innerText = 'Conectando con el analista de voz inteligente. Por favor, permite el acceso al micrófono si el navegador lo solicita.';
      actionBtn.disabled = true;
      if (emailContainer) emailContainer.style.display = 'none';

      vapi.start(ASSISTANT_ID, {
        assistant: {
          variableValues: {
            email: emailValue
          }
        }
      }).catch(err => {
        console.error('Failed to start call:', err);
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
      infoText.innerText = 'Realiza tu pre-scoring hipotecario hablando directamente con nuestro asistente de voz inteligente. Sin formularios, rápido y gratuito.';
      if (emailContainer) emailContainer.style.display = 'block';
      actionBtn.innerHTML = '<i class="fas fa-phone-alt"></i> Iniciar Llamada';
      actionBtn.className = 'btn btn-primary';
      waveform.classList.remove('active');
      
      // Reset waveform bar heights
      const bars = document.querySelectorAll('.vapi-bar');
      bars.forEach(bar => bar.style.height = '6px');
    }

    // Auto-start call if 'autostart=true' query param is present
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('autostart') === 'true') {
      // Auto-open widget card
      container.classList.add('vapi-widget-open');
      // Delay slightly to let the animation start, then start call
      setTimeout(() => {
        if (!isCallActive) {
          startCall();
        }
      }, 1000);
    }
  }
})();
