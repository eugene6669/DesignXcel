(function () {
    'use strict';

    let modules = [];
    let roles = [];
    let openMenuEl = null;

    function $(id) { return document.getElementById(id); }

    async function load() {
        const head = $('roleMatrixHead');
        const body = $('roleMatrixBody');
        if (!head || !body) return;

        head.innerHTML = '<tr><th colspan="4">Loading…</th></tr>';
        body.innerHTML = '';

        try {
            const res = await fetch('/Employee/Admin/ManageUsers/Roles');
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Failed to load roles');
            modules = data.modules || [];
            roles = data.roles || [];
            renderMatrix();
        } catch (err) {
            console.error(err);
            head.innerHTML = '<tr><th>Error loading roles</th></tr>';
        }
    }

    function filteredRoles() {
        const q = ($('roleSearchInput')?.value || '').trim().toLowerCase();
        if (!q) return roles;
        return roles.filter(r => (r.roleName || '').toLowerCase().includes(q));
    }

    function renderMatrix() {
        const head = $('roleMatrixHead');
        const body = $('roleMatrixBody');
        const list = filteredRoles();

        let headHtml = '<tr><th class="role-col">ROLES</th>';
        modules.forEach(m => {
            headHtml += '<th title="' + escapeHtml(m.label) + '">' + escapeHtml(m.label) + '</th>';
        });
        headHtml += '</tr>';
        head.innerHTML = headHtml;

        if (!list.length) {
            body.innerHTML = '<tr><td colspan="' + (modules.length + 1) + '">No roles found</td></tr>';
            return;
        }

        body.innerHTML = list.map(role => {
            let row = '<tr data-role-id="' + role.roleId + '">';
            row += '<td class="role-col">';
            row += '<span>' + escapeHtml(role.roleName) + '</span> ';
            if (!role.isSystemRole) {
                row += '<button type="button" class="role-actions-btn" data-action="menu" data-role-id="' + role.roleId + '" aria-label="Role actions">⋮</button>';
            }
            row += '</td>';
            modules.forEach(m => {
                const checked = role.modules && role.modules[m.key] ? 'checked' : '';
                const disabled = role.isSystemRole ? ' disabled' : '';
                row += '<td><input type="checkbox" data-role-id="' + role.roleId + '" data-module="' + m.key + '" ' + checked + disabled + '></td>';
            });
            row += '</tr>';
            return row;
        }).join('');

        body.querySelectorAll('input[type="checkbox"][data-module]').forEach(cb => {
            cb.addEventListener('change', onPermissionToggle);
        });
        body.querySelectorAll('[data-action="menu"]').forEach(btn => {
            btn.addEventListener('click', onRoleMenu);
        });
    }

    async function onPermissionToggle(ev) {
        const cb = ev.target;
        const roleId = parseInt(cb.dataset.roleId, 10);
        const role = roles.find(r => r.roleId === roleId);
        if (!role || role.isSystemRole) return;

        if (!role.modules) role.modules = {};
        role.modules[cb.dataset.module] = cb.checked;

        try {
            const res = await fetch('/Employee/Admin/ManageUsers/Roles/' + roleId + '/Permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modules: role.modules })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Save failed');
        } catch (err) {
            console.error(err);
            cb.checked = !cb.checked;
            role.modules[cb.dataset.module] = cb.checked;
            alert('Failed to save role permission');
        }
    }

    function closeMenu() {
        if (openMenuEl) {
            openMenuEl.remove();
            openMenuEl = null;
        }
    }

    function onRoleMenu(ev) {
        ev.stopPropagation();
        closeMenu();
        const roleId = parseInt(ev.currentTarget.dataset.roleId, 10);
        const role = roles.find(r => r.roleId === roleId);
        if (!role) return;

        const menu = document.createElement('div');
        menu.className = 'role-actions-menu';
        menu.innerHTML =
            '<button type="button" data-act="edit">Edit</button>' +
            '<button type="button" data-act="delete">Delete</button>';

        const rect = ev.currentTarget.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.left = rect.left + 'px';
        menu.style.top = (rect.bottom + 4) + 'px';

        menu.querySelector('[data-act="edit"]').addEventListener('click', async () => {
            closeMenu();
            const name = prompt('Role name:', role.roleName);
            if (!name || name.trim() === role.roleName) return;
            const res = await fetch('/Employee/Admin/ManageUsers/Roles/' + roleId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roleName: name.trim() })
            });
            const data = await res.json();
            if (data.success) load();
            else alert(data.message || 'Update failed');
        });

        menu.querySelector('[data-act="delete"]').addEventListener('click', async () => {
            closeMenu();
            if (!confirm('Delete role "' + role.roleName + '"?')) return;
            const res = await fetch('/Employee/Admin/ManageUsers/Roles/' + roleId, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) load();
            else alert(data.message || 'Delete failed');
        });

        document.body.appendChild(menu);
        openMenuEl = menu;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    document.addEventListener('click', closeMenu);

    document.addEventListener('DOMContentLoaded', function () {
        const addBtn = $('btnAddRole');
        const search = $('roleSearchInput');
        if (addBtn) {
            addBtn.addEventListener('click', async function () {
                const name = prompt('New role name:');
                if (!name || !name.trim()) return;
                const res = await fetch('/Employee/Admin/ManageUsers/Roles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roleName: name.trim() })
                });
                const data = await res.json();
                if (data.success) load();
                else alert(data.message || 'Could not create role');
            });
        }
        if (search) {
            search.addEventListener('input', renderMatrix);
        }
    });

    window.RoleManager = { load };
})();
