/**
 * app.js â€” Iraqi Archive | Main Application Logic
 * Reads resources from Firestore in real-time.
 * Handles Auth, Favorites (save/unsave), and UI rendering.
 */

import {
    auth, db, ADMIN_EMAIL,
    onAuthStateChanged, signOut,
    collection, onSnapshot,
    doc, setDoc, deleteDoc, getDoc
} from './firebase-config.js';

import { showToast, escHtml, escQ } from './utils.js';

// ================================================================
// STATE
// ================================================================
let resources = [];
let categories = [];
const CAT_DOC_ID = '--categories-metadata--';
let savedIds = [];
let currentUser = null;
let currentCategory = 'All';
let currentView = 'Home';
let currentPage = 1;
const ITEMS_PER_PAGE = 12;
let unsubSync = null;
let unsubFavorites = null;

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    startDataSync();
    initAuthObserver();
    document.getElementById('search-input')
        ?.addEventListener('input', () => renderResources());
    initRouting();
    initThemeSystem();
    initDetailsModal();
});

// ================================================================
// ROUTING (Home vs Vault view in index.html)
// ================================================================
function initRouting() {
    const navFavorites = document.getElementById('nav-favorites');
    const navExplore = document.getElementById('nav-explore');

    // Hash-based routing
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Check on load
}

function handleHashChange() {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'vault') {
        if (!currentUser || !currentUser.emailVerified) {
            window.location.hash = ''; // reset if not logged in
            // Redirect happens in onAuthStateChanged
            return;
        }
        currentView = 'Vault';
    } else {
        currentView = 'Home';
    }
    updateUIRouting();
    renderResources(); // This will now handle both grids
}

function updateUIRouting() {
    const sectionHome = document.getElementById('section-home');
    const sectionVault = document.getElementById('section-vault');
    const navExplore = document.getElementById('nav-explore');
    const navFavorites = document.getElementById('nav-favorites');

    if (currentView === 'Vault') {
        sectionHome?.classList.add('hidden');
        sectionVault?.classList.remove('hidden');

        // Active link highlighting
        navExplore?.classList.replace('text-[var(--text-pure)]', 'text-slate-400');
        navFavorites?.classList.replace('text-slate-400', 'text-white');
    } else {
        sectionHome?.classList.remove('hidden');
        sectionVault?.classList.add('hidden');

        // Active link highlighting
        navExplore?.classList.replace('text-slate-400', 'text-[var(--text-pure)]');
        navFavorites?.classList.replace('text-white', 'text-slate-400');
    }
}

// ================================================================
// LIVE DATA SYNC (Unified Strategy)
// ================================================================
function startDataSync() {
    if (unsubSync) unsubSync();

    unsubSync = onSnapshot(collection(db, 'resources'), (snap) => {
        let allItems = [];
        snap.forEach(d => allItems.push({ id: d.id, ...d.data() }));

        // 1. Extract Categories from Proxy Doc
        const catDoc = allItems.find(i => i.id === CAT_DOC_ID);
        categories = catDoc && catDoc.list ? catDoc.list : [];
        categories.sort((a, b) => a.localeCompare(b));
        renderCategoryTabs();

        // 2. Extract Resources (Exclude Proxy Doc)
        resources = allItems.filter(i => i.id !== CAT_DOC_ID);
        resources.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

        renderResources();
    }, err => {
        console.error('Archive sync failed:', err);
    });
}

function renderCategoryTabs() {
    const container = document.getElementById('category-filters');
    if (!container) return;

    const allBtn = `<button class="cat-pill ${currentCategory === 'All' ? 'active' : ''}" data-category="All">All Resources</button>`;
    const catBtns = categories.map(catName => `
        <button class="cat-pill ${currentCategory === catName ? 'active' : ''}" data-category="${escQ(catName || '')}">
            ${escHtml(catName || '')}
        </button>
    `).join('');

    container.innerHTML = allBtn + catBtns;

    // Bind interaction
    container.querySelectorAll('.cat-pill').forEach(btn => {
        btn.onclick = () => {
            container.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.getAttribute('data-category') || 'All';
            currentPage = 1;
            renderResources();
        };
    });
}


// ================================================================
// AUTH OBSERVER
// ================================================================
function initAuthObserver() {
    onAuthStateChanged(auth, async (user) => {
        const isAuthPage = window.location.pathname.includes('auth.html');
        const verifyBanner = document.getElementById('verify-banner');

        if (user) {
            currentUser = user;

            if (!user.emailVerified) {
                // If on main page, force them to verification screen
                if (!isAuthPage) {
                    window.location.href = 'auth.html';
                    return;
                }
                verifyBanner?.classList.remove('hidden');
            } else {
                verifyBanner?.classList.add('hidden');
                
                // Safety: If they just arrived and are verified, ensure token is fresh
                // so Firestore matches the verified status.
                try {
                    const token = await user.getIdTokenResult();
                    if (!token.claims.email_verified) {
                        console.log('Refreshing token for Firestore verification...');
                        await user.getIdToken(true);
                    }
                } catch (e) {
                    console.error('Token refresh check failed:', e);
                }

                // If they just got verified and are on auth page, send home
                if (isAuthPage) window.location.href = 'index.html';
            }

            updateNavUI(user);
            startFavoritesListener(user.uid);
        } else {
            currentUser = null;
            savedIds = [];
            if (unsubFavorites) unsubFavorites();
            verifyBanner?.classList.add('hidden');
            updateNavUI(null);
            
            // If hash is vault but not logged in, redirect
            if (window.location.hash.includes('vault')) {
                window.location.href = 'auth.html';
                return;
            }
            
            renderResources(); // Re-render without saved state
        }
        
        // Always run hash change after auth state is known
        handleHashChange();
    });

    document.getElementById('logout-btn')
        ?.addEventListener('click', () => signOut(auth));
}

// ================================================================
// USER FAVORITES LISTENER  (users/{uid}/favorites/)
// Real-time sync â€” updates heart icons immediately
// ================================================================
function startFavoritesListener(uid) {
    if (unsubFavorites) unsubFavorites();

    const favRef = collection(db, 'users', uid, 'favorites');
    unsubFavorites = onSnapshot(favRef, (snap) => {
        savedIds = [];
        snap.forEach(d => savedIds.push(d.id));
        renderResources(); // Re-render with updated heart states
    }, err => {
        console.error('Favorites error:', err);
        if (err.code === 'permission-denied') {
            console.warn('Favorites access denied. Possible stale session.');
        }
    });
}

// ================================================================
// NAV UI
// ================================================================
function updateNavUI(user) {
    const guestView = document.getElementById('guest-view');
    const userView = document.getElementById('user-view');
    const navFavorites = document.getElementById('nav-favorites');
    const navAdmin = document.getElementById('nav-admin');
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-display-name');
    const heroActions = document.getElementById('hero-actions');

    // Mobile drawer elements
    const mobGuest = document.getElementById('mob-guest-view');
    const mobUser = document.getElementById('mob-user-view');
    const mobAvatar = document.getElementById('mob-user-avatar');
    const mobName = document.getElementById('mob-user-name');
    const mobFav = document.getElementById('mob-nav-favorites');
    const mobAdmin = document.getElementById('mob-nav-admin');
    const mobLogout = document.getElementById('mob-logout-btn');

    if (user) {
        guestView?.classList.add('hidden');
        userView?.classList.remove('hidden');
        userView?.classList.add('flex');
        heroActions?.classList.remove('hidden');
        heroActions?.classList.add('flex');

        if (navFavorites) {
            navFavorites.classList.remove('hidden');
            navFavorites.style.display = 'flex'; // Changed to flex to match Tailwind
            navFavorites.href = '#vault';
        }
        if (navAdmin) {
            const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
            navAdmin.classList.toggle('hidden', !isAdmin);
            if (isAdmin) navAdmin.style.display = 'flex';
        }

        if (avatarEl) avatarEl.textContent = user.email[0].toUpperCase();
        if (nameEl) nameEl.textContent = user.email.split('@')[0];

        // Mobile drawer
        mobGuest?.classList.add('hidden');
        mobUser?.classList.remove('hidden');
        mobUser?.classList.add('flex');
        if (mobAvatar) mobAvatar.textContent = user.email[0].toUpperCase();
        if (mobName) mobName.textContent = user.email.split('@')[0];
        if (mobFav) mobFav.style.display = 'block';
        if (mobAdmin) mobAdmin.style.display = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'block' : 'none';

    } else {
        guestView?.classList.remove('hidden');
        userView?.classList.add('hidden');

        // Keep favorites link visible on desktop for 'official' look
        if (navFavorites) {
            navFavorites.classList.remove('hidden');
            navFavorites.style.display = 'flex';
            navFavorites.href = 'auth.html'; // Redirect to auth if guest clicks vault
        }
        if (navAdmin) navAdmin.style.display = 'none';

        // Mobile drawer
        mobGuest?.classList.remove('hidden');
        mobGuest?.classList.add('flex');
        mobUser?.classList.add('hidden');
        if (mobFav) mobFav.style.display = 'none';
        if (mobAdmin) mobAdmin.style.display = 'none';

        heroActions?.classList.add('hidden');
        heroActions?.classList.remove('flex');
    }
}


// ================================================================
// RENDER RESOURCES  (Main Page Grid + Pagination)
// ================================================================
function renderResources() {
    const homeGrid = document.getElementById('resource-grid');
    const vaultGrid = document.getElementById('vault-grid');

    // Choose which grid to render into based on view
    const grid = currentView === 'Vault' ? vaultGrid : homeGrid;
    if (!grid) return;

    const term = document.getElementById('search-input')
        ?.value.trim().toLowerCase() || '';

    const filtered = resources.filter(r => {
        // If in Vault, only show saved items
        if (currentView === 'Vault') {
            return savedIds.includes(r.id);
        }

        // If in Home, apply normal filters
        const matchesCat = currentCategory === 'All' ||
            (r.category || '').toLowerCase() === currentCategory.toLowerCase();
        const matchesSearch = (r.title || '').toLowerCase().includes(term) ||
            (r.desc || '').toLowerCase().includes(term);
        return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;padding:4rem 0;text-align:center;color:var(--text-muted);">
                <p style="font-size:1rem;font-weight:600;margin-bottom:0.5rem;">No resources found</p>
                <p style="font-size:0.875rem;">${term ? `No results for "${term}"` : 'The archive is empty for this category.'}</p>
            </div>`;
        renderPagination(0, 0);
        return;
    }

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

    grid.innerHTML = pageItems.map(r => cardTemplate(r)).join('');
    renderPagination(totalPages, filtered.length);
}

function renderPagination(totalPages, totalItems) {
    let pager = document.getElementById('pagination-bar');
    if (!pager) {
        pager = document.createElement('div');
        pager.id = 'pagination-bar';
        pager.className = 'pagination-bar';
        const targetGrid = currentView === 'Vault' ? document.getElementById('vault-grid') : document.getElementById('resource-grid');
        targetGrid?.after(pager);
    }

    if (totalPages <= 1) { pager.innerHTML = ''; return; }

    let pages = '';
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    if (start > 1) pages += `<button class="page-btn" onclick="goToPage(1)">1</button>${start > 2 ? '<span class="page-ellipsis">…</span>' : ''}`;
    for (let i = start; i <= end; i++) {
        pages += `<button class="page-btn${i === currentPage ? ' active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    if (end < totalPages) pages += `${end < totalPages - 1 ? '<span class="page-ellipsis">…</span>' : ''}<button class="page-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;

    pager.innerHTML = `
        <button class="page-btn nav" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&#8592;</button>
        ${pages}
        <button class="page-btn nav" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>&#8594;</button>
    `;
}

window.goToPage = (page) => {
    currentPage = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderResources();
};

// ================================================================
// COMPACT CARD TEMPLATE
// ================================================================
function isArabic(text) {
    return /[\u0600-\u06FF]/.test(text);
}

function cardTemplate(item) {
    const isSaved = savedIds.includes(item.id);
    const initials = (item.title || '?')[0].toUpperCase();
    const desc = (item.desc || '').length > 90 ? item.desc.slice(0, 90) + '…' : (item.desc || '');

    const hasArabic = isArabic(item.title || '') || isArabic(item.desc || '');
    const textDir = hasArabic ? 'rtl' : 'ltr';
    const arabicClass = hasArabic ? 'arabic-text' : '';

    return `
    <div class="resource-card-premium group ${arabicClass}" onclick="showDetails('${item.id}')">
        <!-- Top Row: Icon & Heart -->
        <div class="card-top-row">
            <div class="card-icon-saas">${initials}</div>
            <button onclick="event.stopPropagation(); handleSave('${item.id}')"
                    id="save-btn-${item.id}"
                    title="${isSaved ? 'Remove' : 'Save'}"
                    class="heart-btn-saas ${isSaved ? 'saved' : ''}"
                    style="position: relative; top: 0; right: 0; margin-left: auto;">
                <svg fill="${isSaved ? 'white' : 'none'}" stroke="${isSaved ? 'white' : 'var(--text-muted)'}"
                     stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round"
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682
                             a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318
                             a4.5 4.5 0 00-6.364 0z"/>
                </svg>
            </button>
        </div>
        <!-- Body -->
        <h3 class="card-title" dir="${textDir}">${item.title || 'Untitled'}</h3>
        <p class="card-desc" dir="${textDir}">${desc}</p>
        <!-- Footer -->
        <div class="card-footer">
            <span class="badge-saas">${item.category || 'Other'}</span>
            <a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer" class="card-link" onclick="event.stopPropagation()">Visit →</a>
        </div>
    </div>`;
}

// ================================================================
// SAVE / UNSAVE  (Toggle Favorite)
// Stores full resource snapshot in Firestore sub-collection
// ================================================================
window.handleSave = async (resourceId) => {
    // Must be logged in
    if (!currentUser) {
        window.location.href = 'auth.html';
        return;
    }

    const favDocRef = doc(db, 'users', currentUser.uid, 'favorites', resourceId);
    const isSaved = savedIds.includes(resourceId);

    try {
        if (isSaved) {
            // Remove
            await deleteDoc(favDocRef);
        } else {
            // Save — Only store timestamp reference, render from live resources collection
            await setDoc(favDocRef, {
                savedAt: new Date().toISOString()
            });
        }
        // onSnapshot fires → savedIds updates → renderArchive() re-runs automatically
    } catch (error) {
        console.error('Save error:', error);
        showToast('Could not update favorites. Check your connection.', 'error');
    }
};

// Redundant local showToast removed, now using utils.js



// ================================================================
// THEME SYSTEM
// ================================================================
function initThemeSystem() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    // Load saved
    const saved = localStorage.getItem('ia-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);

    toggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('ia-theme', next);
        updateThemeIcon(next);
    });
}

function updateThemeIcon(theme) {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    // Moon for dark, Sun for light
    if (theme === 'dark') {
        toggle.innerHTML = `<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>`;
    } else {
        toggle.innerHTML = `<svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"></path></svg>`;
    }
}

// ================================================================
// DETAILS MODAL
// ================================================================
function initDetailsModal() {
    const modal = document.getElementById('details-modal');
    const closeBtn = document.getElementById('close-details');

    closeBtn?.addEventListener('click', () => modal.classList.remove('open'));
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
    });
}

window.showDetails = (id) => {
    const item = resources.find(r => r.id === id);
    if (!item) return;

    const modal = document.getElementById('details-modal');
    const titleEl = document.getElementById('modal-title');
    const descEl = document.getElementById('modal-desc');
    const badgeEl = document.getElementById('modal-badge');
    const linkEl = document.getElementById('modal-link');
    const iconEl = document.getElementById('modal-icon');

    if (modal && titleEl && descEl && badgeEl && linkEl && iconEl) {
        const hasArabic = isArabic(item.title || '') || isArabic(item.desc || '');
        const textDir = hasArabic ? 'rtl' : 'ltr';

        titleEl.textContent = item.title || 'Untitled';
        titleEl.dir = textDir;
        
        descEl.textContent = item.desc || 'No description available.';
        descEl.dir = textDir;
        
        badgeEl.textContent = item.category || 'Other';
        linkEl.href = item.url || '#';
        iconEl.textContent = (item.title || '?')[0].toUpperCase();
        modal.classList.add('open');
    }
};
