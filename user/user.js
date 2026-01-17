// Firebase Initialization
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// Global Variables
let currentUser = null;
let currentMatchId = null;
let userId = null;
let chatRef = null;

// Page Management
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(pageId).classList.add('active');
    
    // Update navigation buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Update active nav button
    const navButtons = {
        'home': 0,
        'live': 1,
        'leaderboard': 2,
        'profile': 3
    };
    
    if (navButtons[pageId] !== undefined) {
        document.querySelectorAll('.nav-btn')[navButtons[pageId]].classList.add('active');
    }
    
    // Load data for the page
    switch(pageId) {
        case 'home':
            loadMatches();
            break;
        case 'leaderboard':
            loadLeaderboard();
            break;
        case 'profile':
            loadUserProfile();
            break;
    }
}

// User Initialization
function initUser() {
    // Generate user ID or get from Telegram
    userId = generateUserId();
    
    // Initialize user in Firebase
    initializeUserInFirebase();
    
    // Load app settings
    loadSettings();
    
    // Load user data
    loadUserData();
    
    // Load matches
    loadMatches();
    
    // Setup real-time listeners
    setupRealtimeListeners();
}

function generateUserId() {
    // Check if user ID exists in localStorage
    let storedId = localStorage.getItem('toto_user_id');
    
    if (!storedId) {
        // Generate new user ID
        storedId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('toto_user_id', storedId);
    }
    
    return storedId;
}

function initializeUserInFirebase() {
    const userRef = database.ref('users/' + userId);
    
    userRef.once('value').then(snapshot => {
        if (!snapshot.exists()) {
            // Create new user
            const userData = {
                name: 'নতুন ব্যবহারকারী',
                email: '',
                phone: '',
                profilePic: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
                xp: 1000,
                premium: false,
                telegramId: '',
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                lastSeen: firebase.database.ServerValue.TIMESTAMP,
                totalWatched: 0,
                totalChats: 0
            };
            
            userRef.set(userData).then(() => {
                showNotification('স্বাগতম! নতুন অ্যাকাউন্ট তৈরি হয়েছে।');
            });
        } else {
            // Update last seen
            userRef.update({
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        }
    }).catch(error => {
        console.error('Error initializing user:', error);
    });
}

// Settings Management
function loadSettings() {
    database.ref('settings').on('value', snapshot => {
        const settings = snapshot.val();
        if (settings) {
            // Update logo
            const logoElement = document.getElementById('app-logo');
            if (settings.logoUrl && settings.logoUrl.trim() !== '') {
                logoElement.src = settings.logoUrl;
                logoElement.style.display = 'block';
            }
            
            // Update site title
            if (settings.siteTitle) {
                document.getElementById('site-title').textContent = settings.siteTitle;
            }
            
            // Update premium price
            if (settings.premiumPrice) {
                document.getElementById('premium-price').textContent = '৳ ' + settings.premiumPrice;
            }
        }
    });
}

// User Data Management
function loadUserData() {
    database.ref('users/' + userId).on('value', snapshot => {
        const user = snapshot.val();
        if (user) {
            currentUser = user;
            
            // Update header XP
            document.getElementById('user-xp').textContent = formatNumber(user.xp || 0);
            
            // Update profile page
            updateProfilePage(user);
            
            // Update XP progress
            updateXPProgress(user.xp || 0);
            
            // Update premium status
            updatePremiumStatus(user.premium || false);
        }
    });
}

function updateProfilePage(user) {
    document.getElementById('profile-name').textContent = user.name || 'নতুন ব্যবহারকারী';
    document.getElementById('user-id').textContent = userId.substring(0, 8) + '...';
    document.getElementById('profile-email').textContent = user.email || '-';
    document.getElementById('profile-phone').textContent = user.phone || '-';
    
    if (user.profilePic) {
        document.getElementById('profile-avatar').src = user.profilePic;
        document.getElementById('user-avatar').src = user.profilePic;
    }
    
    if (user.createdAt) {
        const date = new Date(user.createdAt);
        document.getElementById('join-date').textContent = 
            date.toLocaleDateString('bn-BD') + ' ' + 
            date.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
    }
}

function updateXPProgress(xp) {
    const levels = [
        { level: 1, minXP: 0, maxXP: 1000 },
        { level: 2, minXP: 1000, maxXP: 2500 },
        { level: 3, minXP: 2500, maxXP: 5000 },
        { level: 4, minXP: 5000, maxXP: 10000 },
        { level: 5, minXP: 10000, maxXP: 20000 }
    ];
    
    let currentLevel = 1;
    let currentLevelXP = xp;
    let nextLevelXP = 1000;
    let progress = 0;
    
    for (let i = levels.length - 1; i >= 0; i--) {
        if (xp >= levels[i].minXP) {
            currentLevel = levels[i].level;
            currentLevelXP = xp - levels[i].minXP;
            nextLevelXP = levels[i].maxXP - levels[i].minXP;
            progress = (currentLevelXP / nextLevelXP) * 100;
            break;
        }
    }
    
    // Update UI
    document.getElementById('xp-level').textContent = 'লেভেল ' + currentLevel;
    document.getElementById('current-xp').textContent = formatNumber(currentLevelXP);
    document.getElementById('next-level-xp').textContent = formatNumber(nextLevelXP);
    document.getElementById('xp-fill').style.width = Math.min(progress, 100) + '%';
}

function updatePremiumStatus(isPremium) {
    const badge = document.getElementById('premium-badge');
    if (isPremium) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Matches Management
function loadMatches() {
    database.ref('matches').orderByChild('createdAt').on('value', snapshot => {
        const container = document.getElementById('matches-container');
        container.innerHTML = '';
        
        let totalWatching = 0;
        let hasActiveMatches = false;
        
        snapshot.forEach(child => {
            const match = child.val();
            const matchId = child.key;
            
            if (match.status === 'active') {
                hasActiveMatches = true;
                totalWatching += match.watching || 0;
                
                const matchCard = createMatchCard(match, matchId);
                container.appendChild(matchCard);
            }
        });
        
        // Update stats
        document.getElementById('total-watching').textContent = formatNumber(totalWatching);
        
        // If no matches, show message
        if (!hasActiveMatches) {
            container.innerHTML = `
                <div class="no-matches">
                    <i class="fas fa-tv"></i>
                    <h3>কোনো লাইভ ম্যাচ নেই</h3>
                    <p>শীঘ্রই নতুন ম্যাচ আসছে!</p>
                </div>
            `;
        }
        
        // Update online users count
        updateOnlineUsersCount();
    });
}

function createMatchCard(match, matchId) {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.onclick = () => openLiveMatch(matchId, match);
    
    card.innerHTML = `
        <div class="match-thumbnail">
            <img src="${match.thumbnail || 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=800'}" 
                 alt="${match.title}" class="thumbnail-img">
            <span class="live-badge">● LIVE</span>
        </div>
        <div class="match-info">
            <h3 class="match-title">${match.title}</h3>
            <div class="match-meta">
                <span class="match-category">${getCategoryName(match.category)}</span>
                <span class="match-viewers">
                    <i class="fas fa-eye"></i>
                    ${match.watching || 0}
                </span>
            </div>
        </div>
    `;
    
    return card;
}

function getCategoryName(category) {
    const categories = {
        'football': 'ফুটবল',
        'cricket': 'ক্রিকেট',
        'basketball': 'বাস্কেটবল',
        'tennis': 'টেনিস',
        'other': 'অন্যান্য'
    };
    
    return categories[category] || category;
}

// Live Match Functions
function openLiveMatch(matchId, match) {
    // Check premium access
    if (match.premiumOnly && !(currentUser?.premium)) {
        showPremiumModal();
        return;
    }
    
    currentMatchId = matchId;
    
    // Switch to live page
    showPage('live');
    
    // Update live page title
    document.getElementById('live-title').textContent = match.title;
    
    // Load video
    loadVideo(match.videoUrl);
    
    // Initialize chat
    initChatSystem(matchId);
    
    // Update watching count
    updateWatchingCount(matchId, true);
    
    // Set up disconnect handler
    setupDisconnectHandler(matchId);
}

function loadVideo(videoUrl) {
    const container = document.getElementById('video-container');
    
    // Check if YouTube URL
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        const videoId = extractYouTubeId(videoUrl);
        container.innerHTML = `
            <iframe 
                src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowfullscreen>
            </iframe>
        `;
    } else {
        // For other video URLs
        container.innerHTML = `
            <video controls autoplay style="width:100%; height:100%;">
                <source src="${videoUrl}" type="video/mp4">
                আপনার ব্রাউজার ভিডিও সাপোর্ট করে না।
            </video>
        `;
    }
}

function extractYouTubeId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

function updateWatchingCount(matchId, increment) {
    const matchRef = database.ref('matches/' + matchId + '/watching');
    
    if (increment) {
        matchRef.transaction(current => {
            return (current || 0) + 1;
        });
        
        // Track user watching
        database.ref('users/' + userId + '/watching/' + matchId).set({
            startedAt: firebase.database.ServerValue.TIMESTAMP
        });
    } else {
        matchRef.transaction(current => {
            return Math.max((current || 0) - 1, 0);
        });
        
        // Remove user from watching list
        database.ref('users/' + userId + '/watching/' + matchId).remove();
    }
}

function setupDisconnectHandler(matchId) {
    // Update watching count on page close
    window.addEventListener('beforeunload', () => {
        if (currentMatchId === matchId) {
            updateWatchingCount(matchId, false);
        }
    });
}

// Chat System
function initChatSystem(matchId) {
    if (chatRef) {
        chatRef.off();
    }
    
    chatRef = database.ref('chats/' + matchId);
    
    // Load existing messages
    chatRef.limitToLast(50).on('value', snapshot => {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';
        
        snapshot.forEach(child => {
            const message = child.val();
            displayChatMessage(message);
        });
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
    
    // Update online count
    updateChatOnlineCount(matchId);
}

function displayChatMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    
    const time = new Date(message.timestamp).toLocaleTimeString('bn-BD', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageElement.innerHTML = `
        <div class="message-avatar">
            <img src="${message.avatar || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'}" alt="Avatar">
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-sender">${message.name}</span>
                ${message.premium ? '<span class="premium-badge-small">PREMIUM</span>' : ''}
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${message.text}</div>
        </div>
    `;
    
    chatMessages.appendChild(messageElement);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
    const inputField = document.getElementById('chat-input-field');
    const message = inputField.value.trim();
    
    if (!message || !currentMatchId) return;
    
    if (!currentUser) {
        showNotification('দুঃখিত, চ্যাট করতে লগইন করুন');
        return;
    }
    
    const chatData = {
        userId: userId,
        name: currentUser.name || 'অতিথি',
        avatar: currentUser.profilePic || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        text: message,
        premium: currentUser.premium || false,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    chatRef.push(chatData).then(() => {
        inputField.value = '';
        
        // Add XP for chatting
        addXP(5);
        
        // Update user chat count
        database.ref('users/' + userId + '/totalChats').transaction(current => {
            return (current || 0) + 1;
        });
    }).catch(error => {
        console.error('Error sending chat:', error);
        showNotification('চ্যাট পাঠাতে সমস্যা হয়েছে');
    });
}

function updateChatOnlineCount(matchId) {
    const onlineRef = database.ref('online/' + matchId + '/' + userId);
    
    // Set user as online
    onlineRef.set({
        userId: userId,
        name: currentUser?.name || 'অতিথি',
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Remove on disconnect
    onlineRef.onDisconnect().remove();
    
    // Listen for online users
    database.ref('online/' + matchId).on('value', snapshot => {
        const onlineCount = snapshot.numChildren();
        document.getElementById('chat-online').textContent = onlineCount + ' অনলাইন';
    });
}

// Leaderboard
function loadLeaderboard() {
    const timeRange = document.getElementById('time-range')?.value || 'all';
    
    database.ref('users').orderByChild('xp').limitToLast(100).once('value')
        .then(snapshot => {
            const users = [];
            
            snapshot.forEach(child => {
                const user = child.val();
                user.id = child.key;
                users.push(user);
            });
            
            // Sort by XP (descending)
            users.sort((a, b) => (b.xp || 0) - (a.xp || 0));
            
            // Display top 3
            displayTopThree(users.slice(0, 3));
            
            // Display rest of the leaderboard
            displayLeaderboardList(users.slice(3));
            
            // Find user's position
            updateUserPosition(users);
        });
}

function displayTopThree(topUsers) {
    const topThreeContainer = document.getElementById('top-three');
    topThreeContainer.innerHTML = '';
    
    const medals = ['🥇', '🥈', '🥉'];
    
    topUsers.forEach((user, index) => {
        const playerElement = document.createElement('div');
        playerElement.className = 'top-player';
        
        playerElement.innerHTML = `
            <div class="medal-icon">${medals[index]}</div>
            <img src="${user.profilePic || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'}" 
                 alt="${user.name}" class="player-avatar">
            <h4>${user.name || 'অজানা'}</h4>
            <p>${formatNumber(user.xp || 0)} XP</p>
        `;
        
        topThreeContainer.appendChild(playerElement);
    });
}

function displayLeaderboardList(users) {
    const listContainer = document.getElementById('leaderboard-list');
    listContainer.innerHTML = '';
    
    users.forEach((user, index) => {
        const rank = index + 4; // Start from 4th position
        
        const itemElement = document.createElement('div');
        itemElement.className = 'leaderboard-item';
        
        itemElement.innerHTML = `
            <div class="item-rank">#${rank}</div>
            <div class="item-avatar">
                <img src="${user.profilePic || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'}" alt="Avatar">
            </div>
            <div class="item-info">
                <div class="item-name">${user.name || 'অজানা'}</div>
                <div class="item-xp">${formatNumber(user.xp || 0)} XP</div>
            </div>
        `;
        
        listContainer.appendChild(itemElement);
    });
}

function updateUserPosition(users) {
    const userIndex = users.findIndex(user => user.id === userId);
    
    if (userIndex !== -1) {
        const position = userIndex + 1;
        const user = users[userIndex];
        
        document.getElementById('user-position').textContent = position;
        document.getElementById('rank-name').textContent = user.name || 'আপনি';
        document.getElementById('rank-xp').textContent = formatNumber(user.xp || 0);
        
        // Update rank in home stats
        document.getElementById('user-rank').textContent = '#' + position;
    }
}

// XP Management
function addXP(amount) {
    if (!userId || amount <= 0) return;
    
    database.ref('users/' + userId + '/xp').transaction(current => {
        return (current || 0) + amount;
    }).then(() => {
        // Show XP notification
        if (amount >= 10) {
            showNotification(`+${amount} XP অর্জন করেছেন!`);
        }
    });
}

// Premium Features
function showPremiumModal() {
    document.getElementById('premium-modal').style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function subscribePremium() {
    // In real app, integrate with payment gateway
    // For demo, just update user status
    
    database.ref('users/' + userId).update({
        premium: true,
        premiumSince: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        showNotification('প্রিমিয়াম সাবস্ক্রিপশন সফলভাবে সক্রিয় হয়েছে!');
        addXP(1000); // Bonus XP
        closeModal('premium-modal');
    }).catch(error => {
        showNotification('ত্রুটি: ' + error.message);
    });
}

// Utilities
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    const messageElement = document.getElementById('notification-msg');
    
    messageElement.textContent = message;
    notification.style.display = 'flex';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

function updateOnlineUsersCount() {
    database.ref('users').orderByChild('lastSeen').startAt(Date.now() - 300000) // Last 5 minutes
        .once('value')
        .then(snapshot => {
            const onlineCount = snapshot.numChildren();
            document.getElementById('online-users').textContent = onlineCount;
        });
}

function setupRealtimeListeners() {
    // Update online users every minute
    setInterval(updateOnlineUsersCount, 60000);
    
    // Listen for live viewers update
    database.ref('matches').on('value', snapshot => {
        let totalWatching = 0;
        
        snapshot.forEach(child => {
            const match = child.val();
            if (match.status === 'active') {
                totalWatching += match.watching || 0;
            }
        });
        
        document.getElementById('total-watching').textContent = formatNumber(totalWatching);
    });
}

function logout() {
    if (confirm('আপনি কি লগআউট করতে চান?')) {
        localStorage.removeItem('toto_user_id');
        location.reload();
    }
}

function loadUserProfile() {
    // This function is called when profile page is shown
    // Additional profile data loading can be done here
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initUser();
    
    // Set up chat input enter key
    const chatInput = document.getElementById('chat-input-field');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendChat();
            }
        });
    }
    
    // Auto-refresh matches every 30 seconds
    setInterval(loadMatches, 30000);
});

// Export functions to global scope
window.showPage = showPage;
window.sendChat = sendChat;
window.showPremiumModal = showPremiumModal;
window.closeModal = closeModal;
window.subscribePremium = subscribePremium;
window.logout = logout;
window.showLeaderboard = function() {
    showPage('leaderboard');
    loadLeaderboard();
};
