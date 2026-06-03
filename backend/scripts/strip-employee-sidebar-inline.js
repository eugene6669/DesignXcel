/**
 * Removes duplicated .sidebar / .logout inline blocks from Employee EJS views.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../views/Employee');
const REPLACEMENT = '\n        /* sidebar layout: /css/Employee/employee-sidebar.css */\n        ';

const PATTERNS = [
  // Variant A: overflow-y on sidebar + flex:1 menu
  /\s*\.sidebar\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;\s*height:\s*100vh;\s*overflow-y:\s*auto;\s*\}\s*\.sidebar-menu\s*\{\s*flex:\s*1;\s*overflow-y:\s*auto;\s*\}\s*\.logout-section\s*\{[^}]*\}\s*\.logout-button\s*\{[^}]*\}\s*\.logout-button:hover\s*\{[^}]*\}\s*/g,
  // Variant B: flex-grow menu, padding 40px logout (most order pages)
  /\s*\.sidebar\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;\s*height:\s*100vh;\s*\}\s*\.sidebar-menu\s*\{\s*flex-grow:\s*1;\s*\}\s*\.logout-section\s*\{[^}]*\}\s*\.logout-button\s*\{[^}]*\}\s*\.logout-button:hover\s*\{[^}]*\}\s*/g,
  // Variant C: reports-style sidebar only (no logout block in chunk)
  /\s*\.sidebar\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;\s*height:\s*100vh;\s*overflow-y:\s*auto;\s*\}\s*/g,
  // Reports pages: custom dashboard-container / main-content
  /\s*\.dashboard-container\s*\{\s*display:\s*flex;\s*min-height:\s*100vh;[^}]*\}\s*(?:\/\*\s*sidebar layout:[^*]*\*\/\s*)?\.main-content\s*\{\s*flex:\s*1;\s*padding:\s*2rem;\s*overflow-y:\s*auto;\s*\}\s*/g,
];

let totalChanged = 0;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (name.endsWith('.ejs')) {
      stripFile(p);
    }
  }
}

function stripFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  for (const re of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(content)) {
      re.lastIndex = 0;
      const next = content.replace(re, REPLACEMENT);
      if (next !== content) {
        content = next;
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    totalChanged += 1;
    console.log('stripped:', path.relative(ROOT, file));
  }
}

walk(ROOT);
console.log('Done. Files updated:', totalChanged);
