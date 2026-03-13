/**
 * admin.js â€” Iraqi Archive Admin Dashboard
 * RESTRICTED: Only accessible by alaidan25@gmail.com
 * Features: Add, Edit (modal), Delete resources via Firestore.
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

// ================================================================
// DOM REFERENCES
// ================================================================
const accessScreen  = document.getElementById('access-denied');
const dashboard     = document.getElementById('dashboard');
const adminEmailEl  = document.getElementById('admin-email');
const adminAvatarEl = document.getElementById('admin-avatar');
const logoutBtn     = document.getElementById('logout-btn');
const addForm       = document.getElementById('add-form');
const addBtn        = document.getElementById('add-btn');
const addBtnText    = document.getElementById('add-btn-text');
const addSpinner    = document.getElementById('add-btn-spinner');
const tbody         = document.getElementById('resource-tbody');
const tableCount    = document.getElementById('table-count');
const statTotal     = document.getElementById('stat-total');
const statCats      = document.getElementById('stat-cats');
const statDate      = document.getElementById('stat-date');
// Edit modal
const editModal     = document.getElementById('edit-modal');
const editForm      = document.getElementById('edit-form');
const editId        = document.getElementById('edit-id');
const editTitle     = document.getElementById('e-title');
const editDesc      = document.getElementById('e-desc');
const editUrl       = document.getElementById('e-url');
const editCategory  = document.getElementById('e-category');
const editBtnText   = document.getElementById('edit-btn-text');
const editSpinner   = document.getElementById('edit-btn-spinner');

// Sections
const resourcesSection = document.getElementById('resources-section');
const categoriesSection = document.getElementById('categories-section');
const sideNavResources = document.getElementById('side-nav-resources');
const sideNavCategories = document.getElementById('side-nav-categories');

// Category Management
const catForm = document.getElementById('cat-form');
const catTbody = document.getElementById('category-tbody');

let unsubscribeRes = null;
let unsubscribeCat = null;
let categories = []; 
let editingCatId = null; // Track which category we are editing

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    logoutBtn?.addEventListener('click', () => signOut(auth));
    addForm?.addEventListener('submit', handleAdd);
    editForm?.addEventListener('submit', handleEdit);
    catForm?.addEventListener('submit', handleAddCategory);
    
    document.getElementById('close-modal')?.addEventListener('click', closeEditModal);
    editModal?.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

    sideNavResources?.addEventListener('click', (e) => {
        e.preventDefault();
        showSection('resources');
    });
    sideNavCategories?.addEventListener('click', (e) => {
        e.preventDefault();
        showSection('categories');
    });

    initAdminAuth();
});

// ================================================================
// AUTH GUARD
// ================================================================
function initAdminAuth() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            showAccessDenied('Please sign in first.');
            setTimeout(() => window.location.href = 'auth.html', 1800);
            return;
        }
        if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
            showAccessDenied('â›” Access Denied â€” Admin Only');
            showToast('Access denied. Redirecting...', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }
        grantAccess(user);
    });
}

function showAccessDenied(msg) {
    document.getElementById('access-msg').textContent = msg;
    document.getElementById('access-msg').style.color = '#f87171';
}

function grantAccess(user) {
    accessScreen.style.display = 'none';
    dashboard.style.display    = 'block';
    adminEmailEl.textContent   = user.email;
    adminAvatarEl.textContent  = user.email[0].toUpperCase();
    startListeners();
}

function showSection(name) {
    if (name === 'resources') {
        resourcesSection.classList.remove('hidden');
        categoriesSection.classList.add('hidden');
        sideNavResources.classList.add('active');
        sideNavCategories.classList.remove('active');
    } else {
        resourcesSection.classList.add('hidden');
        categoriesSection.classList.remove('hidden');
        sideNavResources.classList.remove('active');
        sideNavCategories.classList.add('active');
    }
}

// ================================================================
// REAL-TIME LISTENERS
// ================================================================
function startListeners() {
    if (unsubscribeRes) unsubscribeRes();
    if (unsubscribeCat) unsubscribeCat();

    // Resources
    unsubscribeRes = onSnapshot(collection(db, COL), (snap) => {
        const items = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
        items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        renderTable(items);
        updateStats(items);
    }, err => showToast('Sync error: ' + err.message, 'error'));

    // Categories
    unsubscribeCat = onSnapshot(collection(db, CAT_COL), (snap) => {
        categories = [];
        snap.forEach(d => categories.push({ id: d.id, ...d.data() }));
        categories.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderCategoryTable(categories);
        updateCategorySelects();
    }, err => showToast('Cat Sync error: ' + err.message, 'error'));
}

function updateCategorySelects() {
    const fCat = document.getElementById('f-category');
    const eCat = document.getElementById('e-category');
    if (!fCat || !eCat) return;

    const options = `
        <option value="">Select Category</option>
        ${categories.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join('')}
    `;
    fCat.innerHTML = options;
    eCat.innerHTML = options;
}

// ================================================================
// RENDER TABLE
// ================================================================
function renderTable(items) {
    if (!tbody || !tableCount) return;
    tableCount.textContent = `${items.length} ITEMS`;

    if (items.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="3" style="text-align:center;padding:6rem;color:var(--text-muted);">
                <p style="font-size:14px; font-weight:600;">No resources in database. Start by adding one below.</p>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(r => `
        <tr>
            <td>
                <div class="flex items-center gap-4">
                    <div class="logo-box" style="width:38px; height:38px; font-size:12px; flex-shrink:0;">
                        ${(r.title || '?')[0].toUpperCase()}
                    </div>
                    <div>
                        <p style="font-weight:800; color:var(--text-pure); font-size:14px; letter-spacing:-0.02em;">${escHtml(r.title || '')}</p>
                        <a href="${escHtml(r.url || '#')}" target="_blank" rel="noopener" 
                           style="color:var(--accent-primary); font-size:11px; margin-top:2px; text-decoration:none; display:inline-block;">
                           ${shortUrl(r.url || '')} â†—
                        </a>
                    </div>
                </div>
            </td>
            <td>
                <span class="badge-saas" style="font-size:9px; padding:4px 10px;">${escHtml(r.category || '')}</span>
            </td>
            <td>
                <div class="flex justify-end gap-3">
                    <button onclick="openEditModal('${r.id}','${escQ(r.title)}','${escQ(r.desc)}','${escQ(r.url)}','${escQ(r.category)}')"
                        class="btn-accent" style="padding:8px 14px; font-size:10px; border-radius:10px; box-shadow:none;">
                        EDIT
                    </button>
                    <button onclick="confirmDelete('${r.id}','${escQ(r.title)}')"
                        style="padding:8px 14px; border-radius:10px; border:0.5px solid rgba(239,68,68,0.2); 
                               background:rgba(239,68,68,0.05); color:#fca5a5; font-size:10px; font-weight:800; cursor:pointer;">
                        DELETE
                    </button>
                </div>
            </td>
        </tr>`).join('');
}

function updateStats(items) {
    statTotal.textContent = items.length;
    statCats.textContent  = new Set(items.map(r => r.category).filter(Boolean)).size;
    statDate.textContent  = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

// ================================================================
// ADD RESOURCE
// ================================================================
async function handleAdd(e) {
    e.preventDefault();
    const title    = document.getElementById('f-title').value.trim();
    const desc     = document.getElementById('f-desc').value.trim();
    const url      = document.getElementById('f-url').value.trim();
    const category = document.getElementById('f-category').value;

    if (!title || !desc || !url || !category) {
        showToast('Please fill in all fields.', 'error'); return;
    }
    try { new URL(url); } catch {
        showToast('Please enter a valid URL (include https://).', 'error'); return;
    }

    setAddLoading(true);
    try {
        await addDoc(collection(db, COL), {
            title, desc, url, category,
            addedAt: new Date().toISOString()
        });
        addForm.reset();
        showToast(`"${title}" added successfully! âœ“`, 'success');
    } catch (err) {
        showToast('Failed to add: ' + err.message, 'error');
    } finally {
        setAddLoading(false);
    }
}

function setAddLoading(on) {
    addBtn.disabled       = on;
    addBtnText.textContent = on ? 'DEPLOYING...' : 'DEPLOY RESOURCE';
    addSpinner.style.display = on ? 'block' : 'none';
}

// ================================================================
// EDIT MODAL
// ================================================================
window.openEditModal = (id, title, desc, url, category) => {
    editId.value       = id;
    editTitle.value    = title;
    editDesc.value     = desc;
    editUrl.value      = url;
    editCategory.value = category;
    editModal.style.display = 'flex';
    editModal.style.animation = 'fadeInModal 0.25s ease';
};

function closeEditModal() {
    editModal.style.opacity   = '0';
    editModal.style.transition = 'opacity 0.2s';
    setTimeout(() => {
        editModal.style.display  = 'none';
        editModal.style.opacity  = '1';
        editModal.style.transition = '';
    }, 200);
}

async function handleEdit(e) {
    e.preventDefault();
    const id       = editId.value;
    const title    = editTitle.value.trim();
    const desc     = editDesc.value.trim();
    const url      = editUrl.value.trim();
    const category = editCategory.value;

    if (!title || !desc || !url || !category) {
        showToast('Please fill in all fields.', 'error'); return;
    }

    editBtnText.textContent    = 'Saving...';
    editSpinner.style.display  = 'block';
    document.getElementById('edit-btn').disabled = true;

    try {
        await updateDoc(doc(db, COL, id), { title, desc, url, category });
        showToast(`"${title}" updated! âœ“`, 'success');
        closeEditModal();
    } catch (err) {
        showToast('Update failed: ' + err.message, 'error');
    } finally {
        editBtnText.textContent    = 'Save Changes';
        editSpinner.style.display  = 'none';
        document.getElementById('edit-btn').disabled = false;
    }
}

// ================================================================
// DELETE
// ================================================================
window.confirmDelete = (id, title) => {
    if (confirm(`Delete "${title}"?\n\nThis removes it from the archive for all users.`)) {
        deleteResource(id, title);
    }
};

async function deleteResource(id, title) {
    try {
        await deleteDoc(doc(db, COL, id));
        showToast(`"${title}" deleted.`, 'success');
    } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
    }
}

// ================================================================
// CATEGORY MANAGEMENT
// ================================================================
function renderCategoryTable(items) {
    const tbody = document.getElementById('category-tbody');
    if (!tbody) return;

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:4rem;color:var(--text-muted);"><p>No categories defined.</p></td></tr>';
        return;
    }

    tbody.innerHTML = items.map(c => `
        <tr>
            <td><p style="font-weight:800; color:var(--text-pure); font-size:14px;">${escHtml(c.name)}</p></td>
            <td style="text-align:right">
                <div class="flex justify-end gap-3">
                    <button onclick="openEditCategory('${c.id}','${escQ(c.name)}')"
                        class="btn-accent" style="padding:8px 14px; font-size:10px; border-radius:10px; box-shadow:none;">
                        EDIT
                    </button>
                    <button onclick="confirmDeleteCategory('${c.id}','${escQ(c.name)}')"
                        style="padding:8px 14px; border-radius:10px; border:0.5px solid rgba(239,68,68,0.2); 
                               background:rgba(239,68,68,0.05); color:#fca5a5; font-size:10px; font-weight:800; cursor:pointer;">
                        DELETE
                    </button>
                </div>
            </td>
        </tr>`).join('');
}

async function handleAddCategory(e) {
    e.preventDefault();
    const nameInput = document.getElementById('c-name');
    const btn = document.getElementById('cat-add-btn');
    const name = nameInput.value.trim();

    if (!name) return;

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Processing...';

    try {
        if (editingCatId) {
            // Update mode
            await updateDoc(doc(db, CAT_COL, editingCatId), { name });
            showToast(`Category updated to "${name}"`, 'success');
            cancelEditCategory();
        } else {
            // Add mode
            await addDoc(collection(db, CAT_COL), { name });
            showToast(`Category "${name}" created!`, 'success');
        }
        nameInput.value = '';
    } catch (err) {
        showToast('Operation failed: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.openEditCategory = (id, name) => {
    editingCatId = id;
    const nameInput = document.getElementById('c-name');
    const btnSpan = document.querySelector('#cat-add-btn span');
    
    if (nameInput) nameInput.value = name;
    if (btnSpan) btnSpan.textContent = 'Update Category';
    
    // Add a cancel button if it doesn't exist
    if (!document.getElementById('cat-cancel-btn')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cat-cancel-btn';
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel Edit';
        cancelBtn.className = 'w-full mt-4 text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-colors';
        cancelBtn.onclick = cancelEditCategory;
        document.getElementById('cat-form').appendChild(cancelBtn);
    }
    
    nameInput.focus();
};

function cancelEditCategory() {
    editingCatId = null;
    const nameInput = document.getElementById('c-name');
    const btnSpan = document.querySelector('#cat-add-btn span');
    const cancelBtn = document.getElementById('cat-cancel-btn');
    
    if (nameInput) nameInput.value = '';
    if (btnSpan) btnSpan.textContent = 'Create Category';
    if (cancelBtn) cancelBtn.remove();
}

window.confirmDeleteCategory = (id, name) => {
    if (confirm(`Delete category "${name}"?\n\nCaution: Resources using this category will still exist but without an assigned section.`)) {
        deleteDoc(doc(db, CAT_COL, id))
            .then(() => showToast(`Category "${name}" removed.`, 'success'))
            .catch(err => showToast('Delete failed: ' + err.message, 'error'));
    }
};

