// Improved admin panel functionality
document.addEventListener('DOMContentLoaded', function() {
  setupAdminPanelEvents();

  // Back to site button functionality
  const backToSiteBtn = document.getElementById('back-to-site');
  if (backToSiteBtn) {
    backToSiteBtn.addEventListener('click', function(e) {
      e.preventDefault();
      window.location.href = '/';
    });
  }

  // Check for online status to avoid unnecessary offline mode
  window.addEventListener('online', function() {
    hideOfflineNotice();
    showNotification('You are back online!', 'success');
    refreshAdminData(); // Refresh data when coming back online
  });
});

// Function to handle showing notifications - uses the global function if available
function showAdminNotification(message, type = 'info') {
  // Use global showNotification if available, or create admin specific one
  if (typeof window.showNotification === 'function') {
    window.showNotification(message, type);
    return;
  }
  
  // Create notification element if it doesn't exist
  let notification = document.querySelector('.admin-notification');

  if (!notification) {
    notification = document.createElement('div');
    notification.className = `admin-notification ${type}`;
    document.body.appendChild(notification);
  } else {
    notification.className = `admin-notification ${type}`;
  }

  notification.textContent = message;
  notification.style.display = 'block';

  // Hide after 5 seconds
  setTimeout(() => {
    notification.style.display = 'none';
  }, 5000);
}

// Alias showNotification to ensure compatibility
window.showNotification = showAdminNotification;

// Setup admin panel event listeners
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

  // Refresh data button
  const refreshBtn = document.getElementById('refresh-admin-data');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshAdminData);
  }

  // Quick action buttons
  setupQuickActionButtons();
}

function showAdminPage(page) {
  // Hide all admin pages
  const pages = document.querySelectorAll('[id^="admin-"][id$="-page"]');
  pages.forEach(p => {
    p.style.display = 'none';
  });

  // Show selected page
  const selectedPage = document.getElementById(`admin-${page}-page`);
  if (selectedPage) {
    selectedPage.style.display = 'block';
  } else {
    // If page doesn't exist, show dashboard
    const dashboard = document.getElementById('admin-dashboard-page');
    if (dashboard) dashboard.style.display = 'block';
  }
}

function setupQuickActionButtons() {
  // Add User button
  const addUserBtn = document.getElementById('add-user');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', () => {
      showAdminPage('users');
      // Implementation for adding user
    });
  }

  // Create Tournament button
  const createTournamentBtn = document.getElementById('create-tournament');
  if (createTournamentBtn) {
    createTournamentBtn.addEventListener('click', () => {
      showAdminPage('tournaments');
      // Implementation for creating tournament
    });
  }

  // Edit Rewards button
  const editRewardsBtn = document.getElementById('edit-rewards');
  if (editRewardsBtn) {
    editRewardsBtn.addEventListener('click', () => {
      showAdminPage('rewards');
      // Implementation for editing rewards
    });
  }

  // Site Settings button
  const siteSettingsBtn = document.getElementById('site-settings');
  if (siteSettingsBtn) {
    siteSettingsBtn.addEventListener('click', () => {
      showAdminPage('settings');
      // Implementation for site settings
    });
  }
}

// Function to refresh admin data
function refreshAdminData() {
  const refreshBtn = document.getElementById('refresh-admin-data');
  if (refreshBtn) {
    const originalText = refreshBtn.innerHTML;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    refreshBtn.disabled = true;

    // Simulate data loading
    setTimeout(() => {
      loadAdminDashboardData();
      refreshBtn.innerHTML = originalText;
      refreshBtn.disabled = false;
      showNotification('Data refreshed successfully!', 'success');
    }, 1000);
  }
}

// Hide offline notice if exists
function hideOfflineNotice() {
  const offlineNotice = document.querySelector('.offline-notice');
  if (offlineNotice) {
    offlineNotice.remove();
  }
}

// Load admin dashboard data
function loadAdminDashboardData() {
  // This function will load data from Firebase
  // For now, we'll use placeholder data
  document.getElementById('total-users').textContent = Math.floor(Math.random() * 1000) + 500;
  document.getElementById('active-tournaments').textContent = Math.floor(Math.random() * 20) + 5;
  document.getElementById('total-earnings').textContent = '₹' + (Math.floor(Math.random() * 50000) + 10000);
  document.getElementById('new-users').textContent = Math.floor(Math.random() * 50) + 10;

  // Load recent users
  loadRecentUsers();

  // Load recent tournaments
  loadRecentTournaments();
}

// Function to load recent users
function loadRecentUsers() {
  const usersTable = document.getElementById('recent-users-table');
  if (!usersTable) return;

  // In a real app, this would fetch from Firebase
  const sampleUsers = [
    {
      id: 'user1',
      name: 'John Doe',
      email: 'john@example.com',
      photoURL: 'https://ui-avatars.com/api/?name=John+Doe&background=random&color=fff',
      joinDate: new Date(2023, 7, 15),
      points: 1250,
      isVIP: true
    },
    {
      id: 'user2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      photoURL: 'https://ui-avatars.com/api/?name=Jane+Smith&background=random&color=fff',
      joinDate: new Date(2023, 7, 20),
      points: 890,
      isVIP: false
    },
    {
      id: 'user3',
      name: 'Mike Johnson',
      email: 'mike@example.com',
      photoURL: 'https://ui-avatars.com/api/?name=Mike+Johnson&background=random&color=fff',
      joinDate: new Date(2023, 8, 5),
      points: 2100,
      isVIP: true
    }
  ];

  let usersHTML = '';
  sampleUsers.forEach(user => {
    usersHTML += `
      <tr>
        <td>
          <div class="user-cell">
            <img src="${user.photoURL}" alt="User Avatar">
            <div>
              <div class="user-name">${user.name}</div>
              <div class="user-email">${user.email}</div>
            </div>
          </div>
        </td>
        <td>${user.joinDate.toLocaleDateString()}</td>
        <td>${user.points}</td>
        <td><span class="status-badge ${user.isVIP ? 'vip' : 'standard'}">${user.isVIP ? 'VIP' : 'Standard'}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn btn-sm btn-primary edit-user" data-user-id="${user.id}"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger toggle-ban" data-user-id="${user.id}"><i class="fas fa-user-slash"></i></button>
          </div>
        </td>
      </tr>
    `;
  });

  usersTable.innerHTML = usersHTML;
}

// Function to load recent tournaments
function loadRecentTournaments() {
  const tournamentsTable = document.getElementById('recent-tournaments-table');
  if (!tournamentsTable) return;

  // In a real app, this would fetch from Firebase
  tournamentsTable.innerHTML = `
    <tr>
      <td>BGMI Solo Battle</td>
      <td>Aug 15, 2023</td>
      <td>₹5,000</td>
      <td>64/100</td>
      <td><span class="status-badge upcoming">Upcoming</span></td>
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="t1"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="t1"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
    <tr>
      <td>Free Fire Duo Championship</td>
      <td>Aug 10, 2023</td>
      <td>₹3,000</td>
      <td>48/64</td>
      <td><span class="status-badge ongoing">Ongoing</span></td>
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="t2"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="t2"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
    <tr>
      <td>COD Mobile Championship</td>
      <td>Jul 28, 2023</td>
      <td>₹7,000</td>
      <td>128/128</td>
      <td><span class="status-badge completed">Completed</span></td>
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="t3"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="t3"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `;
}


// Admin Dashboard JavaScript functionality
//document.addEventListener('DOMContentLoaded', function() {
//  // Initialize admin panel
//  initAdminPanel();
//});

//function initAdminPanel() {
//  // Setup navigation
//  setupAdminNavigation();
//
//  // Show dashboard by default
//  showAdminPage('dashboard');
//
//  // Setup event listeners for quick actions
//  setupQuickActions();
//
//  // Setup data tables
//  setupDataTables();
//
//  // Check for connectivity issues
//  checkConnectivity();
//}

function setupAdminNavigation() {
  // Get all navigation links
  const navLinks = document.querySelectorAll('.admin-nav-link');

  // Add click event listener to each link
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();

      // Remove active class from all links
      navLinks.forEach(navLink => {
        navLink.classList.remove('active');
      });

      // Add active class to clicked link
      this.classList.add('active');

      // Get the page to show from data attribute
      const page = this.getAttribute('data-admin-page');

      // Show the selected page
      showAdminPage(page);
    });
  });

  // Setup back to site button
  const backToSiteBtn = document.getElementById('back-to-site');
  if (backToSiteBtn) {
    backToSiteBtn.addEventListener('click', function(e) {
      e.preventDefault();
      window.location.href = '/';
    });
  }
}

//function showAdminPage(pageName) {
//  // Hide all pages
//  const pages = document.querySelectorAll('[id^="admin-"][id$="-page"]');
//  pages.forEach(page => {
//    page.style.display = 'none';
//  });
//
//  // Show the requested page
//  const pageToShow = document.getElementById(`admin-${pageName}-page`);
//  if (pageToShow) {
//    pageToShow.style.display = 'block';
//  } else {
//    // If page doesn't exist, create it
//    createAdminPage(pageName);
//  }
//}

//function createAdminPage(pageName) {
//  // Create the page container
//  const pageContainer = document.createElement('div');
//  pageContainer.id = `admin-${pageName}-page`;
//
//  // Add content based on page type
//  switch(pageName) {
//    case 'users':
//      pageContainer.innerHTML = createUserManagementPage();
//      break;
//    case 'tournaments':
//      pageContainer.innerHTML = createTournamentManagementPage();
//      break;
//    case 'rewards':
//      pageContainer.innerHTML = createRewardsPage();
//      break;
//    case 'payments':
//      pageContainer.innerHTML = createPaymentsPage();
//      break;
//    case 'ads':
//      pageContainer.innerHTML = createAdsPage();
//      break;
//    case 'content':
//      pageContainer.innerHTML = createContentPage();
//      break;
//    case 'referrals':
//      pageContainer.innerHTML = createReferralsPage();
//      break;
//    case 'security':
//      pageContainer.innerHTML = createSecurityPage();
//      break;
//    case 'social':
//      pageContainer.innerHTML = createSocialPage();
//      break;
//    case 'settings':
//      pageContainer.innerHTML = createSettingsPage();
//      break;
//    default:
//      pageContainer.innerHTML = `
//        <div class="admin-header">
//          <h1 class="admin-title">${pageName.charAt(0).toUpperCase() + pageName.slice(1)}</h1>
//        </div>
//        <div class="admin-card">
//          <p>This page is under construction.</p>
//        </div>
//      `;
//  }
//
//  // Add the page to admin content
//  document.querySelector('.admin-content').appendChild(pageContainer);
//
//  // Setup event listeners for the newly created page
//  setupPageEventListeners(pageName);
//}

//function setupPageEventListeners(pageName) {
//  // Setup specific event listeners based on page type
//  switch(pageName) {
//    case 'users':
//      setupUserManagementListeners();
//      break;
//    case 'tournaments':
//      setupTournamentManagementListeners();
//      break;
//    // Add more cases as needed
//  }
//}

function setupQuickActions() {
  // Create Tournament quick action
  const createTournamentBtn = document.getElementById('create-tournament');
  if (createTournamentBtn) {
    createTournamentBtn.addEventListener('click', function() {
      showAdminPage('tournaments');
      showCreateTournamentModal();
    });
  }

  // Add User quick action
  const addUserBtn = document.getElementById('add-user');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', function() {
      showAdminPage('users');
      showAddUserModal();
    });
  }

  // Edit Rewards quick action
  const editRewardsBtn = document.getElementById('edit-rewards');
  if (editRewardsBtn) {
    editRewardsBtn.addEventListener('click', function() {
      showAdminPage('rewards');
    });
  }

  // Site Settings quick action
  const siteSettingsBtn = document.getElementById('site-settings');
  if (siteSettingsBtn) {
    siteSettingsBtn.addEventListener('click', function() {
      showAdminPage('settings');
    });
  }
}

function setupDataTables() {
  // Setup user data table
  setupUserDataTable();

  // Setup tournament data table
  setupTournamentDataTable();
}

function setupUserDataTable() {
  const userTable = document.getElementById('user-data-table');
  if (!userTable) return;

  // Add search functionality
  const userSearch = document.getElementById('user-search');
  if (userSearch) {
    userSearch.addEventListener('input', function() {
      const searchTerm = this.value.toLowerCase();
      const rows = userTable.querySelectorAll('tbody tr');

      rows.forEach(row => {
        const username = row.querySelector('.user-name').textContent.toLowerCase();
        const email = row.querySelector('.user-email').textContent.toLowerCase();

        if (username.includes(searchTerm) || email.includes(searchTerm)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }

  // Add edit user functionality
  const editBtns = userTable.querySelectorAll('.edit-user');
  editBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const userId = this.getAttribute('data-user-id');
      showEditUserModal(userId);
    });
  });

  // Add ban/unban functionality
  const banBtns = userTable.querySelectorAll('.toggle-ban');
  banBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const userId = this.getAttribute('data-user-id');
      const isBanned = this.classList.contains('btn-success');
      toggleUserBan(userId, isBanned);
    });
  });
}

function setupTournamentDataTable() {
  const tournamentTable = document.getElementById('tournament-data-table');
  if (!tournamentTable) return;

  // Add search functionality
  const tournamentSearch = document.getElementById('tournament-search');
  if (tournamentSearch) {
    tournamentSearch.addEventListener('input', function() {
      const searchTerm = this.value.toLowerCase();
      const rows = tournamentTable.querySelectorAll('tbody tr');

      rows.forEach(row => {
        const name = row.cells[0].textContent.toLowerCase();

        if (name.includes(searchTerm)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }

  // Add edit tournament functionality
  const editBtns = tournamentTable.querySelectorAll('.edit-tournament');
  editBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const tournamentId = this.getAttribute('data-tournament-id');
      showEditTournamentModal(tournamentId);
    });
  });

  // Add delete tournament functionality
  const deleteBtns = tournamentTable.querySelectorAll('.delete-tournament');
  deleteBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const tournamentId = this.getAttribute('data-tournament-id');
      showDeleteTournamentConfirmation(tournamentId);
    });
  });
}

//function checkConnectivity() {
//  // Check if we're online
//  if (!navigator.onLine) {
//    showOfflineNotice();
//  }
//
//  // Listen for online/offline events
//  window.addEventListener('online', function() {
//    hideOfflineNotice();
//    showNotification('You are back online!', 'success');
//  });
//
//  window.addEventListener('offline', function() {
//    showOfflineNotice();
//  });
//}

function showOfflineNotice() {
  // Create offline notice if it doesn't exist
  if (!document.querySelector('.offline-notice')) {
    const notice = document.createElement('div');
    notice.className = 'offline-notice';
    notice.innerHTML = `
      <div class="alert warning">
        <h3><i class="fas fa-wifi-slash"></i> Offline Mode</h3>
        <p>You are currently in offline mode. Limited functionality is available.</p>
        <p>Some features may not be accessible until you're back online.</p>
      </div>
    `;

    // Insert at the top of admin content
    const adminContent = document.querySelector('.admin-content');
    adminContent.insertBefore(notice, adminContent.firstChild);
  }
}

//function hideOfflineNotice() {
//  // Remove offline notice if it exists
//  const notice = document.querySelector('.offline-notice');
//  if (notice) {
//    notice.remove();
//  }
//}

//function showNotification(message, type = 'info') {
//  // Create notification element
//  const notification = document.createElement('div');
//  notification.className = `notification ${type}`;
//  notification.textContent = message;
//
//  // Add notification to the body
//  document.body.appendChild(notification);
//
//  // Remove notification after 3 seconds
//  setTimeout(() => {
//    notification.remove();
//  }, 3000);
//}

// Modal Functions
function showModal(title, content, onConfirm = null) {
  // Create modal container
  const modal = document.createElement('div');
  modal.className = 'admin-modal';

  // Create modal content
  modal.innerHTML = `
    <div class="admin-modal-content">
      <div class="admin-modal-header">
        <h2>${title}</h2>
        <button class="admin-modal-close">&times;</button>
      </div>
      <div class="admin-modal-body">
        ${content}
      </div>
      <div class="admin-modal-footer">
        <button class="btn btn-secondary modal-cancel">Cancel</button>
        ${onConfirm ? '<button class="btn btn-primary modal-confirm">Confirm</button>' : ''}
      </div>
    </div>
  `;

  // Add modal to the body
  document.body.appendChild(modal);

  // Setup close button
  const closeBtn = modal.querySelector('.admin-modal-close');
  closeBtn.addEventListener('click', () => {
    modal.remove();
  });

  // Setup cancel button
  const cancelBtn = modal.querySelector('.modal-cancel');
  cancelBtn.addEventListener('click', () => {
    modal.remove();
  });

  // Setup confirm button if provided
  if (onConfirm) {
    const confirmBtn = modal.querySelector('.modal-confirm');
    confirmBtn.addEventListener('click', () => {
      onConfirm();
      modal.remove();
    });
  }

  // Return modal for further customization
  return modal;
}

// User Management
function showAddUserModal() {
  const content = `
    <form id="add-user-form">
      <div class="form-group">
        <label class="form-label">Username</label>
        <input type="text" class="form-input" name="username" required>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" class="form-input" name="email" required>
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input type="password" class="form-input" name="password" required>
      </div>
      <div class="form-group">
        <label class="form-label">User Type</label>
        <select class="form-input" name="userType">
          <option value="standard">Standard</option>
          <option value="vip">VIP</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Starting Points</label>
        <input type="number" class="form-input" name="points" value="100">
      </div>
    </form>
  `;

  const modal = showModal('Add New User', content, () => {
    // Get form values
    const form = document.getElementById('add-user-form');
    const username = form.elements.username.value;
    const email = form.elements.email.value;
    const password = form.elements.password.value;
    const userType = form.elements.userType.value;
    const points = parseInt(form.elements.points.value);

    // Add user logic would go here
    console.log('Adding user:', { username, email, userType, points });

    // Show success notification
    showNotification(`User ${username} added successfully`, 'success');
  });
}

function showEditUserModal(userId) {
  // In a real app, you would fetch user data based on userId
  const userData = {
    id: userId,
    username: 'JohnDoe',
    email: 'john@example.com',
    type: 'standard',
    points: 250,
    isBanned: false
  };

  const content = `
    <form id="edit-user-form">
      <div class="form-group">
        <label class="form-label">Username</label>
        <input type="text" class="form-input" name="username" value="${userData.username}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" class="form-input" name="email" value="${userData.email}" required>
      </div>
      <div class="form-group">
        <label class="form-label">User Type</label>
        <select class="form-input" name="userType">
          <option value="standard" ${userData.type === 'standard' ? 'selected' : ''}>Standard</option>
          <option value="vip" ${userData.type === 'vip' ? 'selected' : ''}>VIP</option>
          <option value="admin" ${userData.type === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Points</label>
        <input type="number" class="form-input" name="points" value="${userData.points}">
      </div>
      <div class="form-group">
        <label class="toggle-switch">
          <input type="checkbox" name="isBanned" ${userData.isBanned ? 'checked' : ''}>
          <span class="toggle-slider"></span>
          Account Banned
        </label>
      </div>
    </form>
  `;

  const modal = showModal('Edit User', content, () => {
    // Get form values
    const form = document.getElementById('edit-user-form');
    const username = form.elements.username.value;
    const email = form.elements.email.value;
    const userType = form.elements.userType.value;
    const points = parseInt(form.elements.points.value);
    const isBanned = form.elements.isBanned.checked;

    // Update user logic would go here
    console.log('Updating user:', { id: userId, username, email, userType, points, isBanned });

    // Show success notification
    showNotification(`User ${username} updated successfully`, 'success');
  });
}

function toggleUserBan(userId, isBanned) {
  // Toggle ban status
  const action = isBanned ? 'unban' : 'ban';
  const message = `Are you sure you want to ${action} this user?`;

  showModal('Confirm Action', `<p>${message}</p>`, () => {
    // Ban/unban logic would go here
    console.log(`User ${userId} ${action}ned`);

    // Show success notification
    showNotification(`User has been ${action}ned`, 'success');

    // Update UI
    const button = document.querySelector(`.toggle-ban[data-user-id="${userId}"]`);
    if (button) {
      if (isBanned) {
        button.classList.remove('btn-success');
        button.classList.add('btn-danger');
        button.querySelector('i').className = 'fas fa-user-slash';
      } else {
        button.classList.remove('btn-danger');
        button.classList.add('btn-success');
        button.querySelector('i').className = 'fas fa-user-check';
      }
    }
  });
}

// Tournament Management
function showCreateTournamentModal() {
  const content = `
    <form id="create-tournament-form">
      <div class="form-group">
        <label class="form-label">Tournament Name</label>
        <input type="text" class="form-input" name="name" required>
      </div>
      <div class="form-group">
        <label class="form-label">Game</label>
        <select class="form-input" name="game">
          <option value="bgmi">BGMI</option>
          <option value="freefire">Free Fire</option>
          <option value="codm">Call of Duty Mobile</option>
          <option value="valorant">Valorant</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Start Date</label>
        <input type="datetime-local" class="form-input" name="startDate" required>
      </div>
      <div class="form-group">
        <label class="form-label">Entry Fee (Points)</label>
        <input type="number" class="form-input" name="entryFee" value="50" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Prize Pool (Points)</label>
        <input type="number" class="form-input" name="prizePool" value="1000" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Maximum Participants</label>
        <input type="number" class="form-input" name="maxParticipants" value="100" min="2">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-input" name="description" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Rules</label>
        <textarea class="form-input" name="rules" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label class="toggle-switch">
          <input type="checkbox" name="isVipOnly">
          <span class="toggle-slider"></span>
          VIP-Only Tournament
        </label>
      </div>
    </form>
  `;

  const modal = showModal('Create New Tournament', content, () => {
    // Get form values
    const form = document.getElementById('create-tournament-form');
    const name = form.elements.name.value;
    const game = form.elements.game.value;
    const startDate = form.elements.startDate.value;
    const entryFee = parseInt(form.elements.entryFee.value);
    const prizePool = parseInt(form.elements.prizePool.value);
    const maxParticipants = parseInt(form.elements.maxParticipants.value);
    const description = form.elements.description.value;
    const rules = form.elements.rules.value;
    const isVipOnly = form.elements.isVipOnly.checked;

    // Create tournament logic would go here
    console.log('Creating tournament:', {
      name, game, startDate, entryFee,
      prizePool, maxParticipants, description,
      rules, isVipOnly
    });

    // Show success notification
    showNotification(`Tournament "${name}" created successfully`, 'success');
  });
}

function showEditTournamentModal(tournamentId) {
  // In a real app, you would fetch tournament data based on tournamentId
  const tournamentData = {
    id: tournamentId,
    name: 'BGMI Solo Battle',
    game: 'bgmi',
    startDate: '2023-08-15T18:00',
    entryFee: 50,
    prizePool: 1000,
    maxParticipants: 100,
    description: 'Solo tournament for BGMI players',
    rules: '1. No teaming\n2. No hacks',
    isVipOnly: false
  };

  const content = `
    <form id="edit-tournament-form">
      <div class="form-group">
        <label class="form-label">Tournament Name</label>
        <input type="text" class="form-input" name="name" value="${tournamentData.name}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Game</label>
        <select class="form-input" name="game">
          <option value="bgmi" ${tournamentData.game === 'bgmi' ? 'selected' : ''}>BGMI</option>
          <option value="freefire" ${tournamentData.game === 'freefire' ? 'selected' : ''}>Free Fire</option>
          <option value="codm" ${tournamentData.game === 'codm' ? 'selected' : ''}>Call of Duty Mobile</option>
          <option value="valorant" ${tournamentData.game === 'valorant' ? 'selected' : ''}>Valorant</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Start Date</label>
        <input type="datetime-local" class="form-input" name="startDate" value="${tournamentData.startDate}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Entry Fee (Points)</label>
        <input type="number" class="form-input" name="entryFee" value="${tournamentData.entryFee}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Prize Pool (Points)</label>
        <input type="number" class="form-input" name="prizePool" value="${tournamentData.prizePool}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Maximum Participants</label>
        <input type="number" class="form-input" name="maxParticipants" value="${tournamentData.maxParticipants}" min="2">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-input" name="description" rows="3">${tournamentData.description}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Rules</label>
        <textarea class="form-input" name="rules" rows="3">${tournamentData.rules}</textarea>
      </div>
      <div class="form-group">
        <label class="toggle-switch">
          <input type="checkbox" name="isVipOnly" ${tournamentData.isVipOnly ? 'checked' : ''}>
          <span class="toggle-slider"></span>
          VIP-Only Tournament
        </label>
      </div>
    </form>
  `;

  const modal = showModal('Edit Tournament', content, () => {
    // Get form values
    const form = document.getElementById('edit-tournament-form');
    const name = form.elements.name.value;
    const game = form.elements.game.value;
    const startDate = form.elements.startDate.value;
    const entryFee = parseInt(form.elements.entryFee.value);
    const prizePool = parseInt(form.elements.prizePool.value);
    const maxParticipants = parseInt(form.elements.maxParticipants.value);
    const description = form.elements.description.value;
    const rules = form.elements.rules.value;
    const isVipOnly = form.elements.isVipOnly.checked;

    // Update tournament logic would go here
    console.log('Updating tournament:', {
      id: tournamentId, name, game, startDate,
      entryFee, prizePool, maxParticipants,
      description, rules, isVipOnly
    });

    // Show success notification
    showNotification(`Tournament "${name}" updated successfully`, 'success');
  });
}

function showDeleteTournamentConfirmation(tournamentId) {
  const message = 'Are you sure you want to delete this tournament? This action cannot be undone.';

  showModal('Delete Tournament', `<p>${message}</p>`, () => {
    // Delete tournament logic would go here
    console.log(`Tournament ${tournamentId} deleted`);

    // Show success notification
    showNotification('Tournament deleted successfully', 'success');

    // Remove tournament from list
    const row = document.querySelector(`tr[data-tournament-id="${tournamentId}"]`);
    if (row) {
      row.remove();
    }
  });
}

// Page Creation Functions
function createUserManagementPage() {
  return `
    <div class="admin-header">
      <h1 class="admin-title">User Management</h1>
      <div class="admin-actions">
        <button class="btn btn-primary" id="add-user-btn">
          <i class="fas fa-user-plus"></i> Add User
        </button>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>All Users</h2>
        <div class="admin-filters">
          <input type="text" class="form-input" id="user-search" placeholder="Search users...">
          <select class="form-input ml-2" id="user-type-filter">
            <option value="all">All Users</option>
            <option value="standard">Standard</option>
            <option value="vip">VIP</option>
            <option value="admin">Admin</option>
            <option value="banned">Banned</option>
          </select>
        </div>
      </div>

      <div class="admin-table-container">
        <table class="admin-table" id="user-data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>IP Address</th>
              <th>Registration Date</th>
              <th>Points</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr data-user-id="1">
              <td>
                <div class="user-cell">
                  <img src="https://ui-avatars.com/api/?name=John+Doe&background=random&color=fff" alt="User Avatar">
                  <div>
                    <div class="user-name">John Doe</div>
                    <div class="user-email">john@example.com</div>
                  </div>
                </div>
              </td>
              <td>john@example.com</td>
              <td>192.168.1.1</td>
              <td>2023-07-15</td>
              <td>250</td>
              <td><span class="status-badge standard">Standard</span></td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-sm btn-primary edit-user" data-user-id="1"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-sm btn-danger toggle-ban" data-user-id="1"><i class="fas fa-user-slash"></i></button>
                </div>
              </td>
            </tr>
            <tr data-user-id="2">
              <td>
                <div class="user-cell">
                  <img src="https://ui-avatars.com/api/?name=Jane+Smith&background=random&color=fff" alt="User Avatar">
                  <div>
                    <div class="user-name">Jane Smith</div>
                    <div class="user-email">jane@example.com</div>
                  </div>
                </div>
              </td>
              <td>jane@example.com</td>
              <td>192.168.1.2</td>
              <td>2023-07-20</td>
              <td>500</td>
              <td><span class="status-badge vip">VIP</span></td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-sm btn-primary edit-user" data-user-id="2"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-sm btn-danger toggle-ban" data-user-id="2"><i class="fas fa-user-slash"></i></button>
                </div>
              </td>
            </tr>
            <tr data-user-id="3">
              <td>
                <div class="user-cell">
                  <img src="https://ui-avatars.com/api/?name=Admin+User&background=random&color=fff" alt="User Avatar">
                  <div>
                    <div class="user-name">Admin User</div>
                    <div class="user-email">admin@example.com</div>
                  </div>
                </div>
              </td>
              <td>admin@example.com</td>
              <td>192.168.1.3</td>
              <td>2023-07-10</td>
              <td>1000</td>
              <td><span class="status-badge standard">Admin</span></td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-sm btn-primary edit-user" data-user-id="3"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-sm btn-secondary" disabled><i class="fas fa-user-slash"></i></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>User Security</h2>
      </div>

      <div class="tournament-controls">
        <div class="control-section">
          <h3>Registration Controls</h3>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Allow New Registrations
            </label>
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Email Verification Required
            </label>
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Block Temporary Email Providers
            </label>
          </div>
        </div>

        <div class="control-section">
          <h3>IP Security</h3>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Limit Accounts per IP
            </label>
          </div>
          <div class="control-group">
            <label class="form-label">Max Accounts per IP</label>
            <input type="number" class="form-input" value="3" min="1">
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Block VPN/Proxy Connections
            </label>
          </div>
        </div>

        <div class="control-section">
          <h3>Password Security</h3>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enforce Strong Passwords
            </label>
          </div>
          <div class="control-group">
            <label class="form-label">Min Password Length</label>
            <input type="number" class="form-input" value="8" min="6">
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox">
              <span class="toggle-slider"></span>
              Force Periodic Password Reset
            </label>
          </div>
        </div>
      </div>

      <div class="admin-actions-bottom">
        <button class="btn btn-primary" id="save-security-settings">
          <i class="fas fa-save"></i> Save Security Settings
        </button>
      </div>
    </div>
  `;
}

function createTournamentManagementPage() {
  return `
    <div class="admin-header">
      <h1 class="admin-title">Tournament Management</h1>
      <div class="admin-actions">
        <button class="btn btn-primary" id="create-tournament-btn">
          <i class="fas fa-plus"></i> Create Tournament
        </button>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>All Tournaments</h2>
        <div class="admin-filters">
          <input type="text" class="form-input" id="tournament-search" placeholder="Search tournaments...">
          <select class="form-input ml-2" id="tournament-status-filter">
            <option value="all">All Statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div class="admin-table-container">
        <table class="admin-table" id="tournament-data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Game</th>
              <th>Start Date</th>
              <th>Entry Fee</th>
              <th>Prize Pool</th>
              <th>Participants</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr data-tournament-id="1">
              <td>BGMI Solo Battle</td>
              <td>BGMI</td>
              <td>2023-08-15 18:00</td>
              <td>50 points</td>
              <td>1000 points</td>
              <td>45/100</td>
              <td><span class="status-badge upcoming">Upcoming</span></td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="1"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-sm btn-info" data-tournament-id="1"><i class="fas fa-users"></i></button>
                  <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="1"><i class="fas fa-trash"></i></button>
                </div>
              </td>
            </tr>
            <tr data-tournament-id="2">
              <td>Free Fire Duo Challenge</td>
              <td>Free Fire</td>
              <td>2023-07-28 20:00</td>
              <td>75 points</td>
              <td>3000 points</td>
              <td>32/64</td>
              <td><span class="status-badge ongoing">Ongoing</span></td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="2"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-sm btn-info" data-tournament-id="2"><i class="fas fa-users"></i></button>
                  <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="2"><i class="fas fa-trash"></i></button>
                </div>
              </td>
            </tr>
            <tr data-tournament-id="3">
              <td>COD Mobile Tournament</td>
              <td>COD Mobile</td>
              <td>2023-07-15 19:00</td>
              <td>100 points</td>
              <td>5000 points</td>
              <td>128/128</td>
              <td><span class="status-badge completed">Completed</span></td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-sm btn-primary edit-tournament" data-tournament-id="3"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-sm btn-info" data-tournament-id="3"><i class="fas fa-users"></i></button>
                  <button class="btn btn-sm btn-danger delete-tournament" data-tournament-id="3"><i class="fas fa-trash"></i></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>Tournament Settings</h2>
      </div>

      <div class="tournament-controls">
        <div class="control-section">
          <h3>Registration Settings</h3>
          <div class="control-group">
            <label class="form-label">Default Entry Fee</label>
            <input type="number" class="form-input" value="50" min="0">
          </div>
          <div class="control-group">
            <label class="form-label">Default Max Participants</label>
            <input type="number" class="form-input" value="100" min="2">
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Auto-Close Registration When Full
            </label>
          </div>
        </div>

        <div class="control-section">
          <h3>Tournament Rules</h3>
          <div class="control-group">
            <label class="form-label">Default Rules Template</label>
            <textarea class="form-input" rows="4">1. No teaming allowed.
2. Cheating will result in permanent ban.
3. Be on time for your matches.
4. Admin decisions are final.</textarea>
          </div>
        </div>

        <div class="control-section">
          <h3>Auto-Cancel Settings</h3>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Auto-Cancel If Minimum Players Not Met
            </label>
          </div>
          <div class="control-group">
            <label class="form-label">Minimum Players Percentage</label>
            <input type="number" class="form-input" value="50" min="1" max="100">
          </div>
        </div>
      </div>

      <div class="admin-actions-bottom">
        <button class="btn btn-primary" id="save-tournament-settings">
          <i class="fas fa-save"></i> Save Tournament Settings
        </button>
      </div>
    </div>
  `;
}

function createRewardsPage() {
  return `
    <div class="admin-header">
      <h1 class="admin-title">Points & Rewards System</h1>
      <div class="admin-actions">
        <button class="btn btn-primary" id="create-reward-btn">
          <i class="fas fa-plus"></i> Create Reward
        </button>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>Reward Settings</h2>
      </div>

      <div class="tournament-controls">
        <div class="control-section">
          <h3>Daily Login Rewards</h3>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable Daily Login Rewards
            </label>
          </div>
          <div class="control-group">
            <label class="form-label">Base Points</label>
            <input type="number" class="form-input" value="10" min="0">
          </div>
          <div class="control-group">
            <label class="form-label">Streak Bonus (per day)</label>
            <input type="number" class="form-input" value="5" min="0">
          </div>
          <div class="control-group">
            <label class="form-label">Maximum Daily Bonus</label>
            <input type="number" class="form-input" value="60" min="0">
          </div>
        </div>

        <div class="control-section">
          <h3>Ad Watch Rewards</h3>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable Ad Watch Rewards
            </label>
          </div>
          <div class="control-group">
            <label class="form-label">Points Per Ad</label>
            <input type="number" class="form-input" value="20" min="0">
          </div>
          <div class="control-group">
            <label class="form-label">Daily Ad Limit</label>
            <input type="number" class="form-input" value="3" min="1">
          </div>
        </div>

        <div class="control-section">
          <h3>Referral Rewards</h3>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable Referral Program
            </label>
          </div>
          <div class="control-group">
            <label class="form-label">Points Per Referral</label>
            <input type="number" class="form-input" value="100" min="0">
          </div>
          <div class="control-group">
            <label class="form-label">Referee Bonus Points</label>
            <input type="number" class="form-input" value="50" min="0">
          </div>
        </div>
      </div>

      <div class="admin-actions-bottom">
        <button class="btn btn-primary" id="save-reward-settings">
          <i class="fas fa-save"></i> Save Reward Settings
        </button>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>Manual Points Adjustment</h2>
      </div>

      <div class="form-group">
        <label class="form-label">User</label>
        <input type="text" class="form-input" id="user-search-points" placeholder="Search for user...">
      </div>

      <div class="form-group">
        <label class="form-label">Action</label>
        <select class="form-input" id="points-action">
          <option value="add">Add Points</option>
          <option value="remove">Remove Points</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Amount</label>
        <input type="number" class="form-input" id="points-amount" value="100" min="1">
      </div>

      <div class="form-group">
        <label class="form-label">Reason</label>
        <input type="text" class="form-input" id="points-reason" placeholder="Reason for adjustment">
      </div>

      <div class="form-group">
        <button class="btn btn-primary" id="adjust-points-btn">
          <i class="fas fa-coins"></i> Adjust Points
        </button>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>Recent Points Transactions</h2>
      </div>

      <div class="admin-table-container">
        <table class="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Date</th>
              <th>Action</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div class="user-cell">
                  <img src="https://ui-avatars.com/api/?name=John+Doe&background=random&color=fff" alt="User Avatar">
                  <div>
                    <div class="user-name">John Doe</div>
                  </div>
                </div>
              </td>
              <td>2023-08-01 14:30</td>
              <td><span class="status-badge success">Added</span></td>
              <td>+100</td>
              <td>Tournament prize</td>
              <td>Admin User</td>
            </tr>
            <tr>
              <td>
                <div class="user-cell">
                  <img src="https://ui-avatars.com/api/?name=Jane+Smith&background=random&color=fff" alt="User Avatar">
                  <div>
                    <div class="user-name">Jane Smith</div>
                  </div>
                </div>
              </td>
              <td>2023-07-30 10:15</td>
              <td><span class="status-badge error">Removed</span></td>
              <td>-50</td>
              <td>Tournament entry fee</td>
              <td>System</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function createSettingsPage() {
  return `
    <div class="admin-header">
      <h1 class="admin-title">System Settings</h1>
      <div class="admin-actions">
        <button class="btn btn-primary" id="save-all-settings-btn">
          <i class="fas fa-save"></i> Save All Settings
        </button>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>Website Settings</h2>
      </div>

      <div class="form-group">
        <label class="form-label">Website Name</label>
        <input type="text" class="form-input" id="site-name" value="Tournament Hub">
      </div>

      <div class="form-group">
        <label class="form-label">Website Description</label>
        <textarea class="form-input" id="site-description" rows="2">Join tournaments, earn rewards, and compete with players worldwide.</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Contact Email</label>
        <input type="email" class="form-input" id="contact-email" value="contact@tournamenthub.com">
      </div>

      <div class="form-group">
        <label class="form-label">Logo</label>
        <div class="file-upload">
          <input type="file" id="logo-upload" accept="image/*">
          <label for="logo-upload" class="btn btn-secondary">Choose File</label>
          <span class="file-name">No file chosen</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Favicon</label>
        <div class="file-upload">
          <input type="file" id="favicon-upload" accept="image/*">
          <label for="favicon-upload" class="btn btn-secondary">Choose File</label>
          <span class="file-name">No file chosen</span>
        </div>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>Social Media Settings</h2>
      </div>

      <div class="form-group">
        <label class="form-label">Facebook Page URL</label>
        <input type="text" class="form-input" value="https://facebook.com/tournamenthub">
      </div>

      <div class="form-group">
        <label class="form-label">Twitter Handle</label>
        <input type="text" class="form-input" value="@tournamenthub">
      </div>

      <div class="form-group">
        <label class="form-label">Instagram Handle</label>
        <input type="text" class="form-input" value="@tournamenthub">
      </div>

      <div class="form-group">
        <label class="form-label">Discord Server Invite</label>
        <input type="text" class="form-input" value="https://discord.gg/tournamenthub">
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>Feature Toggles</h2>
      </div>

      <div class="tournament-controls">
        <div class="control-section">
          <h3>Core Features</h3>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable Tournaments
            </label>
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable Rewards System
            </label>
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable Community
            </label>
          </div>
        </div>

        <div class="control-section">
          <h3>Monetization</h3>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable VIP Memberships
            </label>
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable Advertisements
            </label>
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable Referral Program
            </label>
          </div>
        </div>

        <div class="control-section">
          <h3>System</h3>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable User Registration
            </label>
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox">
              <span class="toggle-slider"></span>
              Maintenance Mode
            </label>
          </div>
          <div class="control-group">
            <label class="toggle-switch">
              <input type="checkbox" checked>
              <span class="toggle-slider"></span>
              Enable Notifications
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header">
        <h2>Administrator Account</h2>
      </div>

      <div class="form-group">
        <label class="form-label">Current Email</label>
        <input type="email" class="form-input" value="admin@tournamenthub.com" readonly>
      </div>

      <div class="form-group">
        <label class="form-label">New Password</label>
        <input type="password" class="form-input" placeholder="Enter new password">
      </div>

      <div class="form-group">
        <label class="form-label">Confirm Password</label>
        <input type="password" class="form-input" placeholder="Confirm new password">
      </div>

      <div class="form-group">
        <button class="btn btn-primary" id="change-password-btn">
          <i class="fas fa-key"></i> Change Password
        </button>
      </div>
    </div>
  `;
}