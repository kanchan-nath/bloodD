/**
 * Blood Bank Management System - Client-side interactions
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Table Live Search Filtering
  const searchInputs = document.querySelectorAll('[data-table-search]');
  searchInputs.forEach(input => {
    const targetTableId = input.getAttribute('data-table-search');
    const table = document.getElementById(targetTableId);
    if (!table) return;

    input.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = table.querySelectorAll('tbody tr');

      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(query)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  });

  // 2. Destructive Action Confirmation Modal
  const confirmForms = document.querySelectorAll('form[data-confirm]');
  confirmForms.forEach(form => {
    form.addEventListener('submit', (e) => {
      const message = form.getAttribute('data-confirm') || 'Are you sure you want to perform this action?';
      if (!window.confirm(message)) {
        e.preventDefault();
      }
    });
  });

  // 3. Quick fill demo credentials on login page
  const fillBtns = document.querySelectorAll('[data-fill-demo]');
  fillBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const role = btn.getAttribute('data-fill-demo');
      const userInput = document.getElementById('username');
      const passInput = document.getElementById('password');

      if (role === 'admin') {
        if (userInput) userInput.value = 'admin';
        if (passInput) passInput.value = 'Admin@123';
      } else if (role === 'staff') {
        if (userInput) userInput.value = 'staff';
        if (passInput) passInput.value = 'Staff@123';
      }
    });
  });

  // 4. Alert dismissal
  const alertCloseBtns = document.querySelectorAll('.alert-close');
  alertCloseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const alert = btn.closest('.alert');
      if (alert) {
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 200);
      }
    });
  });
});
