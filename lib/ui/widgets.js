/**
 * Minimal Board Tab - Modular Widgets Subsystem
 * Pure ES module. Mounted asynchronously post-first-paint to protect the <= 15ms load budget.
 */

let clockInterval = null;
let pomodoroInterval = null;
let pomodoroSecondsLeft = 25 * 60;
let pomodoroIsRunning = false;
let pomodoroMode = 'work'; // 'work' (25m) | 'break' (5m)

/**
 * Mounts all enabled widgets inside the dedicated widgets container strip.
 *
 * @param {HTMLElement} containerEl
 * @param {object} context
 * @param {object} context.meta
 * @param {Record<string, object>} context.cards
 * @param {object} context.layout
 * @param {Function} context.onTriggerTriage
 * @param {Function} context.onSaveSettings
 */
export function mountWidgets(containerEl, context) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const { meta, cards, layout, onTriggerTriage, onSaveSettings } = context;
  const enabledWidgets = meta.settings?.widgets || ['clock', 'speed-dial', 'inbox-stats'];

  const strip = document.createElement('div');
  strip.className = 'widgets-strip';

  // 1. Clock & Date Widget
  if (enabledWidgets.includes('clock')) {
    const clockEl = document.createElement('div');
    clockEl.className = 'widget-pill widget-clock';
    clockEl.title = 'Click to toggle 12h / 24h format';

    function updateTime() {
      const d = new Date();
      const is24h = meta.settings?.clockIs24h !== false;
      const timeStr = d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: !is24h,
      });
      const dateStr = d.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      clockEl.innerHTML = `<span class="clock-time">${timeStr}</span> <span class="clock-date">${dateStr}</span>`;
    }

    updateTime();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(updateTime, 1000);

    clockEl.addEventListener('click', async () => {
      meta.settings = meta.settings || {};
      meta.settings.clockIs24h = !meta.settings.clockIs24h;
      if (onSaveSettings) onSaveSettings('clockIs24h', meta.settings.clockIs24h);
      updateTime();
    });

    strip.appendChild(clockEl);
  }

  // 2. Inbox Stats Widget
  if (enabledWidgets.includes('inbox-stats') && layout && layout.columns) {
    const inboxCol =
      Object.values(layout.columns).find((c) => c.system === 'inbox') ||
      layout.columns.col_inbox;

    if (inboxCol) {
      const count = inboxCol.cardIds?.length || 0;
      let oldestAgeDays = 0;
      const now = Date.now();

      for (const cardId of inboxCol.cardIds || []) {
        const card = cards[cardId];
        if (card) {
          const age = (now - (card.createdAt || now)) / 86400000;
          if (age > oldestAgeDays) oldestAgeDays = age;
        }
      }

      const staleThreshold = meta.settings?.staleAfterDays || 14;
      const isStale = oldestAgeDays >= staleThreshold;

      const statsEl = document.createElement('div');
      statsEl.className = `widget-pill widget-inbox-stats ${isStale ? 'is-stale' : ''}`;
      statsEl.title = 'Inbox backlog status. Click to start Review Triage (r)';

      const ageText = count > 0 ? ` · oldest ${Math.floor(oldestAgeDays)}d` : '';
      statsEl.innerHTML = `<span>📥 ${count} in Inbox${ageText}</span>`;

      if (count > 0) {
        const triageBtn = document.createElement('button');
        triageBtn.className = 'widget-action-btn';
        triageBtn.textContent = 'Triage (r)';
        triageBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onTriggerTriage) onTriggerTriage();
        });
        statsEl.appendChild(triageBtn);
      }

      strip.appendChild(statsEl);
    }
  }

  // 3. Focus Pomodoro Timer Widget
  if (enabledWidgets.includes('pomodoro')) {
    const pomoEl = document.createElement('div');
    pomoEl.className = 'widget-pill widget-pomodoro';

    const label = document.createElement('span');
    label.className = 'pomodoro-display';

    function formatPomo() {
      const m = String(Math.floor(pomodoroSecondsLeft / 60)).padStart(2, '0');
      const s = String(pomodoroSecondsLeft % 60).padStart(2, '0');
      label.textContent = `⏱️ ${m}:${s} (${pomodoroMode})`;
    }

    formatPomo();
    pomoEl.appendChild(label);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'widget-action-btn';
    toggleBtn.textContent = pomodoroIsRunning ? 'Pause' : 'Start';
    toggleBtn.addEventListener('click', () => {
      pomodoroIsRunning = !pomodoroIsRunning;
      toggleBtn.textContent = pomodoroIsRunning ? 'Pause' : 'Start';

      if (pomodoroIsRunning) {
        if (pomodoroInterval) clearInterval(pomodoroInterval);
        pomodoroInterval = setInterval(() => {
          if (pomodoroSecondsLeft > 0) {
            pomodoroSecondsLeft--;
            formatPomo();
          } else {
            // Switch mode
            pomodoroMode = pomodoroMode === 'work' ? 'break' : 'work';
            pomodoroSecondsLeft = pomodoroMode === 'work' ? 25 * 60 : 5 * 60;
            formatPomo();
            alert(`Pomodoro ${pomodoroMode === 'work' ? 'Work Session' : 'Break Time'} Started!`);
          }
        }, 1000);
      } else {
        if (pomodoroInterval) clearInterval(pomodoroInterval);
      }
    });
    pomoEl.appendChild(toggleBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'widget-action-btn';
    resetBtn.textContent = '↺';
    resetBtn.title = 'Reset Timer';
    resetBtn.addEventListener('click', () => {
      if (pomodoroInterval) clearInterval(pomodoroInterval);
      pomodoroIsRunning = false;
      pomodoroMode = 'work';
      pomodoroSecondsLeft = 25 * 60;
      toggleBtn.textContent = 'Start';
      formatPomo();
    });
    pomoEl.appendChild(resetBtn);

    strip.appendChild(pomoEl);
  }

  // 4. Speed Dial Strip (from pinned cards)
  if (enabledWidgets.includes('speed-dial')) {
    const pinnedCards = Object.values(cards).filter((c) => c.pinned && c.url);

    if (pinnedCards.length > 0) {
      const speedDialEl = document.createElement('div');
      speedDialEl.className = 'widget-speed-dial';

      for (const card of pinnedCards.slice(0, 8)) {
        const item = document.createElement('a');
        item.className = 'speed-dial-item';
        item.href = card.url;
        item.target = meta.settings?.openLinksInNewTab !== false ? '_blank' : '_self';
        item.rel = 'noopener noreferrer';
        item.title = card.title || card.host;

        const icon = document.createElement('img');
        icon.className = 'speed-dial-icon';
        icon.loading = 'lazy';
        icon.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(card.url)}&size=32`;
        icon.onerror = () => {
          icon.style.display = 'none';
        };
        item.appendChild(icon);

        const titleSpan = document.createElement('span');
        titleSpan.textContent = card.title || card.host;
        item.appendChild(titleSpan);

        speedDialEl.appendChild(item);
      }

      strip.appendChild(speedDialEl);
    }
  }

  containerEl.appendChild(strip);
}
