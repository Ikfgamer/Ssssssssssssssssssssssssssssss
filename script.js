// Register service worker for offline capabilities
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
        
        // Check for updates to the service worker
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('New service worker installing...');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New service worker installed, update available');
              // Optionally show a notification to the user about refresh
              if (typeof showNotification === 'function') {
                showNotification('New version available! Refresh to update.', 'info');
              }
            }
          });
        });
      })
      .catch(error => {
        console.error('ServiceWorker registration failed: ', error);
      });
      
    // Handle service worker updates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('Service worker controller changed');
    });
  });
  
  // Handle online/offline events more reliably
  window.addEventListener('online', () => {
    console.log('Browser went online');
    document.body.classList.remove('offline-mode');
    if (typeof showNotification === 'function') {
      showNotification('You are back online!', 'success');
    }
    // Try reconnecting to Firebase
    if (typeof resetConnectionState === 'function') {
      resetConnectionState();
    }
  });
  
  window.addEventListener('offline', () => {
    console.log('Browser went offline');
    document.body.classList.add('offline-mode');
    if (typeof showNotification === 'function') {
      showNotification('You are offline. Some features may be limited.', 'warning');
    }
  });
}

// Global function to show notifications
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  // Append to body
  document.body.appendChild(notification);
  
  // Remove after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Make showNotification globally available
window.showNotification = showNotification;

// Global error handlers with improved logging
window.addEventListener('error', function(event) {
  console.error('Global error caught:', event.message, event);
  // Save error information for potential debugging later
  if (localStorage) {
    try {
      const errors = JSON.parse(localStorage.getItem('errorLog') || '[]');
      errors.push({
        message: event.message,
        url: event.filename,
        line: event.lineno,
        col: event.colno,
        time: new Date().toISOString()
      });
      // Keep only the last 10 errors
      if (errors.length > 10) errors.shift();
      localStorage.setItem('errorLog', JSON.stringify(errors));
    } catch (e) {
      // Ignore storage errors
    }
  }
});

window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
  // Try to extract more meaningful error info
  const reason = event.reason;
  const message = reason.message || 'Unknown promise rejection';
  const code = reason.code || 'unknown';
  
  // Log and potentially show notification to user
  console.log(`Promise rejected: ${message} (Code: ${code})`);
  
  // Show notification only for critical errors
  if (reason.code === 'unavailable') {
    showConnectionIssueNotification();
  }
});

// Global reconnect function (will be called by UI elements)
window.reconnectToFirebase = function() {
  console.log("Manual reconnection initiated");
  return resetFirebaseConnection();
};

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAJkkt4S-XJClUFjTtAi7_ZI6juPl7RLZQ",
  authDomain: "apnaproject-4706e.firebaseapp.com",
  databaseURL: "https://apnaproject-4706e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "apnaproject-4706e",
  storageBucket: "apnaproject-4706e.firebasestorage.app",
  messagingSenderId: "155849360301",
  appId: "1:155849360301:web:cb151af6d585db800b1724",
  measurementId: "G-4C1XMLYX26"
};

// Connection monitoring configuration
const CONNECTION_CONFIG = {
  MAX_RETRIES: 10,
  INITIAL_RETRY_DELAY: 1000,
  MAX_RETRY_DELAY: 32000,
  CONNECTION_CHECK_INTERVAL: 30000
};

// Declare global variables
let auth, db, storage;
let connectionAttempts = 0;
let connectionStatus = true;
let connectionCheckInterval = null;
let lastConnectionAttempt = 0;

// Initialize Firebase with persistence
function initializeFirebase() {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  } else {
    firebase.app();
  }

  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();

  // Enable offline persistence
  db.enablePersistence({ synchronizeTabs: true })
    .then(() => {
      console.log("Offline persistence enabled");
      showNotification("Offline mode enabled", "info");
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn("Multiple tabs open, persistence only enabled in one tab.");
      } else if (err.code === 'unimplemented') {
        console.warn("Browser doesn't support persistence");
      }
    });

  // Set up connection monitoring
  const connectedRef = firebase.database().ref(".info/connected");
  connectedRef.on("value", (snap) => {
    const isConnected = snap.val() === true;
    handleConnectionChange(isConnected);
  });

  // Start connection monitoring interval
  startConnectionMonitoring();
}

// Handle connection state changes
function handleConnectionChange(isConnected) {
  connectionStatus = isConnected;
  
  if (isConnected) {
    console.log("Firebase connected");
    showNotification("Connected to server", "success");
    connectionAttempts = 0;
    hideReconnectPrompt();
  } else {
    console.log("Firebase disconnected");
    showReconnectPrompt();
  }

  // Update UI based on connection state
  document.body.classList.toggle('offline-mode', !isConnected);
}

// Start periodic connection monitoring
function startConnectionMonitoring() {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
  }

  connectionCheckInterval = setInterval(() => {
    if (!connectionStatus && navigator.onLine) {
      attemptReconnection();
    }
  }, CONNECTION_CONFIG.CONNECTION_CHECK_INTERVAL);
}

// Calculate retry delay with exponential backoff
function getRetryDelay() {
  const delay = Math.min(
    CONNECTION_CONFIG.INITIAL_RETRY_DELAY * Math.pow(2, connectionAttempts),
    CONNECTION_CONFIG.MAX_RETRY_DELAY
  );
  return delay;
}

// Attempt to reconnect to Firebase
function attemptReconnection() {
  if (connectionAttempts >= CONNECTION_CONFIG.MAX_RETRIES) {
    showNotification("Maximum reconnection attempts reached. Please refresh the page.", "error");
    return;
  }

  const now = Date.now();
  if (now - lastConnectionAttempt < getRetryDelay()) {
    return; // Prevent too frequent attempts
  }

  connectionAttempts++;
  lastConnectionAttempt = now;
  
  console.log(`Reconnection attempt ${connectionAttempts}/${CONNECTION_CONFIG.MAX_RETRIES}`);
  showNotification(`Attempting to reconnect... (${connectionAttempts}/${CONNECTION_CONFIG.MAX_RETRIES})`, "info");

  db.enableNetwork()
    .then(() => checkConnection())
    .then((isConnected) => {
      if (isConnected) {
        handleConnectionChange(true);
      } else {
        throw new Error("Connection check failed");
      }
    })
    .catch((error) => {
      console.error("Reconnection failed:", error);
      setTimeout(attemptReconnection, getRetryDelay());
    });
}

// Check connection status
function checkConnection() {
  return new Promise((resolve) => {
    if (!navigator.onLine) {
      resolve(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      resolve(false);
    }, 5000);

    db.collection('users').limit(1).get()
      .then(() => {
        clearTimeout(timeoutId);
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve(false);
      });
  });
}

// Initialize Firebase with improved error handling and connectivity
try {
  // Initialize Firebase globally so it's accessible everywhere
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  } else {
    firebase.app(); // If already initialized, use that one
  }
  
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();
  
  // Configure Firestore for better performance and offline capabilities
  db.settings({
    ignoreUndefinedProperties: true,
    merge: true
  });

  console.log("Enabling Firebase network...");
  
  // First enable network connection without trying persistence
  db.enableNetwork()
    .then(() => {
      console.log("Firebase network enabled successfully");
      connectionStatus = true;
      
      // Try to enable persistence only after network is confirmed
      try {
        // We'll use a simpler persistence configuration to avoid issues
        db.enablePersistence({
          synchronizeTabs: false // Disable multi-tab sync to avoid conflicts
        }).then(() => {
          console.log("Firestore persistence enabled successfully");
          showNotification("Offline mode enabled. You can use the app without internet!", "success");
        }).catch(err => {
          if (err.code === 'failed-precondition') {
            // Multiple tabs open, persistence can only be enabled in one tab
            console.warn("Persistence failed: Multiple tabs open");
            // Continue without persistence
          } else if (err.code === 'unimplemented') {
            // Browser doesn't support persistence
            console.warn("Persistence not supported by this browser");
          } else {
            console.error("Error enabling persistence:", err);
          }
          // We'll continue without persistence
        });
      } catch (persistenceError) {
        console.error("Error enabling offline persistence. Falling back to persistence disabled:", persistenceError);
      }
    })
    .catch(err => {
      console.error("Error enabling network:", err);
      connectionStatus = false;
      handleConnectionFailure();
    });
    
  // Set up better network state monitoring using Realtime Database
  try {
    const connectedRef = firebase.database().ref(".info/connected");
    connectedRef.on("value", (snap) => {
      if (snap.val() === true) {
        console.log("Firebase connected");
        connectionStatus = true;
        
        // Hide any offline notifications
        const networkStatus = document.querySelector('.network-status');
        if (networkStatus) {
          networkStatus.remove();
        }
        
        // Reset connection attempts on successful connection
        connectionAttempts = 0;
        
        // Show reconnected notification if we previously had issues
        if (document.querySelector('.reconnect-prompt')) {
          showNotification("Connection restored!", "success");
          document.querySelector('.reconnect-prompt').remove();
        }
      } else {
        console.log("Firebase disconnected");
        connectionStatus = false;
        
        // Only show the reconnect prompt if we're really offline
        if (!navigator.onLine) {
          showReconnectPrompt();
        }
      }
    });
  } catch (dbRefError) {
    console.error("Error setting up connection monitoring:", dbRefError);
    // Continue without connection monitoring
  }
  
  // Create function to verify connectivity with retry logic
  function verifyFirebaseConnectivity(retryCount = 0, maxRetries = 3) {
    console.log(`Verifying Firebase connectivity (attempt ${retryCount + 1}/${maxRetries + 1})...`);
    
    return new Promise((resolve, reject) => {
      // If we're offline according to browser, don't even try
      if (!navigator.onLine) {
        console.log("Browser reports device is offline, skipping connectivity check");
        connectionStatus = false;
        reject(new Error("Device offline"));
        return;
      }
      
      // Set a timeout for the operation
      const timeoutId = setTimeout(() => {
        reject(new Error("Connection verification timed out"));
      }, 10000); // Extended timeout
      
      // Try multiple CDNs for more reliable check
      Promise.any([
        fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-cache', method: 'HEAD' }),
        fetch('https://www.cloudflare.com/favicon.ico', { mode: 'no-cors', cache: 'no-cache', method: 'HEAD' }),
        fetch('https://cdn.jsdelivr.net/favicon.ico', { mode: 'no-cors', cache: 'no-cache', method: 'HEAD' })
      ])
      .then(() => {
        console.log("Internet connection verified");
        
        // Then try a lightweight Firestore operation
        return db.collection('users').limit(1).get();
      })
      .then(() => {
        clearTimeout(timeoutId);
        console.log("Firebase connection verified successfully");
        connectionStatus = true;
        connectionAttempts = 0;
        resolve(true);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        console.error("Connection verification failed:", error);
        
        if (retryCount < maxRetries) {
          // Exponential backoff for retries
          const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
          console.log(`Retrying in ${delay}ms...`);
          
          setTimeout(() => {
            verifyFirebaseConnectivity(retryCount + 1, maxRetries)
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          console.error("All connection attempts failed");
          reject(error);
        }
      });
    });
  }
  
  // Function to reset Firebase connection
  function resetFirebaseConnection() {
    console.log("Resetting Firebase connection...");
    
    // Show reconnecting message
    showNotification("Reconnecting to server...", "info");
    
    // First disable network
    return db.disableNetwork()
      .catch(err => {
        console.error("Error disabling network:", err);
        // Continue anyway
        return Promise.resolve();
      })
      .then(() => {
        // Small delay before re-enabling
        return new Promise(resolve => setTimeout(resolve, 2000));
      })
      .then(() => {
        // Then re-enable network
        return db.enableNetwork();
      })
      .then(() => {
        console.log("Network reset successful");
        return verifyFirebaseConnectivity();
      })
      .then(() => {
        showNotification("Connection successfully restored!", "success");
        connectionStatus = true;
        
        // Remove any reconnect prompts
        const reconnectPrompt = document.querySelector('.reconnect-prompt');
        if (reconnectPrompt) {
          reconnectPrompt.remove();
        }
        
        // Reload current user data if logged in
        if (auth.currentUser) {
          loadUserData(auth.currentUser);
        }
        
        return true;
      })
      .catch(err => {
        console.error("Connection reset failed:", err);
        showNotification("Could not restore connection. Please try again later.", "error");
        return false;
      });
  }
  
  // Ensure network is enabled with more reliable approach
  console.log("Enabling Firebase network...");
  db.enableNetwork()
    .then(() => {
      console.log("Firebase network enabled successfully");
      connectionStatus = true;
      
      // Verify connectivity with retry mechanism
      return verifyFirebaseConnectivity();
    })
    .then(() => {
      console.log("Firebase fully initialized and connected");
      
      // Setup connection state listener for better real-time monitoring
      try {
        firebase.firestore.onSnapshotsInSync(() => {
          connectionStatus = true;
          console.log("Firestore data in sync with server");
        });
      } catch (err) {
        console.log("onSnapshotsInSync not supported:", err);
      }
    })
    .catch(err => {
      console.error("Error establishing connection:", err);
      handleConnectionFailure();
      
      // Even though connection failed, we'll still proceed in offline mode
      console.log("Continuing in offline mode with cached data if available");
      
      // Show offline notification
      showConnectionIssueNotification();
    });
} catch (err) {
  console.error("Firebase initialization error:", err);
  if (typeof showNotification === 'function') {
    showNotification("Error connecting to database. Please refresh the page.", "error");
  }
}

// Function to handle connection failures
function handleConnectionFailure() {
  if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
    connectionAttempts++;
    console.log(`Connection attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}`);
    
    // Exponential backoff for retries
    const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 10000);
    
    setTimeout(() => {
      db.enableNetwork()
        .then(() => {
          console.log("Connection re-established");
          connectionStatus = true;
          connectionAttempts = 0;
          
          // Refresh data if user is logged in
          if (auth.currentUser) {
            loadUserData(auth.currentUser);
          }
        })
        .catch(err => {
          console.error("Retry failed:", err);
          handleConnectionFailure();
        });
    }, delay);
  } else {
    console.error("Maximum connection attempts reached");
    showNotification("Unable to connect to the server. You can continue using the app in offline mode.", "warning");
    
    // Show reconnect button
    showReconnectPrompt();
  }
}

// Helper function to show connection issue notification
function showConnectionIssueNotification() {
  showNotification("You're currently offline. Using cached data.", "warning");
  
  // Create an offline indicator if it doesn't exist
  if (!document.querySelector('.network-status')) {
    const offlineIndicator = document.createElement('div');
    offlineIndicator.className = 'network-status';
    offlineIndicator.innerHTML = `
      <div class="network-status-icon offline">
        <i class="fas fa-wifi-slash"></i>
      </div>
      <div class="network-status-text">Offline Mode</div>
      <button id="manual-reconnect" class="btn btn-sm btn-light ml-2">
        <i class="fas fa-sync-alt"></i> Reconnect
      </button>
    `;
    document.body.appendChild(offlineIndicator);
    
    // Add event listener to reconnect button
    document.getElementById('manual-reconnect').addEventListener('click', function() {
      this.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Reconnecting...';
      this.disabled = true;
      
      reconnectToFirebase().then(() => {
        // Reset button state
        this.innerHTML = '<i class="fas fa-sync-alt"></i> Reconnect';
        this.disabled = false;
      });
    });
  }
}

// Function to show reconnect prompt
function showReconnectPrompt() {
  // Only show if we don't already have one
  if (document.querySelector('.reconnect-prompt')) {
    return;
  }
  
  const reconnectPrompt = document.createElement('div');
  reconnectPrompt.className = 'reconnect-prompt';
  reconnectPrompt.innerHTML = `
    <div class="reconnect-content">
      <h3><i class="fas fa-wifi-slash"></i> Connection Issue</h3>
      <p>You're currently offline. Using cached data. Some features may be limited.</p>
      <div class="reconnect-actions">
        <button id="manual-reconnect-prompt" class="btn btn-primary">
          <i class="fas fa-sync-alt"></i> Reconnect
        </button>
        <button id="continue-offline" class="btn btn-secondary">
          Continue in Offline Mode
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(reconnectPrompt);
  
  // Add event listener to reconnect button
  document.getElementById('manual-reconnect-prompt').addEventListener('click', function() {
    this.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Reconnecting...';
    this.disabled = true;
    
    // Reset connection
    reconnectToFirebase();
  });
  
  // Add event listener to continue offline button
  document.getElementById('continue-offline').addEventListener('click', function() {
    // Hide the prompt
    reconnectPrompt.remove();
    
    // Show a persistent offline indicator instead
    showConnectionIssueNotification();
  });
}

// Define renderOfflineAdminPanel function to prevent errors
window.renderOfflineAdminPanel = function(user) {
  console.log("Rendering offline admin panel for user:", user?.email);
  
  const mainContent = document.getElementById('main-content');
  if (!mainContent) {
    console.error('Main content container not found for offline admin panel');
    return;
  }
  
  // Use default data for offline mode
  const offlineStats = {
    totalUsers: "—",
    activeTournaments: "—",
    pointsDistributed: "—",
    newUsers: "—",
    recentUsers: [],
    tournaments: []
  };
  
  // Create default user data for offline mode
  const userData = {
    displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Admin'),
    email: user.email || 'admin@tournamenthub.com',
    isAdmin: true,
    photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'Admin'}&background=random&color=fff`
  };
  
  // Create sample offline data for better UI experience
  const sampleUsers = [
    {
      displayName: "Sample User",
      email: "user@example.com",
      photoURL: "https://ui-avatars.com/api/?name=Sample+User&background=random&color=fff",
      joinDate: new Date(),
      points: 100,
      isVIP: false,
      uid: "sample1"
    },
    {
      displayName: userData.displayName,
      email: userData.email,
      photoURL: userData.photoURL,
      joinDate: new Date(),
      points: 1000,
      isVIP: true,
      isAdmin: true,
      uid: "admin1"
    }
  ];
  
  const sampleTournaments = [
    {
      name: "Weekend Warrior",
      startDate: new Date(Date.now() + 2*24*60*60*1000),
      entryFee: 50,
      prizePool: 1000,
      participants: 32,
      maxParticipants: 64,
      id: "sample-t1"
    },
    {
      name: "BGMI Champions",
      startDate: new Date(Date.now() + 5*24*60*60*1000),
      entryFee: 100,
      prizePool: 5000,
      participants: 45,
      maxParticipants: 100,
      id: "sample-t2"
    }
  ];
  
  mainContent.innerHTML = `
    <div class="admin-layout">
      <div class="admin-sidebar">
        <div class="admin-logo">
          <i class="fas fa-trophy"></i> Admin Panel
        </div>
        <div class="admin-user">
          <img src="${userData.photoURL}" alt="Admin Avatar">
          <div class="admin-user-info">
            <div class="admin-user-name">${userData.displayName}</div>
            <div class="admin-user-role">Administrator</div>
          </div>
        </div>
        <ul class="admin-nav">
          <li class="admin-nav-item">
            <a href="#" class="admin-nav-link active" data-admin-page="dashboard">
              <i class="fas fa-tachometer-alt"></i> Dashboard
            </a>
          </li>
          <li class="admin-nav-item">
            <a href="#" class="admin-nav-link" data-admin-page="users">
              <i class="fas fa-users"></i> User Management
            </a>
          </li>
          <li class="admin-nav-item">
            <a href="#" class="admin-nav-link" data-admin-page="tournaments">
              <i class="fas fa-trophy"></i> Tournament Management
            </a>
          </li>
          <li class="admin-nav-item">
            <a href="#" class="admin-nav-link" data-admin-page="rewards">
              <i class="fas fa-gift"></i> Rewards & Earnings
            </a>
          </li>
          <li class="admin-nav-item">
            <a href="#" class="admin-nav-link" data-admin-page="ads">
              <i class="fas fa-ad"></i> Ad Management
            </a>
          </li>
          <li class="admin-nav-item">
            <a href="#" class="admin-nav-link" data-admin-page="settings">
              <i class="fas fa-cog"></i> Settings
            </a>
          </li>
          <li class="admin-nav-item admin-nav-back">
            <a href="#" class="admin-nav-link" id="back-to-site">
              <i class="fas fa-arrow-left"></i> Back to Site
            </a>
          </li>
        </ul>
      </div>
      <div class="admin-content">
        <div id="admin-dashboard-page">
          <div class="admin-header">
            <h1 class="admin-title">Dashboard</h1>
            <div class="admin-actions">
              <button class="btn btn-primary" id="refresh-admin-data" disabled>
                <i class="fas fa-sync-alt"></i> Refresh Data
              </button>
            </div>
          </div>

          <div class="offline-notice">
            <div class="alert warning">
              <h3><i class="fas fa-wifi-slash"></i> Offline Mode</h3>
              <p>You are currently in offline mode. Limited functionality is available.</p>
              <p>Some features and data may not be accessible until you're back online.</p>
            </div>
          </div>

          <div class="stats-grid mb-4">
            <div class="stat-box">
              <i class="fas fa-users"></i>
              <div class="value">${offlineStats.totalUsers}</div>
              <div class="label">Total Users</div>
            </div>
            <div class="stat-box">
              <i class="fas fa-trophy"></i>
              <div class="value">${offlineStats.activeTournaments}</div>
              <div class="label">Active Tournaments</div>
            </div>
            <div class="stat-box">
              <i class="fas fa-coins"></i>
              <div class="value">${offlineStats.pointsDistributed}</div>
              <div class="label">Points Distributed</div>
            </div>
            <div class="stat-box">
              <i class="fas fa-user-plus"></i>
              <div class="value">${offlineStats.newUsers}</div>
              <div class="label">New Users (Today)</div>
            </div>
          </div>

          <div class="admin-quick-actions mb-4">
            <h2 class="mb-2">Quick Actions</h2>
            <div class="quick-actions-grid">
              <div class="quick-action-card" id="create-tournament">
                <i class="fas fa-trophy"></i>
                <span>Create Tournament</span>
              </div>
              <div class="quick-action-card" id="add-user">
                <i class="fas fa-user-plus"></i>
                <span>Add User</span>
              </div>
              <div class="quick-action-card" id="edit-rewards">
                <i class="fas fa-gift"></i>
                <span>Edit Rewards</span>
              </div>
              <div class="quick-action-card" id="site-settings">
                <i class="fas fa-cog"></i>
                <span>Site Settings</span>
              </div>
            </div>
          </div>

          <div class="admin-card">
            <div class="admin-card-header">
              <h2>Recent Users</h2>
              <button class="btn btn-sm btn-primary" id="view-all-users">View All</button>
            </div>
            <div class="admin-table-container">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Join Date</th>
                    <th>Points</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="recent-users-table">
                  ${sampleUsers.map(user => `
                    <tr>
                      <td>
                        <div class="user-cell">
                          <img src="${user.photoURL}" alt="User Avatar">
                          <div>
                            <div class="user-name">${user.displayName}</div>
                            <div class="user-email">${user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>${user.joinDate.toLocaleDateString()}</td>
                      <td>${user.points}</td>
                      <td><span class="status-badge ${user.isVIP ? 'vip' : 'standard'}">${user.isVIP ? 'VIP' : 'Standard'}</span></td>
                      <td>
                        <div class="table-actions">
                          <button class="btn btn-sm btn-primary edit-user" data-user-id="${user.uid}"><i class="fas fa-edit"></i></button>
                          <button class="btn btn-sm btn-danger toggle-ban" data-user-id="${user.uid}">
                            <i class="fas fa-user-slash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="admin-card">
            <div class="admin-card-header">
              <h2>Upcoming Tournaments</h2>
              <button class="btn btn-sm btn-primary" id="view-all-tournaments">View All</button>
            </div>
            <div class="admin-table-container">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Tournament</th>
                    <th>Start Date</th>
                    <th>Entry Fee</th>
                    <th>Prize Pool</th>
                    <th>Participants</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="tournaments-table">
                  ${sampleTournaments.map(tournament => `
                    <tr>
                      <td>${tournament.name}</td>
                      <td>${tournament.startDate.toLocaleDateString()}</td>
                      <td>${tournament.entryFee} points</td>
                      <td>${tournament.prizePool} points</td>
                      <td>${tournament.participants}/${tournament.maxParticipants}</td>
                      <td>
                        <div class="table-actions">
                          <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="${tournament.id}"><i class="fas fa-edit"></i></button>
                          <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="${tournament.id}"><i class="fas fa-trash"></i></button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Setup admin panel event listeners
  setupAdminPanelEvents();

  // Add event listener for "Back to Site" button
  document.getElementById('back-to-site').addEventListener('click', (e) => {
    e.preventDefault();
    renderMainContent('home');
  });

  // Add event listeners for quick actions
  document.getElementById('create-tournament').addEventListener('click', () => {
    showAdminPage('tournaments');
    showNotification("You're offline. Tournament creation will be available when you're back online.", "info");
  });

  document.getElementById('add-user').addEventListener('click', () => {
    showAdminPage('users');
    showNotification("You're offline. User creation will be available when you're back online.", "info");
  });

  document.getElementById('edit-rewards').addEventListener('click', () => {
    showAdminPage('rewards');
    showNotification("You're offline. Reward editing will be available when you're back online.", "info");
  });

  document.getElementById('site-settings').addEventListener('click', () => {
    showAdminPage('settings');
  });
  
  // Add event listener for View All buttons
  document.getElementById('view-all-users').addEventListener('click', () => {
    showAdminPage('users');
  });
  
  document.getElementById('view-all-tournaments').addEventListener('click', () => {
    showAdminPage('tournaments');
  });
  
  // Add event listeners for action buttons
  document.querySelectorAll('.edit-user, .toggle-ban, .edit-tournament, .delete-tournament').forEach(btn => {
    btn.addEventListener('click', () => {
      showNotification("You're offline. This action will be available when you're back online.", "info");
    });
  });
  
  // Check for online status change
  window.addEventListener('online', function() {
    showNotification("You're back online! Reloading admin panel...", "success");
    // Reload the admin panel to get fresh data
    setTimeout(() => {
      renderAdminPanel();
    }, 1000);
  });
}

// Connection failure handler
function handleConnectionFailure() {
  if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
    connectionAttempts++;
    console.log(`Connection attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}`);
    
    // Exponential backoff for retries
    const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 10000);
    
    setTimeout(() => {
      db.enableNetwork()
        .then(() => {
          console.log("Connection re-established");
          connectionStatus = true;
          connectionAttempts = 0;
          
          // Refresh data if user is logged in
          if (auth.currentUser) {
            loadUserData(auth.currentUser);
          }
        })
        .catch(err => {
          console.error("Retry failed:", err);
          handleConnectionFailure();
        });
    }, delay);
  } else {
    console.error("Maximum connection attempts reached");
    showNotification("Unable to connect to the server. Please check your internet connection and refresh the page.", "error");
  }
}

// Firebase Configuration and Initialization
document.addEventListener('DOMContentLoaded', function() {
  // Hide loading screen after everything is loaded
  const loadingScreen = document.getElementById('loading-screen');
  
  // Enhanced connection monitoring
  let networkStatusIndicator = null;
  let connectionCheckInterval = null;
  const CONNECTION_CHECK_INTERVAL = 30000; // Check every 30 seconds
  
  // Connection status indicator
  function showConnectionStatus(status, message) {
    // Remove any existing indicator
    if (networkStatusIndicator) {
      networkStatusIndicator.remove();
    }
    
    // Only show indicator if there's a connection issue
    if (status === 'error') {
      networkStatusIndicator = document.createElement('div');
      networkStatusIndicator.className = 'network-status';
      networkStatusIndicator.innerHTML = `
        <div class="network-status-icon ${status === 'success' ? 'online' : 'offline'}">
          <i class="fas ${status === 'success' ? 'fa-wifi' : 'fa-exclamation-triangle'}"></i>
        </div>
        <div class="network-status-text">${message}</div>
      `;
      document.body.appendChild(networkStatusIndicator);
      
      // Add refresh button
      const refreshButton = document.createElement('button');
      refreshButton.className = 'btn btn-sm btn-light ml-2';
      refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
      refreshButton.addEventListener('click', function() {
        location.reload();
      });
      networkStatusIndicator.appendChild(refreshButton);
      
      // Keep visible until resolved
    } else if (status === 'success' && message) {
      showNotification(message, 'success');
    }
  }
  
  // Function to check connection and data access
  function checkConnection() {
    if (!navigator.onLine) {
      showConnectionStatus('error', 'No internet connection. Please check your network.');
      return Promise.resolve(false);
    }
    
    return Promise.all([
      // Check general internet connectivity
      fetch('https://www.google.com/favicon.ico', { 
        mode: 'no-cors',
        cache: 'no-cache',
        method: 'HEAD'
      }),
      
      // Check Firebase connectivity
      db.enableNetwork().then(() => db.collection('users').limit(1).get())
    ])
    .then(() => {
      if (networkStatusIndicator) {
        networkStatusIndicator.remove();
        networkStatusIndicator = null;
        showNotification('Connection established successfully', 'success');
      }
      connectionStatus = true;
      return true;
    })
    .catch(err => {
      console.error("Connection check failed:", err);
      showConnectionStatus('error', 'Connection issues detected. Some features may be unavailable.');
      return false;
    });
  }
  
  // Function to reload the current page content
  function reloadCurrentPage() {
    // Get the current page from navbar
    const activeNavLink = document.querySelector('.nav-link.active');
    if (activeNavLink) {
      const page = activeNavLink.getAttribute('data-page');
      if (page) {
        renderMainContent(page);
      } else {
        renderMainContent('home');
      }
    } else {
      renderMainContent('home');
    }
  }
  
  // Add event listeners for online/offline events
  window.addEventListener('online', function() {
    console.log("Browser reports online status");
    checkConnection().then(isConnected => {
      if (isConnected) {
        showNotification('Connection restored!', 'success');
        if (auth.currentUser) {
          loadUserData(auth.currentUser);
          reloadCurrentPage();
        }
      }
    });
  });
  
  window.addEventListener('offline', function() {
    console.log("Browser reports offline status");
    showConnectionStatus('error', 'No internet connection. Please check your network.');
  });
  
  // Set up connection monitoring interval
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
  }
  
  // Less frequent checks to reduce unnecessary requests
  connectionCheckInterval = setInterval(() => {
    if (!connectionStatus) {
      checkConnection();
    }
  }, CONNECTION_CHECK_INTERVAL);
  
  // Initial connection check
  checkConnection();

  // Initialize the app UI
  initializeApp();

  // Try to create admin account
  createAdminAccount();

  // Authentication state observer
  auth.onAuthStateChanged(function(user) {
    if (user) {
      // User is signed in
      console.log("User is signed in:", user.displayName);
      loadUserData(user);
      renderMainContent('home');
    } else {
      // User is signed out
      console.log("User is signed out");
      renderAuthContent();
    }

    // Hide loading screen after auth state is determined
    loadingScreen.classList.add('hidden');
  });

  // Initialize the app UI
  function initializeApp() {
    const appContainer = document.getElementById('app');
    if (!appContainer) return; // Safety check

    // Create navigation bar
    const navbar = document.createElement('nav');
    navbar.className = 'navbar';
    navbar.innerHTML = `
      <div class="navbar-container">
        <a href="#" class="nav-logo">
          <i class="fas fa-trophy"></i> Tournament Hub
        </a>
        <ul class="nav-links">
          <li class="nav-item"><a href="#" class="nav-link" data-page="home">Home</a></li>
          <li class="nav-item"><a href="#" class="nav-link" data-page="tournaments">Tournaments</a></li>
          <li class="nav-item"><a href="#" class="nav-link" data-page="rewards">Rewards</a></li>
          <li class="nav-item"><a href="#" class="nav-link" data-page="vip">VIP</a></li>
          <li class="nav-item"><a href="#" class="nav-link" data-page="community">Community</a></li>
        </ul>
        <div class="user-controls">
          <div id="auth-buttons">
            <button id="login-button" class="btn btn-gradient"><i class="fas fa-gamepad"></i> Join Now</button>
          </div>
          <div id="user-profile" class="hidden">
            <div class="user-points">
              <i class="fas fa-coins"></i> <span id="user-points-display">0</span>
            </div>
            <img id="user-avatar" class="user-avatar" src="" alt="User Avatar">
            <div id="user-dropdown" class="hidden">
              <a href="#" data-page="profile"><i class="fas fa-user"></i> My Profile</a>
              <a href="#" data-page="history"><i class="fas fa-history"></i> Tournament History</a>
              <a href="#" id="admin-panel-link" class="hidden" data-page="admin"><i class="fas fa-cog"></i> Admin Panel</a>
              <a href="#" id="logout-button"><i class="fas fa-sign-out-alt"></i> Logout</a>
            </div>
          </div>
        </div>
      </div>
    `;
    appContainer.appendChild(navbar);

    // Create main content container
    const mainContent = document.createElement('main');
    mainContent.id = 'main-content';
    appContainer.appendChild(mainContent);

    // Add event listeners for navigation
    const navLinks = document.querySelectorAll('.nav-link');
    if (navLinks) {
      navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          const page = this.getAttribute('data-page');
          renderMainContent(page);
        });
      });
    }

    // Add event listener for login button
    const loginButton = document.getElementById('login-button');
    if (loginButton) {
      loginButton.addEventListener('click', function() {
        showAuthModal();
      });
    }

    // Add event listener for logout button
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
      logoutButton.addEventListener('click', function(e) {
        e.preventDefault();
        auth.signOut().then(() => {
          console.log('User signed out');
          showNotification("You've been logged out successfully", "info");
        }).catch((error) => {
          console.error('Sign out error:', error);
        });
      });
    }

    // Add event listener for user avatar (to show dropdown)
    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) {
      userAvatar.addEventListener('click', function() {
        const dropdown = document.getElementById('user-dropdown');
        if (dropdown) {
          dropdown.classList.toggle('hidden');
        }
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('user-dropdown');
        if (dropdown && !dropdown.classList.contains('hidden') && e.target !== userAvatar && !userAvatar.contains(e.target)) {
          dropdown.classList.add('hidden');
        }
      });
    }

    // Add footer
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = `
      <div class="container">
        <div class="footer-content">
          <div class="footer-logo">
            <i class="fas fa-trophy"></i> Tournament Hub
          </div>
          <div class="footer-links">
            <div class="footer-section">
              <h3>Quick Links</h3>
              <ul>
                <li><a href="#" data-page="home">Home</a></li>
                <li><a href="#" data-page="tournaments">Tournaments</a></li>
                <li><a href="#" data-page="rewards">Rewards</a></li>
                <li><a href="#" data-page="vip">VIP Membership</a></li>
              </ul>
            </div>
            <div class="footer-section">
              <h3>Support</h3>
              <ul>
                <li><a href="#">Contact Us</a></li>
                <li><a href="#">FAQ</a></li>
                <li><a href="#">Terms of Service</a></li>
                <li><a href="#">Privacy Policy</a></li>
              </ul>
            </div>
            <div class="footer-section">
              <h3>Connect</h3>
              <div class="social-icons">
                <a href="#"><i class="fab fa-twitter"></i></a>
                <a href="#"><i class="fab fa-discord"></i></a>
                <a href="#"><i class="fab fa-youtube"></i></a>
                <a href="#"><i class="fab fa-instagram"></i></a>
              </div>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p>&copy; ${new Date().getFullYear()} Tournament Hub. All rights reserved.</p>
        </div>
      </div>
    `;
    appContainer.appendChild(footer);

    // Setup footer link events
    const footerLinks = document.querySelectorAll('.footer-links a[data-page]');
    if (footerLinks) {
      footerLinks.forEach(link => {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          const page = this.getAttribute('data-page');
          renderMainContent(page);
        });
      });
    }
  }

  function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();

    // Add scope for profile info
    provider.addScope('profile');
    provider.addScope('email');

    // First try signInWithPopup as it works better in embedded environments
    auth.signInWithPopup(provider)
      .then((result) => {
        console.log('Google sign in successful');
        const user = result.user;

        // Check if this is a new user
        const isNewUser = result.additionalUserInfo?.isNewUser;
        if (isNewUser) {
          createUserDocument(user);
        }

        showNotification(`Welcome, ${user.displayName}!`, "success");
      })
      .catch((error) => {
        console.error('Google sign in popup error:', error);

        // If popup fails, try redirect as fallback
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
          try {
            // Fall back to redirect method
            auth.signInWithRedirect(provider)
              .catch((redirectError) => {
                handleGoogleSignInError(redirectError);
              });

            // Setup redirect result handler
            auth.getRedirectResult().then((result) => {
              if (result.user) {
                console.log('Google sign in successful after redirect');
                const user = result.user;

                // Check if this is a new user
                const isNewUser = result.additionalUserInfo?.isNewUser;
                if (isNewUser) {
                  createUserDocument(user);
                }

                showNotification(`Welcome, ${user.displayName}!`, "success");
              }
            }).catch((redirectResultError) => {
              console.error('Google redirect result error:', redirectResultError);
              handleGoogleSignInError(redirectResultError);
            });
          } catch (e) {
            console.error('Google sign in setup error:', e);
            showNotification("Google sign-in is currently unavailable. Please use email/password instead.", "warning");
          }
        } else {
          handleGoogleSignInError(error);
        }
      });
  }

  function handleGoogleSignInError(error) {
    console.error('Google sign in error:', error);

    // Handle specific error codes
    if (error.code === 'auth/unauthorized-domain') {
      showNotification("This domain is not authorized for Google Sign-in. Please use email/password instead.", "warning");
    } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
      showNotification("Google sign-in was cancelled. Please try again.", "info");
    } else if (error.code === 'auth/network-request-failed') {
      showNotification("Network error. Please check your connection and try again.", "error");
    } else {
      showNotification(`Sign in failed: ${error.message}`, "error");
    }
  }

  function createUserDocument(user) {
    // Check if user email is admin - specific admin email
    const isAdmin = user.email && (user.email === 'Jitenadminpanelaccess@gmail.com' || user.email === 'karateboyjitenderprajapat@gmail.com' || user.email.endsWith('@admin.tournamenthub.com'));

    db.collection('users').doc(user.uid).set({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random&color=fff`,
      points: 100, // Starting points
      tournaments: [],
      joinDate: firebase.firestore.FieldValue.serverTimestamp(),
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      isVIP: false,
      isAdmin: isAdmin,
      referrals: [],
      rewards: {
        dailyLogin: {
          lastClaimed: null,
          streakDays: 0
        }
      }
    }).then(() => {
      console.log('User document created');
      if (isAdmin) {
        showNotification('Admin account detected! You have access to the admin panel.', 'success');
      }
    }).catch((error) => {
      console.error('Error creating user document:', error);
    });
  }

  function loadUserData(user) {
    // Update UI with user data
    const userAvatar = document.getElementById('user-avatar');
    const authButtons = document.getElementById('auth-buttons');
    const userProfile = document.getElementById('user-profile');
    const adminPanelLink = document.getElementById('admin-panel-link');
    const userPointsDisplay = document.getElementById('user-points-display');

    if (userAvatar) userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}&background=random&color=fff`;
    if (authButtons) authButtons.classList.add('hidden');
    if (userProfile) userProfile.classList.remove('hidden');

    // Check if user is admin based on email
    const isAdmin = user.email && (
      user.email === 'Jitenadminpanelaccess@gmail.com' || 
      user.email === 'karateboyjitenderprajapat@gmail.com' || 
      user.email.endsWith('@admin.tournamenthub.com')
    );

    // Setup admin panel link if user is admin
    if (adminPanelLink) {
      if (isAdmin) {
        adminPanelLink.classList.remove('hidden');
        
        // Remove any existing click listeners to prevent duplicates
        const newAdminPanelLink = adminPanelLink.cloneNode(true);
        adminPanelLink.parentNode.replaceChild(newAdminPanelLink, adminPanelLink);
        
        // Add click event listener for admin panel
        newAdminPanelLink.addEventListener('click', function(e) {
          e.preventDefault();
          renderAdminPanel();
        });
      } else {
        adminPanelLink.classList.add('hidden');
      }
    }
    
    // Show loading indicator for points
    if (userPointsDisplay) {
      userPointsDisplay.textContent = "...";
      userPointsDisplay.classList.add('loading');
    }

    // Load user data from database with retry mechanism
    const loadUserDataWithRetry = (attempt = 1, maxAttempts = 3) => {
      return db.collection('users').doc(user.uid).get()
        .then((doc) => {
          if (userPointsDisplay) {
            userPointsDisplay.classList.remove('loading');
          }
          
          if (doc.exists) {
            const userData = doc.data();
            
            // Update points display with real data
            if (userPointsDisplay) {
              userPointsDisplay.textContent = userData.points || 0;
              // Store for quick reference
              localStorage.setItem('userPoints', userData.points || 0);
            }

            // If this is an admin logging in, ensure admin status is set
            if (isAdmin && !userData.isAdmin) {
              db.collection('users').doc(user.uid).update({
                isAdmin: true
              }).then(() => {
                console.log('User updated with admin privileges');
              }).catch(err => {
                console.log('Admin status update failed, but proceeding with admin privileges');
              });
            }
            
            // Record daily login
            trackDailyLogin(user.uid);
            
            return userData;
          } else {
            // User document doesn't exist, create one
            console.log('User document not found, creating new one');
            return createUserDocument(user).then(() => {
              if (userPointsDisplay) {
                userPointsDisplay.textContent = "100"; // Default starting points
              }
              return { points: 100 };
            });
          }
        })
        .catch(err => {
          console.error(`Error loading user data (attempt ${attempt}/${maxAttempts}):`, err);
          
          if (attempt < maxAttempts) {
            // Exponential backoff for retries
            const retryDelay = Math.min(1000 * Math.pow(2, attempt), 8000);
            console.log(`Retrying in ${retryDelay}ms...`);
            
            return new Promise(resolve => {
              setTimeout(() => {
                resolve(loadUserDataWithRetry(attempt + 1, maxAttempts));
              }, retryDelay);
            });
          } else {
            // All retries failed
            if (userPointsDisplay) {
              userPointsDisplay.classList.remove('loading');
              
              // Try to use cached value from localStorage if available
              const cachedPoints = localStorage.getItem('userPoints');
              userPointsDisplay.textContent = cachedPoints || "0";
            }
            
            showNotification("Error loading your profile data. Please refresh the page.", "error");
            throw err;
          }
        });
    };

    // Start loading user data with retry mechanism
    loadUserDataWithRetry();
  }

  function trackDailyLogin(userId) {
    const userRef = db.collection('users').doc(userId);
    userRef.get().then((doc) => {
      if (doc.exists) {
        const userData = doc.data();
        const now = new Date();
        const lastLogin = userData.rewards?.dailyLogin?.lastClaimed ?
                          userData.rewards.dailyLogin.lastClaimed.toDate() : null;

        // Check if this is a new day for login
        if (!lastLogin || !isSameDay(now, lastLogin)) {
          // Give daily login reward
          let streakDays = userData.rewards?.dailyLogin?.streakDays || 0;
          streakDays++;

          // Calculate reward points based on streak
          const rewardPoints = 10 + Math.min(streakDays * 5, 50); // Max 60 points for 10+ day streak

          userRef.update({
            points: firebase.firestore.FieldValue.increment(rewardPoints),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
            'rewards.dailyLogin.lastClaimed': firebase.firestore.FieldValue.serverTimestamp(),
            'rewards.dailyLogin.streakDays': streakDays
          }).then(() => {
            showNotification(`Daily login reward: +${rewardPoints} points! (Day ${streakDays} streak)`);
          });
        } else {
          // Just update last login
          userRef.update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    });
  }

  function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove after 5 seconds
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  function renderAuthContent() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
      <div class="hero">
        <h1>Welcome to Tournament Hub</h1>
        <p>Join tournaments, earn rewards, and compete with players worldwide.</p>
        <button id="hero-login-button" class="btn btn-primary">Sign In to Get Started</button>
      </div>
      <div class="container">
        <h2 class="section-title">Featured Tournaments</h2>
        <div class="grid">
          <div class="tournament-card">
            <img src="https://via.placeholder.com/300x180" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">Weekend Warrior Challenge</h3>
              <div class="tournament-info">
                <span class="tournament-date">Starts in 2 days</span>
                <span class="tournament-players">64 players</span>
              </div>
              <div class="tournament-prize">Prize: 1000 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">Entry: 50 points</span>
                <button class="btn btn-primary" disabled>Sign in to Join</button>
              </div>
            </div>
          </div>
          <div class="tournament-card">
            <img src="https://via.placeholder.com/300x180" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">Pro Gaming League</h3>
              <div class="tournament-info">
                <span class="tournament-date">Ongoing</span>
                <span class="tournament-players">128 players</span>
              </div>
              <div class="tournament-prize">Prize: 5000 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">Entry: 200 points</span>
                <button class="btn btn-primary" disabled>Sign in to Join</button>
              </div>
            </div>
          </div>
          <div class="tournament-card">
            <img src="https://via.placeholder.com/300x180" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">Flash Quiz Challenge</h3>
              <div class="tournament-info">
                <span class="tournament-date">Today</span>
                <span class="tournament-players">32 players</span>
              </div>
              <div class="tournament-prize">Prize: 500 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">Entry: 25 points</span>
                <button class="btn btn-primary" disabled>Sign in to Join</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add event listener for hero login button in renderAuthContent
    document.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'hero-login-button') {
        showAuthModal();
      }
    });
  }

  function renderMainContent(page) {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = '';

    // Highlight active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.getAttribute('data-page') === page) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
    
    // Add horizontal tabs for main sections (WhatsApp style)
    if (['home', 'tournaments', 'rewards', 'vip', 'community'].includes(page)) {
      const horizontalTabs = document.createElement('div');
      horizontalTabs.className = 'horizontal-tabs';
      horizontalTabs.innerHTML = `
        <div class="horizontal-tab ${page === 'home' ? 'active' : ''}" data-tab="home">Home</div>
        <div class="horizontal-tab ${page === 'tournaments' ? 'active' : ''}" data-tab="tournaments">Tournaments</div>
        <div class="horizontal-tab ${page === 'rewards' ? 'active' : ''}" data-tab="rewards">Rewards</div>
        <div class="horizontal-tab ${page === 'vip' ? 'active' : ''}" data-tab="vip">VIP</div>
        <div class="horizontal-tab ${page === 'community' ? 'active' : ''}" data-tab="community">Community</div>
      `;
      mainContent.appendChild(horizontalTabs);
      
      // Add event listeners to horizontal tabs
      const tabs = horizontalTabs.querySelectorAll('.horizontal-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', function() {
          const tabName = this.getAttribute('data-tab');
          renderMainContent(tabName);
        });
      });
    }

    switch(page) {
      case 'home':
        renderHomePage();
        break;
      case 'tournaments':
        renderTournamentsPage();
        break;
      case 'rewards':
        renderRewardsPage();
        break;
      case 'vip':
        renderVIPPage();
        break;
      case 'community':
        renderCommunityPage();
        break;
      case 'profile':
        renderProfilePage();
        break;
      case 'admin':
        renderAdminPanel(); // Added admin panel rendering
        break;
      case 'adminTournaments': 
        renderAdminTournamentsPage();
        break;
      case 'adminCommunity':
        renderAdminCommunityPage();
        break;
      case 'adminSettings':
        renderAdminSettingsPage();
        break;
      default:
        renderHomePage();
    }
  }

  function renderHomePage() {
    const mainContent = document.getElementById('main-content');

    // Get current user
    const user = auth.currentUser;
    if (!user) return;

    // Show loading state
    mainContent.innerHTML = `
      <div class="container text-center mt-4">
        <div class="loader"></div>
        <p>Loading homepage...</p>
      </div>
    `;

    // First check if we're offline to immediately render fallback UI
    if (!navigator.onLine) {
      console.log('Offline mode detected, showing offline homepage');
      showDefaultHomePage(user);
      return;
    }

    // Set timeout for slower offline detection - increased from 3000ms to 8000ms
    const timeoutId = setTimeout(() => {
      console.log('Request timed out, showing offline homepage');
      showDefaultHomePage(user);
    }, 8000);
    
    // Reset connection retries before attempting new connection
    dbConnectionRetries = 0;
    
    // Get user data from Firestore
    db.collection('users').doc(user.uid).get().then((doc) => {
      clearTimeout(timeoutId); // Clear timeout since we got a response
      
      if (doc.exists) {
        const userData = doc.data();

        mainContent.innerHTML = `
          <div class="hero" style="background: linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.7)), url('https://images.unsplash.com/photo-1511512578047-dfb367046420?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80'); background-size: cover; padding: 5rem 2rem; text-align: center; border-radius: 0 0 var(--border-radius) var(--border-radius);">
            <h1 style="font-size: 3rem; margin-bottom: 1.5rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">Welcome back, ${userData.displayName}!</h1>
            <p style="font-size: 1.4rem; margin-bottom: 2rem; max-width: 800px; margin-left: auto; margin-right: auto; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">You have <span style="color: var(--secondary-color); font-weight: bold;">${userData.points}</span> points to use in tournaments.</p>
            <a href="#tournaments" class="btn btn-gradient" style="font-size: 1.1rem; padding: 0.75rem 2rem; border-radius: 50px; box-shadow: 0 4px 15px rgba(255, 255, 255, 0.2);">Explore Tournaments</a>
          </div>
          <div class="container">
            <div class="stats-grid mb-4">
              <div class="stat-box">
                <i class="fas fa-trophy"></i>
                <div class="value">0</div>
                <div class="label">Tournaments Won</div>
              </div>
              <div class="stat-box">
                <i class="fas fa-gamepad"></i>
                <div class="value">0</div>
                <div class="label">Tournaments Joined</div>
              </div>
              <div class="stat-box">
                <i class="fas fa-coins"></i>
                <div class="value">${userData.points}</div>
                <div class="label">Points</div>
              </div>
              <div class="stat-box">
                <i class="fas fa-users"></i>
                <div class="value">${userData.referrals?.length || 0}</div>
                <div class="label">Referrals</div>
              </div>
            </div>

            <!-- New Featured Tournament Banner -->
            <div class="tournament-banner-container mb-4">
              <div class="featured-tournament-banner">
                <div class="featured-tournament-content">
                  <div class="featured-tournament-header">
                    <h2>🏆 BGMI Solo Battle – ₹5,000 Prize</h2>
                    <div class="tournament-status-badge ongoing">🔴 Ongoing</div>
                  </div>
                  
                  <div class="tournament-countdown" data-date="${new Date(Date.now() + 3*60*60*1000 + 45*60*1000 + 12*1000).toISOString()}">
                    🕒 Starts in: 03h 45m 12s
                  </div>
                  
                  <div class="tournament-details-row">
                    <div class="game-mode">
                      <span>🎮 Game Mode: Solo</span>
                    </div>
                    <div class="entry-fee">
                      <span>Entry Fee: 50 Points</span>
                    </div>
                  </div>
                  
                  <div class="tournament-status-row">
                    <div>✅ Status: 
                      <span class="status-indicator ongoing">🔴 Ongoing</span> | 
                      <span class="status-indicator upcoming">🟢 Upcoming</span> | 
                      <span class="status-indicator completed">⚪ Completed</span>
                    </div>
                  </div>
                  
                  <button class="btn btn-gradient join-tournament-btn">Join Tournament</button>
                </div>
              </div>
            </div>

            <h2 class="section-title">Upcoming Tournaments</h2>
            <div class="grid">
              <div class="tournament-card">
                <div class="tournament-banner">
                  <span class="tournament-status upcoming">Upcoming</span>
                </div>
                <img src="https://via.placeholder.com/300x180" alt="Tournament Image" class="tournament-image">
                <div class="tournament-details">
                  <h3 class="tournament-title">Weekend Warrior Challenge</h3>
                  <div class="tournament-countdown" data-date="${new Date(Date.now() + 2*24*60*60*1000).toISOString()}">
                    <i class="far fa-clock"></i> Starts in: 2d 0h 0m
                  </div>
                  <div class="tournament-info">
                    <span class="tournament-game"><i class="fas fa-gamepad"></i> PUBG Mobile</span>
                    <span class="tournament-players"><i class="fas fa-users"></i> 64 players</span>
                  </div>
                  <div class="tournament-mode">
                    <span>Squad | TPP</span>
                  </div>
                  <div class="tournament-prize">Prize: 1000 points</div>
                  <div class="tournament-entry">
                    <span class="entry-fee">Entry: 50 points</span>
                    <button class="btn btn-primary">Join Tournament</button>
                  </div>
                </div>
              </div>
              <div class="tournament-card">
                <div class="tournament-banner">
                  <span class="tournament-status ongoing">Ongoing</span>
                </div>
                <img src="https://via.placeholder.com/300x180" alt="Tournament Image" class="tournament-image">
                <div class="tournament-details">
                  <h3 class="tournament-title">Pro Gaming League</h3>
                  <div class="tournament-info">
                    <span class="tournament-game"><i class="fas fa-gamepad"></i> Free Fire</span>
                    <span class="tournament-players"><i class="fas fa-users"></i> 128 players</span>
                  </div>
                  <div class="tournament-mode">
                    <span>Duo | TPP</span>
                  </div>
                  <div class="tournament-prize">Prize: 5000 points</div>
                  <div class="tournament-entry">
                    <span class="entry-fee">Entry: 200 points</span>
                    <button class="btn btn-primary">Join Tournament</button>
                  </div>
                </div>
              </div>
              <div class="tournament-card">
                <div class="tournament-banner">
                  <span class="tournament-status today">Today</span>
                </div>
                <img src="https://via.placeholder.com/300x180" alt="Tournament Image" class="tournament-image">
                <div class="tournament-details">
                  <h3 class="tournament-title">Flash Quiz Challenge</h3>
                  <div class="tournament-countdown" data-date="${new Date(Date.now() + 5*60*60*1000).toISOString()}">
                    <i class="far fa-clock"></i> Starts in: 5h 0m 0s
                  </div>
                  <div class="tournament-info">
                    <span class="tournament-game"><i class="fas fa-gamepad"></i> COD Mobile</span>
                    <span class="tournament-players"><i class="fas fa-users"></i> 32 players</span>
                  </div>
                  <div class="tournament-mode">
                    <span>Solo | FPP</span>
                  </div>
                  <div class="tournament-prize">Prize: 500 points</div>
                  <div class="tournament-entry">
                    <span class="entry-fee">Entry: 25 points</span>
                    <button class="btn btn-primary">Join Tournament</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="rewards-container mt-4">
              <h2 class="section-title">Daily Rewards</h2>
              <div class="reward-item">
                <div class="reward-icon">
                  <i class="fas fa-calendar-check"></i>
                </div>
                <div class="reward-details">
                  <h3 class="reward-title">Daily Login Streak: Day ${userData.rewards?.dailyLogin?.streakDays || 0}</h3>
                  <p class="reward-description">Log in daily to earn points. Longer streaks earn more points!</p>
                </div>
                <div class="reward-points">+${10 + Math.min((userData.rewards?.dailyLogin?.streakDays || 0) * 5, 50)} points</div>
              </div>
              <div class="reward-item">
                <div class="reward-icon">
                  <i class="fas fa-ad"></i>
                </div>
                <div class="reward-details">
                  <h3 class="reward-title">Watch Ads for Points</h3>
                  <p class="reward-description">Watch a short ad to earn extra points.</p>
                </div>
                <div class="reward-points">+20 points</div>
                <button class="btn btn-secondary">Watch Ad</button>
              </div>
            </div>
          </div>
        `;
        
        // Initialize countdown timers after rendering
        setupTournamentCountdowns();
      }
    }).catch(err => {
      console.error('Error loading user data:', err);
      // Show default homepage with sample data in case of offline
      showDefaultHomePage(user);
    });
  }
  
  // Fallback function to show homepage even when offline
  function showDefaultHomePage(user) {
    const mainContent = document.getElementById('main-content');
    const displayName = user.displayName || 'User';
    
    mainContent.innerHTML = `
      <div class="hero" style="background: linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.7)), url('https://images.unsplash.com/photo-1511512578047-dfb367046420?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80'); background-size: cover; padding: 5rem 2rem; text-align: center; border-radius: 0 0 var(--border-radius) var(--border-radius);">
        <h1 style="font-size: 3rem; margin-bottom: 1.5rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">Welcome back, ${displayName}!</h1>
        <p style="font-size: 1.4rem; margin-bottom: 2rem; max-width: 800px; margin-left: auto; margin-right: auto; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">You're currently in offline mode. Some features may be limited.</p>
        <a href="#tournaments" class="btn btn-gradient" style="font-size: 1.1rem; padding: 0.75rem 2rem; border-radius: 50px; box-shadow: 0 4px 15px rgba(255, 255, 255, 0.2);">Explore Tournaments</a>
      </div>
      
      <div class="container">
        <div class="stats-grid mb-4">
          <div class="stat-box">
            <i class="fas fa-trophy"></i>
            <div class="value">0</div>
            <div class="label">Tournaments Won</div>
          </div>
          <div class="stat-box">
            <i class="fas fa-gamepad"></i>
            <div class="value">0</div>
            <div class="label">Tournaments Joined</div>
          </div>
          <div class="stat-box">
            <i class="fas fa-coins"></i>
            <div class="value">100</div>
            <div class="label">Points</div>
          </div>
          <div class="stat-box">
            <i class="fas fa-users"></i>
            <div class="value">0</div>
            <div class="label">Referrals</div>
          </div>
        </div>

        <!-- Tournament Overview Section (Hero Banner) -->
        <div class="tournament-banner-container mb-4">
          <div class="featured-tournament-banner">
            <div class="featured-tournament-content">
              <div class="featured-tournament-header">
                <h2>🏆 BGMI Solo Battle – ₹5,000 Prize</h2>
                <div class="tournament-status-badge upcoming">🟢 Upcoming</div>
              </div>
              
              <div class="tournament-countdown" data-date="${new Date(Date.now() + 3*60*60*1000 + 45*60*1000 + 12*1000).toISOString()}">
                🕒 Starts in: 03h 45m 12s
              </div>
              
              <div class="tournament-details-row">
                <div class="game-mode">
                  <span>🎮 Game Mode: Solo</span>
                </div>
                <div class="entry-fee">
                  <span>Entry Fee: 50 Points</span>
                </div>
              </div>
              
              <div class="tournament-status-row">
                <div>✅ Status: 
                  <span class="status-indicator ongoing">🔴 Ongoing</span> | 
                  <span class="status-indicator upcoming">🟢 Upcoming</span> | 
                  <span class="status-indicator completed">⚪ Completed</span>
                </div>
              </div>
              
              <button class="btn btn-gradient join-tournament-btn">Join Tournament</button>
            </div>
          </div>
        </div>
        
        <!-- Sample tournament cards -->
        <h2 class="section-title">Upcoming Tournaments</h2>
        <div class="grid">
          <div class="tournament-card">
            <div class="tournament-banner">
              <span class="tournament-status upcoming">Upcoming</span>
            </div>
            <img src="https://via.placeholder.com/300x180" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">Weekend Warrior Challenge</h3>
              <div class="tournament-countdown" data-date="${new Date(Date.now() + 2*24*60*60*1000).toISOString()}">
                <i class="far fa-clock"></i> Starts in: 2d 0h 0m
              </div>
              <div class="tournament-info">
                <span class="tournament-game"><i class="fas fa-gamepad"></i> PUBG Mobile</span>
                <span class="tournament-players"><i class="fas fa-users"></i> 64 players</span>
              </div>
              <div class="tournament-mode">
                <span>Squad | TPP</span>
              </div>
              <div class="tournament-prize">Prize: 1000 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">Entry: 50 points</span>
                <button class="btn btn-primary">Join Tournament</button>
              </div>
            </div>
          </div>
          
          <div class="tournament-card">
            <div class="tournament-banner">
              <span class="tournament-status today">Today</span>
            </div>
            <img src="https://via.placeholder.com/300x180" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">Flash Quiz Challenge</h3>
              <div class="tournament-countdown" data-date="${new Date(Date.now() + 5*60*60*1000).toISOString()}">
                <i class="far fa-clock"></i> Starts in: 5h 0m 0s
              </div>
              <div class="tournament-info">
                <span class="tournament-game"><i class="fas fa-gamepad"></i> COD Mobile</span>
                <span class="tournament-players"><i class="fas fa-users"></i> 32 players</span>
              </div>
              <div class="tournament-mode">
                <span>Solo | FPP</span>
              </div>
              <div class="tournament-prize">Prize: 500 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">Entry: 25 points</span>
                <button class="btn btn-primary">Join Tournament</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Initialize countdown timers
    setupTournamentCountdowns();
  }

  function renderTournamentsPage() {
    const mainContent = document.getElementById('main-content');
    const user = firebase.auth().currentUser;

    const tournamentsHTML = `
      <div class="container">
        <h2 class="section-title">All Tournaments</h2>

        <div class="tournament-filters mb-3">
          <div class="filter-controls">
            <select class="form-input tournament-filter" id="tournament-status-filter">
              <option value="all">All Tournaments</option>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>

            <select class="form-input tournament-filter ml-2" id="tournament-prize-filter">
              <option value="all">All Prize Pools</option>
              <option value="low">Low (< 1000 points)</option>
              <option value="medium">Medium (1000-3000 points)</option>
              <option value="high">High (> 3000 points)</option>
            </select>

            <input type="text" class="form-input ml-2" id="tournament-search" placeholder="Search tournaments...">
          </div>

          <div class="tournament-count">
            <span id="tournament-count-display">6 tournaments found</span>
          </div>
        </div>

        <div class="tournament-grid">
          <div class="tournament-card">
            <div class="tournament-banner">
              <span class="tournament-status upcoming">Upcoming</span>
            </div>
            <img src="https://images.unsplash.com/photo-1511512578047-dfb367046420?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">Weekend Warrior Challenge</h3>
              <div class="tournament-info">
                <span class="tournament-date"><i class="far fa-calendar-alt"></i> Starts in 2 days</span>
                <span class="tournament-players"><i class="fas fa-users"></i> 64 players</span>
              </div>
              <div class="tournament-game">
                <span><i class="fas fa-gamepad"></i> Battle Royale</span>
              </div>
              <div class="tournament-prize">Prize: 1000 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">Entry: 50 points</span>
                <button class="btn btn-primary tournament-join-btn" data-tournament-id="t1" data-entry-fee="50">Join Tournament</button>
              </div>
            </div>
          </div>

          <div class="tournament-card">
            <div class="tournament-banner">
              <span class="tournament-status ongoing">Ongoing</span>
            </div>
            <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">Pro Gaming League</h3>
              <div class="tournament-info">
                <span class="tournament-date"><i class="far fa-calendar-alt"></i> Ongoing</span>
                <span class="tournament-players"><i class="fas fa-users"></i> 128 players</span>
              </div>
              <div class="tournament-game">
                <span><i class="fas fa-gamepad"></i> FPS Championship</span>
              </div>
              <div class="tournament-prize">Prize: 5000 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">Entry: 200 points</span>
                <button class="btn btn-primary tournament-join-btn" data-tournament-id="t2" data-entry-fee="200">Join Tournament</button>
              </div>
            </div>
          </div>

          <div class="tournament-card">
            <div class="tournament-banner">
              <span class="tournament-status today">Today</span>
            </div>
            <img src="https://images.unsplash.com/photo-1519669556878-63bdad8a1a49?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">Flash Quiz Challenge</h3>
              <div class="tournament-info">
                <span class="tournament-date"><i class="far fa-calendar-alt"></i> Today</span>
                <span class="tournament-players"><i class="fas fa-users"></i> 32 players</span>
              </div><div class="tournament-game">
                <span><i class="fas fa-brain"></i> Trivia Masters</span>
              </div>
              <div class="tournament-prize">Prize: 500 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">Entry: 25 points</span>
                <button class="btn btn-primary tournament-join-btn" data-tournament-id="t3" data-entry-fee="25">Join Tournament</button>
              </div>
            </div>
          </div>

          <div class="tournament-card">
            <div class="tournament-banner">
              <span class="tournament-status upcoming">Next Week</span>
            </div>
            <img src="https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">Strategy Masters</h3>
              <div class="tournament-info">
                <span class="tournament-date"><i class="far fa-calendar-alt"></i> Next week</span>
                <span class="tournament-players"><i class="fas fa-users"></i> 16 players</span>
              </div>
              <div class="tournament-game">
                <span><i class="fas fa-chess"></i> Strategy Games</span>
              </div>
              <div class="tournament-prize">Prize: 3000 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">Entry: 150 points</span>
                <button class="btn btn-primary tournament-join-btn" data-tournament-id="t4" data-entry-fee="150">Join Tournament</button>
              </div>
            </div>
          </div>

          <div class="tournament-card">
            <div class="tournament-banner">
              <span class="tournament-status upcoming">Tomorrow</span>
            </div>
            <img src="https://images.unsplash.com/photo-1559116315-f69f60c3b506?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">Puzzle Marathon</h3>
              <div class="tournament-info">
                <span class="tournament-date"><i class="far fa-calendar-alt"></i> Tomorrow</span>
                <span class="tournament-players"><i class="fas fa-users"></i> 50 players</span>
              </div>
              <div class="tournament-game">
                <span><i class="fas fa-puzzle-piece"></i> Puzzle Games</span>
              </div>
              <div class="tournament-prize">Prize: 800 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">Entry: 40 points</span>
                <button class="btn btn-primary tournament-join-btn" data-tournament-id="t5" data-entry-fee="40">Join Tournament</button>
              </div>
            </div>
          </div>

          <div class="tournament-card vip-tournament">
            <div class="tournament-banner">
              <span class="tournament-status vip">VIP Only</span>
            </div>
            <img src="https://images.unsplash.com/photo-1563089145-599997674d42?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Tournament Image" class="tournament-image">
            <div class="tournament-details">
              <h3 class="tournament-title">VIP Elite Showdown</h3>
              <div class="tournament-info">
                <span class="tournament-date"><i class="far fa-calendar-alt"></i> This weekend</span>
                <span class="tournament-players"><i class="fas fa-users"></i> 32 players</span>
              </div>
              <div class="tournament-game">
                <span><i class="fas fa-trophy"></i> Multi-game Championship</span>
              </div>
              <div class="tournament-prize">Prize: 10000 points</div>
              <div class="tournament-entry">
                <span class="entry-fee">VIP Only</span>
                <button class="btn btn-secondary">Upgrade to VIP</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    mainContent.innerHTML = tournamentsHTML;

    // Add event listeners for tournament filtering
    const statusFilter = document.getElementById('tournament-status-filter');
    const prizeFilter = document.getElementById('tournament-prize-filter');
    const searchInput = document.getElementById('tournament-search');

    if (statusFilter) {
      statusFilter.addEventListener('change', filterTournaments);
    }

    if (prizeFilter) {
      prizeFilter.addEventListener('change', filterTournaments);
    }

    if (searchInput) {
      searchInput.addEventListener('input', filterTournaments);
    }

    // Add event listeners for join tournament buttons
    const joinButtons = document.querySelectorAll('.tournament-join-btn');
    joinButtons.forEach(button => {
      button.addEventListener('click', function() {
        const tournamentId = this.getAttribute('data-tournament-id');
        const entryFee = parseInt(this.getAttribute('data-entry-fee'), 10);

        if (!user) {
          showNotification("Please sign in to join tournaments", "warning");
          showAuthModal();
          return;
        }

        // Check if user has enough points
        db.collection('users').doc(user.uid).get().then(doc => {
          if (doc.exists) {
            const userData = doc.data();
            const userPoints = userData.points || 0;

            if (userPoints >= entryFee) {
              // Here you would implement the tournament join logic
              showNotification(`Successfully joined tournament! Entry fee: ${entryFee} points`, "success");

              // Update user points
              db.collection('users').doc(user.uid).update({
                points: firebase.firestore.FieldValue.increment(-entryFee),
                tournaments: firebase.firestore.FieldValue.arrayUnion({
                  tournamentId: tournamentId,
                  joinDate: firebase.firestore.FieldValue.serverTimestamp()
                })
              }).then(() => {
                // Update displayed points
                const pointsDisplay = document.getElementById('user-points-display');
                if (pointsDisplay) {
                  pointsDisplay.textContent = userPoints - entryFee;
                }
              });
            } else {
              showNotification(`Not enough points to join. Need ${entryFee} points but you have ${userPoints}`, "error");
            }
          }
        }).catch(error => {
          console.error("Error checking user points:", error);
          showNotification("Error joining tournament. Please try again.", "error");
        });
      });
    });
  }

  function filterTournaments() {
    const statusFilter = document.getElementById('tournament-status-filter').value;
    const prizeFilter = document.getElementById('tournament-prize-filter').value;
    const searchTerm = document.getElementById('tournament-search').value.toLowerCase();

    const tournamentCards = document.querySelectorAll('.tournament-card');
    let visibleCount = 0;

    tournamentCards.forEach(card => {
      // Get tournament details
      const title = card.querySelector('.tournament-title').textContent.toLowerCase();
      const status = card.querySelector('.tournament-status').textContent.toLowerCase();
      const prize = card.querySelector('.tournament-prize').textContent;
      const prizeValue = parseInt(prize.match(/\d+/)[0], 10);

      // Check if tournament matches all filters
      let matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'upcoming' && (status.includes('upcoming') || status.includes('next') || status.includes('tomorrow'))) ||
                         (statusFilter === 'ongoing' && status.includes('ongoing')) ||
                         (statusFilter === 'completed' && status.includes('completed'));

      let matchesPrize = prizeFilter === 'all' || 
                        (prizeFilter === 'low' && prizeValue < 1000) ||
                        (prizeFilter === 'medium' && prizeValue >= 1000 && prizeValue <= 3000) ||
                        (prizeFilter === 'high' && prizeValue > 3000);

      let matchesSearch = searchTerm === '' || title.includes(searchTerm);

      // Show or hide tournament card
      if (matchesStatus && matchesPrize && matchesSearch) {
        card.style.display = 'block';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    // Update count display
    const countDisplay = document.getElementById('tournament-count-display');
    if (countDisplay) {
      countDisplay.textContent = `${visibleCount} tournament${visibleCount !== 1 ? 's' : ''} found`;
    }
  }

  function renderRewardsPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
      <div class="container">
        <h2 class="section-title">Earn Points & Rewards</h2>

        <div class="rewards-container">
          <h3 class="mb-2">Daily Rewards</h3>
          <div class="reward-item">
            <div class="reward-icon">
              <i class="fas fa-calendar-check"></i>
            </div>
            <div class="reward-details">
              <h3 class="reward-title">Daily Login Bonus</h3>
              <p class="reward-description">Log in daily to earn points. Longer streaks earn more points!</p>
            </div>
            <div class="reward-points">+10-60 points</div>
          </div>
          <div class="reward-item">
            <div class="reward-icon">
              <i class="fas fa-ad"></i>
            </div>
            <div class="reward-details">
              <h3 class="reward-title">Watch Ads for Points</h3>
              <p class="reward-description">Watch a short ad to earn extra points (3 times daily).</p>
            </div>
            <div class="reward-points">+20 points</div>
            <button class="btn btn-secondary">Watch Ad</button>
          </div>
        </div>

        <div class="rewards-container mt-4">
          <h3 class="mb-2">Refer & Earn</h3>
          <div class="reward-item">
            <div class="reward-icon">
              <i class="fas fa-user-plus"></i>
            </div>
            <div class="reward-details">
              <h3 class="reward-title">Invite Friends</h3>
              <p class="reward-description">Earn points for each friend who joins using your referral link.</p>
            </div>
            <div class="reward-points">+100 points per referral</div>
          </div>
          <div class="form-group mt-3">
            <label class="form-label">Your Referral Link</label>
            <div style="display: flex;">
              <input type="text" class="form-input" value="https://tournamenthub.com/ref/username" readonly style="flex-grow: 1; margin-right: 10px;">
              <button class="btn btn-primary">Copy</button>
            </div>
          </div>
        </div>

        <div class="rewards-container mt-4">
          <h3 class="mb-2">Tournament Achievements</h3>
          <div class="reward-item">
            <div class="reward-icon">
              <i class="fas fa-trophy"></i>
            </div>
            <div class="reward-details">
              <h3 class="reward-title">Tournament Victory</h3>
              <p class="reward-description">Win a tournament to earn bonus points besides the prize pool.</p>
            </div>
            <div class="reward-points">+200 points</div>
          </div>
          <div class="reward-item">
            <div class="reward-icon">
              <i class="fas fa-medal"></i>
            </div>
            <div class="reward-details">
              <h3 class="reward-title">Tournament Finalist</h3>
              <p class="reward-description">Reach the finals of any tournament.</p>
            </div>
            <div class="reward-points">+100 points</div>
          </div>
          <div class="reward-item">
            <div class="reward-icon">
              <i class="fas fa-fire"></i>
            </div>
            <div class="reward-details">
              <h3 class="reward-title">Win Streak</h3>
              <p class="reward-description">Win 3 tournaments in a row.</p>
            </div>
            <div class="reward-points">+500 points</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderVIPPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
      <div class="container">
        <div class="vip-container">
          <h2 class="vip-title">VIP Membership</h2>
          <p class="vip-description">Upgrade to VIP and unlock exclusive benefits and features!</p>

          <div class="vip-benefits">
            <div class="vip-benefit">
              <i class="fas fa-coins"></i>
              <h3>Double Points</h3>
              <p>Earn 2x points from daily logins and ads</p>
            </div>
            <div class="vip-benefit">
              <i class="fas fa-lock-open"></i>
              <h3>Exclusive Tournaments</h3>
              <p>Access to VIP-only tournaments with bigger prizes</p>
            </div>
            <div class="vip-benefit">
              <i class="fas fa-clock"></i>
              <h3>Early Access</h3>
              <p>Join tournaments before non-VIP members</p>
            </div>
            <div class="vip-benefit">
              <i class="fas fa-tag"></i>
              <h3>Discounted Entry</h3>
              <p>20% off tournament entry fees</p>
            </div>
          </div>

          <p class="mt-3 mb-3">Available Soon</p>
        </div>
      </div>
    `;
  }

  function renderCommunityPage() {
    const mainContent = document.getElementById('main-content');
    const user = auth.currentUser;
    
    // Check if user is admin
    const isAdmin = user && user.email && (
      user.email === 'Jitenadminpanelaccess@gmail.com' || 
      user.email === 'karateboyjitenderprajapat@gmail.com' || 
      user.email.endsWith('@admin.tournamenthub.com')
    );
    
    // Load community messages
    mainContent.innerHTML = `
      <div class="container">
        <h2 class="section-title">Community Hub</h2>
        <div class="community-description">
          <div class="alert info">
            <h3><i class="fas fa-info-circle"></i> Community Announcements</h3>
            <p>Welcome to our community channel. This is a read-only channel where tournament admins post important announcements and updates.</p>
          </div>
        </div>

        <div class="chat-container">
          <div class="chat-sidebar">
            <div style="padding: 1rem; border-bottom: 1px solid #ddd;">
              <h3>Channels</h3>
            </div>
            <ul class="channel-list">
              <li class="channel-item active" data-channel="announcements">
                <i class="fas fa-bullhorn"></i> Announcements
                <span class="admin-only-badge">Admin Only</span>
              </li>
              <li class="channel-item" data-channel="tournaments">
                <i class="fas fa-trophy"></i> Tournament Updates
                <span class="admin-only-badge">Admin Only</span>
              </li>
              <li class="channel-item" data-channel="events">
                <i class="fas fa-calendar-check"></i> Upcoming Events
                <span class="admin-only-badge">Admin Only</span>
              </li>
              <li class="channel-item" data-channel="rules">
                <i class="fas fa-gavel"></i> Rules & Guidelines
                <span class="admin-only-badge">Admin Only</span>
              </li>
            </ul>
            
            <div class="viewer-count">
              <i class="fas fa-eye"></i> <span id="viewer-count">124</span> viewers online
            </div>
          </div>
          
          <div class="chat-main">
            <div class="chat-header">
              <div>
                <h3><i class="fas fa-bullhorn"></i> Announcements</h3>
                <span class="channel-description">Official announcements from the Tournament Hub team</span>
              </div>
              ${isAdmin ? `<button id="refresh-messages" class="btn btn-sm btn-secondary"><i class="fas fa-sync-alt"></i> Refresh</button>` : ''}
            </div>
            
            <div class="chat-messages" id="community-messages">
              <div class="message admin-message">
                <img src="https://via.placeholder.com/40" alt="Admin Avatar" class="message-avatar">
                <div class="message-content">
                  <div class="message-sender">Tournament Admin <span class="admin-badge">ADMIN</span></div>
                  <div class="message-text">Welcome to the official Tournament Hub Community! This channel is for important announcements only. Stay tuned for tournament updates, events, and more!</div>
                  <div class="message-time">2 hours ago</div>
                  <div class="message-views"><i class="fas fa-eye"></i> 253 views</div>
                </div>
              </div>
              
              <div class="message admin-message">
                <img src="https://via.placeholder.com/40" alt="Admin Avatar" class="message-avatar">
                <div class="message-content">
                  <div class="message-sender">Tournament Admin <span class="admin-badge">ADMIN</span></div>
                  <div class="message-text">🏆 New Tournament Alert! 🏆<br><br>The BGMI Solo Battle tournament registration is now OPEN! Prize pool of ₹5,000.<br><br>📅 Starts: Tomorrow at 6:00 PM<br>🎮 Mode: Solo TPP<br>💰 Entry: 50 Points<br><br>Register now from the Tournaments page!</div>
                  <div class="message-time">45 minutes ago</div>
                  <div class="message-views"><i class="fas fa-eye"></i> 187 views</div>
                </div>
              </div>
              
              <div class="message admin-message">
                <img src="https://via.placeholder.com/40" alt="Admin Avatar" class="message-avatar">
                <div class="message-content">
                  <div class="message-sender">Tournament Admin <span class="admin-badge">ADMIN</span></div>
                  <div class="message-text">⚠️ Server Maintenance ⚠️<br><br>We will be performing server maintenance tomorrow from 3:00 AM to 5:00 AM (UTC). During this time, the website may be temporarily unavailable.<br><br>Thank you for your understanding!</div>
                  <div class="message-time">30 minutes ago</div>
                  <div class="message-views"><i class="fas fa-eye"></i> 142 views</div>
                </div>
              </div>
              
              <div class="message admin-message pinned">
                <img src="https://via.placeholder.com/40" alt="Admin Avatar" class="message-avatar">
                <div class="message-content">
                  <div class="message-sender">Tournament Admin <span class="admin-badge">ADMIN</span> <span class="pinned-badge"><i class="fas fa-thumbtack"></i> PINNED</span></div>
                  <div class="message-text">📢 IMPORTANT: New Rules for Tournament Registration 📢<br><br>1. Players must be at least level 10 to join competitive tournaments<br>2. A valid mobile number is required for prize verification<br>3. Team members must be registered at least 2 hours before tournament start time<br><br>Read the complete rules in the Rules & Guidelines section.</div>
                  <div class="message-time">15 minutes ago</div>
                  <div class="message-views"><i class="fas fa-eye"></i> 98 views</div>
                </div>
              </div>
            </div>
            
            ${isAdmin ? `
            <div class="chat-input">
              <textarea id="admin-message" placeholder="Type your announcement message..." rows="3"></textarea>
              <div class="message-options">
                <label class="checkbox-label">
                  <input type="checkbox" id="pin-message"> Pin this message
                </label>
                <button id="send-admin-message" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Post Announcement</button>
              </div>
            </div>
            ` : `
            <div class="read-only-notice">
              <i class="fas fa-lock"></i> This is a read-only channel. Only administrators can post messages.
            </div>
            `}
          </div>
        </div>

        <div class="rewards-container mt-4">
          <h3 class="mb-2">Community Leaderboard</h3>
          <table class="leaderboard">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Tournaments Won</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="rank rank-1">1</td>
                <td>TournamentMaster</td>
                <td>32</td>
                <td>25,480</td>
              </tr>
              <tr>
                <td class="rank rank-2">2</td>
                <td>GamePro99</td>
                <td>28</td>
                <td>21,350</td>
              </tr>
              <tr>
                <td class="rank rank-3">3</td>
                <td>StrategyGuru</td>
                <td>25</td>
                <td>19,780</td>
              </tr>
              <tr>
                <td class="rank">4</td>
                <td>QuizChampion</td>
                <td>22</td>
                <td>18,430</td>
              </tr>
              <tr>
                <td class="rank">5</td>
                <td>TopPlayer</td>
                <td>20</td>
                <td>16,890</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    // Add event listeners for the community page
    if (isAdmin) {
      // Add event listener for sending admin messages
      const sendButton = document.getElementById('send-admin-message');
      if (sendButton) {
        sendButton.addEventListener('click', function() {
          const messageText = document.getElementById('admin-message').value.trim();
          const isPinned = document.getElementById('pin-message').checked;
          
          if (messageText) {
            // Add message to Firestore
            db.collection('communityMessages').add({
              text: messageText,
              sender: user.displayName || 'Tournament Admin',
              senderUid: user.uid,
              timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              isPinned: isPinned,
              views: 0,
              viewers: []
            }).then(() => {
              document.getElementById('admin-message').value = '';
              document.getElementById('pin-message').checked = false;
              showNotification('Message posted successfully', 'success');
              
              // Add message to UI immediately
              const messagesContainer = document.getElementById('community-messages');
              const newMessage = document.createElement('div');
              newMessage.className = `message admin-message ${isPinned ? 'pinned' : ''}`;
              newMessage.innerHTML = `
                <img src="${user.photoURL || 'https://via.placeholder.com/40'}" alt="Admin Avatar" class="message-avatar">
                <div class="message-content">
                  <div class="message-sender">${user.displayName || 'Tournament Admin'} <span class="admin-badge">ADMIN</span> ${isPinned ? '<span class="pinned-badge"><i class="fas fa-thumbtack"></i> PINNED</span>' : ''}</div>
                  <div class="message-text">${messageText.replace(/\n/g, '<br>')}</div>
                  <div class="message-time">Just now</div>
                  <div class="message-views"><i class="fas fa-eye"></i> 0 views</div>
                </div>
              `;
              messagesContainer.appendChild(newMessage);
              
              // Scroll to bottom
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }).catch(err => {
              console.error('Error posting message:', err);
              showNotification('Failed to post message. Please try again.', 'error');
            });
          } else {
            showNotification('Please enter a message', 'warning');
          }
        });
      }
      
      // Add event listener for refreshing messages
      const refreshButton = document.getElementById('refresh-messages');
      if (refreshButton) {
        refreshButton.addEventListener('click', function() {
          loadCommunityMessages();
        });
      }
    }
    
    // Handle channel switching
    const channelItems = document.querySelectorAll('.channel-item');
    channelItems.forEach(item => {
      item.addEventListener('click', function() {
        // Remove active class from all channels
        channelItems.forEach(ch => ch.classList.remove('active'));
        
        // Add active class to clicked channel

  // Global function to render admin panel in offline mode
  function renderOfflineAdminPanel(user) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) {
      console.error('Main content container not found for offline admin panel');
      return;
    }
    
    // Use default data for offline mode
    const offlineStats = {
      totalUsers: "—",
      activeTournaments: "—",
      pointsDistributed: "—",
      newUsers: "—",
      recentUsers: [],
      tournaments: []
    };
    
    // Create default user data for offline mode
    const userData = {
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Admin'),
      email: user.email || 'admin@tournamenthub.com',
      isAdmin: true,
      photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'Admin'}&background=random&color=fff`
    };
    
    // Create sample offline data for better UI experience
    const sampleUsers = [
      {
        displayName: "Sample User",
        email: "user@example.com",
        photoURL: "https://ui-avatars.com/api/?name=Sample+User&background=random&color=fff",
        joinDate: new Date(),
        points: 100,
        isVIP: false,
        uid: "sample1"
      },
      {
        displayName: userData.displayName,
        email: userData.email,
        photoURL: userData.photoURL,
        joinDate: new Date(),
        points: 1000,
        isVIP: true,
        isAdmin: true,
        uid: "admin1"
      }
    ];
    
    const sampleTournaments = [
      {
        name: "Weekend Warrior",
        startDate: new Date(Date.now() + 2*24*60*60*1000),
        entryFee: 50,
        prizePool: 1000,
        participants: 32,
        maxParticipants: 64,
        id: "sample-t1"
      },
      {
        name: "BGMI Champions",
        startDate: new Date(Date.now() + 5*24*60*60*1000),
        entryFee: 100,
        prizePool: 5000,
        participants: 45,
        maxParticipants: 100,
        id: "sample-t2"
      }
    ];
    
    mainContent.innerHTML = `
      <div class="admin-layout">
        <div class="admin-sidebar">
          <div class="admin-logo">
            <i class="fas fa-trophy"></i> Admin Panel
          </div>
          <div class="admin-user">
            <img src="${userData.photoURL}" alt="Admin Avatar">
            <div class="admin-user-info">
              <div class="admin-user-name">${userData.displayName}</div>
              <div class="admin-user-role">Administrator</div>
            </div>
          </div>
          <ul class="admin-nav">
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link active" data-admin-page="dashboard">
                <i class="fas fa-tachometer-alt"></i> Dashboard
              </a>
            </li>
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link" data-admin-page="users">
                <i class="fas fa-users"></i> User Management
              </a>
            </li>
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link" data-admin-page="tournaments">
                <i class="fas fa-trophy"></i> Tournament Management
              </a>
            </li>
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link" data-admin-page="rewards">
                <i class="fas fa-gift"></i> Rewards & Earnings
              </a>
            </li>
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link" data-admin-page="ads">
                <i class="fas fa-ad"></i> Ad Management
              </a>
            </li>
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link" data-admin-page="settings">
                <i class="fas fa-cog"></i> Settings
              </a>
            </li>
            <li class="admin-nav-item admin-nav-back">
              <a href="#" class="admin-nav-link" id="back-to-site">
                <i class="fas fa-arrow-left"></i> Back to Site
              </a>
            </li>
          </ul>
        </div>
        <div class="admin-content">
          <div id="admin-dashboard-page">
            <div class="admin-header">
              <h1 class="admin-title">Dashboard</h1>
              <div class="admin-actions">
                <button class="btn btn-primary" id="refresh-admin-data" disabled>
                  <i class="fas fa-sync-alt"></i> Refresh Data
                </button>
              </div>
            </div>

            <div class="offline-notice">
              <div class="alert warning">
                <h3><i class="fas fa-wifi-slash"></i> Offline Mode</h3>
                <p>You are currently in offline mode. Limited functionality is available.</p>
                <p>Some features and data may not be accessible until you're back online.</p>
              </div>
            </div>

            <div class="stats-grid mb-4">
              <div class="stat-box">
                <i class="fas fa-users"></i>
                <div class="value">${offlineStats.totalUsers}</div>
                <div class="label">Total Users</div>
              </div>
              <div class="stat-box">
                <i class="fas fa-trophy"></i>
                <div class="value">${offlineStats.activeTournaments}</div>
                <div class="label">Active Tournaments</div>
              </div>
              <div class="stat-box">
                <i class="fas fa-coins"></i>
                <div class="value">${offlineStats.pointsDistributed}</div>
                <div class="label">Points Distributed</div>
              </div>
              <div class="stat-box">
                <i class="fas fa-user-plus"></i>
                <div class="value">${offlineStats.newUsers}</div>
                <div class="label">New Users (Today)</div>
              </div>
            </div>

            <div class="admin-quick-actions mb-4">
              <h2 class="mb-2">Quick Actions</h2>
              <div class="quick-actions-grid">
                <div class="quick-action-card" id="create-tournament">
                  <i class="fas fa-trophy"></i>
                  <span>Create Tournament</span>
                </div>
                <div class="quick-action-card" id="add-user">
                  <i class="fas fa-user-plus"></i>
                  <span>Add User</span>
                </div>
                <div class="quick-action-card" id="edit-rewards">
                  <i class="fas fa-gift"></i>
                  <span>Edit Rewards</span>
                </div>
                <div class="quick-action-card" id="site-settings">
                  <i class="fas fa-cog"></i>
                  <span>Site Settings</span>
                </div>
              </div>
            </div>

            <div class="admin-card">
              <div class="admin-card-header">
                <h2>Recent Users</h2>
                <button class="btn btn-sm btn-primary" id="view-all-users">View All</button>
              </div>
              <div class="admin-table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Join Date</th>
                      <th>Points</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="recent-users-table">
                    ${sampleUsers.map(user => `
                      <tr>
                        <td>
                          <div class="user-cell">
                            <img src="${user.photoURL}" alt="User Avatar">
                            <div>
                              <div class="user-name">${user.displayName}</div>
                              <div class="user-email">${user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>${user.joinDate.toLocaleDateString()}</td>
                        <td>${user.points}</td>
                        <td><span class="status-badge ${user.isVIP ? 'vip' : 'standard'}">${user.isVIP ? 'VIP' : 'Standard'}</span></td>
                        <td>
                          <div class="table-actions">
                            <button class="btn btn-sm btn-primary edit-user" data-user-id="${user.uid}"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-danger toggle-ban" data-user-id="${user.uid}">
                              <i class="fas fa-user-slash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="admin-card">
              <div class="admin-card-header">
                <h2>Upcoming Tournaments</h2>
                <button class="btn btn-sm btn-primary" id="view-all-tournaments">View All</button>
              </div>
              <div class="admin-table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Tournament</th>
                      <th>Start Date</th>
                      <th>Entry Fee</th>
                      <th>Prize Pool</th>
                      <th>Participants</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="tournaments-table">
                    ${sampleTournaments.map(tournament => `
                      <tr>
                        <td>${tournament.name}</td>
                        <td>${tournament.startDate.toLocaleDateString()}</td>
                        <td>${tournament.entryFee} points</td>
                        <td>${tournament.prizePool} points</td>
                        <td>${tournament.participants}/${tournament.maxParticipants}</td>
                        <td>
                          <div class="table-actions">
                            <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="${tournament.id}"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="${tournament.id}"><i class="fas fa-trash"></i></button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Setup admin panel event listeners
    setupAdminPanelEvents();

    // Add event listener for "Back to Site" button
    document.getElementById('back-to-site').addEventListener('click', (e) => {
      e.preventDefault();
      renderMainContent('home');
    });

    // Add event listeners for quick actions
    document.getElementById('create-tournament').addEventListener('click', () => {
      showAdminPage('tournaments');
      showNotification("You're offline. Tournament creation will be available when you're back online.", "info");
    });

    document.getElementById('add-user').addEventListener('click', () => {
      showAdminPage('users');
      showNotification("You're offline. User creation will be available when you're back online.", "info");
    });

    document.getElementById('edit-rewards').addEventListener('click', () => {
      showAdminPage('rewards');
      showNotification("You're offline. Reward editing will be available when you're back online.", "info");
    });

    document.getElementById('site-settings').addEventListener('click', () => {
      showAdminPage('settings');
    });
    
    // Add event listener for View All buttons
    document.getElementById('view-all-users').addEventListener('click', () => {
      showAdminPage('users');
    });
    
    document.getElementById('view-all-tournaments').addEventListener('click', () => {
      showAdminPage('tournaments');
    });
    
    // Add event listeners for action buttons
    document.querySelectorAll('.edit-user, .toggle-ban, .edit-tournament, .delete-tournament').forEach(btn => {
      btn.addEventListener('click', () => {
        showNotification("You're offline. This action will be available when you're back online.", "info");
      });
    });
    
    // Check for online status change
    window.addEventListener('online', function() {
      showNotification("You're back online! Reloading admin panel...", "success");
      // Reload the admin panel to get fresh data
      setTimeout(() => {
        renderAdminPanel();
      }, 1000);
    });
  }
  
  // Function already exposed to window object in the function definition

        this.classList.add('active');
        
        // Update channel header
        const channelName = this.getAttribute('data-channel');
        const channelIcon = this.querySelector('i').className;
        const channelHeader = document.querySelector('.chat-header h3');
        if (channelHeader) {
          channelHeader.innerHTML = `<i class="${channelIcon}"></i> ${channelName.charAt(0).toUpperCase() + channelName.slice(1)}`;
        }
        
        // In a real app, you would load messages for this channel
        // For now, we'll just show a loading message
        if (isAdmin) {
          showNotification(`Switched to ${channelName} channel`, 'info');
        }
      });
    });
    
    // Function to load community messages from Firestore
    function loadCommunityMessages() {
      const messagesContainer = document.getElementById('community-messages');
      if (messagesContainer) {
        messagesContainer.innerHTML = `
          <div class="text-center mt-4 mb-4">
            <div class="loader"></div>
            <p>Loading messages...</p>
          </div>
        `;
        
        // In a real app, you would load messages from Firestore here
        // For the demo, we'll just simulate a loading delay
        setTimeout(() => {
          // Simulate loading messages
          showNotification('Messages refreshed', 'success');
          // Restore the original messages for this demo
          renderCommunityPage();
        }, 1000);
      }
    }
  }

  function renderProfilePage() {
    const mainContent = document.getElementById('main-content');

    // Get current user
    const user = auth.currentUser;
    if (!user) return;

    // Add loading indicator while fetching data
    mainContent.innerHTML = `
      <div class="container text-center mt-4">
        <div class="loader"></div>
        <p>Loading profile...</p>
      </div>
    `;

    // Get user data from Firestore
    db.collection('users').doc(user.uid).get().then((doc) => {
      if (doc.exists) {
        const userData = doc.data();

        const joinDate = userData.joinDate ? new Date(userData.joinDate.toDate()) : new Date();
        const memberDays = Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24));
        const tournamentCount = userData.tournaments?.length || 0;

        mainContent.innerHTML = `
          <div class="container">
            <div class="profile-container">
              <div class="profile-header">
                <img src="${user.photoURL || 'https://via.placeholder.com/100'}" alt="User Avatar" class="profile-avatar">
                <div class="profile-info">
                  <h2>${userData.displayName}</h2>
                  <p><i class="far fa-calendar-alt"></i> Member since ${userData.joinDate ? new Date(userData.joinDate.toDate()).toLocaleDateString() : 'Unknown'} (${memberDays} days)</p>
                  <p>${userData.isVIP ? '<span class="vip-badge"><i class="fas fa-crown"></i> VIP Member</span>' : 'Standard Member'}</p>
                </div>
              </div>

              <div class="profile-stats">
                <div class="stat-card">
                  <div class="stat-value">${userData.points}</div>
                  <div class="stat-label">Points</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">0</div>
                  <div class="stat-label">Tournaments Won</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${tournamentCount}</div>
                  <div class="stat-label">Tournaments Joined</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${userData.rewards?.dailyLogin?.streakDays || 0}</div>
                  <div class="stat-label">Login Streak</div>
                </div>
              </div>

              <div class="profile-content">
                <div class="profile-tabs">
                  <div class="profile-tab active" data-tab="tournaments">Tournament History</div>
                  <div class="profile-tab" data-tab="achievements">Achievements</div>
                  <div class="profile-tab" data-tab="referrals">Referrals</div>
                  <div class="profile-tab" data-tab="settings">Account Settings</div>
                </div>

                <div class="profile-tab-content" id="tournaments-tab">
                  <div class="profile-section">
                    <h3 class="profile-section-title"><i class="fas fa-trophy"></i> Your Tournament History</h3>
                    ${tournamentCount > 0 ? `
                      <table class="leaderboard mb-4">
                        <thead>
                          <tr>
                            <th>Tournament</th>
                            <th>Date</th>
                            <th>Placement</th>
                            <th>Points Earned</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${userData.tournaments.map(tournament => `
                            <tr>
                              <td>Weekend Warrior Challenge</td>
                              <td>${new Date(tournament.joinDate?.toDate() || Date.now()).toLocaleDateString()}</td>
                              <td>TBD</td>
                              <td>--</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    ` : `
                      <div class="text-center mt-4 mb-4">
                        <p>You haven't joined any tournaments yet.</p>
                        <button class="btn btn-primary mt-2" id="find-tournaments-btn">Find Tournaments</button>
                      </div>
                    `}
                  </div>

                  <div class="profile-section">
                    <h3 class="profile-section-title"><i class="fas fa-medal"></i> Upcoming Tournaments</h3>
                    <div class="grid mt-3">
                      <div class="tournament-card">
                        <div class="tournament-banner">
                          <span class="tournament-status upcoming">Upcoming</span>
                        </div>
                        <img src="https://images.unsplash.com/photo-1511512578047-dfb367046420?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Tournament Image" class="tournament-image">
                        <div class="tournament-details">
                          <h3 class="tournament-title">Weekend Warrior Challenge</h3>
                          <div class="tournament-info">
                            <span class="tournament-date"><i class="far fa-calendar-alt"></i> Starts in 2 days</span>
                            <span class="tournament-players"><i class="fas fa-users"></i> 64 players</span>
                          </div>
                          <div class="tournament-game">
                            <span><i class="fas fa-gamepad"></i> Battle Royale</span>
                          </div>
                          <div class="tournament-prize">Prize: 1000 points</div>
                          <div class="tournament-entry">
                            <span class="entry-fee">Entry: 50 points</span>
                            <button class="btn btn-primary tournament-join-btn" data-tournament-id="t1" data-entry-fee="50">Join Tournament</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="profile-tab-content hidden" id="achievements-tab">
                  <div class="profile-section">
                    <h3 class="profile-section-title"><i class="fas fa-award"></i> Your Achievements</h3>
                    <div class="achievement-grid">
                      <div class="achievement-card active">
                        <div class="achievement-icon">
                          <i class="fas fa-user-plus"></i>
                        </div>
                        <div class="achievement-info">
                          <h4>New Member</h4>
                          <p>Join Tournament Hub</p>
                        </div>
                      </div>

                      <div class="achievement-card active">
                        <div class="achievement-icon">
                          <i class="fas fa-coins"></i>
                        </div>
                        <div class="achievement-info">
                          <h4>First Points</h4>
                          <p>Earn at least 100 points</p>
                        </div>
                      </div>

                      <div class="achievement-card ${userData.rewards?.dailyLogin?.streakDays >= 7 ? 'active' : ''}">
                        <div class="achievement-icon">
                          <i class="fas fa-calendar-check"></i>
                        </div>
                        <div class="achievement-info">
                          <h4>Dedicated Player</h4>
                          <p>Log in for 7 days in a row</p>
                        </div>
                      </div>

                      <div class="achievement-card ${tournamentCount > 0 ? 'active' : ''}">
                        <div class="achievement-icon">
                          <i class="fas fa-gamepad"></i>
                        </div>
                        <div class="achievement-info">
                          <h4>Tournament Participant</h4>
                          <p>Join your first tournament</p>
                        </div>
                      </div>

                      <div class="achievement-card">
                        <div class="achievement-icon">
                          <i class="fas fa-trophy"></i>
                        </div>
                        <div class="achievement-info">
                          <h4>Tournament Winner</h4>
                          <p>Win your first tournament</p>
                        </div>
                      </div>

                      <div class="achievement-card">
                        <div class="achievement-icon">
                          <i class="fas fa-crown"></i>
                        </div>
                        <div class="achievement-info">
                          <h4>VIP Status</h4>
                          <p>Become a VIP member</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="profile-tab-content hidden" id="referrals-tab">
                  <div class="profile-section">
                    <h3 class="profile-section-title"><i class="fas fa-user-plus"></i> Referrals</h3>
                    <p class="mb-3">Invite friends to join Tournament Hub and earn 100 points for each friend who signs up using your referral link.</p>

                    <div class="form-group mb-3">
                      <label class="form-label">Your Referral Link</label>
                      <div class="referral-link-container">
                        <input type="text" id="referral-link" class="form-input" value="https://tournamenthub.com/ref/${userData.displayName}" readonly>
                        <button class="btn btn-primary" id="copy-referral-link">Copy</button>
                      </div>
                    </div>

                    <div class="referral-stats">
                      <div class="referral-stat">
                        <div class="referral-stat-value">${userData.referrals?.length || 0}</div>
                        <div class="referral-stat-label">Friends Invited</div>
                      </div>

                      <div class="referral-stat">
                        <div class="referral-stat-value">${(userData.referrals?.length || 0) * 100}</div>
                        <div class="referral-stat-label">Points Earned</div>
                      </div>
                    </div>

                    <div class="social-share mt-4">
                      <p>Share your referral link:</p>
                      <div class="social-buttons">
                        <button class="btn btn-social btn-twitter"><i class="fab fa-twitter"></i> Twitter</button>
                        <button class="btn btn-social btn-facebook"><i class="fab fa-facebook-f"></i> Facebook</button>
                        <button class="btn btn-social btn-discord"><i class="fab fa-discord"></i> Discord</button>
                        <button class="btn btn-social btn-whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="profile-tab-content hidden" id="settings-tab">
                  <div class="profile-section">
                    <h3 class="profile-section-title"><i class="fas fa-user-cog"></i> Account Settings</h3>

                    <div class="form-group">
                      <label class="form-label">Display Name</label>
                      <input type="text" class="form-input" id="display-name" value="${userData.displayName}">
                    </div>

                    <div class="form-group">
                      <label class="form-label">Email</label>
                      <input type="email" class="form-input" value="${userData.email}" readonly>
                    </div>

                    <div class="form-group">
                      <label class="form-label">Profile Picture</label>
                      <div class="avatar-upload">
                        <img src="${user.photoURL || 'https://via.placeholder.com/100'}" alt="User Avatar" class="profile-avatar" style="width: 80px; height: 80px;">
                        <button class="btn btn-secondary" id="change-avatar-btn">Change Picture</button>
                      </div>
                    </div>

                    <div class="form-group">
                      <label class="form-label">Notification Settings</label>
                      <div class="checkbox-group">
                        <label class="checkbox-label">
                          <input type="checkbox" checked> Email notifications for tournaments
                        </label>
                        <label class="checkbox-label">
                          <input type="checkbox" checked> Email notifications for rewards
                        </label>
                        <label class="checkbox-label">
                          <input type="checkbox" checked> Push notifications
                        </label>
                      </div>
                    </div>

                    <button class="btn btn-primary mt-3" id="save-settings-btn">Save Changes</button>
                  </div>

                  <div class="profile-section">
                    <h3 class="profile-section-title"><i class="fas fa-shield-alt"></i> Security</h3>

                    <button class="btn btn-secondary mb-3" id="change-password-btn">Change Password</button>

                    <div class="form-group">
                      <label class="form-label">Two-Factor Authentication</label>
                      <div class="toggle-container">
                        <label class="toggle">
                          <input type="checkbox">
                          <span class="toggle-slider"></span>
                        </label>
                        <span>Disabled</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        // Setup tab switching
        const tabs = document.querySelectorAll('.profile-tab');
        if (tabs.length > 0) {
          tabs.forEach(tab => {
            tab.addEventListener('click', function() {
              const tabName = this.getAttribute('data-tab');

              // Hide all tab contents
              document.querySelectorAll('.profile-tab-content').forEach(content => {
                content.classList.add('hidden');
              });

              // Show selected tab content
              document.getElementById(`${tabName}-tab`).classList.remove('hidden');

              // Update active tab
              document.querySelectorAll('.profile-tab').forEach(t => {
                t.classList.remove('active');
              });
              this.classList.add('active');
            });
          });
        }

        // Copy referral link button
        const copyReferralBtn = document.getElementById('copy-referral-link');
        if (copyReferralBtn) {
          copyReferralBtn.addEventListener('click', function() {
            const referralLink = document.getElementById('referral-link');
            referralLink.select();
            document.execCommand('copy');
            showNotification('Referral link copied to clipboard!', 'success');
          });
        }

        // Find tournaments button
        const findTournamentsBtn = document.getElementById('find-tournaments-btn');
        if (findTournamentsBtn) {
          findTournamentsBtn.addEventListener('click', function() {
            renderMainContent('tournaments');
          });
        }

        // Save settings button
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        if (saveSettingsBtn) {
          saveSettingsBtn.addEventListener('click', function() {
            const newDisplayName = document.getElementById('display-name').value.trim();

            if (newDisplayName && newDisplayName !== userData.displayName) {
              // Update display name in Firebase Auth
              user.updateProfile({
                displayName: newDisplayName
              }).then(() => {
                // Update display name in Firestore
                db.collection('users').doc(user.uid).update({
                  displayName: newDisplayName
                }).then(() => {
                  showNotification('Profile updated successfully!', 'success');
                }).catch(error => {
                  console.error('Error updating profile in Firestore:', error);
                  showNotification('Error updating profile', 'error');
                });
              }).catch(error => {
                console.error('Error updating profile in Auth:', error);
                showNotification('Error updating profile', 'error');
              });
            } else {
              showNotification('Settings saved!', 'success');
            }
          });
        }

        // Change avatar button
        const changeAvatarBtn = document.getElementById('change-avatar-btn');
        if (changeAvatarBtn) {
          changeAvatarBtn.addEventListener('click', function() {
            showNotification('Avatar change feature coming soon!', 'info');
          });
        }

        // Change password button
        const changePasswordBtn = document.getElementById('change-password-btn');
        if (changePasswordBtn) {
          changePasswordBtn.addEventListener('click', function() {
            showNotification('Password change feature coming soon!', 'info');
          });
        }
      }
    }).catch(error => {
      console.error('Error loading user data:', error);
      mainContent.innerHTML = `
        <div class="container">
          <div class="alert error">
            <h3><i class="fas fa-exclamation-triangle"></i> Error</h3>
            <p>There was an error loading your profile data. Please try again later.</p>
            <button class="btn btn-primary mt-3" onclick="renderMainContent('home')">Return to Home</button>
          </div>
        </div>
      `;
    });
  }

  function renderAdminPanel() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) {
      console.error('Main content container not found');
      showNotification("An error occurred. Please refresh the page.", "error");
      return;
    }

    // Show loading state
    mainContent.innerHTML = `
      <div class="container text-center">
        <div class="loader"></div>
        <p>Loading admin panel...</p>
      </div>
    `;

    try {
      // Check if current user is admin
      const user = auth.currentUser;
      if (!user) {
        showNotification("Please sign in to access the admin panel", "error");
        renderAuthContent();
        return;
      }

      // Set isAdmin if email matches criteria
      const isAdmin = user.email && (
        user.email === 'Jitenadminpanelaccess@gmail.com' || 
        user.email === 'karateboyjitenderprajapat@gmail.com' || 
        user.email.endsWith('@admin.tournamenthub.com')
      );

      if (!isAdmin) {
        mainContent.innerHTML = `
          <div class="container">
            <div class="alert error">
              <h3><i class="fas fa-exclamation-triangle"></i> Access Denied</h3>
              <p>You do not have permission to access the admin panel.</p>
              <button class="btn btn-primary mt-3" id="back-to-home">Return to Home</button>
            </div>
          </div>
        `;
        document.getElementById('back-to-home').addEventListener('click', () => {
          renderMainContent('home');
        });
        return;
      }

      // Make sure db is defined before using it
      if (!db) {
        console.error("Firestore database is not initialized");
        showRetryPage(mainContent);
        return;
      }

      // Try to get minimal user data to verify connectivity
      db.collection('users').doc(user.uid).get()
        .then((doc) => {
          // Assume admin status if email matches criteria
          const isAdminUser = isAdmin || (doc.exists && doc.data() && doc.data().isAdmin);
          
          if (isAdminUser) {
            // If we've confirmed the user, set admin flag in db if not already set
            if (doc.exists && doc.data() && !doc.data().isAdmin && isAdmin) {
              try {
                db.collection('users').doc(user.uid).update({
                  isAdmin: true
                }).catch(err => {
                  console.log('Failed to update admin status, but continuing with admin privileges:', err);
                });
              } catch (err) {
                // Non-critical error, can continue
                console.log('Failed to update admin status, but continuing with admin privileges:', err);
              }
            }

            // Load stats for dashboard
            loadAdminStats()
              .then(stats => {
                // Successfully loaded, now render the admin panel with real stats
                renderAdminDashboard(user, doc.exists && doc.data() ? doc.data() : { displayName: user.displayName || user.email.split('@')[0] }, stats);
              })
              .catch(err => {
                console.error("Error loading admin stats:", err);
                // If we can't load stats but we know user is admin, still show admin panel with default data
                renderAdminDashboard(user, doc.exists && doc.data() ? doc.data() : { displayName: user.displayName || user.email.split('@')[0] }, {
                  totalUsers: "0",
                  activeTournaments: "0",
                  pointsDistributed: "0",
                  newUsers: "0",
                  recentUsers: [],
                  tournaments: []
                });
              });
          } else {
            // Not an admin
            mainContent.innerHTML = `
              <div class="container">
                <div class="alert error">
                  <h3><i class="fas fa-exclamation-triangle"></i> Access Denied</h3>
                  <p>You do not have permission to access the admin panel.</p>
                  <p>Please contact the site administrator if you believe this is an error.</p>
                  <button class="btn btn-primary mt-3" id="back-to-home">Return to Home</button>
                </div>
              </div>
            `;

            document.getElementById('back-to-home').addEventListener('click', () => {
              renderMainContent('home');
            });
          }
        })
        .catch(err => {
          console.error("Error checking admin status:", err);
          
          // If we encounter an error but know the user should be admin based on email, display retry page
          if (isAdmin) {
            showRetryPage(mainContent);
          } else {
            mainContent.innerHTML = `
              <div class="container">
                <div class="alert error">
                  <h3><i class="fas fa-exclamation-triangle"></i> Error</h3>
                  <p>There was an error loading the admin panel. Please try again later.</p>
                  <button class="btn btn-primary mt-3" id="back-to-home">Return to Home</button>
                </div>
              </div>
            `;

            document.getElementById('back-to-home').addEventListener('click', () => {
              renderMainContent('home');
            });
          }
        });
    } catch (error) {
      console.error("Error in renderAdminPanel:", error);
      mainContent.innerHTML = `
        <div class="container">
          <div class="alert error">
            <h3><i class="fas fa-exclamation-triangle"></i> Error</h3>
            <p>An unexpected error occurred. Please try again later.</p>
            <button class="btn btn-primary mt-3" id="back-to-home">Return to Home</button>
          </div>
        </div>
      `;
      document.getElementById('back-to-home').addEventListener('click', () => {
        renderMainContent('home');
      });
    }
  }
  
  // Function to show retry page
  function showRetryPage(container) {
    container.innerHTML = `
      <div class="container">
        <div class="alert warning">
          <h3><i class="fas fa-exclamation-triangle"></i> Connection Issue</h3>
          <p>Unable to connect to the database. Please check your internet connection and try again.</p>
          <button class="btn btn-primary mt-3" id="retry-btn">
            <i class="fas fa-sync-alt"></i> Retry Connection
          </button>
          <button class="btn btn-secondary mt-3 ml-2" id="back-to-home">Return to Home</button>
        </div>
      </div>
    `;
    
    document.getElementById('retry-btn').addEventListener('click', () => {
      renderAdminPanel();
    });
    
    document.getElementById('back-to-home').addEventListener('click', () => {
      renderMainContent('home');
    });
  }
  
  // Function to render the admin dashboard with data
  function renderAdminDashboard(user, userData, stats) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;
    
    mainContent.innerHTML = `
      <div class="admin-layout">
        <div class="admin-sidebar">
          <div class="admin-logo">
            <i class="fas fa-trophy"></i> Admin Panel
          </div>
          <div class="admin-user">
            <img src="${user.photoURL || `https://ui-avatars.com/api/?name=${userData.displayName || 'Admin'}&background=random&color=fff`}" alt="Admin Avatar">
            <div class="admin-user-info">
              <div class="admin-user-name">${userData.displayName || user.email}</div>
              <div class="admin-user-role">Administrator</div>
            </div>
          </div>
          <ul class="admin-nav">
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link active" data-admin-page="dashboard">
                <i class="fas fa-tachometer-alt"></i> Dashboard
              </a>
            </li>
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link" data-admin-page="users">
                <i class="fas fa-users"></i> User Management
              </a>
            </li>
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link" data-admin-page="tournaments">
                <i class="fas fa-trophy"></i> Tournament Management
              </a>
            </li>
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link" data-admin-page="rewards">
                <i class="fas fa-gift"></i> Rewards & Earnings
              </a>
            </li>
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link" data-admin-page="ads">
                <i class="fas fa-ad"></i> Ad Management
              </a>
            </li>
            <li class="admin-nav-item">
              <a href="#" class="admin-nav-link" data-admin-page="settings">
                <i class="fas fa-cog"></i> Settings
              </a>
            </li>
            <li class="admin-nav-item admin-nav-back">
              <a href="#" class="admin-nav-link" id="back-to-site">
                <i class="fas fa-arrow-left"></i> Back to Site
              </a>
            </li>
          </ul>
        </div>
        <div class="admin-content">
          <div id="admin-dashboard-page">
            <div class="admin-header">
              <h1 class="admin-title">Dashboard</h1>
              <div class="admin-actions">
                <button class="btn btn-primary" id="refresh-admin-data">
                  <i class="fas fa-sync-alt"></i> Refresh Data
                </button>
              </div>
            </div>
            
            ${!navigator.onLine ? `
            <div class="offline-notice">
              <div class="alert warning">
                <h3><i class="fas fa-wifi-slash"></i> Offline Mode</h3>
                <p>You are currently in offline mode. Limited functionality is available.</p>
                <p>Some features may not be accessible until you're back online.</p>
              </div>
            </div>
            ` : ''}

            <div class="stats-grid mb-4">
              <div class="stat-box">
                <i class="fas fa-users"></i>
                <div class="value">${stats.totalUsers}</div>
                <div class="label">Total Users</div>
              </div>
              <div class="stat-box">
                <i class="fas fa-trophy"></i>
                <div class="value">${stats.activeTournaments}</div>
                <div class="label">Active Tournaments</div>
              </div>
              <div class="stat-box">
                <i class="fas fa-coins"></i>
                <div class="value">${stats.pointsDistributed}</div>
                <div class="label">Points Distributed</div>
              </div>
              <div class="stat-box">
                <i class="fas fa-user-plus"></i>
                <div class="value">${stats.newUsers}</div>
                <div class="label">New Users (Today)</div>
              </div>
            </div>

            <div class="admin-quick-actions mb-4">
              <h2 class="mb-2">Quick Actions</h2>
              <div class="quick-actions-grid">
                <div class="quick-action-card" id="create-tournament">
                  <i class="fas fa-trophy"></i>
                  <span>Create Tournament</span>
                </div>
                <div class="quick-action-card" id="add-user">
                  <i class="fas fa-user-plus"></i>
                  <span>Add User</span>
                </div>
                <div class="quick-action-card" id="edit-rewards">
                  <i class="fas fa-gift"></i>
                  <span>Edit Rewards</span>
                </div>
                <div class="quick-action-card" id="site-settings">
                  <i class="fas fa-cog"></i>
                  <span>Site Settings</span>
                </div>
              </div>
            </div>

            <div class="admin-card">
              <div class="admin-card-header">
                <h2>Recent Users</h2>
                <button class="btn btn-sm btn-primary" id="view-all-users">View All</button>
              </div>
              <div class="admin-table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Join Date</th>
                      <th>Points</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="recent-users-table">
                    ${stats.recentUsers && stats.recentUsers.length > 0 ? 
                      stats.recentUsers.map(user => `
                        <tr>
                          <td>
                            <div class="user-cell">
                              <img src="${user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}&background=random&color=fff`}" alt="User Avatar">
                              <div>
                                <div class="user-name">${user.displayName || 'User'}</div>
                                <div class="user-email">${user.email || ''}</div>
                              </div>
                            </div>
                          </td>
                          <td>${user.joinDate ? new Date(user.joinDate.toDate ? user.joinDate.toDate() : user.joinDate).toLocaleDateString() : 'N/A'}</td>
                          <td>${user.points || 0}</td>
                          <td><span class="status-badge ${user.isVIP ? 'vip' : 'standard'}">${user.isVIP ? 'VIP' : 'Standard'}</span></td>
                          <td>
                            <div class="table-actions">
                              <button class="btn btn-sm btn-primary edit-user" data-user-id="${user.uid}"><i class="fas fa-edit"></i></button>
                              <button class="btn btn-sm ${user.isBanned ? 'btn-success' : 'btn-danger'} toggle-ban" data-user-id="${user.uid}">
                                <i class="fas ${user.isBanned ? 'fa-user-check' : 'fa-user-slash'}"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      `).join('') : 
                      '<tr><td colspan="5" class="text-center">No users found</td></tr>'
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="admin-card">
              <div class="admin-card-header">
                <h2>Upcoming Tournaments</h2>
                <button class="btn btn-sm btn-primary" id="view-all-tournaments">View All</button>
              </div>
              <div class="admin-table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Tournament</th>
                      <th>Start Date</th>
                      <th>Entry Fee</th>
                      <th>Prize Pool</th>
                      <th>Participants</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="tournaments-table">
                    ${stats.tournaments && stats.tournaments.length > 0 ? 
                      stats.tournaments.map(tournament => `
                        <tr>
                          <td>${tournament.name || 'Tournament'}</td>
                          <td>${tournament.startDate ? new Date(tournament.startDate).toLocaleDateString() : 'TBD'}</td>
                          <td>${tournament.entryFee || 0} points</td>
                          <td>${tournament.prizePool || 0} points</td>
                          <td>${tournament.participants || 0}/${tournament.maxParticipants || 100}</td>
                          <td>
                            <div class="table-actions">
                              <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="${tournament.id}"><i class="fas fa-edit"></i></button>
                              <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="${tournament.id}"><i class="fas fa-trash"></i></button>
                            </div>
                          </td>
                        </tr>
                      `).join('') :
                      '<tr><td colspan="6" class="text-center">No tournaments found</td></tr>'
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Setup admin panel event listeners
    setupAdminPanelEvents();

    // Add event listener for "Back to Site" button
    document.getElementById('back-to-site').addEventListener('click', (e) => {
      e.preventDefault();
      renderMainContent('home');
    });

    // Add event listener for "Refresh Data" button
    document.getElementById('refresh-admin-data').addEventListener('click', () => {
      if (!navigator.onLine) {
        showNotification("You're offline. Cannot refresh data at this time.", "warning");
        return;
      }
      
      // Show loading indicator on button
      const refreshBtn = document.getElementById('refresh-admin-data');
      const originalText = refreshBtn.innerHTML;
      refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
      refreshBtn.disabled = true;
      
      // Try to load fresh stats
      loadAdminStats().then(updatedStats => {
        // Update dashboard stats
        document.querySelectorAll('.stat-box .value')[0].textContent = updatedStats.totalUsers;
        document.querySelectorAll('.stat-box .value')[1].textContent = updatedStats.activeTournaments;
        document.querySelectorAll('.stat-box .value')[2].textContent = updatedStats.pointsDistributed;
        document.querySelectorAll('.stat-box .value')[3].textContent = updatedStats.newUsers;
        
        // Update tables with new data
        updateAdminTables(updatedStats);
        
        // Reset button
        refreshBtn.innerHTML = originalText;
        refreshBtn.disabled = false;
        
        showNotification("Dashboard data refreshed", "success");
      }).catch(err => {
        console.error("Error refreshing data:", err);
        // Reset button
        refreshBtn.innerHTML = originalText;
        refreshBtn.disabled = false;
        showNotification("Failed to refresh data. Please try again.", "error");
      });
    });

    // Add event listeners for quick action cards
    document.getElementById('create-tournament').addEventListener('click', () => {
      showAdminPage('tournaments');
      showTournamentCreationModal();
    });

    document.getElementById('add-user').addEventListener('click', () => {
      showAdminPage('users');
      showUserCreationModal();
    });

    document.getElementById('edit-rewards').addEventListener('click', () => {
      showAdminPage('rewards');
    });

    document.getElementById('site-settings').addEventListener('click', () => {
      showAdminPage('settings');
    });
  }
  
  // Update admin tables without full page refresh
  function updateAdminTables(stats) {
    // Update users table
    const usersTable = document.getElementById('recent-users-table');
    if (usersTable && stats.recentUsers && stats.recentUsers.length > 0) {
      usersTable.innerHTML = stats.recentUsers.map(user => `
        <tr>
          <td>
            <div class="user-cell">
              <img src="${user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}&background=random&color=fff`}" alt="User Avatar">
              <div>
                <div class="user-name">${user.displayName || 'User'}</div>
                <div class="user-email">${user.email || ''}</div>
              </div>
            </div>
          </td>
          <td>${user.joinDate ? new Date(user.joinDate.toDate ? user.joinDate.toDate() : user.joinDate).toLocaleDateString() : 'N/A'}</td>
          <td>${user.points || 0}</td>
          <td><span class="status-badge ${user.isVIP ? 'vip' : 'standard'}">${user.isVIP ? 'VIP' : 'Standard'}</span></td>
          <td>
            <div class="table-actions">
              <button class="btn btn-sm btn-primary edit-user" data-user-id="${user.uid}"><i class="fas fa-edit"></i></button>
              <button class="btn btn-sm ${user.isBanned ? 'btn-success' : 'btn-danger'} toggle-ban" data-user-id="${user.uid}">
                <i class="fas ${user.isBanned ? 'fa-user-check' : 'fa-user-slash'}"></i>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    } else if (usersTable) {
      usersTable.innerHTML = '<tr><td colspan="5" class="text-center">No users found</td></tr>';
    }
    
    // Update tournaments table
    const tournamentsTable = document.getElementById('tournaments-table');
    if (tournamentsTable && stats.tournaments && stats.tournaments.length > 0) {
      tournamentsTable.innerHTML = stats.tournaments.map(tournament => `
        <tr>
          <td>${tournament.name || 'Tournament'}</td>
          <td>${tournament.startDate ? new Date(tournament.startDate).toLocaleDateString() : 'TBD'}</td>
          <td>${tournament.entryFee || 0} points</td>
          <td>${tournament.prizePool || 0} points</td>
          <td>${tournament.participants || 0}/${tournament.maxParticipants || 100}</td>
          <td>
            <div class="table-actions">
              <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="${tournament.id}"><i class="fas fa-edit"></i></button>
              <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="${tournament.id}"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `).join('');
    } else if (tournamentsTable) {
      tournamentsTable.innerHTML = '<tr><td colspan="6" class="text-center">No tournaments found</td></tr>';
    }
    
    // Setup action button event listeners again
    setupAdminTableActionButtons();
  }
  
  function setupAdminTableActionButtons() {
    // Setup edit user buttons
    document.querySelectorAll('.edit-user').forEach(btn => {
      btn.addEventListener('click', function() {
        const userId = this.getAttribute('data-user-id');
        showUserEditModal(userId);
      });
    });
    
    // Setup toggle ban buttons
    document.querySelectorAll('.toggle-ban').forEach(btn => {
      btn.addEventListener('click', function() {
        const userId = this.getAttribute('data-user-id');
        const isBanned = this.classList.contains('btn-success');
        toggleUserBan(userId, isBanned);
      });
    });
    
    // Setup edit tournament buttons
    document.querySelectorAll('.edit-tournament').forEach(btn => {
      btn.addEventListener('click', function() {
        const tournamentId = this.getAttribute('data-tournament-id');
        showTournamentEditModal(tournamentId);
      });
    });
    
    // Setup delete tournament buttons
    document.querySelectorAll('.delete-tournament').forEach(btn => {
      btn.addEventListener('click', function() {
        const tournamentId = this.getAttribute('data-tournament-id');
        showDeleteTournamentConfirmation(tournamentId);
      });
    });
  }
  
  // Show tournament creation modal
  function showTournamentCreationModal() {
    showNotification("Tournament creation feature coming soon", "info");
  }
  
  // Show user creation modal
  function showUserCreationModal() {
    showNotification("User creation feature coming soon", "info");
  }
  
  // Show user edit modal
  function showUserEditModal(userId) {
    showNotification("User editing feature coming soon", "info");
  }
  
  // Toggle user ban status
  function toggleUserBan(userId, isBanned) {
    showNotification(`User ${isBanned ? 'unbanning' : 'banning'} feature coming soon`, "info");
  }
  
  // Show tournament edit modal
  function showTournamentEditModal(tournamentId) {
    showNotification("Tournament editing feature coming soon", "info");
  }
  
  // Show delete tournament confirmation
  function showDeleteTournamentConfirmation(tournamentId) {
    showNotification("Tournament deletion feature coming soon", "info");
  }

  // Function to load admin dashboard stats
  function loadAdminStats() {
    return new Promise((resolve, reject) => {
      // Initialize stats object with default values
      const stats = {
        totalUsers: 0,
        activeTournaments: 0,
        pointsDistributed: 0,
        newUsers: 0,
        recentUsers: [],
        tournaments: []
      };

      // Check if db is defined
      if (!db || !firebase) {
        console.log('Firebase not initialized - using default stats');
        resolve(getSampleStats());
        return;
      }

      // Check if we're offline immediately
      if (!navigator.onLine) {
        console.log('Offline mode - using default stats');
        resolve(getSampleStats());
        return;
      }

      // Try to get data from Firestore with timeout
      const timeoutPromise = new Promise((_, timeoutReject) => {
        setTimeout(() => timeoutReject(new Error('Request timed out')), 5000); // Reduced timeout for better UX
      });
      
      const fetchDataPromise = new Promise((dataResolve) => {
        try {
          // First check if we can at least access the database
          db.collection('users').limit(1).get()
            .then(() => {
              // If we can access the database, proceed with the full data fetch
              fetchFullAdminStats(stats, dataResolve);
            })
            .catch(error => {
              console.error("Error accessing database:", error);
              // Network error, use default stats
              dataResolve(getSampleStats());
            });
        } catch (error) {
          console.error("Error while trying to access database:", error);
          dataResolve(getSampleStats());
        }
      });
      
      // Race the data fetch against the timeout
      Promise.race([fetchDataPromise, timeoutPromise])
        .then(result => resolve(result))
        .catch(error => {
          console.error("Error or timeout loading admin stats:", error);
          // Return default stats on error or timeout
          resolve(getSampleStats());
        });
    });
  }
  
  // Helper function to fetch full admin stats
  function fetchFullAdminStats(stats, dataResolve) {
    db.collection('users').get()
      .then(snapshot => {
        stats.totalUsers = snapshot.size;
        let totalPoints = 0;
        let todayUsers = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Process users for recent list and stats
        const recentUsers = [];
        snapshot.forEach(doc => {
          try {
            const userData = doc.data();
            totalPoints += userData.points || 0;

            // Check if user joined today
            if (userData.joinDate && userData.joinDate.toDate() >= today) {
              todayUsers++;
            }

            // Add to recent users array (limited to 5)
            if (recentUsers.length < 5) {
              recentUsers.push({
                ...userData,
                uid: doc.id
              });
            }
          } catch (err) {
            console.log("Error processing user data:", err);
            // Continue to next user
          }
        });

        stats.pointsDistributed = totalPoints;
        stats.newUsers = todayUsers;
        stats.recentUsers = recentUsers;

        // Get tournaments
        db.collection('tournaments').get()
          .then(snapshot => {
            stats.activeTournaments = snapshot.size;

            // Process tournaments for the list
            const tournaments = [];
            snapshot.forEach(doc => {
              try {
                const tournamentData = doc.data();
                tournaments.push({
                  ...tournamentData,
                  id: doc.id
                });
              } catch (err) {
                console.log("Error processing tournament data:", err);
                // Continue to next tournament
              }
            });

            stats.tournaments = tournaments.slice(0, 5); // Limit to 5 tournaments
            dataResolve(stats);
          })
          .catch(error => {
            console.error("Error loading tournaments:", error);
            // Still resolve with partial data
            dataResolve(stats);
          });
      })
      .catch(error => {
        console.error("Error loading users:", error);
        dataResolve(getSampleStats());
      });
  }
  
  // Helper function to get sample stats for better UI experience
  function getSampleStats() {
    return {
      totalUsers: "—",
      activeTournaments: "—",
      pointsDistributed: "—",
      newUsers: "—",
      recentUsers: [
        {
          displayName: "Sample User",
          email: "user@example.com",
          photoURL: "https://ui-avatars.com/api/?name=Sample+User&background=random&color=fff",
          joinDate: firebase.firestore.Timestamp.fromDate(new Date()),
          points: 100,
          isVIP: false,
          uid: "sample1"
        },
        {
          displayName: "Admin User",
          email: "admin@tournamenthub.com",
          photoURL: "https://ui-avatars.com/api/?name=Admin+User&background=random&color=fff",
          joinDate: firebase.firestore.Timestamp.fromDate(new Date()),
          points: 1000,
          isVIP: true,
          isAdmin: true,
          uid: "admin1"
        }
      ],
      tournaments: [
        {
          name: "Weekend Warrior",
          startDate: new Date(Date.now() + 2*24*60*60*1000),
          entryFee: 50,
          prizePool: 1000,
          participants: 32,
          maxParticipants: 64,
          id: "sample-t1"
        },
        {
          name: "BGMI Champions",
          startDate: new Date(Date.now() + 5*24*60*60*1000),
          entryFee: 100,
          prizePool: 5000,
          participants: 45,
          maxParticipants: 100,
          id: "sample-t2"
        }
      ]
    };
  }

  function setupAdminPanelEvents() {
    // Admin navigation
    document.querySelectorAll('.admin-nav-link').forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();

        // Remove active class from all links
        document.querySelectorAll('.admin-nav-link').forEach(l => {
          l.classList.remove('active');
        });

        // Add active class to clicked link
        this.classList.add('active');

        // Get page to display
        const page = this.getAttribute('data-admin-page');
        showAdminPage(page);
      });
    });
  }

  function showAdminPage(page) {
    // Hide all admin pages
    ['dashboard', 'users', 'tournaments', 'rewards', 'ads', 'settings'].forEach(p => {
      const pageElement = document.getElementById(`admin-${p}-page`);
      if (pageElement) {
        pageElement.style.display = 'none';
      }
    });

    // Show selected page
    const selectedPage = document.getElementById(`admin-${page}-page`);
    if (selectedPage) {
      selectedPage.style.display = 'block';
    } else {
      // Create the page if it doesn't exist
      createAdminPage(page);
    }
  }

  function createAdminPage(page) {
    const adminContent = document.querySelector('.admin-content');
    let pageHTML = '';

    switch (page) {
      case 'users':
        pageHTML = `
          <div id="admin-users-page">
            <div class="admin-header">
              <h1 class="admin-title">User Management</h1>
              <div class="admin-actions">
                <button class="btn btn-primary">
                  <i class="fas fa-user-plus"></i> Add User
                </button>
              </div>
            </div>

            <div class="admin-card">
              <div class="admin-filters mb-3">
                <input type="text" class="form-input" placeholder="Search users..." style="width: 300px;">
                <select class="form-input ml-2">
                  <option value="all">All Users</option>
                  <option value="vip">VIP Users</option>
                  <option value="standard">Standard Users</option>
                  <option value="banned">Banned Users</option>
                </select>
              </div>

              <table class="admin-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Points</th>
                    <th>VIP Status</th>
                    <th>Join Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colspan="7" class="text-center">No users found</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        `;
        break;

      case 'tournaments':
        pageHTML = `
          <div id="admin-tournaments-page">
            <div class="admin-header">
              <h1 class="admin-title">Tournament Management</h1>
              <div class="admin-actions">
                <button class="btn btn-primary" id="create-tournament-btn">
                  <i class="fas fa-plus"></i> Create Tournament
                </button>
              </div>
            </div>

            <div class="admin-card">
              <div class="admin-filters mb-3">
                <input type="text" class="form-input" placeholder="Search tournaments..." style="width: 300px;">
                <select class="form-input ml-2">
                  <option value="all">All Tournaments</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Start Date</th>
                    <th>Game</th>
                    <th>Entry Fee</th>
                    <th>Prize Pool</th>
                    <th>Participants</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>BGMI Solo Battle</td>
                    <td>08/10/2025</td>
                    <td>BGMI</td>
                    <td>50 points</td>
                    <td>₹5,000</td>
                    <td>56/100</td>
                    <td><span class="status-badge upcoming">Upcoming</span></td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="t1">
                          <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary view-players" data-tournament-id="t1">
                          <i class="fas fa-users"></i>
                        </button>
                        <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="t1">
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Free Fire Duo Challenge</td>
                    <td>08/05/2025</td>
                    <td>Free Fire</td>
                    <td>75 points</td>
                    <td>₹3,000</td>
                    <td>48/64</td>
                    <td><span class="status-badge ongoing">Ongoing</span></td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="t2">
                          <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary view-players" data-tournament-id="t2">
                          <i class="fas fa-users"></i>
                        </button>
                        <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="t2">
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>COD Mobile Sniper War</td>
                    <td>07/28/2025</td>
                    <td>COD Mobile</td>
                    <td>100 points</td>
                    <td>₹7,500</td>
                    <td>32/32</td>
                    <td><span class="status-badge completed">Completed</span></td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="t3">
                          <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary view-players" data-tournament-id="t3">
                          <i class="fas fa-users"></i>
                        </button>
                        <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="t3">
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div class="admin-card">
              <div class="admin-card-header">
                <h2>Tournament Registration Controls</h2>
              </div>
              <div class="tournament-controls">
                <div class="control-section">
                  <h3>Registration Limits</h3>
                  <div class="control-group">
                    <label class="form-label">Max players per tournament</label>
                    <input type="number" class="form-input" value="100" min="1" max="1000">
                  </div>
                  <div class="control-group">
                    <label class="form-label">Default entry fee (points)</label>
                    <input type="number" class="form-input" value="50" min="0">
                  </div>
                </div>
                
                <div class="control-section">
                  <h3>Registration Status</h3>
                  <div class="control-group">
                    <label class="toggle-switch">
                      <input type="checkbox" checked>
                      <span class="toggle-slider"></span>
                      Allow tournament registrations
                    </label>
                  </div>
                  <div class="control-group">
                    <label class="toggle-switch">
                      <input type="checkbox" checked>
                      <span class="toggle-slider"></span>
                      Allow team registrations
                    </label>
                  </div>
                  <div class="control-group">
                    <label class="toggle-switch">
                      <input type="checkbox" checked>
                      <span class="toggle-slider"></span>
                      Auto-close registrations when full
                    </label>
                  </div>
                </div>
                
                <div class="control-section">
                  <h3>Verification Requirements</h3>
                  <div class="control-group">
                    <label class="toggle-switch">
                      <input type="checkbox" checked>
                      <span class="toggle-slider"></span>
                      Require email verification
                    </label>
                  </div>
                  <div class="control-group">
                    <label class="toggle-switch">
                      <input type="checkbox">
                      <span class="toggle-slider"></span>
                      Require mobile verification
                    </label>
                  </div>
                </div>
              </div>
              
              <div class="mt-3">
                <button class="btn btn-primary" id="save-tournament-settings">
                  <i class="fas fa-save"></i> Save Settings
                </button>
              </div>
            </div>
          </div>
        `;
        break;

      case 'rewards':
        pageHTML = `
          <div id="admin-rewards-page">
            <div class="admin-header">
              <h1 class="admin-title">Rewards & Earnings</h1>
              <div class="admin-actions">
                <button class="btn btn-primary">
                  <i class="fas fa-plus"></i> Create Reward
                </button>
              </div>
            </div>

            <div class="admin-card">
              <h2>Daily Rewards</h2>
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Reward Type</th>
                    <th>Points Value</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Daily Login</td>
                    <td>10-60 points</td>
                    <td>Active</td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-sm btn-primary">Edit</button>
                        <button class="btn btn-sm btn-danger">Disable</button>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Watch Ads</td>
                    <td>20 points</td>
                    <td>Active</td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-sm btn-primary">Edit</button>
                        <button class="btn btn-sm btn-danger">Disable</button>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Referral Bonus</td>
                    <td>100 points</td>
                    <td>Active</td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-sm btn-primary">Edit</button>
                        <button class="btn btn-sm btn-danger">Disable</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        `;
        break;
      
      case 'community':
        pageHTML = `
          <div id="admin-community-page">
            <div class="admin-header">
              <h1 class="admin-title">Community Management</h1>
              <div class="admin-actions">
                <button class="btn btn-primary" id="refresh-community-stats">
                  <i class="fas fa-sync-alt"></i> Refresh Stats
                </button>
              </div>
            </div>

            <div class="admin-card">
              <div class="admin-card-header">
                <h2>Announcement Management</h2>
              </div>
              
              <div class="announcement-form mb-4">
                <div class="form-group">
                  <label class="form-label">New Announcement</label>
                  <textarea class="form-input" id="announcement-text" rows="4" placeholder="Type your announcement here..."></textarea>
                </div>
                <div class="form-group">
                  <label class="form-label">Channel</label>
                  <select class="form-input" id="announcement-channel">
                    <option value="announcements">Announcements</option>
                    <option value="tournaments">Tournament Updates</option>
                    <option value="events">Upcoming Events</option>
                    <option value="rules">Rules & Guidelines</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="checkbox-label">
                    <input type="checkbox" id="announcement-pin"> Pin this announcement
                  </label>
                </div>
                <button class="btn btn-primary" id="post-announcement">
                  <i class="fas fa-paper-plane"></i> Post Announcement
                </button>
              </div>
              
              <div class="admin-card-header">
                <h2>Recent Announcements</h2>
              </div>
              
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Message</th>
                    <th>Date</th>
                    <th>Views</th>
                    <th>Pinned</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Announcements</td>
                    <td>Welcome to the official Tournament Hub Community!</td>
                    <td>Today, 10:30 AM</td>
                    <td>253</td>
                    <td><i class="fas fa-thumbtack text-success"></i></td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-sm btn-secondary" data-message-id="1">
                          <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" data-message-id="1">
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Tournament Updates</td>
                    <td>New Tournament Alert! The BGMI Solo Battle tournament registration is now OPEN!</td>
                    <td>Today, 09:15 AM</td>
                    <td>187</td>
                    <td><i class="fas fa-times text-secondary"></i></td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-sm btn-secondary" data-message-id="2">
                          <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" data-message-id="2">
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Announcements</td>
                    <td>Server Maintenance Notice</td>
                    <td>Yesterday, 3:45 PM</td>
                    <td>142</td>
                    <td><i class="fas fa-times text-secondary"></i></td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-sm btn-secondary" data-message-id="3">
                          <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" data-message-id="3">
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div class="admin-card">
              <div class="admin-card-header">
                <h2>Viewer Analytics</h2>
              </div>
              
              <div class="viewer-stats">
                <div class="stats-grid">
                  <div class="stat-box">
                    <i class="fas fa-users"></i>
                    <div class="value">124</div>
                    <div class="label">Current Viewers</div>
                  </div>
                  <div class="stat-box">
                    <i class="fas fa-eye"></i>
                    <div class="value">587</div>
                    <div class="label">Today's Views</div>
                  </div>
                  <div class="stat-box">
                    <i class="fas fa-chart-line"></i>
                    <div class="value">12,458</div>
                    <div class="label">Total Views</div>
                  </div>
                  <div class="stat-box">
                    <i class="fas fa-bullhorn"></i>
                    <div class="value">37</div>
                    <div class="label">Announcements</div>
                  </div>
                </div>
                
                <div class="viewer-chart-container mt-4">
                  <h3>Viewer Activity (Last 7 Days)</h3>
                  <div class="viewer-chart">
                    <div class="chart-placeholder">
                      <p>Chart visualization would appear here (not implemented in this demo)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        break;

      case 'ads':
        pageHTML = `
          <div id="admin-ads-page">
            <div class="admin-header">
              <h1 class="admin-title">Ad Management</h1>
              <div class="admin-actions">
                <button class="btn btn-primary">
                  <i class="fas fa-plus"></i> Add Ad Unit
                </button>
              </div>
            </div>

            <div class="admin-card">
              <h2>Ad Settings</h2>
              <div class="form-group">
                <label class="form-label">Google AdSense Publisher ID</label>
                <input type="text" class="form-input" placeholder="pub-xxxxxxxxxxxxxxxx">
              </div>
              <div class="form-group">
                <label class="form-label">Watch Ads & Earn Feature</label>
                <div>
                  <label>
                    <input type="radio" name="ads-earn" checked> Enabled
                  </label>
                  <label style="margin-left: 20px;">
                    <input type="radio" name="ads-earn"> Disabled
                  </label>
                </div>
              </div>
              <button class="btn btn-primary">Save Settings</button>
            </div>
          </div>
        `;
        break;

      case 'settings':
        pageHTML = `
          <div id="admin-settings-page">
            <div class="admin-header">
              <h1 class="admin-title">Website Settings</h1>
              <div class="admin-actions">
                <button class="btn btn-primary" id="save-settings-btn">
                  <i class="fas fa-save"></i> Save All Settings
                </button>
              </div>
            </div>

            <div class="admin-card">
              <h2>Basic Settings</h2>
              <div class="form-group">
                <label class="form-label">Site Name</label>
                <input type="text" class="form-input" id="site-name" value="Tournament Hub">
              </div>
              <div class="form-group">
                <label class="form-label">Site Description</label>
                <textarea class="form-input" id="site-description" rows="3">Join tournaments, earn rewards, and compete with players worldwide.</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Contact Email</label>
                <input type="email" class="form-input" id="contact-email" value="contact@tournamenthub.com">
              </div>
              <div class="form-group">
                <label class="form-label">Support Phone</label>
                <input type="text" class="form-input" id="support-phone" value="+91 9876543210">
              </div>
            </div>

            <div class="admin-card">
              <h2>Administrator Settings</h2>
              <div class="form-group">
                <label class="form-label">Admin Email</label>
                <input type="email" class="form-input" value="Jitenadminpanelaccess@gmail.com" readonly>
              </div>
              <div class="form-group">
                <label class="form-label">Change Admin Password</label>
                <input type="password" class="form-input" placeholder="Enter new password">
              </div>
              <div class="form-group">
                <label class="form-label">Secondary Admin Emails</label>
                <textarea class="form-input" rows="2" placeholder="Enter one email per line">karateboyjitenderprajapat@gmail.com</textarea>
                <small class="form-helper">These users will also have admin privileges.</small>
              </div>
              <button class="btn btn-primary" id="update-admin-settings">Update Admin Settings</button>
            </div>
            
            <div class="admin-card">
              <h2>Site Features</h2>
              <div class="feature-toggles">
                <div class="toggle-group">
                  <label class="toggle-switch">
                    <input type="checkbox" checked id="tournaments-enabled">
                    <span class="toggle-slider"></span>
                    Enable Tournaments
                  </label>
                  <p class="toggle-description">Allow users to view and join tournaments</p>
                </div>
                
                <div class="toggle-group">
                  <label class="toggle-switch">
                    <input type="checkbox" checked id="community-enabled">
                    <span class="toggle-slider"></span>
                    Enable Community
                  </label>
                  <p class="toggle-description">Show the community announcements section</p>
                </div>
                
                <div class="toggle-group">
                  <label class="toggle-switch">
                    <input type="checkbox" checked id="rewards-enabled">
                    <span class="toggle-slider"></span>
                    Enable Rewards System
                  </label>
                  <p class="toggle-description">Allow users to earn and spend points</p>
                </div>
                
                <div class="toggle-group">
                  <label class="toggle-switch">
                    <input type="checkbox" id="maintenance-mode">
                    <span class="toggle-slider"></span>
                    Maintenance Mode
                  </label>
                  <p class="toggle-description">Only admins can access the site when enabled</p>
                </div>
              </div>
            </div>
            
            <div class="admin-card">
              <h2>Authentication Settings</h2>
              <div class="feature-toggles">
                <div class="toggle-group">
                  <label class="toggle-switch">
                    <input type="checkbox" checked id="google-auth-enabled">
                    <span class="toggle-slider"></span>
                    Google Sign-in
                  </label>
                </div>
                
                <div class="toggle-group">
                  <label class="toggle-switch">
                    <input type="checkbox" checked id="email-auth-enabled">
                    <span class="toggle-slider"></span>
                    Email/Password Sign-in
                  </label>
                </div>
                
                <div class="toggle-group">
                  <label class="toggle-switch">
                    <input type="checkbox" id="guest-mode-enabled">
                    <span class="toggle-slider"></span>
                    Allow Guest Mode
                  </label>
                  <p class="toggle-description">Let users browse without signing in</p>
                </div>
              </div>
            </div>
            
            <div class="admin-actions-bottom">
              <button class="btn btn-danger" id="reset-settings">
                <i class="fas fa-undo"></i> Reset to Defaults
              </button>
              <button class="btn btn-primary" id="save-settings-btn-bottom">
                <i class="fas fa-save"></i> Save All Settings
              </button>
            </div>
          </div>
        `;
        break;

      default:
        pageHTML = `
          <div id="admin-${page}-page">
            <h1>Page Not Found</h1>
            <p>The requested admin page does not exist.</p>
          </div>
        `;
    }

    adminContent.innerHTML += pageHTML;
  }

  // Professional Authentication Modal
  function showAuthModal() {
    console.log("Show Authentication Modal");

    // Check if modal already exists and remove it to avoid conflicts
    let existingModal = document.getElementById('authModal');
    if (existingModal) {
      existingModal.remove();
    }

// Function to manually reset connection state and clear caches
function resetConnectionState() {
  showNotification("Reconnecting...", "info");
  
  // Show loading indicator on reconnect button if it exists
  const reconnectButton = document.getElementById('manual-reconnect');
  if (reconnectButton) {
    reconnectButton.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Reconnecting...';
    reconnectButton.disabled = true;
  }
  
  // Reset connection status variables
  connectionAttempts = 0;
  connectionStatus = navigator.onLine;
  
  // Clear any existing intervals
  if (window.connectivityCheckInterval) {
    clearInterval(window.connectivityCheckInterval);
  }
  
  // Multi-step recovery process:
  
  // 1. First, clear any Firebase cache that might be corrupted
  const clearCachePromise = new Promise((resolve) => {
    // This is a workaround to force cache refresh
    try {
      const cacheNames = ['firebaseLocalStorageDb', 'firestore'];
      if (window.indexedDB) {
        cacheNames.forEach(cacheName => {
          try {
            indexedDB.deleteDatabase(cacheName);
            console.log(`Attempted to clear cache: ${cacheName}`);
          } catch (e) {
            console.log(`Could not clear cache: ${cacheName}`, e);
          }
        });
      }
    } catch (e) {
      console.error("Error clearing caches:", e);
    }
    // Always resolve, even if cache clearing fails
    resolve();
  });
  
  // 2. Reset network connection
  clearCachePromise
    .then(() => {
      // Disable network first to ensure clean state
      return db.disableNetwork()
        .catch(err => {
          console.log("Error disabling network (may be already disabled):", err);
          // Continue anyway
          return Promise.resolve();
        });
    })
    .then(() => {
      // Wait a moment before re-enabling
      return new Promise(resolve => setTimeout(resolve, 1000));
    })
    .then(() => {
      // Re-enable network
      return db.enableNetwork();
    })
    .then(() => {
      console.log("Firebase network forcefully reset");
      
      // Refresh connection check
      return checkDatabaseConnectivity();
    })
    .then(isConnected => {
      // Reset reconnect button if it exists
      if (reconnectButton) {
        reconnectButton.innerHTML = '<i class="fas fa-sync-alt"></i> Reconnect';
        reconnectButton.disabled = false;
      }
      
      if (isConnected) {
        showNotification("Connection successfully restored!", "success");
        
        // Reload data if user is logged in
        if (auth.currentUser) {
          loadUserData(auth.currentUser);
          reloadCurrentPage();
        }
      } else {
        showNotification("Still having connection issues. Try refreshing the page.", "warning");
      }
      
      // Restart connectivity check interval
      window.connectivityCheckInterval = setInterval(() => {
        if (navigator.onLine && !connectionStatus) {
          checkDatabaseConnectivity();
        }
      }, 30000); // Check less frequently to reduce resource usage
    })
    .catch(err => {
      console.error("Error resetting connection:", err);
      showNotification("Failed to reset connection. Please refresh the page.", "error");
      
      // Reset reconnect button if it exists
      if (reconnectButton) {
        reconnectButton.innerHTML = '<i class="fas fa-sync-alt"></i> Reconnect';
        reconnectButton.disabled = false;
      }
    });
}

// Add a global function that can be called from console for debugging
window.resetConnection = resetConnectionState;

// Function to force cache refresh and reload
function forceRefresh() {
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        caches.delete(name);
      });
    });
  }
  
  // Clear application cache
  if (window.applicationCache) {
    window.applicationCache.swapCache();
  }
  
  // Clear session storage
  window.sessionStorage.clear();
  
  // Reload the page with cache bypass
  window.location.reload(true);
}

// Add to window for console debugging
window.forceRefresh = forceRefresh;


    // Create a new auth modal with proper display style
    const modalHTML = `
      <div id="authModal" class="auth-modal" style="display: flex;">
        <div class="auth-modal-content">
          <div class="auth-modal-header">
            <h2><i class="fas fa-trophy"></i> Tournament Hub</h2>
            <span class="auth-close">&times;</span>
          </div>
          <div class="auth-modal-body">
            <div class="auth-welcome">
              <h3>Join the Tournament Community</h3>
              <p>Sign up to participate in tournaments, earn rewards, and compete with players worldwide.</p>
            </div>
            <div class="auth-tabs">
              <button class="auth-tab-btn active" data-tab="login">Login</button>
              <button class="auth-tab-btn" data-tab="register">Register</button>
            </div>

            <div id="login-tab" class="auth-tab-content active">
              <div id="login-error" class="auth-error hidden"></div>
              <form class="auth-form" id="login-form">
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" name="email" class="form-input" placeholder="Enter your email" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Password</label>
                  <input type="password" name="password" class="form-input" placeholder="Enter your password" required>
                </div>
                <button type="submit" class="btn btn-gradient btn-block">Login</button>
              </form>

              <div class="forgot-password">
                <a href="#" id="forgot-password-link">Forgot Password?</a>
              </div>

              <div class="auth-divider">
                <span>OR</span>
              </div>

              <button id="google-signin-btn" class="btn btn-google btn-block">
                <i class="fab fa-google"></i> Continue with Google
              </button>
            </div>

            <div id="register-tab" class="auth-tab-content">
              <div id="register-error" class="auth-error hidden"></div>
              <form class="auth-form" id="register-form">
                <div class="form-group">
                  <label class="form-label">Username</label>
                  <input type="text" name="username" class="form-input" placeholder="Choose a username" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" name="email" class="form-input" placeholder="Enter your email" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Password</label>
                  <input type="password" name="password" class="form-input" placeholder="Create a password" required minlength="6">
                  <small class="form-helper">Password must be at least 6 characters</small>
                </div>
                <div class="form-group">
                  <label class="form-label">Confirm Password</label>
                  <input type="password" name="confirm-password" class="form-input" placeholder="Confirm your password" required>
                </div>
                <button type="submit" class="btn btn-gradient btn-block">Create Account</button>
              </form>

              <div class="auth-divider">
                <span>OR</span>
              </div>

              <button id="google-signup-btn" class="btn btn-google btn-block">
                <i class="fab fa-google"></i> Sign up with Google
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Create the modal element
    const modalElement = document.createElement('div');
    modalElement.innerHTML = modalHTML;
    
    // Get the first element child (the actual modal)
    const modalNode = modalElement.firstElementChild;
    
    if (!modalNode) {
      console.error('Failed to create auth modal element');
      showNotification("An error occurred. Please try again.", "error");
      return;
    }
    
    // Append the modal to the body directly
    document.body.appendChild(modalNode);

    // Get the newly created modal (after it's definitely in the DOM)
    const modal = document.getElementById('authModal');

    if (modal) {
      // Show the modal
      modal.style.display = 'flex';

      // Set up the event listeners
      setTimeout(() => {
        setupAuthModalEvents();
      }, 200); // Increased delay to ensure DOM is ready
    } else {
      console.error('Failed to create auth modal');
      showNotification("An error occurred. Please try again.", "error");
    }
  }

  function setupAuthModalEvents() {
    const modal = document.getElementById('authModal');
    if (!modal) {
      console.error('Auth modal not found in the DOM');
      console.log('Failed to create auth modal');
      showNotification("Authentication system error. Please try again.", "error");
      // Try to create modal again with longer delay
      setTimeout(() => {
        showAuthModal();
      }, 300);
      return;
    }

    // Close button functionality
    const closeButton = modal.querySelector('.auth-close');
    if (closeButton) {
      closeButton.addEventListener('click', function() {
        modal.style.display = 'none';
      });
    }

    // Close when clicking outside modal
    window.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    // Tab switching
    const tabButtons = modal.querySelectorAll('.auth-tab-btn');
    if (tabButtons && tabButtons.length > 0) {
      tabButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          // Remove active class from all tabs and contents
          modal.querySelectorAll('.auth-tab-btn').forEach(function(b) {
            b.classList.remove('active');
          });

          modal.querySelectorAll('.auth-tab-content').forEach(function(c) {
            c.classList.remove('active');
          });

          // Add active class to clicked tab
          btn.classList.add('active');

          // Show corresponding content
          const tabName = btn.getAttribute('data-tab');
          const tabContent = modal.querySelector(`#${tabName}-tab`);
          if (tabContent) {
            tabContent.classList.add('active');
          }

          // Hide any error messages when switching tabs
          const errorElements = modal.querySelectorAll('.auth-error');
          errorElements.forEach(el => el.classList.add('hidden'));
        });
      });
    }

    // Forgot password link
    const forgotPasswordLink = modal.querySelector('#forgot-password-link');
    if (forgotPasswordLink) {
      forgotPasswordLink.addEventListener('click', function(e) {
        e.preventDefault();
        const emailInput = modal.querySelector('#login-tab input[name="email"]');
        const email = emailInput ? emailInput.value.trim() : '';

        if (!email) {
          showAuthError('login', 'Please enter your email address first');
          return;
        }

        // Send password reset email
        firebase.auth().sendPasswordResetEmail(email)
          .then(() => {
            showNotification("Password reset email sent. Please check your inbox.", "info");
            modal.style.display = 'none';
          })
          .catch((error) => {
            console.error("Error sending reset email:", error);
            showAuthError('login', `Error: ${error.message}`);
          });
      });
    }

    // Form submission for email/password login
    const loginForm = modal.querySelector('#login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const emailInput = loginForm.querySelector('input[name="email"]');
        const passwordInput = loginForm.querySelector('input[name="password"]');

        if (!emailInput || !passwordInput) {
          showAuthError('login', "Email or password field not found");
          return;
        }

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
          showAuthError('login', "Please enter both email and password");
          return;
        }

        // Show loading state
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Signing in...';
        submitBtn.disabled = true;

        // Clear any previous errors
        hideAuthError('login');

        // Sign in with email and password
        signInWithEmailPassword(email, password)
          .then(() => {
            // Success is handled in the signInWithEmailPassword function
            modal.style.display = 'none';
          })
          .catch(error => {
            // Reset button
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;

            // Show error in the form
            showAuthError('login', getAuthErrorMessage(error.code));
          });
      });
    }

    // Form submission for email/password registration
    const registerForm = modal.querySelector('#register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const usernameInput = registerForm.querySelector('input[name="username"]');
        const emailInput = registerForm.querySelector('input[name="email"]');
        const passwordInput = registerForm.querySelector('input[name="password"]');
        const confirmPasswordInput = registerForm.querySelector('input[name="confirm-password"]');

        if (!usernameInput || !emailInput || !passwordInput || !confirmPasswordInput) {
          showAuthError('register', "One or more registration fields not found");
          return;
        }

        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!username || !email || !password || !confirmPassword) {
          showAuthError('register', "Please fill in all fields");
          return;
        }

        if (password !== confirmPassword) {
          showAuthError('register', "Passwords do not match!");
          return;
        }

        if (password.length < 6) {
          showAuthError('register', "Password must be at least 6 characters");
          return;
        }

        // Show loading state
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Creating account...';
        submitBtn.disabled = true;

        // Clear any previous errors
        hideAuthError('register');

        // Create user with email and password
        createUserWithEmailPassword(email, password, username)
          .then(() => {
            // Success is handled in the createUserWithEmailPassword function
            modal.style.display = 'none';
          })
          .catch(error => {
            // Reset button
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;

            // Show error in the form
            showAuthError('register', getAuthErrorMessage(error.code));
          });
      });
    }

    // Google sign in buttons
    const googleSignInBtn = modal.querySelector('#google-signin-btn');
    if (googleSignInBtn) {
      googleSignInBtn.addEventListener('click', function() {
        signInWithGoogle();
      });
    }

    const googleSignUpBtn = modal.querySelector('#google-signup-btn');
    if (googleSignUpBtn) {
      googleSignUpBtn.addEventListener('click', function() {
        signInWithGoogle();
      });
    }
  }

  // Helper functions for auth errors
  function showAuthError(tab, message) {
    const errorElement = document.getElementById(`${tab}-error`);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
    } else {
      // Fallback to notification if error element not found
      showNotification(message, "error");
    }
  }

  function hideAuthError(tab) {
    const errorElement = document.getElementById(`${tab}-error`);
    if (errorElement) {
      errorElement.classList.add('hidden');
    }
  }

  function getAuthErrorMessage(errorCode) {
    switch(errorCode) {
      case 'auth/invalid-login-credentials':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return "Invalid email or password. Please try again.";
      case 'auth/email-already-in-use':
        return "This email is already registered. Try logging in instead.";
      case 'auth/weak-password':
        return "Password is too weak. Use at least 6 characters.";
      case 'auth/invalid-email':
        return "Please enter a valid email address.";
      case 'auth/network-request-failed':
        return "Network error. Please check your connection and try again.";
      case 'auth/too-many-requests':
        return "Too many failed login attempts. Please try again later.";
      default:
        return `Authentication error: ${errorCode}`;
    }
  }

  // New function to sign in with email and password
  function signInWithEmailPassword(email, password) {
    return new Promise((resolve, reject) => {
      auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
          console.log('Email sign in successful');
          const user = userCredential.user;
          showNotification(`Welcome back, ${user.displayName || email}!`, "success");
          resolve(userCredential);
        })
        .catch((error) => {
          console.error('Email sign in error:', error);
          reject(error);
        });
    });
  }

  // New function to create user with email and password
  function createUserWithEmailPassword(email, password, displayName) {
    return new Promise((resolve, reject) => {
      auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
          console.log('Email registration successful');
          const user = userCredential.user;

          // Update profile with displayName
          return user.updateProfile({
            displayName: displayName,
            photoURL: `https://ui-avatars.com/api/?name=${displayName}&background=random&color=fff`
          }).then(() => {
            // Create user document
            createUserDocument(user);
            showNotification(`Welcome to Tournament Hub, ${displayName}!`, "success");
            resolve(userCredential);
          }).catch(error => {
            console.error('Error updating profile:', error);
            reject(error);
          });
        })
        .catch((error) => {
          console.error('Email registration error:', error);
          reject(error);
        });
    });
  }

  // Function to create admin account (if it doesn't exist)
  function createAdminAccount() {
    const adminEmail = 'karateboyjitenderprajapat@gmail.com';
    const adminPassword = 'Selfdefence2010';

    auth.createUserWithEmailAndPassword(adminEmail, adminPassword)
      .then((userCredential) => {
        const user = userCredential.user;
        console.log('Admin account created:', user.uid);
        // Additional setup for admin account, if needed
        createUserDocument(user); // Add this user to firestore and mark as admin.
      })
      .catch((error) => {
        if (error.code === 'auth/email-already-in-use') {
          console.log('Admin account already exists.');
        } else {
          console.error('Error creating admin account:', error);
        }
      });
  }
});

// Tournament Card Enhancements - Countdown Timer
function setupTournamentCountdowns() {
  const countdownElements = document.querySelectorAll('.tournament-countdown');

  if (countdownElements.length === 0) return;

  countdownElements.forEach(element => {
    const targetDate = new Date(element.getAttribute('data-date'));

    // Update the countdown every second
    const countdownInterval = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate - now;

      // If the countdown is over
      if (distance < 0) {
        clearInterval(countdownInterval);
        element.innerHTML = '<i class="fas fa-play-circle"></i> Tournament Started!';

        // Optionally update the status badge
        const card = element.closest('.tournament-card');
        if (card) {
          const statusBadge = card.querySelector('.tournament-status');
          if (statusBadge) {
            statusBadge.textContent = 'Ongoing';
            statusBadge.classList.remove('upcoming');
            statusBadge.classList.add('ongoing');
          }
        }
        return;
      }

      // Time calculations
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      // Display the result
      if (days > 0) {
        element.innerHTML = `<i class="far fa-clock"></i> Starts in: ${days}d ${hours}h ${minutes}m`;
      } else {
        element.innerHTML = `<i class="far fa-clock"></i> Starts in: ${hours}h ${minutes}m ${seconds}s`;
      }
    }, 1000);
  });
}

// Function to update participants progress bar
function updateParticipantsProgress() {
  const progressBars = document.querySelectorAll('.participants-progress');

  progressBars.forEach(progressBar => {
    const bar = progressBar.querySelector('.participants-bar');
    const current = parseInt(progressBar.getAttribute('data-current') || 0);
    const max = parseInt(progressBar.getAttribute('data-max') || 100);

    if (bar && !isNaN(current) && !isNaN(max) && max > 0) {
      const percentage = Math.min(100, (current / max) * 100);
      bar.style.width = `${percentage}%`;

      // Color coding based on fill level
      if (percentage > 80) {
        bar.style.background = 'linear-gradient(90deg, #FF9800, #F44336)';
      } else if (percentage > 50) {
        bar.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
      }
    }
  });
}

// Example function to update a tournament card with modern features
function createEnhancedTournamentCard(tournamentData) {
  const startDate = new Date(tournamentData.startDate);
  const now = new Date();
  const isUpcoming = startDate > now;
  const isOngoing = tournamentData.status === 'ongoing';

  let statusClass = isUpcoming ? 'upcoming' : (isOngoing ? 'ongoing' : 'completed');
  let statusText = isUpcoming ? 'Upcoming' : (isOngoing ? 'Ongoing' : 'Completed');

  const card = document.createElement('div');
  card.className = 'tournament-card';
  card.innerHTML = `
    <div class="tournament-banner">
      <span class="tournament-status ${statusClass}">${statusText}</span>
    </div>
    <img src="${tournamentData.image || 'https://images.unsplash.com/photo-1511512578047-dfb367046420?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80'}" 
         alt="${tournamentData.name}" class="tournament-image">
    <div class="tournament-details">
      <h3 class="tournament-title">${tournamentData.name}</h3>

      ${isUpcoming ? 
        `<div class="tournament-countdown" data-date="${startDate.toISOString()}">
           <i class="far fa-clock"></i> Loading...
         </div>` : ''
      }

      <div class="tournament-info">
        <span class="tournament-date">
          <i class="far fa-calendar-alt"></i> ${startDate.toLocaleDateString()}
        </span>
      </div>

      <div class="tournament-game">
        <i class="fas fa-gamepad"></i> ${tournamentData.game || 'Battle Royale'}
      </div>

      <div class="tournament-participants">
        <span><i class="fas fa-users"></i> ${tournamentData.participants}/${tournamentData.maxParticipants}</span>
        <div class="participants-progress" data-current="${tournamentData.participants}" data-max="${tournamentData.maxParticipants}">
          <div class="participants-bar"></div>
        </div>
      </div>

      <div class="tournament-prize">Prize: ${tournamentData.prizePool} points</div>

      <div class="tournament-entry">
        <span class="entry-fee">Entry: ${tournamentData.entryFee} points</span>
        <button class="btn btn-primary tournament-join-btn" 
                data-tournament-id="${tournamentData.id}" 
                data-entry-fee="${tournamentData.entryFee}"
                ${!isUpcoming ? 'disabled' : ''}>
          ${isUpcoming ? 'Join Tournament' : (isOngoing ? 'Ongoing' : 'Completed')}
        </button>
      </div>
    </div>
  `;

  return card;
}

// Call this function whenever tournament cards are loaded or updated on the page
document.addEventListener('DOMContentLoaded', function() {
  // Add event listener to initialize tournament enhancements when showing the tournaments page
  const tournamentLink = document.querySelector('.nav-link[data-page="tournaments"]');
  if (tournamentLink) {
    tournamentLink.addEventListener('click', function() {
      // Set a small timeout to ensure the tournament page has been rendered
      setTimeout(enhanceExistingTournamentCards, 300);
    });
  }
  
  // Initialize tournament countdowns on home page if user is already logged in
  if (firebase.auth().currentUser) {
    setTimeout(setupTournamentCountdowns, 1000);
  }
});

// Call this function to enhance existing tournament cards on the page
function enhanceExistingTournamentCards() {
  const tournamentCards = document.querySelectorAll('.tournament-card');

  tournamentCards.forEach(card => {
    // Add countdown timer for upcoming tournaments
    const statusBadge = card.querySelector('.tournament-status');
    if (statusBadge && (statusBadge.classList.contains('upcoming') || statusBadge.textContent.includes('Upcoming'))) {
      const detailsContainer = card.querySelector('.tournament-details');
      if (detailsContainer) {
        const titleElement = detailsContainer.querySelector('.tournament-title');
        if (titleElement) {
          // Create a countdown element and insert after the title
          const countdownElement = document.createElement('div');
          countdownElement.className = 'tournament-countdown';
          countdownElement.setAttribute('data-date', new Date(Date.now() + 172800000).toISOString()); // Example: 2 days from now
          countdownElement.innerHTML = '<i class="far fa-clock"></i> Loading...';

          titleElement.insertAdjacentElement('afterend', countdownElement);
        }
      }
    }

    // Add participants progress bar if not present
    const entryFeeElement = card.querySelector('.entry-fee');
    if (entryFeeElement) {
      const tournamentInfo = card.querySelector('.tournament-info');
      if (tournamentInfo) {
        const playersText = tournamentInfo.textContent;
        const playersMatch = playersText.match(/(\d+)\s+players/);

        if (playersMatch && playersMatch[1]) {
          const participants = parseInt(playersMatch[1]);
          const maxParticipants = participants * 2; // Just an example

          const participantsElement = document.createElement('div');
          participantsElement.className = 'tournament-participants';
          participantsElement.innerHTML = `
            <span><i class="fas fa-users"></i> ${participants}/${maxParticipants}</span>
            <div class="participants-progress" data-current="${participants}" data-max="${maxParticipants}">
              <div class="participants-bar"></div>
            </div>
          `;

          tournamentInfo.insertAdjacentElement('afterend', participantsElement);
        }
      }
    }
  });

  // Initialize the enhancements
  setupTournamentCountdowns();
  updateParticipantsProgress();
}

// Function to add manual reconnect widget
function showReconnectPrompt() {
  // Remove any existing reconnect prompts
  const existingPrompt = document.querySelector('.reconnect-prompt');
  if (existingPrompt) {
    existingPrompt.remove();
  }
  
  // Create reconnect prompt with improved UI
  const reconnectPrompt = document.createElement('div');
  reconnectPrompt.className = 'reconnect-prompt';
  reconnectPrompt.innerHTML = `
    <div class="reconnect-content">
      <h3><i class="fas fa-wifi-slash"></i> Connection Issue</h3>
      <p>You're currently offline. Using cached data. Some features may be limited.</p>
      <div class="reconnect-actions">
        <button id="manual-reconnect" class="btn btn-primary">
          <i class="fas fa-sync-alt"></i> Reconnect
        </button>
        <button id="continue-offline" class="btn btn-secondary">
          Continue in Offline Mode
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(reconnectPrompt);
  
  // Add event listener to reconnect button
  document.getElementById('manual-reconnect').addEventListener('click', function() {
    this.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Reconnecting...';
    this.disabled = true;
    
    // Reset connection and force reconnect
    resetConnectionState();
  });
  
  // Add event listener to continue offline button
  document.getElementById('continue-offline').addEventListener('click', function() {
    // Hide the prompt
    reconnectPrompt.remove();
    
    // Show a persistent offline indicator instead
    showConnectionStatus('error', 'Offline Mode - Using cached data');
    
    // Set up a check to automatically reconnect when online
    window.addEventListener('online', function onlineHandler() {
      // Try to reconnect automatically when back online
      resetConnectionState();
      // Remove this event listener to avoid duplicates
      window.removeEventListener('online', onlineHandler);
    });
  });
}

// Function to check database connectivity and recover if possible
function checkDatabaseConnectivity() {
  if (!db) return Promise.resolve(false);
  
  // Set a maximum timeout for the connectivity check
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Connection check timed out')), 8000);
  });
  
  const connectivityPromise = db.enableNetwork()
    .then(() => {
      // First check basic internet connectivity with multiple fallbacks
      return Promise.any([
        fetch('https://www.google.com/favicon.ico', { 
          mode: 'no-cors',
          cache: 'no-cache',
          method: 'HEAD'
        }),
        fetch('https://www.cloudflare.com/favicon.ico', { 
          mode: 'no-cors',
          cache: 'no-cache',
          method: 'HEAD'
        }),
        fetch('https://www.microsoft.com/favicon.ico', { 
          mode: 'no-cors',
          cache: 'no-cache',
          method: 'HEAD'
        })
      ])
      .then(() => {
        console.log("Internet connection available");
        // Now check Firebase connectivity
        return db.collection('users').limit(1).get()
          .then(() => {
            console.log("Firebase connection successful");
            // Connection successful - remove any reconnect prompt
            const existingPrompt = document.querySelector('.reconnect-prompt');
            if (existingPrompt) {
              existingPrompt.remove();
            }
            
            // Update connection status UI if visible
            updateConnectionStatusUI(true);
            
            // Set global connection state
            connectionStatus = true;
            return true;
          });
      });
    })
    .catch(err => {
      console.error("Connectivity check failed:", err);
      
      // Only show reconnect prompt if we're really offline
      if (!navigator.onLine) {
        showReconnectPrompt();
        updateConnectionStatusUI(false);
      } else {
        // We might be online but have a firebase-specific issue
        console.log("Browser reports online but Firebase connection failed");
      }
      
      return false;
    });
    
  // Race against timeout
  return Promise.race([connectivityPromise, timeoutPromise])
    .catch(err => {
      console.error("Connection check failed or timed out:", err);
      return false;
    });
}

// Function to update connection status UI
function updateConnectionStatusUI(isConnected) {
  // Remove any existing offline indicator
  const existingIndicator = document.querySelector('.network-status');
  if (existingIndicator) {
    if (isConnected) {
      existingIndicator.remove();
    }
    return; // Already showing the right status
  }
  
  // If we're disconnected, show the status
  if (!isConnected) {
    showConnectionStatus('error', 'You\'re currently offline. Using cached data.');
  }
}

// Function to force app back to online mode
function checkAndForceOnlineMode() {
  if (navigator.onLine) {
    db.enableNetwork()
      .then(() => {
        connectionStatus = true;
        return checkDatabaseConnectivity();
      })
      .catch(err => {
        console.error("Error forcing online mode:", err);
      });
  } else {
    showReconnectPrompt();
  }
}

// Add this function to window for debugging purposes
window.renderOfflineAdminPanel = renderOfflineAdminPanel;