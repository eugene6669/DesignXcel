(function () {
    'use strict';

    var MENU_BUTTON_SELECTORS = [
        '.pi-icon-details-btn',
        '.pi-icon-archive-btn',
        '.archive-material-btn',
        '.delete-bom-bundle-btn',
        '.delete-inventory-btn',
        '.product-storefront-btn',
        '.variation-storefront-btn'
    ].join(',');

    var SVG_MORE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18.5" r="1.6"/></svg>';

    var SVG_DETAILS = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path stroke-linecap="round" d="M9 4.5V3a3 3 0 016 0v1.5M9 10h6M9 14h6M9 18h6"/></svg>';
    var SVG_ARCHIVE = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>';
    var SVG_STOREFRONT = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>';
    var SVG_MOVEMENT = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="3"/></svg>';
    var SVG_ADD_VAR = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 4v16m8-8H4"/></svg>';
    var SVG_DEFAULT = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"/></svg>';

    var openState = null;

    function labelForElement(el) {
        return el.getAttribute('data-pi-menu-label') ||
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            (el.textContent && el.textContent.trim()) ||
            'Action';
    }

    function iconForButton(btn) {
        if (btn.classList.contains('pi-icon-details-btn') ||
            btn.classList.contains('inventory-product-details-btn') ||
            btn.classList.contains('inventory-variation-details-btn')) {
            return SVG_DETAILS;
        }
        if (btn.classList.contains('pi-icon-archive-btn') ||
            btn.classList.contains('archive-material-btn') ||
            btn.classList.contains('delete-inventory-btn') ||
            btn.classList.contains('delete-bom-bundle-btn') ||
            btn.classList.contains('archive-variation-btn')) {
            return SVG_ARCHIVE;
        }
        if (btn.classList.contains('product-storefront-btn') ||
            btn.classList.contains('variation-storefront-btn')) {
            return SVG_STOREFRONT;
        }
        if (btn.classList.contains('add-variation-row-btn') ||
            btn.classList.contains('pi-menu-extra-action')) {
            return SVG_ADD_VAR;
        }
        if (btn.classList.contains('pi-menu-extra-link')) {
            return SVG_MOVEMENT;
        }
        return SVG_DEFAULT;
    }

    function isDangerButton(btn) {
        return btn.classList.contains('pi-icon-archive-btn') ||
            btn.classList.contains('archive-material-btn') ||
            btn.classList.contains('delete-inventory-btn') ||
            btn.classList.contains('delete-bom-bundle-btn') ||
            btn.classList.contains('archive-variation-btn');
    }

    function isMenuButton(btn) {
        if (!btn || btn.closest('.pi-actions-menu-triggers')) return false;
        if (btn.classList.contains('pi-icon-more-btn')) return false;
        if (btn.closest('.pi-actions-extra-triggers')) return false;
        return btn.matches(MENU_BUTTON_SELECTORS);
    }

    function isExtraAction(el) {
        return el && (el.matches('.pi-menu-extra-action, .add-variation-row-btn') && el.closest('.pi-actions-extra-triggers'));
    }

    function isExtraLink(el) {
        return el && el.matches('a.pi-menu-extra-link');
    }

    function positionFloatingMenu(menu, anchor) {
        menu.classList.add('pi-actions-menu--floating');
        menu.style.visibility = 'hidden';
        menu.hidden = false;

        if (menu.parentNode !== document.body) {
            document.body.appendChild(menu);
        }

        var rect = anchor.getBoundingClientRect();
        var menuWidth = menu.offsetWidth || 200;
        var menuHeight = menu.offsetHeight || 120;
        var gap = 4;
        var left = rect.right - menuWidth;
        var top = rect.bottom + gap;

        if (left < 8) left = 8;
        if (left + menuWidth > window.innerWidth - 8) {
            left = window.innerWidth - menuWidth - 8;
        }
        if (top + menuHeight > window.innerHeight - 8) {
            top = rect.top - menuHeight - gap;
        }
        if (top < 8) top = 8;

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.style.visibility = '';
    }

    function restoreMenuToWrap(state) {
        if (!state || !state.menu || !state.wrap) return;
        state.menu.classList.remove('pi-actions-menu--floating');
        state.menu.style.left = '';
        state.menu.style.top = '';
        state.menu.style.visibility = '';
        if (state.menu.parentNode !== state.wrap) {
            state.wrap.appendChild(state.menu);
        }
    }

    function closeAllMenus() {
        if (openState) {
            openState.cell.classList.remove('pi-actions-menu-open');
            openState.moreBtn.setAttribute('aria-expanded', 'false');
            openState.menu.hidden = true;
            restoreMenuToWrap(openState);
        }
        document.body.classList.remove('pi-actions-menu-active');
        openState = null;
    }

    function openMenu(cell, menu, moreBtn, wrap) {
        closeAllMenus();

        menu.hidden = false;
        moreBtn.setAttribute('aria-expanded', 'true');
        cell.classList.add('pi-actions-menu-open');
        document.body.classList.add('pi-actions-menu-active');
        positionFloatingMenu(menu, moreBtn);

        openState = { cell: cell, menu: menu, moreBtn: moreBtn, wrap: wrap };
    }

    function appendMenuItem(section, el, isDanger) {
        var item;
        var label = labelForElement(el);
        var iconHtml = iconForButton(el);

        if (el.tagName === 'A') {
            item = document.createElement('a');
            item.className = 'pi-actions-menu-item pi-actions-menu-item--link';
            item.href = el.getAttribute('href') || '#';
            item.setAttribute('role', 'menuitem');
            item.addEventListener('click', function () {
                closeAllMenus();
            });
        } else {
            item = document.createElement('button');
            item.type = 'button';
            item.className = 'pi-actions-menu-item';
            item.setAttribute('role', 'menuitem');
            if (isDanger) item.classList.add('pi-actions-menu-item--danger');
            item.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                closeAllMenus();
                el.click();
            });
        }

        var iconSpan = document.createElement('span');
        iconSpan.className = 'pi-actions-menu-icon';
        iconSpan.innerHTML = iconHtml;

        var labelSpan = document.createElement('span');
        labelSpan.className = 'pi-actions-menu-label';
        labelSpan.textContent = label;

        item.appendChild(iconSpan);
        item.appendChild(labelSpan);
        section.appendChild(item);
    }

    function enhanceActionsCell(cell) {
        if (!cell || cell.getAttribute('data-pi-actions-enhanced') === '1') return;

        var candidates = Array.prototype.slice.call(
            cell.querySelectorAll('button, a.pi-icon-build-btn, a.build-inventory-product-btn')
        ).filter(function (el) {
            return !el.closest('.pi-actions-more-wrap') &&
                !el.closest('.pi-actions-menu-triggers') &&
                !el.closest('.pi-actions-extra-triggers');
        });

        var menuButtons = candidates.filter(isMenuButton);
        var extraWrap = cell.querySelector('.pi-actions-extra-triggers');
        var extraActions = extraWrap
            ? Array.prototype.slice.call(extraWrap.querySelectorAll('button, a.pi-menu-extra-link'))
            : [];

        if (!menuButtons.length && !extraActions.length) return;

        var triggers = document.createElement('div');
        triggers.className = 'pi-actions-menu-triggers';
        triggers.setAttribute('hidden', '');

        menuButtons.forEach(function (btn) {
            triggers.appendChild(btn);
        });
        extraActions.forEach(function (el) {
            triggers.appendChild(el);
        });
        if (extraWrap) extraWrap.remove();

        var wrap = document.createElement('div');
        wrap.className = 'pi-actions-more-wrap';

        var moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'pi-icon-more-btn';
        moreBtn.setAttribute('aria-label', 'More actions');
        moreBtn.setAttribute('aria-haspopup', 'true');
        moreBtn.setAttribute('aria-expanded', 'false');
        moreBtn.innerHTML = SVG_MORE;

        var menu = document.createElement('div');
        menu.className = 'pi-actions-menu';
        menu.setAttribute('role', 'menu');

        var primarySection = document.createElement('div');
        primarySection.className = 'pi-actions-menu-section';
        var dangerSection = document.createElement('div');
        dangerSection.className = 'pi-actions-menu-section';

        extraActions.forEach(function (el) {
            appendMenuItem(primarySection, el, false);
        });

        menuButtons.forEach(function (btn) {
            appendMenuItem(
                isDangerButton(btn) ? dangerSection : primarySection,
                btn,
                isDangerButton(btn)
            );
        });

        if (primarySection.childNodes.length) menu.appendChild(primarySection);
        if (dangerSection.childNodes.length) menu.appendChild(dangerSection);

        menu.hidden = true;

        moreBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (openState && openState.cell === cell) {
                closeAllMenus();
            } else {
                openMenu(cell, menu, moreBtn, wrap);
            }
        });

        wrap.appendChild(moreBtn);
        wrap.appendChild(menu);
        cell.appendChild(wrap);
        cell.appendChild(triggers);
        cell.setAttribute('data-pi-actions-enhanced', '1');
    }

    function enhanceAll(root) {
        var scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll('.pi-actions-cell:not([data-pi-actions-enhanced])').forEach(enhanceActionsCell);
    }

    window.piEnhanceActionsCells = enhanceAll;

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.pi-actions-more-wrap') && !e.target.closest('.pi-actions-menu--floating')) {
            closeAllMenus();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeAllMenus();
    });

    window.addEventListener('scroll', function () {
        if (openState) closeAllMenus();
    }, true);

    window.addEventListener('resize', function () {
        if (openState) closeAllMenus();
    });

    if (typeof MutationObserver !== 'undefined') {
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) return;
                    if (node.matches && node.matches('.pi-actions-cell')) {
                        enhanceActionsCell(node);
                    }
                    enhanceAll(node);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        enhanceAll(document);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
