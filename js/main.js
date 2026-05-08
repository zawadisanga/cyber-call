// CyberCall Main Application Logic

// Global state
window.CyberCall = {
    socket: null,
    currentUser: null,
    currentCall: null,
    settings: {},
    
    init: function() {
        this.loadUser();
        this.loadSettings();
        this.initSocket();
        this.setupEventListeners();
    },
    
    loadUser: function() {
        const userData = localStorage.getItem('userData');
        if (userData) {
            this.currentUser = JSON.parse(userData);
        }
    },
    
    loadSettings: function() {
        const settings = localStorage.getItem('cybercall_settings');
        if (settings) {
            this.settings = JSON.parse(settings);
        } else {
            this.settings = {
                incognitoMode: false,
                blockStrangers: false,
                screenBlur: false,
                soundEnabled: true
            };
        }
    },
    
    initSocket: function() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            if (this.currentUser && !this.settings.incognitoMode) {
                this.socket.emit('user-online', {
                    userId: this.currentUser.userId,
                    username: this.currentUser.username,
                    country: this.currentUser.country
                });
            }
        });
    },
    
    setupEventListeners: function() {
        // Handle page visibility for incognito mode
        document.addEventListener('visibilitychange', () => {
            if (this.socket && this.currentUser) {
                const isHidden = document.hidden;
                this.socket.emit('user-status', {
                    userId: this.currentUser.userId,
                    status: isHidden ? 'away' : 'online'
                });
            }
        });
    },
    
    playSound: function(soundName) {
        if (!this.settings.soundEnabled) return;
        
        const sounds = {
            ring: 'data:audio/wav;base64,U3RlYWx0aCBzb3VuZA==',
            message: 'data:audio/wav;base64,U3RlYWx0aCBzb3VuZA==',
            callEnd: 'data:audio/wav;base64,U3RlYWx0aCBzb3VuZA=='
        };
        
        if (sounds[soundName]) {
            const audio = new Audio(sounds[soundName]);
            audio.play().catch(e => console.log('Audio play failed:', e));
        }
    },
    
    formatTime: function(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    },
    
    formatDuration: function(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    },
    
    showNotification: function(title, body, icon) {
        if (Notification.permission === 'granted') {
            new Notification(title, { body, icon });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    },
    
    isUserBlocked: function(userId) {
        const blocked = JSON.parse(localStorage.getItem('cybercall_blocked') || '[]');
        return blocked.includes(userId);
    },
    
    blockUser: function(userId) {
        let blocked = JSON.parse(localStorage.getItem('cybercall_blocked') || '[]');
        if (!blocked.includes(userId)) {
            blocked.push(userId);
            localStorage.setItem('cybercall_blocked', JSON.stringify(blocked));
        }
    },
    
    unblockUser: function(userId) {
        let blocked = JSON.parse(localStorage.getItem('cybercall_blocked') || '[]');
        blocked = blocked.filter(id => id !== userId);
        localStorage.setItem('cybercall_blocked', JSON.stringify(blocked));
    },
    
    saveCallToHistory: function(callData) {
        const history = JSON.parse(localStorage.getItem('callHistory') || '[]');
        history.unshift({
            ...callData,
            timestamp: new Date().toISOString()
        });
        // Keep only last 100 calls
        const trimmed = history.slice(0, 100);
        localStorage.setItem('callHistory', JSON.stringify(trimmed));
    },
    
    clearAllData: function() {
        if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            localStorage.clear();
            window.location.href = '/';
        }
    },
    
    getQueryParam: function(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }
};

// Request notification permission on load
if ('Notification' in window) {
    Notification.requestPermission();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.CyberCall.init();
});
