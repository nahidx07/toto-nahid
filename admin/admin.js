// Firebase Initialization
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// Global Variables
let currentUser = null;
let editMatchId = null;
let editUserId = null;
let currentPage = 'dashboard';
let usersData = [];
let matchesData = [];
let currentPageNumber = 1;
let itemsPerPage = 10;

// Chart.js Instance
let userGrowthChart = null;

// Login Function
function adminLogin() {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorElement = document.getElementById('login-error');
    
    // Clear previous error
    errorElement.style.display = 'none';
    errorElement.textContent = '';
    
    // Validation
    if (!email || !password) {
        errorElement.textContent = 'ইমেইল এবং পাসওয়ার্ড দিন';
        errorElement.style.display = 'block';
        return;
    }
    
    // Show loading state
    const loginBtn = document.querySelector('.login-btn');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> লগইন হচ্ছে...';
    loginBtn.disabled = true;
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            return userCredential.user.getIdTokenResult();
        })
        .then((idTokenResult) => {
            // Check if user is admin
            if (idTokenResult.claims.admin !== true) {
                throw new Error('আপনার এডমিন এক্সেস নেই। শুধুমাত্র অনুমোদিত এডমিন লগইন করতে পারেন।');
            }
            
            currentUser = auth.currentUser;
            
            // Hide login, show dashboard
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('admin-dashboard').style.display = 'flex';
            
            // Update admin name
            document.getElementById('admin-name').textContent = 
                currentUser.email.split('@')[0];
            
            // Load dashboard data
            loadDashboardData();
            loadMatches();
            loadUsers();
            loadSettings();
            loadLogs();
            loadNotifications();
            
            // Start time update
            updateCurrentTime();
            setInterval(updateCurrentTime, 60000);
            
            // Log admin login
            logActivity('login', `${currentUser.email} এডমিন হিসাবে লগইন করেছেন`);
            
        }).catch((error) => {
            // Show error
            errorElement.textContent = error.message;
            errorElement.style.display = 'block';
            
            // Reset button
            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;
            
            console.error('Login error:', error);
        });
}

// Logout Function
function adminLogout() {
    if (confirm('আপনি কি লগআউট করতে চান?')) {
        // Log logout activity
        if (currentUser) {
            logActivity('logout', `${currentUser.email} লগআউট করেছেন`);
        }
        
        auth.signOut().then(() => {
            // Hide dashboard, show login
            document.getElementById('admin-dashboard').style.display = 'none';
            document.getElementById('login-section').style.display = 'flex';
            
            // Clear form
            document.getElementById('admin-email').value = '';
            document.getElementById('admin-password').value = '';
            document.getElementById('login-error').style.display = 'none';
            
            // Reset variables
            currentUser = null;
            editMatchId = null;
            editUserId = null;
        }).catch((error) => {
            console.error('Logout error:', error);
            alert('লগআউট করতে সমস্যা: ' + error.message);
        });
    }
}

// Auto Login Check
auth.onAuthStateChanged((user) => {
    if (user) {
        user.getIdTokenResult().then((idTokenResult) => {
            if (idTokenResult.claims.admin === true) {
                currentUser = user;
                
                // Hide login, show dashboard
                document.getElementById('login-section').style.display = 'none';
                document.getElementById('admin-dashboard').style.display = 'flex';
                
                // Update admin name
                document.getElementById('admin-name').textContent = 
                    user.email.split('@')[0];
                
                // Load data
                loadDashboardData();
                loadMatches();
                loadUsers();
                loadSettings();
                loadLogs();
                loadNotifications();
                
                // Start time update
                updateCurrentTime();
                setInterval(updateCurrentTime, 60000);
                
                // Log activity
                logActivity('login', `${user.email} অটো লগইন করেছেন`);
            } else {
                adminLogout();
                alert('আপনার এডমিন এক্সেস নেই।');
            }
        });
    }
});

// Dashboard Functions
function loadDashboardData() {
    // Total Users
    database.ref('users').on('value', (snapshot) => {
        const userCount = snapshot.numChildren();
        document.getElementById('total-users').textContent = formatNumber(userCount);
        document.getElementById('header-users').textContent = formatNumber(userCount);
        
        // Update top users table
        updateTopUsersTable(snapshot);
    });
    
    // Active Viewers and Matches
    database.ref('matches').on('value', (snapshot) => {
        let activeMatches = 0;
        let totalWatching = 0;
        
        snapshot.forEach((child) => {
            const match = child.val();
            if (match.status === 'active') {
                activeMatches++;
                totalWatching += match.watching || 0;
            }
        });
        
        document.getElementById('active-viewers').textContent = formatNumber(totalWatching);
        document.getElementById('header-watching').textContent = formatNumber(totalWatching);
        document.getElementById('header-matches').textContent = formatNumber(activeMatches);
        
        // Update matches data for chart
        matchesData = [];
        snapshot.forEach((child) => {
            matchesData.push({ id: child.key, ...child.val() });
        });
    });
    
    // Total Chats
    database.ref('chats').on('value', (snapshot) => {
        let totalChats = 0;
        snapshot.forEach((matchChats) => {
            totalChats += matchChats.numChildren();
        });
        document.getElementById('total-chats').textContent = formatNumber(totalChats);
    });
    
    // Top XP
    database.ref('users').orderByChild('xp').limitToLast(1).on('value', (snapshot) => {
        snapshot.forEach((child) => {
            const user = child.val();
            document.getElementById('top-xp').textContent = formatNumber(user.xp || 0);
        });
    });
    
    // Load activities
    loadRecentActivities();
    
    // Initialize chart
    initializeUserGrowthChart();
}

function initializeUserGrowthChart() {
    const ctx = document.getElementById('user-growth-chart').getContext('2d');
    
    // Destroy previous chart if exists
    if (userGrowthChart) {
        userGrowthChart.destroy();
    }
    
    // Get last 7 days data
    const last7Days = getLast7Days();
    const userData = Array(7).fill(0);
    
    database.ref('users').once('value').then((snapshot) => {
        snapshot.forEach((child) => {
            const user = child.val();
            if (user.createdAt) {
                const userDate = new Date(user.createdAt);
                const dayIndex = getDayIndex(userDate, last7Days);
                if (dayIndex !== -1) {
                    userData[dayIndex]++;
                }
            }
        });
        
        // Create chart
        userGrowthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days.map(date => formatDateShort(date)),
                datasets: [{
                    label: 'নতুন ব্যবহারকারী',
                    data: userData,
                    borderColor: '#3273dc',
                    backgroundColor: 'rgba(50, 115, 220, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#b0b0c0'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#b0b0c0'
                        }
                    }
                }
            }
        });
    });
}

function getLast7Days() {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date);
    }
    return dates;
}

function getDayIndex(userDate, dateArray) {
    const userDay = userDate.toDateString();
    for (let i = 0; i < dateArray.length; i++) {
        if (dateArray[i].toDateString() === userDay) {
            return i;
        }
    }
    return -1;
}

function formatDateShort(date) {
    return date.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' });
}

function updateTopUsersTable(snapshot) {
    const users = [];
    
    snapshot.forEach((child) => {
        const user = child.val();
        user.id = child.key;
        users.push(user);
    });
    
    // Sort by XP (descending)
    users.sort((a, b) => (b.xp || 0) - (a.xp || 0));
    
    // Get top 10
    const top10 = users.slice(0, 10);
    
    // Update table
    const tableElement = document.getElementById('top-users-table');
    tableElement.innerHTML = '';
    
    top10.forEach((user, index) => {
        const rank = index + 1;
        
        const userElement = document.createElement('div');
        userElement.className = 'top-user-item';
        
        userElement.innerHTML = `
            <div class="user-rank">
                #${rank}
            </div>
            <div class="user-avatar">
                <img src="${user.profilePic || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'}" 
                     alt="${user.name}">
            </div>
            <div class="user-details">
                <h5>${user.name || 'অজানা'}</h5>
                <div class="user-xp">${formatNumber(user.xp || 0)} XP</div>
            </div>
            <div class="user-status">
                ${user.premium ? '<span class="premium-badge">PREMIUM</span>' : ''}
            </div>
        `;
        
        tableElement.appendChild(userElement);
    });
}

function loadRecentActivities() {
    database.ref('activities').orderByChild('timestamp').limitToLast(10).on('value', (snapshot) => {
        const activitiesList = document.getElementById('activities-list');
        activitiesList.innerHTML = '';
        
        const activities = [];
        snapshot.forEach((child) => {
            activities.unshift(child.val()); // Reverse order (newest first)
        });
        
        activities.forEach((activity) => {
            const activityElement = document.createElement('div');
            activityElement.className = 'activity-item';
            
            const icon = getActivityIcon(activity.type);
            const time = new Date(activity.timestamp).toLocaleString('bn-BD');
            
            activityElement.innerHTML = `
                <div class="activity-icon">
                    <i class="fas fa-${icon}"></i>
                </div>
                <div class="activity-content">
                    <p>${activity.message}</p>
                    <div class="activity-time">
                        <i class="far fa-clock"></i> ${time}
                    </div>
                </div>
            `;
            
            activitiesList.appendChild(activityElement);
        });
    });
}

function getActivityIcon(type) {
    const icons = {
        'login': 'sign-in-alt',
        'logout': 'sign-out-alt',
        'match_add': 'plus-circle',
        'match_edit': 'edit',
        'match_delete': 'trash',
        'user_add': 'user-plus',
        'user_edit': 'user-edit',
        'broadcast': 'bullhorn',
        'settings': 'cog',
        'xp_add': 'bolt',
        'xp_remove': 'minus-circle'
    };
    return icons[type] || 'circle';
}

// Tab Navigation
function switchTab(tabName, element) {
    currentPage = tabName;
    
    // Hide all tabs
    document.querySelectorAll('.tab-pane').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Add active class to clicked menu item
    if (element) {
        element.classList.add('active');
    } else {
        // Find and activate the corresponding menu item
        const menuItem = document.querySelector(`.menu-item[onclick*="${tabName}"]`);
        if (menuItem) {
            menuItem.classList.add('active');
        }
    }
    
    // Update page title
    const pageTitles = {
        'dashboard': 'ড্যাশবোর্ড',
        'matches': 'লাইভ ম্যাচ',
        'users': 'ব্যবহারকারী',
        'broadcast': 'ব্রডকাস্ট',
        'settings': 'সেটিংস',
        'logs': 'সিস্টেম লগস'
    };
    document.getElementById('page-title').textContent = pageTitles[tabName] || tabName;
    
    // Update date in dashboard
    if (tabName === 'dashboard') {
        const today = new Date();
        document.getElementById('dashboard-date').textContent = 
            today.toLocaleDateString('bn-BD', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
    }
    
    // Load specific data for the tab
    switch(tabName) {
        case 'users':
            loadUsers();
            break;
        case 'matches':
            loadMatches();
            break;
        case 'logs':
            loadLogs();
            break;
        case 'broadcast':
            loadBroadcastHistory();
            break;
    }
}

// Sidebar Functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
}

// Time Update
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('bn-BD', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const dateString = now.toLocaleDateString('bn-BD', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    });
    
    document.getElementById('current-time').textContent = 
        `${dateString} • ${timeString}`;
}

// Matches Management
function openAddMatchModal() {
    editMatchId = null;
    document.getElementById('match-form-card').style.display = 'block';
    document.getElementById('form-title').textContent = 'নতুন ম্যাচ যোগ করুন';
    document.getElementById('match-save-btn').innerHTML = '<i class="fas fa-save"></i> সংরক্ষণ করুন';
    
    // Reset form
    document.getElementById('match-title').value = '';
    document.getElementById('match-thumbnail').value = '';
    document.getElementById('match-video').value = '';
    document.getElementById('match-category').value = 'football';
    document.getElementById('match-status').value = 'active';
    document.getElementById('match-premium').checked = false;
    
    // Scroll to form
    document.getElementById('match-form-card').scrollIntoView({ behavior: 'smooth' });
}

function closeMatchForm() {
    document.getElementById('match-form-card').style.display = 'none';
    editMatchId = null;
}

function saveMatch() {
    const title = document.getElementById('match-title').value.trim();
    const thumbnail = document.getElementById('match-thumbnail').value.trim();
    const videoUrl = document.getElementById('match-video').value.trim();
    const category = document.getElementById('match-category').value;
    const status = document.getElementById('match-status').value;
    const premiumOnly = document.getElementById('match-premium').checked;
    
    // Validation
    if (!title) {
        alert('ম্যাচের টাইটেল দিন');
        return;
    }
    
    if (!thumbnail) {
        alert('থাম্বনেইল URL দিন');
        return;
    }
    
    if (!videoUrl) {
        alert('ভিডিও URL দিন');
        return;
    }
    
    // Validate URLs
    if (!isValidUrl(thumbnail) || !isValidUrl(videoUrl)) {
        alert('সঠিক URL লিখুন');
        return;
    }
    
    const matchData = {
        title: title,
        thumbnail: thumbnail,
        videoUrl: videoUrl,
        category: category,
        status: status,
        premiumOnly: premiumOnly,
        watching: 0,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdBy: currentUser.email
    };
    
    let promise;
    let activityType;
    let activityMessage;
    
    if (editMatchId) {
        // Update existing match
        promise = database.ref(`matches/${editMatchId}`).update(matchData);
        activityType = 'match_edit';
        activityMessage = `ম্যাচ আপডেট করেছেন: ${title}`;
    } else {
        // Add new match
        promise = database.ref('matches').push(matchData);
        activityType = 'match_add';
        activityMessage = `নতুন ম্যাচ যোগ করেছেন: ${title}`;
    }
    
    promise.then(() => {
        // Show success message
        showNotification(
            editMatchId ? 'ম্যাচ সফলভাবে আপডেট হয়েছে!' : 'ম্যাচ সফলভাবে যোগ হয়েছে!',
            'success'
        );
        
        // Log activity
        logActivity(activityType, activityMessage);
        
        // Close form
        closeMatchForm();
        
        // Reload matches
        loadMatches();
        
    }).catch((error) => {
        alert('ত্রুটি: ' + error.message);
        console.error('Save match error:', error);
    });
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function loadMatches() {
    database.ref('matches').orderByChild('createdAt').on('value', (snapshot) => {
        const tableBody = document.getElementById('matches-table-body');
        tableBody.innerHTML = '';
        
        matchesData = [];
        
        snapshot.forEach((child) => {
            const match = child.val();
            const matchId = child.key;
            matchesData.push({ id: matchId, ...match });
            
            const row = document.createElement('tr');
            
            // Format created date
            const createdDate = match.createdAt ? 
                new Date(match.createdAt).toLocaleDateString('bn-BD') : 
                '-';
            
            row.innerHTML = `
                <td>
                    <div class="match-cell">
                        <img src="${match.thumbnail || 'https://via.placeholder.com/80x45'}" 
                             alt="${match.title}" 
                             class="match-thumb-small"
                             onerror="this.src='https://via.placeholder.com/80x45'">
                        <div class="match-info-small">
                            <h5>${match.title}</h5>
                            <span>${createdDate}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="category-badge ${match.category}">
                        ${getCategoryDisplayName(match.category)}
                    </span>
                </td>
                <td>
                    <i class="fas fa-eye"></i> ${match.watching || 0}
                </td>
                <td>
                    <span class="status-badge ${match.status}">
                        ${getStatusDisplayName(match.status)}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-edit" onclick="editMatch('${matchId}')">
                            <i class="fas fa-edit"></i> এডিট
                        </button>
                        <button class="btn-delete" onclick="deleteMatch('${matchId}', '${match.title}')">
                            <i class="fas fa-trash"></i> ডিলিট
                        </button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    });
}

function getCategoryDisplayName(category) {
    const categories = {
        'football': 'ফুটবল',
        'cricket': 'ক্রিকেট',
        'basketball': 'বাস্কেটবল',
        'tennis': 'টেনিস',
        'other': 'অন্যান্য'
    };
    return categories[category] || category;
}

function getStatusDisplayName(status) {
    const statuses = {
        'active': 'সক্রিয়',
        'inactive': 'নিষ্ক্রিয়',
        'upcoming': 'আসন্ন'
    };
    return statuses[status] || status;
}

function editMatch(matchId) {
    editMatchId = matchId;
    
    database.ref(`matches/${matchId}`).once('value').then((snapshot) => {
        const match = snapshot.val();
        
        if (match) {
            document.getElementById('match-form-card').style.display = 'block';
            document.getElementById('form-title').textContent = 'ম্যাচ এডিট করুন';
            document.getElementById('match-save-btn').innerHTML = '<i class="fas fa-save"></i> আপডেট করুন';
            
            // Fill form with match data
            document.getElementById('match-title').value = match.title || '';
            document.getElementById('match-thumbnail').value = match.thumbnail || '';
            document.getElementById('match-video').value = match.videoUrl || '';
            document.getElementById('match-category').value = match.category || 'football';
            document.getElementById('match-status').value = match.status || 'active';
            document.getElementById('match-premium').checked = match.premiumOnly || false;
            
            // Scroll to form
            document.getElementById('match-form-card').scrollIntoView({ behavior: 'smooth' });
        }
    }).catch((error) => {
        alert('ত্রুটি: ' + error.message);
        console.error('Edit match error:', error);
    });
}

function deleteMatch(matchId, matchTitle) {
    if (confirm(`আপনি কি "${matchTitle}" ম্যাচটি ডিলিট করতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।`)) {
        database.ref(`matches/${matchId}`).remove()
            .then(() => {
                showNotification('ম্যাচ সফলভাবে ডিলিট হয়েছে!', 'success');
                logActivity('match_delete', `ম্যাচ ডিলিট করেছেন: ${matchTitle}`);
            })
            .catch((error) => {
                alert('ত্রুটি: ' + error.message);
                console.error('Delete match error:', error);
            });
    }
}

function searchMatches() {
    const searchTerm = document.getElementById('match-search').value.toLowerCase();
    const rows = document.querySelectorAll('#matches-table-body tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// User Management
function loadUsers() {
    database.ref('users').on('value', (snapshot) => {
        const tableBody = document.getElementById('users-table-body');
        tableBody.innerHTML = '';
        
        usersData = [];
        
        snapshot.forEach((child) => {
            const user = child.val();
            const userId = child.key;
            usersData.push({ id: userId, ...user });
        });
        
        // Sort by XP (descending)
        usersData.sort((a, b) => (b.xp || 0) - (a.xp || 0));
        
        // Calculate pagination
        const startIndex = (currentPageNumber - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageUsers = usersData.slice(startIndex, endIndex);
        
        // Update pagination info
        const totalPages = Math.ceil(usersData.length / itemsPerPage);
        document.getElementById('page-info').textContent = 
            `পৃষ্ঠা ${currentPageNumber} / ${totalPages} • মোট ${usersData.length} ব্যবহারকারী`;
        
        // Render users for current page
        pageUsers.forEach((user) => {
            const row = document.createElement('tr');
            
            // Format join date
            const joinDate = user.createdAt ? 
                new Date(user.createdAt).toLocaleDateString('bn-BD') : 
                '-';
            
            row.innerHTML = `
                <td>
                    <div class="user-cell">
                        <div class="user-avatar-small">
                            <img src="${user.profilePic || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'}" 
                                 alt="${user.name}"
                                 onerror="this.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'">
                        </div>
                        <div class="user-info-small">
                            <h5>${user.name || 'নতুন ব্যবহারকারী'}</h5>
                            <span>যোগদান: ${joinDate}</span>
                        </div>
                    </div>
                </td>
                <td>${user.email || '-'}</td>
                <td>${user.phone || '-'}</td>
                <td>
                    <strong>${formatNumber(user.xp || 0)}</strong> XP
                </td>
                <td>
                    ${user.premium ? '<span class="premium-badge">PREMIUM</span>' : 'ফ্রি'}
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-view" onclick="viewUserDetails('${user.id}')">
                            <i class="fas fa-eye"></i> দেখুন
                        </button>
                        <button class="btn-edit" onclick="editUser('${user.id}')">
                            <i class="fas fa-edit"></i> এডিট
                        </button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    });
}

function searchUsers() {
    const searchTerm = document.getElementById('user-search').value.toLowerCase();
    currentPageNumber = 1; // Reset to first page when searching
    filterUsers();
}

function filterUsers() {
    const filterType = document.getElementById('user-filter').value;
    const searchTerm = document.getElementById('user-search').value.toLowerCase();
    
    let filteredUsers = usersData;
    
    // Apply type filter
    if (filterType === 'premium') {
        filteredUsers = filteredUsers.filter(user => user.premium);
    } else if (filterType === 'free') {
        filteredUsers = filteredUsers.filter(user => !user.premium);
    } else if (filterType === 'active') {
        // Filter users active in last 5 minutes
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        filteredUsers = filteredUsers.filter(user => 
            user.lastSeen && user.lastSeen > fiveMinutesAgo
        );
    }
    
    // Apply search filter
    if (searchTerm) {
        filteredUsers = filteredUsers.filter(user => 
            (user.name && user.name.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm)) ||
            (user.phone && user.phone.includes(searchTerm))
        );
    }
    
    // Update table with filtered users
    updateUsersTable(filteredUsers);
}

function updateUsersTable(filteredUsers) {
    const tableBody = document.getElementById('users-table-body');
    tableBody.innerHTML = '';
    
    // Calculate pagination
    const startIndex = (currentPageNumber - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageUsers = filteredUsers.slice(startIndex, endIndex);
    
    // Update pagination info
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    document.getElementById('page-info').textContent = 
        `পৃষ্ঠা ${currentPageNumber} / ${totalPages} • মোট ${filteredUsers.length} ব্যবহারকারী`;
    
    // Render users for current page
    pageUsers.forEach((user) => {
        const row = document.createElement('tr');
        
        // Format join date
        const joinDate = user.createdAt ? 
            new Date(user.createdAt).toLocaleDateString('bn-BD') : 
            '-';
        
        row.innerHTML = `
            <td>
                <div class="user-cell">
                    <div class="user-avatar-small">
                        <img src="${user.profilePic || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'}" 
                             alt="${user.name}"
                             onerror="this.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'">
                    </div>
                    <div class="user-info-small">
                        <h5>${user.name || 'নতুন ব্যবহারকারী'}</h5>
                        <span>যোগদান: ${joinDate}</span>
                    </div>
                </div>
            </td>
            <td>${user.email || '-'}</td>
            <td>${user.phone || '-'}</td>
            <td>
                <strong>${formatNumber(user.xp || 0)}</strong> XP
            </td>
            <td>
                ${user.premium ? '<span class="premium-badge">PREMIUM</span>' : 'ফ্রি'}
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-view" onclick="viewUserDetails('${user.id}')">
                        <i class="fas fa-eye"></i> দেখুন
                    </button>
                    <button class="btn-edit" onclick="editUser('${user.id}')">
                        <i class="fas fa-edit"></i> এডিট
                    </button>
                </div>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

function prevPage() {
    if (currentPageNumber > 1) {
        currentPageNumber--;
        filterUsers();
    }
}

function nextPage() {
    const totalPages = Math.ceil(usersData.length / itemsPerPage);
    if (currentPageNumber < totalPages) {
        currentPageNumber++;
        filterUsers();
    }
}

function viewUserDetails(userId) {
    editUserId = userId;
    
    database.ref(`users/${userId}`).once('value').then((snapshot) => {
        const user = snapshot.val();
        
        if (user) {
            // Format dates
            const joinDate = user.createdAt ? 
                new Date(user.createdAt).toLocaleString('bn-BD') : '-';
            
            const lastSeen = user.lastSeen ? 
                new Date(user.lastSeen).toLocaleString('bn-BD') : '-';
            
            const premiumSince = user.premiumSince ? 
                new Date(user.premiumSince).toLocaleString('bn-BD') : '-';
            
            // Build modal content
            const modalContent = `
                <div class="user-detail-grid">
                    <div class="detail-item">
                        <label>ইমেইল</label>
                        <p>${user.email || '-'}</p>
                    </div>
                    <div class="detail-item">
                        <label>ফোন নম্বর</label>
                        <p>${user.phone || '-'}</p>
                    </div>
                    <div class="detail-item">
                        <label>টেলিগ্রাম ID</label>
                        <p>${user.telegramId || '-'}</p>
                    </div>
                    <div class="detail-item">
                        <label>XP পয়েন্ট</label>
                        <p>${formatNumber(user.xp || 0)}</p>
                    </div>
                    <div class="detail-item">
                        <label>যোগদান তারিখ</label>
                        <p>${joinDate}</p>
                    </div>
                    <div class="detail-item">
                        <label>সর্বশেষ দেখা</label>
                        <p>${lastSeen}</p>
                    </div>
                    <div class="detail-item">
                        <label>স্ট্যাটাস</label>
                        <p>
                            ${user.premium ? 
                                '<span class="premium-badge">প্রিমিয়াম</span>' : 
                                '<span style="color: var(--text-secondary)">ফ্রি</span>'}
                        </p>
                    </div>
                    <div class="detail-item">
                        <label>প্রিমিয়াম সদস্য</label>
                        <p>${premiumSince}</p>
                    </div>
                </div>
                
                <div class="xp-control">
                    <h4>XP ম্যানেজমেন্ট</h4>
                    <div class="xp-input-group">
                        <input type="number" id="xp-amount" placeholder="XP পরিমাণ" min="0">
                    </div>
                    <div class="xp-btn-group">
                        <button class="btn-xp-add" onclick="addUserXP('${userId}')">
                            XP যোগ করুন
                        </button>
                        <button class="btn-xp-remove" onclick="removeUserXP('${userId}')">
                            XP কম করুন
                        </button>
                    </div>
                </div>
                
                <div class="xp-btn-group">
                    <button class="btn-premium-toggle" onclick="toggleUserPremium('${userId}', ${user.premium || false})">
                        ${user.premium ? 'প্রিমিয়াম অপসারণ' : 'প্রিমিয়াম করুন'}
                    </button>
                    <button class="btn-user-delete" onclick="deleteUser('${userId}', '${user.name || userId}')">
                        <i class="fas fa-trash"></i> ডিলিট
                    </button>
                </div>
            `;
            
            document.getElementById('modal-user-name').textContent = 
                user.name || 'ব্যবহারকারী বিবরণ';
            document.getElementById('user-modal-content').innerHTML = modalContent;
            
            // Show modal
            document.getElementById('user-modal').style.display = 'flex';
        }
    }).catch((error) => {
        alert('ত্রুটি: ' + error.message);
        console.error('View user error:', error);
    });
}

function editUser(userId) {
    // This function can be expanded to show an edit form
    viewUserDetails(userId);
}

function addUserXP(userId) {
    const amount = parseInt(document.getElementById('xp-amount').value);
    
    if (isNaN(amount) || amount <= 0) {
        alert('সঠিক XP পরিমাণ দিন');
        return;
    }
    
    database.ref(`users/${userId}/xp`).transaction((currentXP) => {
        return (currentXP || 0) + amount;
    }).then(() => {
        showNotification(`${amount} XP যোগ করা হয়েছে!`, 'success');
        logActivity('xp_add', `ব্যবহারকারীকে ${amount} XP যোগ করেছেন: ${userId}`);
    }).catch((error) => {
        alert('ত্রুটি: ' + error.message);
        console.error('Add XP error:', error);
    });
}

function removeUserXP(userId) {
    const amount = parseInt(document.getElementById('xp-amount').value);
    
    if (isNaN(amount) || amount <= 0) {
        alert('সঠিক XP পরিমাণ দিন');
        return;
    }
    
    database.ref(`users/${userId}/xp`).transaction((currentXP) => {
        const newXP = (currentXP || 0) - amount;
        return newXP >= 0 ? newXP : 0;
    }).then(() => {
        showNotification(`${amount} XP কম করা হয়েছে!`, 'success');
        logActivity('xp_remove', `ব্যবহারকারীর থেকে ${amount} XP কমানো হয়েছে: ${userId}`);
    }).catch((error) => {
        alert('ত্রুটি: ' + error.message);
        console.error('Remove XP error:', error);
    });
}

function toggleUserPremium(userId, isPremium) {
    const newStatus = !isPremium;
    const action = newStatus ? 'প্রিমিয়াম' : 'ফ্রি';
    
    if (confirm(`আপনি কি এই ব্যবহারকারীকে ${action} করতে চান?`)) {
        database.ref(`users/${userId}`).update({
            premium: newStatus,
            premiumSince: newStatus ? firebase.database.ServerValue.TIMESTAMP : null
        }).then(() => {
            showNotification(`প্রিমিয়াম স্ট্যাটাস ${action} করা হয়েছে!`, 'success');
            logActivity('user_edit', `ব্যবহারকারীর প্রিমিয়াম স্ট্যাটাস ${action} করেছেন: ${userId}`);
            closeModal('user-modal');
        }).catch((error) => {
            alert('ত্রুটি: ' + error.message);
            console.error('Toggle premium error:', error);
        });
    }
}

function deleteUser(userId, userName) {
    if (confirm(`আপনি কি "${userName}" ব্যবহারকারীকে ডিলিট করতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।`)) {
        database.ref(`users/${userId}`).remove()
            .then(() => {
                showNotification('ব্যবহারকারী সফলভাবে ডিলিট হয়েছে!', 'success');
                logActivity('user_delete', `ব্যবহারকারী ডিলিট করেছেন: ${userName}`);
                closeModal('user-modal');
            })
            .catch((error) => {
                alert('ত্রুটি: ' + error.message);
                console.error('Delete user error:', error);
            });
    }
}

// Settings Management
function loadSettings() {
    database.ref('settings').on('value', (snapshot) => {
        const settings = snapshot.val();
        
        if (settings) {
            document.getElementById('app-logo-url').value = settings.logoUrl || '';
            document.getElementById('site-title').value = settings.siteTitle || 'Toto Live Stream';
            document.getElementById('telegram-bot').value = settings.telegramBot || '';
            document.getElementById('premium-price').value = settings.premiumPrice || 500;
            document.getElementById('default-xp').value = settings.defaultXp || 1000;
            document.getElementById('welcome-message').value = settings.welcomeMessage || '';
        }
    });
}

function saveSettings() {
    const settings = {
        logoUrl: document.getElementById('app-logo-url').value.trim(),
        siteTitle: document.getElementById('site-title').value.trim(),
        telegramBot: document.getElementById('telegram-bot').value.trim(),
        premiumPrice: parseInt(document.getElementById('premium-price').value) || 500,
        defaultXp: parseInt(document.getElementById('default-xp').value) || 1000,
        welcomeMessage: document.getElementById('welcome-message').value.trim(),
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedBy: currentUser.email
    };

    database.ref('settings').set(settings)
        .then(() => {
            showNotification('সেটিংস সফলভাবে সংরক্ষণ হয়েছে!', 'success');
            logActivity('settings', 'সিস্টেম সেটিংস আপডেট করেছেন');
        })
        .catch((error) => {
            alert('ত্রুটি: ' + error.message);
            console.error('Save settings error:', error);
        });
}

function addNewAdmin() {
    const email = document.getElementById('new-admin-email').value.trim();
    
    if (!email || !email.includes('@')) {
        alert('সঠিক ইমেইল দিন');
        return;
    }
    
    // Note: In production, you would need to:
    // 1. Add user to Firebase Authentication
    // 2. Set custom claims (admin: true)
    // 3. Send invitation email
    
    alert('নতুন এডমিন যোগ করতে Firebase Authentication Console ব্যবহার করুন।\n\nযেভাবে করবেন:\n1. Firebase Console-এ যান\n2. Authentication > Users\n3. Add user\n4. Custom claims সেট করুন: {admin: true}\n\nইমেইল: ' + email);
    
    // Clear input
    document.getElementById('new-admin-email').value = '';
}

// Broadcast Management
function loadBroadcastHistory() {
    database.ref('broadcasts').orderByChild('timestamp').limitToLast(10).on('value', (snapshot) => {
        const historyElement = document.getElementById('broadcast-history');
        historyElement.innerHTML = '';
        
        const broadcasts = [];
        snapshot.forEach((child) => {
            broadcasts.unshift(child.val()); // Newest first
        });
        
        broadcasts.forEach((broadcast) => {
            const broadcastElement = document.createElement('div');
            broadcastElement.className = 'broadcast-item';
            
            const time = new Date(broadcast.timestamp).toLocaleString('bn-BD');
            const target = getTargetDisplayName(broadcast.target);
            
            broadcastElement.innerHTML = `
                <div class="broadcast-header">
                    <div class="broadcast-title">${broadcast.title || 'নোটিফিকেশন'}</div>
                    <div class="broadcast-target">${target}</div>
                </div>
                <div class="broadcast-message">
                    ${broadcast.message}
                </div>
                <div class="broadcast-footer">
                    <span>${time}</span>
                    <span>${broadcast.sentBy || 'সিস্টেম'}</span>
                </div>
            `;
            
            historyElement.appendChild(broadcastElement);
        });
    });
}

function getTargetDisplayName(target) {
    const targets = {
        'all': 'সকল',
        'premium': 'প্রিমিয়াম',
        'free': 'ফ্রি',
        'active': 'সক্রিয়'
    };
    return targets[target] || target;
}

function sendBroadcast() {
    const target = document.getElementById('broadcast-type').value;
    const title = document.getElementById('broadcast-title').value.trim();
    const message = document.getElementById('broadcast-message').value.trim();
    
    if (!title || !message) {
        alert('শিরোনাম এবং বার্তা লিখুন');
        return;
    }
    
    if (message.length > 500) {
        alert('বার্তা ৫০০ অক্ষরের কম হতে হবে');
        return;
    }
    
    const broadcastData = {
        title: title,
        message: message,
        target: target,
        sentBy: currentUser.email,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        status: 'sent'
    };
    
    database.ref('broadcasts').push(broadcastData)
        .then(() => {
            showNotification('ব্রডকাস্ট বার্তা সফলভাবে পাঠানো হয়েছে!', 'success');
            logActivity('broadcast', `ব্রডকাস্ট পাঠিয়েছেন: ${title}`);
            clearBroadcastForm();
        })
        .catch((error) => {
            alert('ত্রুটি: ' + error.message);
            console.error('Send broadcast error:', error);
        });
}

function clearBroadcastForm() {
    document.getElementById('broadcast-title').value = '';
    document.getElementById('broadcast-message').value = '';
    document.getElementById('char-count').textContent = '0';
}

// Logs Management
function loadLogs() {
    const logType = document.getElementById('log-type').value;
    const logPeriod = document.getElementById('log-period').value;
    
    database.ref('activities').orderByChild('timestamp').on('value', (snapshot) => {
        const tableBody = document.getElementById('logs-table-body');
        tableBody.innerHTML = '';
        
        const logs = [];
        snapshot.forEach((child) => {
            logs.unshift(child.val()); // Newest first
        });
        
        // Filter by type and period
        const filteredLogs = logs.filter(log => {
            // Type filter
            if (logType !== 'all' && log.type !== logType) {
                return false;
            }
            
            // Period filter
            const logTime = new Date(log.timestamp);
            const now = new Date();
            
            switch(logPeriod) {
                case 'today':
                    return logTime.toDateString() === now.toDateString();
                case 'week':
                    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                    return logTime >= weekAgo;
                case 'month':
                    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
                    return logTime >= monthAgo;
                default:
                    return true; // 'all'
            }
        });
        
        // Display logs
        filteredLogs.forEach((log, index) => {
            if (index >= 50) return; // Limit to 50 logs
            
            const row = document.createElement('tr');
            const time = new Date(log.timestamp).toLocaleString('bn-BD');
            
            row.innerHTML = `
                <td>${time}</td>
                <td>
                    <span class="log-type ${log.type}">
                        ${getLogTypeDisplayName(log.type)}
                    </span>
                </td>
                <td>${log.message}</td>
                <td>${log.ip || '-'}</td>
            `;
            
            tableBody.appendChild(row);
        });
    });
}

function getLogTypeDisplayName(type) {
    const types = {
        'login': 'লগইন',
        'logout': 'লগআউট',
        'match_add': 'ম্যাচ যোগ',
        'match_edit': 'ম্যাচ এডিট',
        'match_delete': 'ম্যাচ ডিলিট',
        'user_edit': 'ব্যবহারকারী এডিট',
        'user_delete': 'ব্যবহারকারী ডিলিট',
        'broadcast': 'ব্রডকাস্ট',
        'settings': 'সেটিংস',
        'xp_add': 'XP যোগ',
        'xp_remove': 'XP কমানো'
    };
    return types[type] || type;
}

function exportLogs() {
    // This is a basic implementation
    // In production, you might want to generate a CSV or PDF
    
    alert('লগস ডাউনলোড ফিচারটি শীঘ্রই আসছে!');
}

function clearOldLogs() {
    if (confirm('আপনি কি ৩০ দিনের পুরনো লগস পরিষ্কার করতে চান?')) {
        const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        
        database.ref('activities').once('value').then((snapshot) => {
            const updates = {};
            
            snapshot.forEach((child) => {
                const log = child.val();
                if (log.timestamp < monthAgo) {
                    updates[child.key] = null;
                }
            });
            
            if (Object.keys(updates).length > 0) {
                database.ref('activities').update(updates)
                    .then(() => {
                        showNotification('পুরনো লগস সফলভাবে পরিষ্কার হয়েছে!', 'success');
                        logActivity('settings', 'পুরনো লগস পরিষ্কার করেছেন');
                    })
                    .catch((error) => {
                        alert('ত্রুটি: ' + error.message);
                        console.error('Clear logs error:', error);
                    });
            } else {
                alert('পরিষ্কার করার মতো কোনো পুরনো লগ নেই।');
            }
        });
    }
}

// Notifications
function loadNotifications() {
    database.ref('notifications').orderByChild('timestamp').limitToLast(20).on('value', (snapshot) => {
        const notificationsBody = document.getElementById('notifications-body');
        notificationsBody.innerHTML = '';
        
        let unreadCount = 0;
        const notifications = [];
        
        snapshot.forEach((child) => {
            const notification = child.val();
            notification.id = child.key;
            notifications.unshift(notification); // Newest first
            
            if (!notification.read) {
                unreadCount++;
            }
        });
        
        // Update notification count
        document.getElementById('notification-count').textContent = unreadCount;
        
        // Display notifications
        notifications.forEach((notification) => {
            const notificationElement = document.createElement('div');
            notificationElement.className = `notification-item ${notification.read ? '' : 'unread'}`;
            
            const time = new Date(notification.timestamp).toLocaleString('bn-BD', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            notificationElement.innerHTML = `
                <div class="notification-title">
                    <span>${notification.title || 'নোটিফিকেশন'}</span>
                    <span class="notification-time">${time}</span>
                </div>
                <div class="notification-message">
                    ${notification.message}
                </div>
            `;
            
            notificationElement.onclick = () => markNotificationAsRead(notification.id);
            notificationsBody.appendChild(notificationElement);
        });
    });
}

function markNotificationAsRead(notificationId) {
    database.ref(`notifications/${notificationId}/read`).set(true);
}

function toggleNotifications() {
    const panel = document.getElementById('notifications-panel');
    panel.classList.toggle('active');
}

// Modal Functions
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Utility Functions
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString('bn-BD');
}

function showNotification(message, type = 'info') {
    // You can implement a toast notification here
    // For now, using alert
    alert(message);
}

function logActivity(type, message, ip = '') {
    const activityData = {
        type: type,
        message: message,
        admin: currentUser.email,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        ip: ip || getClientIP()
    };
    
    database.ref('activities').push(activityData);
}

function getClientIP() {
    // This is a simplified version
    // In production, you would get this from the server
    return '192.168.1.1'; // Placeholder
}

// Initialize character counter for broadcast message
document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('broadcast-message');
    const charCount = document.getElementById('char-count');
    
    if (messageInput && charCount) {
        messageInput.addEventListener('input', function() {
            charCount.textContent = this.value.length;
        });
    }
    
    // Set default date in dashboard
    if (document.getElementById('dashboard-date')) {
        const today = new Date();
        document.getElementById('dashboard-date').textContent = 
            today.toLocaleDateString('bn-BD', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
    }
});

// Make functions available globally
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;
window.toggleNotifications = toggleNotifications;
window.openAddMatchModal = openAddMatchModal;
window.closeMatchForm = closeMatchForm;
window.saveMatch = saveMatch;
window.editMatch = editMatch;
window.deleteMatch = deleteMatch;
window.searchMatches = searchMatches;
window.searchUsers = searchUsers;
window.filterUsers = filterUsers;
window.prevPage = prevPage;
window.nextPage = nextPage;
window.viewUserDetails = viewUserDetails;
window.editUser = editUser;
window.addUserXP = addUserXP;
window.removeUserXP = removeUserXP;
window.toggleUserPremium = toggleUserPremium;
window.deleteUser = deleteUser;
window.saveSettings = saveSettings;
window.addNewAdmin = addNewAdmin;
window.sendBroadcast = sendBroadcast;
window.clearBroadcastForm = clearBroadcastForm;
window.exportLogs = exportLogs;
window.clearOldLogs = clearOldLogs;
window.closeModal = closeModal;
window.loadRecentActivities = loadRecentActivities;
