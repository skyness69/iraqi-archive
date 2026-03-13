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
    showToast('مدير الخزنة: متصل.', 'success');
    
    // Bind Event Listeners
    document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));
    document.getElementById('add-resource-form')?.addEventListener('submit', handleAddResource);
    document.getElementById('edit-form')?.addEventListener('submit', handleEditResource);
    document.getElementById('cat-form')?.addEventListener('submit', handleCategorySubmit);
    document.getElementById('close-modal')?.addEventListener('click', closeEditModal);

    // Mobile Sidebar Toggles
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const adminSidebar = document.getElementById('admin-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');

    const toggleSidebar = () => {
        adminSidebar?.classList.toggle('active');
        sidebarOverlay?.classList.toggle('active');
    };

    mobileMenuBtn?.addEventListener('click', toggleSidebar);
    closeSidebarBtn?.addEventListener('click', toggleSidebar);
    sidebarOverlay?.addEventListener('click', toggleSidebar);

    // Sidebar Toggles
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href.startsWith('#')) {
                e.preventDefault();
                const section = href.substring(1);
                switchSection(section);
                if (window.innerWidth < 1024) toggleSidebar();
            }
        });
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
            showToast('انتهاك للصلاحيات: الوصول مرفوض.', 'error');
            setTimeout(() => window.location.href = 'index.html', 1500);
            return;
        }
        
        // Grant Access to UI
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        startLiveSync();
    });
}

/**
 * UI NAVIGATION
 */
function switchSection(name) {
    const dashboardSec = document.getElementById('view-dashboard');
    const publishSec = document.getElementById('publish-wrapper');
    const resourceTableSec = document.getElementById('resources-table');
    const bugSec = document.getElementById('view-bug-reports');
    const catSec = document.getElementById('view-categories');
    
    // Hide all
    [dashboardSec, publishSec, resourceTableSec, bugSec, catSec].forEach(s => s?.classList.add('hidden'));
    
    // Deactivate all nav links
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));

    // Show specific section
    if (name === 'dashboard') {
        dashboardSec?.classList.remove('hidden');
        document.querySelector('a[href="#dashboard"]')?.classList.add('active');
    } else if (name === 'resources') {
        resourceTableSec?.classList.remove('hidden');
        document.querySelector('a[href="#resources"]')?.classList.add('active');
    } else if (name === 'bug-reports') {
        bugSec?.classList.remove('hidden');
        document.querySelector('a[href="#bug-reports"]')?.classList.add('active');
        fetchBugReports(); // Load bugs when viewing
    } else if (name === 'add-resource') {
        publishSec?.classList.remove('hidden');
        document.querySelector('a[href="#add-resource"]')?.classList.add('active');
    } else if (name === 'categories') {
        catSec?.classList.remove('hidden');
        document.querySelector('a[href="#categories"]')?.classList.add('active');
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
        fetchBugReports(); // Init bug sync
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
    const container = document.getElementById('bug-reports-container');
    const alertBadge = document.getElementById('bug-alert-badge');
    if (!container) return;

    if (alertBadge) alertBadge.classList.toggle('hidden', items.length === 0);

    if (items.length === 0) {
        container.innerHTML = `
            <div class="py-24 text-center">
                <div class="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg class="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">سجل البلاغات فارغ. لا توجد تقارير.</p>
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
                            <span class="text-xs font-black text-white leading-none">${escHtml(b.user || 'مجهول')}</span>
                            <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-1">${new Date(b.createdAt).toLocaleString()}</span>
                        </div>
                    </div>

                    <h3 class="text-sm font-black text-red-400 mb-3 tracking-tight">${escHtml(b.subject)}</h3>
                    <p class="text-xs text-slate-400 leading-relaxed max-w-3xl">${escHtml(b.message)}</p>

                    ${b.location ? `
                        <div class="flex items-center gap-2 mt-5">
                            <span class="text-[8px] font-black uppercase tracking-widest text-slate-600">مرجع الأرشيف</span>
                            <span class="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-1 rounded-md text-[9px] font-bold">
                                ${escHtml(b.location)}
                            </span>
                        </div>
                    ` : ''}
                </div>                <!-- Actions Section -->
                <div class="flex items-center gap-3 shrink-0">
                    <a href="mailto:${ADMIN_EMAIL}?subject=Re: ${escQ(b.subject)}&body=Regarding your report: %0D%0A%0D%0A${escQ(b.message)}" 
                       class="flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent-primary)] hover:text-black transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                        مراسلة
                    </a>
                    <button onclick="deleteBugReq('${b.id}')" 
                            class="flex items-center gap-2 px-5 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        حل وإزالة
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

window.deleteBugReq = (id) => {
    if (confirm("هل أنت متأكد من حل وإزالة هذا البلاغ؟")) {
        deleteDoc(doc(db, BUG_COL, id))
            .then(() => showToast("تم حل البلاغ.", "success"))
            .catch(err => showToast("فشل: " + err.message, "error"));
    }
};

/**
 * CATEGORY OPERATIONS
 */
function renderCategoriesList(items) {
    const tbody = document.getElementById('category-tbody');
    if (!tbody) return;

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center py-20 text-slate-500 font-bold uppercase tracking-widest text-[10px]">لا توجد أقسام مسجلة. جاري التهيئة...</td></tr>';
        return;
    }

    tbody.innerHTML = items.map((catName, index) => `
        <tr class="group hover:bg-white/5 transition-colors">
            <td class="pl-6"><p style="font-weight:800; color:var(--text-pure); font-size:14px;">${escHtml(catName)}</p></td>
            <td class="pr-6 text-right">
                <div class="flex justify-end gap-2">
                    <button onclick="setEditMode('${index}','${escQ(catName)}')" class="btn-accent !py-2 !px-4 !text-[9px] !rounded-lg !bg-slate-800 !text-white hover:!bg-white hover:!text-black">تعديل</button>
                    <button onclick="deleteCategoryReq('${index}','${escQ(catName)}')" class="!py-2 !px-4 !text-[9px] !rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 font-bold hover:bg-red-500 hover:text-white transition-all">حذف</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function handleCategorySubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('c-name');
    const newName = nameInput?.value.trim();
    if (!newName) return showToast('الإسم مطلوب.', 'error');

    let updatedList = [...categories];
    let oldName = null;
    
    if (editingCatId !== null) {
        oldName = updatedList[parseInt(editingCatId)];
        updatedList[parseInt(editingCatId)] = newName;
    } else {
        if (updatedList.includes(newName)) return showToast('موجود مسبقاً.', 'error');
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
                showToast(`تم نقل ${updatePromises.length} موارد للقسم الجديد.`, 'success');
            }
        }
        
        nameInput.value = '';
        if (editingCatId !== null) clearEditMode();
        showToast('تمت المزامنة بنجاح.', 'success');
    } catch (err) {
        showToast(`فشل المزامنة: ${err.message}`, 'error');
    }
}

window.setEditMode = (index, name) => {
    editingCatId = index;
    const nameInput = document.getElementById('c-name');
    const btnText = document.querySelector('#cat-add-btn span');
    if (nameInput) nameInput.value = name;
    if (btnText) btnText.textContent = 'تطبيق التعديل';
    
    if (!document.getElementById('cat-cancel')) {
        const cancel = document.createElement('button');
        cancel.id = 'cat-cancel';
        cancel.type = 'button';
        cancel.textContent = 'إلغاء التعديل';
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
    if (btnText) btnText.textContent = 'إضافة قسم';
    document.getElementById('cat-cancel')?.remove();
}

window.deleteCategoryReq = (index, name) => {
    if (confirm(`هل أنت متأكد من حذف "${name}"؟`)) {
        let updatedList = categories.filter((_, i) => i !== parseInt(index));
        setDoc(doc(db, COL, CAT_DOC_ID), { list: updatedList })
            .then(() => showToast(`تم الحذف.`, 'success'))
            .catch(err => showToast(`فشل الحذف: ${err.message}`, 'error'));
    }
};

/**
 * RESOURCE OPERATIONS
 */
function renderResourcesTable(items) {
    const tbody = document.getElementById('resources-tbody');
    const countBadge = document.getElementById('resource-count-badge');
    if (!tbody) return;
    
    if (countBadge) countBadge.textContent = items.length;

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-24 text-slate-500 uppercase font-black text-xs tracking-widest">لا توجد موارد محفوظة.</td></tr>';
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
            <td><span class="inline-block px-3 py-1 rounded-full bg-slate-900 border border-white/5 text-[9px] font-black text-slate-400 uppercase tracking-widest">${escHtml(r.category || 'أخرى')}</span></td>
            <td class="pr-6 text-right">
                <div class="flex justify-end gap-2">
                    <button onclick="reqEditResource('${r.id}','${escQ(r.title)}','${escQ(r.desc)}','${escQ(r.url)}','${escQ(r.category)}')" class="btn-accent !py-2 !px-4 !text-[9px] !rounded-lg !bg-white !text-black hover:!bg-red-500 hover:!text-white">تعديل</button>
                    <button onclick="reqDeleteResource('${r.id}','${escQ(r.title)}')" class="!py-2 !px-4 !text-[9px] !rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 font-bold hover:bg-red-500 hover:text-white transition-all">حذف</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function handleAddResource(e) {
    e.preventDefault();
    const title = document.getElementById('title')?.value.trim();
    const desc = document.getElementById('description')?.value.trim();
    const url = document.getElementById('link')?.value.trim();
    const category = document.getElementById('category')?.value;
    if (!title || !desc || !url || !category) return showToast('فشل: جميع الحقول مطلوبة.', 'error');
    try {
        await addDoc(collection(db, COL), { title, desc, url, category, addedAt: new Date().toISOString() });
        document.getElementById('add-resource-form')?.reset();
        showToast(`تم نشر المورد بنجاح.`, 'success');
    } catch (err) {
        showToast(`فشل: ${err.message}`, 'error');
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
        showToast('تم تحديث المورد بنجاح.', 'success');
        closeEditModal();
    } catch (err) {
        showToast(`فشل: ${err.message}`, 'error');
    }
}

window.reqDeleteResource = (id, title) => {
    if (confirm(`هل أنت متأكد من حذف "${title}"؟`)) {
        deleteDoc(doc(db, COL, id))
            .then(() => showToast(`تم حذف المورد.`, 'success'))
            .catch(err => showToast(`فشل الحذف: ${err.message}`, 'error'));
    }
};

function updateStatsView(items) {
    const totalResourcesElem = document.getElementById('stat-total-resources');
    const newResourcesElem = document.getElementById('stat-new-resources');
    const activeReportsElem = document.getElementById('stat-active-reports');

    if (totalResourcesElem) totalResourcesElem.textContent = items.length;
    
    // Simple logic for "New" (e.g., added today)
    const today = new Date().toISOString().split('T')[0];
    const newItems = items.filter(r => r.addedAt && r.addedAt.startsWith(today)).length;
    if (newResourcesElem) newResourcesElem.textContent = newItems;

    if (activeReportsElem) activeReportsElem.textContent = bugReports.length;
}

function updateCategoryOptions(cats) {
    const fCat = document.getElementById('category');
    const eCat = document.getElementById('e-category');
    if (!fCat || !eCat) return;

    const options = cats.map(c => `<option value="${escQ(c)}">${escHtml(c)}</option>`).join('');
    
    fCat.innerHTML = `<option value="">اختر تصنيف</option>` + options;
    eCat.innerHTML = options;
}
