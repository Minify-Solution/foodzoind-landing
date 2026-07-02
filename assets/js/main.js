document.addEventListener('DOMContentLoaded', () => {
    
    /* =========================================
       Number Counter Animation
       ========================================= */
    const statsSection = document.getElementById('stats');
    const counters = document.querySelectorAll('.counter, .counter-float');
    let animated = false;

    const animateCounters = () => {
        counters.forEach(counter => {
            const target = parseFloat(counter.getAttribute('data-target'));
            const duration = 2000; // 2 seconds
            const isFloat = counter.classList.contains('counter-float');
            const stepTime = Math.abs(Math.floor(duration / (isFloat ? target * 10 : target)));
            
            let current = 0;
            const increment = isFloat ? 0.1 : Math.ceil(target / 100);

            const timer = setInterval(() => {
                current += increment;
                
                if (current >= target) {
                    counter.innerText = isFloat ? target.toFixed(1) : target.toLocaleString();
                    clearInterval(timer);
                } else {
                    counter.innerText = isFloat ? current.toFixed(1) : Math.floor(current).toLocaleString();
                }
            }, stepTime);
        });
    };

    // Intersection Observer to trigger animation when scrolled into view
    if (statsSection) {
        const observer = new IntersectionObserver((entries) => {
            const [entry] = entries;
            if (entry.isIntersecting && !animated) {
                animateCounters();
                animated = true;
            }
        }, { threshold: 0.5 });

        observer.observe(statsSection);
    }

    /* =========================================
       App Showcase Carousel
       ========================================= */
    const track = document.getElementById('carouselTrack');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (track && prevBtn && nextBtn) {
        let currentIndex = 0;
        const slides = track.querySelectorAll('.carousel-slide');
        const totalSlides = slides.length;
        // Slide width (280px) + Gap (40px) as defined in CSS
        const slideWidth = 320; 

        const updateCarousel = () => {
            track.style.transform = `translateX(-${currentIndex * slideWidth}px)`;
        };

        nextBtn.addEventListener('click', () => {
            if (currentIndex < totalSlides - 1) {
                currentIndex++;
            } else {
                currentIndex = 0; // Loop back to start
            }
            updateCarousel();
        });

        prevBtn.addEventListener('click', () => {
            if (currentIndex > 0) {
                currentIndex--;
            } else {
                currentIndex = totalSlides - 1; // Loop to end
            }
            updateCarousel();
        });
    }

    /* =========================================
       Analytics Event Tracking
       ========================================= */
    // Track App Downloads
    const downloadLinks = document.querySelectorAll('.track-download');
    downloadLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const platform = link.innerText.includes('App Store') ? 'iOS' : 'Android';
            
            // Push to GA4 DataLayer
            if (window.dataLayer) {
                window.dataLayer.push({
                    'event': 'app_download_click',
                    'platform': platform
                });
            }
        });
    });

    // Track Outbound Links (Socials, external pages)
    const outboundLinks = document.querySelectorAll('.track-outbound');
    outboundLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (window.dataLayer) {
                window.dataLayer.push({
                    'event': 'outbound_link_click',
                    'url': link.href
                });
            }
        });
    });
});

/* =========================================
       Analytics Event Tracking (GA4 + Meta Pixel)
       ========================================= */
    // Track App Downloads
    const downloadLinks = document.querySelectorAll('.track-download');
    downloadLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const platform = link.innerText.includes('App Store') ? 'iOS' : 'Android';
            
            // 1. Push to GA4 DataLayer
            if (window.dataLayer) {
                window.dataLayer.push({
                    'event': 'app_download_click',
                    'platform': platform
                });
            }

            // 2. Push to Meta Pixel
            if (typeof fbq === 'function') {
                fbq('trackCustom', 'AppDownload', {
                    platform: platform
                });
            }
        });
    });

    // Track Outbound Links (Socials, Contact, etc.)
    const outboundLinks = document.querySelectorAll('.track-outbound');
    outboundLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // 1. Push to GA4 DataLayer
            if (window.dataLayer) {
                window.dataLayer.push({
                    'event': 'outbound_link_click',
                    'url': link.href
                });
            }

            // 2. Push to Meta Pixel
            if (typeof fbq === 'function') {
                fbq('trackCustom', 'OutboundLinkClick', {
                    url: link.href
                });
            }
        });
    });