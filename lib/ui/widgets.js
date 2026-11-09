/**
 * Minimal Board Tab - Modular Zen Widgets Subsystem (Markmez Inspired)
 * Pure ES module. Zero dependencies. Sub-15ms first-paint safe.
 */

let clockInterval = null;
let pomodoroInterval = null;
let pomodoroSecondsLeft = 25 * 60;
let pomodoroIsRunning = false;
let pomodoroMode = 'focus'; // 'focus' (25m) | 'short' (5m) | 'long' (15m)
let pomodoroSessionsCompleted = 0; // 0-4 dots
let pomodoroElapsedFocusSeconds = 0;
let activePomodoroCardUpdater = null;

const POMO_DURATIONS = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

const pomodoroListeners = new Set();

export function getPomodoroState() {
  return {
    isRunning: pomodoroIsRunning,
    secondsLeft: pomodoroSecondsLeft,
    totalSeconds: POMO_DURATIONS[pomodoroMode] || 25 * 60,
    mode: pomodoroMode,
    sessionsCompleted: pomodoroSessionsCompleted,
  };
}

export function subscribePomodoro(listener) {
  pomodoroListeners.add(listener);
  try {
    listener(getPomodoroState());
  } catch (err) {
    console.error('Error in pomodoro listener:', err);
  }
  return () => pomodoroListeners.delete(listener);
}

function notifyPomodoroListeners() {
  const state = getPomodoroState();
  for (const fn of pomodoroListeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('Error in pomodoro listener:', err);
    }
  }
}

export function switchPomodoroMode(newMode) {
  pomodoroMode = newMode;
  pomodoroSecondsLeft = POMO_DURATIONS[newMode] || 25 * 60;
  pomodoroElapsedFocusSeconds = 0;
  if (pomodoroIsRunning) {
    togglePomodoroTimer(false);
  }
  if (activePomodoroCardUpdater) {
    activePomodoroCardUpdater.syncModeTabs();
    activePomodoroCardUpdater.renderTimer();
  }
  notifyPomodoroListeners();
}

export function togglePomodoroTimer(forceState) {
  pomodoroIsRunning = typeof forceState === 'boolean' ? forceState : !pomodoroIsRunning;

  if (activePomodoroCardUpdater) {
    activePomodoroCardUpdater.syncPlayUi();
  }

  if (pomodoroIsRunning) {
    if (pomodoroInterval) clearInterval(pomodoroInterval);
    pomodoroInterval = setInterval(() => {
      if (pomodoroSecondsLeft > 0) {
        pomodoroSecondsLeft--;
        if (activePomodoroCardUpdater) {
          activePomodoroCardUpdater.renderTimer();
        }

        // If in focus mode, accumulate focus minutes
        if (pomodoroMode === 'focus') {
          pomodoroElapsedFocusSeconds++;
          if (pomodoroElapsedFocusSeconds >= 60) {
            pomodoroElapsedFocusSeconds = 0;
            incrementTodayFocusMinute();
          }
        }
      } else {
        // Completed
        playChime();
        if (pomodoroMode === 'focus') {
          pomodoroSessionsCompleted = (pomodoroSessionsCompleted + 1) % 5;
          if (pomodoroSessionsCompleted === 0) pomodoroSessionsCompleted = 1;
          if (activePomodoroCardUpdater) activePomodoroCardUpdater.renderDots();
          switchPomodoroMode(pomodoroSessionsCompleted === 4 ? 'long' : 'short');
        } else {
          switchPomodoroMode('focus');
        }
      }
      notifyPomodoroListeners();
    }, 1000);
  } else {
    if (pomodoroInterval) {
      clearInterval(pomodoroInterval);
      pomodoroInterval = null;
    }
  }
  notifyPomodoroListeners();
}

export function stopPomodoroTimer() {
  if (pomodoroInterval) {
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
  }
  pomodoroIsRunning = false;
  pomodoroSecondsLeft = POMO_DURATIONS[pomodoroMode] || 25 * 60;
  pomodoroElapsedFocusSeconds = 0;
  if (activePomodoroCardUpdater) {
    activePomodoroCardUpdater.syncPlayUi();
    activePomodoroCardUpdater.renderTimer();
  }
  notifyPomodoroListeners();
}

// Global hooks for live syncing between Pomodoro card & Top-Bar Focus Today pill
let focusTodayUpdateListeners = new Set();

/**
 * Gets or initializes today's focus minutes record.
 */
export async function getTodayFocusMinutes() {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const stored = await new Promise((res) => chrome.storage.local.get('mbt_focus_today', res));
    const rec = stored.mbt_focus_today;
    if (rec && rec.date === todayStr) {
      return rec.minutes || 0;
    }
    // New day, reset
    await chrome.storage.local.set({ mbt_focus_today: { date: todayStr, minutes: 0 } });
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Increments today's focus minutes by 1 and notifies all listeners.
 */
export async function incrementTodayFocusMinute() {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const stored = await new Promise((res) => chrome.storage.local.get('mbt_focus_today', res));
    let minutes = 0;
    if (stored.mbt_focus_today && stored.mbt_focus_today.date === todayStr) {
      minutes = (stored.mbt_focus_today.minutes || 0) + 1;
    } else {
      minutes = 1;
    }
    await chrome.storage.local.set({ mbt_focus_today: { date: todayStr, minutes } });
    for (const listener of focusTodayUpdateListeners) {
      listener(minutes);
    }
  } catch (err) {
    console.warn('Failed to increment focus minutes:', err);
  }
}

/**
 * Plays a calm harmonic chime via the browser Web Audio API when a session completes.
 */
function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.35); // A5

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch {
    // Audio context may be restricted before user gesture
  }
}

export const ALL_MARKMEZ_WIDGETS = ['clock', 'weather', 'focus-today', 'pomodoro', 'calendar'];

/**
 * Returns enabled widgets array, auto-upgrading legacy lists missing Markmez widgets.
 * Accepts either meta or settings object or widgets array.
 */
export function getEnabledWidgets(metaOrSettings) {
  const allMarkmezWidgets = ['clock', 'weather', 'focus-today', 'pomodoro', 'calendar'];
  let userWidgets = metaOrSettings;
  if (metaOrSettings && typeof metaOrSettings === 'object') {
    if ('settings' in metaOrSettings && metaOrSettings.settings && typeof metaOrSettings.settings === 'object') {
      userWidgets = metaOrSettings.settings.widgets;
    } else if ('widgets' in metaOrSettings) {
      userWidgets = metaOrSettings.widgets;
    }
  }

  if (!Array.isArray(userWidgets) || userWidgets.length === 0) {
    return allMarkmezWidgets;
  }
  // If user has old legacy list that doesn't have the markmez widgets, auto-upgrade
  const hasAnyNewWidget = userWidgets.some((w) =>
    ['weather', 'focus-today', 'pomodoro', 'calendar'].includes(w)
  );
  if (!hasAnyNewWidget) {
    return allMarkmezWidgets;
  }
  return userWidgets;
}

/**
 * Mounts the minimal floating pill widgets at the top-right of the window:
 * [ Weather Pill ] [ Focus Today Pill ] [ Clock & Date Pill ]
 */
export function mountTopBarWidgets(containerEl, context) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  focusTodayUpdateListeners.clear();

  const { meta, onSaveSettings } = context;
  const enabledWidgets = getEnabledWidgets(meta);

  // 1. Weather Pill
  if (enabledWidgets.includes('weather')) {
    const weatherPill = document.createElement('div');
    weatherPill.className = 'widget-pill widget-weather-pill';
    weatherPill.title = 'Click to configure weather location or toggle °C/°F';
    weatherPill.setAttribute('role', 'button');
    weatherPill.setAttribute('tabindex', '0');

    const defaultCity = meta?.settings?.weatherCity || 'New York';
    const unit = meta?.settings?.weatherUnit || 'C';
    const initialTemp = unit === 'F' ? '68' : '20';

    weatherPill.innerHTML = `
      <span class="weather-icon">⛅</span>
      <span class="weather-text">${defaultCity.toUpperCase()} ${initialTemp}°${unit}</span>
    `;

    // Attempt live fetch if city is set
    async function updateWeather() {
      try {
        const city = meta?.settings?.weatherCity || 'New York';
        const u = meta?.settings?.weatherUnit || 'C';
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();
        if (geoData?.results?.[0]) {
          const { latitude, longitude, name } = geoData.results[0];
          const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
          const wxRes = await fetch(wxUrl);
          const wxData = await wxRes.json();
          if (wxData?.current_weather) {
            let temp = wxData.current_weather.temperature;
            if (u === 'F') temp = Math.round((temp * 9) / 5 + 32);
            else temp = Math.round(temp);

            const code = wxData.current_weather.weathercode;
            let icon = '☀️';
            if ([1, 2].includes(code)) icon = '⛅';
            else if ([3].includes(code)) icon = '☁️';
            else if ([45, 48].includes(code)) icon = '🌫️';
            else if (code >= 51 && code <= 67) icon = '🌧️';
            else if (code >= 71 && code <= 77) icon = '🌨️';
            else if (code >= 80 && code <= 82) icon = '🌦️';
            else if (code >= 95) icon = '⛈️';

            weatherPill.innerHTML = `
              <span class="weather-icon">${icon}</span>
              <span class="weather-text">${name.toUpperCase()} ${temp}°${u}</span>
            `;
          }
        }
      } catch {
        // Retain fallback offline text
      }
    }

    setTimeout(updateWeather, 200);

    const onWeatherClick = () => {
      const currentCity = meta?.settings?.weatherCity || 'New York';
      const newCity = prompt('Enter your city for weather:', currentCity);
      if (newCity !== null && newCity.trim()) {
        meta.settings = meta.settings || {};
        meta.settings.weatherCity = newCity.trim();
        if (onSaveSettings) onSaveSettings('weatherCity', newCity.trim());
        updateWeather();
      }
    };

    weatherPill.addEventListener('click', onWeatherClick);
    weatherPill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onWeatherClick();
      }
    });

    containerEl.appendChild(weatherPill);
  }

  // 2. Focus Today Pill
  if (enabledWidgets.includes('focus-today')) {
    const focusPill = document.createElement('div');
    focusPill.className = 'widget-pill widget-focus-pill';
    focusPill.title = 'Total focus minutes completed today';
    focusPill.setAttribute('role', 'status');

    focusPill.innerHTML = `
      <span class="focus-label">FOCUS TODAY</span>
      <span class="focus-time">0m</span>
    `;

    const timeSpan = focusPill.querySelector('.focus-time');

    getTodayFocusMinutes().then((mins) => {
      if (timeSpan) timeSpan.textContent = `${mins}m`;
    });

    const listener = (newMinutes) => {
      if (timeSpan) timeSpan.textContent = `${newMinutes}m`;
    };
    focusTodayUpdateListeners.add(listener);

    containerEl.appendChild(focusPill);
  }

  // 3. Clock & Date Pill (Format: SUN, AUG 23  2:05 PM)
  if (enabledWidgets.includes('clock')) {
    const clockPill = document.createElement('div');
    clockPill.className = 'widget-pill widget-clock-pill';
    clockPill.title = 'Click to toggle 12h / 24h format';
    clockPill.setAttribute('role', 'button');
    clockPill.setAttribute('tabindex', '0');

    function updateTime() {
      const d = new Date();
      const is24h = meta?.settings?.clockIs24h === true;
      const timeStr = d.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: !is24h,
      });
      const weekdayStr = d.toLocaleDateString([], { weekday: 'short' }).toUpperCase();
      const monthStr = d.toLocaleDateString([], { month: 'short' }).toUpperCase();
      const dayStr = d.getDate();

      clockPill.innerHTML = `
        <span class="clock-date">${weekdayStr}, ${monthStr} ${dayStr}</span>
        <span class="clock-time">${timeStr}</span>
      `;
    }

    updateTime();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(updateTime, 1000);

    const toggleClock = () => {
      meta.settings = meta.settings || {};
      meta.settings.clockIs24h = !meta.settings.clockIs24h;
      if (onSaveSettings) onSaveSettings('clockIs24h', meta.settings.clockIs24h);
      updateTime();
    };

    clockPill.addEventListener('click', toggleClock);
    clockPill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleClock();
      }
    });

    containerEl.appendChild(clockPill);
  }
}

/**
 * Creates the dedicated Visual Pomodoro Widget Card matching Markmez:
 * - Segmented mode pill: [ Focus ] [ Short Break ] [ Long Break ]
 * - Large tabular timer display: 25:00
 * - 4 progress session dots
 * - Bottom controls: Reset (↺), circular Play/Pause (▶), Skip (⏭)
 */
export function createPomodoroCardElement(context) {
  const cardEl = document.createElement('section');
  cardEl.className = 'column widget-card widget-pomodoro-card';
  cardEl.dataset.widgetType = 'pomodoro';

  cardEl.innerHTML = `
    <header class="widget-card-header">
      <h2 class="widget-card-title">Pomodoro</h2>
    </header>
    <div class="pomodoro-body">
      <nav class="pomo-mode-nav" role="tablist" aria-label="Pomodoro Modes">
        <button class="pomo-tab active" data-mode="focus">Focus</button>
        <button class="pomo-tab" data-mode="short">Short Break</button>
        <button class="pomo-tab" data-mode="long">Long Break</button>
      </nav>
      <div class="pomo-timer-display" aria-live="polite">25:00</div>
      <div class="pomo-session-dots" aria-label="Session Progress">
        <span class="pomo-dot active"></span>
        <span class="pomo-dot"></span>
        <span class="pomo-dot"></span>
        <span class="pomo-dot"></span>
      </div>
      <div class="pomo-controls">
        <button class="pomo-ctrl-btn pomo-btn-reset" title="Reset Timer" aria-label="Reset Timer">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
        <button class="pomo-ctrl-btn pomo-btn-play" title="Start Timer" aria-label="Start Timer">
          <svg class="pomo-icon-play" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <svg class="pomo-icon-pause" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
            <rect x="6" y="4" width="4" height="16" rx="1"/>
            <rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
        </button>
        <button class="pomo-ctrl-btn pomo-btn-skip" title="Skip Session" aria-label="Skip Session">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 4 15 12 5 20 5 4"/>
            <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  const tabs = cardEl.querySelectorAll('.pomo-tab');
  const timerDisplay = cardEl.querySelector('.pomo-timer-display');
  const dots = cardEl.querySelectorAll('.pomo-dot');
  const playBtn = cardEl.querySelector('.pomo-btn-play');
  const resetBtn = cardEl.querySelector('.pomo-btn-reset');
  const skipBtn = cardEl.querySelector('.pomo-btn-skip');
  const playIcon = cardEl.querySelector('.pomo-icon-play');
  const pauseIcon = cardEl.querySelector('.pomo-icon-pause');

  function renderTimer() {
    const m = String(Math.floor(pomodoroSecondsLeft / 60)).padStart(2, '0');
    const s = String(pomodoroSecondsLeft % 60).padStart(2, '0');
    if (timerDisplay) timerDisplay.textContent = `${m}:${s}`;
  }

  function renderDots() {
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx < pomodoroSessionsCompleted);
    });
  }

  function syncModeTabs() {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === pomodoroMode));
  }

  function syncPlayUi() {
    if (pomodoroIsRunning) {
      if (playIcon) playIcon.style.display = 'none';
      if (pauseIcon) pauseIcon.style.display = 'block';
      if (playBtn) playBtn.title = 'Pause Timer';
    } else {
      if (playIcon) playIcon.style.display = 'block';
      if (pauseIcon) pauseIcon.style.display = 'none';
      if (playBtn) playBtn.title = 'Start Timer';
    }
  }

  activePomodoroCardUpdater = {
    renderTimer,
    renderDots,
    syncModeTabs,
    syncPlayUi,
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchPomodoroMode(tab.dataset.mode));
  });

  playBtn?.addEventListener('click', () => togglePomodoroTimer());

  resetBtn?.addEventListener('click', () => {
    stopPomodoroTimer();
  });

  skipBtn?.addEventListener('click', () => {
    togglePomodoroTimer(false);
    if (pomodoroMode === 'focus') {
      pomodoroSessionsCompleted = (pomodoroSessionsCompleted + 1) % 5;
      if (pomodoroSessionsCompleted === 0) pomodoroSessionsCompleted = 1;
      if (activePomodoroCardUpdater) activePomodoroCardUpdater.renderDots();
      switchPomodoroMode('short');
    } else {
      switchPomodoroMode('focus');
    }
  });

  // Initial sync with module state
  syncModeTabs();
  renderTimer();
  renderDots();
  syncPlayUi();

  return cardEl;
}

/**
 * Creates the dedicated Visual Monthly Calendar Widget Card matching Markmez:
 * - Header with month & year navigation: < August 2026 >
 * - Weekday row: Su Mo Tu We Th Fr Sa
 * - Full month dates grid with active day in olive highlight circle
 * - Today's status pill at bottom
 */
export function createCalendarCardElement(context) {
  const cardEl = document.createElement('section');
  cardEl.className = 'column widget-card widget-calendar-card';
  cardEl.dataset.widgetType = 'calendar';

  let viewDate = new Date();

  function renderCalendar() {
    const today = new Date();
    const isCurrentMonthView =
      viewDate.getFullYear() === today.getFullYear() && viewDate.getMonth() === today.getMonth();

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const monthName = viewDate.toLocaleDateString([], { month: 'long' });

    // Days in current, previous and next months
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 for Sunday
    const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthLastDate = new Date(year, month, 0).getDate();

    let gridHtml = '';

    // Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      gridHtml += `<div class="cal-cell cal-cell-muted">${prevMonthLastDate - i}</div>`;
    }

    // Current month days
    for (let d = 1; d <= lastDateOfMonth; d++) {
      const isToday = isCurrentMonthView && d === today.getDate();
      gridHtml += `<div class="cal-cell ${isToday ? 'cal-cell-today' : ''}" data-day="${d}">${d}</div>`;
    }

    // Next month leading days to complete the 35 or 42 grid cells
    const totalCells = firstDayIndex + lastDateOfMonth;
    const remaining = (totalCells > 35 ? 42 : 35) - totalCells;
    for (let n = 1; n <= remaining; n++) {
      gridHtml += `<div class="cal-cell cal-cell-muted">${n}</div>`;
    }

    const todayDateFormatted = today.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    cardEl.innerHTML = `
      <header class="calendar-header">
        <button class="cal-nav-btn cal-prev" title="Previous Month" aria-label="Previous Month">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <span class="cal-title" title="Click to jump to current month" role="button" tabindex="0">${monthName} ${year}</span>
        <button class="cal-nav-btn cal-next" title="Next Month" aria-label="Next Month">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </header>
      <div class="calendar-weekdays" aria-hidden="true">
        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
      </div>
      <div class="calendar-grid" role="grid" aria-label="${monthName} ${year} calendar">
        ${gridHtml}
      </div>
      <div class="calendar-footer">
        <div class="cal-today-pill" title="Current system date">
          <span class="cal-today-dot"></span>
          <span class="cal-today-label">Today: ${todayDateFormatted}</span>
        </div>
      </div>
    `;

    cardEl.querySelector('.cal-prev')?.addEventListener('click', () => {
      viewDate.setMonth(viewDate.getMonth() - 1);
      renderCalendar();
    });

    cardEl.querySelector('.cal-next')?.addEventListener('click', () => {
      viewDate.setMonth(viewDate.getMonth() + 1);
      renderCalendar();
    });

    cardEl.querySelector('.cal-title')?.addEventListener('click', () => {
      viewDate = new Date();
      renderCalendar();
    });
  }

  renderCalendar();
  return cardEl;
}

/**
 * Backward compatibility stub for general widgets mounting.
 */
export function mountWidgets(containerEl, context) {
  mountTopBarWidgets(containerEl, context);
}
