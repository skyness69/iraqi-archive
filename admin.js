/**
 * admin.js — Iraqi Archive Admin Dashboard
 * RESTRICTED: Only accessible by alaidan25@gmail.com
 */

import {
    auth, db, ADMIN_EMAIL,
    onAuthStateChanged, signOut,
    collection, addDoc, deleteDoc, updateDoc, onSnapshot,
    doc
} from './firebase-config.js';

import { showToast, escHtml, escQ, shortUrl } from './utils.js';

const COL      = 'resources';
const CAT_COL  = 'categories';

// State
let categories = [];
let resources = [];
let editingCatId = null;
let unsubRes = null;
let unsubCat = null;

// ================================================================
// INIT & AUTH
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Show boot message
    showToast('Portal Booted. Verifying Administration...', 'success');
    
    // Bind Static Listeners
    document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));
    document.getElementById('add-form')?.addEventListener('submit', handleAddResource);
    document.getElementById('edit-form')?.addEventListener('submit', handleEditResource);
    document.getElementById('cat-form')?.addEventListener('submit', handleCategorySubmit);
    document.getElementById('close-modal')?.addEventListener('click', closeEditModal);

    // Sidebar Navigation
    document.getElementById('side-nav-resources')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchSection('resources');
    });
    document.getElementById('side-nav-categories')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchSection('categories');
    });

    // Modal click-away
    const editModal = document.getElementById('edit-modal');
    editModal?.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

    initAuth();
});

function initAuth() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'auth.html';
            return;
        }
        if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
            showToast('Unauthorized. Admin access only.', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }
        
        // Grant Access
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('admin-email').textContent = user.email;
        document.getElementById('admin-avatar').textContent = user.email[0].toUpperCase();
        
        startLiveSync();
    });
}

function switchSection(name) {
    const resSec = document.getElementById('resources-section');
    const catSec = document.getElementById('categories-section');
    const resNav = document.getElementById('side-nav-resources');
    const catNav = document.getElementById('side-nav-categories');

    if (name === 'resources') {
        resSec.classList.remove('hidden');
        catSec.classList.add('hidden');
        resNav.classList.add('active');
        catNav.classList.remove('active');
    } else {
        resSec.classList.add('hidden');
        catSec.classList.remove('hidden');
        resNav.classList.remove('active');
        catNav.classList.add('active');
    }
}

// ================================================================
// FIRESTORE SYNC
// ================================================================
function startLiveSync() {
    if (unsubRes) unsubRes();
    if (unsubCat) unsubCat();

    // Sync Resources
    unsubRes = onSnapshot(collection(db, COL), (snap) => {
        resources = [];
        snap.forEach(d => resources.push({ id: d.id, ...d.data() }));
        resources.sort((a,b) => (a.title || '').localeCompare(b.title || ''));
        renderResourcesTable(resources);
        updateDashboardStats(resources);
    }, err => showToast('Resource Sync Failed: ' + err.message, 'error'));

    // Sync Categories
    unsubCat = onSnapshot(collection(db, CAT_COL), (snap) => {
        categories = [];
        snap.forEach(d => categories.push({ id: d.id, ...d.data() }));
        categories.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        renderCategoriesTable(categories);
        populateCategoryDropdowns(categories);
    }, err => showToast('Category Sync Failed: ' + err.message, 'error'));
}

// ================================================================
// CATEGORY LOGIC
// ================================================================
function renderCategoriesTable(items) {
    const tbody = document.getElementById('category-tbody');
    if (!tbody) return;

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:4rem;color:var(--text-muted);">No categories found. Add one on the left.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(c => `
        <tr>
            <td><p style="font-weight:800; color:var(--text-pure); font-size:14px;">${escHtml(c.name)}</p></td>
            <td style="text-align:right">
                <div class="flex justify-end gap-3">
                    <button onclick="editCategoryMode('${c.id}','${escQ(c.name)}')" class="btn-accent" style="padding:6px 12px; font-size:10px; border-radius:10px; box-shadow:none;">EDIT</button>
                    <button onclick="handleDeleteCategory('${c.id}','${escQ(c.name)}')" style="padding:6px 12px; border-radius:10px; border:0.5px solid rgba(239,68,68,0.2); background:rgba(239,68,68,0.05); color:#fca5a5; font-size:10px; font-weight:800; cursor:pointer;">DELETE</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function handleCategorySubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('c-name');
    const btn = document.getElementById('cat-add-btn');
    const name = nameInput.value.trim();

    if (!name) return showToast('Please enter a name.', 'error');

    btn.disabled = true;
    const initialText = btn.innerHTML;
    btn.innerHTML = 'Syncing...';

    try {
        if (editingCatId) {
            await updateDoc(doc(db, CAT_COL, editingCatId), { name });
            showToast(`Category updated to "${name}"`, 'success');
            cancelCategoryEdit();
        } else {
            await addDoc(collection(db, CAT_COL), { name, createdAt: new Date().toISOString() });
            showToast(`Category "${name}" created!`, 'success');
        }
        nameInput.value = '';
    } catch (err) {
        showToast('Operation Failed: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = initialText;
    }
}

window.editCategoryMode = (id, name) => {
    editingCatId = id;
    document.getElementById('c-name').value = name;
    document.querySelector('#cat-add-btn span').textContent = 'Update Category';
    
    if (!document.getElementById('cat-cancel-btn')) {
        const cancel = document.createElement('button');
        cancel.id = 'cat-cancel-btn';
        cancel.type = 'button';
        cancel.textContent = 'Cancel Edit';
        cancel.className = 'w-full mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest';
        cancel.onclick = cancelCategoryEdit;
        document.getElementById('cat-form').appendChild(cancel);
    }
    document.getElementById('c-name').focus();
};

function cancelCategoryEdit() {
    editingCatId = null;
    document.getElementById('c-name').value = '';
    document.querySelector('#cat-add-btn span').textContent = 'Create Category';
    document.getElementById('cat-cancel-btn')?.remove();
}

window.handleDeleteCategory = (id, name) => {
    if (confirm(`Absolutely delete "${name}"?\nResources will lose their section assignment.`)) {
        deleteDoc(doc(db, CAT_COL, id))
            .then(() => showToast(`Removed "${name}"`, 'success'))
            .catch(err => showToast('Delete failed: ' + err.message, 'error'));
    }
};

// ================================================================
// RESOURCE LOGIC
// ================================================================
function renderResourcesTable(items) {
    const tbody = document.getElementById('resource-tbody');
    const count = document.getElementById('table-count');
    if (!tbody || !count) return;

    count.textContent = `${items.length} ITEMS`;

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:6rem;color:var(--text-muted);">Database Empty. Project Initialized.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(r => `
        <tr>
            <td>
                <div class="flex items-center gap-4">
                    <div class="logo-box" style="width:36px; height:36px; font-size:12px; flex-shrink:0;">${(r.title || '?')[0].toUpperCase()}</div>
                    <div>
                        <p style="font-weight:800; color:var(--text-pure); font-size:14px;">${escHtml(r.title)}</p>
                        <a href="${escHtml(r.url)}" target="_blank" style="color:var(--accent-primary); font-size:11px; text-decoration:none;">${shortUrl(r.url)}</a>
                    </div>
                </div>
            </td>
            <td><span class="badge-saas" style="font-size:9px;">${escHtml(r.category || 'Uncategorized')}</span></td>
            <td>
                <div class="flex justify-end gap-3">
                    <button onclick="openResourceModal('${r.id}','${escQ(r.title)}','${escQ(r.desc)}','${escQ(r.url)}','${escQ(r.category)}')" class="btn-accent" style="padding:6px 12px; font-size:10px; border-radius:10px; box-shadow:none;">EDIT</button>
                    <button onclick="handleDeleteResource('${r.id}','${escQ(r.title)}')" style="padding:6px 12px; border-radius:10px; border:0.5px solid rgba(239,68,68,0.2); background:rgba(239,68,68,0.05); color:#fca5a5; font-size:10px; font-weight:800; cursor:pointer;">DELETE</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function handleAddResource(e) {
    e.preventDefault();
    const title = document.getElementById('f-title').value.trim();
    const desc = document.getElementById('f-desc').value.trim();
    const url = document.getElementById('f-url').value.trim();
    const category = document.getElementById('f-category').value;

    if (!title || !desc || !url || !category) return showToast('Fill all fields.', 'error');
    
    try {
        await addDoc(collection(db, COL), { title, desc, url, category, addedAt: new Date().toISOString() });
        document.getElementById('add-form').reset();
        showToast(`Resource "${title}" deployed!`, 'success');
    } catch (err) {
        showToast('Deployment Failed: ' + err.message, 'error');
    }
}

window.openResourceModal = (id, title, desc, url, category) => {
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
        showToast('Resource updated!', 'success');
        closeEditModal();
    } catch (err) {
        showToast('Update Failed: ' + err.message, 'error');
    }
}

window.handleDeleteResource = (id, title) => {
    if (confirm(`Delete "${title}"?`)) {
        deleteDoc(doc(db, COL, id))
            .then(() => showToast(`Resource deleted.`, 'success'))
            .catch(err => showToast('Delete failed: ' + err.message, 'error'));
    }
};

function updateDashboardStats(items) {
    document.getElementById('stat-total').textContent = items.length;
    document.getElementById('stat-cats').textContent = new Set(items.map(r => r.category)).size;
    document.getElementById('stat-date').textContent = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

function populateCategoryDropdowns(cats) {
    const fCat = document.getElementById('f-category');
    const eCat = document.getElementById('e-category');
    if (!fCat || !eCat) return;

    const html = `
        <option value="">Select Section</option>
        ${cats.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join('')}
    `;
    fCat.innerHTML = html;
    eCat.innerHTML = html;
}
