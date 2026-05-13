import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.18.5/package/xlsx.mjs";

const firebaseConfig = {
  apiKey: "AIzaSyAWnUyookTnBefjgoOZu6Lk3Fd-Fo_sZbo",
  authDomain: "rcmu-db.firebaseapp.com",
  projectId: "rcmu-db",
  storageBucket: "rcmu-db.firebasestorage.app",
  messagingSenderId: "1043134894673",
  appId: "1:1043134894673:web:dbd89dd271749cea6fde70",
  measurementId: "G-H9WBBXZ4GV"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let students = [];
let viewMode = "cards";
let searchQuery = "";
let sortOption = "fullname";

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────

function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem("rcmu_admin");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function requireAuth(allowedRoles = []) {
  const user = getCurrentUser();
  if (!user) { window.location.href = "login.html"; return null; }
  if (allowedRoles.length && !allowedRoles.includes(user.ADM_role)) {
    if (user.ADM_role === "viewer") window.location.href = "index.html";
    else if (user.ADM_role === "editor") window.location.href = "add.html";
    else window.location.href = "admin.html";
    return null;
  }
  return user;
}

window.doLogout = function () {
  sessionStorage.removeItem("rcmu_admin");
  window.location.href = "login.html";
};

// ── UI HELPERS ────────────────────────────────────────────────────────────────

function showMessage(id, text, color = "#86efac") {
  const element = document.getElementById(id);
  if (!element) return;
  element.innerText = text;
  element.style.color = color;
  element.style.opacity = "0";
  element.style.transform = "translateY(6px)";
  requestAnimationFrame(() => {
    element.style.transition = "opacity 0.3s, transform 0.3s";
    element.style.opacity = "1";
    element.style.transform = "translateY(0)";
  });
}

function updateHeaderUser() {
  const user = getCurrentUser();
  const userBadge = document.getElementById("currentUser");
  if (!userBadge) return;
  if (!user) { userBadge.textContent = ""; return; }
  const roleColors = { admin: "#f59e0b", editor: "#3b82f6", viewer: "#10b981" };
  const roleIcons  = { admin: "⚡", editor: "✏️", viewer: "👁" };
  const color = roleColors[user.ADM_role] || "#64748b";
  const icon  = roleIcons[user.ADM_role] || "";
  userBadge.innerHTML = `
    <span class="user-avatar">${user.ADM_name.charAt(0).toUpperCase()}</span>
    <span>${user.ADM_Uname}</span>
    <span class="role-tag" style="background:${color}22;color:${color};border-color:${color}44">${icon} ${user.ADM_role}</span>
  `;
}

function getRoleSubcategories(index) {
  const subContainer = document.getElementById(`roleSub${index}`);
  if (!subContainer) return [];
  return Array.from(subContainer.querySelectorAll('input[type="checkbox"]:checked'))
    .map(input => input.value.trim())
    .filter(Boolean);
}

function isAnnouncerRoleValue(value) {
  return value === 'Sinhala Announcer' || value === 'English Announcer' || value === 'English Announce';
}

function buildRoleText(index) {
  const field = document.getElementById(`roleField${index}`);
  if (!field?.value.trim()) return "";
  const roleValue = field.value.trim();
  const selectedSubs = getRoleSubcategories(index);

  let roleDisplay = roleValue;
  if (isAnnouncerRoleValue(roleValue)) {
    const catEl = document.getElementById(`roleCategory${index}`);
    const cat = catEl?.value || "";
    if (cat) roleDisplay += ` (${cat})`;
  }

  return selectedSubs.length ? `${roleDisplay} - ${selectedSubs.join(", ")}` : roleDisplay;
}

function parseSearchFilter(value) {
  const n = value.toString().trim().toLowerCase();
  if (n.startsWith("grade "))      return { type: "grade",      value: n.slice(6).trim() };
  if (n.startsWith("department ")) return { type: "department", value: n.slice(11).trim() };

  // "sinhala announcer A"  or  "english announcer B"
  const annMatch = n.match(/^(sinhala announcer|english announcer)\s+([abc])$/);
  if (annMatch) return { type: "announcer_cat", role: annMatch[1], cat: annMatch[2].toUpperCase() };

  // "sinhala announcer" alone → filter all sinhala announcers regardless of category
  if (n === "sinhala announcer") return { type: "announcer_role", role: "sinhala announcer" };
  if (n === "english announcer") return { type: "announcer_role", role: "english announcer" };

  return null;
}

function getAdminUsers() {
  return Array.isArray(window.manualAdmins) ? window.manualAdmins : [];
}

function saveAdminUsers() {
  if (typeof window.saveManualAdmins === "function") window.saveManualAdmins();
}

// ── STUDENT DETAIL POPUP ──────────────────────────────────────────────────────

function dutyRingSvg(duty) {
  if (duty == null || isNaN(duty)) return `<div class="popup-duty-ring-empty">—</div>`;
  const r = 28, cx = 34, cy = 34, stroke = 6;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, duty)) / 100);
  const col = duty >= 75 ? "#10b981" : duty >= 40 ? "#3b82f6" : "#f59e0b";
  return `
    <div class="popup-duty-ring" title="${duty}% duty completion">
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${stroke}"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}"
          stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
          style="transition:stroke-dashoffset 0.8s cubic-bezier(.22,1,.36,1)"/>
        <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="${col}" font-size="12" font-weight="800" font-family="DM Sans,sans-serif">${duty}%</text>
        <text x="${cx}" y="${cy + 17}" text-anchor="middle" fill="rgba(148,163,184,0.7)" font-size="7" font-weight="600" font-family="DM Sans,sans-serif" letter-spacing="0.08em">DUTY</text>
      </svg>
    </div>`;
}

function popupSectionHead(icon, label) {
  return `<div class="popup-section-head"><span class="popup-section-icon">${icon}</span><span>${label}</span></div>`;
}

function popupInfoChip(label, value, accent = false) {
  return `
    <div class="popup-chip${accent ? " popup-chip-accent" : ""}">
      <span class="popup-chip-label">${label}</span>
      <span class="popup-chip-val">${value || "—"}</span>
    </div>`;
}

function openStudentPopup(s) {
  const existing = document.getElementById("studentPopup");
  if (existing) existing.remove();
  window.currentStudentDoc = s;

  const user        = getCurrentUser();
  const canEditDuty         = ["admin","editor"].includes(user?.ADM_role);
  const canEditAchievements = canEditDuty;
  const isAdmin             = user?.ADM_role === "admin";

  const initials   = (s.fullname || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const avatarGrad = getAvatarGradient(s.fullname);
  const deptMeta   = getDeptMeta(s.department);
  const expMeta    = getExpMeta(s.experienceLevel);
  const statusClass = s.status?.toLowerCase() === "active" ? "status-active" : "status-inactive";
  const duty       = s.dutyPercentage != null ? Number(s.dutyPercentage) : null;

  const overlay = document.createElement("div");
  overlay.id = "studentPopup";
  overlay.className = "popup-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  overlay.innerHTML = `
    <div class="popup-card popup-card-rich" id="popupCard">

      <!-- ── HERO ── -->
      <div class="popup-hero" style="background:${avatarGrad}">
        <div class="popup-hero-overlay"></div>
        <button class="popup-close" id="popupCloseBtn" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M1 1l16 16M17 1L1 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        </button>

        <div class="popup-hero-body">
          <div class="popup-hero-avatar-wrap">
            ${s.profileImageUrl
              ? `<img src="${s.profileImageUrl}" class="popup-hero-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="">
                 <div class="popup-hero-avatar" style="display:none">${initials}</div>`
              : `<div class="popup-hero-avatar">${initials}</div>`
            }
            <span class="popup-hero-status-dot ${statusClass === "status-active" ? "dot-active" : "dot-inactive"}" title="${s.status}"></span>
          </div>

          <div class="popup-hero-info">
            <h2 class="popup-hero-name">${s.fullname}</h2>
            ${s.nickname ? `<p class="popup-hero-nick">"${s.nickname}"</p>` : ""}
            <div class="popup-hero-tags">
              <span class="status-badge ${statusClass}">${s.status || "Unknown"}</span>
              ${s.experienceLevel ? `<span class="popup-exp-tag" style="color:${expMeta.color};background:${expMeta.bg}">${s.experienceLevel}</span>` : ""}
              ${s.department ? `<span class="popup-dept-tag" style="color:${deptMeta.color};background:${deptMeta.bg}">${deptMeta.icon} ${s.department}</span>` : ""}
            </div>
          </div>

          ${duty !== null ? dutyRingSvg(duty) : ""}
        </div>
      </div>

      <!-- ── BODY ── -->
      <div class="popup-body">

        <!-- Academic -->
        <div class="popup-section">
          ${popupSectionHead("📋", "Academic Info")}
          <div class="popup-chip-row">
            ${popupInfoChip("Student ID", s.studentId, true)}
            ${popupInfoChip("Grade", s.grade)}
            ${popupInfoChip("Class", s.studentClass)}
            ${popupInfoChip("Joined", s.joinedYear)}
            ${popupInfoChip("Age Cat.", s.experienceLevel)}
          </div>
        </div>

        <!-- Role & Dept -->
        <div class="popup-section">
          ${popupSectionHead("🎭", "Role & Department")}
          <div class="popup-role-display">
            ${formatRoleHtml(s.role)}
          </div>
          ${s.department ? `
          <div class="popup-dept-row">
            <span class="popup-dept-full" style="color:${deptMeta.color};border-color:${deptMeta.color}33;background:${deptMeta.bg}">
              ${deptMeta.icon} ${s.department} Department
            </span>
          </div>` : ""}
        </div>

        <!-- Contact -->
        <div class="popup-section">
          ${popupSectionHead("📞", "Contact")}
          <div class="popup-contact-grid">
            ${s.email    ? `<a class="popup-contact-item" href="mailto:${s.email}"><span class="pci-icon">✉</span><span class="pci-val">${s.email}</span></a>` : ""}
            ${s.phone    ? `<a class="popup-contact-item" href="tel:${s.phone}"><span class="pci-icon">📞</span><span class="pci-val">${s.phone}</span></a>` : ""}
            ${s.whatsapp ? `<a class="popup-contact-item" href="https://wa.me/${s.whatsapp.replace(/\D/g,"")}" target="_blank"><span class="pci-icon">💬</span><span class="pci-val">${s.whatsapp}</span></a>` : ""}
            ${s.birthday ? `<div class="popup-contact-item"><span class="pci-icon">🎂</span><span class="pci-val">${s.birthday}</span></div>` : ""}
            ${s.address  ? `<div class="popup-contact-item popup-contact-full"><span class="pci-icon">📍</span><span class="pci-val">${s.address}</span></div>` : ""}
          </div>
        </div>

        <!-- Duty -->
        <div class="popup-section">
          ${popupSectionHead("📊", "Duty Performance")}
          ${duty !== null ? `
          <div class="popup-duty-section">
            <div class="popup-duty-bar-wrap">
              <div class="popup-duty-bigbar">
                <div class="popup-duty-bigfill" style="width:${duty}%;background:${duty>=75?"#10b981":duty>=40?"#3b82f6":"#f59e0b"}"></div>
              </div>
              <div class="popup-duty-bignum" style="color:${duty>=75?"#10b981":duty>=40?"#3b82f6":"#f59e0b"}">${duty}%</div>
            </div>
            <p class="popup-duty-note">${duty >= 75 ? "✅ Excellent performance" : duty >= 40 ? "🔵 Moderate performance" : "⚠️ Needs improvement"}</p>
          </div>` : `<p class="popup-empty-note">No duty data recorded yet.</p>`}
          ${getDutyActivitiesHtml(s, isAdmin)}
        </div>

        <!-- Achievements -->
        <div class="popup-section">
          ${popupSectionHead("🏆", "Achievements")}
          ${getAchievementsHtml(s, isAdmin)}
        </div>

        <!-- Admin Actions -->
        ${(isAdmin || canEditDuty || canEditAchievements) ? `
        <div class="popup-section popup-actions-section">
          ${popupSectionHead("⚙️", "Actions")}
          <div class="popup-action-grid">
            ${isAdmin        ? `<button class="pab pab-primary"   onclick="openStudentEditor()">     <span>🖊</span> Edit Details</button>`          : ""}
            ${canEditDuty    ? `<button class="pab pab-blue"      onclick="openDutyEditor()">        <span>📊</span> Update Duty</button>`            : ""}
            ${canEditAchievements ? `<button class="pab pab-gold" onclick="openAchievementEditor()"><span>🏆</span> Add Achievement</button>`        : ""}
            ${isAdmin        ? `<button class="pab pab-muted"     onclick="deleteSelectedHistory()"> <span>🗑</span> Delete Selected</button>`       : ""}
            ${isAdmin        ? `<button class="pab pab-danger"    onclick="clearStudentHistory('${s._docId}')"><span>⚠</span> Clear History</button>` : ""}
            ${isAdmin        ? `<button class="pab pab-red"       onclick="confirmDeleteStudent('${s._docId}','${(s.fullname||"this student").replace(/'/g,"\\'")}')"><span>❌</span> Delete Student</button>` : ""}
          </div>
        </div>` : ""}

        <button class="popup-close-bottom" id="popupCloseBtnBottom">
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style="opacity:.6"><path d="M1 1l16 16M17 1L1 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          Close
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => overlay.classList.add("popup-visible"));

  const close = () => {
    overlay.classList.remove("popup-visible");
    overlay.classList.add("popup-hiding");
    setTimeout(() => { overlay.remove(); document.body.style.overflow = ""; }, 320);
  };

  document.getElementById("popupCloseBtn").addEventListener("click", close);
  document.getElementById("popupCloseBtnBottom").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });
}

// ── ADMIN EDIT MODAL ──────────────────────────────────────────────────────────

window.openEditAdmin = function (adminId) {
  const admins = getAdminUsers();
  const admin  = admins.find(a => a.id === adminId);
  if (!admin) return;

  const existing = document.getElementById("editAdminModal");
  if (existing) existing.remove();

  const roleColors = { admin: "#f59e0b", editor: "#3b82f6", viewer: "#10b981" };
  const color = roleColors[admin.ADM_role] || "#64748b";

  const overlay = document.createElement("div");
  overlay.id = "editAdminModal";
  overlay.className = "popup-overlay";

  overlay.innerHTML = `
    <div class="popup-card edit-admin-card" id="editAdminCard">
      <div class="popup-glow" style="background:radial-gradient(ellipse 60% 40% at 50% 0%, ${color}18 0%, transparent 70%)"></div>
      <button class="popup-close" id="editAdminClose" aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M1 1l16 16M17 1L1 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>

      <div class="popup-header">
        <div class="popup-avatar" style="background:linear-gradient(135deg,${color},${color}99)">${admin.ADM_name.charAt(0).toUpperCase()}</div>
        <div class="popup-header-info">
          <h2 class="popup-name">Edit Administrator</h2>
          <p class="popup-nickname">@${admin.ADM_Uname}</p>
        </div>
      </div>

      <div class="popup-divider"></div>

      <div class="edit-admin-notice">
        <span>🔒</span> Username, email and password cannot be changed here.
      </div>

      <div class="edit-admin-form">
        <div class="edit-field">
          <label>Full Name</label>
          <input id="editAdmName" value="${admin.ADM_name}" placeholder="Full Name">
        </div>
        <div class="edit-field">
          <label>Admin ID</label>
          <input id="editAdmId" value="${admin.ADM_ID}" placeholder="Admin ID">
        </div>
        <div class="edit-field">
          <label>Role</label>
          <select id="editAdmRole">
            <option value="admin"  ${admin.ADM_role === "admin"  ? "selected" : ""}>⚡ Admin — full access</option>
            <option value="editor" ${admin.ADM_role === "editor" ? "selected" : ""}>✏️ Editor — add/edit students</option>
            <option value="viewer" ${admin.ADM_role === "viewer" ? "selected" : ""}>👁 Viewer — view only</option>
          </select>
        </div>
      </div>

      <div class="edit-admin-actions">
        <button class="edit-save-btn" onclick="saveEditAdmin('${adminId}')">Save Changes</button>
        <button class="edit-cancel-btn" id="editAdminCancel">Cancel</button>
        <button class="edit-delete-btn" type="button" onclick="confirmDeleteAdmin('${adminId}')">Delete</button>
      </div>
      <p id="editAdminMsg" style="text-align:center;font-size:0.82rem;min-height:20px;margin-top:10px;"></p>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => overlay.classList.add("popup-visible"));

  const close = () => {
    overlay.classList.remove("popup-visible");
    overlay.classList.add("popup-hiding");
    setTimeout(() => { overlay.remove(); document.body.style.overflow = ""; }, 320);
  };

  document.getElementById("editAdminClose").addEventListener("click", close);
  document.getElementById("editAdminCancel").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
};

window.saveEditAdmin = function (adminId) {
  const admins = getAdminUsers();
  const idx    = admins.findIndex(a => a.id === adminId);
  if (idx === -1) return;

  const name  = document.getElementById("editAdmName").value.trim();
  const admId = document.getElementById("editAdmId").value.trim();
  const role  = document.getElementById("editAdmRole").value;

  if (!name || !admId || !role) {
    const msg = document.getElementById("editAdminMsg");
    if (msg) { msg.textContent = "⚠️ All fields required."; msg.style.color = "#fb7185"; }
    return;
  }

  admins[idx] = { ...admins[idx], ADM_name: name, ADM_ID: admId, ADM_role: role };
  window.manualAdmins = admins;
  saveAdminUsers();

  const msg = document.getElementById("editAdminMsg");
  if (msg) { msg.textContent = "✅ Changes saved!"; msg.style.color = "#86efac"; }

  setTimeout(() => {
    const overlay = document.getElementById("editAdminModal");
    if (overlay) {
      overlay.classList.remove("popup-visible");
      overlay.classList.add("popup-hiding");
      setTimeout(() => { overlay.remove(); document.body.style.overflow = ""; }, 320);
    }
    renderAdmins(getAdminUsers());
    updateAdminStats();
  }, 800);
};

window.confirmDeleteAdmin = function (adminId) {
  const admins = getAdminUsers();
  const admin  = admins.find(a => a.id === adminId);
  if (!admin) return;

  // Prevent deleting yourself
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.ADM_Uname === admin.ADM_Uname) {
    showToast("⛔ You cannot delete your own account.", "error");
    return;
  }

  const existing = document.getElementById("deleteConfirmModal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "deleteConfirmModal";
  overlay.className = "popup-overlay";

  overlay.innerHTML = `
    <div class="popup-card delete-confirm-card" id="deleteConfirmCard">
      <div class="delete-icon-wrap">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 11v6M14 11v6" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <h3 class="delete-title">Remove Administrator?</h3>
      <p class="delete-desc">This will permanently remove <strong>${admin.ADM_name}</strong> (@${admin.ADM_Uname}) from the system. This action cannot be undone.</p>
      <div class="delete-actions">
        <button class="delete-confirm-btn" onclick="deleteAdmin('${adminId}')">Yes, Remove</button>
        <button class="delete-cancel-btn" id="deleteCancelBtn">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => overlay.classList.add("popup-visible"));

  const close = () => {
    overlay.classList.remove("popup-visible");
    overlay.classList.add("popup-hiding");
    setTimeout(() => { overlay.remove(); document.body.style.overflow = ""; }, 320);
  };

  document.getElementById("deleteCancelBtn").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
};

window.deleteAdmin = function (adminId) {
  window.manualAdmins = getAdminUsers().filter(a => a.id !== adminId);
  saveAdminUsers();

  const overlay = document.getElementById("deleteConfirmModal");
  if (overlay) {
    overlay.classList.remove("popup-visible");
    overlay.classList.add("popup-hiding");
    setTimeout(() => { overlay.remove(); document.body.style.overflow = ""; }, 320);
  }

  renderAdmins(getAdminUsers());
  updateAdminStats();
  showToast("✅ Administrator removed.", "success");
};

// ── TOAST NOTIFICATIONS ───────────────────────────────────────────────────────

function showToast(message, type = "success") {
  const existing = document.querySelector(".rcmu-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `rcmu-toast rcmu-toast-${type}`;
  toast.innerHTML = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("rcmu-toast-visible"));
  setTimeout(() => {
    toast.classList.remove("rcmu-toast-visible");
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

window.confirmDeleteStudent = function (docId, studentName = "this student") {
  if (!docId) return;
  const confirmed = window.confirm(`Are you sure you want to permanently delete ${studentName}?`);
  if (!confirmed) return;
  window.deleteStudent(docId);
};

window.deleteStudent = async function (docId) {
  const user = getCurrentUser();
  if (!user || user.ADM_role !== "admin") {
    showToast("⛔ Only admins can delete students.", "error");
    return;
  }

  try {
    await deleteDoc(doc(db, "RCMU_DB", docId));
    const overlay = document.getElementById("studentPopup");
    if (overlay) {
      overlay.classList.remove("popup-visible");
      overlay.classList.add("popup-hiding");
      setTimeout(() => { overlay.remove(); document.body.style.overflow = ""; }, 320);
    }
    showToast("✅ Student removed from the database.", "success");
  } catch (error) {
    console.error(error);
    showToast("❌ Could not delete student. Try again.", "error");
  }
};

window.openDutyEditor = function () {
  const student = window.currentStudentDoc;
  if (!student || !student._docId) return;

  const currentActivities = getDutyActivitiesList(student).map(entry => entry.text).join("\n");
  const activitiesText = window.prompt("Edit weekly duty activities (one activity per line):", currentActivities);
  if (activitiesText === null) return;

  const activityLines = activitiesText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(text => ({ text, createdAt: new Date().toISOString() }));

  const percentageRaw = window.prompt("Enter duty completion percentage (0-100):", student.dutyPercentage != null ? student.dutyPercentage : "");
  if (percentageRaw === null) return;

  const percentage = Number(percentageRaw);
  if (Number.isNaN(percentage) || percentage < 0 || percentage > 100) {
    showToast("⚠️ Duty % must be a number between 0 and 100.", "error");
    return;
  }

  window.saveDutyDetails(student._docId, activityLines, percentage, true);
};

window.openStudentEditor = async function () {
  const student = window.currentStudentDoc;
  if (!student || !student._docId) return;

  const user = getCurrentUser();
  if (!user || user.ADM_role !== "admin") {
    showToast("⛔ Only admins can edit student details.", "error");
    return;
  }

  // Redirect to edit page
  window.location.href = `edit.html?id=${student._docId}`;
};

window.saveDutyDetails = async function (docId, activities, percentage, overwrite = false) {
  try {
    const current = window.currentStudentDoc;
    const existingActivities = getDutyActivitiesList(current);
    let updatedActivities;

    if (Array.isArray(activities)) {
      updatedActivities = overwrite ? activities : [...existingActivities, ...activities];
    } else {
      const newEntry = { text: activities, createdAt: new Date().toISOString() };
      updatedActivities = overwrite ? [newEntry] : [...existingActivities, newEntry];
    }

    await updateDoc(doc(db, "RCMU_DB", docId), {
      dutyActivities: updatedActivities,
      dutyPercentage: percentage,
      dutyUpdatedAt: new Date().toISOString()
    });

    if (window.currentStudentDoc) {
      window.currentStudentDoc.dutyActivities = updatedActivities;
      window.currentStudentDoc.dutyPercentage = percentage;
    }
    renderStudents();
    showToast("✅ Duty details updated.", "success");
  } catch (error) {
    console.error(error);
    showToast("❌ Could not update duty details.", "error");
  }
};

window.openAchievementEditor = function () {
  const student = window.currentStudentDoc;
  if (!student || !student._docId) return;

  const achievementText = window.prompt("Enter new achievement:", "");
  if (achievementText === null) return;
  const trimmed = achievementText.trim();
  if (!trimmed) {
    showToast("⚠️ Achievement cannot be empty.", "error");
    return;
  }

  window.saveAchievementDetails(student._docId, trimmed);
};

window.saveAchievementDetails = async function (docId, achievement) {
  try {
    const current = window.currentStudentDoc;
    const existingAchievements = getAchievementsList(current);
    const entry = { text: achievement, createdAt: new Date().toISOString() };
    const updatedAchievements = [...existingAchievements, entry];

    await updateDoc(doc(db, "RCMU_DB", docId), {
      achievements: updatedAchievements
    });

    if (window.currentStudentDoc) {
      window.currentStudentDoc.achievements = updatedAchievements;
    }
    renderStudents();
    showToast("✅ Achievement added.", "success");
  } catch (error) {
    console.error(error);
    showToast("❌ Could not add achievement.", "error");
  }
};

window.deleteSelectedHistory = async function () {
  const student = window.currentStudentDoc;
  if (!student || !student._docId) return;

  const selected = Array.from(document.querySelectorAll("#studentPopup .history-checkbox:checked"));
  if (!selected.length) {
    showToast("⚠️ Select at least one duty activity or achievement to delete.", "error");
    return;
  }

  const selectedByType = { duty: [], achievement: [] };
  selected.forEach(el => {
    const type = el.dataset.entryType;
    const index = Number(el.dataset.entryIndex);
    if (!Number.isNaN(index) && selectedByType[type]) selectedByType[type].push(index);
  });

  const existingActivities = getDutyActivitiesList(student);
  const existingAchievements = getAchievementsList(student);
  const removeSorted = indices => [...new Set(indices)].sort((a, b) => b - a);
  const updatedActivities = removeSorted(selectedByType.duty).reduce((arr, idx) => {
    if (idx >= 0 && idx < arr.length) arr.splice(idx, 1);
    return arr;
  }, [...existingActivities]);
  const updatedAchievements = removeSorted(selectedByType.achievement).reduce((arr, idx) => {
    if (idx >= 0 && idx < arr.length) arr.splice(idx, 1);
    return arr;
  }, [...existingAchievements]);

  try {
    await updateDoc(doc(db, "RCMU_DB", student._docId), {
      dutyActivities: updatedActivities,
      achievements: updatedAchievements
    });

    if (window.currentStudentDoc) {
      window.currentStudentDoc.dutyActivities = updatedActivities;
      window.currentStudentDoc.achievements = updatedAchievements;
    }
    renderStudents();
    openStudentPopup(window.currentStudentDoc);
    showToast("✅ Selected history items deleted.", "success");
  } catch (error) {
    console.error(error);
    showToast("❌ Could not delete selected items.", "error");
  }
};

window.clearStudentHistory = async function (docId) {
  const confirmed = window.confirm("Clear all duty activities and achievements for this student? This cannot be undone.");
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, "RCMU_DB", docId), {
      dutyActivities: [],
      achievements: []
    });
    if (window.currentStudentDoc) {
      window.currentStudentDoc.dutyActivities = [];
      window.currentStudentDoc.achievements = [];
    }
    renderStudents();
    showToast("✅ Duty activities and achievements cleared.", "success");
  } catch (error) {
    console.error(error);
    showToast("❌ Could not clear history.", "error");
  }
};

// ── ADMIN PAGE ────────────────────────────────────────────────────────────────

window.createUser = function () {
  const user = getCurrentUser();
  if (!user || user.ADM_role !== "admin") {
    showMessage("userMsg", "⛔ Only admins can create users.", "#fb7185");
    return;
  }

  const email    = document.getElementById("ADM_Email").value.trim();
  const admId    = document.getElementById("ADM_ID").value.trim();
  const uname    = document.getElementById("ADM_Uname").value.trim();
  const name     = document.getElementById("ADM_name").value.trim();
  const password = document.getElementById("ADM_password").value.trim();
  const role     = document.getElementById("ADM_role").value;

  if (!email || !admId || !uname || !name || !password || !role) {
    showMessage("userMsg", "⚠️ All fields are required.", "#fb7185");
    return;
  }

  const existing  = getAdminUsers().find(a => a.ADM_Email.toLowerCase() === email.toLowerCase());
  if (existing) { showMessage("userMsg", "⚠️ Email already in use.", "#fb7185"); return; }

  const unameCheck = getAdminUsers().find(a => a.ADM_Uname.toLowerCase() === uname.toLowerCase());
  if (unameCheck) { showMessage("userMsg", "⚠️ Username already taken.", "#fb7185"); return; }

  const btn = document.querySelector("#adminPanel .panel-card button");
  if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }

  try {
    const newAdmin = {
      id: `manual-${Date.now()}`,
      ADM_Email: email, ADM_ID: admId, ADM_Uname: uname,
      ADM_name: name, ADM_password: password, ADM_role: role
    };
    window.manualAdmins = getAdminUsers().concat(newAdmin);
    saveAdminUsers();
    showMessage("userMsg", "✅ Admin user created successfully.", "#86efac");
    ["ADM_Email","ADM_ID","ADM_Uname","ADM_name","ADM_password"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    document.getElementById("ADM_role").value = "";
    renderAdmins(getAdminUsers());
    updateAdminStats();
  } catch (err) {
    showMessage("userMsg", "❌ Error creating user.", "#fb7185");
    console.error(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Create User"; }
  }
};

function updateAdminStats() {
  const admins = getAdminUsers();
  const counts = { admin: 0, editor: 0, viewer: 0 };
  admins.forEach(a => { if (counts[a.ADM_role] !== undefined) counts[a.ADM_role]++; });

  const animateCount = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    let cur = 0;
    const tick = () => { cur++; el.textContent = cur; if (cur < val) requestAnimationFrame(tick); };
    if (val > 0) requestAnimationFrame(tick);
    else el.textContent = "0";
  };

  animateCount("statAdmins",  counts.admin + counts.editor + counts.viewer);
  animateCount("statEditors", counts.editor);
  animateCount("statViewers", counts.viewer);
}

function renderAdmins(adminDocs) {
  const list = document.getElementById("userList");
  if (!list) return;

  if (!adminDocs.length) {
    list.innerHTML = `<div class="empty-state">No admins found.</div>`;
    return;
  }

  const roleColors = { admin: "#f59e0b", editor: "#3b82f6", viewer: "#10b981" };
  const roleIcons  = { admin: "⚡", editor: "✏️", viewer: "👁" };

  let html = `<div class="user-grid">`;
  adminDocs.forEach((admin, i) => {
    const color = roleColors[admin.ADM_role] || "#64748b";
    const icon  = roleIcons[admin.ADM_role]  || "";
    html += `
      <div class="user-row" style="animation-delay:${i * 0.06}s">
        <div class="user-row-avatar" style="background:${color}22;color:${color};border-color:${color}44">
          ${admin.ADM_name.charAt(0).toUpperCase()}
        </div>
        <div class="user-row-info">
          <span class="user-row-name">${admin.ADM_name}</span>
          <span class="user-row-uname">@${admin.ADM_Uname}</span>
          <span class="user-row-email">${admin.ADM_Email}</span>
        </div>
        <span class="user-row-role" style="background:${color}22;color:${color};border-color:${color}44">
          ${icon} ${admin.ADM_role}
        </span>
        <div class="user-row-actions">
          <button class="user-action-btn edit-btn" onclick="openEditAdmin('${admin.id}')" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  list.innerHTML = html;
}

// ── STUDENTS ──────────────────────────────────────────────────────────────────

function getFilteredSortedStudents() {
  let filtered = students;
  const searchValue = searchQuery.toString().trim().toLowerCase();
  const parsedFilter = parseSearchFilter(searchValue);

  if (parsedFilter?.type === "grade") {
    filtered = filtered.filter(s => (s.grade ?? "").toString().trim().toLowerCase() === parsedFilter.value);
  } else if (parsedFilter?.type === "department") {
    filtered = filtered.filter(s => (s.department ?? "").toString().trim().toLowerCase() === parsedFilter.value);
  } else if (parsedFilter?.type === "announcer_cat") {
    // e.g. "sinhala announcer A" → role contains "Sinhala Announcer (A)"
    filtered = filtered.filter(s => {
      const role = s.role || "";
      const roleLower = role.toLowerCase();
      const matchSinhala = parsedFilter.role === "sinhala announcer" && roleLower.includes("sinhala announcer");
      const matchEnglish = parsedFilter.role === "english announcer" && (roleLower.includes("english announcer") || roleLower.includes("english announce"));
      return (matchSinhala || matchEnglish) && role.includes(`(${parsedFilter.cat})`);
    });
  } else if (parsedFilter?.type === "announcer_role") {
    // "sinhala announcer" with no category → all of that announcer type
    filtered = filtered.filter(s => {
      const roleLower = (s.role || "").toLowerCase();
      if (parsedFilter.role === "sinhala announcer") return roleLower.includes("sinhala announcer");
      if (parsedFilter.role === "english announcer") return roleLower.includes("english announcer") || roleLower.includes("english announce");
      return false;
    });
  } else if (searchValue) {
    filtered = filtered.filter(s =>
      [s.fullname, s.studentId, s.grade, s.role, s.department, s.status, s.email, s.phone, s.address, s.birthday, s.joinedYear]
        .filter(Boolean).some(v => v.toString().toLowerCase().includes(searchValue))
    );
  }

  return [...filtered].sort((a, b) => {
    const aVal = (a[sortOption] ?? "").toString().toLowerCase();
    const bVal = (b[sortOption] ?? "").toString().toLowerCase();
    return aVal.localeCompare(bVal, undefined, { numeric: true });
  });
}

function getExportStudents() {
  return getFilteredSortedStudents();
}

function getDutyActivitiesList(student) {
  if (!student) return [];
  if (Array.isArray(student.dutyActivities)) return student.dutyActivities;
  if (typeof student.dutyActivities === "string" && student.dutyActivities.trim()) {
    return [{ text: student.dutyActivities, createdAt: student.dutyUpdatedAt || "" }];
  }
  return [];
}

function getLatestDutyActivityText(student) {
  const list = getDutyActivitiesList(student);
  return list.length ? list[list.length - 1].text : "";
}

function getDutyPercentageGraph(value, inline = false) {
  if (value == null || Number.isNaN(Number(value))) {
    return `<span class="duty-graph-empty">—</span>`;
  }
  const percent = Math.max(0, Math.min(100, Number(value)));
  return `
    <div class="duty-graph${inline ? ' duty-graph-inline' : ''}" title="${percent}% duty completion">
      <div class="duty-graph-track">
        <div class="duty-graph-fill" style="width:${percent}%"></div>
      </div>
      <span class="duty-graph-label">${percent}%</span>
    </div>
  `;
}

function getDutyActivitiesHtml(student, isAdmin = false) {
  const list = getDutyActivitiesList(student);
  if (!list.length) return `<p class="popup-empty-note">No duty activities recorded yet.</p>`;
  return `
    <div class="popup-history-list">
      ${list.map((entry, index) => `
        <label class="history-item">
          ${isAdmin ? `<input type="checkbox" class="history-checkbox" data-entry-type="duty" data-entry-index="${index}">` : ""}
          <span class="history-num">${index + 1}</span>
          <span class="history-text">${entry.text}</span>
          ${entry.createdAt ? `<span class="history-date">${new Date(entry.createdAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"})}</span>` : ""}
        </label>
      `).join("")}
    </div>
  `;
}

function getAchievementsList(student) {
  if (!student) return [];
  if (Array.isArray(student.achievements)) return student.achievements;
  if (typeof student.achievements === "string" && student.achievements.trim()) {
    return [{ text: student.achievements, createdAt: student.achievementUpdatedAt || "" }];
  }
  return [];
}

function getLatestAchievementText(student) {
  const list = getAchievementsList(student);
  return list.length ? list[list.length - 1].text : "";
}

function getAchievementsHtml(student, isAdmin = false) {
  const list = getAchievementsList(student);
  if (!list.length) return `<p class="popup-empty-note">No achievements recorded yet.</p>`;
  return `
    <div class="popup-history-list">
      ${list.map((entry, index) => `
        <label class="history-item history-achievement">
          ${isAdmin ? `<input type="checkbox" class="history-checkbox" data-entry-type="achievement" data-entry-index="${index}">` : ""}
          <span class="history-num history-num-gold">${index + 1}</span>
          <span class="history-text">${entry.text}</span>
          ${entry.createdAt ? `<span class="history-date">${new Date(entry.createdAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"})}</span>` : ""}
        </label>
      `).join("")}
    </div>
  `;
}

// ── DISPLAY HELPERS ──────────────────────────────────────────────────────────

function formatRoleHtml(roleStr) {
  if (!roleStr) return `<span class="role-empty">—</span>`;
  return roleStr.split(" / ").map(part => {
    const catMatch = part.match(/\(([ABC])\)/);
    const cat = catMatch ? catMatch[1] : null;
    const display = part.replace(/\s*\([ABC]\)/, "").trim();
    return `<span class="role-pill">${display}${cat ? `<span class="role-cat-badge cat-${cat}">${cat}</span>` : ""}</span>`;
  }).join("");
}

function getDeptMeta(dept) {
  const map = {
    Photography: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: "📷" },
    Web:         { color: "#06b6d4", bg: "rgba(6,182,212,0.1)",  icon: "🌐" },
    Media:       { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", icon: "🎬" }
  };
  return map[dept] || { color: "#64748b", bg: "rgba(100,116,139,0.1)", icon: "👤" };
}

function getExpMeta(level) {
  const map = {
    Junior:       { color: "#10b981", bg: "rgba(16,185,129,0.12)" },
    Intermediate: { color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
    Senior:       { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" }
  };
  return map[level] || { color: "#64748b", bg: "rgba(100,116,139,0.1)" };
}

function getAvatarGradient(name) {
  const palettes = [
    ["#3b82f6","#06b6d4"], ["#8b5cf6","#ec4899"], ["#10b981","#06b6d4"],
    ["#f59e0b","#ef4444"], ["#6366f1","#8b5cf6"], ["#14b8a6","#3b82f6"],
    ["#f97316","#f59e0b"], ["#ec4899","#8b5cf6"]
  ];
  const idx = ((name || "?").charCodeAt(0) + ((name || "?").charCodeAt(1) || 0)) % palettes.length;
  return `linear-gradient(135deg, ${palettes[idx][0]}, ${palettes[idx][1]})`;
}

function renderStudents() {
  const list = document.getElementById("list");
  if (!list) return;

  const sorted = getFilteredSortedStudents();
  const searchValue = searchQuery.toString().trim().toLowerCase();

  if (!sorted.length) {
    const msg = searchValue
      ? `<div class="empty-icon">🔍</div><p>No students match "<strong>${searchValue}</strong>"</p>`
      : `<div class="empty-icon">🎓</div><p>No students yet. <a href="add.html">Add the first member →</a></p>`;
    list.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  // ── TABLE VIEW ──────────────────────────────────────────────────────────────
  if (viewMode === "table") {
    let html = `
      <div class="student-table">
        <div class="table-row header">
          <div>Name</div>
          <div>ID</div>
          <div>Gr.</div>
          <div>Cls.</div>
          <div>Role</div>
          <div>Dept</div>
          <div>Level</div>
          <div>Status</div>
          <div>Duty</div>
          <div>Activity</div>
          <div>Email</div>
          <div>Birthday</div>
        </div>
    `;
    sorted.forEach((s, i) => {
      const statusClass = s.status?.toLowerCase() === "active" ? "status-active" : "status-inactive";
      const deptMeta   = getDeptMeta(s.department);
      const expMeta    = getExpMeta(s.experienceLevel);
      const initials   = (s.fullname || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
      const avatarGrad = getAvatarGradient(s.fullname);
      const duty       = s.dutyPercentage != null ? Number(s.dutyPercentage) : null;
      html += `
        <div class="table-row clickable-row" data-idx="${i}" style="animation-delay:${i * 0.03}s">
          <div class="td-name">
            <div class="td-avatar" style="background:${avatarGrad}">${initials}</div>
            <div class="td-name-info">
              <span class="td-fullname">${s.fullname}</span>
              ${s.nickname ? `<span class="td-nickname">"${s.nickname}"</span>` : ""}
            </div>
          </div>
          <div class="td-mono">${s.studentId || "—"}</div>
          <div class="td-center"><span class="td-grade-badge">${s.grade || "—"}</span></div>
          <div class="td-center">${s.studentClass || "—"}</div>
          <div class="td-role">${formatRoleHtml(s.role)}</div>
          <div><span class="td-dept-badge" style="color:${deptMeta.color};background:${deptMeta.bg};border-color:${deptMeta.color}44">${deptMeta.icon} ${s.department || "—"}</span></div>
          <div>${s.experienceLevel ? `<span class="td-exp-badge" style="color:${expMeta.color};background:${expMeta.bg}">${s.experienceLevel}</span>` : "—"}</div>
          <div><span class="status-badge ${statusClass}">${s.status || "—"}</span></div>
          <div class="td-duty">
            ${duty !== null ? `
              <div class="td-duty-wrap">
                <div class="td-duty-bar"><div class="td-duty-fill" style="width:${duty}%;background:${duty >= 75 ? '#10b981' : duty >= 40 ? '#3b82f6' : '#f59e0b'}"></div></div>
                <span class="td-duty-num">${duty}%</span>
              </div>` : "—"}
          </div>
          <div class="td-clip">${getLatestDutyActivityText(s) || "—"}</div>
          <div class="td-clip td-email">${s.email || "—"}</div>
          <div class="td-mono">${s.birthday || "—"}</div>
        </div>
      `;
    });
    html += `</div>`;
    list.innerHTML = html;

    list.querySelectorAll(".clickable-row").forEach(row => {
      row.addEventListener("click", () => openStudentPopup(sorted[parseInt(row.dataset.idx)]));
    });
    return;
  }

  // ── CARD VIEW ───────────────────────────────────────────────────────────────
  let html = `<div class="student-grid">`;
  sorted.forEach((s, i) => {
    const initials   = (s.fullname || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
    const statusClass = s.status?.toLowerCase() === "active" ? "status-active" : "status-inactive";
    const avatarGrad = getAvatarGradient(s.fullname);
    const deptMeta   = getDeptMeta(s.department);
    const expMeta    = getExpMeta(s.experienceLevel);
    const duty       = s.dutyPercentage != null ? Number(s.dutyPercentage) : null;
    const dutyColor  = duty !== null ? (duty >= 75 ? "#10b981" : duty >= 40 ? "#3b82f6" : "#f59e0b") : "#64748b";
    const hasImg     = !!s.profileImageUrl;

    html += `
      <div class="card clickable-card" data-idx="${i}" style="animation-delay:${i * 0.05}s">

        <div class="card-band" style="background:${avatarGrad}"></div>

        <div class="card-top">
          <div class="card-avatar-wrap">
            ${hasImg
              ? `<img src="${s.profileImageUrl}" class="card-avatar card-avatar-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="">`
              : ""}
            <div class="card-avatar" style="${hasImg ? "display:none;" : ""}background:${avatarGrad}">${initials}</div>
          </div>
          <div class="card-header-info">
            <h2>${s.fullname}</h2>
            ${s.nickname ? `<p class="card-nickname">"${s.nickname}"</p>` : ""}
            <div class="card-status-row">
              <span class="status-badge ${statusClass}">${s.status || "—"}</span>
              ${s.experienceLevel ? `<span class="card-exp-tag" style="color:${expMeta.color};background:${expMeta.bg}">${s.experienceLevel}</span>` : ""}
            </div>
          </div>
          <div class="card-dept-flag" style="color:${deptMeta.color};background:${deptMeta.bg}" title="${s.department || ""}">${deptMeta.icon}</div>
        </div>

        <div class="card-role-strip">
          ${formatRoleHtml(s.role)}
        </div>

        <div class="card-stats-row">
          <div class="card-stat">
            <span class="card-stat-val">${s.grade || "—"}</span>
            <span class="card-stat-key">Grade</span>
          </div>
          <div class="card-stat-div"></div>
          <div class="card-stat">
            <span class="card-stat-val">${s.studentClass || "—"}</span>
            <span class="card-stat-key">Class</span>
          </div>
          <div class="card-stat-div"></div>
          <div class="card-stat">
            <span class="card-stat-val">${s.joinedYear || "—"}</span>
            <span class="card-stat-key">Joined</span>
          </div>
          <div class="card-stat-div"></div>
          <div class="card-stat">
            <span class="card-stat-val">${s.studentId || "—"}</span>
            <span class="card-stat-key">ID</span>
          </div>
        </div>

        ${duty !== null ? `
        <div class="card-duty-row">
          <div class="card-duty-track">
            <div class="card-duty-fill" style="width:${duty}%;background:${dutyColor}"></div>
          </div>
          <span class="card-duty-label" style="color:${dutyColor}">${duty}% Duty</span>
        </div>` : ""}

        <div class="card-meta-row">
          ${s.email    ? `<span class="card-meta-item" title="${s.email}">✉ ${s.email}</span>` : ""}
          ${s.phone    ? `<span class="card-meta-item" title="${s.phone}">📞 ${s.phone}</span>` : ""}
          ${s.birthday ? `<span class="card-meta-item">🎂 ${s.birthday}</span>` : ""}
        </div>

        <div class="card-footer-hint">
          <span>View full profile</span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  list.innerHTML = html;

  list.querySelectorAll(".clickable-card").forEach(card => {
    card.addEventListener("click", () => openStudentPopup(sorted[parseInt(card.dataset.idx)]));
  });
}

function downloadStudentSheet(studentsToExport) {
  const headers = [
    "Name", "Nickname", "ID", "Grade", "Role", "Department", "Status",
    "Age Category", "Duty %", "Duty Activities", "Achievements", "Email", "Phone", "WhatsApp", "Address", "Birthday", "Joined Year", "Profile Image URL"
  ];
  const rows = studentsToExport.map(s => [
    s.fullname, s.nickname || "", s.studentId, s.grade, s.role, s.department,
    s.status, s.experienceLevel, s.dutyPercentage != null ? `${s.dutyPercentage}%` : "",
    getDutyActivitiesList(s).map((entry, index) => `${index + 1}. ${entry.text}`).join(" \n"),
    getAchievementsList(s).map((entry, index) => `${index + 1}. ${entry.text}`).join(" \n"),
    s.email, s.phone, s.whatsapp || "", s.address, s.birthday, s.joinedYear, s.profileImageUrl || ""
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths for better table appearance
  ws['!cols'] = [
    { wch: 20 }, // Name
    { wch: 15 }, // Nickname
    { wch: 10 }, // ID
    { wch: 8 },  // Grade
    { wch: 18 }, // Role
    { wch: 12 }, // Department
    { wch: 8 },  // Status
    { wch: 12 }, // Age Category
    { wch: 8 },  // Duty %
    { wch: 30 }, // Duty Activities
    { wch: 30 }, // Achievements
    { wch: 25 }, // Email
    { wch: 15 }, // Phone
    { wch: 20 }, // Address
    { wch: 12 }, // Birthday
    { wch: 12 }, // Joined Year
    { wch: 25 }  // Profile Image URL
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "RCMU Students");
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "RCMU_student_sheet.xlsx";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

window.saveStudent = async function () {
  const user = requireAuth(["admin", "editor"]);
  if (!user) return;

  const fields = ["fullname","nickname","studentId","grade","studentClass","role","department","status",
                  "experienceLevel","dutyPercentage","dutyActivities","achievements","profileImageUrl","email","phone","whatsapp","address","birthday","joinedYear"];

  const required = ["fullname", "studentId", "grade"];

  const data = {};
  for (const f of fields) {
    let raw = "";
    if (f === "role") {
      const roleCount = Number(document.getElementById("roleCount")?.value || 0);
      const values = [];
      for (let i = 1; i <= roleCount; i += 1) {
        const roleText = buildRoleText(i);
        if (roleText) values.push(roleText);
      }
      raw = values.join(" / ");
    } else {
      const el = document.getElementById(f);
      raw = el?.value.trim() || "";
    }
    if (f === "dutyActivities" || f === "achievements") {
      data[f] = raw ? [{ text: raw, createdAt: new Date().toISOString() }] : [];
    } else {
      data[f] = raw;
    }
  }
  if (data.dutyPercentage) data.dutyPercentage = Number(data.dutyPercentage);

  for (const f of required) {
    if (!data[f]) {
      showMessage("msg", `⚠️ ${f.replace(/([A-Z])/g, " $1")} is required.`, "#fb7185");
      return;
    }
  }

  const btn = document.querySelector(".form button[type=button]");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

  try {
    await addDoc(collection(db, "RCMU_DB"), { ...data, createdAt: new Date().toISOString() });
    showMessage("msg", "✅ Student saved successfully.", "#86efac");
    document.querySelectorAll(".form input:not([type=checkbox]), .form select, .form textarea").forEach(i => i.value = "");
    document.querySelectorAll(".form input[type=checkbox]").forEach(i => i.checked = false);
    const roleCount = document.getElementById("roleCount");
    if (roleCount) { roleCount.value = ""; roleCount.dispatchEvent(new Event('change')); }
    for (let i = 1; i <= 3; i += 1) {
      const field = document.getElementById(`roleField${i}`);
      const subField = document.getElementById(`roleSub${i}`);
      if (field) {
        field.value = "";
        field.style.display = "none";
      }
      if (subField) {
        subField.style.display = "none";
        subField.querySelectorAll('input[type="checkbox"]').forEach(input => input.checked = false);
      }
    }
  } catch (error) {
    showMessage("msg", "❌ Error saving student.", "#fb7185");
    console.error(error);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Save Student"; }
  }
};

// ── PAGE INITS ────────────────────────────────────────────────────────────────

async function initAdminPage() {
  const panel = document.getElementById("adminPanel");
  if (!panel) return;

  const user = requireAuth(["admin"]);
  if (!user) return;

  updateHeaderUser();
  renderAdmins(getAdminUsers());
  updateAdminStats();
}

async function initStudentFormPage() {
  const user = getCurrentUser();
  updateHeaderUser();
  if (!user) {
    document.querySelectorAll(".logout-btn").forEach(b => b.style.display = "none");
    document.querySelectorAll('a[href="admin.html"]').forEach(a => a.style.display = "none");
  } else if (user.ADM_role !== "admin") {
    document.querySelectorAll('a[href="admin.html"]').forEach(a => a.style.display = "none");
  }
}

async function initStudentEditPage() {
  const user = requireAuth(["admin"]);
  if (!user) return;
  updateHeaderUser();

  const urlParams = new URLSearchParams(window.location.search);
  const studentId = urlParams.get('id');
  if (!studentId) {
    showMessage("msg", "❌ No student ID provided.", "#fb7185");
    return;
  }

  try {
    const docRef = doc(db, "RCMU_DB", studentId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      showMessage("msg", "❌ Student not found.", "#fb7185");
      return;
    }
    const student = { _docId: docSnap.id, ...docSnap.data() };
    populateEditForm(student);
  } catch (error) {
    console.error(error);
    showMessage("msg", "❌ Error loading student data.", "#fb7185");
  }
}

function populateEditForm(student) {
  // Store student data for update
  window.editingStudent = student;

  // Populate basic fields
  const fields = [
    "fullname", "nickname", "studentId", "grade", "studentClass", "email",
    "department", "status", "experienceLevel", "profileImageUrl", "phone",
    "whatsapp", "address", "birthday", "joinedYear"
  ];

  fields.forEach(field => {
    const el = document.getElementById(field);
    if (el) el.value = student[field] || "";
  });

  // Handle duty percentage
  const dutyEl = document.getElementById("dutyPercentage");
  if (dutyEl) dutyEl.value = student.dutyPercentage != null ? student.dutyPercentage : "";

  // Handle roles
  const roleStr = student.role || "";
  const roles = roleStr.split(" / ").filter(r => r.trim());
  const roleCount = Math.min(roles.length, 3);
  const roleCountEl = document.getElementById("roleCount");
  if (roleCountEl) roleCountEl.value = roleCount > 0 ? roleCount : "";

  // Populate role fields
  for (let i = 0; i < roleCount; i++) {
    const roleField = document.getElementById(`roleField${i + 1}`);
    if (roleField) {
      const roleFull = roles[i].split(" - ")[0].trim(); // e.g. "Sinhala Announcer (B)"
      // Extract optional category suffix like "(A)", "(B)", "(C)"
      const catMatch = roleFull.match(/\s*\(([ABC])\)$/);
      const cat = catMatch ? catMatch[1] : "";
      const roleBase = roleFull.replace(/\s*\([ABC]\)$/, "").trim();

      roleField.value = roleBase;
      roleField.style.display = "block";

      // Restore category select for announcers
      const catEl = document.getElementById(`roleCategory${i + 1}`);
      if (catEl) {
        if (cat && (roleBase === "Sinhala Announcer" || roleBase === "English Announcer" || roleBase === "English Announce")) {
          catEl.value = cat;
          catEl.style.display = "block";
        } else {
          catEl.value = "";
          catEl.style.display = "none";
        }
      }

      // Handle subcategories for announcers
      const subPart = roles[i].split(" - ")[1];
      if (subPart && (roleBase === "Sinhala Announcer" || roleBase === "English Announcer" || roleBase === "English Announce")) {
        const subField = document.getElementById(`roleSub${i + 1}`);
        if (subField) {
          const subValues = subPart.split(",").map(text => text.trim()).filter(Boolean);
          subField.querySelectorAll('input[type="checkbox"]').forEach(input => {
            input.checked = subValues.includes(input.value);
          });
          subField.style.display = "block";
        }
      }
    }
  }

  // Handle textareas - leave empty for editing (history managed separately)
  // const dutyActivitiesEl = document.getElementById("dutyActivities");
  // if (dutyActivitiesEl) {
  //   const latestDuty = getLatestDutyActivityText(student);
  //   dutyActivitiesEl.value = latestDuty || "";
  // }

  // const achievementsEl = document.getElementById("achievements");
  // if (achievementsEl) {
  //   const latestAch = getLatestAchievementText(student);
  //   achievementsEl.value = latestAch || "";
  // }

  // Trigger role field updates
  const roleCountEl2 = document.getElementById("roleCount");
  if (roleCountEl2) {
    roleCountEl2.dispatchEvent(new Event('change'));
  }
}

window.updateStudent = async function () {
  const user = requireAuth(["admin"]);
  if (!user) return;

  const student = window.editingStudent;
  if (!student || !student._docId) {
    showMessage("msg", "❌ No student data to update.", "#fb7185");
    return;
  }

  const fields = ["fullname","nickname","studentId","grade","studentClass","role","department","status",
                  "experienceLevel","dutyPercentage","dutyActivities","achievements","profileImageUrl","email","phone","whatsapp","address","birthday","joinedYear"];

  const required = ["fullname", "studentId", "grade"];

  const data = {};
  for (const f of fields) {
    let raw = "";
    if (f === "role") {
      const roleCount = Number(document.getElementById("roleCount")?.value || 0);
      const values = [];
      for (let i = 1; i <= roleCount; i += 1) {
        const roleText = buildRoleText(i);
        if (roleText) values.push(roleText);
      }
      raw = values.join(" / ");
    } else {
      const el = document.getElementById(f);
      raw = el?.value.trim() || "";
    }
    if (f === "dutyActivities" || f === "achievements") {
      // For editing, keep existing history, don't add new entries here
      data[f] = student[f] || [];
    } else {
      data[f] = raw;
    }
  }
  if (data.dutyPercentage) data.dutyPercentage = Number(data.dutyPercentage);

  for (const f of required) {
    if (!data[f]) {
      showMessage("msg", `⚠️ ${f.replace(/([A-Z])/g, " $1")} is required.`, "#fb7185");
      return;
    }
  }

  const btn = document.querySelector(".form button[type=button]");
  if (btn) { btn.disabled = true; btn.textContent = "Updating…"; }

  try {
    await updateDoc(doc(db, "RCMU_DB", student._docId), data);
    showMessage("msg", "✅ Student updated successfully.", "#86efac");
    // Redirect back to index or stay
    setTimeout(() => window.location.href = "index.html", 1500);
  } catch (error) {
    showMessage("msg", "❌ Error updating student.", "#fb7185");
    console.error(error);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Update Student"; }
  }
};

async function initStudentListPage() {
  const list = document.getElementById("list");
  if (!list) return;

  const user = requireAuth(["admin", "editor", "viewer"]);
  if (!user) return;
  updateHeaderUser();

  const addLink    = document.getElementById("addStudentLink");
  const adminLink  = document.getElementById("adminLink");

  if (user.ADM_role === "viewer" && addLink) addLink.style.display = "none";
  if (user.ADM_role === "admin" && adminLink) adminLink.style.display = "inline-flex";
  else if (adminLink) adminLink.style.display = "none";

  const cardsBtn    = document.getElementById("cardsViewBtn");
  const tableBtn    = document.getElementById("tableViewBtn");
  const downloadBtn = document.getElementById("downloadSheetBtn");
  const searchInput = document.getElementById("searchInput");
  const searchSugg  = document.getElementById("searchSuggestions");
  const sortSelect  = document.getElementById("sortSelect");

  if (cardsBtn) cardsBtn.addEventListener("click", () => {
    viewMode = "cards";
    cardsBtn.classList.add("active");
    tableBtn?.classList.remove("active");
    renderStudents();
  });

  if (tableBtn) tableBtn.addEventListener("click", () => {
    viewMode = "table";
    tableBtn.classList.add("active");
    cardsBtn?.classList.remove("active");
    renderStudents();
  });

  if (downloadBtn) downloadBtn.addEventListener("click", () => {
    const vis = getExportStudents();
    if (!vis.length) { alert("No student data to download."); return; }
    downloadStudentSheet(vis);
  });

  // ── DYNAMIC SEARCH SUGGESTIONS ────────────────────────────
  function updateSearchSuggestions(value) {
    if (!searchSugg) return;
    const v = (value || "").trim().toLowerCase();

    const isSinhala = v.includes("sinhala announcer");
    const isEnglish = v.includes("english announcer") || v.includes("english announce");

    if (isSinhala || isEnglish) {
      const prefix = isSinhala ? "sinhala announcer" : "english announcer";
      searchSugg.innerHTML = `
        <span class="sugg-label">Category:</span>
        <button type="button" data-suggestion="${prefix} A" class="sugg-cat sugg-cat-a">A</button>
        <button type="button" data-suggestion="${prefix} B" class="sugg-cat sugg-cat-b">B</button>
        <button type="button" data-suggestion="${prefix} C" class="sugg-cat sugg-cat-c">C</button>`;
      searchSugg.classList.add("active");
    } else {
      searchSugg.innerHTML = `
        <button type="button" data-suggestion="grade ">grade</button>
        <button type="button" data-suggestion="department ">department</button>`;
      if (!v) searchSugg.classList.add("active");
    }
  }

  if (searchInput) {
    searchInput.addEventListener("input", e => {
      searchQuery = e.target.value;
      updateSearchSuggestions(e.target.value);
      searchSugg?.classList.add("active");
      renderStudents();
    });
    searchInput.addEventListener("focus", () => {
      updateSearchSuggestions(searchInput.value);
      searchSugg?.classList.add("active");
    });
  }

  if (sortSelect) sortSelect.addEventListener("change", e => { sortOption = e.target.value; renderStudents(); });

  if (searchSugg) {
    searchSugg.addEventListener("click", e => {
      const btn = e.target.closest("button[data-suggestion]");
      if (!btn) return;
      const sug = btn.getAttribute("data-suggestion") || "";
      searchQuery = sug;
      if (searchInput) { searchInput.value = sug; searchInput.focus(); }
      // If it ends with a letter (category was chosen) close suggestions; otherwise keep open for sub-selection
      const endsWithCat = /\s[ABC]$/.test(sug.trim());
      if (endsWithCat) {
        searchSugg.classList.remove("active");
      } else {
        updateSearchSuggestions(sug);
        searchSugg.classList.add("active");
      }
      renderStudents();
    });
  }

  document.addEventListener("click", e => {
    if (!searchSugg || !searchInput) return;
    if (e.target === searchInput || searchSugg.contains(e.target)) return;
    searchSugg.classList.remove("active");
  });

  onSnapshot(collection(db, "RCMU_DB"), snap => {
    students = [];
    snap.forEach(d => students.push({ _docId: d.id, ...d.data() }));
    renderStudents();
  });
}

// ── ROUTER ────────────────────────────────────────────────────────────────────

let currentPage = window.location.pathname.split("/").pop().split("?")[0].split("#")[0] || "index.html";

if      (currentPage === "admin.html") initAdminPage();
else if (currentPage === "add.html")   initStudentFormPage();
else if (currentPage === "edit.html")  initStudentEditPage();
else if (currentPage === "index.html") initStudentListPage();