/**
 * utils.js — Iraqi Archive | Shared Utilities
 * Centralized functions used across multiple modules.
 */

/**
 * Displays a non-blocking toast notification.
 * @param {string} msg 
 * @param {'success' | 'error'} type 
 */
export function showToast(msg, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        Object.assign(container.style, {
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        });
        document.body.appendChild(container);
    }

    const styles = {
        success: 'background: rgba(16, 185, 129, 0.1); border: 0.5px solid var(--status-success); color: var(--status-success);',
        error:   'background: rgba(239, 68, 68, 0.1); border: 0.5px solid var(--status-error); color: var(--status-error);'
    };
    const icons = {
        success: '✓',
        error:   '✕'
    };

    const toast = document.createElement('div');
    toast.style.cssText = `
        ${styles[type]}
        padding: 12px 18px; 
        border-radius: 12px;
        font-size: 13px; 
        font-weight: 700;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        backdrop-filter: blur(10px);
        display: flex; 
        align-items: center; 
        gap: 10px;
        animation: slideInToast 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        min-width: 240px;
    `;
    toast.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;

    // Inject animation keyframes once
    if (!document.getElementById('toast-style')) {
        const s = document.createElement('style');
        s.id = 'toast-style';
        s.textContent = `
            @keyframes slideInToast {
                from { opacity: 0; transform: translateX(60px); }
                to { opacity: 1; transform: translateX(0); }
            }
        `;
        document.head.appendChild(s);
    }

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(60px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Escapes HTML characters to prevent XSS.
 * @param {string} str 
 */
export function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Escapes strings for use in single-quoted HTML attributes.
 * @param {string} str 
 */
export function escQ(str) {
    if (!str) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;');
}

/**
 * Shortens a URL to its hostname.
 * @param {string} url 
 */
export function shortUrl(url) {
    if (!url) return '';
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return url;
    }
}

/**
 * Formats a date string to a readable format.
 * @param {string} dateStr 
 */
export function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}
