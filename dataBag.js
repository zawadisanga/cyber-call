// Data management and utility functions for CyberCall

class DataBag {
  constructor() {
    this.storage = localStorage;
    this.sessionData = new Map();
  }

  // User data management
  setCurrentUser(userData) {
    this.storage.setItem('cybercall_user', JSON.stringify(userData));
    this.sessionData.set('user', userData);
  }

  getCurrentUser() {
    const stored = this.storage.getItem('cybercall_user');
    if (stored) {
      return JSON.parse(stored);
    }
    return this.sessionData.get('user') || null;
  }

  clearCurrentUser() {
    this.storage.removeItem('cybercall_user');
    this.sessionData.delete('user');
  }

  // Call history
  saveCallHistory(call) {
    let history = this.getCallHistory();
    history.unshift(call);
    // Keep only last 100 calls
    history = history.slice(0, 100);
    this.storage.setItem('cybercall_history', JSON.stringify(history));
  }

  getCallHistory() {
    const stored = this.storage.getItem('cybercall_history');
    return stored ? JSON.parse(stored) : [];
  }

  // Blocked users
  addBlockedUser(userId) {
    let blocked = this.getBlockedUsers();
    if (!blocked.includes(userId)) {
      blocked.push(userId);
      this.storage.setItem('cybercall_blocked', JSON.stringify(blocked));
    }
  }

  removeBlockedUser(userId) {
    let blocked = this.getBlockedUsers();
    blocked = blocked.filter(id => id !== userId);
    this.storage.setItem('cybercall_blocked', JSON.stringify(blocked));
  }

  getBlockedUsers() {
    const stored = this.storage.getItem('cybercall_blocked');
    return stored ? JSON.parse(stored) : [];
  }

  isUserBlocked(userId) {
    return this.getBlockedUsers().includes(userId);
  }

  // Chat messages cache
  saveMessages(chatId, messages) {
    const allChats = this.getChats();
    allChats[chatId] = messages;
    this.storage.setItem('cybercall_chats', JSON.stringify(allChats));
  }

  getMessages(chatId) {
    const allChats = this.getChats();
    return allChats[chatId] || [];
  }

  addMessage(chatId, message) {
    const messages = this.getMessages(chatId);
    messages.push(message);
    this.saveMessages(chatId, messages);
  }

  getChats() {
    const stored = this.storage.getItem('cybercall_chats');
    return stored ? JSON.parse(stored) : {};
  }

  // Settings
  saveSettings(settings) {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    this.storage.setItem('cybercall_settings', JSON.stringify(updated));
  }

  getSettings() {
    const stored = this.storage.getItem('cybercall_settings');
    return stored ? JSON.parse(stored) : {
      incognitoMode: false,
      blockStrangers: false,
      screenBlur: false,
      soundEnabled: true
    };
  }

  // Voice notes cache
  saveVoiceNote(noteId, audioBlob) {
    const reader = new FileReader();
    reader.onloadend = () => {
      this.storage.setItem(`voicenote_${noteId}`, reader.result);
    };
    reader.readAsDataURL(audioBlob);
  }

  getVoiceNote(noteId) {
    return this.storage.getItem(`voicenote_${noteId}`);
  }

  // Country data
  getCountries() {
    return fetch('/api/countries').then(res => res.json());
  }

  // Helper methods
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Export for use in browser
window.DataBag = DataBag;
window.db = new DataBag();
