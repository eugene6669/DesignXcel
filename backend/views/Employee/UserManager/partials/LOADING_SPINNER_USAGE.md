# Admin Loading Spinner Usage Guide

A simple, elegant loading spinner component that matches the admin design system.

## Quick Start

### Option 1: Include the Partial (Recommended)

Include the spinner partial in your EJS page:

```ejs
<%- include('partials/loading-spinner', { 
    text: 'Loading orders...',
    size: 'medium',
    overlay: false,
    fullscreen: false,
    className: '',
    id: 'my-spinner'
}) %>
```

### Option 2: Inline HTML (Simple)

Add the HTML directly in your page:

```ejs
<div id="my-loading-spinner" class="admin-loading-spinner hidden">
    <div class="admin-loading-spinner__container">
        <div class="admin-loading-spinner__spinner"></div>
        <div class="admin-loading-spinner__text">Loading...</div>
    </div>
</div>
```

Then add the CSS styles from the partial or include them in your page's `<style>` section.

## Parameters

- `text` (optional): Loading text to display. Default: 'Loading...'
- `size` (optional): Spinner size. Options: 'small', 'medium', 'large'. Default: 'medium'
- `overlay` (optional): Show as overlay. Default: false
- `fullscreen` (optional): Show as fullscreen overlay. Default: false
- `className` (optional): Additional CSS classes. Default: ''
- `id` (optional): Custom ID for the spinner. Default: 'admin-loading-spinner'

## JavaScript Usage

### Show Spinner

```javascript
function showLoadingSpinner(text = 'Loading...') {
    const spinner = document.getElementById('my-loading-spinner');
    if (spinner) {
        const textElement = spinner.querySelector('.admin-loading-spinner__text');
        if (textElement && text) {
            textElement.textContent = text;
        }
        spinner.classList.remove('hidden');
        spinner.style.display = 'flex';
    }
}

// Usage
showLoadingSpinner('Loading orders...');
```

### Hide Spinner

```javascript
function hideLoadingSpinner() {
    const spinner = document.getElementById('my-loading-spinner');
    if (spinner) {
        spinner.classList.add('hidden');
        spinner.style.display = 'none';
    }
}

// Usage
hideLoadingSpinner();
```

## Examples

### Example 1: Loading Orders

```ejs
<div id="orders-loading-spinner" class="admin-loading-spinner hidden">
    <div class="admin-loading-spinner__container">
        <div class="admin-loading-spinner__spinner"></div>
        <div class="admin-loading-spinner__text">Loading orders...</div>
    </div>
</div>

<script>
    // Show spinner before loading
    showLoadingSpinner('Loading orders...');
    
    // Load data...
    fetch('/api/orders')
        .then(response => response.json())
        .then(data => {
            // Hide spinner after loading
            hideLoadingSpinner();
            // Update UI with data
        });
</script>
```

### Example 2: Fullscreen Loading

```ejs
<%- include('partials/loading-spinner', { 
    text: 'Processing request...',
    fullscreen: true,
    id: 'fullscreen-loader'
}) %>
```

### Example 3: Overlay on Container

```ejs
<div class="data-container" style="position: relative;">
    <%- include('partials/loading-spinner', { 
        text: 'Loading data...',
        overlay: true,
        id: 'container-loader'
    }) %>
    
    <div id="data-content">
        <!-- Your content here -->
    </div>
</div>
```

## Customization

The spinner uses CSS variables from the admin design system:
- `--primary-color`: Spinner color (default: #F0B21B)
- `--text-light`: Text color (default: #7f8c8d)
- `--font-primary`: Font family (default: Inter)

You can override these in your page styles if needed.

## Design

- Simple circular spinner with rotating border
- Matches admin color scheme (primary yellow/gold)
- Smooth animation (0.8s linear infinite)
- Responsive and accessible
- Lightweight and performant

