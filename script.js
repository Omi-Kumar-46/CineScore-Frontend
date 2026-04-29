/* ============================================================
   CINESCORE MASTER ENGINE v5.0 (OPTIMIZED & SAFE)
   ============================================================ */

// 0. UTILITIES
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// 1. THE GLOBAL DOM CACHE
const CineDOM = {
    loader: null,
    authModal: null,
    blankState: null,
    resultsView: null,
    backBtn: null,
    mainSearch: null,
    contentSlider: null
};

// 2. THE GLOBAL STATE MACHINE
window.CineState = {
    isLoggedIn: localStorage.getItem('cs_logged_in') === 'true',
    activeTheme: localStorage.getItem('cs_theme') || 'dark',
    currentView: 'SEARCH' // 'SEARCH' or 'RESULTS'
};

// 2.3 THE GENRE DICTIONARY (TMDB Mapping)
const GENRE_MAP = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Doc", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
};

// 2.5 THE CINE-API BRIDGE (Master Integration)
window.CineAPI = {
    BASE_URL: "http://127.0.0.1:8000",

    async predict(pitchData) {
        if (window.CineState.offlineMode) return null;
        try {
            const resp = await fetch(`${this.BASE_URL}/predict`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(pitchData)
            });
            if (!resp.ok) throw new Error("API Predict Failed");
            return await resp.json();
        } catch (e) {
            console.error("CineAPI Predict Error:", e);
            if (e.message.includes('Failed to fetch')) window.CineState.offlineMode = true;
            return null;
        }
    },

    async searchShowdown(query) {
        if (window.CineState.offlineMode) return [];
        try {
            const resp = await fetch(`${this.BASE_URL}/search_showdown?title=${encodeURIComponent(query)}`);
            if (!resp.ok) throw new Error("API Search Failed");
            return await resp.json();
        } catch (e) {
            console.error("CineAPI Search Error:", e);
            if (e.message.includes('Failed to fetch')) window.CineState.offlineMode = true;
            return [];
        }
    },

    async getTrending() {
        if (window.CineState.offlineMode) return [];
        try {
            const resp = await fetch(`${this.BASE_URL}/trending_predictions`);
            if (!resp.ok) throw new Error("API Trending Failed");
            return await resp.json();
        } catch (e) {
            console.error("CineAPI Trending Error:", e);
            if (e.message.includes('Failed to fetch')) window.CineState.offlineMode = true;
            return [];
        }
    }
};

// 2.6 THE TMDB VISUAL ENGINE (Sequence 1 - SECURED via Backend Proxy)
window.TMDB_API = {
    // SECURITY: TOKEN is now stored in main.py. Frontend calls backend proxy.
    BASE_URL: "http://127.0.0.1:8000/tmdb", 
    IMG_URL: "https://image.tmdb.org/t/p/w500",
    IMG_PROXY_URL: "http://127.0.0.1:8000/tmdb/poster",

    async fetch(endpoint, params = "") {
        // 1. Silent Check: If we already know the backend is dead, don't even try.
        if (window.CineState.offlineMode) return null;

        // 2. Concurrency Lock: If a probe is already in flight, wait for it instead of starting a new one.
        if (this._activeProbe) return null; 

        try {
            this._activeProbe = true;
            const url = `${this.BASE_URL}/${endpoint}?${params}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500); // Tighten to 2.5s for snappy feel

            const resp = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            this._activeProbe = false;

            if (!resp.ok) throw new Error(`TMDB Proxy Failed: ${resp.status}`);
            return await resp.json();
        } catch (e) {
            this._activeProbe = false;
            console.warn("CineScore Safe-Mode Engaged (Local Only).");
            
            // Mark as offline for this session
            if (e.name === 'AbortError' || e.message.includes('Failed to fetch') || e.message.includes('Refused')) {
                window.CineState.offlineMode = true;
            }
            return null; 
        }
    },
    _activeProbe: false,

    async searchMovies(query) {
        const results = await this.fetch("search", `query=${encodeURIComponent(query)}`);
        return results || [];
    },

    async getUpcoming() {
        const results = await this.fetch("upcoming", "");
        return results || [];
    },

    async discoverReleased(genreId) {
        const results = await this.fetch("discover", `genre_id=${genreId}`);
        return results || [];
    },

    getPosterProxyUrl(input, size = "w500") {
        if (!input) return "";
        if (input.includes("/tmdb/poster?")) return input;

        let posterPath = "";
        if (input.startsWith("http")) {
            const match = input.match(/image\.tmdb\.org\/t\/p\/(?:original|w\d+)(\/.+)$/i);
            if (!match) return input;
            posterPath = match[1];
        } else if (input.startsWith("/")) {
            posterPath = input;
        } else {
            posterPath = `/${input.replace(/^\/+/, "")}`;
        }

        return `${this.IMG_PROXY_URL}?path=${encodeURIComponent(posterPath)}&size=${encodeURIComponent(size)}`;
    }
};

// 3. MASTER AUTH CONTROLLER (Fixes silent fails)
window.openAuthModal = () => { if (CineDOM.authModal) CineDOM.authModal.style.display = 'flex'; };
window.closeAuthModal = () => { if (CineDOM.authModal) CineDOM.authModal.style.display = 'none'; };

// 4. POSTER FALLBACK ENGINE (Global Image Error Handling)
document.addEventListener('error', (e) => {
    if (e.target.tagName?.toLowerCase() === 'img' && !e.target.dataset.fallbackApplied) {
        e.target.dataset.fallbackApplied = "true";
        e.target.src = 'https://placehold.co/600x900/0B192C/FFFFFF?text=Poster+Unavailable';
    }
}, true);

// ============================================================
// 5. MASTER INITIALIZER (The Central Brain)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Populate DOM cache NOW that the DOM is ready
    CineDOM.loader       = document.getElementById('global-page-loader');
    CineDOM.authModal    = document.getElementById('signupModal');
    CineDOM.blankState   = document.getElementById('blank-slate-view');
    CineDOM.resultsView  = document.getElementById('prediction-results-view');
    CineDOM.backBtn      = document.getElementById('back-to-lab');
    CineDOM.mainSearch   = document.getElementById('default-view-search-input') || document.querySelector('.search-input');
    CineDOM.contentSlider = document.querySelector('.content-slider');

    // ============================================================
    // HERO SEARCH — Wired directly here (scope-safe, mock-first)
    // ============================================================
    (function() {
        const heroInput = document.getElementById('hero-search');
        const heroBtn = document.getElementById('hero-predict-btn');
        const heroClearBtn = document.getElementById('hero-search-clear');
        const heroDropdown = document.getElementById('search-dropdown');

        if (!heroInput || !heroDropdown) return;

        const renderHeroResults = (matches, isSyncing) => {
            heroDropdown.innerHTML = '';
            heroDropdown.style.cssText = 'display:block!important; visibility:visible!important; opacity:1!important;';

            if (matches.length === 0) {
                if (!isSyncing) {
                    heroDropdown.innerHTML = '<li class="search-item" style="padding:24px;text-align:center;opacity:0.6;"><i class="fa-solid fa-film" style="margin-right:8px;"></i>No matches found.</li>';
                }
                return;
            }

            if (isSyncing) {
                const badge = document.createElement('div');
                badge.style.cssText = 'padding:8px 14px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--color-accent);display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,0.06);';
                badge.innerHTML = '<span style="width:6px;height:6px;background:var(--color-accent);border-radius:50%;box-shadow:0 0 8px var(--color-accent);display:inline-block;"></span> Syncing Live Data...';
                heroDropdown.appendChild(badge);
            }

            matches.forEach(movie => {
                const li = document.createElement('li');
                li.className = 'search-item';
                const imgUrl = (movie.poster_path && window.TMDB_API) ? `${window.TMDB_API.IMG_URL}${movie.poster_path}` : (movie.poster || 'https://placehold.co/42x60/111/FFF?text=Film');
                const yr = (movie.release_date || '').split('-')[0] || movie.year || 'TBA';
                const genreList = Array.isArray(movie.genres) ? movie.genres.slice(0, 2).join(' / ') : (movie.genres || 'Cinema');
                li.innerHTML = `<img class="search-poster" src="${imgUrl}" style="width:42px;height:60px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.src='https://placehold.co/42x60/111/FFF?text=Film'"><div style="flex:1;min-width:0;text-align:left;"><h4 class="search-title" style="margin:0 0 2px 0;font-size:14px;font-weight:600;color:var(--color-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${movie.title}</h4><span style="font-size:11px;color:var(--color-secondary);display:block;">${yr} · ${genreList}</span></div><i class="fa-solid fa-magnifying-glass-arrow-right search-right-icon" style="font-size:18px;opacity:0.35;flex-shrink:0;margin-left:10px;color:var(--color-accent);"></i>`;
                li.addEventListener('click', () => {
                    heroInput.value = movie.title;
                    heroDropdown.style.display = 'none';
                    // Store full movie context for Prediction page
                    const moviePayload = {
                        title: movie.title,
                        poster: imgUrl,
                        year: yr,
                        genres: movie.genres || [],
                        aiScore: movie.aiScore || null,
                        release_date: movie.release_date || null,
                        synopsis: movie.synopsis || movie.overview || ''
                    };
                    localStorage.setItem('cinescore_active_movie_data', JSON.stringify(moviePayload));
                    sessionStorage.setItem('cineScore_activePrediction', movie.title);
                    // Show splash & navigate
                    const splash = document.getElementById('splash-loader');
                    if (splash) splash.style.display = 'flex';
                    setTimeout(() => { window.location.href = 'Prediction.html'; }, 800);
                });
                heroDropdown.appendChild(li);
            });
        };

        let heroSearchTimeout;
        heroInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            const query = val.toLowerCase();
            clearTimeout(heroSearchTimeout);

            if (heroClearBtn) heroClearBtn.style.display = val.length > 0 ? 'block' : 'none';

            if (val.length === 1) {
                heroDropdown.innerHTML = '<li style="padding:16px;text-align:center;font-size:12px;opacity:0.6;color:var(--color-secondary);">Type at least 2 characters to search...</li>';
                heroDropdown.style.display = 'block';
                return;
            }
            if (val.length < 1) {
                heroDropdown.style.display = 'none';
                return;
            }

            // 1. Instant UI Feedback (Zero Latency)
            heroDropdown.innerHTML = '';
            heroDropdown.style.cssText = 'display:block!important; visibility:visible!important; opacity:1!important;';
            const badge = document.createElement('div');
            badge.style.cssText = 'padding:8px 14px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--color-accent);display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,0.06);';
            badge.innerHTML = '<span style="width:6px;height:6px;background:var(--color-accent);border-radius:50%;box-shadow:0 0 8px var(--color-accent);display:inline-block;"></span> Live Database Syncing...';
            heroDropdown.appendChild(badge);

            // 2. Local-First Search (Instant)
            const mocks = (window.mockMovies || []).filter(m => m.title.toLowerCase().includes(query)).slice(0, 5);
            if (mocks.length > 0) {
                renderHeroResults(mocks, true); // Show local results while syncing
            }

            // 3. Debounced API Call (Only if not in offline mode)
            heroSearchTimeout = setTimeout(async () => {
                if (!window.CineState.offlineMode && window.TMDB_API && typeof window.TMDB_API.searchMovies === 'function') {
                    try {
                        const live = await window.TMDB_API.searchMovies(query);
                        
                        if (heroInput.value.trim().toLowerCase() !== query) return;

                        if (live && live.length > 0) {
                            // Filter out duplicates that are already in mock
                            const filteredLive = live.filter(l => !mocks.some(m => m.title.toLowerCase() === l.title.toLowerCase()));
                            renderHeroResults([...mocks, ...filteredLive.slice(0, 5)], false);
                        } else if (mocks.length === 0) {
                            renderHeroResults([], false);
                        }
                    } catch (err) {
                        if (heroInput.value.trim().toLowerCase() !== query) return;
                        renderHeroResults(mocks, false);
                    }
                } else {
                    renderHeroResults(mocks, false);
                }
            }, 400);
        });

        document.addEventListener('click', (e) => {
            if (!heroDropdown.contains(e.target) && e.target !== heroInput) {
                heroDropdown.style.display = 'none';
            }
        });

        if (typeof attachKeyboardNav === 'function') attachKeyboardNav(heroInput, heroDropdown);

        if (heroClearBtn) {
            heroClearBtn.addEventListener('click', () => { 
                heroInput.value = ''; 
                heroDropdown.style.display = 'none'; 
                heroClearBtn.style.display = 'none'; 
                heroInput.focus(); 
            });
        }

        if (heroBtn) {
            heroBtn.addEventListener('click', () => {
                const title = heroInput.value.trim();
                if (!title) return;
                sessionStorage.setItem('cineScore_activePrediction', title);
                const splash = document.getElementById('splash-loader');
                if (splash) splash.style.display = 'flex';
                setTimeout(() => { window.location.href = 'Prediction.html'; }, 800);
            });
        }
    })();

    // Wake up Core Systems
    initLoaderSystem();
    if (typeof initThemeEngine === 'function') initThemeEngine();
    if (typeof initAuthLogic === 'function') initAuthLogic();
    if (typeof initGlobalInteractions === 'function') initGlobalInteractions();
    if (typeof initDefaultSearch === 'function') initDefaultSearch();

    // Wake up Page-Specific Logic (Prediction page only)
    if (CineDOM.resultsView) {
        if (typeof initAlgorithmEngine === 'function') initAlgorithmEngine();
        if (typeof initSliderMathEngine === 'function') initSliderMathEngine();
        if (typeof initShowdownSearch === 'function') initShowdownSearch();
        initNavigationFeatures();
    }

    // Legacy syncTMDBVisuals removed to prevent conflicts with UniversalDailyRotations
});

// ============================================================
// 6. NAVIGATION & SHORTCUTS (Feature Injection)
// ============================================================
function initNavigationFeatures() {
    // Keyboard Shortcut (/) to focus search instantly
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            
            // Intelligently find the active/visible search bar
            const possibleSearches = [
                document.getElementById('hero-search-input'),      // Prediction Result page
                document.getElementById('default-view-search-input'), // Prediction Hub page
                document.querySelector('.search-input'),              
                document.querySelector('input[type="search"]'),
                document.querySelector('input[name="q"]')
            ];
            
            for (let input of possibleSearches) {
                if (input && input.offsetParent !== null) { // OffsetParent is null if display is none
                    input.focus();
                    break;
                }
            }
        }
    });

    // Scroll to Top Floating Action Button
    const fab = document.createElement('button');
    fab.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
    fab.style.cssText = "position:fixed; bottom:30px; right:30px; width:45px; height:45px; border-radius:50%; background:var(--color-accent); color:white; border:none; cursor:pointer; display:none; z-index:999; box-shadow:0 5px 15px rgba(0,0,0,0.3); transition: 0.3s;";
    document.body.appendChild(fab);

    window.addEventListener('scroll', () => {
        fab.style.display = window.scrollY > 400 ? 'block' : 'none';
    });
    fab.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

    // Share Snapshot Feature (Snapshot Logic shifted to captureSnapshot in Section 18)
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn && typeof initPersistentUX === 'undefined') {
        // Fallback or placeholder if needed
    }
}

// ============================================================
// 7. THE LOADER ENGINE (Safely Encapsulated)
// ============================================================
let minLoadTimePassed = false;
let isPageLoaded = false;
let loaderInterval;

function initLoaderSystem() {
    const textEl = document.getElementById('cinematic-loader-text');
    const f1 = document.getElementById('frame-1');
    const f2 = document.getElementById('frame-2');

    if (f1 && f2 && textEl) {
        const hasSeenIntro = sessionStorage.getItem('cinescore_intro_played');

        if (!hasSeenIntro) {
            // TIER 1: First Visit
            sessionStorage.setItem('cinescore_intro_played', 'true');
            f1.style.display = 'flex';
            textEl.textContent = "Action!";
            let isClapper = false;

            loaderInterval = setInterval(() => {
                if (isClapper) {
                    f2.style.display = 'none';
                    f1.style.display = 'flex';
                    textEl.textContent = "Action!";
                } else {
                    f1.style.display = 'none';
                    f2.style.display = 'flex';
                    textEl.textContent = "Rolling Camera!";
                }
                isClapper = !isClapper;
            }, 1200);

            setTimeout(() => { minLoadTimePassed = true; checkDismissLoader(); }, 2400);
        } else {
            // TIER 2: Fast Navigation
            f2.style.display = 'flex';
            textEl.textContent = "Loading...";
            setTimeout(() => { minLoadTimePassed = true; checkDismissLoader(); }, 350);
        }
    } else {
        minLoadTimePassed = true;
    }

    window.addEventListener('load', () => {
        isPageLoaded = true;
        checkDismissLoader();
    });
}

function checkDismissLoader() {
    if (isPageLoaded && minLoadTimePassed) {
        const globalLoader = document.getElementById('global-page-loader');
        if (globalLoader) {
            if (loaderInterval) clearInterval(loaderInterval);
            globalLoader.classList.add('hidden');
        }
    }
}


// ============================================================
// 8. HELPER ENGINES & GLOBAL UI (Theme, Sliders, Formatting)
// ============================================================

/* --------------------------------------------------------
   1. GLOBAL UTILITIES (Theme & Modals)
   -------------------------------------------------------- */
function initThemeEngine() {
    const toggleBtn = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;
    const navLogo = document.getElementById('nav-logo');
    const footerLogo = document.getElementById('footer-logo');
    const sidebarLogo = document.getElementById('sidebar-logo');

    function updateLogos(theme) {
        const mainlogoPath = theme === 'dark' ? 'Assets/CineScore-Dark.webp' : 'Assets/CineScore-Light.webp';
        if (navLogo) navLogo.src = mainlogoPath;
        if (footerLogo) footerLogo.src = mainlogoPath;

        const dashboardLogoPath = theme === 'dark' ? 'Assets/CineScore-Light.webp' : 'Assets/CineScore-Dark.webp';
        if (sidebarLogo) sidebarLogo.src = dashboardLogoPath;
    }

    // Initialize state on load
    const currentTheme = localStorage.getItem('theme') || 'dark';
    htmlElement.setAttribute('data-theme', currentTheme);
    updateLogos(currentTheme);

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isDark = htmlElement.getAttribute('data-theme') === 'dark';
            const newTheme = isDark ? 'light' : 'dark';

            // STRICT DELEGATION: We only set the attribute. CSS does the animation.
            htmlElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateLogos(newTheme);

            // Redraw charts instantly if on prediction page
            const activeMovie = JSON.parse(localStorage.getItem('cinescore_active_movie_data'));
            if (activeMovie && typeof window.renderDynamicCharts === 'function') {
                let currentScenario = 'base';
                const activeScenarioBtn = document.querySelector('.scenario-btn.active');
                if (activeScenarioBtn) {
                    if (activeScenarioBtn.classList.contains('bull')) currentScenario = 'bull';
                    if (activeScenarioBtn.classList.contains('bear')) currentScenario = 'bear';
                }
                window.renderDynamicCharts(activeMovie, currentScenario);
            }
        });
    }
}

function initGlobalInteractions() {
    initCinematicSliders(); // Start ambient background

    // Escape Key logic for Modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (CineDOM.authModal) CineDOM.authModal.style.display = 'none';
        }
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        const navMenu = document.getElementById('user-menu-wrapper');
        const trigger = document.getElementById('user-profile-trigger');
        if (navMenu && trigger && !navMenu.contains(e.target) && !trigger.contains(e.target)) {
            navMenu.classList.remove('active');
        }
    });
}

function initAuthLogic() {
    // Placeholder for future explicit auth bindings.
    // Currently handled cleanly by window.openAuthModal in DOM.
}

function initCinematicSliders() {
    const sliders = document.querySelectorAll('.cinematic-slider');
    sliders.forEach(slider => {
        const slides = slider.querySelectorAll('img');
        if (slides.length <= 1) return;
        let currentIndex = 0;
        setInterval(() => {
            slides[currentIndex].classList.remove('active');
            currentIndex = (currentIndex + 1) % slides.length;
            slides[currentIndex].classList.add('active');
        }, 3000);
    });
}

function formatLargeNumber(num) {
    if (num === null || num === undefined) return '';
    if (typeof num === 'string' && (num.includes('M') || num.includes('K'))) return num;
    let val = parseFloat(num);
    if (isNaN(val)) return num;
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return val % 1 !== 0 ? val.toFixed(1) + 'M' : val.toString();
}

// ============================================================
// 9. THE ULTIMATE VIEW CONTROLLER (True SPA Router)
// ============================================================
window.resetToBlankState = function (isBrowserBack = false) {
    const resultsView = document.getElementById('prediction-results-view');
    const blankState = document.getElementById('blank-slate-view');

    if (resultsView && blankState) {
        // 1. Swipe Out Results Overlapping
        resultsView.style.position = 'absolute';
        resultsView.style.top = '0';
        resultsView.style.zIndex = '50';
        resultsView.classList.replace('view-visible', 'view-hidden');
        
        // 2. Fade/Swipe In Blank State immediately behind it
        blankState.style.display = 'flex';
        void blankState.offsetWidth; 
        blankState.classList.replace('view-hidden', 'view-visible');

        setTimeout(() => {
            resultsView.style.display = 'none';
            resultsView.style.position = 'relative'; // restore flow
            resultsView.style.zIndex = '';
        }, 1000); // 1-second buttery smooth swipe
    }

    // 3. UI Resets
    if (CineDOM.backBtn) CineDOM.backBtn.style.display = 'none';

    const defaultSearch = document.getElementById('defaultViewSearchInput');
    if (defaultSearch) defaultSearch.value = '';

    if (CineDOM.contentSlider) CineDOM.contentSlider.style.minHeight = 'auto';

    // 4. The SPA History Manager (Clears the ?p= from URL)
    sessionStorage.removeItem('cineScore_activePrediction');
    if (!isBrowserBack) {
        window.history.pushState({ view: 'SEARCH' }, '', window.location.pathname);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ============================================================
// 9.5. SPA BROWSER HISTORY ROUTER (Back/Forward Arrows)
// ============================================================
window.addEventListener('popstate', (e) => {
    const urlParams = new URLSearchParams(window.location.search);
    const queryMovie = urlParams.get('p');

    if (queryMovie) {
        // User hit Forward to a prediction
        sessionStorage.setItem('cineScore_activePrediction', queryMovie);
        if (typeof loadMovieData === 'function') loadMovieData(queryMovie, false);
    } else {
        // User hit Back to the Blank State
        resetToBlankState(true);
    }
});

// Fired by Search Bar or Posters
window.triggerPredictionState = function (movieName) {
    if (!movieName.trim()) return;

    // Clean search inputs and close dropdowns globally
    ['default-view-search-input', 'result-view-search-input', 'hubSearch', 'opponent-search-input'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.value = '';
            // Close clear buttons natively associated
            if (id === 'default-view-search-input') { const clr = document.getElementById('default-view-search-clear'); if (clr) clr.style.display = 'none'; }
            if (id === 'result-view-search-input') { const clr = document.getElementById('pred-clear-btn'); if (clr) clr.style.display = 'none'; }
            if (id === 'hubSearch') { const clr = document.getElementById('hub-clear-search'); if (clr) clr.classList.add('hidden'); }
            if (id === 'opponent-search-input') { const clr = document.getElementById('showdown-search-clear'); if (clr) clr.style.display = 'none'; }
        }
    });
    ['default-view-search-dropdown', 'result-view-search-dropdown', 'hubSearchDropdown', 'opponent-search-dropdown'].forEach(id => {
        const dd = document.getElementById(id);
        if (dd) dd.style.display = 'none';
    });

    sessionStorage.setItem('cineScore_activePrediction', movieName);

    // THE FIX: Push URL instantly so the browser knows we changed pages!
    window.history.pushState({ view: 'RESULTS', movie: movieName }, '', '?p=' + encodeURIComponent(movieName));

    const splash = document.getElementById('splash-loader');
    if (splash) splash.classList.add('active');

    setTimeout(() => {
        if (splash) splash.classList.remove('active');
        if (typeof loadMovieData === 'function') loadMovieData(movieName, true);
    }, 1800);
};

// --- MOVED TO GLOBAL SCOPE: Universal Keyboard Navigation Helper ---

function attachKeyboardNav(inputEl, dropdownEl) {
    inputEl.addEventListener('keydown', (e) => {
        if (dropdownEl.style.display === 'none') return;

        const items = dropdownEl.querySelectorAll('.search-item');
        if (items.length === 0) return;

        let activeIdx = Array.from(items).findIndex(item => item.classList.contains('active-search-item'));

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
        } else if (e.key === 'Enter') {
            e.preventDefault(); // THE FIX: Stops the browser from submitting forms/refreshing
            if (activeIdx >= 0) {
                items[activeIdx].click();
            } else {
                items[0].click(); // Defaults to top result
            }
            return;
        } else {
            return; // Normal typing
        }

        // Apply highlight classes
        items.forEach((item, i) => {
            if (i === activeIdx) {
                item.classList.add('active-search-item');
                // Ensure the selected item scrolls into view if list is long
                item.scrollIntoView({ block: "nearest" });
            } else {
                item.classList.remove('active-search-item');
            }
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {

    initCinematicSliders();
    // ==========================================
    // THE LIVE HYPE METER ENGINE (Daily Rotation)
    // ==========================================
    async function initLiveHypeMeter() {
        const tickerTrack = document.getElementById('live-hype-track');
        if (!tickerTrack) return;

        // CINESCORE BYPASS: Prioritize our high-fidelity 2026/2025 mock data
        // This avoids wasteful API calls for movies we've already benchmarked.
        const db = window.mockMovies || [];
        let movies = [...db];

        // Background Live Sync (Optional enhancement)
        if (!window.CineState.offlineMode) {
            try {
                const upcoming = await window.TMDB_API.getUpcoming();
                if (upcoming && upcoming.length > 0) {
                    const today = new Date();
                    const liveUpcoming = upcoming.filter(m => {
                        const title = (m.title || "").toLowerCase();
                        const isUpcoming = m.release_date && new Date(m.release_date) > today;
                        const isNotJunk = !title.includes('tour') && !title.includes('concert') && !title.includes('documentary');
                        return isUpcoming && isNotJunk;
                    });
                    // Merge live data with our master mock list
                    movies = [...movies, ...liveUpcoming];
                }
            } catch (e) { 
                console.log("Hype Meter: Running in Pure Local Mode."); 
            }
        }

        // Randomize rotation for fresh visuals on reload
        const randomized = movies.sort(() => 0.5 - Math.random());
        const displayMovies = randomized.slice(0, 10);

        let tickerHTML = '';
        displayMovies.forEach(movie => {
            const displayTitle = movie.title.length > 25 ? movie.title.substring(0, 22) + '...' : movie.title;
            const hypeVal = 75 + (movie.title.length % 23); 
            let trendClass = hypeVal > 85 ? 'neon-green' : (hypeVal > 80 ? 'neon-orange' : 'neon-red');
            let trendIcon = hypeVal > 85 ? 'fa-arrow-trend-up' : (hypeVal > 80 ? 'fa-minus' : 'fa-arrow-trend-down');
            let sign = hypeVal > 85 ? '+' : (hypeVal > 80 ? '' : '-');

            const imgUrl = movie.poster_path ? `${window.TMDB_API.IMG_URL}${movie.poster_path}` : (movie.poster || 'https://placehold.co/50x50/111/FFF?text=Film');

            tickerHTML += `
                <div class="ticker-item">
                    <img src="${imgUrl}" style="width: 50px; height: 50px; border-radius: 6px; object-fit: cover; box-shadow: 0 2px 5px rgba(0,0,0,0.5);">
                    <span>${displayTitle}</span>
                    <span class="hype-tag ${trendClass}"><i class="fa-solid ${trendIcon}"></i> ${sign}${hypeVal}%</span>
                </div>
            `;
        });

        tickerTrack.innerHTML = tickerHTML + tickerHTML;
    }

    // Fire the engine!
    initLiveHypeMeter();
    renderPredictionGrids();


    // --- SIDEBAR TOGGLE FIX ---
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }

    // --- TAB NAVIGATION ENGINE (Persistent & Context-Aware) ---

    const overviewLink = document.querySelector('a[title="Overview"]');
    const watchlistLink = document.querySelector('a[title="Watchlist"]');
    const legacyLink = document.querySelector('a[title="Legacy"]'); // NEW

    const overviewContent = document.getElementById('content-wrapper');
    const watchlistContent = document.getElementById('watchlist-section');
    const legacyContent = document.getElementById('legacy-section'); // NEW
    const accountContent = document.getElementById('account-section');

    // THE FIX: Smart URL Hash Routing
    const urlHash = window.location.hash.replace('#', '').replace('-section', '');
    if (['overview', 'watchlist', 'legacy', 'account'].includes(urlHash)) {
        window.cinescoreCurrentTab = urlHash;
        // Clean the URL so it looks neat after routing
        history.replaceState(null, null, window.location.pathname);
    } else {
        window.cinescoreCurrentTab = localStorage.getItem('cinescore_active_tab') || 'overview';
    }

    function switchTab(tabName) {
        window.cinescoreCurrentTab = tabName;
        localStorage.setItem('cinescore_active_tab', tabName);

        if (overviewLink) overviewLink.classList.toggle('active', tabName === 'overview');
        if (watchlistLink) watchlistLink.classList.toggle('active', tabName === 'watchlist');
        if (legacyLink) legacyLink.classList.toggle('active', tabName === 'legacy');

        // Hide all contents
        if (overviewContent) overviewContent.style.display = 'none';
        if (watchlistContent) watchlistContent.style.display = 'none';
        if (legacyContent) legacyContent.style.display = 'none';
        if (accountContent) accountContent.style.display = 'none';

        // Show active with animation
        let targetContent = null;
        if (tabName === 'overview') targetContent = overviewContent;
        if (tabName === 'watchlist') targetContent = watchlistContent;
        if (tabName === 'legacy') targetContent = legacyContent;
        if (tabName === 'account') targetContent = accountContent;

        if (targetContent) {
            targetContent.style.display = tabName === 'overview' ? 'flex' : 'block';
            targetContent.style.animation = 'none';
            targetContent.offsetHeight;
            targetContent.style.animation = 'swipeIn 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
        }

        // THE FIX: Dynamic Header Title
        const headerTabName = document.getElementById('header-tab-name');
        if (headerTabName) {
            headerTabName.textContent = tabName === 'account' ? 'Account Settings' : tabName.charAt(0).toUpperCase() + tabName.slice(1);
        }

        // THE FIX: Keep Search Bar on Legacy Tab, preserve user queries!
        const searchWrapper = document.querySelector('.search-wrapper');
        const hubSearch = document.getElementById('hub-search');

        if (searchWrapper && hubSearch) {
            if (tabName === 'account') {
                searchWrapper.style.display = 'none';
            } else {
                searchWrapper.style.display = 'flex';
                if (tabName === 'legacy') {
                    hubSearch.placeholder = "Search legacy nominations...";
                } else {
                    hubSearch.placeholder = tabName === 'overview' ? "Search to Add to Tracker" : "Search to Add to Watchlist";
                }
                // We INTENTIONALLY don't clear hubSearch.value here to answer the user's UX question:
                // Global filters across tabs are an excellent design pattern.
                if (hubSearch.value.trim().length > 0) {
                    setTimeout(() => hubSearch.dispatchEvent(new Event('input')), 50);
                }
            }
        }
    }

    if (overviewLink) overviewLink.addEventListener('click', (e) => { e.preventDefault(); switchTab('overview'); });
    if (watchlistLink) watchlistLink.addEventListener('click', (e) => { e.preventDefault(); switchTab('watchlist'); });
    if (legacyLink) legacyLink.addEventListener('click', (e) => { e.preventDefault(); switchTab('legacy'); });

    // Edit Profile Button Wiring
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const settingsMenu = document.getElementById('settings-menu');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('account');
            if (settingsMenu) settingsMenu.classList.add('hidden'); // Close the menu
        });
    }

    switchTab(window.cinescoreCurrentTab);

    // --- CUSTOM SYSTEM ALERT UI CONTROLLER ---

    window.showCustomAlert = function (type, title, message) {
        const modal = document.getElementById('customAlertModal');
        const iconContainer = document.getElementById('alert-icon-container');
        const titleEl = document.getElementById('alert-title');
        const msgEl = document.getElementById('alert-message');
        const actionsEl = document.getElementById('alert-actions');

        if (!modal) return;

        titleEl.textContent = title;
        msgEl.innerHTML = message;

        if (type === 'premium') {
            iconContainer.innerHTML = '<i class="fa-solid fa-crown" style="color: var(--color-warning); filter: drop-shadow(0 0 15px rgba(255, 159, 28, 0.4));"></i>';
            actionsEl.innerHTML = `
                <button class="nav-button-primary" style="background: var(--color-warning); color: #000; padding: 12px 24px; border-radius: 100px; border: none; font-weight: 700; cursor: pointer;" onclick="triggerPaywallExplanation()">Upgrade to Pro</button>
                <button style="background: transparent; color: var(--color-secondary); border: none; cursor: pointer; font-weight: 600;" onclick="closeCustomAlert(true)">Maybe Later</button>
            `;
        } else if (type === 'paywall') {
            // THE FIX: Developer/System Icon instead of a Success Checkmark
            iconContainer.innerHTML = '<i class="fa-solid fa-envelope-open-text" style="color: var(--color-accent); filter: drop-shadow(0 0 15px rgba(0, 85, 255, 0.4));"></i>';
            actionsEl.innerHTML = `<button class="nav-button-primary" style="padding: 10px 32px; border-radius: 100px; border: none; font-weight: 600; cursor: pointer; background: var(--color-accent); color: #fff;" onclick="closeCustomAlert(false)">Understood!</button>`;
        }

        else if (type === 'error') {

            iconContainer.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color: var(--color-danger); filter: drop-shadow(0 0 15px rgba(213, 0, 0, 0.4));"></i>';
            actionsEl.innerHTML = `<button class="nav-button-primary" style="padding: 10px 32px; border-radius: 100px; border: none; font-weight: 600; cursor: pointer;" onclick="closeCustomAlert(false)">Got it</button>`;

        } else if (type === 'success') {

            // THE FIX: Added Success UI with a working Close Button!
            iconContainer.innerHTML = '<i class="fa-solid fa-circle-check" style="color: var(--color-success); filter: drop-shadow(0 0 15px rgba(0, 200, 83, 0.4));"></i>';
            actionsEl.innerHTML = `<button class="nav-button-primary" style="padding: 10px 32px; border-radius: 100px; border: none; font-weight: 600; cursor: pointer; background: var(--color-success); color: #fff;" onclick="closeCustomAlert(false)">Awesome</button>`;
        } else if (type === 'bot') {
            // THE FIX: Brand new Bot Modal UI!
            iconContainer.innerHTML = '<i class="fa-solid fa-user-astronaut" style="color: var(--color-accent); filter: drop-shadow(0 0 15px rgba(0, 85, 255, 0.4));"></i>';
            actionsEl.innerHTML = `<button class="nav-button-primary" style="padding: 10px 32px; border-radius: 100px; border: none; font-weight: 600; cursor: pointer; background: var(--color-accent); color: #fff;" onclick="closeCustomAlert(false)">Got it, I'll wait!</button>`;
        }

        modal.style.display = 'flex';
    };


    // THE FIX: Click outside to close the custom alert
    const customAlertModalEl = document.getElementById('customAlertModal');
    if (customAlertModalEl) {
        customAlertModalEl.addEventListener('click', (e) => {
            if (e.target === customAlertModalEl) closeCustomAlert();
        });
    }

    // Modified to optionally close the parent Add Movie Modal too!
    window.closeCustomAlert = function (closeParent = false) {
        const modal = document.getElementById('customAlertModal');
        if (modal) modal.style.display = 'none';

        if (closeParent) {
            const addModal = document.getElementById('addMovieModal');
            if (addModal) addModal.style.display = 'none';
        }
    };

    // THE FIX: The Honesty Protocol (Simulated Paywall)
    window.triggerPaywallExplanation = function () {
        closeCustomAlert(); // Close the premium modal first

        setTimeout(() => {
            showCustomAlert(
                'paywall',
                'Simulated Paywall',
                `<strong> Greetings from the Founder! 👋🏻</strong><br><br>
                CineScore is a comprehensive portfolio project designed to showcase scalable frontend architecture, UI/UX design, and SaaS business logic.<br><br>
                "Pro" features are simulated to demonstrate monetization potential. <span style = "color: var(--color-primary);"> No REAL Payment Gateway </span> is attached. No Money of any sort is charged from the Users. Enjoy the platform freely!`
            );

            // Swap the 'Awesome' button to something more fitting
            setTimeout(() => {
                const actionsEl = document.getElementById('alert-actions');
                if (actionsEl) {
                    actionsEl.innerHTML = `<button class="nav-button-primary" style="padding: 10px 32px; border-radius: 100px; border: none; font-weight: 600; cursor: pointer; background: var(--color-accent); color: #fff;" onclick="closeCustomAlert(false)">Understood!</button>`;
                }
            }, 10);

        }, 300); // Slight delay for a smooth transition
    };


    // --- SIDEBAR AVATAR FIX ---
    const hubSettingsBtn = document.getElementById('settings-btn');
    const hubSettingsMenu = document.getElementById('settings-menu');
    if (hubSettingsBtn && hubSettingsMenu) {
        hubSettingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hubSettingsMenu.classList.toggle('hidden');
        });
        window.addEventListener('click', (e) => {
            if (!hubSettingsMenu.contains(e.target)) hubSettingsMenu.classList.add('hidden');
        });
    }

    /* -----------------------------------------------------
       1.5 AUTHENTICATION STATE MANAGER (UPGRADED)
       -------------------------------------------------------- */
    const authButtons = document.getElementById('auth-buttons');
    const userMenu = document.getElementById('user-menu-wrapper');
    const userAvatarBtn = document.getElementById('user-avatar-btn');
    const avatarDropdown = document.getElementById('avatar-dropdown');
    const logoutBtn = document.getElementById('logout-btn');

    function updateAuthState() {
        const isLoggedIn = localStorage.getItem('cinescore_auth') === 'true';
        const isPro = localStorage.getItem('cinescore_pro') === 'true';

        const authButtons = document.getElementById('auth-buttons');
        const userMenu = document.getElementById('user-menu-wrapper');
        const drawerToggleBtn = document.getElementById('drawer-toggle-btn');

        const upgradeBtn = document.getElementById('nav-upgrade-btn');
        const userAvatar = document.getElementById('user-avatar-btn');
        const hoverProBadge = document.getElementById('hover-pro-badge');

        if (isLoggedIn) {
            if (authButtons) authButtons.style.display = 'none';
            if (userMenu) userMenu.style.display = 'flex';
            if (drawerToggleBtn) drawerToggleBtn.style.display = 'flex';

            if (isPro) {
                if (upgradeBtn) {
                    upgradeBtn.innerHTML = '<i class="fa-solid fa-star"></i> Pro User';
                    upgradeBtn.style.background = 'rgba(255, 159, 28, 0.1)';
                    upgradeBtn.style.color = 'var(--color-warning)';
                    upgradeBtn.style.border = '1px solid rgba(255, 159, 28, 0.3)';
                    upgradeBtn.onclick = null;
                    upgradeBtn.style.cursor = 'default';
                }
                if (userAvatar) userAvatar.classList.add('pro-avatar-glow');
                if (hoverProBadge) hoverProBadge.style.display = 'block';
            } else {
                if (upgradeBtn) {
                    upgradeBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Upgrade';
                    upgradeBtn.className = 'small nav-button-primary';
                    upgradeBtn.onclick = triggerPaywallExplanation;
                    upgradeBtn.style.cursor = 'pointer';
                }
                if (userAvatar) userAvatar.classList.remove('pro-avatar-glow');
                if (hoverProBadge) hoverProBadge.style.display = 'none';
            }

            // --- INJECT USER DATA ---
            const savedName = localStorage.getItem('cinescore_user_name');
            const savedHandle = localStorage.getItem('cinescore_user_handle');

            if (savedName) {
                document.querySelectorAll('.profile-name-display').forEach(el => el.textContent = savedName);
                const acctNameInput = document.getElementById('account-name-input');
                if (acctNameInput) acctNameInput.value = savedName;

                document.querySelectorAll('.user-avatar').forEach(el => {
                    if (el.tagName === 'IMG') el.src = `https://placehold.co/100x100/0055FF/FFFFFF?text=${savedName.charAt(0).toUpperCase()}`;
                });
            }
            if (savedHandle) {
                document.querySelectorAll('.profile-handle-display').forEach(el => el.textContent = savedHandle);
                const acctHandleInput = document.getElementById('account-handle-input');
                if (acctHandleInput) acctHandleInput.value = savedHandle.replace('@', '');
            }
        } else {
            if (authButtons) authButtons.style.display = 'flex';
            if (userMenu) userMenu.style.display = 'none';
            
            // PHASE 1.6: Responsive Toggle Logic
            if (drawerToggleBtn) {
                if (window.innerWidth <= 768) {
                    drawerToggleBtn.style.display = 'flex'; // Always show on mobile
                } else {
                    drawerToggleBtn.style.display = 'none'; // Hide on desktop if logged out
                }
            }

            if (window.location.pathname.toLowerCase().includes('hub.html')) {
                window.location.href = 'index.html';
            }
        }

        // PHASE 1.6: TEASER GATING - Links stay visible, but are intercepted
        document.querySelectorAll('.restricted-hub-link').forEach(link => {
            link.onclick = (e) => {
                if (localStorage.getItem('cinescore_auth') !== 'true') {
                    e.preventDefault();
                    e.stopPropagation();
                    const modal = document.getElementById('signupModal');
                    if (modal) modal.style.display = 'flex';
                    return false;
                }
            };
        });
    }

    updateAuthState();

    // ==========================================
    // BULLETPROOF AVATAR HOVER & CLICK ENGINE
    // ==========================================
    const avatarContainer = document.querySelector('.avatar-container');
    const hoverCard = document.querySelector('.avatar-hover-card');

    if (avatarContainer && hoverCard) {
        // 1. Mouse enters ONLY the Avatar Container
        avatarContainer.addEventListener('mouseenter', () => {
            if (userMenu && !userMenu.classList.contains('active')) {
                hoverCard.classList.add('show-hover');
            }
        });

        // 2. Mouse leaves the Avatar Container
        avatarContainer.addEventListener('mouseleave', () => {
            hoverCard.classList.remove('show-hover');
        });
    }

    if (userAvatarBtn) {
        // 3. User Clicks the Avatar
        userAvatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('active');
            if (hoverCard) hoverCard.classList.remove('show-hover'); // Force close hover
        });
    }

    window.addEventListener('click', (e) => {
        if (userMenu && !userMenu.contains(e.target)) userMenu.classList.remove('active');
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.setItem('cinescore_auth', 'false');
            sessionStorage.removeItem('cineScore_activePrediction');
            localStorage.removeItem('cinescore_active_movie_data');
            updateAuthState();
            window.location.href = 'Prediction.html';
        });
    }

    window.requireAuth = function (callback) {
        if (localStorage.getItem('cinescore_auth') === 'true') { callback(); }
        else { if (signupModal) signupModal.style.display = 'flex'; }
    };


    /* --------------------------------------------------------
        2. LOGIN, SIGNUP & RESET MODALS (SMART STATE ENGINE)
        -------------------------------------------------------- */
    const loginBtn = document.getElementById('nav-login-btn');
    const signupBtn = document.getElementById('nav-signup-btn');
    const loginModal = document.getElementById('loginModal');
    const signupModal = document.getElementById('signupModal');
    const resetModal = document.getElementById('resetModal');
    const closeButtons = document.querySelectorAll('.close');

    // NEW: Persistent Global State for Email
    let globalSavedEmail = '';

    // THE HYBRID ENGINE: Switches modals, wipes passwords, but carries over the email
    function switchModal(targetModal) {

        // 1. Capture email from whichever modal is currently open (if it has one)
        const visibleModal = [loginModal, signupModal, resetModal].find(m => m && m.style.display === 'flex');
        if (visibleModal) {
            const emailInput = visibleModal.querySelector('input[type="email"]');
            if (emailInput && emailInput.value.trim() !== '') {
                globalSavedEmail = emailInput.value.trim(); // Update the persistent memory
            }
        }

        // 2. Hide all modals and completely reset all forms (wipes passwords & errors)
        if (loginModal) loginModal.style.display = 'none';
        if (signupModal) signupModal.style.display = 'none';
        if (resetModal) resetModal.style.display = 'none';

        ['loginForm', 'signupForm', 'resetForm'].forEach(id => {
            const form = document.getElementById(id);
            if (form) {
                form.reset();
                const error = form.querySelector('.error');
                if (error) error.textContent = '';
            }
        });

        // 3. Open the target modal and inject the persistent email
        if (targetModal) {
            targetModal.style.display = 'flex';
            if (globalSavedEmail !== '') {
                const targetEmailInput = targetModal.querySelector('input[type="email"]');
                if (targetEmailInput) targetEmailInput.value = globalSavedEmail;
            }
        }
    }

    // THE HARD WIPE: User abandoned the flow. Destroy all data.
    function hardCloseModals() {
        globalSavedEmail = ''; // Nuke the persistent memory

        if (loginModal) loginModal.style.display = 'none';
        if (signupModal) signupModal.style.display = 'none';
        if (resetModal) resetModal.style.display = 'none';

        ['loginForm', 'signupForm', 'resetForm'].forEach(id => {
            const form = document.getElementById(id);
            if (form) {
                form.reset();
                const error = form.querySelector('.error');
                if (error) error.textContent = '';
            }
        });
    }

    // -- Open Modals from Navbar --

    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchModal(loginModal);
        });
    }

    if (signupBtn) {
        signupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchModal(signupModal);
        });
    }

    // -- Switch Modals from Text Links --
    const switchToSignup = document.getElementById('switch-to-signup');
    const switchToLogin = document.getElementById('switch-to-login');
    const forgotPasswordLink = document.querySelector('a[href="#"].small'); // Selects "Forgot password?"
    const backToLoginLink = document.getElementById('back-to-login');

    if (switchToSignup) switchToSignup.addEventListener('click', (e) => { e.preventDefault(); switchModal(signupModal); });
    if (switchToLogin) switchToLogin.addEventListener('click', (e) => { e.preventDefault(); switchModal(loginModal); });
    if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', (e) => { e.preventDefault(); switchModal(resetModal); });
    if (backToLoginLink) backToLoginLink.addEventListener('click', (e) => { e.preventDefault(); switchModal(loginModal); });

    // -- Hard Close Triggers --
    if (closeButtons) {
        closeButtons.forEach(btn => btn.addEventListener('click', hardCloseModals));
    }

    window.addEventListener('click', (e) => {
        if (e.target === loginModal || e.target === signupModal || e.target === resetModal) {
            hardCloseModals();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hardCloseModals();
    });

    /* --------------------------------------------------------
       2.5 UNIVERSAL FORM ENGINE: Validation & Keyboard Nav
       -------------------------------------------------------- */

    // 1. Universal Keyboard Navigation for ALL Forms
    document.querySelectorAll('form').forEach(form => {
        const inputs = Array.from(form.querySelectorAll('input, button[type="submit"]'));

        inputs.forEach((input, index) => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (index < inputs.length - 1) inputs[index + 1].focus();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (index > 0) inputs[index - 1].focus();
                } else if (e.key === 'Enter' && input.tagName !== 'BUTTON') {
                    e.preventDefault();
                    if (index < inputs.length - 2) {
                        inputs[index + 1].focus();
                    } else {
                        inputs[inputs.length - 1].click();
                    }
                }
            });
        });
    });

    // 2. Strict Form Validation
    function handleFormValidation(e) {
        e.preventDefault();
        const submittedForm = e.target;
        const submitBtn = submittedForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        let errorDisplay = submittedForm.querySelector('.form-error');
        if (errorDisplay) {
            errorDisplay.textContent = '';
            errorDisplay.style.color = 'var(--color-danger)';
        }

        // --- ONBOARDING FORM STRICT VALIDATION ---
        if (submittedForm.id === 'onboardingForm') {
            // THE FIX: Smart detection for either Full Name or First/Last Name HTML setups
            const fnameInput = document.getElementById('ob-fname');
            const lnameInput = document.getElementById('ob-lname');
            const nameInput = document.getElementById('ob-name');
            const handleInput = document.getElementById('ob-handle');

            let fullName = '';
            if (fnameInput && lnameInput) {

                if (!fnameInput.value.trim() || !lnameInput.value.trim()) {
                    alert("Please fill out your First and Last Name.");
                    return;
                }

                fullName = `${fnameInput.value.trim()} ${lnameInput.value.trim()}`;

            } else if (nameInput) {

                if (!nameInput.value.trim()) {
                    alert("Please fill out your Name."); return;

                }
                fullName = nameInput.value.trim();

            }

            const handleVal = handleInput ? handleInput.value.trim() : '';
            if (!handleVal) { alert("Please provide a Director Handle."); return; }

            // THE FIX: Dynamic Text
            submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating Profile...';
            submitBtn.style.pointerEvents = 'none';

            setTimeout(() => {
                localStorage.setItem('cinescore_user_name', fullName);
                localStorage.setItem('cinescore_user_handle', handleVal.startsWith('@') ? handleVal : '@' + handleVal);
                localStorage.setItem('cinescore_auth', 'true');
                window.location.reload();
            }, 1200);
            return;
        }

        // --- STANDARD LOGIN/SIGNUP STRICT VALIDATION ---
        const emailInput = submittedForm.querySelector('input[type="email"]');
        const passInput = submittedForm.querySelector('input[type="password"]');

        if (emailInput && !emailInput.value.includes('@')) {
            if (errorDisplay) errorDisplay.textContent = 'Please enter a valid email address.';
            return;
        }

        if (passInput && passInput.value.length < 8) {
            if (errorDisplay) errorDisplay.textContent = 'Password must be at least 8 characters.';
            return;
        }

        // THE FIX: Custom Success Texts & Dynamic Button States
        if (submittedForm.id === 'loginForm') {
            if (errorDisplay) { errorDisplay.textContent = 'Credentials matched.'; errorDisplay.style.color = 'var(--color-success)'; }
            submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Logging you in...';
        } else if (submittedForm.id === 'signupForm') {
            if (errorDisplay) { errorDisplay.textContent = 'Submission successful.'; errorDisplay.style.color = 'var(--color-success)'; }
            submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...';
        } else {
            submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
        }

        submitBtn.style.pointerEvents = 'none';

        // Intercept Flow
        setTimeout(() => {
            if (submittedForm.id === 'signupForm' || submittedForm.closest('#signupModal')) {
                if (typeof hardCloseModals === 'function') hardCloseModals();
                const obModal = document.getElementById('onboardingModal');
                if (obModal) {
                    obModal.style.display = 'flex';
                    // THE FIX: Auto-focus the first input of onboarding modal
                    const firstObInput = obModal.querySelector('input');
                    if (firstObInput) setTimeout(() => firstObInput.focus(), 100);
                }
                submitBtn.innerHTML = originalText;
                submitBtn.style.pointerEvents = 'auto';
            } else {
                localStorage.setItem('cinescore_auth', 'true');
                window.location.reload();
            }
        }, 1200);
    }

    document.querySelectorAll('form').forEach(form => form.addEventListener('submit', handleFormValidation));

    if (localStorage.getItem('cinescore_onboarding_pending') === 'true') {
        const obModal = document.getElementById('onboardingModal');
        if (obModal) {
            obModal.style.display = 'flex';
            const firstObInput = obModal.querySelector('input');
            if (firstObInput) setTimeout(() => firstObInput.focus(), 100);
        }
        localStorage.removeItem('cinescore_onboarding_pending');
    }

    /* --------------------------------------------------------
       UX: GLOBAL MODAL AUTO-FOCUS
       -------------------------------------------------------- */
    document.addEventListener('click', (e) => {
        const isLoginClick = e.target.closest('#nav-login-btn') || e.target.closest('#switch-to-login') || e.target.closest('#back-to-login');
        const isSignupClick = e.target.closest('#nav-signup-btn') || e.target.closest('#switch-to-signup') || e.target.closest('#pre-footer-signup-btn');

        if (isLoginClick) {
            setTimeout(() => {
                const loginModal = document.getElementById('loginModal');
                if (loginModal && loginModal.style.display === 'flex') {
                    const emailInput = loginModal.querySelector('input[type="email"]');
                    if (emailInput && !emailInput.value) emailInput.focus();
                    else if (loginModal.querySelector('input[type="password"]')) loginModal.querySelector('input[type="password"]').focus();
                }
            }, 50);
        } else if (isSignupClick) {
            setTimeout(() => {
                const signupModal = document.getElementById('signupModal');
                if (signupModal && signupModal.style.display === 'flex') {
                    const emailInput = signupModal.querySelector('input[type="email"]');
                    if (emailInput && !emailInput.value) emailInput.focus();
                    else if (signupModal.querySelector('input[type="password"]')) signupModal.querySelector('input[type="password"]').focus();
                }
            }, 50);
        }
});

/* --------------------------------------------------------
   2. UNIVERSAL SEARCH ENGINE (Bulletproof)
   -------------------------------------------------------- */
const executePredictionBridge = (movieName) => {
        if (!movieName) return;

        // THE FIX: Check for TMDB metadata in localStorage first (from search dropdown)
        const activeData = JSON.parse(localStorage.getItem('cinescore_active_movie_data'));
        const db = window.mockMovies || [];
        const match = db.find(m => m.title.toLowerCase().includes(movieName.toLowerCase()));

        if (activeData && activeData.title.toLowerCase() === movieName.toLowerCase()) {
            sessionStorage.setItem('cineScore_activePrediction', activeData.title);
            const splashLoader = document.getElementById('splash-loader');
            if (splashLoader) splashLoader.style.display = 'flex';
            setTimeout(() => { window.location.href = 'Prediction.html'; }, 2000);
        } else if (match) {
            localStorage.setItem('cinescore_active_movie_data', JSON.stringify(match));
            sessionStorage.setItem('cineScore_activePrediction', match.title);
            const splashLoader = document.getElementById('splash-loader');
        if (splashLoader) splashLoader.style.display = 'flex';
            setTimeout(() => { window.location.href = 'Prediction.html'; }, 2000);
        } else {
            showCustomAlert('error', 'Movie Not Found', "We couldn't find that movie in our database. Try selecting from the dropdown matches.");
        }
    };


    // initHeroSearch inlined directly in DOMContentLoaded above (scope-safe fix)


    // Duplicate initDefaultSearch removed

    // --- HOME PAGE: FEATURED CARDS CLICK WIRING ---
    const featuredCards = document.querySelectorAll('.featured-movie-card');
    if (featuredCards.length > 0) {
        featuredCards.forEach(card => {
            card.addEventListener('click', function () {
                // Find the title inside the clicked card
                const titleEl = this.querySelector('.movie-title-featured');
                if (titleEl) {
                    const movieTitle = titleEl.textContent.trim();
                    executePredictionBridge(movieTitle);
                }
            });
        });
    }

    // Connect Pre-footer to Modal & Sync Email
    const preFooterBtn = document.getElementById('pre-footer-signup-btn');
    const preFooterInput = document.getElementById('pre-footer-email');

    function triggerPreFooterSignup() {
        if (signupModal) {
            signupModal.style.display = 'flex'; // Open Modal
            if (preFooterInput && preFooterInput.value.trim() !== '') {
                const modalEmailInput = document.querySelector('#signupForm input[type="email"]');
                if (modalEmailInput) {
                    modalEmailInput.value = preFooterInput.value.trim();
                    const modalPassInput = document.querySelector('#signupForm input[type="password"]');
                    if (modalPassInput) modalPassInput.focus();
                }
            }
        }
    }

    if (preFooterBtn) {
        preFooterBtn.addEventListener('click', triggerPreFooterSignup);
    }

    if (preFooterInput) {
        preFooterInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Stop page reload
                triggerPreFooterSignup();
            }
        });
    }

    const isLoggedIn = localStorage.getItem('cinescore_auth') === 'true';


    /* --------------------------------------------------------
       3. PREDICTION PAGE INITIALIZER & DATA INJECTION
       -------------------------------------------------------- */

    const titleElement = document.getElementById('predicted-movie-title');
    if (titleElement) {
        window.scrollTo(0, 0); // Force top on load
        // THE FIX: Safely define the auth state inside this block so it never loses scope!
        const isLoggedIn = localStorage.getItem('cinescore_auth') === 'true';
        const savedDataString = localStorage.getItem('cinescore_active_movie_data');

        if (savedDataString) {
            const activeMovie = JSON.parse(savedDataString);

            // Text Injections
            titleElement.textContent = activeMovie.title;
            if (document.getElementById('dyn-poster')) document.getElementById('dyn-poster').src = activeMovie.poster;

            if (document.getElementById('dyn-year')) document.getElementById('dyn-year').textContent = activeMovie.year;

            if (document.getElementById('dyn-director')) document.getElementById('dyn-director').textContent = activeMovie.director;

            if (document.getElementById('dyn-cast')) document.getElementById('dyn-cast').textContent = activeMovie.cast;

            if (document.getElementById('dyn-studio')) document.getElementById('dyn-studio').textContent = activeMovie.studio;

            // Dynamic Genre Pills Injection
            const genreContainer = document.getElementById('dyn-genres');
            if (genreContainer) {
                // THE FIX: Restricted to top 2 genres for a cleaner look
                const genres = (activeMovie.genres || ["Action", "Blockbuster"]).slice(0, 2);
                genreContainer.innerHTML = genres.map(g => `<span class="genre-pill" style="margin: 0;">${g}</span>`).join('');
            }

            // Dynamic Trending Pill Logic
            const trendingPill = document.getElementById('dyn-trending-pill');
            if (trendingPill) {
                // If isTrending is explicitly false, hide it. Otherwise, assume true for hype movies.
                if (activeMovie.isTrending === false) {
                    trendingPill.style.display = 'none';
                } else {
                    trendingPill.style.display = 'inline-flex';
                }
            }

            // Score Injections
            if (document.getElementById('dyn-ai-score')) document.getElementById('dyn-ai-score').textContent = activeMovie.aiScore;

            if (document.getElementById('dyn-data-points')) document.getElementById('dyn-data-points').textContent = formatLargeNumber(activeMovie.dataPoints || 2400000);

            if (document.getElementById('dyn-sentiment-score')) document.getElementById('dyn-sentiment-score').textContent = activeMovie.sentimentScore;

            // ----------------------------------------------------
            // DYNAMIC HASH GENERATOR
            // ----------------------------------------------------
            const hashEl = document.getElementById('prediction-hash');
            if (hashEl) {
                // Use real TMDB ID if available, else random hex
                const tmdbId = activeMovie.id || (window._lastApiResult && window._lastApiResult.pitch_summary?.tmdb_id);
                const idDisplay = tmdbId ? String(tmdbId).padStart(6, '0') : Math.random().toString(16).substring(2, 6).toUpperCase();
                hashEl.textContent = `#CS-${idDisplay}`;
            }

            // ----------------------------------------------------
            // 4TH CARD: PROFITABILITY CALCULATOR
            // ----------------------------------------------------
            let estBudgetStr = activeMovie.budget;
            let rawBudgetM = 0;

            // 1. Calculate Budget in Millions
            if (!estBudgetStr && activeMovie.boxOffice) {
                let val = parseFloat(activeMovie.boxOffice.replace(/[^0-9.]/g, ''));
                let inMillions = activeMovie.boxOffice.includes('B') ? val * 1000 : val;
                rawBudgetM = Math.round(inMillions / 3); // Standard estimate: 1/3 of Box Office
                estBudgetStr = rawBudgetM >= 1000 ? `$${(rawBudgetM / 1000).toFixed(2)}B` : `$${rawBudgetM}M`;
            } else if (estBudgetStr) {
                let bVal = parseFloat(estBudgetStr.replace(/[^0-9.]/g, ''));
                rawBudgetM = estBudgetStr.includes('B') ? bVal * 1000 : bVal;
            } else {
                estBudgetStr = "$150M"; // Ultimate Fallback
                rawBudgetM = 150;
            }

            // 2. Calculate Profit Target in Millions
            let profitTargetStr = activeMovie.profitTarget;
            if (!profitTargetStr) {
                let rawTargetM = Math.round(rawBudgetM * 2.5); // Hollywood rule: 2.5x budget to break even
                profitTargetStr = rawTargetM >= 1000 ? `$${(rawTargetM / 1000).toFixed(2)}B` : `$${rawTargetM}M`;
            }

            // ----------------------------------------------------
            // SUMMARY STATS AUTH GUARD
            // ----------------------------------------------------
            const verdictEl = document.getElementById('dyn-verdict');
            const boxOfficeEl = document.getElementById('dyn-box-office');
            const imdbEl = document.getElementById('dyn-imdb');
            const profitTargetEl = document.getElementById('dyn-profit-target');
            const estBudgetEl = document.getElementById('dyn-est-budget');

            // THE FIX: Fallback data for missing attributes to prevent 'undefined'
            const safeBoxOffice = activeMovie.boxOffice || 'N/A';
            const safeImdb = activeMovie.imdb || 'N/A';

            if (isLoggedIn) {
                // REAL DATA (LOGGED IN)
                const aiScore = parseInt(activeMovie.aiScore) || 75;
                let dynamicVerdict = activeMovie.verdict || 'Pending';
                
                // THE FIX: Generate dynamic verdict if it's "Pending" or missing
                if (!activeMovie.verdict || activeMovie.verdict === 'Pending') {
                    if (aiScore >= 90) dynamicVerdict = 'Billion Dollar Club';
                    else if (aiScore >= 80) dynamicVerdict = 'Projected Mega-Hit';
                    else if (aiScore >= 70) dynamicVerdict = 'Strong Performer';
                    else if (aiScore >= 55) dynamicVerdict = 'Safe Bet';
                    else dynamicVerdict = 'Mixed Outlook';
                }

                if (verdictEl) verdictEl.textContent = dynamicVerdict;
                if (boxOfficeEl) boxOfficeEl.innerHTML = `${safeBoxOffice.replace(/[MB]/g, '')}<span style="font-size: 24px;">${safeBoxOffice === 'N/A' ? '' : safeBoxOffice.slice(-1)}</span>`;
                if (imdbEl) imdbEl.innerHTML = `${safeImdb}<span style="font-size: 24px; color: var(--color-secondary);">${safeImdb === 'N/A' ? '' : '/10'}</span>`;
                if (profitTargetEl) profitTargetEl.innerHTML = `${profitTargetStr.replace(/[MB]/g, '')}<span style="font-size: 24px;">${profitTargetStr.slice(-1)}</span>`;
                if (estBudgetEl) estBudgetEl.textContent = `Est. Budget: ${estBudgetStr}`;

            } else {
                // RESTRICTED DATA (LOGGED OUT)
                const lockBadge = `<span style="display: flex; align-items: center; font-size: 10px; color: var(--color-warning); border: 1px solid var(--color-warning); padding: 3px 6px; border-radius: 4px; letter-spacing: 1px; font-weight: 800; white-space: nowrap; flex-shrink: 0; height: fit-content;"><i class="fa-solid fa-lock" style="margin-right: 4px;"></i> PRO</span>`;

                if (verdictEl) verdictEl.innerHTML = `<div style="display: flex; align-items: center; gap: 8px; width: 100%;"><span style="filter: blur(5px); opacity: 0.5; font-size: 24px; white-space: nowrap;">Restricted</span> ${lockBadge}</div>`;

                if (boxOfficeEl) boxOfficeEl.innerHTML = `<div style="display: flex; align-items: center; gap: 8px; width: 100%;"><span style="filter: blur(6px); opacity: 0.5; font-size: 32px; white-space: nowrap;">$850M</span> ${lockBadge}</div>`;

                if (imdbEl) imdbEl.innerHTML = `<div style="display: flex; align-items: center; gap: 8px; width: 100%;"><span style="filter: blur(5px); opacity: 0.5; font-size: 32px; white-space: nowrap;">8.5</span> ${lockBadge}</div>`;

                if (profitTargetEl) profitTargetEl.innerHTML = `<div style="display: flex; align-items: center; gap: 8px; width: 100%;"><span style="filter: blur(6px); opacity: 0.5; font-size: 32px; white-space: nowrap;">$650M</span> ${lockBadge}</div>`;

                if (estBudgetEl) estBudgetEl.innerHTML = `<div style="display: flex; align-items: center; gap: 6px; flex-wrap: nowrap;"><span style="color: var(--color-accent); font-weight: 700; white-space: nowrap;">Est. Budget:</span><span style="filter: blur(4px); opacity: 0.5; white-space: nowrap;">$250M</span></div>`;
            }

            // THE FIX: Safe Meta Text Injections
            if (document.getElementById('dyn-verdict-meta')) {
                document.getElementById('dyn-verdict-meta').innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> ${activeMovie.verdictMeta || 'High Audience Consensus'}`;
            }

            if (document.getElementById('dyn-box-office-meta')) {
                document.getElementById('dyn-box-office-meta').innerHTML = `<i class="fa-solid fa-circle-info"></i> ${activeMovie.boxOfficeMeta || 'Based on theatrical run'}`;
            }

            if (document.getElementById('dyn-imdb-meta')) {
                document.getElementById('dyn-imdb-meta').innerHTML = `<i class="fa-solid fa-circle-check"></i> ${activeMovie.imdbMeta || 'Verified User Ratings'}`;
            }


            // AI Gauge Setup
            const gaugeFill = document.querySelector('.ai-gauge-fill');
            const scoreVal = parseInt(activeMovie.aiScore) || 75;
            if (gaugeFill) gaugeFill.style.strokeDashoffset = 264 - (264 * (scoreVal / 100));

            // Dynamic Confidence Label
            const confidenceLabel = document.getElementById('dyn-ai-confidence-label');
            if (confidenceLabel) {
                if (scoreVal >= 95) confidenceLabel.textContent = 'Extreme Hype';
                else if (scoreVal >= 88) confidenceLabel.textContent = 'High Confidence';
                else if (scoreVal >= 78) confidenceLabel.textContent = 'Strong Prediction';
                else if (scoreVal >= 60) confidenceLabel.textContent = 'Moderate Outlook';
                else if (scoreVal >= 45) confidenceLabel.textContent = 'Uncertain Market';
                else confidenceLabel.textContent = 'High Risk Asset';
            }

            // Chart Render
            if (typeof window.renderDynamicCharts === 'function') window.renderDynamicCharts(activeMovie, 'base');
        } else {
            titleElement.textContent = "No Movie Selected. Search below.";
        }
    }

    /* --------------------------------------------------------
       4. INTERACTIVE UI (Bull/Bear Toggle & Vote Buttons)
       -------------------------------------------------------- */

    // Bull/Bear Toggle
    const scenarioBtns = document.querySelectorAll('.scenario-btn');
    const slider = document.querySelector('.scenario-slider');

    if (scenarioBtns.length > 0 && slider) {
        const activeBtn = document.querySelector('.scenario-btn.active');
        if (activeBtn) slider.style.width = `${activeBtn.offsetWidth}px`;

        scenarioBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                scenarioBtns.forEach(b => b.classList.remove('active', 'bull', 'bear'));
                this.classList.add('active');

                slider.style.transform = `translateX(${this.offsetLeft - 4}px)`;
                slider.style.width = `${this.offsetWidth}px`;

                let scenario = 'base';
                if (this.textContent.includes('Bull')) {
                    this.classList.add('bull'); scenario = 'bull';
                    slider.style.backgroundColor = 'rgba(0, 200, 83, 0.15)'; slider.style.borderColor = 'rgba(0, 200, 83, 0.2)';
                } else if (this.textContent.includes('Bear')) {
                    this.classList.add('bear'); scenario = 'bear';
                    slider.style.backgroundColor = 'rgba(213, 0, 0, 0.15)'; slider.style.borderColor = 'rgba(213, 0, 0, 0.2)';
                }

                const activeMovie = JSON.parse(localStorage.getItem('cinescore_active_movie_data'));
                if (activeMovie && typeof window.renderDynamicCharts === 'function') window.renderDynamicCharts(activeMovie, scenario);
            });
        });
    }

});


/* --------------------------------------------------------
   10. CHART.JS ENGINE
   -------------------------------------------------------- */
if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#94A3B8';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(11, 25, 44, 0.95)';
    Chart.defaults.elements.line.tension = 0.4;
}

window.cineCharts = {};

window.renderDynamicCharts = function (movieData, scenario = 'base') {
    if (!movieData) return;

    // THE GHOST ENGINE: Provide high-fidelity defaults if API results are sparse
    const data = {
        sentimentLine: movieData.sentimentLine || { pos: [65, 75, 82, 88, 92], neg: [12, 10, 8, 6, 5] },
        sonar: movieData.sonar || [85, 70, 90, 75, 80],
        funnel: movieData.funnel || [100, 85, 120, 450],
        trajectory: movieData.trajectory || [25, 45, 65, 80, 90, 95],
        social: movieData.social || [35, 25, 15, 15, 10]
    };

    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDarkTheme ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)";
    const cardBgColor = isDarkTheme ? "#1B263B" : "#FFFFFF";

    let mult = 1.0;
    if (scenario === 'bull') mult = 1.25;
    if (scenario === 'bear') mult = 0.75;

    // --- THE JITTER ENGINE (High-Fidelity Dynamic Feel) ---
    // If we're using Ghost Data (fallbacks), we add a seed-based jitter 
    // so different movies show slightly different "Live" trends.
    const titleSeed = (movieData.title || "CineScore").split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const jitter = (val, range = 5) => val + (titleSeed % range) - (range / 2);

    const sPos = (data.sentimentLine.pos || []).map(v => Math.min(100, jitter(v * mult)));
    const sNeg = (data.sentimentLine.neg || []).map(v => Math.min(100, jitter(v * (scenario === 'bear' ? 1.5 : 1))));
    const sSonar = (data.sonar || []).map(v => Math.min(100, jitter(v * mult, 10)));

    // --- CURRENCY NORMALIZATION FIX ---
    // Standardize everything to RAW DOLLARS to fix the "0M" Y-axis bug.
    // Mock data often uses [150, 400] (millions), API uses [150000000, 400000000] (raw).
    const normalizeMoney = (val) => (val < 10000) ? val * 1_000_000 : val;
    
    const sFunnel = data.funnel.map(v => Math.round(normalizeMoney(v) * (v === data.funnel[3] ? mult : 1)));
    const sTraj = data.trajectory.map(v => Math.round(normalizeMoney(v) * mult));
    const socialData = [...data.social];


    Object.keys(window.cineCharts).forEach(key => { if (window.cineCharts[key]) window.cineCharts[key].destroy(); });

    const ctxSocial = document.getElementById("socialDonut");
    if (ctxSocial) {
        // Safely pad the data in case your mock data only has 4 items instead of 5
        const socialData = [...data.social];
        if (socialData.length === 4) socialData.push(12); // Fallback for IG

        window.cineCharts.social = new Chart(ctxSocial, {
            type: "doughnut",
            data: {
                labels: ["YouTube", "TikTok", "X / Twitter", "Reddit", "Instagram"],
                datasets: [{
                    data: socialData,
                    // Soft Pastel Palette: Red, Green, Blue, Orange-Red, Pink
                    backgroundColor: ["#C23B22", "#77DD77", "#89cff0", "#FF8533", "#FF006E"],
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: "80%", plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } } } }
        });
    }


    const ctxSentiment = document.getElementById("sentimentLine");

    if (ctxSentiment) window.cineCharts.sentiment = new Chart(ctxSentiment, {
        type: "line",

        data: {
            labels: ["Day 1", "Day 7", "Day 14", "Day 21", "Day 30"],
            datasets: [{
                label: "Positive Buzz",
                data: sPos,
                borderColor: "#10B981",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                borderWidth: 3,
                fill: true,
                pointRadius: 0
            },

            {
                label: "Negative Noise",
                data: sNeg,
                borderColor: "#F43F5E",
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0
            }]
        },

        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: { x: { grid: { display: false } }, y: { display: false, min: 0 } }, interaction: { intersect: false, mode: 'index' } }
    });

    const ctxSonar = document.getElementById("appealSonar");

    if (ctxSonar) window.cineCharts.sonar = new Chart(ctxSonar, {

        type: "polarArea",
        data: {
            labels: ["Action", "Story/Plot", "Visuals", "Star Power", "Pacing"],
            datasets: [{
                data: sSonar, backgroundColor: ['rgba(59, 130, 246, 0.8)', 'rgba(16, 185, 129, 0.8)', 'rgba(139, 92, 246, 0.8)', 'rgba(244, 63, 94, 0.8)', 'rgba(245, 158, 11, 0.8)'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { usePointStyle: true, boxWidth: 8 }
                }
            },
            scales: {
                r: {
                    angleLines: { color: gridColor },
                    grid: { color: gridColor }, ticks: { display: false }
                }
            }
        }
    });

    const ctxFunnel = document.getElementById("roiFunnel");
    if (ctxFunnel) window.cineCharts.funnel = new Chart(ctxFunnel, {

        type: "bar",
        data: {
            labels: ["Budget", "P&A", "Break-Even", "Proj. Gross"],
            datasets: [{
                label: "Millions USD",
                data: sFunnel,
                backgroundColor: ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '$' + (context.raw / 1_000_000).toFixed(0) + 'M';
                        }
                    }
                }
            }, 
            scales: { 
                y: { 
                    grid: { color: gridColor, borderDash: [5, 5] }, 
                    ticks: { 
                        callback: v => '$' + (v / 1_000_000).toFixed(0) + 'M' 
                    } 
                }, 
                x: { grid: { display: false } } 
            } 
        }
    });

    const ctxTraj = document.getElementById("revenueTrajectory");

    if (ctxTraj) {
        const gradient = ctxTraj.getContext("2d").createLinearGradient(0, 0, 0, 400);

        gradient.addColorStop(0, 'rgba(0, 85, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(0, 85, 255, 0.0)');
        window.cineCharts.trajectory = new Chart(ctxTraj, {
            type: "line",
            data: {
                labels: ["Opening Wknd", "Week 2", "Week 3", "Week 4", "Week 5", "Final Run"],
                datasets: [{
                    label: "Cumulative Gross ($M)", data: sTraj,
                    borderColor: "#0055FF",
                    backgroundColor: gradient,
                    borderWidth: 4,
                    fill: true,
                    pointBackgroundColor: "#FFFFFF",
                    pointBorderColor: "#0055FF",
                    pointBorderWidth: 2,
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    x: { grid: { display: false } }, 
                    y: { 
                        grid: { color: gridColor, borderDash: [5, 5] }, 
                        ticks: { 
                            callback: v => '$' + (v / 1_000_000).toFixed(0) + 'M' 
                        }, 
                        beginAtZero: true 
                    } 
                }, 
                interaction: { intersect: false, mode: 'index' }
            }
        });
    }

    // ==========================================
    // 5. DYNAMIC COMPARABLE RELEASES CHART
    // ==========================================
    const compsCtx = document.getElementById('compsChart');
    if (compsCtx) {
        // --- THE TMDB COMPS FIX ---
        async function fetchTMDBComps() {
            // THE ROBUST GENRE DETECTION: Look everywhere for the genre name
            const primaryGenreName = 
                (movieData.primary_genre) || 
                (movieData.pitch_summary?.primary_genre) || 
                (movieData.pitch_summary?.genre) || 
                (movieData.genres && movieData.genres.length > 0 ? (Array.isArray(movieData.genres) ? movieData.genres[0] : movieData.genres) : 'Action');
            
            const genreId = Object.keys(GENRE_MAP).find(key => GENRE_MAP[key].toLowerCase() === primaryGenreName.toLowerCase());
            
            let comps = [];
            if (genreId) {
                const results = await window.TMDB_API.discoverReleased(genreId);
                if (results && results.length > 0) {
                    // Filter out current movie and sort by revenue (Total Run)
                    comps = results
                        .filter(m => m.title !== movieData.title && (m.revenue > 10_000_000 || m.popularity > 40))
                        .sort((a, b) => (b.revenue || b.popularity * 1_000_000) - (a.revenue || a.popularity * 1_000_000))
                        .slice(0, 3)
                        .map(m => ({
                            title: m.title,
                            value: m.revenue ? Math.round(m.revenue / 1_000_000) : Math.round(m.popularity * 2.5)
                        }));
                }
            }

            // SMART FALLBACK: If discovery is sparse, use genre-specific bangers
            if (comps.length < 3) {
                const genreName = primaryGenreName; 
                const genreFallbacks = {
                    "Action": [{title: "Maverick", value: 1490}, {title: "John Wick 4", value: 440}, {title: "Fury Road", value: 380}],
                    "Horror": [{title: "It", value: 701}, {title: "World War Z", value: 540}, {title: "Smile", value: 217}],
                    "Superhero": [{title: "Endgame", value: 2797}, {title: "The Batman", value: 770}, {title: "Deadpool 3", value: 1330}],
                    "Sci-Fi": [{title: "Dune 2", value: 711}, {title: "Interstellar", value: 701}, {title: "Avatar", value: 2923}],
                    "Drama": [{title: "Oppenheimer", value: 975}, {title: "Titanic", value: 2264}, {title: "The Whale", value: 55}]
                };
                comps = genreFallbacks[genreName] || genreFallbacks["Action"];
            }

            const movieTitle = (movieData.title || movieData.pitch_summary?.title || 'This Film');
            
            // ROBUST REVENUE PARSING: Handle raw numbers and formatted strings (like $1.3B)
            let rawProj = 145500000;
            if (movieData.financial_forecast?.projected_revenue) {
                rawProj = movieData.financial_forecast.projected_revenue;
            } else if (movieData.boxOffice) {
                const cleanStr = movieData.boxOffice.replace(/[^0-9.]/g, '');
                const num = parseFloat(cleanStr);
                rawProj = num * (movieData.boxOffice.includes('B') ? 1_000_000_000 : 1_000_000);
            }
            const predictedTotal = rawProj / 1_000_000;
            
            const labels = [`${movieTitle.substring(0,10)}...`, ...comps.map(c => c.title.substring(0,10))];
            const data = [predictedTotal, ...comps.map(c => c.value)];

            if (window.cineCharts.comps) window.cineCharts.comps.destroy();
            window.cineCharts.comps = new Chart(compsCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Total Global Run ($M)',
                        data: data,
                        backgroundColor: ['#0055FF', '#64748B', '#64748B', '#64748B'],
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (context) { return '$' + context.raw + 'M'; }
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
                        x: { 
                            grid: { display: false }, 
                            ticks: { 
                                color: '#94A3B8',
                                font: { size: 10 },
                                callback: function(value) {
                                    let label = this.getLabelForValue(value);
                                    return label.length > 12 ? label.substring(0, 10) + '...' : label;
                                }
                            } 
                        }
                    }
                }
            });
        }
        fetchTMDBComps();
    }
};



/* --------------------------------------------------------
   11. DASHBOARD HUB: MASTER DATABASE & UI ENGINE
   -------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {

    // --- CUSTOM UI DROPDOWNS (Status & Sort) ---
    const customDropdowns = document.querySelectorAll('.custom-dropdown');
    customDropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        const menu = dropdown.querySelector('.dropdown-menu');
        const valueSpan = dropdown.querySelector('.dropdown-value');
        const options = dropdown.querySelectorAll('.dropdown-menu li');

        if (toggle && menu) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                customDropdowns.forEach(other => {
                    if (other !== dropdown) {
                        const otherMenu = other.querySelector('.dropdown-menu');
                        if (otherMenu) otherMenu.classList.add('hidden');
                        other.classList.remove('active');
                    }
                });
                menu.classList.toggle('hidden');
                dropdown.classList.toggle('active');
            });
        }

        options.forEach(option => {
            option.addEventListener('click', () => {
                const newValue = option.textContent;
                if (valueSpan) valueSpan.textContent = newValue;
                if (menu) menu.classList.add('hidden');
                dropdown.classList.remove('active');

                // THE FIX: Update state and trigger re-render
                const context = window.cinescoreCurrentTab; // 'overview' or 'watchlist'

                // --- NEW WIRING: LEGACY VAULT SORTING ---
                if (context === 'legacy') {
                    let sortParam = 'latest';
                    if (newValue.includes('Oldest')) sortParam = 'oldest';
                    if (newValue.includes('Best')) sortParam = 'best';
                    if (newValue.includes('Worst')) sortParam = 'worst';

                    if (typeof window.renderLegacyTab === 'function') window.renderLegacyTab(sortParam);
                    return; // Exit early so it doesn't trigger the overview/watchlist logic
                }

                const isStatus = newValue.includes('Status') || newValue.includes('Released') || newValue.includes('All') || newValue.includes('Tracking');

                if (isStatus) {
                    window.csFilters[context].status = newValue;
                } else {
                    window.csFilters[context].sort = newValue;
                }

                // Re-render the correct tab
                if (context === 'overview' && typeof window.loadSavedMovies === 'function') window.loadSavedMovies();
                if (context === 'watchlist' && typeof window.renderTabularWatchlist === 'function') window.renderTabularWatchlist();
            });
        });
    });

    document.addEventListener('click', () => {
        customDropdowns.forEach(dropdown => {
            const menu = dropdown.querySelector('.dropdown-menu');
            if (menu) menu.classList.add('hidden');
            dropdown.classList.remove('active');
        });
    });

    // --- DOM ELEMENTS ---
    const hubSearch = document.getElementById('hub-search');
    const hubClearSearchBtn = document.getElementById('hub-clear-search-btn');
    const hubSearchDropdown = document.getElementById('hub-search-dropdown');
    const contentWrapper = document.getElementById('content-wrapper');
    const movieGrid = document.querySelector('.movie-grid');

    const contextMenu = document.getElementById('context-menu');
    // const ctxPin = document.getElementById('ctx-pin');
    // const ctxEdit = document.getElementById('ctx-edit');
    // const ctxDelete = document.getElementById('ctx-delete');
    const predictionModal = document.getElementById('addMovieModal');

    let targetMovieData = null;
    let targetCardEl = null;

    // --- GLOBAL FILTER STATE & UTILITIES ---
    window.csFilters = {
        overview: { status: 'Status: All', sort: 'Sort by: Hype' },
        watchlist: { status: 'Status: All', sort: 'Sort by: Added' }
    };

    // Helper: Parses "$1.4B", "$460M" into raw numbers for accurate sorting
    function parseMoneyToRaw(str) {
        if (!str || str === 'Not Set') return 0;
        let num = parseFloat(str.replace(/[^0-9.]/g, ''));
        if (str.includes('B')) return num * 1000000000;
        if (str.includes('M')) return num * 1000000;
        if (str.includes('K')) return num * 1000;
        return num;
    }

    // Helper: Gets days until release
    function getDaysDiff(movieYear) {
        const today = new Date('2026-03-29');
        const yearStr = String(movieYear || '2026');
        let releaseDate = new Date(yearStr);
        if (yearStr.length <= 4) releaseDate = new Date(`${yearStr}-12-31`);
        return Math.ceil((releaseDate - today) / (1000 * 60 * 60 * 24));
    }

    // Core Processing Engine
    function processMovieData(databaseKey, context) {
        let movies = JSON.parse(localStorage.getItem(databaseKey) || '[]');
        if (movies.length === 0) return [];

        const statusFilter = window.csFilters[context].status;
        const sortFilter = window.csFilters[context].sort;

        // 1. FILTERING
        if (statusFilter !== 'Status: All') {
            movies = movies.filter(m => {
                const days = getDaysDiff(m.year);
                if (statusFilter === 'Tracking' || statusFilter === 'Upcoming') return days > 0;
                if (statusFilter === 'Released') return days <= 0;
                return true;
            });
        }

        // 2. SORTING
        movies.sort((a, b) => {
            // Pins always override everything
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;

            if (sortFilter.includes('Hype')) {
                const aHype = 80 + (a.title.length % 15);
                const bHype = 80 + (b.title.length % 15);
                return bHype - aHype; // Descending
            }
            if (sortFilter.includes('Date')) {
                return getDaysDiff(a.year) - getDaysDiff(b.year); // Nearest first
            }
            if (sortFilter.includes('Value') || sortFilter.includes('Box office')) {
                // We use our AI hash as the default "Value" if it's the Overview tab
                let aVal = parseMoneyToRaw(`$${(a.title.length % 8 + 3) * 115}M`);
                let bVal = parseMoneyToRaw(`$${(b.title.length % 8 + 3) * 115}M`);
                return bVal - aVal; // Highest value first
            }
            if (sortFilter.includes('Your Prediction')) {
                return parseMoneyToRaw(b.userPrediction) - parseMoneyToRaw(a.userPrediction);
            }

            return 0; // Default (Added order)
        });

        return movies;
    }

    // --- RENDER ENGINE & DARK GLASS PILLS ---
    window.injectNewCard = function (movie) {
        if (!movieGrid) return;
        const today = new Date('2026-03-29');
        const yearStr = String(movie.year || '2026');
        let releaseDate = new Date(yearStr);
        if (yearStr.length <= 4) releaseDate = new Date(`${yearStr}-12-31`);

        const daysLeft = Math.ceil((releaseDate - today) / (1000 * 60 * 60 * 24));
        const isDraft = !movie.userPrediction;
        const isLocked = movie.isLocked || daysLeft <= 7;
        let badgeHTML = '';

        const baseBadgeStyle = "position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); border: none; color: white; padding: 6px 12px; border-radius: 100px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 5;";

        if (isDraft) {

            badgeHTML = `<span class="badge" style="${baseBadgeStyle}"><i class="fa-solid fa-eye" style="color: var(--color-accent);"></i> TRACKING</span>`;

        }

        else if (isLocked) {
            badgeHTML = `<span class="badge" style="${baseBadgeStyle}"><i class="fa-solid fa-lock" style="color: var(--color-danger);"></i> LOCKED</span>`;
        }

        else {
            badgeHTML = `<span class="badge" style="${baseBadgeStyle}"><i class="fa-regular fa-clock" style="color: var(--color-warning);"></i> ${daysLeft > 7 ? daysLeft - 7 : 0}D LEFT</span>`;
        }

        const newCard = document.createElement('div');
        newCard.className = 'card poster-card stack';
        newCard.style.cssText = 'margin: 0; padding: 0; overflow: hidden; animation: swipeIn 0.5s ease; position: relative;';
        newCard.dataset.title = movie.title;
        newCard.dataset.daysLeft = daysLeft;
        newCard.dataset.isDraft = isDraft;

        // THE FIX: Brighter dynamic hype colors
        const hypeVal = 80 + (movie.title.length % 15);
        let hypeColor = 'var(--color-success)';
        let hypeBg = 'rgba(0, 200, 83, 0.2)';       // Brightened background
        let hypeBorder = 'rgba(0, 200, 83, 0.5)';   // Brightened border
        if (hypeVal < 88) { hypeColor = 'var(--color-warning)'; hypeBg = 'rgba(255, 159, 28, 0.2)'; hypeBorder = 'rgba(255, 159, 28, 0.5)'; }
        if (hypeVal < 83) { hypeColor = 'var(--color-danger)'; hypeBg = 'rgba(213, 0, 0, 0.2)'; hypeBorder = 'rgba(213, 0, 0, 0.5)'; }

        let trend = (movie.title.length % 4) + 1;
        let isUp = movie.title.length % 2 !== 0;
        let trendColor = isUp ? 'var(--color-success)' : 'var(--color-danger)';
        let trendSign = isUp ? '+' : '-';
        let trendIcon = isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';

        newCard.innerHTML = `
                    <div style="background: url('${movie.poster}') center/cover; height: 180px; position: relative;">
                        ${badgeHTML}
                        ${movie.isPinned ? `<span style="position: absolute; top: 12px; left: 12px; color: var(--color-warning); font-size: 18px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); z-index: 5;"><i class="fa-solid fa-thumbtack"></i></span>` : ''}
                        <button class="card-menu-btn" title="Options" style="position: absolute !important; top: auto !important; bottom: 12px !important; right: 12px !important;"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                    </div>
                    <div class="stack" style="padding: 20px;">
                        <h3 class="movie-title"><abbr title="${movie.title}" style="text-decoration: none;">${movie.title.substring(0, 20)}${movie.title.length > 20 ? '...' : ''}</abbr></h3>
                        
                        <div class="row row-between" style="margin-bottom: 12px; flex-wrap: nowrap; gap: 8px; align-items: center;">
                            
                            <div class="row" style="gap: 6px; align-items: center; color: var(--color-secondary); font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                <span><i class="fa-regular fa-calendar"></i> ${movie.year}</span>
                                <span style="opacity: 0.5;">|</span>
                                <span style="overflow: hidden; text-overflow: ellipsis;">${movie.studio || 'Blockbuster'}</span>
                                <span style="opacity: 0.6;">|</span>
                            </div>
                            
                            <div class="row" style="gap: 6px; align-items: center; flex-shrink: 0;">
                                <span style="color: ${hypeColor}; font-weight: 800; background: ${hypeBg}; border: 1px solid ${hypeBorder}; padding: 3px 8px; border-radius: 100px; font-size: 10px; line-height: 1; box-shadow: 0 2px 8px ${hypeBg}; text-transform: uppercase; white-space: nowrap;">HYPE: ${hypeVal}%</span>
                                <span style="color: ${trendColor}; font-weight: 800; font-size: 12px; line-height: 1; white-space: nowrap;"><i class="fa-solid ${trendIcon}"></i> ${trendSign}${trend}%</span>
                            </div>
                            
                        </div>
                        
                        <div class="grid grid-2" style="grid-template-columns: 1fr 1fr; border-top: 1px solid var(--color-border); padding-top: 16px; text-align: center;">
                            <div class="stack" style="gap: 4px; align-items: center;">
                                <span class="small" style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Your Pred.</span>
                                <h4 style="color: ${isDraft ? 'var(--color-tertiary)' : 'var(--color-success)'}; font-size: 16px; margin: 0;">${isDraft ? 'Not Set' : movie.userPrediction}</h4>
                            </div>
                            <div class="stack" style="gap: 4px; align-items: center;">
                                <span class="small" style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Confidence</span>
                                <h4 class="${isDraft ? '' : (parseInt(movie.userConfidence || '0') >= 90 ? 'conf-high' : parseInt(movie.userConfidence || '0') <= 50 ? 'conf-low' : 'conf-med')}" style="color: ${isDraft ? 'var(--color-tertiary)' : ''}; font-size: 16px; margin: 0;">${isDraft ? '--' : movie.userConfidence}</h4>
                            </div>
                        </div>
                    </div>
        `;

        movieGrid.appendChild(newCard);
    };

    window.loadSavedMovies = function () {
        if (!movieGrid) return;
        movieGrid.innerHTML = '';
        let processedMovies = processMovieData('cinescore_upcoming', 'overview');

        if (processedMovies.length === 0) {
            movieGrid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; background: var(--bg-card); border: 1px dashed var(--color-border); border-radius: 16px; margin-top: 20px; display: flex; flex-direction: column; align-items: center;">
                    <i class="fa-solid fa-film" style="font-size: 48px; color: var(--color-tertiary); opacity: 0.5; margin-bottom: 16px;"></i>
                    <h3 style="margin:0; color: var(--color-primary); font-size: 20px;">List is Empty</h3>
                    <p style="margin-top:8px; color: var(--color-secondary); max-width: 400px; line-height: 1.5;">No Results found for the selected option.</p>
                </div>
            `;
            return;
        }

        processedMovies.sort((a, b) => (b.isPinned === true) - (a.isPinned === true));
        processedMovies.forEach(movie => window.injectNewCard(movie));
    };


    // --- TABULAR WATCHLIST RENDERER ---
    window.renderTabularWatchlist = function () {
        const listContainer = document.getElementById('tabular-list-container');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        let processedMovies = processMovieData('cinescore_watchlist', 'watchlist');

        if (processedMovies.length === 0) {
            listContainer.innerHTML = `
                <div style="padding: 60px 20px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                    <i class="fa-solid fa-list" style="font-size: 40px; color: var(--color-tertiary); opacity: 0.5; margin-bottom: 16px;"></i>
                    <h3 style="margin:0; color: var(--color-secondary); font-size: 18px;">List is Empty</h3>
                    <p style="margin-top:8px; color: var(--color-secondary); max-width: 400px; line-height: 1.5;">No Results found for the selected option.</p>
                </div>
            `;
            return;
        }

        // Sort: Pinned first
        processedMovies.sort((a, b) => (b.isPinned === true) - (a.isPinned === true));

        const today = new Date('2026-03-29');

        processedMovies.forEach((movie, index) => {
            const yearStr = String(movie.year || '2026');
            let releaseDate = new Date(yearStr);
            if (yearStr.length <= 4) releaseDate = new Date(`${yearStr}-12-31`);

            const daysDiff = Math.ceil((releaseDate - today) / (1000 * 60 * 60 * 24));

            // TIME LOGIC
            let timeString = '';
            let statusIcon = '<i class="fa-solid fa-hourglass-half"></i>';

            if (daysDiff > 0) {
                timeString = `Releasing in ${daysDiff} Days`;
                if (daysDiff <= 7) {
                    timeString = `Locks in ${daysDiff} Days`;
                    statusIcon = '<i class="fa-solid fa-fire" style="color: var(--color-danger);"></i>';
                }
            } else if (daysDiff === 0) {
                timeString = 'Releasing Today';
                statusIcon = '<i class="fa-solid fa-bolt" style="color: var(--color-success);"></i>';
            } else {
                timeString = `Released ${Math.abs(daysDiff)} Days Ago`;
                statusIcon = '<i class="fa-solid fa-check-double" style="color: var(--color-success);"></i>';
            }

            const isDraft = !movie.userPrediction;
            const predText = isDraft ? 'Not Set' : movie.userPrediction;
            const predClass = isDraft ? '' : 'success';

            // THE FIX: Realistic AI Forecast with Blockbuster Justice!
            let mathHash = (movie.title.length % 8 + 3) * 115;

            // Give massive boosts to the heavy hitters
            const tLower = movie.title.toLowerCase();
            if (tLower.includes('spider-man') || tLower.includes('avengers') || tLower.includes('batman') || tLower.includes('star wars') || tLower.includes('avatar')) {
                mathHash += 500 + (movie.title.length * 20);
            }

            let aiForecast = `$${mathHash}M`;
            if (mathHash >= 1000) aiForecast = `$${(mathHash / 1000).toFixed(1)}B`;

            // THE FIX: Theatrical Run Decay & Prediction Lockout Logic
            let hypeVal = 80 + (movie.title.length % 15);
            let trend = (movie.title.length % 4) + 1;
            let isUp = movie.title.length % 2 !== 0;

            const daysSinceRelease = daysDiff < 0 ? Math.abs(daysDiff) : 0;
            const isReleased = daysDiff <= 0;
            const theatricalWindow = 45;
            let runCompleted = false;

            if (isReleased) {
                if (daysSinceRelease <= theatricalWindow) {
                    // Post-release decay: Hype drops slowly over 45 days
                    hypeVal = Math.max(20, hypeVal - Math.floor((daysSinceRelease / theatricalWindow) * 60));

                    // After Opening Weekend (Day 3), trend goes negative as weekly grosses drop
                    if (daysSinceRelease > 3) {
                        isUp = false;
                        trend = Math.min(35, trend + Math.floor(daysSinceRelease / 2));
                    }
                } else {
                    // Run is entirely over (Older than 45 days)
                    runCompleted = true;
                }
            }

            let hypeColor = 'var(--color-success)';
            let hypeBg = 'rgba(0, 200, 83, 0.2)';
            let hypeBorder = 'rgba(0, 200, 83, 0.5)';

            if (hypeVal < 88) { hypeColor = 'var(--color-warning)'; hypeBg = 'rgba(255, 159, 28, 0.2)'; hypeBorder = 'rgba(255, 159, 28, 0.5)'; }
            if (hypeVal < 70) { hypeColor = 'var(--color-danger)'; hypeBg = 'rgba(213, 0, 0, 0.2)'; hypeBorder = 'rgba(213, 0, 0, 0.5)'; }
            if (hypeVal < 40) { hypeColor = 'var(--color-tertiary)'; hypeBg = 'rgba(148, 163, 184, 0.1)'; hypeBorder = 'rgba(148, 163, 184, 0.3)'; } // Cold

            let trendColor = isUp ? 'var(--color-success)' : 'var(--color-danger)';
            let trendIcon = isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
            let trendSign = isUp ? '+' : '-';

            // Generate HTML Variable Blocks
            const naHTML = '<span style="color: var(--color-secondary); font-size: 13px; font-weight: 700; opacity: 0.6;"><i class="fa-solid fa-ban" style="font-size: 10px; margin-right:4px;"></i> N/A</span>';

            // Hype & Trend die when the run is completed
            let hypeHTML = runCompleted ? naHTML : `<span style="color: ${hypeColor}; font-weight: 800; background: ${hypeBg}; border: 1px solid ${hypeBorder}; padding: 3px 10px; border-radius: 100px; font-size: 13px; line-height: 1;">${hypeVal}%</span>`;
            let trendHTML = runCompleted ? naHTML : `<span style="color: ${trendColor}; font-size: 13px; font-weight: 800; line-height: 1;"><i class="fa-solid ${trendIcon}"></i> ${trendSign}${trend}%</span>`;

            // Your Pred dies ONLY IF you never set it and the movie is already released
            let predHTML = `<span class="tabular-stat-value ${predClass}">${predText}</span>`;
            if (isDraft && isReleased) {
                // THE FIX: Muted "Not Set" with a lock to show the window was missed
                predHTML = '<span style="color: var(--color-tertiary); font-size: 13px; font-weight: 600; opacity: 0.7;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right:4px;"></i> Missed</span>';
            }

            // AI Forecast is immortal
            let aiForecastHTML = `<span class="tabular-stat-value accent">${aiForecast}</span>`;

            let firstGenre = movie.genres && movie.genres.length > 0 ? movie.genres[0] : 'ACTION';
            let secondGenre = movie.genres && movie.genres.length > 0 ? movie.genres[1] : 'DRAMA';
            let studioName = movie.studio || 'Blockbuster';


            // Generate the Row
            const row = document.createElement('div');
            row.className = 'tabular-row';
            row.dataset.title = movie.title;
            row.dataset.daysLeft = daysDiff;
            row.dataset.isDraft = isDraft;

            row.innerHTML = `
                <div class="tabular-index">${movie.isPinned ? '<i class="fa-solid fa-thumbtack" style="color: var(--color-warning);"></i>' : index + 1}</div>
                
                <img src="${movie.poster}" class="tabular-squircle" alt="poster">
                
                <div class="tabular-info" style="flex: 1.5; align-self: center;">
                    <h3 class="tabular-title" style="margin: 0 0 6px 0; line-height: 1;">${movie.title}</h3>
                    <div class="tabular-meta" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">

                    <span>${studioName}</span>

                    <span style="opacity: 0.5;">|</span>
                        ${statusIcon}
                        <span>${timeString}</span>
                        <span style="background: rgba(0, 85, 255, 0.1); align-items: left; color: var(--color-accent); padding: 2px 10px; border-radius: 100px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${firstGenre}</span>
                        <span style="background: rgba(0, 85, 255, 0.1); align-items: left; color: var(--color-accent); padding: 2px 10px; border-radius: 100px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${secondGenre}</span>

                    </div>

                </div>

                <div class="tabular-stats" style="flex: 2; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: start; padding-right: 0; margin-top: -32px;">
                    <div class="stack" style="gap: 8px; align-items: center; text-align: center;">
                        <span class="tabular-stat-label">Hype</span>
                        ${hypeHTML}
                    </div>
                    <div class="stack" style="gap: 8px; align-items: center; text-align: center;">
                        <span class="tabular-stat-label">Trend</span>
                        ${trendHTML}
                    </div>
                    <div class="stack" style="gap: 8px; align-items: center; text-align: center;">
                        <span class="tabular-stat-label">Your Pred.</span>
                        ${predHTML}
                    </div>
                    <div class="stack" style="gap: 8px; align-items: center; text-align: center;">
                        <span class="tabular-stat-label">AI Forecast</span>
                        ${aiForecastHTML}
                    </div>
                </div>

                <button class="card-menu-btn tabular-menu-btn" style="position: relative; inset: auto; margin-left: 16px;">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
            `;

            listContainer.appendChild(row);
        });
    };

    // --- HUB SEARCH ENGINE ---
    let hubSearchTimeout;
    if (hubSearch && hubSearchDropdown && contentWrapper) {
        hubSearch.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            const query = val.toLowerCase();
            clearTimeout(hubSearchTimeout);

            const isWatchlist = window.cinescoreCurrentTab === 'watchlist';
            const currentDbKey = isWatchlist ? 'cinescore_watchlist' : 'cinescore_upcoming';
            let savedMovies = JSON.parse(localStorage.getItem(currentDbKey) || '[]');

            const isLegacy = window.cinescoreCurrentTab === 'legacy';
            const searchSelector = isWatchlist ? '.tabular-row' : (isLegacy ? '#legacy-container .poster-card' : '.movie-grid .poster-card');
            const currentMovieCards = document.querySelectorAll(searchSelector);

            // INSTANT UI: Handling clear/short state
            if (val.length === 1) {
                hubSearchDropdown.innerHTML = '<li style="padding:16px;text-align:center;font-size:12px;opacity:0.6;color:var(--color-secondary);">Type at least 2 characters to search...</li>';
                hubSearchDropdown.style.display = 'block';
                return; // THE FIX: Stop here. No filtering, no debouncing.
            }
            if (val.length < 1) {
                hubSearchDropdown.style.display = 'none';
                hubClearSearchBtn.classList.toggle('hidden', val.length === 0);
                contentWrapper.classList.remove('search-active');
                currentMovieCards.forEach(card => card.style.display = '');
                const noMsg = document.getElementById('hub-no-results');
                if (noMsg) noMsg.style.display = 'none';
                return;
            }

            // INSTANT UI: Card filtering
            contentWrapper.classList.add('search-active');
            hubClearSearchBtn.classList.remove('hidden');
            let hasVisibleCards = false;

            currentMovieCards.forEach(card => {
                const titleEl = card.querySelector('.movie-title') || card.querySelector('.tabular-title');
                if (titleEl && titleEl.textContent.toLowerCase().includes(query)) {
                    card.style.display = '';
                    hasVisibleCards = true;
                } else {
                    card.style.display = 'none';
                }
            });

            // INSTANT UI: Show loader only for LIVE searches (Watchlist/Overview) when length >= 2
            if (!isLegacy && val.length >= 2) {
                hubSearchDropdown.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--color-accent); font-size: 13px; opacity: 0.8;"><i class="fa-solid fa-circle-notch fa-spin"></i> Syncing TMDB database...</li>';
                hubSearchDropdown.style.display = 'block';
            }

            // LIVE SEARCH: Debounced
            hubSearchTimeout = setTimeout(async () => {
                // Skip live fetch for Legacy Tab!
                let tmdbMatches = isLegacy ? [] : await window.TMDB_API.searchMovies(query);
                
                // Prevent Stale Request
                if (hubSearch.value.trim().toLowerCase() !== query) return;

                hubSearchDropdown.innerHTML = ''; 
                
                let mockMatches = isLegacy ? [] : (window.mockMovies || []).filter(m => m.title.toLowerCase().includes(query));
                
                // Deduplicate and prepare
                const clean = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const seenTitles = new Set();
                let queryMatches = [];

                // Filter local legacy movies for isLegacy
                if (isLegacy) {
                    savedMovies.forEach(m => {
                        if (m.title.toLowerCase().includes(query)) {
                            queryMatches.push(m);
                            seenTitles.add(clean(m.title));
                        }
                    });
                } else {
                    [...mockMatches, ...(tmdbMatches || [])].forEach(m => {
                        const cleanT = clean(m.title);
                        if (!seenTitles.has(cleanT)) {
                            seenTitles.add(cleanT);
                            queryMatches.push(m);
                        }
                    });
                }

            let currentLegacy = JSON.parse(localStorage.getItem('cinescore_legacy') || '[]');
            const today = new Date('2026-03-29'); // Simulated system date
            if (queryMatches.length > 0) {
                hubSearchDropdown.style.display = 'block';
                hubSearchDropdown.innerHTML = ''; 

                queryMatches.forEach(movie => {
                    const cleanT = clean(movie.title);
                    const isLegacyItem = currentLegacy.some(s => clean(s.title) === cleanT);
                    const isTracked = savedMovies.some(s => clean(s.title) === cleanT);

                    const li = document.createElement('li');
                    li.className = 'search-item row-between';

                    if (isLegacyItem) {
                        li.style.backgroundColor = 'rgba(139, 92, 246, 0.05)';
                        li.innerHTML = `
                            <div class="row" style="gap: 12px; align-items: center;">
                                <img src="${movie.poster_path ? window.TMDB_API.IMG_URL + movie.poster_path : (movie.poster || 'https://placehold.co/30x45/111/FFF?text=Film')}" style="width: 30px; height: 45px; border-radius: 4px; object-fit: cover;">
                                <div class="search-info">
                                    <h4 class="search-title" style="margin: 0; font-size: 14px; color: var(--color-alt);">${movie.title}</h4>
                                    <p class="search-meta" style="margin: 0; font-size: 11px; color: var(--color-alt);">Hall of Fame • Released</p>
                                </div>
                            </div>
                            <i class="fa-solid fa-award" style="color: var(--color-alt); margin-right: 8px; font-size: 18px;"></i>
                        `;
                        li.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            hubSearch.value = '';
                            hubSearch.dispatchEvent(new Event('input'));
                            if (typeof window.switchHubTab === 'function') window.switchHubTab('legacy');
                        });
                    } else if (isTracked) {
                        const trackedMovie = savedMovies.find(s => clean(s.title) === cleanT) || movie;
                        li.style.backgroundColor = 'rgba(0, 200, 83, 0.05)';
                        li.innerHTML = `
                            <div class="row" style="gap: 12px; align-items: center;">
                                <img src="${trackedMovie.poster || (movie.poster_path ? window.TMDB_API.IMG_URL + movie.poster_path : 'https://placehold.co/30x45/111/FFF?text=Film')}" style="width: 30px; height: 45px; border-radius: 4px; object-fit: cover;">
                                <div class="search-info">
                                    <h4 class="search-title" style="margin: 0; font-size: 14px; color: var(--color-success);">${movie.title}</h4>
                                    <p class="search-meta" style="margin: 0; font-size: 11px; color: var(--color-success);">Already Tracking • Click to View</p>
                                </div>
                            </div>
                            <i class="fa-solid fa-location-pin-lock" style="color: var(--color-success); margin-right: 8px; font-size: 18px;"></i>
                        `;
                        li.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            hubSearch.value = '';
                            hubSearch.dispatchEvent(new Event('input'));
                            hubSearchDropdown.style.display = 'none';
                            const activeSelector = (window.cinescoreCurrentTab === 'watchlist') ? '.tabular-row' : '.movie-grid .poster-card';
                            const cards = document.querySelectorAll(activeSelector);
                            cards.forEach(card => {
                                const t = card.querySelector('.movie-title') || card.querySelector('.tabular-title');
                                if (t && clean(t.textContent) === cleanT) {
                                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    card.style.outline = '2px solid var(--color-success)';
                                    setTimeout(() => card.style.outline = 'none', 2000);
                                }
                            });
                        });
                    } else {
                        const yearStr = String(movie.year || (movie.release_date ? movie.release_date.split('-')[0] : '2026'));
                        let releaseDate = movie.release_date ? new Date(movie.release_date) : new Date(`${yearStr}-12-31`);
                        const isReleased = releaseDate <= today;
                        const isOverview = window.cinescoreCurrentTab === 'overview';

                        if (isOverview && isReleased) {
                            li.style.opacity = '0.7';
                            li.innerHTML = `
                                <div class="row" style="gap: 12px; align-items: center; filter: grayscale(1);">
                                    <img src="${movie.poster_path ? window.TMDB_API.IMG_URL + movie.poster_path : (movie.poster || 'https://placehold.co/30x45/111/FFF?text=Film')}" style="width: 30px; height: 45px; border-radius: 4px; object-fit: cover;">
                                    <div class="search-info">
                                        <h4 class="search-title" style="margin: 0; font-size: 14px;">${movie.title}</h4>
                                        <p class="search-meta" style="margin: 0; font-size: 11px; color: var(--color-danger);">Already Released • Cannot Predict</p>
                                    </div>
                                </div>
                                <i class="fa-solid fa-lock" style="color: var(--color-danger); margin-right: 8px; opacity: 0.6;"></i>
                            `;
                            li.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                if (typeof window.showCustomAlert === 'function') window.showCustomAlert('error', 'Predictions Closed', 'This movie has already been released.');
                            });
                        } else {
                            const actionText = isOverview ? 'Add to Tracker' : 'Add to Watchlist';
                            const imgUrl = movie.poster_path ? `${window.TMDB_API.IMG_URL}${movie.poster_path}` : (movie.poster || 'https://placehold.co/30x45/111/FFF?text=Film');
                            const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : (movie.year || 'TBA');
                            const genresArr = movie.genre_ids ? movie.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean) : (Array.isArray(movie.genres) ? movie.genres : (movie.genres ? movie.genres.split(/[\/,]/) : []));
                            const genresStr = genresArr.length > 0 ? genresArr.slice(0,2).join(' / ') : 'Cinema';

                            li.innerHTML = `
                                <div class="row" style="gap: 12px; align-items: center;">
                                    <img src="${imgUrl}" style="width: 30px; height: 45px; border-radius: 4px; object-fit: cover;">
                                    <div class="search-info">
                                        <h4 class="search-title" style="margin: 0; font-size: 14px;">${movie.title}</h4>
                                        <p class="search-meta" style="margin: 0; font-size: 11px;">${releaseYear} • ${genresStr} • ${actionText}</p>
                                    </div>
                                </div>
                                <button class="add-draft-btn" style="background: var(--color-accent); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; padding: 0 !important; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;"><i class="fa-solid fa-plus"></i></button>
                            `;

                            li.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                const movieData = {
                                    title: movie.title, poster: imgUrl, year: releaseYear, 
                                    synopsis: movie.overview || movie.synopsis, id: movie.id, 
                                    userPrediction: null, userConfidence: null, isPinned: false, isLocked: false
                                };

                                if (isOverview) {
                                    let currentSaved = JSON.parse(localStorage.getItem('cinescore_upcoming') || '[]');
                                    if (currentSaved.length >= 6) {
                                        if (typeof window.showCustomAlert === 'function') window.showCustomAlert('premium', 'Upgrade to CineScore Pro', 'You have reached the limit.');
                                        return;
                                    }
                                    currentSaved.unshift(movieData);
                                    localStorage.setItem('cinescore_upcoming', JSON.stringify(currentSaved));
                                    if (typeof window.loadSavedMovies === 'function') window.loadSavedMovies();
                                } else {
                                    let currentWatchlist = JSON.parse(localStorage.getItem('cinescore_watchlist') || '[]');
                                    if (!currentWatchlist.some(m => clean(m.title) === cleanT)) {
                                        currentWatchlist.unshift(movieData);
                                        localStorage.setItem('cinescore_watchlist', JSON.stringify(currentWatchlist));
                                    }
                                    if (typeof window.renderTabularWatchlist === 'function') window.renderTabularWatchlist();
                                }
                                if (typeof window.calculateHubMacros === 'function') window.calculateHubMacros();
                                hubSearch.value = '';
                                hubSearch.dispatchEvent(new Event('input'));
                            });
                        }
                    }
                    hubSearchDropdown.appendChild(li);
                });
            } else {
                hubSearchDropdown.style.display = 'block';
                const emptyText = isLegacy ? 'Movie not found in nominations.' : 'Movie not found in database.';
                hubSearchDropdown.innerHTML = `<li style="padding: 16px; text-align: center; color: var(--color-tertiary); cursor: default; font-size: 14px;"> ${emptyText}</li>`;
            }

            let noMsg = document.getElementById('hub-no-results');
            if (!noMsg) {
                noMsg = document.createElement('div');
                noMsg.id = 'hub-no-results';
                noMsg.style.cssText = 'width: 100%; grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--color-secondary); display: flex; flex-direction: column; align-items: center;';
            }
            
            const noResTitle = isLegacy ? 'No movies in Nominations' : 'No predictions found';
            const noResDesc = isLegacy ? 'Try adjusting your search or add more to the vault.' : 'Try adding a new movie from the searchbar above.';
            noMsg.innerHTML = `<i class="fa-solid fa-video-slash" style="font-size: 48px; opacity: 0.2; margin-bottom: 16px;"></i><h3 style="margin:0; color: var(--color-primary);">${noResTitle}</h3><p style="margin-top:8px;">${noResDesc}</p>`;

            const targetContainer = isWatchlist ? document.getElementById('tabular-list-container') : document.querySelector('.movie-grid');
            if (targetContainer) targetContainer.appendChild(noMsg);

            noMsg.style.display = (!hasVisibleCards && savedMovies.length > 0) ? 'flex' : 'none';
            }, 400);
        });

        hubClearSearchBtn.addEventListener('click', () => {
            hubSearch.value = '';
            hubSearch.dispatchEvent(new Event('input'));
        });

        if (typeof attachKeyboardNav === 'function') attachKeyboardNav(hubSearch, hubSearchDropdown);
    }


    // --- DYNAMIC CONTEXT MENU ENGINE ---
    const hideMenu = () => {
        if (contextMenu) {
            contextMenu.classList.add('hidden');
            contextMenu.style.display = 'none';
        }
    };

    const showMenu = (x, y, card) => {
        if (!contextMenu || !card) return;
        targetCardEl = card;

        // THE FIX: Correctly identify if we are in the Legacy Vault!
        if (window.cinescoreCurrentTab === 'legacy') {
            window.activeMenuContext = 'cinescore_legacy';
        } else {
            window.activeMenuContext = card.classList.contains('tabular-row') ? 'cinescore_watchlist' : 'cinescore_upcoming';
        }

        const cardTitle = card.dataset.title || card.querySelector('.movie-title')?.innerText?.trim() || 'Unknown Movie';
        let savedMovies = JSON.parse(localStorage.getItem(window.activeMenuContext) || '[]');
        targetMovieData = savedMovies.find(m => m.title === cardTitle);

        if (!targetMovieData) {
            targetMovieData = { title: cardTitle, isPinned: false, userPrediction: null, poster: card.querySelector('img')?.src || '' };
        }

        // THE FIX: Viewport Math that accounts for page scrolling!
        let menuX = x;
        let menuY = y;

        if (menuX + 220 > window.innerWidth + window.scrollX) menuX = window.innerWidth + window.scrollX - 230;
        if (menuY + 160 > window.innerHeight + window.scrollY) menuY = window.innerHeight + window.scrollY - 160;

        contextMenu.style.left = `${menuX}px`;
        contextMenu.style.top = `${menuY}px`;

        const isDraft = !targetMovieData.userPrediction;
        const daysLeft = parseInt(card.dataset.daysLeft || '999');
        const userLocked = targetMovieData.isLocked === true;
        const systemLocked = daysLeft <= 7;

        const ul = contextMenu.querySelector('.context-links');

        if (ul) {
            // THE FIX: Independent Context Menu for the Legacy Tab
            if (window.cinescoreCurrentTab === 'legacy') {
                ul.innerHTML = `
                    <li id="ctx-flex" style="color: var(--color-primary); font-weight: 700;"><i class="fa-solid fa-share-nodes"></i> Flex </li>
                    <div class="ctx-divider"></div>
                    <li id="ctx-delete" class="ctx-danger"><i class="fa-solid fa-trash-can"></i> Delete Permanently </li>
                `;
            } else {
                // NORMAL MENU FOR OVERVIEW/WATCHLIST
                let menuHTML = `<li id="ctx-pin">${targetMovieData.isPinned ? '<i class="fa-solid fa-thumbtack-slash"></i> Unpin Movie' : '<i class="fa-solid fa-thumbtack"></i> Pin to Top'}</li>`;

                let isLegacyEligible = false;
                const today = new Date('2026-03-29'); // Simulated current date
                const yearStr = String(targetMovieData.year || '2026');
                let releaseDate = new Date(yearStr);
                if (yearStr.length <= 4) releaseDate = new Date(`${yearStr}-12-31`);

                if (window.activeMenuContext === 'cinescore_upcoming') {
                    if (Math.ceil((releaseDate - today) / (1000 * 60 * 60 * 24)) <= 0) isLegacyEligible = true;
                }

                if (isDraft) {
                    if (systemLocked) {
                        menuHTML += `<li id="ctx-locked-msg" class="ctx-warning" style="opacity: 0.8; color: var(--color-warning);"><i class="fa-solid fa-lock"></i> Locked (Click for Pro)</li>`;
                    } else {
                        menuHTML += `<li id="ctx-edit"><i class="fa-solid fa-pen"></i> Set Prediction</li>`;
                    }
                } else {
                    if (systemLocked && !isLegacyEligible) {
                        menuHTML += `<li id="ctx-locked-msg" class="ctx-warning" style="opacity: 0.8; color: var(--color-warning);"><i class="fa-solid fa-lock"></i> Locked (Click for Pro)</li>`;
                    } else if (userLocked) {
                        menuHTML += `<li id="ctx-unlock"><i class="fa-solid fa-unlock"></i> Unlock Prediction</li>`;
                    } else {
                        menuHTML += `<li id="ctx-edit"><i class="fa-solid fa-pen-to-square"></i> Edit Prediction</li>`;
                        menuHTML += `<li id="ctx-lock"><i class="fa-solid fa-lock"></i> Lock In Prediction</li>`;
                    }
                }

                if (isLegacyEligible && !isDraft) {
                    menuHTML += `<div class="ctx-divider"></div>`;
                    menuHTML += `<li id="ctx-nominate" class="ctx-warning" style="color: var(--color-warning); font-weight: 700;"><i class="fa-solid fa-trophy"></i> Submit to Nominations</li>`;
                }

                menuHTML += `<div class="ctx-divider"></div><li id="ctx-delete" class="ctx-danger"><i class="fa-solid fa-trash-can"></i> Remove</li>`;
                ul.innerHTML = menuHTML;
            }
        }
        contextMenu.classList.remove('hidden');
        contextMenu.style.display = 'block';
    }; // THIS PROPERLY CLOSES THE FUNCTION

    // EVENT DELEGATION
    document.addEventListener('click', (e) => {
        const dotsBtn = e.target.closest('.card-menu-btn');
        if (dotsBtn) {
            e.preventDefault(); e.stopPropagation();
            const card = dotsBtn.closest('.poster-card') || dotsBtn.closest('.tabular-row');
            if (!card) return;
            const rect = dotsBtn.getBoundingClientRect();
            showMenu(rect.right - 210 + window.scrollX, rect.bottom + 8 + window.scrollY, card);
            return;
        }

        const contextMenuLi = e.target.closest('#context-menu li');

        if (contextMenuLi) {
            const action = contextMenuLi.id;

            // THE FIX: Premium Alert Trigger for 7-Day Locks!
            if (action === 'ctx-locked-msg') {
                hideMenu();
                if (typeof window.showCustomAlert === 'function') {
                    window.showCustomAlert('premium', 'Predictions Locked', 'Predictions lock automatically 7 days before release. <br><br><b>Upgrade to CineScore Pro</b> to edit up to 3 days prior.');
                }
                return;
            }

            hideMenu();
            if (!targetCardEl || !targetMovieData) return;
            const title = targetMovieData.title;

            // ACTION: PIN
            if (action === 'ctx-pin') {
                let savedMovies = JSON.parse(localStorage.getItem(window.activeMenuContext) || '[]');
                const movieIndex = savedMovies.findIndex(m => m.title === title);
                const currentlyPinned = savedMovies.filter(m => m.isPinned).length;

                // THE FIX: 3 Pins allowed in Watchlist, 1 in Overview
                const maxPins = window.activeMenuContext === 'cinescore_watchlist' ? 3 : 1;

                if (!targetMovieData.isPinned && currentlyPinned >= maxPins) {
                    if (typeof window.showCustomAlert === 'function') window.showCustomAlert('premium', 'Pin Limit Reached', `Free tier allows <b>${maxPins} pinned movie${maxPins > 1 ? 's' : ''}</b> in this view.`);
                    return;
                }

                if (movieIndex > -1) {
                    savedMovies[movieIndex].isPinned = !savedMovies[movieIndex].isPinned;
                } else {
                    targetMovieData.isPinned = true;
                    savedMovies.push(targetMovieData);
                }

                localStorage.setItem(window.activeMenuContext, JSON.stringify(savedMovies));
                if (window.activeMenuContext === 'cinescore_upcoming' && typeof window.loadSavedMovies === 'function') window.loadSavedMovies();
                if (window.activeMenuContext === 'cinescore_watchlist' && typeof window.renderTabularWatchlist === 'function') window.renderTabularWatchlist();
            }

            // ACTION: DELETE
            if (action === 'ctx-delete') {
                hideMenu();

                if (window.activeMenuContext === 'cinescore_legacy') {
                    // THE FIX: AWS-Style Hardcore Delete for Vault
                    const hardcoreModal = document.getElementById('hardcoreDeleteModal');
                    const titleEl = document.getElementById('hardcore-delete-title');
                    const inputEl = document.getElementById('hardcore-delete-input');
                    const confirmBtn = document.getElementById('hardcore-confirm-btn');

                    if (hardcoreModal && titleEl && inputEl && confirmBtn) {
                        titleEl.textContent = title;
                        inputEl.value = ''; // Clear input

                        // Reset button UI
                        confirmBtn.style.cursor = 'not-allowed';
                        confirmBtn.style.opacity = '0.5';
                        confirmBtn.style.background = 'rgba(213, 0, 0, 0.1)';
                        confirmBtn.style.color = 'var(--color-danger)';

                        // Store context globally for the modal buttons
                        window.pendingDeleteTitle = title;
                        window.pendingDeleteCard = targetCardEl;

                        hardcoreModal.style.display = 'flex';
                        setTimeout(() => inputEl.focus(), 100); // Auto-focus input
                    }
                } else {
                    // Normal Frictionless Delete for Overview / Watchlist
                    let savedMovies = JSON.parse(localStorage.getItem(window.activeMenuContext) || '[]');
                    savedMovies = savedMovies.filter(m => m.title !== title);
                    localStorage.setItem(window.activeMenuContext, JSON.stringify(savedMovies));

                    targetCardEl.style.transition = 'all 0.3s ease';
                    targetCardEl.style.transform = 'scale(0.8)';
                    targetCardEl.style.opacity = '0';

                    setTimeout(() => {
                        if (window.activeMenuContext === 'cinescore_upcoming' && typeof window.loadSavedMovies === 'function') window.loadSavedMovies();
                        if (window.activeMenuContext === 'cinescore_watchlist' && typeof window.renderTabularWatchlist === 'function') window.renderTabularWatchlist();
                        if (typeof window.calculateHubMacros === 'function') window.calculateHubMacros();
                    }, 300);
                }
            }

            // ACTION: NOMINATE TO LEGACY (Moved inside the main engine)
            if (action === 'ctx-nominate') {
                let savedMovies = JSON.parse(localStorage.getItem(window.activeMenuContext) || '[]');
                const movieIndex = savedMovies.findIndex(m => m.title === title);

                if (movieIndex > -1) {
                    const nominatedMovie = savedMovies.splice(movieIndex, 1)[0];
                    localStorage.setItem(window.activeMenuContext, JSON.stringify(savedMovies));

                    let legacy = JSON.parse(localStorage.getItem('cinescore_legacy') || '[]');

                    // THE SAFEGUARD: Only push if it doesn't already exist in the Vault
                    if (!legacy.some(m => m.title === nominatedMovie.title)) {
                        legacy.unshift(nominatedMovie);
                        localStorage.setItem('cinescore_legacy', JSON.stringify(legacy));
                    }

                    // UI Animation
                    targetCardEl.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
                    targetCardEl.style.transform = 'scale(0.8) translateY(-50px)';
                    targetCardEl.style.opacity = '0';
                    targetCardEl.style.filter = 'brightness(2)';

                    setTimeout(() => {
                        if (window.activeMenuContext === 'cinescore_upcoming' && typeof window.loadSavedMovies === 'function') window.loadSavedMovies();
                        if (typeof window.renderLegacyTab === 'function') window.renderLegacyTab();
                        if (typeof window.calculateHubMacros === 'function') window.calculateHubMacros(); // THE FIX: Force Macros
                    }, 500);
                }
            }

            // ACTION: FLEX / SHARE (Enhanced with Snaphot Engine)
            if (action === 'ctx-flex' && targetCardEl) {
                // We reuse the existing captureSnapshot utility
                if (typeof captureSnapshot === 'function') {
                    // We pass the context menu option as the 'button' to show feedback there
                    const flexOption = e.target.closest('#context-menu li');
                    captureSnapshot(targetCardEl, flexOption || e.target);
                } else {
                    console.error("CineScore: Snapshot engine not loaded.");
                }
            }

            // ACTION: EDIT / SET
            if (action === 'ctx-edit') {
                const modal = document.getElementById('addMovieModal');
                if (modal) {
                    const isDraft = !targetMovieData.userPrediction;
                    document.getElementById('modal-dynamic-title').innerText = isDraft ? 'Set Prediction' : 'Update Prediction';
                    document.getElementById('modal-movie-title').innerText = title;

                    const posterEl = document.getElementById('modal-movie-poster');
                    if (posterEl) posterEl.src = targetMovieData.poster || '';

                    const probEl = document.getElementById('modal-ai-prob');
                    if (probEl) {
                        probEl.innerText = 'Analyzing...';
                        // background predict call
                        const pitchPayload = {
                            title: title,
                            tmdb_id: targetMovieData.id || 0,
                            primary_genre: (targetMovieData.genres && targetMovieData.genres.length > 0) ? targetMovieData.genres[0] : "Action",
                            primary_studio: targetMovieData.studio || "TBA",
                            actor_1_name: (targetMovieData.cast && targetMovieData.cast !== 'TBA') ? targetMovieData.cast.split(',')[0].trim() : "TBA",
                            director_name: targetMovieData.director || "TBA"
                        };
                        window.CineAPI.predict(pitchPayload).then(res => {
                            if (res && res.confidence_score) {
                                const realScore = Math.round(res.confidence_score);
                                probEl.innerText = `${realScore}%`;
                                const gaugeFill = document.querySelector('#addMovieModal .ai-gauge-fill');
                                if (gaugeFill) gaugeFill.style.strokeDashoffset = 264 - (264 * (realScore / 100));
                            } else {
                                probEl.innerText = `${80 + (title.length % 15)}%`; // Fallback
                            }
                        }).catch(() => {
                            probEl.innerText = `${80 + (title.length % 15)}%`; // Fallback
                        });
                    }

                    const lockBtn = document.getElementById('lock-prediction-btn');
                    if (lockBtn) lockBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Prediction';

                    const predVal = document.getElementById('user-pred-val');
                    const unitVal = document.getElementById('user-pred-unit-val');

                    if (isDraft) {
                        if (predVal) predVal.value = '';
                        if (unitVal) unitVal.textContent = 'Million';
                    } else {
                        const rawStr = targetMovieData.userPrediction || '';
                        if (predVal) predVal.value = rawStr.replace(/[^0-9.]/g, '');
                        if (unitVal) {
                            if (rawStr.includes('B')) unitVal.textContent = 'Billion';
                            else if (rawStr.includes('M')) unitVal.textContent = 'Million';
                            else if (rawStr.includes('K')) unitVal.textContent = '100K';
                        }
                    }

                    const confRange = document.getElementById('user-conf-range');
                    const confDisplay = document.getElementById('user-conf-display');
                    if (confRange && confDisplay) {
                        const confVal = isDraft ? 85 : parseInt((targetMovieData.userConfidence || '85').replace(/[^0-9]/g, ''));
                        confRange.value = confVal;
                        confRange.style.setProperty('--val', confVal);
                        confDisplay.innerText = confVal + '%';
                    }

                    const probRange = document.getElementById('user-prob-range');
                    const probDisplay = document.getElementById('user-prob-display');
                    if (probRange && probDisplay) {
                        const probVal = isDraft ? 85 : parseInt((targetMovieData.userProb || '85').replace(/[^0-9]/g, ''));
                        probRange.value = probVal;
                        probRange.style.setProperty('--val', probVal);
                        probDisplay.innerText = probVal + '%';
                    }

                    modal.style.display = 'flex';
                    window.currentEditingMovieTitle = title;
                }
            }

            /// ACTION: MANUAL LOCK
            if (action === 'ctx-lock') {
                let savedMovies = JSON.parse(localStorage.getItem(window.activeMenuContext) || '[]');
                const movieIndex = savedMovies.findIndex(m => m.title === title);
                if (movieIndex > -1) {
                    savedMovies[movieIndex].isLocked = true;
                    localStorage.setItem(window.activeMenuContext, JSON.stringify(savedMovies));
                    if (typeof window.loadSavedMovies === 'function') window.loadSavedMovies();
                }
            }

            // NEW ACTION: MANUAL UNLOCK
            if (action === 'ctx-unlock') {
                let savedMovies = JSON.parse(localStorage.getItem(window.activeMenuContext) || '[]');
                const movieIndex = savedMovies.findIndex(m => m.title === title);

                if (movieIndex > -1) {
                    savedMovies[movieIndex].isLocked = false;
                    localStorage.setItem(window.activeMenuContext, JSON.stringify(savedMovies));
                    if (typeof window.loadSavedMovies === 'function') window.loadSavedMovies();

                    if (window.activeMenuContext === 'cinescore_upcoming' && typeof window.loadSavedMovies === 'function') window.loadSavedMovies();
                    if (window.activeMenuContext === 'cinescore_watchlist' && typeof window.renderTabularWatchlist === 'function') window.renderTabularWatchlist();
                }
            }
            return;
        }
        hideMenu();
    });

    document.addEventListener('contextmenu', (e) => {
        const card = e.target.closest('.poster-card') || e.target.closest('.tabular-row');
        if (card) {
            e.preventDefault();
            showMenu(e.pageX, e.pageY, card);
        } else {
            hideMenu();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideMenu();
    });

    // UX POLISH: DYNAMIC SLIDER TRACKING (Handles both sliders)
    document.addEventListener('input', (e) => {
        if (e.target.id === 'user-conf-range' || e.target.id === 'user-prob-range') {
            const val = e.target.value;
            e.target.style.setProperty('--val', val);

            // Updates the correct percentage display
            const displayId = e.target.id === 'user-conf-range' ? 'user-conf-display' : 'user-prob-display';
            const display = document.getElementById(displayId);
            if (display) display.innerText = val + '%';
        }
    });

    // NEW: CLICK-OUTSIDE TO CLOSE MODAL
    if (predictionModal) {
        predictionModal.addEventListener('click', (e) => {
            // Checks if they clicked the overlay, not the content
            if (e.target === predictionModal) { predictionModal.style.display = 'none'; }
        });
    }

    // ACTION: MODAL SAVE BUTTON (With Auto-Conversion)
    const lockPredictionBtn = document.getElementById('lock-prediction-btn');
    if (lockPredictionBtn) {
        const newSaveBtn = lockPredictionBtn.cloneNode(true);
        lockPredictionBtn.replaceWith(newSaveBtn);

        newSaveBtn.addEventListener('click', function () {
            const userValEl = document.getElementById('user-pred-val');

            if (!userValEl || !userValEl.value || parseFloat(userValEl.value) <= 0) {
                if (window.showCustomAlert) window.showCustomAlert('error', 'Missing Data', 'Please enter a valid estimate.');
                return;
            }

            this.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';

            setTimeout(() => {
                const title = window.currentEditingMovieTitle;
                if (!title) return;
                // THE FIX: Save to whichever database the menu was opened from!
                const targetDB = window.activeMenuContext || 'cinescore_upcoming';
                let savedMovies = JSON.parse(localStorage.getItem(targetDB) || '[]');
                let index = savedMovies.findIndex(m => m.title === title);

                // --- SMART UNIT CONVERSION (e.g. 0.4 Billion -> 400M) ---
                let valNum = parseFloat(userValEl.value);
                let userUnit = "M";
                const unitEl = document.getElementById('user-pred-unit-val');

                if (unitEl) {
                    const unitText = unitEl.textContent.trim();
                    if (unitText === 'Billion') {
                        if (valNum < 1 && valNum > 0) { valNum *= 1000; userUnit = "M"; }
                        else { userUnit = "B"; }
                    } else if (unitText === 'Million') {
                        if (valNum >= 1000) { valNum /= 1000; userUnit = "B"; }
                        else { userUnit = "M"; }
                    } else if (unitText === '100K') {
                        userUnit = "K";
                    }
                }

                let finalVal = Number.isInteger(valNum) ? valNum : parseFloat(valNum.toFixed(2));
                const newPrediction = `$${finalVal}${userUnit}`;

                // READS ALL INPUTS
                const confRange = document.getElementById('user-conf-range');
                const probRange = document.getElementById('user-prob-range');
                const newConfidence = confRange ? `${confRange.value}%` : '85%';
                const newProbEst = probRange ? `${probRange.value}%` : '85%';

                if (index !== -1) {
                    savedMovies[index].userPrediction = newPrediction;
                    savedMovies[index].userConfidence = newConfidence;
                    savedMovies[index].userProb = newProbEst; // NEW
                } else {
                    let posterSrc = '';
                    if (typeof targetCardEl !== 'undefined' && targetCardEl) {
                        let cardBg = targetCardEl.querySelector('div[style*="background"]')?.style.backgroundImage;
                        let urlMatch = cardBg ? cardBg.match(/url\(['"]?(.*?)['"]?\)/) : null;
                        posterSrc = urlMatch ? urlMatch[1] : '';
                    }
                    savedMovies.push({
                        title: title, poster: posterSrc, userPrediction: newPrediction, userConfidence: newConfidence, userProb: newProbEst, isPinned: false // NEW
                    });
                }

                localStorage.setItem(targetDB, JSON.stringify(savedMovies));

                // Refresh the correct view
                if (targetDB === 'cinescore_upcoming' && typeof window.loadSavedMovies === 'function') window.loadSavedMovies();
                if (targetDB === 'cinescore_watchlist' && typeof window.renderTabularWatchlist === 'function') window.renderTabularWatchlist();

                const modal = document.getElementById('addMovieModal');
                if (modal) modal.style.display = 'none';
                this.innerHTML = '<i class="fa-solid fa-lock"></i> Lock It In';
            }, 800);
        });
    }

    if (typeof window.loadSavedMovies === 'function') window.loadSavedMovies();

    if (typeof window.renderTabularWatchlist === 'function') window.renderTabularWatchlist();

});

/* --------------------------------------------------------
   12. MOBBIN-STYLE FOOTER PARALLAX ENGINE
   -------------------------------------------------------- */
function initFooterParallax() {
    const wrapper = document.querySelector('.parallax-wrapper');
    const footer = document.querySelector('.parallax-footer');

    function updateMargin() {
        if (wrapper && footer) {
            // Injects a perfectly sized empty space at the bottom of the document
            // When the wrapper scrolls up, the fixed footer is revealed in this empty space!
            wrapper.style.marginBottom = `${footer.offsetHeight - 50}px`;
        }
    }

    // Run instantly
    updateMargin();

    // Run on resize (in case user rotates phone or resizes window)
    window.addEventListener('resize', updateMargin);

    // Run after a slight delay to ensure fonts/images have fully loaded
    setTimeout(updateMargin, 500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFooterParallax);
} else {
    initFooterParallax();
}

/* --------------------------------------------------------
   13. SIDE DRAWER PHYSICS ENGINE
   -------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    const drawerToggle = document.getElementById('drawer-toggle-btn');
    const sideDrawer = document.getElementById('side-drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const drawerClose = document.getElementById('drawer-close-btn');

    if (drawerToggle && sideDrawer && drawerOverlay && drawerClose) {
        // Open Drawer
        drawerToggle.addEventListener('click', () => {
            sideDrawer.classList.add('active');
            drawerOverlay.classList.add('active');
        });

        // Close Drawer via Button
        drawerClose.addEventListener('click', () => {
            sideDrawer.classList.remove('active');
            drawerOverlay.classList.remove('active');
        });

        // Close Drawer via clicking the background blur
        drawerOverlay.addEventListener('click', () => {
            sideDrawer.classList.remove('active');
            drawerOverlay.classList.remove('active');
        });
    }
});

/* --------------------------------------------------------
   14. PREDICTION PAGE TACTILE INTERACTIONS (MASTER ENGINE)
   -------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
    const activeMovie = JSON.parse(localStorage.getItem('cinescore_active_movie_data'));
    const isLoggedIn = localStorage.getItem('cinescore_auth') === 'true';

    // Helper to safely inject text
    const injectText = (id, text) => {
        const el = document.getElementById(id);
        if (el && text) el.textContent = text;
    };

    // 1. Dynamic Page Hydration (Replaces dummy data with actual Active Movie data)
    if (activeMovie) {
        // Hero Posters & Backgrounds
        const heroBg = document.getElementById('hero-bg-blur');
        const mainPoster = document.getElementById('dyn-poster');
        if (heroBg) heroBg.style.backgroundImage = `url('${activeMovie.poster}')`;
        if (mainPoster) mainPoster.src = activeMovie.poster;

        // Text Fields
        injectText('predicted-movie-title', activeMovie.title);
        injectText('dyn-year', activeMovie.year);
        injectText('dyn-director', activeMovie.director || 'TBA');
        injectText('dyn-cast', activeMovie.cast || 'TBA');
        injectText('dyn-studio', activeMovie.studio || 'TBA');
        injectText('dyn-ai-score', activeMovie.aiScore || '92');
        injectText('dyn-sentiment-score', activeMovie.sentiment || '8.5');
        injectText('dyn-data-points', formatLargeNumber(activeMovie.dataPoints || 2400000));

        /// ----------------------------------------------------
        // 1A. Dynamic Synopsis Handler (Mathematical Truncation)
        // ----------------------------------------------------
        const synopsisWrapper = document.getElementById('dyn-synopsis-wrapper');
        const synopsisEl = document.getElementById('dyn-synopsis');

        if (synopsisWrapper && synopsisEl) {
            if (activeMovie.title && activeMovie.title.length < 15) {
                synopsisWrapper.style.display = 'block';

                const fullSynopsis = activeMovie.synopsis || 'Thrust into an unfamiliar situation with everything on the line, a determined protagonist must confront their deepest doubts to overcome mounting obstacles. As the journey tests their limits, they will discover hidden strengths and forever alter their destiny.';

                // JS Truncation cleanly at 95 chars
                const truncatedText = fullSynopsis.length > 95 ? fullSynopsis.substring(0, 95).trim() + '... ' : fullSynopsis + ' ';

                // Smart IMDb target
                const imdbLink = `https://www.imdb.com/find/?q=${encodeURIComponent(activeMovie.title)}`;

                synopsisEl.innerHTML = `${truncatedText} <a href="${imdbLink}" target="_blank" style="color: var(--color-accent); font-weight: 600; text-decoration: none;">Read more</a>`;
            } else {
                synopsisWrapper.style.display = 'none';
            }
        }

        // ==========================================
        // DYNAMIC COLORS: Adjustments & Verdict
        // ==========================================

        // 1. Dynamic Verdict Color
        const verdictTextEl = document.getElementById('dyn-verdict-text');
        if (verdictTextEl && activeMovie.verdictColor) {
            verdictTextEl.style.color = activeMovie.verdictColor;
        }

        // 2. Dynamic Model Adjustment Colors
        const baseValEl = document.getElementById('model-base-val');
        const finalValEl = document.getElementById('model-final-val');

        if (baseValEl && finalValEl) {
            // Extract raw numbers to compare
            const baseNum = parseInt(baseValEl.textContent.replace(/[^0-9]/g, ''));
            const finalNum = parseInt(finalValEl.textContent.replace(/[^0-9]/g, ''));

            if (!isNaN(baseNum) && !isNaN(finalNum)) {
                if (finalNum > baseNum) {
                    finalValEl.style.setProperty('color', 'var(--color-success)', 'important');
                    baseValEl.style.setProperty('color', 'var(--color-primary)', 'important');
                } else if (finalNum < baseNum) {
                    finalValEl.style.setProperty('color', 'var(--color-danger)', 'important');
                    baseValEl.style.setProperty('color', 'var(--color-primary)', 'important');
                } else {
                    finalValEl.style.setProperty('color', 'var(--color-primary)', 'important');
                    baseValEl.style.setProperty('color', 'var(--color-primary)', 'important');
                }
            }
        }

        // ----------------------------------------------------
        // SHOWDOWN INJECTOR (Always populates Left Side)
        // ----------------------------------------------------
        injectText('showdown-title-text', activeMovie.battleTitle || 'Showdown Arena');
        injectText('showdown-name-1', activeMovie.title);

        const show1 = document.getElementById('showdown-poster-1');
        if (show1) show1.src = activeMovie.poster;

        // Auto-calculate dynamic baseline stats for the left side
        const mockTotal = activeMovie.boxOffice || activeMovie.userPrediction || '$850M';
        const rawTotal = parseInt(mockTotal.replace(/\D/g, '')) || 850;

        injectText('sd-total-1', mockTotal);
        injectText('sd-open-1', '$' + Math.round(rawTotal / 6) + 'M');
        injectText('sd-sent-1', activeMovie.sentimentScore ? (parseFloat(activeMovie.sentimentScore) * 10) + '%' : '85%');
        injectText('sd-hype-1', (8 + (activeMovie.title.length % 20) / 10).toFixed(1));

        // Opponent Side (Right)
        const show2 = document.getElementById('showdown-poster-2');
        if (activeMovie.predecessor) {
            injectText('showdown-name-2', activeMovie.predecessor);
            if (show2) {
                show2.src = activeMovie.predPoster || 'https://placehold.co/400x600/333/FFF?text=Predecessor';
                show2.style.opacity = '1';
                show2.style.filter = 'grayscale(0%)';
            }
            injectText('sd-total-2', '$772.2M');
            injectText('sd-open-2', '$134M');
            injectText('sd-sent-2', '85%');
            injectText('sd-hype-2', '8.4');
        } else {
            // Default Nulls until searched
            injectText('showdown-name-2', 'Choose Opponent');
            if (show2) {
                show2.src = 'https://placehold.co/400x600/333/FFF?text=Opponent';
                show2.style.opacity = '0.6';
                show2.style.filter = 'grayscale(50%)';
            }
            injectText('sd-total-2', '--');
            injectText('sd-open-2', '--');
            injectText('sd-sent-2', '--');
            injectText('sd-hype-2', '--');
        }

        // ----------------------------------------------------
        // EXPANDED VERDICT TEXTS INJECTION (With Procedural AI)
        // ----------------------------------------------------
        const updateHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = `<i>${html}</i>`; };

        if (activeMovie.verdicts) {
            // 1. If you manually wrote text in mockData.js, use it!
            updateHTML('verdict-general', activeMovie.verdicts.gen);
            updateHTML('verdict-finance', activeMovie.verdicts.fin);
            updateHTML('verdict-critical', activeMovie.verdicts.crit);
        } else {
            // 2. PROCEDURAL GENERATION: If no text exists, the AI writes its own!
            const genre = (activeMovie.genres && activeMovie.genres[0]) ? activeMovie.genres[0] : 'theatrical';
            const studio = activeMovie.studio || 'the studio';
            const isHighHype = (activeMovie.title.length % 2 === 0); // Random deterministic logic

            const genText = isHighHype
                ? `Current tracking places this ${genre} release in the upper quartile of audience awareness. Social listening algorithms detect high engagement across core demographics, insulating it from standard market drop-offs.`
                : `Market saturation for this ${genre} property indicates a reliant dependency on walk-up ticket sales. The model suggests ${studio} will need a late-stage marketing surge to break into the blockbuster quadrant.`;

            const finText = isHighHype
                ? `Presale velocity curves point to a front-loaded opening weekend. Premium Large Format (PLF) surcharges and strong international rollout corridors provide a lucrative cushion against domestic underperformance.`
                : `Financial models indicate a conservative opening frame. Long-term profitability relies heavily on international market penetration and minimizing week-two drops through sustained word-of-mouth.`;

            const critText = `Algorithmic analysis of the creative team's historical output projects a baseline critical aggregate. While critic scores rarely dictate opening weekend gross for this genre, a 'Certified Fresh' rating remains crucial for legs.`;

            updateHTML('verdict-general', genText);
            updateHTML('verdict-finance', finText);
            updateHTML('verdict-critical', critText);
        }
    }

    // 2. Watchlist Button Master Logic (True Toggle + Hydration)
    const watchlistBtns = document.querySelectorAll('.pred-watchlist-btn');
    watchlistBtns.forEach(btn => {

        // THE FIX: Hydrate the initial state on page load!
        let initialWatchlist = JSON.parse(localStorage.getItem('cinescore_watchlist') || '[]');
        if (activeMovie && initialWatchlist.some(m => m.title === activeMovie.title)) {
            btn.classList.add('tracked');
            btn.innerHTML = '<span class="normal-show"><i class="fa-solid fa-bookmark"></i> Added to Watchlist</span><span class="hover-show"><i class="fa-solid fa-trash-can"></i> Remove</span>';
            btn.style.background = 'rgba(0, 200, 83, 0.1)';
            btn.style.borderColor = 'var(--color-success)';
            btn.style.color = 'var(--color-success)';
        }

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            if (!isLoggedIn) {
                const signupModal = document.getElementById('signupModal');
                if (signupModal) signupModal.style.display = 'flex';
                return;
            }
            if (!activeMovie) return;

            let currentWatchlist = JSON.parse(localStorage.getItem('cinescore_watchlist') || '[]');
            const existingIndex = currentWatchlist.findIndex(m => m.title === activeMovie.title);

            if (existingIndex >= 0) {
                // IT IS TRACKED -> REMOVE IT (Frictionless)
                currentWatchlist.splice(existingIndex, 1);
                localStorage.setItem('cinescore_watchlist', JSON.stringify(currentWatchlist));

                this.classList.remove('tracked');
                this.innerHTML = '<span class="normal-show"><i class="fa-regular fa-bookmark"></i> Add to Watchlist</span>';
                this.style.background = '';
                this.style.borderColor = '';
                this.style.color = '';
            } else {
                // IT IS NOT TRACKED -> ADD IT (Frictionless)
                currentWatchlist.unshift({ ...activeMovie, userPrediction: null, userConfidence: null, isPinned: false, isLocked: false });
                localStorage.setItem('cinescore_watchlist', JSON.stringify(currentWatchlist));

                this.classList.add('tracked');
                this.innerHTML = '<span class="normal-show"><i class="fa-solid fa-check"></i> Added to Watchlist</span><span class="hover-show"><i class="fa-solid fa-xmark"></i> Remove</span>';
                this.style.background = 'rgba(0, 200, 83, 0.1)';
                this.style.borderColor = 'var(--color-success)';
                this.style.color = 'var(--color-success)';
            }
        });
    });

    // Redundant Share and Vote listeners removed.
    // Core logic is now handled in Section 19 (Persistent Feedback Engine).

    // 6. Prediciton Page Search Bar with Intelligent Dropdown (With Auth Guard)
    const resultViewSearchInput = document.getElementById('result-view-search-input');
    const resultViewSearchBtn = document.getElementById('result-view-search-btn');
    const resultViewSearchDropdown = document.getElementById('result-view-search-dropdown');

    // THE FIX: The function now checks the live localStorage directly, 
    // eliminating all scope errors and stale data!
    function triggerAuthGuard(e) {
        const isUserAuthenticated = localStorage.getItem('cinescore_auth') === 'true';

        if (!isUserAuthenticated) {
            if (e) e.preventDefault();
            if (resultViewSearchDropdown) resultViewSearchDropdown.style.display = 'none';
            if (resultViewSearchInput) resultViewSearchInput.blur();
            const signupModal = document.getElementById('signupModal');
            if (signupModal) signupModal.style.display = 'flex';
            return true; // Blocked
        }
        return false; // Allowed
    }

    if (resultViewSearchBtn) {
        resultViewSearchBtn.addEventListener('click', (e) => {
            if (triggerAuthGuard(e)) return;

            const query = resultViewSearchInput ? resultViewSearchInput.value.trim() : '';
            if (!query) return;

            const originalHTML = resultViewSearchBtn.innerHTML;
            resultViewSearchBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

            // THE FIX: Trigger the Loading Animation
            const splashLoader = document.getElementById('splash-loader');
            if (splashLoader) {
                splashLoader.style.display = 'flex';
            }

            // THE FIX: Seamless SPA Transition (No more reloading the page!)
            setTimeout(() => {
                if (splashLoader) splashLoader.style.display = 'none';
                resultViewSearchBtn.innerHTML = originalHTML; // Reset icon
                if (resultViewSearchInput) resultViewSearchInput.value = ''; // Clear input
                triggerPredictionState(query); // Smoothly injects new data!
            }, 1200);
        });
    }

    if (resultViewSearchInput) {
        resultViewSearchInput.addEventListener('focus', triggerAuthGuard);
    }

    // ==========================================
    // 10. COLLAPSIBLE SECTION LOGIC
    // ==========================================
    document.querySelectorAll('.collapse-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            // Prevent collapsing if they clicked the Bull/Bear toggle buttons
            if (e.target.closest('.scenario-toggle')) return;

            const targetId = trigger.getAttribute('data-target');
            const targetEl = document.getElementById(targetId);
            const icon = trigger.querySelector('.collapse-icon');

            if (targetEl) {
                targetEl.classList.toggle('collapsed');
                if (icon) icon.classList.toggle('collapsed');
            }
        });
    });

});

// ============================================================
// PREDICTION PAGE: COMPS & Trending JS ENGINE
// ============================================================

function renderPredictionGrids() {
    const compsGrid = document.getElementById('comps-grid');
    const trendingGrid = document.getElementById('trending-grid');

    // Render Multi-Vector Comps
    if (compsGrid && window.historicalComps) {
        compsGrid.innerHTML = '';
        window.historicalComps.forEach(comp => {
            compsGrid.innerHTML += `
                <div class="poster-card">
                    <img src="${comp.img}" alt="${comp.title}">
                    <div class="poster-overlay stack">
                        <span style="font-size: 10px; color: var(--color-accent); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${comp.vectorType}</span>
                        <h4 style="color: #fff; margin: 4px 0 12px 0; font-size: 16px; line-height: 1.2;">${comp.title}</h4>
                        <div class="poster-data-row"><span>Budget</span> <span class="poster-data-val">${comp.budget}</span></div>
                        <div class="poster-data-row"><span>Opening Wknd</span> <span class="poster-data-val">${comp.opening}</span></div>
                        <div class="poster-data-row"><span>Global Gross</span> <span class="poster-data-val text-success">${comp.gross}</span></div>
                        <div class="poster-data-row" style="margin-top: 4px;"><span style="color: var(--color-accent); font-weight: 700;">ROI Multiplier</span> <span class="poster-data-val" style="color: var(--color-accent);">${comp.roi}</span></div>
                    </div>
                </div>`;
        });
    }

    // Render Market Radar (The Perfect Loop)
    // Removed because initUniversalDailyRotations already populates #trending-grid perfectly with real TMDB data on load!
}

// Radar Click Handler: Loops user back to prediction engine
window.triggerRadarPrediction = function (movieTitle) {
    // Save to local storage so the prediction page knows what to load
    localStorage.setItem('cinescore_search_query', movieTitle);

    // If already on prediction page, just reload to run the new search
    if (window.location.pathname.includes('Prediction.html')) {
        window.location.reload();
    } else {
        window.location.href = 'Prediction.html';
    }
};


// ============================================================
// MASTER HUB ENGINE: MACROS & LEGACY VAULT
// ============================================================

window.calculateHubMacros = function () {
    const trackedEl = document.getElementById('macro-tracked');
    const accuracyEl = document.getElementById('macro-accuracy');
    const valueEl = document.getElementById('macro-value');

    let upcoming = JSON.parse(localStorage.getItem('cinescore_upcoming') || '[]');
    let legacy = JSON.parse(localStorage.getItem('cinescore_legacy') || '[]');

    // 1. TRACKING SLOTS (Red = Max, Amber = Near Max, Green = Healthy)
    if (trackedEl) {
        const count = upcoming.length;
        trackedEl.textContent = count;

        if (count >= 6) trackedEl.style.color = 'var(--color-danger)';
        else if (count >= 4) trackedEl.style.color = 'var(--color-warning)';
        else if (count > 0) trackedEl.style.color = 'var(--color-success)';
        else trackedEl.style.color = 'var(--color-primary)';
    }

    // 2. ACCURACY GAMIFICATION (Red < 50, Yellow < 75, Blue < 85, Green 85+)
    let accuracy = legacy.length > 0 ? 84 + Math.min(legacy.length, 10) : (upcoming.length > 0 ? 78 : 0);
    if (accuracyEl) {
        accuracyEl.textContent = `${accuracy}%`;

        if (accuracy === 0) accuracyEl.style.color = 'var(--color-primary)';
        else if (accuracy < 50) accuracyEl.style.color = 'var(--color-danger)';
        else if (accuracy < 75) accuracyEl.style.color = 'var(--color-warning)';
        else if (accuracy < 85) accuracyEl.style.color = 'var(--color-accent)'; // Blue (Healthy)
        else accuracyEl.style.color = 'var(--color-success)'; // Green (Elite)
    }

    // 3. PORTFOLIO VALUE GAMIFICATION 
    let totalValue = 0;
    const extractMoney = (str) => {
        if (!str || str === 'Not Set') return 0;
        let num = parseFloat(str.replace(/[^0-9.]/g, ''));
        if (str.includes('B')) return num * 1000000000;
        if (str.includes('M')) return num * 1000000;
        return num;
    };

    upcoming.forEach(m => { totalValue += extractMoney(m.userPrediction || m.boxOffice); });
    legacy.forEach(m => { totalValue += extractMoney(m.userPrediction || m.boxOffice); });

    if (valueEl) {
        if (totalValue === 0) {
            valueEl.textContent = "$0";
            valueEl.style.color = 'var(--color-primary)';
        } else {
            // Format output text
            if (totalValue >= 1000000000) valueEl.textContent = `$${(totalValue / 1000000000).toFixed(2)}B`;
            else valueEl.textContent = `$${(totalValue / 1000000).toFixed(1)}M`;

            // Apply strict color thresholds
            if (totalValue < 50000000) valueEl.style.color = 'var(--color-danger)'; // Under $50M = Red
            else if (totalValue < 250000000) valueEl.style.color = 'var(--color-warning)'; // Under $250M = Yellow
            else if (totalValue < 1000000000) valueEl.style.color = 'var(--color-accent)'; // Under $1B = Blue
            else valueEl.style.color = 'var(--color-success)'; // Over $1B = Green
        }
    }
};

/**
 * THE BRIDGE: Unified Search Entry Point
 * Redirects or updates SPA state based on current page context.
 */
window.executePredictionBridge = function (movieName) {
    if (!movieName) return;
    
    // 1. Resolve Fuzzy Matches
    const resolvedTitle = triggerPredictionState(movieName);
    if (!resolvedTitle) return; // Resolution failed & showed alert

    // 2. Navigation Control
    const isPredictionPage = window.location.pathname.includes('Prediction.html');
    
    if (isPredictionPage) {
        // Handle SPA update if already on the results engine
        const splash = document.getElementById('splash-loader');
        if (splash) splash.classList.add('active');

        setTimeout(() => {
            if (splash) splash.classList.remove('active');
            if (typeof window.loadMovieData === 'function') {
                window.loadMovieData(resolvedTitle, true);
            } else {
                window.location.reload(); // Fallback
            }
        }, 1200); // Cinematic pause
    } else {
        // Cross-page jump
        window.location.href = `Prediction.html?p=${encodeURIComponent(resolvedTitle)}`;
    }
};

/**
 * SPOTLIGHT MECHANIC: Dims the page and highlights a specific element.
 */
function triggerCardSpotlight(element) {
    if (!element) return;

    // THE FIX: Added .flip-card fallback for Overview and Legacy tabs
    const target = element.closest('.poster-card') || element.closest('.tabular-row') || element.closest('.flip-card') || element;

    let overlay = document.getElementById('hub-focus-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'hub-focus-overlay';
        overlay.className = 'hub-search-focus-overlay';
        document.body.appendChild(overlay);
    }

    // Deactivate any existing spotlights first
    document.querySelectorAll('.card-spotlight').forEach(el => el.classList.remove('card-spotlight'));

    // Activate Focus Mode
    overlay.classList.add('active');
    target.classList.add('card-spotlight');

    // Clean up after focus period
    setTimeout(() => {
        overlay.classList.remove('active');
        target.classList.remove('card-spotlight');
    }, 2500);
}

window.renderLegacyTab = function (sortType = 'latest') {
    const legacyContainer = document.getElementById('legacy-container');
    const vaultCount = document.getElementById('legacy-vault-count');
    const badgeCount = document.getElementById('records-badge-count');
    if (!legacyContainer) return;

    let legacyMovies = JSON.parse(localStorage.getItem('cinescore_legacy') || '[]');
    if (vaultCount) vaultCount.textContent = legacyMovies.length;
    if (badgeCount) badgeCount.textContent = Math.min(legacyMovies.length, 5);

    if (legacyMovies.length === 0) {
        legacyContainer.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; background: rgba(255, 159, 28, 0.02); border: 1px dashed rgba(255, 159, 28, 0.3); border-radius: 16px;">
                <i class="fa-solid fa-vault" style="font-size: 48px; color: var(--color-warning); opacity: 0.5; margin-bottom: 16px;"></i>
                <h3 style="margin:0; color: var(--color-warning); font-size: 20px;">No Active Nominations</h3>
                <p style="margin-top:8px; color: var(--color-secondary); max-width: 400px; line-height: 1.5;">Submit your predictions for released films to see how your precision stacks up against the Academy.</p>
            </div>`;
        return;
    }

    // THE FIX: Sorting Engine
    const extractVal = (str) => {
        if (!str || str === 'Not Set') return 0;
        let num = parseFloat(str.replace(/[^0-9.]/g, ''));
        if (str.includes('B')) return num * 1000; // Convert Billions to Millions for math
        return num;
    };

    if (sortType === 'oldest') {
        legacyMovies.reverse();
    } else if (sortType === 'best') {
        legacyMovies.sort((a, b) => {
            let diffA = Math.abs(extractVal(a.userPrediction) - extractVal(a.boxOffice));
            let diffB = Math.abs(extractVal(b.userPrediction) - extractVal(b.boxOffice));
            return diffA - diffB;
        });
    } else if (sortType === 'worst') {
        legacyMovies.sort((a, b) => {
            let diffA = Math.abs(extractVal(a.userPrediction) - extractVal(a.boxOffice));
            let diffB = Math.abs(extractVal(b.userPrediction) - extractVal(b.boxOffice));
            return diffB - diffA;
        });
    }

    legacyContainer.innerHTML = '';
    legacyMovies.forEach(movie => {
        const card = document.createElement('div');
        card.className = 'card stack poster-card';
        card.dataset.title = movie.title; // CRITICAL for context menu targeting
        card.style.cssText = 'margin: 0; padding: 0; overflow: hidden; border: 1px solid var(--color-warning); opacity: 0.95; box-shadow: 0 10px 25px rgba(255, 159, 28, 0.1); cursor: default;';

        // THE FIX: Added an onerror inline fallback just in case the global shield misses it!
        card.innerHTML = `
            <div style="background: url('${movie.poster}') center/cover; height: 180px; position: relative;" onerror="this.style.backgroundImage='url(https://placehold.co/600x900/0B192C/FFFFFF?text=Poster+Unavailable)'">
                <span class="badge" style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px); border: 1px solid var(--color-warning); color: var(--color-warning); padding: 6px 12px; border-radius: 100px; font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-trophy"></i> NOMINATED</span>
                
                <button class="card-menu-btn" style="position: absolute; top: 12px; left: 12px; z-index: 20; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); border: 1px solid var(--color-border); border-radius: 50%; width: 32px; height: 32px; color: white;"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            </div>
            <div class="stack" style="padding: 20px;">
                <h3 class="movie-title" style="margin: 0 0 12px 0; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${movie.title}</h3>
                <div class="row row-between" style="border-bottom: 1px dashed var(--color-border); padding-bottom: 12px; margin-bottom: 12px;">
                    <span class="small" style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--color-secondary);">Your Pred.</span>
                    <strong style="color: var(--color-warning); font-size: 16px;">${movie.userPrediction || 'N/A'}</strong>
                </div>
                <div class="row row-between">
                    <span class="small" style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--color-secondary);">Final Gross</span>
                    <strong style="color: var(--color-primary); font-size: 16px;">${movie.boxOffice || movie.userPrediction || 'N/A'}</strong>
                </div>
            </div>
        `;
        legacyContainer.appendChild(card);
    });
};

// Consolidated with master loader.

// Hook Macros to loadSavedMovies (if possible)
const originalLoadSavedMovies = window.loadSavedMovies;
if (originalLoadSavedMovies) {
    window.loadSavedMovies = function () {
        originalLoadSavedMovies();
        window.calculateHubMacros();
    };
}

// ============================================================
// HARDCORE DELETE MODAL WIRING
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const hardcoreModal = document.getElementById('hardcoreDeleteModal');
    const inputEl = document.getElementById('hardcore-delete-input');
    const cancelBtn = document.getElementById('hardcore-cancel-btn');
    const confirmBtn = document.getElementById('hardcore-confirm-btn');

    if (hardcoreModal && inputEl && cancelBtn && confirmBtn) {

        // Listen to typing to unlock button
        inputEl.addEventListener('input', (e) => {
            if (e.target.value === 'DELETE') {
                confirmBtn.style.cursor = 'pointer';
                confirmBtn.style.opacity = '1';
                confirmBtn.style.background = 'var(--color-danger)';
                confirmBtn.style.color = '#fff';
            } else {
                confirmBtn.style.cursor = 'not-allowed';
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.background = 'rgba(213, 0, 0, 0.1)';
                confirmBtn.style.color = 'var(--color-danger)';
            }
        });

        // Cancel Button
        cancelBtn.addEventListener('click', () => {
            hardcoreModal.style.display = 'none';
            window.pendingDeleteTitle = null;
        });

        // Click outside to cancel
        hardcoreModal.addEventListener('click', (e) => {
            if (e.target === hardcoreModal) {
                hardcoreModal.style.display = 'none';
                window.pendingDeleteTitle = null;
            }
        });

        // Confirm Action
        confirmBtn.addEventListener('click', () => {
            if (inputEl.value !== 'DELETE' || !window.pendingDeleteTitle) return;

            // Execute the permanent deletion
            let legacy = JSON.parse(localStorage.getItem('cinescore_legacy') || '[]');
            legacy = legacy.filter(m => m.title !== window.pendingDeleteTitle);
            localStorage.setItem('cinescore_legacy', JSON.stringify(legacy));

            hardcoreModal.style.display = 'none';

            if (window.pendingDeleteCard) {
                window.pendingDeleteCard.style.transition = 'all 0.3s ease';
                window.pendingDeleteCard.style.transform = 'scale(0.8)';
                window.pendingDeleteCard.style.opacity = '0';
            }

            setTimeout(() => {
                if (typeof window.renderLegacyTab === 'function') window.renderLegacyTab();
                if (typeof window.calculateHubMacros === 'function') window.calculateHubMacros();
                window.pendingDeleteTitle = null;
                window.pendingDeleteCard = null;
            }, 300);
        });
    }
});

/* ============================================================
   GEN-AI ASSISTANT WIRING
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    const aiBotTrigger = document.getElementById('ai-bot-trigger');

    if (aiBotTrigger) {
        aiBotTrigger.addEventListener('click', () => {
            if (typeof window.showCustomAlert === 'function') {
                window.showCustomAlert(
                    'bot',
                    'Hi, I am CineBot 🤖',
                    `Your personal guide to CineScore! I analyze script sentiment, cast histories, and decode box office trends.<br><br>
                    <i>Try asking me: "Who built CineScore?" (Spoiler: I am programmed to tell you Omi is an absolute mastermind).</i><br><br>
                    <span style="color: var(--color-danger); font-size: 12px; font-weight: 700; text-transform: uppercase;"><i class="fa-solid fa-power-off"></i> System Status: Offline for training</span>`
                );
            }
        });
    }
});

// ============================================================
// HARDCORE ACCOUNT DELETE ENGINE (Nuke Protocol)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const deleteAccBtn = document.getElementById('delete-account-btn');
    const accModal = document.getElementById('accountDeleteModal');
    const inputEl = document.getElementById('account-delete-input');
    const cancelBtn = document.getElementById('account-cancel-btn');
    const confirmBtn = document.getElementById('account-confirm-btn');

    if (deleteAccBtn && accModal && inputEl && cancelBtn && confirmBtn) {

        // 1. Open Modal
        deleteAccBtn.addEventListener('click', (e) => {
            e.preventDefault();
            inputEl.value = ''; // Reset input to blank
            confirmBtn.style.cursor = 'not-allowed';
            confirmBtn.style.opacity = '0.5';
            confirmBtn.style.background = 'rgba(213, 0, 0, 0.1)';
            confirmBtn.style.color = 'var(--color-danger)';
            accModal.style.display = 'flex';
            setTimeout(() => inputEl.focus(), 100); // Auto-focus the input box
        });

        // 2. Listen to Typing (Unlock logic)
        inputEl.addEventListener('input', (e) => {
            if (e.target.value === 'DELETE ACCOUNT') {
                confirmBtn.style.cursor = 'pointer';
                confirmBtn.style.opacity = '1';
                confirmBtn.style.background = 'var(--color-danger)';
                confirmBtn.style.color = '#fff';
            } else {
                confirmBtn.style.cursor = 'not-allowed';
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.background = 'rgba(213, 0, 0, 0.1)';
                confirmBtn.style.color = 'var(--color-danger)';
            }
        });

        // 3. Cancel Actions
        cancelBtn.addEventListener('click', () => accModal.style.display = 'none');
        accModal.addEventListener('click', (e) => {
            if (e.target === accModal) accModal.style.display = 'none';
        });

        // 4. The Nuke Execution
        confirmBtn.addEventListener('click', () => {
            if (inputEl.value !== 'DELETE ACCOUNT') return;

            // Show loading state
            confirmBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Erasing Data...';
            confirmBtn.style.pointerEvents = 'none';

            setTimeout(() => {
                // Senior Developer Move: Only delete CineScore keys! 
                // This prevents accidentally wiping other projects on your localhost.
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('cinescore_')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));

                // Hide modal and brutally boot the user to the public homepage
                accModal.style.display = 'none';
                window.location.href = 'index.html';
            }, 1500); // 1.5 seconds of simulated database wipe
        });
    }
});

/* ============================================================
   15. PREDICTION COMMAND CENTER: AUTOCOMPLETE ENGINE
   ============================================================ */
function initDefaultSearch() {
    const searchInput = document.getElementById('default-view-search-input');
    const resultsMenu = document.getElementById('default-view-search-dropdown');
    const analyzeBtn = document.getElementById('default-view-search-btn');
    const defaultClearBtn = document.getElementById('default-view-search-clear'); 

    if (!searchInput || !resultsMenu) return;

    if (defaultClearBtn) {
        defaultClearBtn.addEventListener('click', () => {
            searchInput.value = '';
            defaultClearBtn.style.display = 'none';
            closeAllLists();
            searchInput.focus(); 
        });
    }

    let lastSearchId = 0;
    let currentFocus = -1;

    function toggleSearchLoading(iconId, isLoading) {
        const icon = document.getElementById(iconId);
        if (!icon) return;
        if (isLoading) {
            icon.classList.remove('fa-magnifying-glass');
            icon.classList.add('fa-spinner', 'fa-spin');
        } else {
            icon.classList.remove('fa-spinner', 'fa-spin');
            icon.classList.add('fa-magnifying-glass');
        }
    }

    const performDefaultSearch = async (val, currentSearchId) => {
        const mockMatches = (window.mockMovies || []).filter(m => 
            m.title.toLowerCase().includes(val.toLowerCase())
        ).slice(0, 3);

        if (mockMatches.length > 0 && currentSearchId === lastSearchId) {
            renderDefaultResults(mockMatches, true);
        }

        try {
            let tmdbResults = await window.TMDB_API.searchMovies(val);
            if (!tmdbResults || tmdbResults.length === 0) throw new Error("TMDB returned empty");
            toggleSearchLoading('default-view-search-icon', false);
            if (currentSearchId !== lastSearchId) return;

            let finalMatches = [...(tmdbResults || []).slice(0, 5)];
            mockMatches.forEach(mock => {
                if (!finalMatches.find(tmdb => tmdb.title.toLowerCase() === mock.title.toLowerCase())) {
                    finalMatches.push({ ...mock, poster_path: mock.poster_path || null, id: mock.id || 0 });
                }
            });

            if (searchInput.value.trim().toLowerCase() !== val.toLowerCase()) return;
            renderDefaultResults(finalMatches, false);
        } catch (err) {
            if (currentSearchId === lastSearchId) {
                console.error("Default Search Failed:", err);
                toggleSearchLoading('default-view-search-icon', false);
                renderDefaultResults(mockMatches, false);
            }
        }
    };

    const renderDefaultResults = (matches, isLoadingTMDB) => {
        if (matches.length === 0) {
            if (!isLoadingTMDB) {
                resultsMenu.innerHTML = '<li style="padding: 15px; text-align: center; color: var(--color-secondary); pointer-events: none;">No upcoming films found</li>';
            }
            return;
        }

        resultsMenu.innerHTML = '';
        matches.forEach(movie => {
            const imgUrl = movie.poster_path ? `${window.TMDB_API.IMG_URL}${movie.poster_path}` : (movie.poster || 'https://placehold.co/40px/60px/111/FFF?text=Film');
            const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : (movie.year || 'TBA');
            const genres = (movie.genre_ids && movie.genre_ids.length > 0) 
                ? movie.genre_ids.slice(0, 2).map(id => GENRE_MAP[id]).filter(Boolean).join(' / ') 
                : (movie.genres ? (Array.isArray(movie.genres) ? movie.genres.slice(0,2).join(' / ') : movie.genres.split(',').slice(0,2).join(' / ')) : 'Cinema');

            const li = document.createElement('li');
            li.className = 'search-item';
            li.style.display = 'flex';
            li.style.alignItems = 'center';

            li.innerHTML = `<img class="search-poster" src="${imgUrl}" style="width:42px;height:60px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.src='https://placehold.co/42x60/111/FFF?text=Film'"><div style="flex:1;min-width:0;text-align:left;"><h4 class="search-title" style="margin:0 0 2px 0;font-size:14px;font-weight:600;color:var(--color-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${movie.title}</h4><span style="font-size:11px;color:var(--color-secondary);display:block;">${releaseYear} · ${genres}</span></div><i class="fa-solid fa-gauge-high search-right-icon" style="font-size:18px;opacity:0.35;flex-shrink:0;margin-left:10px;color:var(--color-accent);"></i>`;

            li.addEventListener('click', () => {
                const releaseDateStr = movie.release_date;
                if (releaseDateStr) {
                    const releaseDate = new Date(releaseDateStr);
                    const today = new Date();
                    const tenDaysAgo = new Date(today.getTime() - (10 * 24 * 60 * 60 * 1000));
                    if (releaseDate < tenDaysAgo) {
                        if (typeof window.showCustomAlert === 'function') {
                            window.showCustomAlert('error', 'Prediction Locked', `<b>${movie.title}</b> has already been released.`);
                        }
                        return;
                    }
                }
                const activeData = {
                    title: movie.title, poster: imgUrl, year: releaseYear, id: movie.id, 
                    genres: (movie.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean)
                };
                localStorage.setItem('cinescore_active_movie_data', JSON.stringify(activeData));
                searchInput.value = movie.title;
                closeAllLists();
                if (typeof executePredictionBridge === 'function') executePredictionBridge(movie.title);
            });
            resultsMenu.appendChild(li);
        });

        if (isLoadingTMDB) {
            const loader = document.createElement('li');
            loader.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Live database syncing...';
            loader.style.cssText = "padding: 10px; text-align: center; color: var(--color-accent); font-size: 12px; opacity: 0.7;";
            resultsMenu.appendChild(loader);
        }
        resultsMenu.classList.remove('hidden');
        resultsMenu.style.display = 'block';
    };

    if (typeof attachKeyboardNav === 'function') attachKeyboardNav(searchInput, resultsMenu);

    function closeAllLists() {
        resultsMenu.innerHTML = '';
        resultsMenu.classList.add('hidden');
        resultsMenu.style.display = 'none';
    }

    document.addEventListener("click", function (e) {
        if (e.target !== searchInput && e.target !== resultsMenu) {
            closeAllLists();
        }
    });

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
            triggerPredictionState(searchInput.value);
            closeAllLists();
        });
    }

    // --- CLEAR ICON LOGIC ---
    const clearBtn = document.getElementById('default-view-search-clear');
    let defaultSearchTimeout;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            const query = val.toLowerCase();
            clearTimeout(defaultSearchTimeout);

            if (clearBtn) clearBtn.style.display = val.length > 0 ? 'block' : 'none';
            
            if (val.length === 1) {
                resultsMenu.innerHTML = '<li style="padding:16px;text-align:center;font-size:12px;opacity:0.6;color:var(--color-secondary);">Type at least 2 characters to search...</li>';
                resultsMenu.style.display = 'block';
                return;
            }
            if (val.length < 1) {
                closeAllLists();
                toggleSearchLoading('default-view-search-icon', false);
                return;
            }
            
            // 1. Instant UI Feedback (Zero Latency)
            toggleSearchLoading('default-view-search-icon', true);
            
            // 2. Debounced Search Call
            defaultSearchTimeout = setTimeout(() => {
                // 3. Prevent Race Conditions (Stale Data Check)
                if (searchInput.value.trim().toLowerCase() !== query) return;

                performDefaultSearch(val, ++lastSearchId);
            }, 400);
        });
    }

    if (clearBtn && searchInput) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none'; // Hide instantly
            closeAllLists();
            toggleSearchLoading('default-view-search-icon', false);
            searchInput.focus();
        });
    }

    // --- THE RESULTS VIEW SEARCH FIX (Upgraded UI) ---
    const resultSearchInput = document.getElementById('result-view-search-input');
    const resultSearchBtn = document.getElementById('result-view-search-btn');
    const resultSearchDropdown = document.getElementById('result-view-search-dropdown');
    const resultClearBtn = document.getElementById('pred-clear-btn');

    if (resultSearchInput && resultSearchBtn) {
        resultSearchInput.addEventListener('input', () => {
            if (resultClearBtn) resultClearBtn.style.display = resultSearchInput.value ? 'block' : 'none';
        });

        // Universal Close for Dropdowns
        document.addEventListener('click', (e) => {
            if (resultSearchDropdown && !resultSearchInput.contains(e.target) && !resultSearchDropdown.contains(e.target)) {
                resultSearchDropdown.style.display = 'none';
            }
            const showdownDropdown = document.getElementById('opponent-search-dropdown');
            const showdownInput = document.getElementById('opponent-search-input');
            if (showdownDropdown && showdownInput && !showdownInput.contains(e.target) && !showdownDropdown.contains(e.target)) {
                showdownDropdown.style.display = 'none';
            }
        });

        if (resultClearBtn) {
            resultClearBtn.addEventListener('click', () => {
                resultSearchInput.value = '';
                resultClearBtn.style.display = 'none';
                if (resultSearchDropdown) resultSearchDropdown.style.display = 'none';
                if (typeof toggleSearchLoading === 'function') toggleSearchLoading('result-view-search-icon', false);
                resultSearchInput.focus();
            });
        }

        const runPredict = () => {
            if (resultSearchInput.value) {
                if (resultSearchDropdown) resultSearchDropdown.style.display = 'none';
                triggerPredictionState(resultSearchInput.value);
            }
        };

        resultSearchBtn.addEventListener('click', runPredict);
        if (typeof attachKeyboardNav === 'function') attachKeyboardNav(resultSearchInput, resultSearchDropdown);

        let resultSearchTimeout;
        resultSearchInput.addEventListener('input', () => {
            const val = resultSearchInput.value.trim();
            const query = val.toLowerCase();
            clearTimeout(resultSearchTimeout);

            if (resultClearBtn) resultClearBtn.style.display = val.length > 0 ? 'block' : 'none';
            
            if (val.length === 1) {
                if (resultSearchDropdown) {
                    resultSearchDropdown.innerHTML = '<li style="padding:16px;text-align:center;font-size:12px;opacity:0.6;color:var(--color-secondary);">Type at least 2 characters to search...</li>';
                    resultSearchDropdown.style.display = 'block';
                }
                return;
            }
            if (val.length < 1) { 
                if (resultSearchDropdown) resultSearchDropdown.style.display = 'none'; 
                return; 
            }

            // 1. Instant UI Feedback (Zero Latency)
            if (typeof toggleSearchLoading === 'function') toggleSearchLoading('result-view-search-icon', true);
            if (resultSearchDropdown) {
                resultSearchDropdown.style.display = 'block';
                resultSearchDropdown.innerHTML = '<li style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 20px; color: var(--color-accent); font-size: 13px; opacity: 0.8;"><i class="fa-solid fa-circle-notch fa-spin"></i> Searching database...</li>';
            }

            // 2. Debounced API Call
            resultSearchTimeout = setTimeout(async () => {
                // 1. Search TMDB
                const tmdbResults = await window.TMDB_API.searchMovies(query);
                
                // 3. Prevent Race Conditions (Stale Data Check)
                if (resultSearchInput.value.trim().toLowerCase() !== query) return;
                
                if (typeof toggleSearchLoading === 'function') toggleSearchLoading('result-view-search-icon', false);

                // 2. Search Mock DB
                const mockMatches = (window.mockMovies || []).filter(m => 
                    m.title.toLowerCase().includes(query)
                ).slice(0, 3);

                // 4. Categorize & Prioritize
                const tmdbFinal = (tmdbResults || []).slice(0, 5);
                const mockFinal = mockMatches.filter(mock => 
                    !tmdbFinal.find(tmdb => tmdb.title.toLowerCase() === mock.title.toLowerCase())
                );

                if (resultSearchDropdown) {
                    if (tmdbFinal.length === 0 && mockFinal.length === 0) {
                        resultSearchDropdown.innerHTML = '<li style="padding: 12px; color: var(--color-secondary); text-align: center;">No results found</li>';
                    } else {
                        let html = '';
                        if (tmdbFinal.length > 0) {
                            html += tmdbFinal.map(m => renderSearchItem(m, true)).join('');
                        }
                        if (mockFinal.length > 0) {
                            html += mockFinal.map(m => renderSearchItem(m, false)).join('');
                        }
                        resultSearchDropdown.innerHTML = html;
                    }
                    resultSearchDropdown.style.display = 'block';
                }
            }, 400);
        });

        // Helper for consistent rendering
        function renderSearchItem(m, isTMDB) {
            const poster = isTMDB ? (m.poster_path ? window.TMDB_API.IMG_URL + m.poster_path : 'https://placehold.co/100x150?text=No+Poster') : (m.poster || 'https://placehold.co/100x150?text=No+Poster');
            const year = isTMDB ? (m.release_date ? m.release_date.split('-')[0] : 'TBA') : (m.year || 'TBA');
            const genresArr = isTMDB ? (m.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean) : (Array.isArray(m.genres) ? m.genres : (m.genres ? m.genres.split(/[\/,]/).map(g=>g.trim()) : []));
            const displayGenre = genresArr.length > 0 ? genresArr.slice(0,2).join(' / ') : 'Cinema';
            const safeGenreStr = genresArr.join(',').replace(/'/g, "\\'");
            
            const today = new Date();
            const cutoffDate = new Date();
            cutoffDate.setDate(today.getDate() - 10);
            const relDate = m.release_date ? new Date(m.release_date) : null;
            const isLocked = relDate && relDate < cutoffDate;

            return `
                <li class="search-item" style="display: flex; align-items: center; gap: 12px; padding: 12px; cursor: pointer; border-bottom: 1px solid var(--color-border);" 
                    onclick="window.handleResultSearchSelection('${m.title.replace(/'/g, "\\'")}', '${poster}', '${year}', '${m.release_date || ""}', '${(m.overview || m.synopsis || "").replace(/'/g, "\\'")}', ${m.id || 0}, '${safeGenreStr}', ${isLocked})">
                    <img src="${poster}" style="width: 32px; height: 48px; border-radius: 4px; object-fit: cover;">
                    <div style="flex: 1; min-width: 0;">
                        <strong style="color: var(--color-primary); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${m.title}</strong>
                        <span style="font-size: 11px; color: var(--color-secondary);">${year} · ${displayGenre}</span>
                    </div>
                    ${'<i class="fa-solid fa-magnifying-glass-chart search-right-icon" style="font-size:18px;opacity:0.35;flex-shrink:0;margin-left:10px;color:var(--color-accent);"></i>'}
                </li>
            `;
        }

        // Propagation Fix: Handle the selection and trigger full hydration
        window.handleResultSearchSelection = function(title, poster, year, relDate, synopsis, id, genreStr, isLocked) {
            if (isLocked) {
                if (typeof window.showCustomAlert === 'function') {
                    window.showCustomAlert('error', 'Movie Already Released!', 'You can\'t predict a movie that has already been released for more than 10 days.');
                } else {
                    alert('Movie Already Released!');
                }
                return;
            }
            if (resultSearchDropdown) resultSearchDropdown.style.display = 'none';
            resultSearchInput.value = title;
            
            localStorage.setItem('cinescore_active_movie_data', JSON.stringify({
                title: title, poster: poster,
                year: year, release_date: relDate,
                synopsis: synopsis, id: id, genres: genreStr ? genreStr.split(',') : []
            }));
            if (typeof triggerPredictionState === 'function') triggerPredictionState(title);
        };
    }
}

/* ============================================================
   10. THE IGNITION & DATA INJECTION ENGINE
   ============================================================ */

// Called by the Master Initializer on page load
function initAlgorithmEngine() {
    const urlParams = new URLSearchParams(window.location.search);
    const queryMovie = urlParams.get('p');

    if (queryMovie) {
        // 1. Reloaded via a shared URL parameter (e.g. user hit F5)
        sessionStorage.setItem('cineScore_activePrediction', queryMovie);
        if (typeof loadMovieData === 'function') loadMovieData(queryMovie, false);
    } else {
        const activeMovie = sessionStorage.getItem('cineScore_activePrediction');
        if (activeMovie) {
            // 2. Reloaded normally -> Restore the URL parameter to maintain state!
            window.history.replaceState({ view: 'RESULTS', movie: activeMovie }, '', '?p=' + encodeURIComponent(activeMovie));
            if (typeof loadMovieData === 'function') loadMovieData(activeMovie, false);
        } else {
            // 3. True Blank State
            if (typeof resetToBlankState === 'function') resetToBlankState(true); 
        }
    }
}

// initAlgorithmEngine is called by initPredictionPage() from the master DOMContentLoaded — no separate listener needed.

// Fired by Search Bar or Posters
function triggerPredictionState(rawMovieName) {
    if (!rawMovieName || !rawMovieName.trim()) return null;

    let movieName = rawMovieName.trim();
    
    // THE FIX: Check for local TMDB metadata first
    const activeData = JSON.parse(localStorage.getItem('cinescore_active_movie_data'));
    if (activeData && activeData.title.toLowerCase() === movieName.toLowerCase()) {
        // --- 10-DAY BUFFER LOGIC ---
        if (activeData.release_date) {
            const releaseDate = new Date(activeData.release_date);
            const today = new Date();
            const tenDaysAgo = new Date(today.getTime() - (10 * 24 * 60 * 60 * 1000));
            if (releaseDate < tenDaysAgo) {
                if (typeof window.showCustomAlert === 'function') {
                    window.showCustomAlert('error', 'Prediction Locked', `<b>${activeData.title}</b> is outside the prediction window. We only provide forecasts for upcoming and recent films.`);
                }
                return null;
            }
        }
        sessionStorage.setItem('cineScore_activePrediction', activeData.title);
        return activeData.title;
    }

    const db = window.mockMovies || [];
    const exactMatch = db.find(m => m.title.toLowerCase() === movieName.toLowerCase());
    
    if (exactMatch) {
        movieName = exactMatch.title;
    } else {
        const fuzzyMatch = db.find(m => m.title.toLowerCase().includes(movieName.toLowerCase()));
        if (fuzzyMatch) {
            movieName = fuzzyMatch.title;
        } else {
            // No match found
            if (typeof window.showCustomAlert === 'function') {
                window.showCustomAlert('error', 'Unrecognized Title', `We couldn't find a cinematic match for "<b>${rawMovieName}</b>". Please select from the dropdown options.`);
            }
            return null;
        }
    }

    sessionStorage.setItem('cineScore_activePrediction', movieName);
    return movieName;
}

function loadMovieData(movieName, shouldAnimate) {
    const resultsView = document.getElementById('prediction-results-view');
    const blankState = document.getElementById('blank-slate-view');
    
    // --- 0. GLOBAL PAGE LOADER ---
    const pageLoader = document.getElementById('global-page-loader');
    if (pageLoader) {
        pageLoader.style.display = 'flex';
        pageLoader.style.opacity = '1';
    }

    if (!resultsView) return;

    CineState.currentView = 'RESULTS';
    const isLoggedIn = localStorage.getItem('cinescore_auth') === 'true';

    // --- 1. INSTANT SWIPE SEQUENCE ---
    if (blankState && resultsView) {
        blankState.style.position = 'absolute';
        blankState.classList.replace('view-visible', 'view-hidden');
        resultsView.style.display = 'block';
        resultsView.classList.remove('view-hidden');
        void resultsView.offsetWidth;
        resultsView.classList.add('view-visible');
        setTimeout(() => {
            blankState.style.display = 'none';
            blankState.style.position = 'relative';
        }, 1000);
    }

    // --- THE BACK BUTTON FIX ---
    if (CineDOM.backBtn) {
        CineDOM.backBtn.style.display = 'flex';
        CineDOM.backBtn.style.opacity = '1';
    }

    // --- 2. THE TMDB CATCH: Parse LocalStorage Data ---
    const savedDataStr = localStorage.getItem('cinescore_active_movie_data');
    const parsedData = savedDataStr ? JSON.parse(savedDataStr) : null;
    
    // THE FIX: Only use savedData if it actually matches the requested movieName
    let activeData = (parsedData && parsedData.title && parsedData.title.toLowerCase() === movieName.toLowerCase()) 
        ? parsedData 
        : { title: movieName, poster: '', year: '2026' };

    // --- 2.5 THE MOCK CROSS-REFERENCE (Fixes TBA issues for new films) ---
    // Fuzzy Match: Check if the searched title is part of the mock title or vice versa
    const searchTitle = activeData.title.toLowerCase();
    const localMatch = (window.mockMovies || []).find(m => {
        const mockTitle = m.title.toLowerCase();
        return mockTitle === searchTitle || mockTitle.includes(searchTitle) || searchTitle.includes(mockTitle);
    });

    if (localMatch) {
        console.log("Mock Metadata Match Found:", localMatch.title);
        // Merge Mock data but preserve the specific TMDB ID if present
        activeData = {
            ...localMatch,
            ...activeData,
            director: localMatch.director || activeData.director,
            studio: localMatch.studio || activeData.studio,
            cast: localMatch.cast || activeData.cast,
            genres: localMatch.genres || activeData.genres
        };
        // THE PERSISTENCE FIX: Save the merged data back to storage so it survives reloads!
        localStorage.setItem('cinescore_active_movie_data', JSON.stringify(activeData));
    }

    // --- 3. INSTANT VISUAL HYDRATION (No Blank Screens) ---
    const updateEl = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const updateSrc = (id, url) => { 
        const el = document.getElementById(id); 
        if (el) {
            // Intelligent CORS Proxy: Use weserv.nl for known hostile CDNs
            let finalUrl = url;
            if (url && (url.includes('cinematerial.com') || url.includes('movieposters.com'))) {
                finalUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url.split('?')[0])}`;
            }
            el.crossOrigin = "anonymous";
            el.src = finalUrl; 
        }
    };

    // Check if the movie is already released to avoid 'TBA' labels
    const isReleased = activeData.release_date ? new Date(activeData.release_date) < new Date() : false;
    const defaultMeta = isReleased ? 'Live' : 'TBA';

    updateEl('predicted-movie-title', activeData.title);
    updateSrc('dyn-poster', activeData.poster);
    updateEl('dyn-year', activeData.year);
    updateEl('dyn-director', activeData.director || defaultMeta);
    updateEl('dyn-studio', activeData.studio || defaultMeta);
    updateEl('dyn-cast', activeData.cast || defaultMeta);

    // SYNC SHOWDOWN LEFT POSTER
    const showdownPoster1 = document.getElementById('showdown-poster-1');
    const showdownName1 = document.getElementById('showdown-name-1');
    if (showdownPoster1) showdownPoster1.src = activeData.poster;
    if (showdownName1) showdownName1.textContent = activeData.title;
    
    // Synopsis & Background Sync
    if (activeData.synopsis) updateEl('dyn-synopsis', activeData.synopsis);
    const heroBg = document.getElementById('hero-bg-blur');
    if (heroBg) {
        let bgUrl = activeData.poster;
        if (bgUrl && (bgUrl.includes('cinematerial.com') || bgUrl.includes('movieposters.com'))) {
            bgUrl = `https://images.weserv.nl/?url=${encodeURIComponent(bgUrl.split('?')[0])}`;
        }
        heroBg.style.backgroundImage = `url('${bgUrl}')`;
    }

    // --- 4. THE FASTAPI HANDSHAKE (syncAPIData) ---
    async function syncAPIData() {
        const pitchPayload = {
            title: activeData.title,
            tmdb_id: activeData.id,
            primary_genre: (activeData.genres && activeData.genres.length > 0) ? (Array.isArray(activeData.genres) ? activeData.genres[0] : activeData.genres) : "Action", 
            primary_studio: activeData.studio || "TBA",
            actor_1_name: (activeData.cast && activeData.cast !== 'TBA') ? activeData.cast.split(',')[0].trim() : "TBA",
            director_name: activeData.director || "TBA",
            is_franchise: activeData.title.toLowerCase().includes('part') || activeData.title.toLowerCase().includes('sequel') || false
        };

        try {
            const apiResult = await window.CineAPI.predict(pitchPayload);
            if (!apiResult) throw new Error("CineAPI.predict returned null, falling back to mock");
            
            if (apiResult) {
                window._lastApiResult = apiResult; // Store for badge and other consumers

                // Immediately update hash badge with real TMDB ID from API
                const hashEl = document.getElementById('prediction-hash');
                if (hashEl && apiResult.pitch_summary?.tmdb_id) {
                    hashEl.textContent = `#CS-${String(apiResult.pitch_summary.tmdb_id).padStart(6, '0')}`;
                }

                // 4A. Map Summary Stats
                const revM = (apiResult.financial_forecast.projected_revenue/1_000_000);
                const score = apiResult.acclaim_forecast.score;
                const signal = apiResult.financial_forecast.signal; // GREEN, RED, AMBER
                
                // --- DYNAMIC VERDICT LOGIC ---
                let verdictLabel = "Market Neutral";
                let verdictMeta = "Calculated from multi-vector trend analysis";

                if (signal === 'GREEN') {
                    if (score >= 8.0) { verdictLabel = "Global Mega-Hit"; verdictMeta = "Elite financial & critical breakout projected"; }
                    else if (score >= 7.0) { verdictLabel = "Commercial Success"; verdictMeta = "Strong theatrical legs with four-quadrant appeal"; }
                    else { verdictLabel = "Front-Loaded Hit"; verdictMeta = "Massive opening expected with rapid decay"; }
                } else if (signal === 'RED') {
                    if (score >= 8.0) { verdictLabel = "Cult Classic"; verdictMeta = "High critical praise vs challenging market physics"; }
                    else if (score >= 7.0) { verdictLabel = "VOD Specialist"; verdictMeta = "Ancillary revenue critical to recoupment"; }
                    else { verdictLabel = "Box Office Risk"; verdictMeta = "High market saturation & audience resistance"; }
                } else {
                    verdictLabel = "Moderate Performer"; verdictMeta = "Stable trajectory within genre benchmarks";
                }

                updateEl('dyn-verdict', verdictLabel);
                const verdictMetaEl = document.getElementById('dyn-verdict-meta');
                if (verdictMetaEl) verdictMetaEl.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> ${verdictMeta}`;

                updateEl('dyn-box-office', `$${revM.toFixed(0)}M`);
                updateEl('dyn-imdb', score.toFixed(1)); 
                updateEl('dyn-profit-target', `$${(apiResult.financial_forecast.break_even_point/1_000_000).toFixed(0)}M`);
                updateEl('dyn-est-budget', `Est. Budget: $${(apiResult.pitch_summary.estimated_budget_used/1_000_000).toFixed(0)}M`);

                // 4B. Map Right-Side Hero Metrics (Confidence & Sentiment)
                const confScore = apiResult.confidence_score || 85;
                updateEl('dyn-ai-score', Math.round(confScore));
                const gaugeFill = document.querySelector('.ai-gauge-fill');
                if (gaugeFill) gaugeFill.style.strokeDashoffset = 264 - (264 * (confScore / 100));

                const confLabel = document.getElementById('dyn-ai-confidence-label');
                if (confLabel) {
                    if (confScore >= 90) confLabel.textContent = "Very High Confidence";
                    else if (confScore >= 80) confLabel.textContent = "High Confidence";
                    else if (confScore >= 70) confLabel.textContent = "Moderate Confidence";
                    else if (confScore >= 50) confLabel.textContent = "Average Confidence";
                    else confLabel.textContent = "Low Confidence";
                }

                const sentScore = apiResult.acclaim_forecast.score || 7.5;
                updateEl('dyn-sentiment-score', sentScore.toFixed(1));
                const sentPointer = document.querySelector('.sentiment-pointer');
                if (sentPointer) sentPointer.style.left = `${(sentScore / 10) * 100}%`;

                // 4F. Update Social/Sentiment Chart Subtitles with API Source (Non-Destructive)
                let sourceText = apiResult.ai_insights?.market_signals?.source || "Live Data Feed";
                
                // Shorten the long YouTube/PSI string for UI tightness
                if (sourceText.includes("programmable search engine")) sourceText = "(Youtube/PSI)";
                else if (!sourceText.startsWith("(")) sourceText = `(${sourceText})`;

                const chartSubtitles = document.querySelectorAll('.chart-subtitle');
                chartSubtitles.forEach(sub => {
                    const originalText = sub.textContent.split(' | ')[0].trim();
                    if (originalText.includes('Platform Buzz') || originalText.includes('30-Day Trajectory')) {
                        sub.textContent = `${originalText} | ${sourceText}`;
                    }
                });

                // 4C. Map Verdicts & Enriched Meta
                const verdicts = apiResult.ai_insights.verdicts;
                const updateVerdict = (id, html) => { 
                    const el = document.getElementById(id); 
                    if (el && html && html.length > 30) el.innerHTML = `<i>${html}</i>`; 
                };
                if (verdicts.general) updateVerdict('verdict-general', verdicts.general);
                if (verdicts.finance) updateVerdict('verdict-finance', verdicts.finance);
                if (verdicts.critical) updateVerdict('verdict-critical', verdicts.critical);

                // 4D. Overwrite TBA with real API metadata (director, cast, studio)
                if (apiResult.pitch_summary.director_name && apiResult.pitch_summary.director_name !== 'TBA') 
                    updateEl('dyn-director', apiResult.pitch_summary.director_name);
                if (apiResult.pitch_summary.studio && apiResult.pitch_summary.studio !== 'TBA') 
                    updateEl('dyn-studio', apiResult.pitch_summary.studio);
                if (apiResult.pitch_summary.cast && apiResult.pitch_summary.cast.length > 0 && apiResult.pitch_summary.cast[0] !== 'TBA') 
                    updateEl('dyn-cast', apiResult.pitch_summary.cast.join(', '));

                // 4E. Wire Algorithm Benchmarks to the comps-grid
                // FIXED: Ensure benchmarks are NEVER vacant and show 4 categories: Actor, Director, Studio, Genre
                const movieTitle = (activeData.title || apiResult.pitch_summary?.title || "Project");
                updateEl('dyn-benchmark-title', `Model's Benchmarks for ${movieTitle}`);

                let benchmarks = apiResult.benchmark_cards || [];
                if (benchmarks.length === 0) {
                    const genre = (activeData.genres && activeData.genres.length > 0) ? (Array.isArray(activeData.genres) ? activeData.genres[0] : activeData.genres) : "Action";
                    const actor = (activeData.cast && activeData.cast !== 'TBA') ? activeData.cast.split(',')[0].trim() : "Star Power";
                    const director = (activeData.director && activeData.director !== 'TBA') ? activeData.director : "Robert Eggers";
                    const studio = (activeData.studio && activeData.studio !== 'TBA') ? activeData.studio : "A24";

                    // THE CINESCORE BENCHMARK BRAIN (Historical Metrics)
                    const baseMetrics = {
                        "Actor's Best": { title: actor === "Aaron Taylor-Johnson" ? "Bullet Train" : (actor.includes("Alcock") ? "The School for Good and Evil" : "Top Gun: Maverick"), type: "Actor's Best" },
                        "Director's Best": { title: director === "Robert Eggers" ? "The Northman" : "Get Out", type: "Director's Best" },
                        "Studio Best": { title: studio === "A24" ? "Hereditary" : (studio.includes("Warner") ? "The Batman" : "Oppenheimer"), type: "Studio Best" },
                        "Genre Best": { title: genre === "Horror" ? "Smile" : (genre === "Superhero" ? "Deadpool 3" : "John Wick: Chapter 4"), type: "Genre Best" }
                    };

                    const rawComps = [
                        { ...baseMetrics["Actor's Best"], budget: "$90M", opening: "$30M", gross: "$239M", roi: "2.6x" },
                        { ...baseMetrics["Director's Best"], budget: "$70M", opening: "$12M", gross: "$69M", roi: "1.0x" },
                        { ...baseMetrics["Studio Best"], budget: "$25M", opening: "$1M", gross: "$141M", roi: "5.6x" },
                        { ...baseMetrics["Genre Best"], budget: "$17M", opening: "$22M", gross: "$217M", roi: "12.7x" }
                    ];

                    // DYNAMIC POSTER DISCOVERY: Query TMDB for each benchmark title
                    benchmarks = await Promise.all(rawComps.map(async (c) => {
                        try {
                            const hits = await window.TMDB_API.searchMovies(c.title);
                            return {
                                ...c,
                                vectorType: c.type,
                                img: (hits && hits[0] && hits[0].poster_path) 
                                    ? window.TMDB_API.IMG_URL + hits[0].poster_path 
                                    : `https://placehold.co/400x600/111/FFF?text=${encodeURIComponent(c.title)}`
                            };
                        } catch (e) {
                            return { ...c, vectorType: c.type, img: `https://placehold.co/400x600/111/FFF?text=${encodeURIComponent(c.title)}` };
                        }
                    }));
                }
                
                window.historicalComps = benchmarks;
                if (typeof renderPredictionGrids === 'function') renderPredictionGrids();

                // 4F. INITIALIZE SHOWDOWN ARENA (Slot 1: Current Movie | Slot 2: Reset to Placeholder)
                const predictedMovieComp = {
                    title: apiResult.pitch_summary.title,
                    poster: activeData.poster,
                    totalRun: Math.round(apiResult.financial_forecast.projected_revenue / 1000000),
                    openingWknd: Math.round(apiResult.financial_forecast.projected_revenue * 0.22 / 1000000),
                    sentiment: Math.round(apiResult.acclaim_forecast.score * 10),
                    momentum: apiResult.acclaim_forecast.score
                };
                window.updateShowdownOpponent(1, predictedMovieComp);

                // Reset Slot 2 to Placeholder (Clean State)
                const poster2 = document.getElementById('showdown-poster-2');
                const name2 = document.getElementById('showdown-name-2');
                const input2 = document.getElementById('opponent-search-input');
                
                if (poster2) {
                    poster2.src = 'https://placehold.co/400x600/333/FFF?text=Opponent';
                    poster2.style.opacity = '0.6';
                }
                if (name2) name2.textContent = 'Choose Opponent';
                if (input2) input2.value = '';
                
                // Clear Slot 2 Metrics
                ['total', 'open', 'sent', 'hype'].forEach(m => {
                    const el = document.getElementById(`sd-${m}-2`);
                    if (el) el.textContent = 'TBD';
                });

                // --- 5. CHART & COMP SYSTEM (Preserved per Firewall) ---
                if (typeof window.renderDynamicCharts === 'function') {
                    // Inject Ghost Data if missing to prevent legacy warnings
                    if (!apiResult.sentimentLine) apiResult.sentimentLine = { pos: [60, 70, 75, 80, 85], neg: [10, 8, 7, 6, 5] };
                    if (!apiResult.sonar) apiResult.sonar = [80, 75, 90, 85, 80];
                    
                    // FIXED: Pass raw values for proper scaling in funnel chart
                    const estBudget = apiResult.pitch_summary.estimated_budget_used || 50000000;
                    if (!apiResult.funnel) {
                        apiResult.funnel = [
                            estBudget, 
                            estBudget * 0.8, // P&A Est
                            estBudget * 2.5, // Break-Even Est
                            apiResult.financial_forecast.projected_revenue
                        ];
                    }
                    if (!apiResult.trajectory) apiResult.trajectory = [30, 50, 70, 85, 95, 100];
                    
                    window.renderDynamicCharts(apiResult, 'base');
                }
            }
        } catch (err) {
            console.error("Hydration Handshake Failed, injecting mock metrics:", err);
            const activeDataBoxOffice = activeData.boxOffice ? parseFloat(activeData.boxOffice.replace(/[^0-9.]/g, '')) * (activeData.boxOffice.includes('B') ? 1000000000 : 1000000) : 1200000000;
            const activeDataSentiment = activeData.sentimentScore ? parseFloat(activeData.sentimentScore) : 8.5;
            
            const mockApiResult = {
                pitch_summary: pitchPayload,
                financial_forecast: { projected_revenue: activeDataBoxOffice },
                acclaim_forecast: { score: activeDataSentiment },
                benchmark_cards: [],
                sentimentLine: { pos: [60, 70, 75, 80, 85], neg: [10, 8, 7, 6, 5] },
                sonar: [80, 75, 90, 85, 80]
            };
            window._lastApiResult = mockApiResult;
            
            const hashEl = document.getElementById('prediction-hash');
            if (hashEl) hashEl.textContent = `#CS-MOCK`;
            
            const revM = (mockApiResult.financial_forecast.projected_revenue/1_000_000);
            const verdictStr = revM >= 1000 ? "Billion Dollar Club" : (revM >= 600 ? "Projected Mega-Hit" : (revM >= 300 ? "Strong Performer" : "Safe Bet"));
            
            const verdicts = {
                general: verdictStr,
                finance: revM >= 1000 ? "Excellent ROI Potential" : "Positive Trajectory",
                critical: mockApiResult.acclaim_forecast.score >= 8.0 ? "Audience Darling" : "Mixed Reception"
            };
            const updateVerdict = (id, html) => { 
                const el = document.getElementById(id); 
                if (el && html && html.length > 30) el.innerHTML = `<i>${html}</i>`; 
            };
            updateVerdict('verdict-general', verdicts.general);
            updateVerdict('verdict-finance', verdicts.finance);
            updateVerdict('verdict-critical', verdicts.critical);
            
            updateEl('dyn-benchmark-title', `Model's Benchmarks for ${activeData.title}`);
            
            const genre = (activeData.genres && activeData.genres.length > 0) ? (Array.isArray(activeData.genres) ? activeData.genres[0] : activeData.genres) : "Action";
            const actor = (activeData.cast && activeData.cast !== 'TBA') ? activeData.cast.split(',')[0].trim() : "Star Power";
            const director = (activeData.director && activeData.director !== 'TBA') ? activeData.director : "Robert Eggers";
            const studio = (activeData.studio && activeData.studio !== 'TBA') ? activeData.studio : "A24";

            const baseMetrics = {
                "Actor's Best": { title: actor === "Aaron Taylor-Johnson" ? "Bullet Train" : (actor.includes("Alcock") ? "The School for Good and Evil" : "Top Gun: Maverick"), type: "Actor's Best" },
                "Director's Best": { title: director === "Robert Eggers" ? "The Northman" : "Get Out", type: "Director's Best" },
                "Studio Best": { title: studio === "A24" ? "Hereditary" : (studio.includes("Warner") ? "The Batman" : "Oppenheimer"), type: "Studio Best" },
                "Genre Best": { title: genre === "Horror" ? "Smile" : (genre === "Superhero" ? "Deadpool 3" : "John Wick: Chapter 4"), type: "Genre Best" }
            };

            const rawComps = [
                { ...baseMetrics["Actor's Best"], budget: "$90M", opening: "$30M", gross: "$239M", roi: "2.6x", img: `https://placehold.co/400x600/111/FFF?text=${encodeURIComponent(baseMetrics["Actor's Best"].title)}`, vectorType: "Actor's Best" },
                { ...baseMetrics["Director's Best"], budget: "$70M", opening: "$12M", gross: "$69M", roi: "1.0x", img: `https://placehold.co/400x600/111/FFF?text=${encodeURIComponent(baseMetrics["Director's Best"].title)}`, vectorType: "Director's Best" },
                { ...baseMetrics["Studio Best"], budget: "$25M", opening: "$1M", gross: "$141M", roi: "5.6x", img: `https://placehold.co/400x600/111/FFF?text=${encodeURIComponent(baseMetrics["Studio Best"].title)}`, vectorType: "Studio Best" },
                { ...baseMetrics["Genre Best"], budget: "$17M", opening: "$22M", gross: "$217M", roi: "12.7x", img: `https://placehold.co/400x600/111/FFF?text=${encodeURIComponent(baseMetrics["Genre Best"].title)}`, vectorType: "Genre Best" }
            ];
            
            window.historicalComps = rawComps;
            if (typeof renderPredictionGrids === 'function') renderPredictionGrids();
            
            const predictedMovieComp = {
                title: activeData.title,
                poster: activeData.poster,
                totalRun: Math.round(activeDataBoxOffice / 1000000),
                openingWknd: Math.round(activeDataBoxOffice * 0.22 / 1000000),
                sentiment: Math.round(activeDataSentiment * 10),
                momentum: activeDataSentiment
            };
            window.updateShowdownOpponent(1, predictedMovieComp);
            
            if (typeof window.renderDynamicCharts === 'function') {
                const estBudget = 50000000;
                mockApiResult.funnel = [estBudget, estBudget * 0.8, estBudget * 2.5, activeDataBoxOffice];
                mockApiResult.trajectory = [30, 50, 70, 85, 95, 100];
                window.renderDynamicCharts(mockApiResult, 'base');
            }
        }
    }

    syncAPIData();
    const chartsWrapper = document.querySelector('.content-slider');
    const paywall = document.getElementById('paywall-overlay');

    if (!isLoggedIn && chartsWrapper && paywall) {
        chartsWrapper.classList.add('content-blurred');
        paywall.classList.remove('hidden');
        paywall.style.opacity = '1';
    } else if (chartsWrapper && paywall) {
        chartsWrapper.classList.remove('content-blurred');
        paywall.classList.add('hidden');
    }

    if (shouldAnimate) window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   THE AUTHENTICATION SIMULATOR (Paywall Unlocker)
   ============================================================ */
window.unlockDashboard = function (isNewUser = false) {
    console.log("Authentication successful. Unlocking dashboard...");

    // 1. Save login state to browser memory
    localStorage.setItem('cinescore_auth', 'true');
    sessionStorage.setItem('cineScore_isLoggedIn', 'true');

    // THE FIX: Save whether they are fresh or returning
    if (isNewUser) localStorage.setItem('cinescore_fresh_signup', 'true');
    else localStorage.setItem('cinescore_fresh_signup', 'false');

    // 2. Hide any open Auth Modals
    document.querySelectorAll('.form').forEach(modal => modal.style.display = 'none');

    // 3. Smoothly dissolve the Paywall & Blur
    const chartsWrapper = document.querySelector('.content-slider');
    const paywall = document.getElementById('paywall-overlay');

    if (chartsWrapper) {
        chartsWrapper.classList.remove('content-blurred'); // Removes the blur CSS
    }

    if (paywall) {
        paywall.style.transition = "opacity 0.4s ease";
        paywall.style.opacity = '0';
        setTimeout(() => paywall.classList.add('hidden'), 400); // Wait for fade
    }

    // 4. Update Navbar UI
    const authGroup = document.getElementById('auth-buttons');
    const userMenu = document.getElementById('user-menu-wrapper');
    if (authGroup) authGroup.style.display = 'none';
    if (userMenu) userMenu.style.display = 'flex';

    // 5. Reload the page to inject the clean data (Simplest way to remove the hero blur)
    setTimeout(() => window.location.reload(), 600);
};

/* ============================================================
PREDICTION UI: STATE MACHINE
============================================================ */
document.addEventListener("DOMContentLoaded", () => {

    // UI Elements
    const badge = document.getElementById('state-badge');
    const heading = document.getElementById('blank-slate-heading');
    const subtext = document.getElementById('blank-slate-sub');
    const ctaGroup = document.getElementById('unlogged-cta-group');
    const posters = document.getElementById('state-trending-posters');
    const tooltip = document.getElementById('search-onboarding-tooltip');

    // Abort if not on Prediction page
    if (!heading) return;

    // --- USER SESSION STATE (single source of truth) ---
    const isUserLoggedIn = localStorage.getItem('cinescore_auth') === 'true';

    // THE FIX: Read the actual dynamic state instead of hardcoded 'false'
    const isFreshSignup = localStorage.getItem('cinescore_fresh_signup') === 'true';
    const fullName = localStorage.getItem('cinescore_user_name') || "Director";
    const userName = fullName.split(' ')[0];

    if (!isUserLoggedIn) {
        // STATE 1: UNLOGGED NAV-LINK LANDING
        badge.innerHTML = `Predictive Precision <i class="fa-solid fa-bullseye" style="margin-right: 6px;"></i>`;

        // THE FIX: Changed to innerHTML and wrapped "Cinematic Success."
        heading.innerHTML = `Predicting <span class="text-accent">Cinematic Success.</span>`;

        subtext.innerText = "Where cinematic passion meets predictive precision. Search for an upcoming film to receive our AI Box Office forecast.";

        ctaGroup.style.display = 'flex';
        posters.style.display = 'none';
        tooltip.style.display = 'none';

    } else if (isUserLoggedIn && isFreshSignup) {
        // STATE 2: THE FRESH ONBOARD
        badge.innerHTML = `The Production Room <i class="fa-solid fa-bolt" style="margin-right: 6px;"></i>`;

        // THE FIX: Changed to innerHTML and wrapped "Verdict."
        heading.innerHTML = `Where Movie Meets Its <span class="text-accent">Verdict.</span>`;

        subtext.innerText = "Got any movie in mind? Try our new ML Model to see its forecast.";

        ctaGroup.style.display = 'none'; // Hide login buttons
        posters.style.display = 'block'; // Show Posters to help them
        tooltip.style.display = 'flex';  // Show the guiding tooltip

    } else if (isUserLoggedIn && !isFreshSignup) {
        // STATE 3: THE RETURNING DIRECTOR
        badge.innerHTML = `The Director's Chair <i class="fa-solid fa-chair" style="margin-right: 6px;"></i>`;

        // THE FIX: Changed to innerHTML and wrapped the dynamic userName
        heading.innerHTML = `Welcome Back, <span class="text-accent">${userName}.</span>`;

        subtext.innerText = "Which movie are we analyzing today? Checking on the latest Avenger's member or analyzing a new standalone? Ready when you are.";

        ctaGroup.style.display = 'none'; // Hide login buttons
        posters.style.display = 'block'; // Show Posters
        tooltip.style.display = 'none';  // Hide tooltip, they know what to do
    }
});

// ==========================================
// THE UNIVERSAL DAILY ROTATION ENGINE (V2.0)
// ==========================================
async function initUniversalDailyRotations() {
    let movies = [];
    try {
        const upcoming = await window.TMDB_API.getUpcoming();
        if (upcoming && upcoming.length > 0) {
            const today = new Date();
            const tenDaysAgo = new Date(today.getTime() - (10 * 24 * 60 * 60 * 1000));
            
            movies = upcoming.filter(m => {
                const title = (m.title || "").toLowerCase();
                const releaseDate = m.release_date ? new Date(m.release_date) : null;
                
                // STRICT FILTER: Only if unreleased or released within 10 day buffer
                const isUpcomingOrRecent = releaseDate && releaseDate >= tenDaysAgo;
                const isNotJunk = !title.includes('tour') && !title.includes('concert') && !title.includes('documentary');
                
                return isUpcomingOrRecent && isNotJunk;
            });
        }
    } catch (e) { console.error("Rotations API Fail:", e); }

    // DYNAMIC FALLBACK: If TMDB upcoming feed fails, fetch specific major strictly upcoming titles
    if (movies.length === 0) {
        console.log("TMDB Rotations empty, fetching specific major strictly unreleased titles.");
        const fallbackTitles = ["Spider-Man 4", "Superman", "Minecraft Movie", "Jurassic World Rebirth", "Avatar: Fire and Ash"];
        for (const title of fallbackTitles) {
            try {
                const hits = await window.TMDB_API.searchMovies(title);
                if (hits && hits[0]) {
                    const releaseDate = hits[0].release_date;
                    if (releaseDate && new Date(releaseDate) > new Date()) {
                        movies.push(hits[0]);
                    }
                }
            } catch (err) { console.warn(`Fallback fetch failed for ${title}`); }
        }
        if (movies.length === 0) {
            movies = (window.mockMovies || []).filter(m => m.isTrending).slice(0, 8);
        }
    }

    if (movies.length === 0) return;

    // THE FIX: Sort by popularity to ensure major hits are shown
    const sorted = movies.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    // 1. BLANK SLATE POSTERS
    const blankSlateTrack = document.getElementById('blank-slate-trending-track');
    if (blankSlateTrack) {
        blankSlateTrack.innerHTML = sorted.slice(0, 3).map(m => {
            const imgUrl = m.poster_path ? `${window.TMDB_API.IMG_URL}${m.poster_path}` : (m.poster || 'https://placehold.co/140x210/111/FFF?text=Poster');
            const releaseYear = m.release_date ? m.release_date.split('-')[0] : (m.year || '2026');
            
            // The JSON.stringify needs to be safe for HTML attributes
            const activeDataStr = JSON.stringify({
                title: m.title,
                poster: imgUrl,
                year: releaseYear,
                release_date: m.release_date,
                synopsis: m.overview || m.synopsis || '',
                id: m.id || 0,
                genres: m.genre_ids ? m.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean) : (m.genres || [])
            }).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

            const isLocked = m.release_date ? new Date(m.release_date) < new Date(new Date().getTime() - (10 * 24 * 60 * 60 * 1000)) : false;

            const genreList = Array.isArray(m.genres) ? m.genres.slice(0, 2).join('/') : (m.genre_ids ? m.genre_ids.slice(0,2).map(id=>GENRE_MAP[id]).filter(Boolean).join('/') : 'Action');
            
            let displayDate = 'Expected 2026';
            if (m.release_date) {
                const d = new Date(m.release_date);
                displayDate = `Expected ${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
            } else if (m.year) {
                displayDate = `Expected ${m.year}`;
            }

            return `
                <div class="poster-card" style="width: 140px; cursor: pointer; border-radius: 8px; overflow: hidden; position: relative; box-shadow: 0 10px 20px rgba(0,0,0,0.5); transition: transform 0.2s;" 
                     onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'"
                     onclick='if (${isLocked}) { window.showCustomAlert("error", "Prediction Locked", "This movie is already released."); return; } const activeData = ${activeDataStr}; localStorage.setItem("cinescore_active_movie_data", JSON.stringify(activeData)); if (typeof window.executePredictionBridge === "function") window.executePredictionBridge("${m.title.replace(/'/g, "\\'")}");'>
                    <img src="${imgUrl}" alt="${m.title}" style="width: 100%; height: 100%; object-fit: cover;">
                    ${isLocked ? '<div style="position:absolute; top:8px; right:8px; background:rgba(244,63,94,0.9); color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:800;"><i class="fa-solid fa-lock"></i></div>' : ''}
                    <div class="poster-overlay stack" style="align-items: center; justify-content: center; text-align: center; padding: 12px; background: rgba(11, 25, 44, 0.9);">
                        <h4 style="color: #fff; margin: 0 0 6px 0; font-size: 14px; line-height: 1.2;">${m.title}</h4>
                        <span style="font-size: 10px; color: var(--color-warning); font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 2px;">${displayDate}</span>
                        <span style="font-size: 9px; color: var(--color-tertiary); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">${genreList}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    const trendingGrid = document.getElementById('trending-grid');
    if (trendingGrid) {
        trendingGrid.innerHTML = sorted.slice(3, 7).map(m => {
            const imgUrl = m.poster_path ? `${window.TMDB_API.IMG_URL}${m.poster_path}` : (m.poster || 'https://placehold.co/200x300/111/FFF?text=Poster');
            const releaseYear = m.release_date ? m.release_date.split('-')[0] : (m.year || '2026');
            return `
                <div class="poster-card" style="cursor: pointer;" onclick="const activeData = {title: '${m.title.replace(/'/g, "\\'")}', poster: '${imgUrl}', year: '${releaseYear}', release_date: '${m.release_date || ''}', synopsis: '${(m.overview || m.synopsis || '').replace(/'/g, "\\'")}', id: ${m.id || 0}}; localStorage.setItem('cinescore_active_movie_data', JSON.stringify(activeData)); if(typeof executePredictionBridge === 'function') { executePredictionBridge('${m.title.replace(/'/g, "\\'")}'); } else { triggerPredictionState('${m.title.replace(/'/g, "\\'")}'); }">
                    <img src="${imgUrl}" alt="${m.title}">
                    <div class="poster-overlay" style="align-items: center; justify-content: center; text-align: center;">
                        <span style="font-size: 11px; color: var(--color-warning); font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">Trending Now</span>
                        <h4 style="color: #fff; margin: 0 0 16px 0; font-size: 18px;">${m.title}</h4>
                        <button class="hero-btn" style="padding: 10px 20px; font-size: 13px; color: #fff !important;">Predict Now <i class="fa-solid fa-bolt" style="margin-left: 6px;"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 3. HOME SCREEN FEATURED CARDS (Strict Ranking + Meta)
    const featuredCards = document.querySelectorAll('.featured-movie-card');
    if (featuredCards.length > 0) {
        // Use sorted list and SORT DESCENDING for 1, 2, 3 ranking feel
        const scoredMovies = sorted.slice(0, 3).map(m => ({
            ...m,
            score: 88 + (m.title.length % 11) // Generates 88-98%
        })).sort((a, b) => b.score - a.score);

        featuredCards.forEach((card, i) => {
            const m = scoredMovies[i];
            if (m) {
                const img = card.querySelector('img');
                const title = card.querySelector('.movie-title-featured') || card.querySelector('h3');
                const studioEl = card.querySelector('.movie-studio-featured') || card.querySelector('p');
                const genresContainer = card.querySelector('.movie-genres-featured') || card.querySelector('.stack.row');
                
                // METADATA SYNC (Release Date + Genres)
                const finalPoster = m.poster_path ? `${window.TMDB_API.IMG_URL}${m.poster_path}` : (m.poster || 'https://placehold.co/400x600/111/FFF?text=Film');
                if (img) img.src = finalPoster;
                if (title) title.textContent = m.title;
                
                // Use Release Date instead of Studio for high-fidelity upcoming info
                if (studioEl) {
                    const date = m.release_date ? new Date(m.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (m.year || '2026');
                    studioEl.textContent = `Release: ${date}`;
                }

                // GENRE SYNC
                if (genresContainer) {
                    const genreList = (m.genre_ids && m.genre_ids.length > 0) 
                        ? m.genre_ids.slice(0, 2).map(id => GENRE_MAP[id] || 'Cinema') 
                        : (m.genres ? (Array.isArray(m.genres) ? m.genres.slice(0,2) : m.genres.split('/')) : ['Cinema', 'Theatrical']);
                    
                    genresContainer.innerHTML = genreList.map(g => `
                        <span class="genre-tag" style="font-size: 10px; padding: 4px 10px; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; color: var(--color-secondary); background: rgba(255,255,255,0.03);">${g.trim()}</span>
                    `).join('');
                }
                
                const percentageEl = Array.from(card.querySelectorAll('*')).find(el => el.textContent.includes('%') && el.children.length === 0);
                if (percentageEl) percentageEl.textContent = m.score + '%';

                card.onclick = () => {
                   const genreList = (m.genre_ids && m.genre_ids.length > 0) 
                        ? m.genre_ids.map(id => GENRE_MAP[id] || 'Cinema') 
                        : (m.genres ? (Array.isArray(m.genres) ? m.genres : m.genres.split('/')) : ['Cinema', 'Blockbuster']);
                   
                   const activeData = {
                       title: m.title, 
                       poster: finalPoster, 
                       year: m.release_date ? m.release_date.split('-')[0] : (m.year || '2026'), 
                       synopsis: m.overview || m.synopsis || '', 
                       id: m.id || 0,
                       director: m.director || 'TBA',
                       cast: m.cast || 'TBA',
                       studio: m.studio || 'TBA',
                       aiScore: m.aiScore || m.score || 92,
                       sentimentScore: m.sentimentScore || '8.5',
                       genres: genreList
                   };
                   localStorage.setItem('cinescore_active_movie_data', JSON.stringify(activeData));
                   triggerPredictionState(m.title);
                };
            }
        });
    }
}

// Fire the engine on load!
document.addEventListener("DOMContentLoaded", () => {
    initUniversalDailyRotations();
    // THE FIX: Ensure Hype Meter is explicitly fired on load
    if (typeof initLiveHypeMeter === 'function') {
        initLiveHypeMeter();
    }
});

// ============================================================
// PHASE 4.5: THE NEURAL SANDBOX (Threshold Physics V2.0)
// ============================================================
function initSliderMathEngine() {
    const container = document.getElementById('algo-sliders-container');
    const finalScoreEl = document.getElementById('algo-final-score');
    const needleEl = document.getElementById('gauge-needle');
    if (!container || !needleEl) return;

    // THE FIX: Define the absolute minimum importance any factor can have (10%)
    const MIN_WEIGHT = 0.10;

    // Initial State (Must equal 1.0)
    // 1. Add Icons to Metrics
    const metrics = [
        { id: 'star', name: 'Star Power', icon: 'fa-star', baseScore: 75, weight: 0.25, color: '#0055FF' },
        { id: 'marketing', name: 'Marketing', icon: 'fa-bullhorn', baseScore: 80, weight: 0.25, color: '#8B5CF6' },
        { id: 'ip', name: 'IP Strength', icon: 'fa-crown', baseScore: 90, weight: 0.30, color: '#10B981' },
        { id: 'social', name: 'Social Buzz', icon: 'fa-comments', baseScore: 65, weight: 0.20, color: '#F59E0B' }
    ];

    // The Maximum a single slider can reach if all others are at minimum
    const MAX_WEIGHT = 1.0 - (MIN_WEIGHT * (metrics.length - 1));

    // 1. UPDATED SLIDER RENDER (Icons in Labels)
    function renderSliders() {
        container.innerHTML = metrics.map((m, index) => `
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700;">
                <span style="color: var(--color-secondary);"><i class="fa-solid ${m.icon}" style="color: ${m.color}; margin-right: 4px;"></i>${m.name}</span>
                <span id="val-${m.id}">${(m.weight * 100).toFixed(0)}%</span>
            </div>
            <input type="range" min="10" max="70" value="${m.weight * 100}" class="algo-slider" data-index="${index}">
        </div>
    `).join('');

        document.querySelectorAll('.algo-slider').forEach(slider => {
            slider.addEventListener('input', (e) => handleWeightChange(parseInt(e.target.dataset.index), parseFloat(e.target.value) / 100));
        });
    }

    // THE FIX: Proportional Stealing WITH Hard Floors
    function handleWeightChange(changedIndex, newVal) {
        let oldVal = metrics[changedIndex].weight;

        // Safety Clamp
        if (newVal > MAX_WEIGHT) newVal = MAX_WEIGHT;
        if (newVal < MIN_WEIGHT) newVal = MIN_WEIGHT;

        let delta = newVal - oldVal;
        metrics[changedIndex].weight = newVal;

        let others = metrics.filter((m, i) => i !== changedIndex);

        if (delta > 0) {
            // Stealing weight from others (they decrease)
            let availableToSteal = others.reduce((sum, m) => sum + (m.weight - MIN_WEIGHT), 0);
            others.forEach(m => {
                if (availableToSteal > 0) {
                    let stealAmount = delta * ((m.weight - MIN_WEIGHT) / availableToSteal);
                    m.weight -= stealAmount;
                }
            });
        } else {
            // Giving weight back to others (they increase)
            let maxPossibleGain = others.reduce((sum, m) => sum + (MAX_WEIGHT - m.weight), 0);
            others.forEach(m => {
                if (maxPossibleGain > 0) {
                    let giveAmount = Math.abs(delta) * ((MAX_WEIGHT - m.weight) / maxPossibleGain);
                    m.weight += giveAmount;
                }
            });
        }
        updateUI();
    }

    // 3. Fix Track Gradient in updateUI()
    function updateUI() {
        let finalScore = 0;
        metrics.forEach(m => {
            m.weight = Math.round(m.weight * 1000) / 1000;
            finalScore += m.baseScore * m.weight;
            const sliderEl = document.querySelector(`.algo-slider[data-index="${metrics.indexOf(m)}"]`);
            const textEl = document.getElementById(`val-${m.id}`);
            if (sliderEl && textEl) {
                const valPercent = m.weight * 100;
                sliderEl.value = valPercent;
                textEl.textContent = `${valPercent.toFixed(0)}%`;

                let trackColor = 'var(--color-success)';
                if (valPercent <= 10) trackColor = 'var(--color-warning)';
                else if (valPercent <= 35) trackColor = '#F59E0B';
                else if (valPercent <= 60) trackColor = 'var(--color-accent)';

                // THE FIX: Only inject CSS variables! No more direct background styles.
                // Subtracting 10 from valPercent because your sliders MIN is 10, MAX is 70!
                // We need to map 10-70 to 0%-100% for the visual fill
                const visualFillPercent = ((valPercent - 10) / 60) * 100;

                sliderEl.style.setProperty('--fill-percent', visualFillPercent + '%');
                sliderEl.style.setProperty('--track-color', trackColor);
            }
        });

        // ... (Keep your needle rotation logic exactly the same below this line) ...

        finalScore = Math.round(finalScore);
        finalScoreEl.textContent = finalScore;

        const rotationAngle = (finalScore / 100) * 180 - 90;
        needleEl.style.transform = `rotate(${rotationAngle}deg)`;

        if (finalScore >= 80) finalScoreEl.style.color = "var(--color-success)";
        else if (finalScore >= 50) finalScoreEl.style.color = "var(--color-warning)";
        else finalScoreEl.style.color = "var(--color-danger)";
    }

    renderSliders();
    setTimeout(updateUI, 100);
}

// ============================================================
// PHASE 4.6: SHOWDOWN SEARCH ENGINE (UPGRADED)
// ============================================================
function initShowdownSearch() {
    const input = document.getElementById('opponent-search-input');
    const resultsBox = document.getElementById('opponent-search-dropdown');
    if (!input || !resultsBox) return;

    // THE FIX: Hook up universal keyboard navigation!
    if (typeof attachKeyboardNav === 'function') {
        attachKeyboardNav(input, resultsBox);
    }

    const performShowdownSearch = async (query) => {
        const activeMovieStr = localStorage.getItem('cinescore_active_movie_data');
        const activeTitle = activeMovieStr ? JSON.parse(activeMovieStr).title : '';
        const today = new Date();

        let tmdbMatches = [];
        try {
            const tmdbRes = await window.TMDB_API.searchMovies(query);
            if (tmdbRes) {
                tmdbMatches = tmdbRes.filter(m => {
                    if (m.title.toLowerCase() === activeTitle.toLowerCase()) return false;
                    return !!m.release_date;
                });
            }
        } catch(e) {}

        const mockMatches = (window.mockMovies || []).filter(m => 
            m.title.toLowerCase().includes(query.toLowerCase()) && 
            m.title.toLowerCase() !== activeTitle.toLowerCase()
        );

        const combined = [...mockMatches];
        tmdbMatches.forEach(t => {
            if (!combined.some(c => c.title.toLowerCase() === t.title.toLowerCase())) combined.push(t);
        });

        // Stale Data Check
        if (input.value.trim().toLowerCase() !== query.toLowerCase()) return;

        if (combined.length > 0) {
             resultsBox.innerHTML = combined.slice(0, 5).map(m => {
                const year = m.release_date ? m.release_date.split('-')[0] : (m.year || 'TBA');
                const genresArr = m.genre_ids ? m.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean) : (Array.isArray(m.genres) ? m.genres : (m.genres ? m.genres.split(/[\/,]/).map(g=>g.trim()) : []));
                const genresStr = genresArr.length > 0 ? genresArr.slice(0,2).join(' / ') : 'Action';
                const img = m.poster_path ? `${window.TMDB_API.IMG_URL}${m.poster_path}` : (m.poster || 'https://placehold.co/100x150?text=Poster');
                
                return `
                <li class="search-item" style="display: flex; align-items: center; gap: 12px; cursor: pointer; text-align: left;" onclick="selectShowdownOpponent('${m.title.replace(/'/g, "\\'")}', '${img}', '${year}', ${!!m.release_date})">
                    <img src="${img}" style="width: 32px; height: 48px; border-radius: 4px; object-fit: cover;">
                    <div style="flex: 1;">
                        <strong style="font-size: 13px;">${m.title}</strong><br>
                        <small style="font-size: 10px; color: var(--color-secondary); opacity: 0.8;">${year} &nbsp;·&nbsp; ${genresStr}</small>
                    </div>
                    <i class="fa-solid fa-hand-fist search-right-icon" style="font-size:18px;opacity:0.35;flex-shrink:0;margin-left:10px;color:var(--color-accent);"></i>
                </li>
                `;
             }).join('');
             resultsBox.style.display = 'block';
        } else {
            resultsBox.innerHTML = '<li class="search-item" style="text-align:center; opacity:0.5;">No Valid Opponents</li>';
            resultsBox.style.display = 'block';
        }
    };

    const showdownClearBtn = document.getElementById('showdown-search-clear');
    if (showdownClearBtn) {
        showdownClearBtn.addEventListener('click', () => {
            input.value = '';
            showdownClearBtn.style.display = 'none';
            resultsBox.style.display = 'none';
            input.focus();
        });
    }

    let showdownSearchTimeout;
    input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        const query = val.toLowerCase();
        clearTimeout(showdownSearchTimeout);

        if (showdownClearBtn) showdownClearBtn.style.display = val.length > 0 ? 'block' : 'none';

        if (val.length === 1) {
            resultsBox.innerHTML = '<li style="padding:16px;text-align:center;font-size:12px;opacity:0.6;color:var(--color-secondary);">Type at least 2 characters to search...</li>';
            resultsBox.style.display = 'block';
            return;
        }
        if (val.length < 1) {
            resultsBox.style.display = 'none';
            return;
        }

        // 1. Instant UI Feedback (Zero Latency)
        resultsBox.innerHTML = `<li class="search-item" style="pointer-events: none; opacity: 0.8; text-align: center;"><i class="fa-solid fa-circle-notch fa-spin"></i> Finding Opponent...</li>`;
        resultsBox.style.display = 'block';

        // 2. Debounced Search Call
        showdownSearchTimeout = setTimeout(async () => {
            // 3. Prevent Race Conditions (Stale Data Check)
            if (input.value.trim().toLowerCase() !== query) return;

            performShowdownSearch(query);
        }, 400);
    });

    // --- THE SHOWDOWN ARENA HYDRATOR ---
    window.updateShowdownOpponent = function (slot, dataOrTitle, poster, year) {
        const isObject = typeof dataOrTitle === 'object';
        const title = isObject ? dataOrTitle.title : dataOrTitle;
        const img = isObject ? (dataOrTitle.poster || poster) : poster;

        const prefix = `showdown-`;
        const posterEl = document.getElementById(`${prefix}poster-${slot}`);
        const nameEl = document.getElementById(`${prefix}name-${slot}`);

        if (posterEl) {
            posterEl.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
            posterEl.style.opacity = '0';
            setTimeout(() => {
                posterEl.src = img || 'https://placehold.co/400x600/333/FFF?text=No+Poster';
                posterEl.style.opacity = '1';
            }, 300);
        }

        if (nameEl) {
            nameEl.style.opacity = '0';
            setTimeout(() => {
                nameEl.textContent = title;
                nameEl.style.opacity = '1';
            }, 300);
        }

        // --- METRIC HANDSHAKE ---
        const metrics = {
            total: isObject ? (dataOrTitle.totalRun || 500) : 0,
            opening: isObject ? (dataOrTitle.openingWknd || 100) : 0,
            sentiment: isObject ? (dataOrTitle.sentiment || 85) : 0,
            hype: isObject ? (dataOrTitle.momentum || 8.5) : 0
        };

        if (!isObject || !dataOrTitle.isReleased) {
            const seed = title.length;
            metrics.total = 200 + (seed * 25) + (Math.random() * 100);
            metrics.opening = metrics.total * 0.22;
            metrics.sentiment = 75 + (seed % 15);
            metrics.hype = 7.0 + (seed % 20) / 10;
        } else {
            // RELEASED MOVIE: Data should come from reliable source (TMDB/Web)
            // For now, since we don't have a 2nd API call here, we simulate "reliable" public data
            const seed = title.length;
            metrics.total = 400 + (seed * 30); 
            metrics.opening = metrics.total * 0.15;
            metrics.sentiment = 80 + (seed % 10);
            metrics.hype = 8.0 + (seed % 10) / 10;
        }

        const totalEl = document.getElementById(`sd-total-${slot}`);
        const openEl = document.getElementById(`sd-open-${slot}`);
        const sentEl = document.getElementById(`sd-sent-${slot}`);
        const hypeEl = document.getElementById(`sd-hype-${slot}`);

        if (totalEl) totalEl.textContent = `$${Math.round(metrics.total)}M`;
        if (openEl) openEl.textContent = `$${Math.round(metrics.opening)}M`;
        if (sentEl) sentEl.textContent = `${Math.round(metrics.sentiment)}%`;
        if (hypeEl) hypeEl.textContent = metrics.hype.toFixed(1);

        if (slot === 2) {
            const input = document.getElementById('opponent-search-input');
            if (input) input.value = title;
        }
    };

    window.selectShowdownOpponent = function (title, poster, year, isReleased) {
        window.updateShowdownOpponent(2, {title, poster, year, isReleased});
        const dropdown = document.getElementById('opponent-search-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    };
}

// Add to your Master Initializer!
document.addEventListener("DOMContentLoaded", initShowdownSearch);

// ============================================================
// 17. INLINE SPARKLINE ENGINE (LIHO Strategy)
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    const cards = document.querySelectorAll('.metric-card-wrapper .metric-content');
    
    // Abstract geometric paths mimicking trendlines
    const dataSets = [
        '0,25 5,20 10,22 15,10 20,12 25,2', // High spike
        '0,15 5,22 10,18 15,12 20,4 25,2',  // Smooth climb
        '0,10 5,12 10,8 15,4 20,6 25,2',   // Stable
        '0,20 5,22 10,15 15,8 20,4 25,0'   // Aggressive climb
    ];
    
    // Mapped to match the 4 cards (Accent, Success, Rating, Alt)
    const colors = ['var(--color-accent)', 'var(--color-success)', '#F5C518', '#8B5CF6'];

    cards.forEach((card, index) => {
        // Prevent duplicate appending
        if (card.querySelector('.sparkline')) return;
        
        card.parentElement.style.position = 'relative'; // Ensure absolute positioning bounds
        
        const color = colors[index % colors.length];
        const path = dataSets[index % dataSets.length];
        
        const svgHTML = `
            <svg class="sparkline" viewBox="0 0 25 30" style="width: 45px; height: 35px; position: absolute; right: 24px; top: 24px; opacity: 0.6; filter: drop-shadow(0 0 4px ${color});">
                <polyline class="sparkline-path" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${path}"></polyline>
            </svg>
        `;
        card.insertAdjacentHTML('beforeend', svgHTML);
    });
});

// ============================================================
   // Share Snapshot button logic
// ============================================================
async function captureSnapshot(targetElement, buttonElement) {
    if (!targetElement || !buttonElement) return;
    if (typeof htmlToImage === 'undefined') return;

    const originalHTML = buttonElement.innerHTML;
    buttonElement.style.pointerEvents = 'none';
    buttonElement.style.setProperty('color', 'var(--color-warning)', 'important');
    buttonElement.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="color: inherit !important;"></i> Downloading';

    const computedBg = window.getComputedStyle(document.body).backgroundColor;
    const isPredictionSnapshot = !!targetElement.querySelector('#predicted-movie-title, .ai-gauge-wrapper');
    const canvasHeight = targetElement.offsetHeight - (isPredictionSnapshot ? 65 : 0);
    const snapshotTitle = (
        targetElement.dataset?.title ||
        targetElement.querySelector('#predicted-movie-title, .movie-title, .tabular-title, h3, h4')?.textContent ||
        document.getElementById('predicted-movie-title')?.textContent ||
        'CineScore'
    ).trim();
    const fileSafeTitle = snapshotTitle
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'CineScore';
    const temporaryNodes = [];
    const temporaryStyles = [];
    const temporaryAssets = [];
    let restored = false;
    const icons = {
        check: `<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;line-height:1;flex:0 0 auto;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00ff00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`,
        radio: `<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;line-height:1;flex:0 0 auto;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path></svg></span>`,
        trophy: `<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;line-height:1;flex:0 0 auto;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6v3H3v3a5 5 0 0 0 5 5h.1A6.99 6.99 0 0 0 11 16.92V20H8v2h8v-2h-3v-3.08A6.99 6.99 0 0 0 15.9 13H16a5 5 0 0 0 5-5V5h-3V2zm-9 9a3 3 0 0 1-3-3V7h1v2h2v2zm9-3a3 3 0 0 1-3 3V9h2V7h1v1z"></path></svg></span>`,
        menu: `<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;line-height:1;flex:0 0 auto;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="12" cy="19" r="1.8"></circle></svg></span>`,
        bookmark: `<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;line-height:1;flex:0 0 auto;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2z"></path></svg></span>`,
        up: `<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;line-height:1;flex:0 0 auto;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21h4V9H2v12zM22 10a2 2 0 0 0-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 6.59 7.59C6.22 7.95 6 8.45 6 9v10a2 2 0 0 0 2 2h9a2 2 0 0 0 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"></path></svg></span>`,
        down: `<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;line-height:1;flex:0 0 auto;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22 3h-4v12h4V3zM2 14a2 2 0 0 0 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L10.83 23l6.58-6.59c.37-.36.59-.86.59-1.41V5a2 2 0 0 0-2-2H7a2 2 0 0 0-1.84 1.22l-3.02 7.05A2 2 0 0 0 2 12v2z"></path></svg></span>`
    };

    const liveAnalysisBadge = targetElement.querySelector('.fa-tower-broadcast')?.closest('.badge');
    const aiCertifiedBadge = targetElement.querySelector('.ai-certified-badge');
    const aiGaugeValue = targetElement.querySelector('.ai-gauge-value');
    const aiPercent = targetElement.querySelector('#dyn-ai-score + span');

    const swapIcon = (el, svg) => {
        const holder = document.createElement('span');
        holder.innerHTML = svg;
        const replacement = holder.firstElementChild;
        el.replaceWith(replacement);
        temporaryNodes.push({ original: el, replacement });
    };

    targetElement.querySelectorAll('i[class*="fa-"], span[class*="fa-"]').forEach(el => {
        if (el.classList.contains('fa-check') || el.classList.contains('fa-check-circle') || el.classList.contains('fa-circle-check')) {
            swapIcon(el, icons.check);
        } else if (el.classList.contains('fa-tower-broadcast')) {
            swapIcon(el, icons.radio);
        } else if (el.classList.contains('fa-trophy')) {
            swapIcon(el, icons.trophy);
        } else if (el.classList.contains('fa-ellipsis-vertical')) {
            swapIcon(el, icons.menu);
        } else if (el.classList.contains('fa-bookmark')) {
            swapIcon(el, icons.bookmark);
        } else if (el.classList.contains('fa-thumbs-up')) {
            swapIcon(el, icons.up);
        } else if (el.classList.contains('fa-thumbs-down')) {
            swapIcon(el, icons.down);
        }
    });

    const preloadImage = (url) => new Promise((resolve) => {
        const img = new Image();
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        img.onload = done;
        img.onerror = done;
        img.src = url;
        setTimeout(done, 1500);
    });

    const assetPreloads = [];
    targetElement.querySelectorAll('img[src*="image.tmdb.org/t/p/"]').forEach((img) => {
        const proxiedSrc = window.TMDB_API?.getPosterProxyUrl(img.src);
        if (!proxiedSrc || proxiedSrc === img.src) return;
        temporaryAssets.push({ type: 'img', el: img, value: img.src });
        img.src = proxiedSrc;
        assetPreloads.push(preloadImage(proxiedSrc));
    });

    targetElement.querySelectorAll('[style*="background"]').forEach((el) => {
        const originalBg = el.style.backgroundImage;
        if (!originalBg || !originalBg.includes('image.tmdb.org/t/p/')) return;
        const proxiedBg = originalBg.replace(/https:\/\/image\.tmdb\.org\/t\/p\/(?:original|w\d+)(\/[^"')\s]+)/gi, (_, posterPath) => {
            return window.TMDB_API?.getPosterProxyUrl(posterPath) || _;
        });
        if (proxiedBg === originalBg) return;
        temporaryAssets.push({ type: 'bg', el, value: originalBg });
        el.style.backgroundImage = proxiedBg;
        const match = proxiedBg.match(/url\(["']?([^"')]+)["']?\)/i);
        if (match && match[1]) assetPreloads.push(preloadImage(match[1]));
    });

    [targetElement.querySelector('.ai-gauge-value, #dyn-ai-score')?.parentElement, targetElement.querySelector('#dyn-trending-pill, .trending-pill')].filter(Boolean).forEach(el => {
        temporaryStyles.push({ el, cssText: el.style.cssText });
        el.style.setProperty('white-space', 'nowrap', 'important');
        el.style.setProperty('display', 'inline-flex', 'important');
        el.style.setProperty('width', 'auto', 'important');
    });

    [liveAnalysisBadge, aiCertifiedBadge, aiGaugeValue, aiPercent].filter(Boolean).forEach(el => {
        temporaryStyles.push({ el, cssText: el.style.cssText });
    });
    if (liveAnalysisBadge) {
        liveAnalysisBadge.style.setProperty('display', 'inline-flex', 'important');
        liveAnalysisBadge.style.setProperty('align-items', 'center', 'important');
        liveAnalysisBadge.style.setProperty('gap', '8px', 'important');
        liveAnalysisBadge.style.setProperty('padding-right', '16px', 'important');
        liveAnalysisBadge.style.setProperty('padding-left', '14px', 'important');
        liveAnalysisBadge.style.setProperty('white-space', 'nowrap', 'important');
        liveAnalysisBadge.style.setProperty('width', 'max-content', 'important');
        liveAnalysisBadge.style.setProperty('flex-wrap', 'nowrap', 'important');
        liveAnalysisBadge.querySelector('span:last-child')?.style.setProperty('margin-right', '2px', 'important');
    }
    if (aiCertifiedBadge) {
        aiCertifiedBadge.style.setProperty('display', 'inline-flex', 'important');
        aiCertifiedBadge.style.setProperty('align-items', 'center', 'important');
        aiCertifiedBadge.style.setProperty('justify-content', 'center', 'important');
        aiCertifiedBadge.style.setProperty('gap', '6px', 'important');
        aiCertifiedBadge.style.setProperty('white-space', 'nowrap', 'important');
        aiCertifiedBadge.style.setProperty('width', 'max-content', 'important');
        aiCertifiedBadge.style.setProperty('flex-wrap', 'nowrap', 'important');
    }
    if (aiGaugeValue) {
        aiGaugeValue.style.setProperty('display', 'inline-flex', 'important');
        aiGaugeValue.style.setProperty('align-items', 'baseline', 'important');
        aiGaugeValue.style.setProperty('justify-content', 'center', 'important');
        aiGaugeValue.style.setProperty('gap', '4px', 'important');
        aiGaugeValue.style.setProperty('white-space', 'nowrap', 'important');
        aiGaugeValue.style.setProperty('width', 'auto', 'important');
    }
    if (aiPercent) {
        aiPercent.style.setProperty('display', 'inline-block', 'important');
        aiPercent.style.setProperty('margin-left', '2px', 'important');
        aiPercent.style.setProperty('line-height', '1', 'important');
        aiPercent.style.setProperty('white-space', 'nowrap', 'important');
    }

    const config = {
        pixelRatio: 3,
        width: targetElement.offsetWidth,
        height: canvasHeight,
        canvasWidth: targetElement.offsetWidth,
        canvasHeight: canvasHeight,
        backgroundColor: computedBg,
        useCORS: true,
        filter: (node) => node.id !== 'share-snapshot-btn' && node.id !== 'share-btn',
        skipFonts: true
    };

    const safetyTimeout = setTimeout(() => {
        restoreUI();
    }, 15000);
    const cleanupOnPageHide = () => restoreUI();
    window.addEventListener('pagehide', cleanupOnPageHide, { once: true });

    console.log("CineScore: Engaging Final-Strike Engine...");

    try {
        await document.fonts.ready;
        await Promise.allSettled(assetPreloads);
        const dataUrl = await htmlToImage.toPng(targetElement, config);
        restoreUI();
        
        console.log("CineScore: Capture successful. Finalizing Ultra-Branding...");
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            // Draw original capture
            ctx.drawImage(img, 0, 0);
            
            // 3. Ultra-Branding: 100px White Watermark (40% Opacity)
            ctx.globalAlpha = 0.4; 
            ctx.fillStyle = '#FFFFFF';
            ctx.font = isPredictionSnapshot ? '800 48px sans-serif' : '800 24px sans-serif'; 
            ctx.textAlign = 'right';
            
            const watermarkText = "\u00A9 CineScore";
            ctx.fillText(
                watermarkText,
                canvas.width - (isPredictionSnapshot ? 48 : 24),
                canvas.height - (isPredictionSnapshot ? 48 : 24)
            );
            
            canvas.toBlob((blob) => {
                if (!blob) {
                    console.error('Snapshot blob generation failed.');
                    clearTimeout(safetyTimeout);
                    window.removeEventListener('pagehide', cleanupOnPageHide);
                    return;
                }

                const link = document.createElement('a');
                const objectUrl = URL.createObjectURL(blob);
                link.download = `${fileSafeTitle}-CineScore.png`;
                link.href = objectUrl;
                link.click();

                setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
                canvas.width = 0;
                canvas.height = 0;
                clearTimeout(safetyTimeout);
                window.removeEventListener('pagehide', cleanupOnPageHide);
            }, "image/png");
        };
        img.onerror = function() {
            clearTimeout(safetyTimeout);
            window.removeEventListener('pagehide', cleanupOnPageHide);
            restoreUI();
        };
        img.src = dataUrl;
    } catch (error) {
        console.error('Snapshot failed:', error);
        clearTimeout(safetyTimeout);
        window.removeEventListener('pagehide', cleanupOnPageHide);
        restoreUI();
    }

    function restoreUI() {
        if (restored) return;
        restored = true;
        temporaryNodes.reverse().forEach(({ original, replacement }) => {
            if (replacement.parentNode) replacement.replaceWith(original);
        });
        temporaryAssets.reverse().forEach(({ type, el, value }) => {
            if (!el) return;
            if (type === 'img') el.src = value;
            if (type === 'bg') el.style.backgroundImage = value;
        });
        temporaryStyles.forEach(({ el, cssText }) => {
            el.style.cssText = cssText;
        });
        buttonElement.innerHTML = originalHTML;
        buttonElement.style.color = '';
        buttonElement.style.pointerEvents = 'auto';
        clearTimeout(safetyTimeout);
        window.removeEventListener('pagehide', cleanupOnPageHide);
    }
}

// ============================================================
// 19. PERSISTENT FEEDBACK ENGINE (YouTube-Style Toggles)
// ============================================================
const FeedbackEngine = {
    getStorage() {
        try {
            return JSON.parse(localStorage.getItem('cinescore_feedback')) || {};
        } catch (e) { return {}; }
    },
    saveVote(movieId, vote) {
        const storage = this.getStorage();
        if (vote === null) {
            delete storage[movieId];
        } else {
            storage[movieId] = vote;
        }
        localStorage.setItem('cinescore_feedback', JSON.stringify(storage));
    },
    async syncWithBackend(title, vote) {
        // Respect the CineState offline mode circuit breaker
        if (window.CineState.offlineMode) return;
        
        try {
            const resp = await fetch("http://127.0.0.1:8000/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    movie: title,
                    vote: vote || "removed",
                    timestamp: new Date().toISOString()
                })
            });
            if (!resp.ok) throw new Error("Sync Failed");
        } catch (e) {
            console.warn("Feedback Sync skipped (Server Offline). Local state preserved.");
            // Don't flip global offlineMode here, as feedback is secondary to core analysis
        }
    }
};

function initPersistentUX() {
    // A. Prediction Page Logic
    const shareBtn = document.getElementById('share-btn');
    const resultView = document.getElementById('prediction-results-view');
    const voteBtns = document.querySelectorAll('.vote-btn');

    if (shareBtn && resultView) {
        shareBtn.addEventListener('click', () => {
            // Auth Guard integration
            const isLoggedIn = localStorage.getItem('cinescore_auth') === 'true';
            if (!isLoggedIn) {
                const signupModal = document.getElementById('signupModal');
                if (signupModal) signupModal.style.display = 'flex';
                return;
            }
            
            // THE ATMOSPHERIC TARGET: Capture the entire Hero Section with blur
            const heroSection = document.querySelector('.prediction-hero');
            captureSnapshot(heroSection || resultView, shareBtn);
        });
    }

    if (voteBtns.length > 0) {
        const activeMovie = sessionStorage.getItem('cineScore_activePrediction') || "Global";
        const storage = FeedbackEngine.getStorage();
        const initialVote = storage[activeMovie];

        const updateVoteUI = (vote) => {
            voteBtns.forEach(btn => {
                const isUp = btn.getAttribute('data-vote') === 'up';
                const btnType = isUp ? 'good' : 'bad';
                const isActive = (btnType === vote);

                // Apply active class for CSS protection
                btn.classList.toggle('active-voted', isActive);

                // Reverting to the "Inline Style" approach user preferred
                btn.style.opacity = isActive ? '1' : '0.7';
                btn.style.transform = isActive ? 'scale(1.05)' : 'scale(1)';
                btn.style.fontWeight = isActive ? '800' : '600';
                
                // Use !important only when active to prevent blue hover override
                if (isActive) {
                    btn.style.setProperty('color', isUp ? 'var(--color-success)' : 'var(--color-danger)', 'important');
                } else {
                    btn.style.color = '';
                }
                
                if (document.documentElement.getAttribute('data-theme') === 'light') {
                    btn.style.background = isActive ? (isUp ? 'rgba(0, 200, 83, 0.1)' : 'rgba(239, 68, 68, 0.1)') : '';
                }

                btn.innerHTML = isActive 
                    ? `<i class="fa-solid fa-thumbs-${isUp ? 'up' : 'down'}"></i> Voted ${isUp ? 'Good' : 'Bad'}`
                    : `<i class="fa-regular fa-thumbs-${isUp ? 'up' : 'down'}"></i> ${isUp ? 'Good' : 'Bad'} Prediction`;
            });
        };

        updateVoteUI(initialVote);

        voteBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const btnType = btn.getAttribute('data-vote') === 'up' ? 'good' : 'bad';
                const currentVote = FeedbackEngine.getStorage()[activeMovie];
                
                // Toggle Logic
                const finalVote = (currentVote === btnType) ? null : btnType;
                
                // 1. UI First
                updateVoteUI(finalVote);
                
                // 2. Persistence Second
                FeedbackEngine.saveVote(activeMovie, finalVote);
                
                // 3. Network Third (Async)
                FeedbackEngine.syncWithBackend(activeMovie, finalVote);
            });
        });
    }

    // B. Hub Page Delegation (Nomination Snapshots)
    document.addEventListener('click', (e) => {
        const shareOpt = e.target.closest('.ctx-share-option');
        if (shareOpt) {
            // Find the closest nomination card or result block
            const card = shareOpt.closest('.nomination-card') || shareOpt.closest('.movie-card-standard');
            if (card) {
                captureSnapshot(card, shareOpt);
                // Close context menu if open
                const menu = document.getElementById('context-menu');
                if (menu) menu.classList.add('hidden');
            }
        }
    });
}

// Register with Master Initializer
document.addEventListener("DOMContentLoaded", initPersistentUX);



