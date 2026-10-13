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

    /* =========================================
       Mobile Nav Toggle
       ========================================= */
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');

    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('open');
            navToggle.setAttribute('aria-expanded', isOpen);
            navToggle.innerHTML = isOpen
                ? '<i class="fas fa-times"></i>'
                : '<i class="fas fa-bars"></i>';
        });

        // Close the menu when a link is tapped
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('open');
                navToggle.setAttribute('aria-expanded', 'false');
                navToggle.innerHTML = '<i class="fas fa-bars"></i>';
            });
        });
    }

    /* =========================================
       FAQ Accordion
       ========================================= */
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            // Close all, then open the clicked one if it was closed
            faqItems.forEach(i => i.classList.remove('active'));
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    /* =========================================
       Scroll to Top Button
       ========================================= */
    const scrollTopBtn = document.getElementById('scrollTop');
    if (scrollTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 500) {
                scrollTopBtn.classList.add('visible');
            } else {
                scrollTopBtn.classList.remove('visible');
            }
        });
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* =========================================
       Smooth Scroll for Anchor Links
       ========================================= */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#' || targetId.length < 2) return;
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                const offset = 90; // sticky navbar height
                const top = target.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        });
    });

    /* =========================================
       Explore Vendors (from static snapshot)
       ========================================= */
    const vendorTabs = document.getElementById('vendorCityTabs');
    const vendorGrid = document.getElementById('vendorGrid');
    const vendorEmpty = document.getElementById('vendorEmpty');

    const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const renderVendorCard = (v) => {
        const openBadge = v.open
            ? '<span class="vendor-status">Open</span>'
            : '<span class="vendor-status closed">Closed</span>';
        const typeBadge = v.superMarket
            ? '<span class="vendor-type-badge"><i class="fas fa-shopping-basket"></i> Grocery</span>'
            : '<span class="vendor-type-badge"><i class="fas fa-utensils"></i> Restaurant</span>';
        const logo = v.logoUrl
            ? `<img src="${escapeHtml(v.logoUrl)}" alt="${escapeHtml(v.name)}" loading="lazy">`
            : '';
        const rating = (v.avgRating != null)
            ? `<span class="vendor-rating"><i class="fas fa-star"></i> ${v.avgRating}${v.totalRatings ? ` (${v.totalRatings})` : ''}</span>`
            : '';
        const deliver = v.timeToDeliver
            ? `<span><i class="fas fa-clock"></i> ${escapeHtml(v.timeToDeliver)}</span>`
            : '';
        const hours = (v.openTime && v.closeTime)
            ? `<span><i class="fas fa-door-open"></i> ${escapeHtml(v.openTime)}–${escapeHtml(v.closeTime)}</span>`
            : '';
        // Link to the crawlable SEO page (which deep-links to the app).
        const href = v.slug ? `restaurant/${v.slug}/` : (v.url || '#');

        return `
        <a class="vendor-card" href="${escapeHtml(href)}">
            <div class="vendor-card-media">
                ${logo}
                ${openBadge}
                ${typeBadge}
            </div>
            <div class="vendor-card-body">
                <h3 class="vendor-name">${escapeHtml(v.name)}</h3>
                <div class="vendor-info">
                    ${rating}
                    ${deliver}
                    ${hours}
                </div>
                <span class="vendor-order-btn">View Menu <i class="fas fa-arrow-right"></i></span>
            </div>
        </a>`;
    };

    const renderCity = (city) => {
        if (!city || !city.vendors || !city.vendors.length) {
            vendorGrid.innerHTML = '';
            vendorEmpty.hidden = false;
            vendorEmpty.textContent = 'No partners listed for this city yet.';
            return;
        }
        vendorEmpty.hidden = true;
        vendorGrid.innerHTML = city.vendors.map(renderVendorCard).join('');
    };

    // Teaser elements (homepage): limited preview, no city tabs.
    const teaserGrid = document.getElementById('vendorGridTeaser');
    const teaserEmpty = document.getElementById('vendorEmptyTeaser');

    const renderFullList = (data) => {
        const cities = (data.cities || []).filter((c) => c.vendors && c.vendors.length);
        if (!cities.length) {
            vendorEmpty.hidden = false;
            vendorEmpty.textContent = 'No partners listed yet.';
            return;
        }
        const activeTabs = cities.map((c, i) =>
            `<button class="vendor-tab${i === 0 ? ' active' : ''}" data-city="${i}" role="tab">${escapeHtml(c.name)} <small>(${c.vendorCount})</small></button>`
        ).join('');
        const soonTabs = (data.comingSoon || []).map((name) =>
            `<span class="vendor-tab coming-soon" aria-disabled="true" title="Coming soon to ${escapeHtml(name)}">${escapeHtml(name)} <small>Coming soon</small></span>`
        ).join('');
        vendorTabs.innerHTML = activeTabs + soonTabs;

        renderCity(cities[0]);

        vendorTabs.querySelectorAll('button.vendor-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                vendorTabs.querySelectorAll('button.vendor-tab').forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                renderCity(cities[Number(tab.dataset.city)]);
            });
        });
    };

    const renderTeaser = (data) => {
        const limit = Number(teaserGrid.dataset.limit) || 6;
        // Flatten all cities, prefer open + highest rated.
        const all = (data.cities || []).flatMap((c) => c.vendors || []);
        all.sort((a, b) => {
            if (a.open !== b.open) return a.open ? -1 : 1;
            return (b.avgRating ?? 0) - (a.avgRating ?? 0);
        });
        const picks = all.slice(0, limit);
        if (!picks.length) {
            teaserEmpty.hidden = false;
            teaserEmpty.textContent = 'No partners listed yet.';
            return;
        }
        teaserEmpty.hidden = true;
        teaserGrid.innerHTML = picks.map(renderVendorCard).join('');
    };

    if ((vendorTabs && vendorGrid) || teaserGrid) {
        fetch('assets/data/vendors.json', { cache: 'no-cache' })
            .then((r) => {
                if (!r.ok) throw new Error('vendors.json ' + r.status);
                return r.json();
            })
            .then((data) => {
                if (vendorTabs && vendorGrid) renderFullList(data);
                if (teaserGrid) renderTeaser(data);
            })
            .catch((err) => {
                console.warn('Vendor list unavailable:', err.message);
                const emptyEl = vendorEmpty || teaserEmpty;
                if (emptyEl) {
                    emptyEl.hidden = false;
                    emptyEl.textContent = 'Vendor list is temporarily unavailable.';
                }
            });
    }

    /* =========================================
       Scroll Reveal Animations
       ========================================= */
    const revealEls = document.querySelectorAll('.reveal');
    if (revealEls.length) {
        const revealObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        revealEls.forEach(el => revealObserver.observe(el));
    }
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