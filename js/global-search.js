// Global Search Functionality

class GlobalSearch {
    constructor() {
        this.users = [];
        this.searchInput = null;
        this.resultsContainer = null;
        this.filters = {
            onlineOnly: false,
            country: null
        };
    }
    
    init(searchInputId, resultsContainerId) {
        this.searchInput = document.getElementById(searchInputId);
        this.resultsContainer = document.getElementById(resultsContainerId);
        
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.search());
            this.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.search();
            });
        }
        
        this.loadUsers();
    }
    
    async loadUsers() {
        try {
            const response = await fetch('/api/users');
            this.users = await response.json();
            this.displayResults(this.users);
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }
    
    search() {
        const query = this.searchInput.value.toLowerCase().trim();
        
        if (query === '') {
            this.displayResults(this.users);
            return;
        }
        
        const filtered = this.users.filter(user => {
            const matchesName = user.username.toLowerCase().includes(query);
            const matchesCountry = user.country && user.country.toLowerCase().includes(query);
            const matchesOnline = !this.filters.onlineOnly || user.online;
            const matchesCountryFilter = !this.filters.country || user.country === this.filters.country;
            
            return (matchesName || matchesCountry) && matchesOnline && matchesCountryFilter;
        });
        
        this.displayResults(filtered);
    }
    
    displayResults(users) {
        if (!this.resultsContainer) return;
        
        if (users.length === 0) {
            this.resultsContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <p>No users found</p>
                </div>
            `;
            return;
        }
        
        this.resultsContainer.innerHTML = users.map(user => `
            <div class="user-card glass">
                <div class="user-avatar">
                    ${user.username.charAt(0).toUpperCase()}
                </div>
                <div class="user-info">
                    <div class="user-name">
                        ${user.username}
                        ${user.online ? '<span class="online-indicator"></span>' : ''}
                    </div>
                    <div class="user-country">
                        <i class="fas fa-map-marker-alt"></i> ${user.country || 'Unknown'}
                    </div>
                </div>
                <div class="user-actions">
                    <button class="action-btn" onclick="window.CyberCall.startChat('${user.userId}', '${user.username}')">
                        <i class="fas fa-comment"></i>
                    </button>
                    <button class="action-btn" onclick="window.CyberCall.startCall('${user.userId}', '${user.username}')">
                        <i class="fas fa-phone"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    setFilterOnlineOnly(enabled) {
        this.filters.onlineOnly = enabled;
        this.search();
    }
    
    setCountryFilter(country) {
        this.filters.country = country;
        this.search();
    }
    
    clearFilters() {
        this.filters = {
            onlineOnly: false,
            country: null
        };
        this.search();
    }
    
    async getCountries() {
        try {
            const response = await fetch('/api/countries');
            return await response.json();
        } catch (error) {
            console.error('Error loading countries:', error);
            return [];
        }
    }
}

// Initialize global search when DOM is ready
window.GlobalSearch = GlobalSearch;
