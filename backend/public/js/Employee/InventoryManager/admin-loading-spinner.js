/**
 * Admin Loading Spinner Utility
 * Simple, clean loading spinner helper functions for all admin pages
 */

// Show loading spinner
function showLoadingSpinner(spinnerId = 'admin-loading-spinner', text = 'Loading...') {
    const spinner = document.getElementById(spinnerId);
    if (spinner) {
        const textElement = spinner.querySelector('.admin-loading-spinner__text');
        if (textElement && text) {
            textElement.textContent = text;
        }
        spinner.classList.remove('hidden');
        spinner.style.display = 'flex';
    }
}

// Hide loading spinner
function hideLoadingSpinner(spinnerId = 'admin-loading-spinner') {
    const spinner = document.getElementById(spinnerId);
    if (spinner) {
        spinner.classList.add('hidden');
        spinner.style.display = 'none';
    }
}

// Toggle loading spinner
function toggleLoadingSpinner(spinnerId = 'admin-loading-spinner', show = true, text = 'Loading...') {
    if (show) {
        showLoadingSpinner(spinnerId, text);
    } else {
        hideLoadingSpinner(spinnerId);
    }
}

// Show spinner with async operation wrapper
async function withLoadingSpinner(asyncFn, spinnerId = 'admin-loading-spinner', loadingText = 'Loading...') {
    try {
        showLoadingSpinner(spinnerId, loadingText);
        const result = await asyncFn();
        return result;
    } finally {
        hideLoadingSpinner(spinnerId);
    }
}

// Create spinner HTML (for dynamic creation)
function createLoadingSpinner(id = 'admin-loading-spinner', text = 'Loading...', className = '') {
    return `
        <div id="${id}" class="admin-loading-spinner hidden ${className}">
            <div class="admin-loading-spinner__container">
                <div class="admin-loading-spinner__spinner"></div>
                ${text ? `<div class="admin-loading-spinner__text">${text}</div>` : ''}
            </div>
        </div>
    `;
}

