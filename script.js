// App State
let timerState = {
    isRunning: false,
    isPaused: false,
    currentMode: 'focus',
    timeRemaining: 25 * 60,
    totalTime: 25 * 60,
    completedPomodoros: 0,
    currentTask: null,
    pipActive: false
};

let settings = {
    focusDuration: 25,
    shortBreakDuration: 5,
    theme: 'default'
};

let stats = {
    completedPomodoros: 0,
    totalTime: 0,
    currentStreak: 0,
    todayPomodoros: 0,
    lastDate: new Date().toDateString()
};

let tasks = [];
let presets = [];
let timerInterval;
let whiteNoiseAudio;
let isSpotifyPlaying = false;
let spotifyIframeReady = false;
let currentTrack = {
    name: "Star Boy",
    artist: "The Weeknd"
};
let pipWindow = null;
let notificationSent = { 50: false, 90: false };

// Theme to background color mapping
const themeColors = {
    default: '#282c34',
    light: '#f0f0f0',
    dark: '#1c2526',
    forest: '#2e3b2f',
    ocean: '#2b3e50'
};

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    updateDisplay();
    updateStats();
    loadTasks();
    checkDailyReset();
    updateSpotifyDisplay();
    
    const spotifyPlayer = document.getElementById('spotifyPlayer');
    spotifyPlayer.onload = () => {
        spotifyIframeReady = true;
        showNotification('Spotify player loaded!', 'success');
    };

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(createServiceWorker()).catch(() => {});
    }

    window.addEventListener('storage', handleStorageChange);

    window.addEventListener('unload', () => {
        if (pipWindow && !pipWindow.closed) {
            pipWindow.close();
        }
    });

    document.getElementById('savePresetBtn')?.addEventListener('click', savePreset);
    document.getElementById('presetSelect')?.addEventListener('change', applyPreset);
});

function handleStorageChange(event) {
    if (event.key === 'tomodoro_timerState') {
        const newState = JSON.parse(event.newValue);
        timerState = { ...timerState, ...newState };
        updateDisplay();
        updateProgress();
        document.getElementById('playBtn').innerHTML = timerState.isRunning ? '⏸️' : '▶️';
        document.getElementById('timerLabel').textContent = timerState.currentMode === 'focus' ? 'FOCUS' : 'SHORT BREAK';
        document.getElementById('pipBtn').textContent = timerState.pipActive ? '📴 Close PIP' : '📺 PIP Mode';
        updatePipVisibility();
    }
    if (event.key === 'tomodoro_spotifyState') {
        const newSpotifyState = JSON.parse(event.newValue);
        isSpotifyPlaying = newSpotifyState.isSpotifyPlaying;
        currentTrack = newSpotifyState.currentTrack;
        updateSpotifyDisplay();
        document.getElementById('spotifyPlayBtn').innerHTML = isSpotifyPlaying ? '⏸️' : '▶️';
    }
}

function updatePipVisibility() {
    const timerSection = document.getElementById('timerSection');
    const pipMessage = document.getElementById('pipModeMessage');
    const spotifyPlayer = document.getElementById('spotifyPlayer');
    
    if (timerState.pipActive) {
        timerSection.classList.add('hidden');
        pipMessage.classList.remove('hidden');
        if (spotifyPlayer) {
            spotifyPlayer.style.display = 'none';
        }
    } else {
        timerSection.classList.remove('hidden');
        pipMessage.classList.add('hidden');
        if (spotifyPlayer) {
            spotifyPlayer.style.display = 'block';
            if (!isSpotifyPlaying) {
                spotifyPlayer.style.top = '-9999px';
                spotifyPlayer.style.left = '-9999px';
            }
        }
    }
}

function getDurationForMode(mode) {
    return mode === 'focus' ? settings.focusDuration : settings.shortBreakDuration;
}

function setMode(mode) {
    timerState.currentMode = mode;
    timerState.timeRemaining = getDurationForMode(mode) * 60;
    timerState.totalTime = timerState.timeRemaining;
    timerState.isRunning = false;
    timerState.isPaused = false;
    clearInterval(timerInterval);
    notificationSent = { 50: false, 90: false };
    
    document.body.classList.toggle('short-break-mode', mode === 'shortBreak');
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    document.getElementById('timerLabel').textContent = mode === 'focus' ? 'FOCUS' : 'SHORT BREAK';
    document.getElementById('playBtn').innerHTML = '▶️';
    
    if (mode === 'shortBreak' && isSpotifyPlaying) {
        pauseSpotify();
        isSpotifyPlaying = false;
        document.getElementById('spotifyPlayBtn').innerHTML = '▶️';
    }
    
    updateDisplay();
    updateProgress();
    saveData();
    syncWithPipWindow();
}

function toggleTimer() {
    if (timerState.isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
    syncWithPipWindow();
}

function startTimer() {
    timerState.isRunning = true;
    timerState.isPaused = false;
    document.getElementById('playBtn').innerHTML = '⏸️';
    
    if (timerState.currentMode === 'focus' && isSpotifyPlaying) {
        playSpotify();
    }
    
    timerInterval = setInterval(() => {
        timerState.timeRemaining--;
        updateDisplay();
        updateProgress();
        
        const progress = ((timerState.totalTime - timerState.timeRemaining) / timerState.totalTime) * 100;
        if (progress >= 50 && !notificationSent[50]) {
            showNotification(`${timerState.currentMode.charAt(0).toUpperCase() + timerState.currentMode.slice(1)} Timer: 50% Complete`, 'info');
            notificationSent[50] = true;
        }
        if (progress >= 90 && !notificationSent[90]) {
            showNotification(`${timerState.currentMode.charAt(0).toUpperCase() + timerState.currentMode.slice(1)} Timer: 90% Complete`, 'info');
            notificationSent[90] = true;
        }

        if (timerState.timeRemaining <= 0) {
            completeTimer();
        }
        syncWithPipWindow();
    }, 1000);
    
    showNotification('Timer started! 🍅', 'success');
}

function pauseTimer() {
    timerState.isRunning = false;
    timerState.isPaused = true;
    clearInterval(timerInterval);
    document.getElementById('playBtn').innerHTML = '▶️';
    if (timerState.currentMode === 'focus' && isSpotifyPlaying) {
        pauseSpotify();
    }
    showNotification('Timer paused', 'info');
}

function resetTimer() {
    timerState.isRunning = false;
    timerState.isPaused = false;
    clearInterval(timerInterval);
    timerState.timeRemaining = getDurationForMode(timerState.currentMode) * 60;
    timerState.totalTime = timerState.timeRemaining;
    notificationSent = { 50: false, 90: false };
    
    document.getElementById('playBtn').innerHTML = '▶️';
    if (timerState.currentMode === 'focus' && isSpotifyPlaying) {
        pauseSpotify();
    }
    updateDisplay();
    updateProgress();
    showNotification('Timer reset', 'info');
    syncWithPipWindow();
}

function completeTimer() {
    clearInterval(timerInterval);
    timerState.isRunning = false;
    notificationSent = { 50: false, 90: false };
    
    const bell = document.getElementById('bellSound');
    bell.currentTime = 0;
    bell.play().catch(() => {});
    
    if (timerState.currentMode === 'focus') {
        stats.completedPomodoros++;
        stats.currentStreak++;
        stats.todayPomodoros++;
        stats.totalTime += Math.floor(timerState.totalTime / 60);
        
        if (timerState.currentTask) {
            const task = tasks.find(t => t.id === timerState.currentTask);
            if (task) {
                task.completed = true;
                task.timeSpent += Math.floor(timerState.totalTime / 60);
            }
        }
        
        showNotification('Focus session completed! 🎉', 'success');
        setMode('shortBreak');
        startTimer();
    } else {
        showNotification('Short break completed! 🌴', 'success');
        setMode('focus');
        startTimer();
    }
    
    updateStats();
    saveData();
    loadTasks();
    syncWithPipWindow();
}

function skipTimer() {
    completeTimer();
    syncWithPipWindow();
}

function updateDisplay() {
    const minutes = Math.floor(timerState.timeRemaining / 60);
    const seconds = timerState.timeRemaining % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('timerTime').textContent = timeString;
}

function updateProgress() {
    const progress = ((timerState.totalTime - timerState.timeRemaining) / timerState.totalTime) * 360;
    document.getElementById('timerProgress').style.background = `conic-gradient(var(--mode-primary-color) ${progress}deg, transparent ${progress}deg)`;
}

function togglePIP() {
    if (timerState.pipActive) {
        closePipWindow();
    } else {
        openPipWindow();
    }
}

function openPipWindow() {
    if (pipWindow && !pipWindow.closed) {
        pipWindow.focus();
        return;
    }

    const pipButtonColor = timerState.currentMode === 'shortBreak' ? '#3498db' : '#e74c3c';

    const pipContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title></title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: ${themeColors[settings.theme] || '#282c34'};
                    color: #ffffff;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 10px;
                    position: relative;
                }

                .content-wrapper {
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 10px;
                    width: 100%;
                    max-width: 260px;
                }

                .pip-header {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 16px;
                    font-weight: bold;
                }

                .pip-timer-section {
                    position: relative;
                    width: 180px;
                    height: 180px;
                    border-radius: 50%;
                    background: #353b48;
                    border: 6px solid ${pipButtonColor};
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                }

                .pip-timer-progress {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: conic-gradient(${pipButtonColor} 0deg, transparent 0deg);
                    z-index: 1;
                }

                .timer-label-group {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 5px;
                    z-index: 2;
                }

                .pip-timer {
                    font-size: 32px;
                    font-weight: bold;
                    color: #ffffff;
                }

                .pip-label {
                    font-size: 12px;
                    color: #a0a0a0;
                }

                .pip-controls {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }

                .pip-btn {
                    width: 25px;
                    height: 25px;
                    border-radius: 50%;
                    background: ${pipButtonColor};
                    border: none;
                    color: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    transition: transform 0.3s ease;
                }

                .pip-btn:hover {
                    transform: translateY(-2px);
                }

                .spotify-player {
                    width: 100%;
                    max-width: 200px;
                    background: #353b48;
                    border-radius: 12px;
                    padding: 8px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                }

                .card-title {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 12px;
                    font-weight: bold;
                    margin-bottom: 8px;
                }

                .spotify-track {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .track-info {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                    max-width: 110px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .track-name {
                    font-size: 11px;
                    font-weight: bold;
                    color: #ffffff;
                }

                .track-artist {
                    font-size: 9px;
                    color: #a0a0a0;
                }

                .spotify-controls {
                    display: flex;
                    gap: 5px;
                    align-items: center;
                }

                .spotify-btn {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #1db954;
                    color: white;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    transition: transform 0.3s ease;
                }

                .spotify-btn:hover {
                    transform: translateY(-2px);
                }

                .back-btn {
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 25px;
                    height: 25px;
                    border-radius: 50%;
                    background: #e74c3c;
                    border: none;
                    color: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    transition: transform 0.3s ease;
                }

                .back-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                }

                .pip-notifications {
                    position: absolute;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    width: 90%;
                    max-width: 300px;
                    z-index: 1000;
                }

                .notification {
                    background: #333;
                    color: white;
                    padding: 8px 12px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    font-size: 12px;
                    opacity: 1;
                    transition: opacity 0.3s ease;
                    max-width: 100%;
                    word-wrap: break-word;
                }

                .notification.success {
                    background: #28a745;
                }

                .notification.error {
                    background: #dc3545;
                }

                .notification.info {
                    background: #17a2b8;
                }
            </style>
        </head>
        <body>
            <div class="pip-notifications" id="pipNotifications"></div>
            <div class="content-wrapper">
                <button class="back-btn" onclick="backToTab()">↩️</button>
                <div class="pip-timer-section">
                    <div class="pip-timer-progress" id="pipProgress"></div>
                    <div class="timer-label-group">
                        <div class="pip-timer" id="pipTimer">25:00</div>
                        <div class="pip-label" id="pipLabel">FOCUS</div>
                    </div>
                </div>
                <div class="pip-controls">
                    <button class="pip-btn" onclick="toggleTimer()" id="pipPlayBtn">▶️</button>
                    <button class="pip-btn" onclick="resetTimer()">⏹️</button>
                    <button class="pip-btn" onclick="skipTimer()">⏭️</button>
                </div>
                <div class="spotify-player">
                    <div class="card-title">
                        <span>🎧</span>
                        <span>Spotify Music</span>
                    </div>
                    <div class="spotify-track">
                        <div class="track-info">
                            <div class="track-name" id="pipTrackName">YOUR EYES</div>
                            <div class="track-artist" id="pipTrackArtist">Joey Pecoraro</div>
                        </div>
                        <div class="spotify-controls">
                            <button class="spotify-btn" onclick="prevTrack()">⏮️</button>
                            <button class="spotify-btn" onclick="toggleSpotify()" id="pipSpotifyBtn">▶️</button>
                            <button class="spotify-btn" onclick="nextTrack()">⏭️</button>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                let timerState = ${JSON.stringify(timerState)};
                let isSpotifyPlaying = ${isSpotifyPlaying};
                let currentTrack = ${JSON.stringify(currentTrack)};

                const themeColors = ${JSON.stringify(themeColors)};

                function applyTheme() {
                    const settings = JSON.parse(localStorage.getItem('tomodoro_settings') || '{}');
                    const theme = settings.theme || 'default';
                    document.body.style.background = themeColors[theme] || '#282c34';
                    document.body.style.color = theme === 'light' ? '#333333' : '#ffffff';
                    document.querySelector('.pip-header').style.color = theme === 'light' ? '#333333' : '#ffffff';
                    document.querySelector('.card-title').style.color = theme === 'light' ? '#333333' : '#ffffff';
                    document.querySelector('.track-artist').style.color = theme === 'light' ? '#666666' : '#a0a0a0';
                }

                function showPipNotification(message, type) {
                    const notifications = document.getElementById('pipNotifications');
                    const notification = document.createElement('div');
                    notification.className = \`notification \${type}\`;
                    notification.innerHTML = \`<span>\${message}</span>\`;
                    notifications.appendChild(notification);
                    
                    setTimeout(() => {
                        notification.style.opacity = '0';
                        setTimeout(() => notification.remove(), 300);
                    }, 3000);
                }

                window.addEventListener('message', (event) => {
                    const { action, message, type } = event.data;
                    if (action === 'showNotification') {
                        showPipNotification(message, type);
                    }
                });

                window.addEventListener('storage', (event) => {
                    if (event.key === 'tomodoro_timerState') {
                        timerState = JSON.parse(event.newValue);
                        updatePipDisplay();
                        updatePipProgress();
                        document.getElementById('pipPlayBtn').innerHTML = timerState.isRunning ? '⏸️' : '▶️';
                        document.getElementById('pipLabel').textContent = timerState.currentMode === 'focus' ? 'FOCUS' : 'SHORT BREAK';
                    }
                    if (event.key === 'tomodoro_spotifyState') {
                        const newSpotifyState = JSON.parse(event.newValue);
                        isSpotifyPlaying = newSpotifyState.isSpotifyPlaying;
                        currentTrack = newSpotifyState.currentTrack;
                        updatePipSpotifyDisplay();
                        document.getElementById('pipSpotifyBtn').innerHTML = isSpotifyPlaying ? '⏸️' : '▶️';
                    }
                    if (event.key === 'tomodoro_settings') {
                        applyTheme();
                    }
                });

                function updatePipDisplay() {
                    const minutes = Math.floor(timerState.timeRemaining / 60);
                    const seconds = timerState.timeRemaining % 60;
                    const timeString = \`\${minutes.toString().padStart(2, '0')}:\${seconds.toString().padStart(2, '0')}\`;
                    document.getElementById('pipTimer').textContent = timeString;
                }

                function updatePipProgress() {
                    const progress = ((timerState.totalTime - timerState.timeRemaining) / timerState.totalTime) * 360;
                    document.getElementById('pipProgress').style.background = \`conic-gradient(${pipButtonColor} \${progress}deg, transparent \${progress}deg)\`;
                }

                function updatePipSpotifyDisplay() {
                    document.getElementById('pipTrackName').textContent = currentTrack.name;
                    document.getElementById('pipTrackArtist').textContent = currentTrack.artist;
                }

                function toggleTimer() {
                    window.opener.postMessage({ action: 'toggleTimer' }, '*');
                }

                function resetTimer() {
                    window.opener.postMessage({ action: 'resetTimer' }, '*');
                }

                function skipTimer() {
                    window.opener.postMessage({ action: 'skipTimer' }, '*');
                }

                function toggleSpotify() {
                    window.opener.postMessage({ action: 'toggleSpotify' }, '*');
                }

                function nextTrack() {
                    window.opener.postMessage({ action: 'nextTrack' }, '*');
                }

                function prevTrack() {
                    window.opener.postMessage({ action: 'prevTrack' }, '*');
                }

                function backToTab() {
                    window.opener.postMessage({ action: 'closePip' }, '*');
                    window.close();
                }

                updatePipDisplay();
                updatePipProgress();
                updatePipSpotifyDisplay();
                applyTheme();

                window.addEventListener('beforeunload', () => {
                    window.opener.postMessage({ action: 'closePip' }, '*');
                });
            </script>
        </body>
        </html>
    `;

    const blob = new Blob([pipContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const pipWidth = 300;
    const pipHeight = 300;
    const leftPosition = (screen.width - pipWidth) / 2;
    const topPosition = screen.height - pipHeight - 50;
    pipWindow = window.open(url, 'PIPWindow', `width=${pipWidth},height=${pipHeight},top=${topPosition},left=${leftPosition},menubar=no,toolbar=no,location=no,status=no,resizable=yes`);
    
    if (!pipWindow) {
        alert('Popup blocked! Please allow popups for this site.');
        return;
    }

    timerState.pipActive = true;
    document.getElementById('pipBtn').textContent = '📴 Close PIP';
    updatePipVisibility();

    pipWindow.onunload = () => {
        timerState.pipActive = false;
        pipWindow = null;
        if (isSpotifyPlaying) {
            pauseSpotify();
            isSpotifyPlaying = false;
            document.getElementById('spotifyPlayBtn').innerHTML = '▶️';
        }
        document.getElementById('pipBtn').textContent = '📺 PIP Mode';
        updatePipVisibility();
        syncWithPipWindow();
    };

    updateDisplay();
    updateProgress();
    syncWithPipWindow();
}

function closePipWindow() {
    if (pipWindow && !pipWindow.closed) {
        pipWindow.close();
    }
    timerState.pipActive = false;
    pipWindow = null;
    if (isSpotifyPlaying) {
        pauseSpotify();
        isSpotifyPlaying = false;
        document.getElementById('spotifyPlayBtn').innerHTML = '▶️';
    }
    document.getElementById('pipBtn').textContent = '📺 PIP Mode';
    updatePipVisibility();
    syncWithPipWindow();
}

window.addEventListener('message', (event) => {
    const { action } = event.data;
    if (action === 'toggleTimer') {
        toggleTimer();
    } else if (action === 'resetTimer') {
        resetTimer();
    } else if (action === 'skipTimer') {
        skipTimer();
    } else if (action === 'toggleSpotify') {
        toggleSpotify();
    } else if (action === 'nextTrack') {
        nextTrack();
    } else if (action === 'prevTrack') {
        prevTrack();
    } else if (action === 'closePip') {
        closePipWindow();
    }
});

function syncWithPipWindow() {
    localStorage.setItem('tomodoro_timerState', JSON.stringify(timerState));
    localStorage.setItem('tomodoro_spotifyState', JSON.stringify({
        isSpotifyPlaying,
        currentTrack
    }));
}

function toggleSpotify() {
    isSpotifyPlaying = !isSpotifyPlaying;
    document.getElementById('spotifyPlayBtn').innerHTML = isSpotifyPlaying ? '⏸️' : '▶️';
    
    if (timerState.currentMode === 'focus') {
        if (isSpotifyPlaying) {
            playSpotify();
        } else {
            pauseSpotify();
        }
    } else {
        pauseSpotify();
        isSpotifyPlaying = false;
        document.getElementById('spotifyPlayBtn').innerHTML = '▶️';
    }
    syncWithPipWindow();
}

function playSpotify() {
    const player = document.getElementById('spotifyPlayer');
    if (!player) {
        showNotification('Spotify player not found!', 'error');
        return;
    }
    if (!spotifyIframeReady) {
        showNotification('Spotify player is not ready yet. Please wait.', 'info');
        return;
    }
    try {
        player.contentWindow.postMessage('{"method":"play"}', 'https://open.spotify.com');
        showNotification('Playing Spotify', 'success');
    } catch (error) {
        showNotification('Failed to play Spotify. Ensure you are logged in and have a Premium account if required.', 'error');
        fallbackToggleVisibility(true);
    }
}

function pauseSpotify() {
    const player = document.getElementById('spotifyPlayer');
    if (!player) {
        showNotification('Spotify player not found!', 'error');
        return;
    }
    if (!spotifyIframeReady) {
        showNotification('Spotify player is not ready yet. Please wait.', 'info');
        return;
    }
    try {
        player.contentWindow.postMessage('{"method":"pause"}', 'https://open.spotify.com');
        showNotification('Paused Spotify', 'success');
    } catch (error) {
        showNotification('Failed to pause Spotify.', 'error');
        fallbackToggleVisibility(false);
    }
}

function fallbackToggleVisibility(play) {
    const player = document.getElementById('spotifyPlayer');
    if (play) {
        player.style.top = '0px';
        player.style.left = '0px';
        player.style.opacity = '1';
        setTimeout(() => {
            player.style.top = '-9999px';
            player.style.left = '-9999px';
            player.style.opacity = '0';
        }, 100);
    } else {
        player.style.top = '-9999px';
        player.style.left = '-9999px';
        player.style.opacity = '0';
    }
}

function nextTrack() {
    const player = document.getElementById('spotifyPlayer');
    if (!player) {
        showNotification('Spotify player not found!', 'error');
        return;
    }
    if (!spotifyIframeReady) {
        showNotification('Spotify player is not ready yet. Please wait.', 'info');
        return;
    }
    try {
        player.contentWindow.postMessage('{"method":"next"}', 'https://open.spotify.com');
        currentTrack.name = "Next Track";
        currentTrack.artist = "Next Artist";
        updateSpotifyDisplay();
        syncWithPipWindow();
    } catch (error) {
        showNotification('Failed to skip to next track.', 'error');
    }
}

function prevTrack() {
    const player = document.getElementById('spotifyPlayer');
    if (!player) {
        showNotification('Spotify player not found!', 'error');
        return;
    }
    if (!spotifyIframeReady) {
        showNotification('Spotify player is not ready yet. Please wait.', 'info');
        return;
    }
    try {
        player.contentWindow.postMessage('{"method":"previous"}', 'https://open.spotify.com');
        currentTrack.name = "Previous Track";
        currentTrack.artist = "Previous Artist";
        updateSpotifyDisplay();
        syncWithPipWindow();
    } catch (error) {
        showNotification('Failed to go to previous track.', 'error');
    }
}

function updateSpotifyDisplay() {
    document.getElementById('trackName').textContent = currentTrack.name;
    document.getElementById('trackArtist').textContent = currentTrack.artist;
}

function updateSettings() {
    settings.focusDuration = parseInt(document.getElementById('focusDuration').value) || 25;
    settings.shortBreakDuration = parseInt(document.getElementById('shortBreakDuration').value) || 5;
    
    if (timerState.currentMode === 'focus') {
        timerState.timeRemaining = settings.focusDuration * 60;
        timerState.totalTime = settings.focusDuration * 60;
    } else {
        timerState.timeRemaining = settings.shortBreakDuration * 60;
        timerState.totalTime = settings.shortBreakDuration * 60;
    }
    
    updateDisplay();
    updateProgress();
    saveData();
    syncWithPipWindow();
}

function setTheme(theme) {
    settings.theme = theme;
    document.body.dataset.theme = theme;
    document.body.style.background = themeColors[theme] || '#282c34';
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.textContent.toLowerCase() === theme);
    });
    saveData();
    if (pipWindow && !pipWindow.closed) {
        pipWindow.postMessage({ action: 'updateTheme', theme: theme }, '*');
    }
}

function showNotification(message, type) {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<span>${message}</span>`;
    notifications.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);

    // Send notification to PIP window if it's open
    if (pipWindow && !pipWindow.closed) {
        pipWindow.postMessage({ action: 'showNotification', message: message, type: type }, '*');
    }
}

function addTask() {
    const input = document.getElementById('taskInput');
    const text = input.value.trim();
    const priority = 'medium';
    if (text) {
        tasks.push({
            id: Date.now(),
            text,
            priority,
            completed: false,
            timeSpent: 0
        });
        input.value = '';
        loadTasks();
        saveData();
    }
}

function handleTaskInput(event) {
    if (event.key === 'Enter') {
        addTask();
    }
}

function loadTasks() {
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const taskList = document.getElementById('taskList');
    taskList.innerHTML = '';
    tasks.forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        taskItem.innerHTML = `
            <span style="text-decoration: ${task.completed ? 'line-through' : 'none'}">
                ${task.text} (${task.timeSpent}m) [${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}]
            </span>
            <button class="btn" onclick="deleteTask(${task.id})">🗑️</button>
        `;
        taskList.appendChild(taskItem);
    });
}

function deleteTask(id) {
    tasks = tasks.filter(task => task.id !== id);
    if (timerState.currentTask === id) {
        timerState.currentTask = null;
    }
    loadTasks();
    saveData();
}

function updateStats() {
    document.getElementById('completedPomodoros').textContent = stats.completedPomodoros;
    document.getElementById('totalTime').textContent = `${Math.floor(stats.totalTime / 60)}h ${stats.totalTime % 60}m`;
    document.getElementById('currentStreak').textContent = stats.currentStreak;
    document.getElementById('todayPomodoros').textContent = stats.todayPomodoros;
}

function checkDailyReset() {
    const today = new Date().toDateString();
    if (stats.lastDate !== today) {
        stats.todayPomodoros = 0;
        stats.lastDate = today;
        saveData();
    }
}

function saveData() {
    localStorage.setItem('tomodoro_settings', JSON.stringify(settings));
    localStorage.setItem('tomodoro_stats', JSON.stringify(stats));
    localStorage.setItem('tomodoro_tasks', JSON.stringify(tasks));
    localStorage.setItem('tomodoro_presets', JSON.stringify(presets));
}

function loadData() {
    const savedSettings = localStorage.getItem('tomodoro_settings');
    const savedStats = localStorage.getItem('tomodoro_stats');
    const savedTasks = localStorage.getItem('tomodoro_tasks');
    const savedPresets = localStorage.getItem('tomodoro_presets');
    
    if (savedSettings) settings = JSON.parse(savedSettings);
    if (savedStats) stats = JSON.parse(savedStats);
    if (savedTasks) tasks = JSON.parse(savedTasks);
    if (savedPresets) presets = JSON.parse(savedPresets);
    
    document.getElementById('focusDuration').value = settings.focusDuration;
    document.getElementById('shortBreakDuration').value = settings.shortBreakDuration;
    setTheme(settings.theme);
    timerState.timeRemaining = settings.focusDuration * 60;
    timerState.totalTime = settings.focusDuration * 60;
}

function exportData() {
    const data = {
        settings,
        stats,
        tasks,
        presets
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tomodoro_data.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importData() {
    document.getElementById('importFile').click();
}

function handleImport(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                settings = data.settings || settings;
                stats = data.stats || stats;
                tasks = data.tasks || tasks;
                presets = data.presets || presets;
                
                document.getElementById('focusDuration').value = settings.focusDuration;
                document.getElementById('shortBreakDuration').value = settings.shortBreakDuration;
                setTheme(settings.theme);
                setMode(timerState.currentMode);
                updateStats();
                loadTasks();
                saveData();
                showNotification('Data imported successfully!', 'success');
            } catch (error) {
                showNotification('Error importing data', 'error');
            }
        };
        reader.readAsText(file);
    }
}

function changeWhiteNoise() {
    if (whiteNoiseAudio) {
        whiteNoiseAudio.pause();
        whiteNoiseAudio = null;
    }
    
    const select = document.getElementById('whiteNoiseSelect');
    const value = select.value;
    if (value) {
        whiteNoiseAudio = new Audio(`https://www.example.com/sounds/${value}.mp3`);
        whiteNoiseAudio.loop = true;
        whiteNoiseAudio.volume = document.getElementById('volumeSlider').value / 100;
        whiteNoiseAudio.play().catch(() => {});
    }
}

function adjustVolume() {
    if (whiteNoiseAudio) {
        whiteNoiseAudio.volume = document.getElementById('volumeSlider').value / 100;
    }
}

function createServiceWorker() {
    const swCode = `
        self.addEventListener('install', event => {
            event.waitUntil(
                caches.open('tomodoro-cache').then(cache => {
                    return cache.addAll([
                        '/',
                        '/index.html',
                        '/styles.css',
                        '/script.js'
                    ]);
                })
            );
        });

        self.addEventListener('fetch', event => {
            event.respondWith(
                caches.match(event.request).then(response => {
                    return response || fetch(event.request);
                })
            );
        });
    `;
    
    const blob = new Blob([swCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
}

function toggleSettings() {
    document.getElementById('settingsCard').classList.toggle('hidden');
}

function savePreset() {
    const presetName = "Custom Preset " + (presets.length + 1);
    if (presetName) {
        presets.push({
            name: presetName,
            focusDuration: settings.focusDuration,
            shortBreakDuration: settings.shortBreakDuration
        });
        updatePresets();
        saveData();
        showNotification(`Preset "${presetName}" saved!`, 'success');
    }
}

function applyPreset() {
    const presetName = document.getElementById('presetSelect')?.value;
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
        settings.focusDuration = preset.focusDuration;
        settings.shortBreakDuration = preset.shortBreakDuration;

        timerState.currentMode = 'focus';
        timerState.timeRemaining = settings.focusDuration * 60;
        timerState.totalTime = settings.focusDuration * 60;
        document.getElementById('focusDuration').value = settings.focusDuration;
        document.getElementById('shortBreakDuration').value = settings.shortBreakDuration;
        updateDisplay();
        updateProgress();
        saveData();
        showNotification(`Applied preset "${presetName}"`, 'success');
    }
}

function updatePresets() {
    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
        presetSelect.innerHTML = '<option value="">Select Preset</option>';
        presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.name;
            option.textContent = preset.name;
            presetSelect.appendChild(option);
        });
    }
}