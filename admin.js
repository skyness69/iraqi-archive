/**
 * admin.js — Iraqi Archive Admin Dashboard
 * RESTRICTED: Only accessible by alaidan25@gmail.com
 * NOTE: CATEGORIES ARE NOW STORED AS A SPECIAL METADATA DOCUMENT IN 'resources' PROXIED FOR PERMISSION STABILITY.
 */

import {
    auth, db, ADMIN_EMAIL,
    onAuthStateChanged, signOut,
    collection, addDoc, deleteDoc, updateDoc, onSnapshot,
    doc, setDoc, getDoc
} from './firebase-config.js';

import { showToast, escHtml, escQ, shortUrl } from './utils.js';

// Global Vars
const COL      = 'resources';
const CAT_DOC_ID = '--categories-metadata--'; // Special ID in the resources collection

// State
let categories = [];
let resources = [];
let editingCatId = null;
let unsubSync = null;

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

    // Sidebar Toggles
    document.getElementById('side-nav-resources')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchSection('resources');
    });
    document.getElementById('side-nav-categories')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchSection('categories');
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
    const resNav = document.getElementById('side-nav-resources');
    const catNav = document.getElementById('side-nav-categories');

    if (name === 'resources') {
        resSec?.classList.remove('hidden');
        catSec?.classList.add('hidden');
        resNav?.classList.add('active');
        catNav?.classList.remove('active');
    } else {
        resSec?.classList.add('hidden');
        catSec?.classList.remove('hidden');
        resNav?.classList.remove('active');
        catNav?.classList.add('active');
    }
}

/**
 * DATA SYNC (Single Collection Strategy)
 */
function startLiveSync() {
    console.log("IA ADMIN: Synchronizing archives...");
    if (unsubSync) unsubSync();

    // Listen to the ENTIRE resources collection
    unsubSync = onSnapshot(collection(db, COL), (snap) => {
        let allItems = [];
        snap.forEach(d => allItems.push({ id: d.id, ...d.data() }));

        // 1. Extract Categories from the special metadata doc
        const catDoc = allItems.find(i => i.id === CAT_DOC_ID);
        categories = catDoc && catDoc.list ? catDoc.list : [];
        categories.sort((a,b) => a.localeCompare(b));

        // 2. Extract Resources (exclude the metadata doc)
        resources = allItems.filter(i => i.id !== CAT_DOC_ID);
        resources.sort((a,b) => (a.title || '').localeCompare(b.title || ''));

        // 3. Render
        renderResourcesTable(resources);
        renderCategoriesList(categories);
        updateCategoryOptions(categories);
        updateStatsView(resources);
        
    }, err => {
        console.error("Sync Error:", err);
        showToast('Database Access Restricted: Check Firebase Rules.', 'error');
    });
}

/**
 * CATEGORY OPERATIONS (Internal List Strategy)
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

    // Logic: Modify our local array 'categories', then push entire array to Firebase
    let updatedList = [...categories];

    if (editingCatId !== null) {
        // Update existing index
        const idx = parseInt(editingCatId);
        updatedList[idx] = newName;
        showToast(`Renaming Category to "${newName}"...`, 'success');
    } else {
        // Add new
        if (updatedList.includes(newName)) return showToast('Category already exists.', 'error');
        updatedList.push(newName);
        showToast(`Adding Category "${newName}"...`, 'success');
    }

    try {
        // PUSH ENTIRE ARRAY TO FIRESTORE (Metadata Document)
        // Using the 'resources' collection because we know permissions work there!
        await setDoc(doc(db, COL, CAT_DOC_ID), { list: updatedList });
        
        nameInput.value = '';
        if (editingCatId !== null) clearEditMode();
        showToast('Vault Synchronized.', 'success');
    } catch (err) {
        console.error("SYNCCAT ERROR:", err);
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
    if (confirm(`Remove "${name}"? Existing resources for this section will lose their tag.`)) {
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

    if (!title || !desc || !url || !category) return showToast('All parameters required.', 'error');
    
    try {
        await addDoc(collection(db, COL), { title, desc, url, category, addedAt: new Date().toISOString() });
        document.getElementById('add-form')?.reset();
        showToast(`Deployment Success: "${title}"`, 'success');
    } catch (err) {
        showToast(`Deployment Failure: ${err.message}`, 'error');
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
        showToast('Parameters Reconfigured.', 'success');
        closeEditModal();
    } catch (err) {
        showToast(`Reconfiguration Failed: ${err.message}`, 'error');
    }
}

window.reqDeleteResource = (id, title) => {
    if (confirm(`Delete "${title}"?`)) {
        deleteDoc(doc(db, COL, id))
            .then(() => showToast(`Artifact Purged.`, 'success'))
            .catch(err => showToast(`Purge Failure: ${err.message}`, 'error'));
    }
};

/**
 * HELPER UI
 */
function updateStatsView(items) {
    document.getElementById('stat-total').textContent = items.length;
    document.getElementById('stat-cats').textContent = new Set(items.map(r => r.category)).size;
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
