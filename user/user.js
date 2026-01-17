// Firebase ইনিশিয়ালাইজেশন
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// গ্লোবাল ভেরিয়েবল
let currentUser = null;
let currentMatchId = null;
let userId = null;
let chatRef = null;

// ইউজার ইনিশিয়ালাইজেশন
function initUser() {
    // টেলিগ্রাম থেকে ইউজার ID নিন অথবা লোকাল স্টোরেজ থেকে
    userId = localStorage.getItem('telegram_user_id');
    
    if (!userId) {
        // র্যান্ডম ইউজার ID তৈরি করুন (ডেমোর জন্য)
        userId = 'user_' + Date.now();
        localStorage.setItem('telegram_user_id', userId);
    }
    
    // ফায়ারবেসে ইউজার ডেটা আপডেট করুন
    updateUserData();
    
    // সেটিংস লোড করুন
    loadSettings();
    
    // ম্যাচ লোড করুন
    loadMatches();
    
    // লিডারবোর্ড লোড করুন
    loadLeaderboard();
    
    // ইউজার ডেটা লোড করুন
    loadUserData();
}

// ইউজার ডেটা আপডেট
function updateUserData() {
    const userRef = database.ref(`users/${userId}`);
    
    userRef.once('value').then((snapshot) => {
        if (!snapshot.exists()) {
            // নতুন ইউজার তৈরি করুন
            const userData = {
                name: 'নতুন ব্যবহারকারী',
                email: '',
                phone: '',
                telegramId: userId.replace('telegram_', ''),
                xp: 1000, // ডিফল্ট XP
                premium: false,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            };
            
            userRef.set(userData);
        } else {
            // লাস্ট সিন আপডেট করুন
            userRef.update({
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        }
    });
}

// সেটিংস লোড
function loadSettings() {
    database.ref('settings').on('value', (snapshot) => {
        const settings = snapshot.val();
        if (settings) {
            document.getElementById('app-logo').src = settings.logoUrl || '';
            document.getElementById('site-title').textContent = settings.siteTitle || 'Toto Live';
            document.getElementById('premium-price').textContent = `৳ ${settings.premiumPrice || 500}`;
        }
    });
}

// ম্যাচ লোড
function loadMatches() {
    database.ref('matches').orderByChild('createdAt').on('value', (snapshot) => {
        const matchesContainer = document.getElementById('matches-container');
        matchesContainer.innerHTML = '';
        
        let totalWatching = 0;
        
        snapshot.forEach((child) => {
            const match = child.val();
            const matchId = child.key;
            
            if (match.status === 'active') {
                totalWatching += match.watching || 0;
                
                const matchCard = document.createElement('div');
                matchCard.className = 'match-card';
                matchCard.innerHTML = `
                    <div class="match-thumbnail" onclick="openLiveMatch('${matchId}')">
                        <img src="${match.thumbnail || 'https://via.placeholder.com/400x180'}" 
                             alt="${match.title}" class="thumbnail-img">
                        <span class="live-badge">● LIVE</span>
                    </div>
                    <div class="match-info">
                        <h3 class="match-title">${match.title}</h3>
                        <div class="match-meta">
                            <span class="match-category">${getCategoryName(match.category)}</span>
                            <span class="match-viewers">
                                <i class="fas fa-eye"></i>
                                ${match.watching || 0} watching
                            </span>
                        </div>
                    </div>
                `;
                
                matchesContainer.appendChild(matchCard);
            }
        });
        
        // টোটাল ওয়াচিং আপডেট
        document.getElementById('total-watching-count').textContent = totalWatching;
        
        // টোটাল ইউজার আপডেট
        database.ref('users').once('value').then((userSnapshot) => {
            document.getElementById('total-users-count').textContent = userSnapshot.numChildren();
        });
    });
}

function getCategoryName(category) {
    const categories = {
        'football': 'ফুটবল',
        'cricket': 'ক্রিকেট',
        'other': 'অন্যান্য'
    };
    return categories[category] || category;
}

// ইউজার ডেটা লোড
function loadUserData() {
    database.ref(`users/${userId}`).on('value', (snapshot) => {
        const user = snapshot.val();
        if (user) {
            currentUser = user;
            
            // প্রোফাইল আপডেট
            document.getElementById('user-xp').textContent = user.xp?.toLocaleString() || '0';
            document.getElementById('user-name').textContent = user.name || 'নতুন ব্যবহারকারী';
            document.getElementById('user-email').textContent = user.email || '-';
            document.getElementById('user-phone').textContent = user.phone || '-';
            document.getElementById('user-telegram').textContent = user.telegramId || '-';
            
            if (user.profilePic) {
                document.getElementById('user-avatar').src = user.profilePic;
                document.getElementById('profile-avatar').src = user.profilePic;
            }
            
            if (user.createdAt) {
                const joinDate = new Date(user.createdAt).toLocaleDateString('bn-BD');
                document.getElementById('join-date').textContent = joinDate;
            }
            
            // XP প্রোগ্রেস আপডেট
            updateXPProgress(user.xp || 0);
            
            // প্রিমিয়াম স্ট্যাটাস
            const rankElement = document.getElementById('user-rank');
            if (user.premium) {
                rankElement.innerHTML = '<i class="fas fa-crown"></i> প্রিমিয়াম মেম্বার';
            } else {
                rankElement.innerHTML = '<i class="fas fa-user"></i> ফ্রি মেম্বার';
            }
        }
    });
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
    let progress = 0;
    let levelXP = xp;
    
    for (let i = levels.length - 1; i >= 0; i--) {
        if (xp >= levels[i].minXP) {
            currentLevel = levels[i].level;
            levelXP = xp - levels[i].minXP;
            const levelRange = levels[i].maxXP - levels[i].minXP;
            progress = (levelXP / levelRange) * 100;
            break;
        }
    }
    
    document.getElementById('current-level').textContent = `Level ${currentLevel}`;
    document.getElementById('current-xp').textContent = levelXP.toLocaleString();
    document.getElementById('next-level-xp').textContent = 
        (levels.find(l => l.level === currentLevel)?.maxXP - 
         levels.find(l => l.level === currentLevel)?.minXP).toLocaleString();
    
    document.getElementById('xp-progress-fill').style.width = `${Math.min(progress, 100)}%`;
}

// লাইভ ম্যাচ ওপেন
function openLiveMatch(matchId) {
    currentMatchId = matchId;
    
    database.ref(`matches/${matchId}`).once('value').then((snapshot) => {
        const match = snapshot.val();
        
        if (!match) {
            showNotification('ম্যাচটি পাওয়া যায়নি');
            return;
        }
        
        // প্রিমিয়াম চেক
        if (match.premiumOnly && !currentUser?.premium) {
            showPremiumModal();
            return;
        }
        
        // পেজ সুইচ
        showPage('live-page');
        
        // ম্যাচ ডেটা সেট করুন
        document.getElementById('live-match-title').textContent = match.title;
        
        // ভিডিও লোড করুন
        const videoContainer = document.getElementById('video-container');
        videoContainer.innerHTML = `
            <iframe 
                id="video-player"
                src="${match.videoUrl}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen>
            </iframe>
        `;
        
        // ওয়াচিং কাউন্টার ইনক্রিমেন্ট
        database.ref(`matches/${matchId}/watching`).transaction((current) => {
            return (current || 0) + 1;
        });
        
        // চ্যাট সিস্টেম ইনিশিয়ালাইজ
        initChatSystem(matchId);
        
        // রিয়েল-টাইম আপডেট
        database.ref(`matches/${matchId}/watching`).on('value', (snap) => {
            const watching = snap.val() || 0;
            document.getElementById('live-viewer-count').textContent = watching;
        });
    });
}

// চ্যাট সিস্টেম
function initChatSystem(matchId) {
    if (chatRef) {
        chatRef.off();
    }
    
    chatRef = database.ref(`chats/${matchId}`);
    
    // চ্যাট মেসেজ লোড
    chatRef.limitToLast(50).on('value', (snapshot) => {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';
        
        snapshot.forEach((child) => {
            const message = child.val();
            const messageTime = new Date(message.timestamp).toLocaleTimeString('bn-BD', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message';
            messageElement.innerHTML = `
                <div class="message-avatar">
                    <img src="${message.avatar || 'https://www.w3schools.com/howto/img_avatar.png'}" alt="Avatar">
                </div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-sender">${message.name}</span>
                        ${message.premium ? '<span class="premium-badge">PREMIUM</span>' : ''}
                        <span class="message-time">${messageTime}</span>
                    </div>
                    <div class="message-text">${message.text}</div>
                </div>
            `;
            
            chatMessages.appendChild(messageElement);
        });
        
        // স্ক্রল টু বটম
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
    
    // অনলাইন ইউজার কাউন্ট
    database.ref(`matches/${matchId}/onlineUsers`).set({
        [userId]: true
    });
    
    database.ref(`matches/${matchId}/onlineUsers`).on('value', (snap) => {
        const onlineCount = snap.numChildren();
        document.getElementById('chat-user-count').textContent = `${onlineCount} জন অনলাইন`;
    });
}

// চ্যাট মেসেজ পাঠান
function sendChatMessage() {
    const inputField = document.getElementById('chat-input-field');
    const message = inputField.value.trim();
    
    if (!message || !currentMatchId) return;
    
    const chatData = {
        userId: userId,
        name: currentUser?.name || 'অতিথি',
        avatar: currentUser?.profilePic || 'https://www.w3schools.com/howto/img_avatar.png',
        text: message,
        premium: currentUser?.premium || false,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    chatRef.push(chatData).then(() => {
        inputField.value = '';
        
        // XP যোগ করুন
        addXP(5);
    }).catch((error) => {
        console.error('চ্যাট পাঠাতে সমস্যা:', error);
    });
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

// XP যোগ করুন
function addXP(amount) {
    database.ref(`users/${userId}/xp`).transaction((currentXP) => {
        return (currentXP || 0) + amount;
    });
}

// লাইভ ভিউ বন্ধ করুন
function closeLive() {
    if (currentMatchId) {
        // ওয়াচিং কাউন্টার ডিক্রিমেন্ট
        database.ref(`matches/${currentMatchId}/watching`).transaction((current) => {
            return Math.max((current || 0) - 1, 0);
        });
        
        // অনলাইন ইউজার রিমুভ
        database.ref(`matches/${currentMatchId}/onlineUsers/${userId}`).remove();
        
        // চ্যাট রেফারেন্স ক্লিনআপ
        if (chatRef) {
            chatRef.off();
            chatRef = null;
        }
    }
    
    currentMatchId = null;
    showHome();
}

// লিডারবোর্ড লোড
function loadLeaderboard() {
    database.ref('users').orderByChild('xp').limitToLast(100).on('value', (snapshot) => {
        const leaderboardList = document.getElementById('leaderboard-list');
        leaderboardList.innerHTML = '';
        
        const users = [];
        snapshot.forEach((child) => {
            const user = child.val();
            user.id = child.key;
            users.push(user);
        });
        
        // XP অনুসারে সর্ট করুন (ডিসেন্ডিং)
        users.sort((a, b) => (b.xp || 0) - (a.xp || 0));
        
        // টপ ৩ আলাদাভাবে শো করুন
        const topThree = document.querySelector('.top-three');
        topThree.innerHTML = '';
        
        for (let i = 0; i < Math.min(3, users.length); i++) {
            const user = users[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
            
            const topItem = document.createElement('div');
            topItem.className = 'top-item';
            topItem.innerHTML = `
                <div class="rank-medal">${medal}</div>
                <img src="${user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" 
                     style="width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 10px;">
                <h4>${user.name || 'অজানা'}</h4>
                <p style="font-weight: bold;">${user.xp?.toLocaleString() || 0} XP</p>
            `;
            
            topThree.appendChild(topItem);
        }
        
        // বাকি ইউজারদের লিস্ট করুন
        for (let i = 3; i < Math.min(50, users.length); i++) {
            const user = users[i];
            
            const listItem = document.createElement('div');
            listItem.className = 'leaderboard-item';
            listItem.innerHTML = `
                <div class="item-rank">#${i + 1}</div>
                <div class="item-avatar">
                    <img src="${user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" alt="Avatar">
                </div>
                <div class="item-info">
                    <div class="item-name">${user.name || 'অজানা'}</div>
                    <div class="item-meta">
                        ${user.premium ? '<span class="premium-badge">PREMIUM</span>' : ''}
                    </div>
                </div>
                <div class="item-xp">${user.xp?.toLocaleString() || 0} XP</div>
            `;
            
            leaderboardList.appendChild(listItem);
        }
    });
}

function filterLeaderboard(timeFrame) {
    // টাইম ফ্রেম অনুসারে ফিল্টার করুন
    const buttons = document.querySelectorAll('.time-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // TODO: সময় অনুসারে ফিল্টারিং লজিক ইমপ্লিমেন্ট করুন
    loadLeaderboard();
}

// প্রোফাইল পিকচার আপলোড
function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // ফাইল ভ্যালিডেশন
    if (!file.type.startsWith('image/')) {
        showNotification('শুধুমাত্র ছবি ফাইল আপলোড করুন');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB
        showNotification('ছবির সাইজ 5MB এর কম হতে হবে');
        return;
    }
    
    // ফাইল রিডার
    const reader = new FileReader();
    reader.onload = function(e) {
        const imageData = e.target.result;
        
        // ফায়ারবেসে সেভ করুন
        database.ref(`users/${userId}`).update({
            profilePic: imageData
        }).then(() => {
            showNotification('প্রোফাইল ছবি আপডেট করা হয়েছে!');
            
            // XP যোগ করুন
            addXP(50);
        });
    };
    reader.readAsDataURL(file);
}

// প্রিমিয়াম আপগ্রেড
function upgradeToPremium() {
    showPremiumModal();
}

function showPremiumModal() {
    document.getElementById('premium-modal').style.display = 'flex';
}

function closePremiumModal() {
    document.getElementById('premium-modal').style.display = 'none';
}

function subscribePremium() {
    // পেমেন্ট প্রসেসিং
    const price = document.getElementById('premium-price').textContent;
    
    // টেলিগ্রাম পেমেন্ট API কল করুন
    if (window.Telegram && Telegram.WebApp) {
        Telegram.WebApp.sendData(JSON.stringify({
            action: 'premium_purchase',
            amount: price.replace('৳ ', ''),
            userId: userId
        }));
    } else {
        // ডেমো: সরাসরি আপডেট করুন
        database.ref(`users/${userId}`).update({
            premium: true,
            premiumSince: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            showNotification('প্রিমিয়াম সাবস্ক্রিপশন সফল!');
            closePremiumModal();
            addXP(1000); // বোনাস XP
        });
    }
}

// পেজ নেভিগেশন
function showHome() {
    showPage('home-page');
    updateNavButton('home');
}

function showProfile() {
    showPage('profile-page');
    updateNavButton('profile');
}

function showLeaderboard() {
    showPage('leaderboard-page');
    updateNavButton('leaderboard');
}

function showPage(pageId) {
    // সব পেজ লুকান
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // সিলেক্টেড পেজ শো করুন
    document.getElementById(pageId).classList.add('active');
    
    // টেলিগ্রাম ব্যাক বাটন আপডেট করুন
    if (window.Telegram && Telegram.WebApp) {
        if (pageId === 'home-page') {
            Telegram.WebApp.BackButton.hide();
        } else {
            Telegram.WebApp.BackButton.show();
        }
    }
}

function updateNavButton(activeButton) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const buttons = {
        'home': 0,
        'leaderboard': 1,
        'profile': 2
    };
    
    if (buttons[activeButton] !== undefined) {
        document.querySelectorAll('.nav-btn')[buttons[activeButton]].classList.add('active');
    }
}

// নোটিফিকেশন শো
function showNotification(message) {
    const notification = document.getElementById('notification');
    document.getElementById('notification-text').textContent = message;
    
    notification.style.display = 'flex';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// অ্যাপ ইনিশিয়ালাইজেশন
document.addEventListener('DOMContentLoaded', function() {
    initUser();
    
    // অটো লগ আউট প্রিভেনশন
    window.addEventListener('beforeunload', function() {
        if (currentMatchId) {
            closeLive();
        }
    });
});

// অনলাইন স্ট্যাটাস
window.addEventListener('online', () => {
    showNotification('ইন্টারনেট সংযোগ পুনরুদ্ধার হয়েছে');
});

window.addEventListener('offline', () => {
    showNotification('ইন্টারনেট সংযোগ বিচ্ছিন্ন হয়েছে');
});
