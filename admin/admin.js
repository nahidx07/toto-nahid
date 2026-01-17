// Firebase ইনিশিয়ালাইজেশন
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();

// গ্লোবাল ভেরিয়েবল
let currentUser = null;
let editMatchId = null;
let usersData = [];

// লগইন ফাংশন
function adminLogin() {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorElement = document.getElementById('login-error');

    if (!email || !password) {
        errorElement.textContent = 'ইমেইল এবং পাসওয়ার্ড দিন';
        errorElement.style.display = 'block';
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // এডমিন চেক করুন
            return userCredential.user.getIdTokenResult();
        })
        .then((idTokenResult) => {
            if (idTokenResult.claims.admin !== true) {
                throw new Error('এডমিন এক্সেস নেই');
            }
            
            currentUser = auth.currentUser;
            document.getElementById('login-page').style.display = 'none';
            document.getElementById('admin-dashboard').style.display = 'flex';
            document.getElementById('admin-name').textContent = currentUser.email.split('@')[0];
            
            loadDashboardData();
            loadMatches();
            loadUsers();
            loadSettings();
            loadNotifications();
        })
        .catch((error) => {
            errorElement.textContent = error.message;
            errorElement.style.display = 'block';
            console.error('Login error:', error);
        });
}

// লগআউট ফাংশন
function adminLogout() {
    auth.signOut().then(() => {
        document.getElementById('admin-dashboard').style.display = 'none';
        document.getElementById('login-page').style.display = 'flex';
        document.getElementById('admin-email').value = '';
        document.getElementById('admin-password').value = '';
        document.getElementById('login-error').style.display = 'none';
    });
}

// ড্যাশবোর্ড ডেটা লোড
function loadDashboardData() {
    // মোট ব্যবহারকারী
    database.ref('users').on('value', (snapshot) => {
        const count = snapshot.numChildren();
        document.getElementById('total-users').textContent = count;
        document.getElementById('total-users-count').textContent = count;
        
        // সর্বোচ্চ XP
        let maxXP = 0;
        snapshot.forEach((child) => {
            const user = child.val();
            if (user.xp > maxXP) {
                maxXP = user.xp;
            }
        });
        document.getElementById('top-xp').textContent = maxXP.toLocaleString();
    });

    // সক্রিয় ম্যাচ ও দর্শক
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
        
        document.getElementById('active-matches').textContent = activeMatches;
        document.getElementById('total-watching').textContent = totalWatching;
    });

    // মোট চ্যাট
    database.ref('chats').on('value', (snapshot) => {
        const count = snapshot.numChildren();
        document.getElementById('total-chats').textContent = count;
    });

    // সাম্প্রতিক কার্যক্রম
    loadRecentActivities();
}

// সাম্প্রতিক কার্যক্রম লোড
function loadRecentActivities() {
    database.ref('activities').limitToLast(10).on('value', (snapshot) => {
        const activitiesList = document.getElementById('activities-list');
        activitiesList.innerHTML = '';
        
        snapshot.forEach((child) => {
            const activity = child.val();
            const time = new Date(activity.timestamp).toLocaleString('bn-BD');
            
            const activityItem = document.createElement('div');
            activityItem.className = 'activity-item';
            activityItem.innerHTML = `
                <div class="activity-icon">
                    <i class="fas fa-${getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-content">
                    <p>${activity.message}</p>
                    <small>${time}</small>
                </div>
            `;
            
            activitiesList.appendChild(activityItem);
        });
    });
}

function getActivityIcon(type) {
    const icons = {
        login: 'sign-in-alt',
        logout: 'sign-out-alt',
        match_add: 'plus-circle',
        match_edit: 'edit',
        match_delete: 'trash',
        user_add: 'user-plus',
        user_edit: 'user-edit',
        broadcast: 'bullhorn',
        settings: 'cog'
    };
    return icons[type] || 'circle';
}

// ট্যাব সুইচ ফাংশন
function switchTab(tabName) {
    // সব ট্যাব লুকাও
    document.querySelectorAll('.tab-pane').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // সব মেনু আইটেমের একটিভ ক্লাস রিমুভ করো
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // সিলেক্টেড ট্যাব দেখাও
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById('page-title').textContent = getPageTitle(tabName);
}

function getPageTitle(tabName) {
    const titles = {
        dashboard: 'ড্যাশবোর্ড',
        matches: 'লাইভ ম্যাচ',
        users: 'ব্যবহারকারী',
        settings: 'সেটিংস',
        broadcast: 'ব্রডকাস্ট'
    };
    return titles[tabName] || 'ড্যাশবোর্ড';
}

// সাইডবার টগল
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// ম্যাচ ম্যানেজমেন্ট ফাংশন
function openAddMatchModal() {
    editMatchId = null;
    document.getElementById('match-form').style.display = 'block';
    document.getElementById('form-title').textContent = 'নতুন ম্যাচ যোগ করুন';
    document.getElementById('match-submit-btn').textContent = 'সংরক্ষণ করুন';
    
    // ফর্ম রিসেট
    document.getElementById('match-title').value = '';
    document.getElementById('match-thumbnail').value = '';
    document.getElementById('match-video').value = '';
    document.getElementById('match-category').value = 'football';
}

function cancelMatchForm() {
    document.getElementById('match-form').style.display = 'none';
    editMatchId = null;
}

function saveMatch() {
    const title = document.getElementById('match-title').value;
    const thumbnail = document.getElementById('match-thumbnail').value;
    const video = document.getElementById('match-video').value;
    const category = document.getElementById('match-category').value;

    if (!title || !thumbnail || !video) {
        alert('সব ফিল্ড পূরণ করুন');
        return;
    }

    const matchData = {
        title: title,
        thumbnail: thumbnail,
        videoUrl: video,
        category: category,
        status: 'active',
        watching: 0,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdBy: currentUser.email
    };

    let promise;
    
    if (editMatchId) {
        promise = database.ref(`matches/${editMatchId}`).update(matchData);
    } else {
        promise = database.ref('matches').push(matchData);
    }

    promise.then(() => {
        alert(editMatchId ? 'ম্যাচ আপডেট করা হয়েছে!' : 'ম্যাচ যোগ করা হয়েছে!');
        
        // অ্যাক্টিভিটি লগ যোগ করুন
        const activityData = {
            type: editMatchId ? 'match_edit' : 'match_add',
            message: `${editMatchId ? 'আপডেট' : 'যোগ'} করা হয়েছে: ${title}`,
            admin: currentUser.email,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        database.ref('activities').push(activityData);
        
        cancelMatchForm();
    }).catch((error) => {
        alert('ত্রুটি: ' + error.message);
    });
}

function loadMatches() {
    database.ref('matches').orderByChild('createdAt').on('value', (snapshot) => {
        const matchesList = document.getElementById('matches-list');
        matchesList.innerHTML = '';
        
        snapshot.forEach((child) => {
            const match = child.val();
            const matchId = child.key;
            
            const matchItem = document.createElement('div');
            matchItem.className = 'match-item fade-in';
            matchItem.innerHTML = `
                <div class="match-info">
                    <div class="match-thumb" style="background-image: url('${match.thumbnail || 'https://via.placeholder.com/120x68'}')"></div>
                    <div class="match-details">
                        <h4>${match.title}</h4>
                        <p>${match.category} • 👁️ ${match.watching || 0} watching</p>
                        <small>${new Date(match.createdAt).toLocaleDateString('bn-BD')}</small>
                    </div>
                </div>
                <div class="match-actions">
                    <span class="status-badge ${match.status === 'active' ? 'status-active' : 'status-inactive'}">
                        ${match.status === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                    </span>
                    <button class="action-btn edit-btn" onclick="editMatch('${matchId}')">
                        <i class="fas fa-edit"></i> এডিট
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteMatch('${matchId}', '${match.title}')">
                        <i class="fas fa-trash"></i> ডিলিট
                    </button>
                </div>
            `;
            
            matchesList.appendChild(matchItem);
        });
    });
}

function editMatch(matchId) {
    database.ref(`matches/${matchId}`).once('value').then((snapshot) => {
        const match = snapshot.val();
        
        editMatchId = matchId;
        document.getElementById('match-form').style.display = 'block';
        document.getElementById('form-title').textContent = 'ম্যাচ এডিট করুন';
        document.getElementById('match-submit-btn').textContent = 'আপডেট করুন';
        
        document.getElementById('match-title').value = match.title;
        document.getElementById('match-thumbnail').value = match.thumbnail;
        document.getElementById('match-video').value = match.videoUrl;
        document.getElementById('match-category').value = match.category || 'football';
    });
}

function deleteMatch(matchId, matchTitle) {
    if (confirm(`আপনি কি "${matchTitle}" ম্যাচটি ডিলিট করতে চান?`)) {
        database.ref(`matches/${matchId}`).remove().then(() => {
            alert('ম্যাচ ডিলিট করা হয়েছে!');
            
            // অ্যাক্টিভিটি লগ যোগ করুন
            const activityData = {
                type: 'match_delete',
                message: `ডিলিট করা হয়েছে: ${matchTitle}`,
                admin: currentUser.email,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            database.ref('activities').push(activityData);
        }).catch((error) => {
            alert('ত্রুটি: ' + error.message);
        });
    }
}

// ইউজার ম্যানেজমেন্ট ফাংশন
function loadUsers() {
    database.ref('users').on('value', (snapshot) => {
        const usersTableBody = document.getElementById('users-table-body');
        usersTableBody.innerHTML = '';
        usersData = [];
        
        snapshot.forEach((child) => {
            const user = child.val();
            const userId = child.key;
            usersData.push({ id: userId, ...user });
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" 
                             style="width: 40px; height: 40px; border-radius: 50%;">
                        <div>
                            <strong>${user.name || 'নাম নেই'}</strong><br>
                            <small>${user.telegramId ? `TG: ${user.telegramId}` : ''}</small>
                        </div>
                    </div>
                </td>
                <td>${user.email || 'N/A'}</td>
                <td>${user.phone || 'N/A'}</td>
                <td><span style="color: #FF9800; font-weight: bold;">${user.xp || 0}</span></td>
                <td>
                    <span class="status-badge ${user.premium ? 'status-active' : 'status-inactive'}">
                        ${user.premium ? 'প্রিমিয়াম' : 'ফ্রি'}
                    </span>
                </td>
                <td>
                    <button class="action-btn edit-btn" onclick="viewUserDetails('${userId}')">
                        <i class="fas fa-eye"></i> দেখুন
                    </button>
                </td>
            `;
            
            usersTableBody.appendChild(row);
        });
    });
}

function searchUsers() {
    const searchTerm = document.getElementById('user-search').value.toLowerCase();
    const rows = document.getElementById('users-table-body').getElementsByTagName('tr');
    
    for (let row of rows) {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    }
}

function viewUserDetails(userId) {
    database.ref(`users/${userId}`).once('value').then((snapshot) => {
        const user = snapshot.val();
        
        const modalBody = document.getElementById('user-modal-body');
        modalBody.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="${user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" 
                     style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid var(--accent-red);">
                <h3 style="margin: 10px 0 5px;">${user.name || 'নাম নেই'}</h3>
                <p style="color: var(--text-secondary);">${user.email || 'ইমেইল নেই'}</p>
            </div>
            
            <div class="user-details-grid">
                <div class="detail-item">
                    <label>ফোন নম্বর:</label>
                    <span>${user.phone || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <label>টেলিগ্রাম ID:</label>
                    <span>${user.telegramId || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <label>XP পয়েন্ট:</label>
                    <span style="color: #FF9800; font-weight: bold;">${user.xp || 0}</span>
                </div>
                <div class="detail-item">
                    <label>স্ট্যাটাস:</label>
                    <span class="status-badge ${user.premium ? 'status-active' : 'status-inactive'}">
                        ${user.premium ? 'প্রিমিয়াম' : 'ফ্রি'}
                    </span>
                </div>
                <div class="detail-item">
                    <label>রেজিস্ট্রেশন:</label>
                    <span>${user.createdAt ? new Date(user.createdAt).toLocaleString('bn-BD') : 'N/A'}</span>
                </div>
            </div>
            
            <div style="margin-top: 30px;">
                <h4>XP ম্যানেজমেন্ট</h4>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <input type="number" id="xp-amount" placeholder="XP পরিমাণ" style="flex: 1;">
                    <button class="btn-secondary" onclick="addXP('${userId}')">যোগ করুন</button>
                    <button class="btn-secondary" onclick="removeXP('${userId}')">কম করুন</button>
                </div>
            </div>
            
            <div style="margin-top: 20px; display: flex; gap: 10px;">
                <button class="btn-primary" style="flex: 1;" onclick="togglePremium('${userId}', ${user.premium || false})">
                    ${user.premium ? 'প্রিমিয়াম অপসারণ' : 'প্রিমিয়াম করুন'}
                </button>
                <button class="btn-secondary" style="flex: 1;" onclick="deleteUser('${userId}', '${user.name}')">
                    <i class="fas fa-trash"></i> ডিলিট
                </button>
            </div>
        `;
        
        openModal('user-modal');
    });
}

function addXP(userId) {
    const amount = parseInt(document.getElementById('xp-amount').value);
    if (isNaN(amount) || amount <= 0) {
        alert('সঠিক XP পরিমাণ দিন');
        return;
    }
    
    database.ref(`users/${userId}/xp`).transaction((currentXP) => {
        return (currentXP || 0) + amount;
    }).then(() => {
        alert(`${amount} XP যোগ করা হয়েছে!`);
    });
}

function removeXP(userId) {
    const amount = parseInt(document.getElementById('xp-amount').value);
    if (isNaN(amount) || amount <= 0) {
        alert('সঠিক XP পরিমাণ দিন');
        return;
    }
    
    database.ref(`users/${userId}/xp`).transaction((currentXP) => {
        const newXP = (currentXP || 0) - amount;
        return newXP >= 0 ? newXP : 0;
    }).then(() => {
        alert(`${amount} XP কম করা হয়েছে!`);
    });
}

function togglePremium(userId, isPremium) {
    const newStatus = !isPremium;
    
    database.ref(`users/${userId}`).update({
        premium: newStatus,
        premiumSince: newStatus ? firebase.database.ServerValue.TIMESTAMP : null
    }).then(() => {
        alert(`প্রিমিয়াম স্ট্যাটাস ${newStatus ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে!`);
        closeModal();
    });
}

function deleteUser(userId, userName) {
    if (confirm(`আপনি কি "${userName}" ব্যবহারকারীকে ডিলিট করতে চান?`)) {
        database.ref(`users/${userId}`).remove().then(() => {
            alert('ব্যবহারকারী ডিলিট করা হয়েছে!');
            closeModal();
        });
    }
}

// সেটিংস ফাংশন
function loadSettings() {
    database.ref('settings').on('value', (snapshot) => {
        const settings = snapshot.val() || {};
        
        document.getElementById('app-logo-url').value = settings.logoUrl || '';
        document.getElementById('premium-price').value = settings.premiumPrice || 500;
        document.getElementById('default-xp').value = settings.defaultXp || 1000;
        document.getElementById('site-title').value = settings.siteTitle || 'Toto Live Stream';
        document.getElementById('telegram-bot').value = settings.telegramBot || '';
    });
}

function saveSettings() {
    const settings = {
        logoUrl: document.getElementById('app-logo-url').value,
        premiumPrice: parseInt(document.getElementById('premium-price').value) || 500,
        defaultXp: parseInt(document.getElementById('default-xp').value) || 1000,
        siteTitle: document.getElementById('site-title').value,
        telegramBot: document.getElementById('telegram-bot').value,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedBy: currentUser.email
    };

    database.ref('settings').set(settings).then(() => {
        alert('সেটিংস সংরক্ষণ করা হয়েছে!');
        
        // অ্যাক্টিভিটি লগ যোগ করুন
        const activityData = {
            type: 'settings',
            message: 'সেটিংস আপডেট করা হয়েছে',
            admin: currentUser.email,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        database.ref('activities').push(activityData);
    });
}

function addNewAdmin() {
    const email = document.getElementById('new-admin-email').value;
    
    if (!email || !email.includes('@')) {
        alert('সঠিক ইমেইল দিন');
        return;
    }
    
    // এই ফাংশনটি Firebase Authentication-এ কাস্টম ক্লেইমস সেট আপ করতে পারে
    alert('নতুন এডমিন যোগ করতে Firebase Authentication Console ব্যবহার করুন');
    document.getElementById('new-admin-email').value = '';
}

// ব্রডকাস্ট ফাংশন
function sendBroadcast() {
    const type = document.getElementById('broadcast-type').value;
    const message = document.getElementById('broadcast-message').value;
    
    if (!message.trim()) {
        alert('বার্তা লিখুন');
        return;
    }
    
    const broadcastData = {
        type: type,
        message: message,
        sentBy: currentUser.email,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        status: 'sent'
    };
    
    database.ref('broadcasts').push(broadcastData).then(() => {
        alert('বার্তা পাঠানো হয়েছে!');
        document.getElementById('broadcast-message').value = '';
        
        // নোটিফিকেশন লিস্ট আপডেট করুন
        loadNotifications();
        
        // অ্যাক্টিভিটি লগ যোগ করুন
        const activityData = {
            type: 'broadcast',
            message: `ব্রডকাস্ট পাঠানো হয়েছে: ${message.substring(0, 50)}...`,
            admin: currentUser.email,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        database.ref('activities').push(activityData);
    });
}

function loadNotifications() {
    database.ref('broadcasts').orderByChild('timestamp').limitToLast(5).on('value', (snapshot) => {
        const notificationList = document.getElementById('notification-list');
        notificationList.innerHTML = '';
        
        snapshot.forEach((child) => {
            const broadcast = child.val();
            const time = new Date(broadcast.timestamp).toLocaleString('bn-BD');
            
            const notificationItem = document.createElement('div');
            notificationItem.className = 'notification-item';
            notificationItem.innerHTML = `
                <p><strong>${broadcast.type === 'all' ? 'সকল' : broadcast.type === 'premium' ? 'প্রিমিয়াম' : 'ফ্রি'}:</strong> ${broadcast.message}</p>
                <small>${time} • ${broadcast.sentBy}</small>
            `;
            
            notificationList.appendChild(notificationItem);
        });
    });
}

// মডাল ফাংশন
function openModal(modalId) {
    document.getElementById('modal-overlay').style.display = 'block';
    document.getElementById(modalId).style.display = 'block';
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// অটো লগিন চেক
auth.onAuthStateChanged((user) => {
    if (user) {
        user.getIdTokenResult().then((idTokenResult) => {
            if (idTokenResult.claims.admin === true) {
                currentUser = user;
                document.getElementById('login-page').style.display = 'none';
                document.getElementById('admin-dashboard').style.display = 'flex';
                document.getElementById('admin-name').textContent = user.email.split('@')[0];
                
                loadDashboardData();
                loadMatches();
                loadUsers();
                loadSettings();
                loadNotifications();
                
                // অ্যাক্টিভিটি লগ যোগ করুন
                const activityData = {
                    type: 'login',
                    message: `${user.email} লগইন করেছেন`,
                    admin: user.email,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                };
                database.ref('activities').push(activityData);
            } else {
                adminLogout();
                alert('আপনার এডমিন অ্যাক্সেস নেই');
            }
        });
    }
});
