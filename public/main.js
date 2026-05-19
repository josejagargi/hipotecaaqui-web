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
    const btnBack = document.getElementById('btn-back');

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
                document.querySelectorAll('.conditional-block').forEach(block => block.classList.remove('active'));
            }, 400);
        }
    };

    studyButtons.forEach(btn => {
        if (btn) btn.addEventListener('click', openModal);
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (btnBack) btnBack.addEventListener('click', closeModal);

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
        toggleProp.addEventListener('change', () => {
            // Show property details if they have found a property (not "Buscando")
            blockProp.classList.toggle('active', toggleProp.value !== 'Buscando');
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

            // If no second titular, remove related fields to prevent Airtable errors
            if (!isT2) {
                delete data['Ingresos titular 2'];
                delete data['Tipo trabajo T2'];
                delete data['Num pagas T2'];
                delete data['Antiguedad T2'];
            }

            // If property not found, remove property details
            if (toggleProp.value === 'Buscando') {
                delete data['Precio del inmueble'];
                delete data['Tipo vivienda'];
                delete data['Localidad inmueble'];
                delete data['CP Localidad'];
            }

            // Associate Franchisee automatically if logged in on the same browser session
            const loggedInFranquiciadoId = localStorage.getItem('currentUserFranquiciadoId');
            if (loggedInFranquiciadoId) {
                data['Franquiciados'] = [loggedInFranquiciadoId];
            }

            try {
                const response = await fetch('/.netlify/functions/save-to-airtable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    if (formContainer) formContainer.style.display = 'none';
                    if (successContainer) successContainer.style.display = 'block';
                } else {
                    console.error('Airtable Error Details:', result);
                    alert('Error al enviar la solicitud: ' + (result.error?.message || result.message || 'Error desconocido'));
                }
            } catch (error) {
                console.error('Submission error:', error);
                alert('Error de conexión al enviar la solicitud.');
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
