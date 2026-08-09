(function () {
  const storageKey = 'converter-theme';
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function getSelectedTheme() {
    const savedTheme = window.localStorage.getItem(storageKey);
    return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'system';
  }

  function getActiveTheme(selectedTheme) {
    return selectedTheme === 'system'
      ? (mediaQuery.matches ? 'dark' : 'light')
      : selectedTheme;
  }

  function applyTheme(selectedTheme) {
    const activeTheme = getActiveTheme(selectedTheme);
    document.documentElement.dataset.theme = activeTheme;
    document.documentElement.dataset.bsTheme = activeTheme;

    document.querySelectorAll('[data-theme-choice]').forEach(function (item) {
      const isSelected = item.dataset.themeChoice === selectedTheme;
      item.classList.toggle('active', isSelected);
      item.setAttribute('aria-checked', String(isSelected));
    });

    const button = document.getElementById('themeMenuButton');
    if (button) {
      const label = selectedTheme.charAt(0).toUpperCase() + selectedTheme.slice(1);
      button.setAttribute('aria-label', `Color theme: ${label}`);
      button.setAttribute('title', `Color theme: ${label}`);
    }
  }

  function selectTheme(theme) {
    if (theme === 'system') {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, theme);
    }
    applyTheme(theme);
  }

  applyTheme(getSelectedTheme());

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-theme-choice]').forEach(function (item) {
      item.setAttribute('role', 'menuitemradio');
      item.addEventListener('click', function () {
        selectTheme(item.dataset.themeChoice);
      });
    });
    applyTheme(getSelectedTheme());
  });

  mediaQuery.addEventListener('change', function () {
    if (getSelectedTheme() === 'system') {
      applyTheme('system');
    }
  });
})();
