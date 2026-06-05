document.addEventListener('DOMContentLoaded', () => {
    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Mobile Menu Toggle
    const mobileToggle = document.getElementById('mobile-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = mobileToggle.querySelector('i');
            if (navLinks.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                const icon = mobileToggle.querySelector('i');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            });
        });
    }

    // Sticky Header effect
    const header = document.querySelector('header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.padding = '0.5rem 0';
            header.style.boxShadow = '0 5px 20px rgba(0,0,0,0.1)';
        } else {
            header.style.padding = '1rem 0';
            header.style.boxShadow = 'none';
        }
    });

    // FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        item.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close other items
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
            });

            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // Modal Logic
    const modal = document.getElementById('feasibility-modal');
    const closeBtn = document.getElementById('close-modal');
    const form = document.getElementById('feasibility-form');
    const formContainer = document.getElementById('form-container');
    const successContainer = document.getElementById('success-container');
    const loadingContainer = document.getElementById('loading-container');
    const viableContainer = document.getElementById('viable-container');
    const manualContainer = document.getElementById('manual-container');
    const btnBack = document.getElementById('btn-back');
    const btnViableBack = document.getElementById('btn-viable-back');
    const btnManualBack = document.getElementById('btn-manual-back');

    // All buttons that should open the modal
    const studyButtons = [
        document.getElementById('btn-estudio'),
        document.getElementById('btn-free-study-header'),
        document.getElementById('btn-hero-study'),
        document.getElementById('btn-study-case')
    ];

    const openModal = (e) => {
        if (e) e.preventDefault();
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };

    const closeModal = () => {
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            // Reset form state after closure
            setTimeout(() => {
                if (form) form.reset();
                if (formContainer) formContainer.style.display = 'block';
                if (successContainer) successContainer.style.display = 'none';
                if (loadingContainer) loadingContainer.style.display = 'none';
                if (viableContainer) viableContainer.style.display = 'none';
                if (manualContainer) manualContainer.style.display = 'none';
                document.querySelectorAll('.conditional-block').forEach(block => {
                    if (block.id === 'propiedad-block') {
                        block.classList.add('active');
                    } else {
                        block.classList.remove('active');
                    }
                });
            }, 400);
        }
    };

    studyButtons.forEach(btn => {
        if (btn) btn.addEventListener('click', openModal);
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (btnBack) btnBack.addEventListener('click', closeModal);
    if (btnViableBack) btnViableBack.addEventListener('click', closeModal);
    if (btnManualBack) btnManualBack.addEventListener('click', closeModal);

    // Close on outside click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // Conditional Blocks Logic
    const toggleT2 = document.getElementById('hay_segundo_titular');
    const blockT2 = document.getElementById('titular-2-block');
    const toggleProp = document.getElementById('encontrado_propiedad');
    const blockProp = document.getElementById('propiedad-block');

    if (toggleT2 && blockT2) {
        toggleT2.addEventListener('change', () => {
            blockT2.classList.toggle('active', toggleT2.checked);
        });
    }

    if (toggleProp && blockProp) {
        // Show property details block for all selections
        blockProp.classList.add('active');
        toggleProp.addEventListener('change', () => {
            blockProp.classList.add('active');
        });
    }

    // Form Submission
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-form');
            const originalBtnText = submitBtn ? submitBtn.innerText : 'ENVIAR';
            
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = 'ENVIANDO...';
            }

            const formData = new FormData(form);
            const data = {};
            
            // List of fields that should be treated as numbers in Airtable
            const numberFields = [
                'Edad sim', 'Antiguedad sim', 'Ingresos titular 1', 'Num pagas T1',
                'Ingresos titular 2', 'Num pagas T2', 'Antiguedad T2',
                'Otros prestamos mensuales', 'Capital pendiente', 'Ahorros',
                'Precio del inmueble'
            ];

            formData.forEach((value, key) => {
                // Skip internal UI fields
                if (key === 'hay_segundo_titular') return;
                
                // Only include non-empty values
                if (value === '' || value === null || value === undefined) return;

                if (numberFields.includes(key)) {
                    data[key] = Number(value);
                } else {
                    data[key] = value;
                }
            });

            // Handle "Hay segundo titular" mapping
            const isT2 = toggleT2.checked;
            data['Hay segundo titular'] = isT2 ? 'Si' : 'No';

            // Validation checks
            const edadSim = data['Edad sim'] !== undefined ? Number(data['Edad sim']) : null;
            if (edadSim !== null && !isNaN(edadSim) && (edadSim < 18 || edadSim > 80)) {
                alert('La edad del Titular 1 debe estar entre 18 y 80 años.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
                return;
            }

            const ingresosT1 = data['Ingresos titular 1'] !== undefined ? Number(data['Ingresos titular 1']) : null;
            if (ingresosT1 !== null && !isNaN(ingresosT1) && (ingresosT1 <= 0 || ingresosT1 >= 100000)) {
                alert('Los ingresos mensuales del Titular 1 deben ser mayores que cero y menores de 100.000 €.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
                return;
            }

            const ingresosT2 = data['Ingresos titular 2'] !== undefined ? Number(data['Ingresos titular 2']) : null;
            if (isT2 && ingresosT2 !== null && !isNaN(ingresosT2) && (ingresosT2 <= 0 || ingresosT2 >= 100000)) {
                alert('Los ingresos mensuales del Titular 2 deben ser mayores que cero y menores de 100.000 €.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
                return;
            }

            const otrosPrestamos = data['Otros prestamos mensuales'] !== undefined ? Number(data['Otros prestamos mensuales']) : null;
            if (otrosPrestamos !== null && !isNaN(otrosPrestamos) && (otrosPrestamos < 0 || otrosPrestamos >= 1000000)) {
                alert('El importe de Otros préstamos mensuales debe ser mayor o igual a cero y tener un máximo de 6 dígitos.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
                return;
            }

            const capitalPendiente = data['Capital pendiente'] !== undefined ? Number(data['Capital pendiente']) : null;
            if (capitalPendiente !== null && !isNaN(capitalPendiente) && (capitalPendiente < 0 || capitalPendiente >= 1000000)) {
                alert('El Capital pendiente de devolución debe ser mayor o igual a cero y tener un máximo de 6 dígitos.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
                return;
            }

            const ahorros = data['Ahorros'] !== undefined ? Number(data['Ahorros']) : null;
            if (ahorros !== null && !isNaN(ahorros) && (ahorros < 0 || ahorros >= 1000000)) {
                alert('Los Ahorros disponibles deben ser mayores o iguales a cero y tener un máximo de 6 dígitos.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
                return;
            }

            const precioInmueble = data['Precio del inmueble'] !== undefined ? Number(data['Precio del inmueble']) : null;
            if (precioInmueble !== null && !isNaN(precioInmueble) && (precioInmueble < 0 || precioInmueble >= 1000000)) {
                alert('El Precio del inmueble debe ser mayor o igual a cero y tener un máximo de 6 dígitos.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
                return;
            }

            const antiguedadSim = data['Antiguedad sim'] !== undefined ? Number(data['Antiguedad sim']) : null;
            if (antiguedadSim !== null && !isNaN(antiguedadSim) && (antiguedadSim < 0 || antiguedadSim > 60)) {
                alert('Los Años Antigüedad T1 deben ser mayores o iguales a cero y menores o iguales a 60.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
                return;
            }

            const antiguedadT2 = data['Antiguedad T2'] !== undefined ? Number(data['Antiguedad T2']) : null;
            if (isT2 && antiguedadT2 !== null && !isNaN(antiguedadT2) && (antiguedadT2 < 0 || antiguedadT2 > 60)) {
                alert('Los Años Antigüedad T2 deben ser mayores o iguales a cero y menores o iguales a 60.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
                return;
            }

            // If no second titular, remove related fields to prevent Airtable errors
            if (!isT2) {
                delete data['Ingresos titular 2'];
                delete data['Tipo trabajo T2'];
                delete data['Num pagas T2'];
                delete data['Antiguedad T2'];
            }

            // Keep property details regardless of finding status so they are saved if filled

            // Associate Franchisee automatically if logged in on the same browser session
            const loggedInFranquiciadoId = localStorage.getItem('currentUserFranquiciadoId');
            if (loggedInFranquiciadoId) {
                data['Franquiciados'] = [loggedInFranquiciadoId];
            }

            // Map LOPD and consent checkbox boolean values
            data['Aceptacion privacidad'] = document.getElementById('aceptacion_privacidad') ? document.getElementById('aceptacion_privacidad').checked : false;
            data['Consentimiento'] = document.getElementById('consentimiento_comercial') ? document.getElementById('consentimiento_comercial').checked : false;

            try {
                // Show loading container and hide form container
                if (formContainer) formContainer.style.display = 'none';
                if (loadingContainer) loadingContainer.style.display = 'block';

                // Local helper to format currency
                const formatPrice = (val) => {
                    if (val === null || val === undefined) return '--';
                    if (Array.isArray(val)) val = val[0];
                    if (typeof val === 'string') {
                        const cleaned = val.replace(/[^0-9.,-]/g, '').replace(',', '.');
                        val = parseFloat(cleaned);
                    }
                    if (isNaN(val) || val <= 0) return '--';
                    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
                };

                // Animate progress bar & loading texts
                const progressEl = document.getElementById('scoring-progress');
                const loadingTitleEl = document.getElementById('loading-title');
                const loadingSubtitleEl = document.getElementById('loading-subtitle');
                
                const loadingMessages = [
                    { title: "Analizando viabilidad...", subtitle: "Cruzando datos con más de 30 entidades financieras en tiempo real." },
                    { title: "Verificando perfil...", subtitle: "Validando la estabilidad laboral y antigüedad simulada." },
                    { title: "Calculando ratios...", subtitle: "Evaluando ratios de endeudamiento y capacidad de aportación." },
                    { title: "Buscando ofertas...", subtitle: "Filtrando productos hipotecarios más ventajosos..." },
                    { title: "Finalizando informe...", subtitle: "Preparando los resultados del estudio." }
                ];

                let messageIndex = 0;
                let progressPercent = 0;
                
                if (progressEl) progressEl.style.width = '0%';
                if (loadingTitleEl) loadingTitleEl.innerText = loadingMessages[0].title;
                if (loadingSubtitleEl) loadingSubtitleEl.innerText = loadingMessages[0].subtitle;

                const messageInterval = setInterval(() => {
                    messageIndex = (messageIndex + 1) % loadingMessages.length;
                    if (loadingTitleEl) loadingTitleEl.innerText = loadingMessages[messageIndex].title;
                    if (loadingSubtitleEl) loadingSubtitleEl.innerText = loadingMessages[messageIndex].subtitle;
                }, 4000);

                const progressInterval = setInterval(() => {
                    if (progressPercent < 90) {
                        progressPercent += Math.floor(Math.random() * 5) + 2;
                        if (progressPercent > 90) progressPercent = 90;
                        if (progressEl) progressEl.style.width = `${progressPercent}%`;
                    }
                }, 400);

                const response = await fetch('/.netlify/functions/save-to-airtable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (!response.ok) {
                    clearInterval(messageInterval);
                    clearInterval(progressInterval);
                    console.error('Airtable Error Details:', result);
                    alert('Error al enviar la solicitud: ' + (result.error?.message || result.message || 'Error desconocido'));
                    if (loadingContainer) loadingContainer.style.display = 'none';
                    if (formContainer) formContainer.style.display = 'block';
                    return;
                }

                // Polling logic
                const recordId = result.id;
                let attempts = 0;
                const maxAttempts = 16; // 16 * 2.5s = 40 seconds max
                
                const pollInterval = setInterval(async () => {
                    attempts++;
                    try {
                        const statusRes = await fetch(`/.netlify/functions/check-scoring?id=${recordId}`);
                        const statusData = await statusRes.json();
                        console.log('Scoring status data fetched:', statusData);

                        if (statusRes.ok && statusData.ready) {
                            clearInterval(pollInterval);
                            clearInterval(messageInterval);
                            clearInterval(progressInterval);
                            if (progressEl) progressEl.style.width = '100%';

                            setTimeout(() => {
                                if (loadingContainer) loadingContainer.style.display = 'none';

                                const isViable = statusData.viabilidad && statusData.viabilidad.toLowerCase().includes('viable') && !statusData.viabilidad.toLowerCase().includes('no viable');
                                if (isViable) {
                                    if (viableContainer) {
                                        document.getElementById('viable-fija').innerText = formatPrice(statusData.cuotaFija);
                                        document.getElementById('viable-mixta').innerText = formatPrice(statusData.cuotaMixta);
                                        document.getElementById('viable-variable').innerText = formatPrice(statusData.cuotaVariable);
                                        
                                        // Update context description if they have a specific number of viable options
                                        const descText = document.querySelector('#viable-container .result-desc');
                                        if (descText) {
                                            if (statusData.numViables) {
                                                descText.innerText = `El scoring automático ha pre-aprobado tu solicitud con ${statusData.numViables} ofertas bancarias viables. Aquí tienes las mejores cuotas estimadas:`;
                                            } else {
                                                descText.innerText = `El scoring automático ha pre-aprobado tu solicitud. Aquí tienes las mejores cuotas estimadas:`;
                                            }
                                        }

                                        viableContainer.style.display = 'block';
                                    }
                                } else {
                                    if (manualContainer) {
                                        const manualTitle = document.getElementById('manual-title');
                                        const manualDesc = document.getElementById('manual-desc');
                                        const isNoViable = statusData.viabilidad && statusData.viabilidad.toLowerCase().includes('no viable');
                                        
                                        if (isNoViable) {
                                            if (manualTitle) manualTitle.innerText = 'Scoring Completo';
                                            if (manualDesc) manualDesc.innerText = 'Parece que tu hipoteca no es viable de forma automática. A continuación te mostramos los indicadores clave de tu estudio:';
                                        } else {
                                            if (manualTitle) manualTitle.innerText = 'Estudio en Revisión Manual';
                                            if (manualDesc) manualDesc.innerText = 'Tu perfil financiero presenta particularidades que requieren un análisis personalizado. A continuación te mostramos los indicadores de viabilidad automática de tu estudio:';
                                        }

                                        // Render semaphores if available
                                        const getSemEmoji = (val) => {
                                            if (!val) return '⚪';
                                            const s = String(val).trim().toLowerCase();
                                            if (s.includes('🔴') || s.includes('rojo') || s.includes('red')) return '🔴';
                                            if (s.includes('🟢') || s.includes('verde') || s.includes('green')) return '🟢';
                                            if (s.includes('🟡') || s.includes('amarillo') || s.includes('yellow') || s.includes('orange') || s.includes('naranja')) return '🟡';
                                            return val; // could be another emoji or string directly
                                        };

                                        const semBox = document.getElementById('semaphores-box');
                                        const semEst = document.getElementById('sem-estabilidad');
                                        const semEsf = document.getElementById('sem-esfuerzo');
                                        const semAho = document.getElementById('sem-ahorros');

                                        if (semBox && (statusData.semaforoEstabilidad || statusData.semaforoEsfuerzo || statusData.semaforo20masgastos)) {
                                            if (semEst) semEst.innerText = getSemEmoji(statusData.semaforoEstabilidad);
                                            if (semEsf) semEsf.innerText = getSemEmoji(statusData.semaforoEsfuerzo);
                                            if (semAho) semAho.innerText = getSemEmoji(statusData.semaforo20masgastos);
                                            semBox.style.display = 'block';
                                        } else if (semBox) {
                                            semBox.style.display = 'none';
                                        }

                                        manualContainer.style.display = 'block';
                                    }
                                }

                                if (window.lucide) {
                                    window.lucide.createIcons();
                                }
                            }, 500);
                        } else if (attempts >= maxAttempts) {
                            // Timeout: show fallback success message
                            clearInterval(pollInterval);
                            clearInterval(messageInterval);
                            clearInterval(progressInterval);
                            if (loadingContainer) loadingContainer.style.display = 'none';
                            if (successContainer) successContainer.style.display = 'block';
                            if (window.lucide) {
                                window.lucide.createIcons();
                            }
                        }
                    } catch (err) {
                        console.error('Error polling scoring status:', err);
                    }
                }, 2500);

            } catch (error) {
                console.error('Submission error:', error);
                alert('Error de conexión al enviar la solicitud.');
                if (loadingContainer) loadingContainer.style.display = 'none';
                if (formContainer) formContainer.style.display = 'block';
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
            }
        });
    }

    // Scroll reveal animation using Intersection Observer
    const animateOnScroll = () => {
        const observerOptions = {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    // Once visible, we can stop observing this element
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        const animatedElements = document.querySelectorAll('.animate-on-scroll');
        animatedElements.forEach(el => observer.observe(el));
    };

    // Initialize animations
    animateOnScroll();
});
