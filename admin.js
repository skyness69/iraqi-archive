/**
 * admin.js — Iraqi Archive Admin Dashboard
 * RESTRICTED: Only accessible by alaidan25@gmail.com
 */

import {
    auth, db, ADMIN_EMAIL,
    onAuthStateChanged, signOut,
    collection, addDoc, deleteDoc, updateDoc, onSnapshot,
    doc, setDoc
} from './firebase-config.js';

import { showToast, escHtml, escQ, shortUrl } from './utils.js';

// Global Vars
const COL      = 'resources';
const CAT_DOC_ID = '--categories-metadata--';
const BUG_COL  = 'bug_reports';

// State
let categories = [];
let resources = [];
let bugReports = [];
let editingCatId = null;
let unsubSync = null;
let unsubBugs = null;

/**
 * START PORTAL
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log("IA ADMIN: Portal sequence initiated.");
    showToast('Vault Master: System Online.', 'success');
    
    // Bind Event Listeners
    document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));
    document.getElementById('add-form')?.addEventListener('submit', handleAddResource);
    document.getElementById('edit-form')?.addEventListener('submit', handleEditResource);
    document.getElementById('cat-form')?.addEventListener('submit', handleCategorySubmit);
    document.getElementById('close-modal')?.addEventListener('click', closeEditModal);

    // Mobile Sidebar Toggles
    const mobileToggle = document.getElementById('mobile-toggle');
    const adminSidebar = document.getElementById('admin-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    const toggleSidebar = () => {
        adminSidebar?.classList.toggle('active');
        sidebarOverlay?.classList.toggle('active');
    };

    mobileToggle?.addEventListener('click', toggleSidebar);
    sidebarOverlay?.addEventListener('click', toggleSidebar);

    // Sidebar Toggles
    document.getElementById('side-nav-resources')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchSection('resources');
        if (window.innerWidth < 1024) toggleSidebar();
    });
    document.getElementById('side-nav-categories')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchSection('categories');
        if (window.innerWidth < 1024) toggleSidebar();
    });
    document.getElementById('side-nav-bugs')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchSection('bugs');
        if (window.innerWidth < 1024) toggleSidebar();
    });

    const editModal = document.getElementById('edit-modal');
    editModal?.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

    initMainAuth();
});

/**
 * AUTHENTICATION
 */
function initMainAuth() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'auth.html';
            return;
        }

        const email = user.email ? user.email.toLowerCase() : "";
        if (email !== ADMIN_EMAIL.toLowerCase()) {
            showToast('Permission Violation: Access Denied.', 'error');
            setTimeout(() => window.location.href = 'index.html', 1500);
            return;
        }
        
        // Grant Access to UI
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('admin-email').textContent = user.email;
        document.getElementById('admin-avatar').textContent = user.email[0].toUpperCase();
        
        startLiveSync();
    });
}

/**
 * UI NAVIGATION
 */
function switchSection(name) {
    const resSec = document.getElementById('resources-section');
    const catSec = document.getElementById('categories-section');
    const bugSec = document.getElementById('bugs-section');
    
    const resNav = document.getElementById('side-nav-resources');
    const catNav = document.getElementById('side-nav-categories');
    const bugNav = document.getElementById('side-nav-bugs');

    // Reset
    [resSec, catSec, bugSec].forEach(s => s?.classList.add('hidden'));
    [resNav, catNav, bugNav].forEach(n => n?.classList.remove('active'));

    // Show
    if (name === 'resources') {
        resSec?.classList.remove('hidden');
        resNav?.classList.add('active');
    } else if (name === 'categories') {
        catSec?.classList.remove('hidden');
        catNav?.classList.add('active');
    } else if (name === 'bugs') {
        bugSec?.classList.remove('hidden');
        bugNav?.classList.add('active');
        fetchBugReports(); // Load bugs when viewing
    }
}

/**
 * DATA SYNC
 */
function startLiveSync() {
    if (unsubSync) unsubSync();

    unsubSync = onSnapshot(collection(db, COL), (snap) => {
        let allItems = [];
        snap.forEach(d => allItems.push({ id: d.id, ...d.data() }));

        const catDoc = allItems.find(i => i.id === CAT_DOC_ID);
        categories = catDoc && catDoc.list ? catDoc.list : [];
        categories.sort((a,b) => a.localeCompare(b));

        resources = allItems.filter(i => i.id !== CAT_DOC_ID);
        resources.sort((a,b) => (a.title || '').localeCompare(b.title || ''));

        renderResourcesTable(resources);
        renderCategoriesList(categories);
        updateCategoryOptions(categories);
        updateStatsView(resources);
    });
}

/**
 * BUG REPORTS LOGIC
 */
function fetchBugReports() {
    if (unsubBugs) unsubBugs();
    
    unsubBugs = onSnapshot(collection(db, BUG_COL), (snap) => {
        bugReports = [];
        snap.forEach(d => bugReports.push({ id: d.id, ...d.data() }));
        bugReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderBugReports(bugReports);
    }, err => showToast("Bug Sync Failed: " + err.message, "error"));
}

function renderBugReports(items) {
    const container = document.getElementById('bugs-container');
    const badge = document.getElementById('bug-count-badge');
    if (!container) return;

    if (badge) badge.textContent = `${items.length} Reports`;

    if (items.length === 0) {
        container.innerHTML = `
            <div class="py-24 text-center">
                <div class="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg class="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Transmission sequence clear. No anomalies detected.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(b => `
        <div class="p-8 group hover:bg-white/[0.02] transition-all duration-300">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <!-- Info Section -->
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-8 h-8 rounded-full bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center text-[11px] font-black text-[var(--accent-primary)]">
                            ${(b.user || 'A')[0].toUpperCase()}
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs font-black text-white leading-none">${escHtml(b.user || 'Anonymous')}</span>
                            <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-1">${new Date(b.createdAt).toLocaleString()}</span>
                        </div>
                    </div>

                    <h3 class="text-sm font-black text-red-400 mb-3 tracking-tight">${escHtml(b.subject)}</h3>
                    <p class="text-xs text-slate-400 leading-relaxed max-w-3xl">${escHtml(b.message)}</p>

                    ${b.location ? `
                        <div class="flex items-center gap-2 mt-5">
                            <span class="text-[8px] font-black uppercase tracking-widest text-slate-600">Archive Reference</span>
                            <span class="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-1 rounded-md text-[9px] font-bold">
                                ${escHtml(b.location)}
                            </span>
                        </div>
                    ` : ''}
                </div>

                <!-- Actions Section -->
                <div class="flex items-center gap-3 shrink-0">
                    <a href="mailto:${ADMIN_EMAIL}?subject=Re: ${escQ(b.subject)}&body=Regarding your report: %0D%0A%0D%0A${escQ(b.message)}" 
                       class="flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent-primary)] hover:text-black transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                        Email Entry
                    </a>
                    <button onclick="deleteBugReq('${b.id}')" 
                            class="flex items-center gap-2 px-5 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        Resolve
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

window.deleteBugReq = (id) => {
    if (confirm("Resolve and purge this report?")) {
        deleteDoc(doc(db, BUG_COL, id))
            .then(() => showToast("Report Resolved.", "success"))
            .catch(err => showToast("Failed: " + err.message, "error"));
    }
};

/**
 * CATEGORY OPERATIONS
 */
function renderCategoriesList(items) {
    const tbody = document.getElementById('category-tbody');
    if (!tbody) return;

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center py-20 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Portal Categories Reset. Initializing...</td></tr>';
        return;
    }

    tbody.innerHTML = items.map((catName, index) => `
        <tr class="group hover:bg-white/5 transition-colors">
            <td class="pl-6"><p style="font-weight:800; color:var(--text-pure); font-size:14px;">${escHtml(catName)}</p></td>
            <td class="pr-6 text-right">
                <div class="flex justify-end gap-2">
                    <button onclick="setEditMode('${index}','${escQ(catName)}')" class="btn-accent !py-2 !px-4 !text-[9px] !rounded-lg !bg-slate-800 !text-white hover:!bg-white hover:!text-black">EDIT</button>
                    <button onclick="deleteCategoryReq('${index}','${escQ(catName)}')" class="!py-2 !px-4 !text-[9px] !rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 font-bold hover:bg-red-500 hover:text-white transition-all">DELETE</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function handleCategorySubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('c-name');
    const newName = nameInput?.value.trim();
    if (!newName) return showToast('Name required.', 'error');

    let updatedList = [...categories];
    let oldName = null;
    
    if (editingCatId !== null) {
        oldName = updatedList[parseInt(editingCatId)];
        updatedList[parseInt(editingCatId)] = newName;
    } else {
        if (updatedList.includes(newName)) return showToast('Duplicate.', 'error');
        updatedList.push(newName);
    }

    try {
        await setDoc(doc(db, COL, CAT_DOC_ID), { list: updatedList });
        
        // If it's a rename, update all resources with the old category
        if (oldName && oldName !== newName) {
            const resourcesToUpdate = resources.filter(r => r.category === oldName);
            const updatePromises = resourcesToUpdate.map(r => 
                updateDoc(doc(db, COL, r.id), { category: newName })
            );
            await Promise.all(updatePromises);
            if (updatePromises.length > 0) {
                showToast(`Migrated ${updatePromises.length} artifacts to new category.`, 'success');
            }
        }
        
        nameInput.value = '';
        if (editingCatId !== null) clearEditMode();
        showToast('Vault Synchronized.', 'success');
    } catch (err) {
        showToast(`Sync Failed: ${err.message}`, 'error');
    }
}

window.setEditMode = (index, name) => {
    editingCatId = index;
    const nameInput = document.getElementById('c-name');
    const btnText = document.querySelector('#cat-add-btn span');
    if (nameInput) nameInput.value = name;
    if (btnText) btnText.textContent = 'Apply Rename';
    
    if (!document.getElementById('cat-cancel')) {
        const cancel = document.createElement('button');
        cancel.id = 'cat-cancel';
        cancel.type = 'button';
        cancel.textContent = 'Discard Edit';
        cancel.className = 'w-full mt-4 text-[10px] font-black uppercase tracking-tighter text-slate-500 hover:text-white transition-colors';
        cancel.onclick = clearEditMode;
        document.getElementById('cat-form')?.appendChild(cancel);
    }
    nameInput?.focus();
};

function clearEditMode() {
    editingCatId = null;
    const nameInput = document.getElementById('c-name');
    const btnText = document.querySelector('#cat-add-btn span');
    if (nameInput) nameInput.value = '';
    if (btnText) btnText.textContent = 'Create Category';
    document.getElementById('cat-cancel')?.remove();
}

window.deleteCategoryReq = (index, name) => {
    if (confirm(`Remove "${name}"?`)) {
        let updatedList = categories.filter((_, i) => i !== parseInt(index));
        setDoc(doc(db, COL, CAT_DOC_ID), { list: updatedList })
            .then(() => showToast(`Category Purged.`, 'success'))
            .catch(err => showToast(`Sync Failed: ${err.message}`, 'error'));
    }
};

/**
 * RESOURCE OPERATIONS
 */
function renderResourcesTable(items) {
    const tbody = document.getElementById('resource-tbody');
    const countLabel = document.getElementById('table-count');
    if (!tbody || !countLabel) return;

    countLabel.textContent = `${items.length} ARCHIVED`;

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-24 text-slate-500 uppercase font-black text-xs tracking-widest">No artifacts found.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(r => `
        <tr class="group hover:bg-white/5 transition-colors">
            <td class="pl-6">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center font-black text-xs text-white border border-white/5 group-hover:border-white/20 transition-all">${(r.title || "?")[0].toUpperCase()}</div>
                    <div>
                        <p class="font-black text-[14px] text-white tracking-tight">${escHtml(r.title)}</p>
                        <a href="${escHtml(r.url)}" target="_blank" class="text-[10px] text-red-400/80 hover:text-red-400 font-bold">${shortUrl(r.url)} →</a>
                    </div>
                </div>
            </td>
            <td><span class="inline-block px-3 py-1 rounded-full bg-slate-900 border border-white/5 text-[9px] font-black text-slate-400 uppercase tracking-widest">${escHtml(r.category || 'Legacy')}</span></td>
            <td class="pr-6 text-right">
                <div class="flex justify-end gap-2">
                    <button onclick="reqEditResource('${r.id}','${escQ(r.title)}','${escQ(r.desc)}','${escQ(r.url)}','${escQ(r.category)}')" class="btn-accent !py-2 !px-4 !text-[9px] !rounded-lg !bg-white !text-black hover:!bg-red-500 hover:!text-white">EDIT</button>
                    <button onclick="reqDeleteResource('${r.id}','${escQ(r.title)}')" class="!py-2 !px-4 !text-[9px] !rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 font-bold hover:bg-red-500 hover:text-white transition-all">DELETE</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function handleAddResource(e) {
    e.preventDefault();
    const title = document.getElementById('f-title')?.value.trim();
    const desc = document.getElementById('f-desc')?.value.trim();
    const url = document.getElementById('f-url')?.value.trim();
    const category = document.getElementById('f-category')?.value;
    if (!title || !desc || !url || !category) return showToast('Fail: All fields required.', 'error');
    try {
        await addDoc(collection(db, COL), { title, desc, url, category, addedAt: new Date().toISOString() });
        document.getElementById('add-form')?.reset();
        showToast(`Resource Deployed.`, 'success');
    } catch (err) {
        showToast(`Fail: ${err.message}`, 'error');
    }
}

window.reqEditResource = (id, title, desc, url, category) => {
    document.getElementById('edit-id').value = id;
    document.getElementById('e-title').value = title;
    document.getElementById('e-desc').value = desc;
    document.getElementById('e-url').value = url;
    document.getElementById('e-category').value = category;
    document.getElementById('edit-modal').style.display = 'flex';
};

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function handleEditResource(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const title = document.getElementById('e-title').value.trim();
    const desc = document.getElementById('e-desc').value.trim();
    const url = document.getElementById('e-url').value.trim();
    const category = document.getElementById('e-category').value;
    try {
        await updateDoc(doc(db, COL, id), { title, desc, url, category });
        showToast('Resource Updated.', 'success');
        closeEditModal();
    } catch (err) {
        showToast(`Fail: ${err.message}`, 'error');
    }
}

window.reqDeleteResource = (id, title) => {
    if (confirm(`Delete "${title}"?`)) {
        deleteDoc(doc(db, COL, id))
            .then(() => showToast(`Resource Deleted.`, 'success'))
            .catch(err => showToast(`Fail: ${err.message}`, 'error'));
    }
};

function updateStatsView(items) {
    document.getElementById('stat-total').textContent = items.length;
    document.getElementById('stat-cats').textContent = categories.length;
    document.getElementById('stat-date').textContent = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

function updateCategoryOptions(cats) {
    const fCat = document.getElementById('f-category');
    const eCat = document.getElementById('e-category');
    if (!fCat || !eCat) return;
    const html = `
        <option value="">-- SELECT SECTION --</option>
        ${cats.map(cName => `<option value="${escHtml(cName)}">${escHtml(cName)}</option>`).join('')}
    `;
    fCat.innerHTML = html;
    eCat.innerHTML = html;
}
