import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOL08Us-2m5w7rznnwUGudTz-QOxyi1l4",
  authDomain: "school-management-system-93aba.firebaseapp.com",
  projectId: "school-management-system-93aba"
};

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);
const auth = getAuth(appFirebase);

window.__appLoaded = true;

const subjectsList = [
  { key: "math", label: "Math" },
  { key: "english", label: "English" },
  { key: "bangla", label: "Bangla" },
  { key: "science", label: "Science" },
  { key: "generalKnowledge", label: "General Knowledge" },
  { key: "islamicEducation", label: "Islamic Education" }
];

const termOptions = [
  { key: "firstTerm", label: "First Term" },
  { key: "midTerm", label: "Mid Term" },
  { key: "finalTerm", label: "Final Term" },
  { key: "yearlyFinal", label: "Yearly Final" }
];

const classOptions = [
  "Play",
  "Nursery",
  "KG",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10"
];

const sectionOptions = ["A", "B", "C"];
const backupCollectionNames = [
  "students",
  "attendanceRecords",
  "notices",
  "users",
  "homeworks",
  "homeworkSubmissions",
  "feeRecords"
];

let allData = [];
let filteredData = [];
let attendanceStudents = [];
let monthlyAttendanceData = [];
let currentRole = "";
let currentStudentId = "";
let currentDisplayName = "";
let currentTeacherAssignments = [];
let currentResultTerm = "finalTerm";
let currentModalEditable = false;
let selectedStudentForMarks = null;
let unsubscribeStudents = null;
let unsubscribeNotices = null;
let studentKeyBackfillDone = false;
let attendanceRecordBackfillDone = false;
let allNotices = [];
let activityLogs = [];
let filteredActivityLogs = [];
let allHomeworks = [];
let allHomeworkSubmissions = [];
let allFeeRecords = [];

const $ = (id) => document.getElementById(id);

function show(id, display = "block") {
  const element = $(id);
  if (element) element.style.display = display;
}

function hide(id) {
  const element = $(id);
  if (element) element.style.display = "none";
}

function setupClassSectionDropdowns() {
  ["attendanceClass", "reportClass"].forEach((id) => {
    const select = $(id);
    if (select) select.onchange = null;
  });

  setSelectOptions("studentClass", classOptions, "Select Class");
  setSelectOptions("section", sectionOptions, "Select Section");
  setSelectOptions("filterClass", classOptions, "All Classes");
  setSelectOptions("filterSection", sectionOptions, "All Sections");
  setSelectOptions("attendanceClass", classOptions, "Select Class");
  setSelectOptions("attendanceSection", sectionOptions, "Select Section");
  setSelectOptions("reportClass", classOptions, "All Classes");
  setSelectOptions("reportSection", sectionOptions, "All Sections");
  setSelectOptions("homeworkClass", classOptions, "Select Class");
  setSelectOptions("homeworkSection", sectionOptions, "Select Section");
  setSelectOptions("feeClass", classOptions, "Select Class");
  setSelectOptions("feeSection", sectionOptions, "Select Section");
  applyTeacherScopedDropdowns();
}

function setSelectOptions(id, options, placeholder) {
  const select = $(id);
  if (!select) return;

  select.innerHTML = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...options.map((option) =>
      `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`
    )
  ].join("");
}

function applyTeacherScopedDropdowns() {
  if (currentRole !== "teacher" || !currentTeacherAssignments.length) return;

  const assignedClasses = uniqueValues(
    currentTeacherAssignments.map((assignment) => assignment.classNameRaw)
  );

  setSelectOptions("attendanceClass", assignedClasses, "Select Assigned Class");
  setSelectOptions("reportClass", assignedClasses, "All Assigned Classes");
  setSelectOptions("homeworkClass", assignedClasses, "Select Assigned Class");

  ensureTeacherAttendanceSelection();
  updateTeacherSectionDropdown("reportClass", "reportSection", "All Assigned Sections");
  updateTeacherSectionDropdown("homeworkClass", "homeworkSection", "Select Assigned Section");

  const attendanceClassSelect = $("attendanceClass");
  const reportClassSelect = $("reportClass");
  const homeworkClassSelect = $("homeworkClass");

  if (attendanceClassSelect) {
    attendanceClassSelect.onchange = () => {
      updateTeacherSectionDropdown("attendanceClass", "attendanceSection", "Select Assigned Section", true);
      clearAttendanceSheet();
    };
  }

  if (reportClassSelect) {
    reportClassSelect.onchange = () => {
      updateTeacherSectionDropdown("reportClass", "reportSection", "All Assigned Sections", false);
      monthlyAttendanceData = [];
      updateMonthlyReportSubtitle();
      renderMonthlyReport(monthlyAttendanceData);
    };
  }

  if (homeworkClassSelect) {
    homeworkClassSelect.onchange = () => {
      updateTeacherSectionDropdown("homeworkClass", "homeworkSection", "Select Assigned Section", true);
    };
  }
}

function ensureTeacherAttendanceSelection() {
  if (currentRole !== "teacher" || !currentTeacherAssignments.length) return;

  const classSelect = $("attendanceClass");
  if (!classSelect) return;

  const assignedClasses = uniqueValues(
    currentTeacherAssignments.map((assignment) => assignment.classNameRaw)
  );

  if (!classSelect.value && assignedClasses.length) {
    classSelect.value = assignedClasses[0];
  }

  updateTeacherSectionDropdown("attendanceClass", "attendanceSection", "Select Assigned Section", true);
}

function updateTeacherSectionDropdown(classSelectId, sectionSelectId, placeholder, selectFirst = false) {
  if (currentRole !== "teacher" || !currentTeacherAssignments.length) return;

  const classSelect = $(classSelectId);
  if (!classSelect) return;

  const selectedClass = normalizeClassName(classSelect.value);
  const sectionSelect = $(sectionSelectId);
  const previousSection = sectionSelect ? sectionSelect.value : "";
  const matchingAssignments = currentTeacherAssignments.filter((assignment) =>
    !selectedClass || normalizeClassName(assignment.classNameRaw) === selectedClass
  );
  const assignedSections = uniqueValues(
    matchingAssignments.map((assignment) => assignment.sectionRaw).filter(Boolean)
  );

  setSelectOptions(sectionSelectId, assignedSections, placeholder);

  if (!sectionSelect) return;

  if (previousSection && assignedSections.includes(previousSection)) {
    sectionSelect.value = previousSection;
    return;
  }

  if (selectFirst && assignedSections.length) {
    sectionSelect.value = assignedSections[0];
    return;
  }

  if (assignedSections.length === 1) {
    sectionSelect.value = assignedSections[0];
  }
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

window.login = async function () {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  if (!email || !password) {
    alert("Enter email and password");
    return;
  }

  setLoginState(true, "Logging in...");

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setLoginState(false, "");
    alert("Login failed: " + error.message);
  }
};

function setLoginState(isLoading, message) {
  const button = $("loginBtn");
  const status = $("loginStatus");

  if (button) {
    button.disabled = isLoading;
    button.innerText = isLoading ? "Logging in..." : "Login";
  }

  if (status) {
    status.innerText = message || "";
  }
}

window.logout = async function () {
  if (unsubscribeStudents) {
    unsubscribeStudents();
    unsubscribeStudents = null;
  }

  if (unsubscribeNotices) {
    unsubscribeNotices();
    unsubscribeNotices = null;
  }

  await signOut(auth);
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    show("loginBox", "flex");
    hide("app");
    setLoginState(false, "");

    currentRole = "";
    currentStudentId = "";
    currentDisplayName = "";
    currentTeacherAssignments = [];
    studentKeyBackfillDone = false;
    attendanceRecordBackfillDone = false;
    allData = [];
    filteredData = [];
    attendanceStudents = [];
    allNotices = [];

    if (unsubscribeStudents) {
      unsubscribeStudents();
      unsubscribeStudents = null;
    }

    if (unsubscribeNotices) {
      unsubscribeNotices();
      unsubscribeNotices = null;
    }

    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));

    if (!userSnap.exists()) {
      alert("No role assigned for this user");
      await signOut(auth);
      return;
    }

    const userData = userSnap.data();

    currentRole = userData.role || "";
    currentStudentId = userData.studentId || user.email;
    currentDisplayName = userData.name || user.email;
    currentTeacherAssignments = normalizeTeacherAssignments(userData);

    hide("loginBox");
    show("app");
    setLoginState(false, "");

    setupClassSectionDropdowns();
    setupRoleUI(currentDisplayName);
    loadStudents();
    loadNotices();
  } catch (error) {
    alert("Role check failed: " + error.message);
  }
});

function setupRoleUI(displayName) {
  if (currentRole === "admin") {
    $("welcomeText").innerText = "Welcome Admin";
    $("sidebarMenu").innerHTML = `
      <h2>Admin Panel</h2><hr>
      <p data-page="dashboard" onclick="showPage('dashboard')">Dashboard</p>
      <p data-page="students" onclick="showPage('students')">Students</p>
      <p data-page="teachers" onclick="showPage('teachers')">Teachers</p>
      <p data-page="notices" onclick="showPage('notices')">Notice Board</p>
      <p data-page="homework" onclick="showPage('homework')">Homework</p>
      <p data-page="fees" onclick="showPage('fees')">Fees</p>
      <p data-page="attendance" onclick="showPage('attendance')">Attendance</p>
      <p data-page="monthlyReport" onclick="showPage('monthlyReport')">Monthly Report</p>
      <p data-page="backup" onclick="showPage('backup')">Backup</p>
      <p data-page="activityLog" onclick="showPage('activityLog')">Activity Log</p>
      <p onclick="logout()">Logout</p>
    `;

    show("addStudentBtn", "inline-block");
    show("csvBtn", "inline-block");
    showPage("dashboard");
    return;
  }

  if (currentRole === "teacher") {
    $("welcomeText").innerText = "Welcome " + displayName;
    $("sidebarMenu").innerHTML = `
      <h2>Teacher Panel</h2><hr>
      <p data-page="dashboard" onclick="showPage('dashboard')">Dashboard</p>
      <p data-page="students" onclick="showPage('students')">Students</p>
      <p data-page="notices" onclick="showPage('notices')">Notice Board</p>
      <p data-page="homework" onclick="showPage('homework')">Homework</p>
      <p data-page="attendance" onclick="showPage('attendance')">Attendance</p>
      <p data-page="monthlyReport" onclick="showPage('monthlyReport')">Monthly Report</p>
      <p onclick="logout()">Logout</p>
    `;

    show("addStudentBtn", "inline-block");
    show("csvBtn", "inline-block");
    showTeacherAssignmentNotice();
    showPage("dashboard");
    return;
  }

  if (currentRole === "student") {
    $("welcomeText").innerText = "Welcome " + displayName;
    $("sidebarMenu").innerHTML = `
      <h2>Student Panel</h2><hr>
      <p data-page="dashboard" onclick="showPage('dashboard')">My Dashboard</p>
      <p data-page="students" onclick="showPage('students')">My Record</p>
      <p data-page="homework" onclick="showPage('homework')">My Homework</p>
      <p data-page="fees" onclick="showPage('fees')">My Fees</p>
      <p onclick="logout()">Logout</p>
    `;

    hide("addStudentBtn");
    hide("csvBtn");
    showPage("dashboard");
    return;
  }

  alert("Invalid role");
  signOut(auth);
}

window.showPage = function (page) {
  setActiveNav(page);

  hide("dashboardPage");
  hide("studentsPage");
  hide("noticePage");
  hide("homeworkPage");
  hide("feesPage");
  hide("backupPage");
  hide("activityLogPage");
  hide("teachersPage");
  hide("attendancePage");
  hide("monthlyReportPage");
  closeStudentModal();

  if (page === "dashboard") {
    show("dashboardPage");
    renderTeacherProfileCard();
    return;
  }

  if (page === "students") {
    show("studentsPage");

    if (currentRole === "student") {
      hide("studentButtons");
      hide("addStudentArea");
      show("allStudentsArea");
      hide("studentFilterPanel");
      showStudentRecordOnly();
      return;
    }

    show("studentButtons", "flex");
    show("addStudentBtn", "inline-block");
    hide("addStudentArea");
    hide("allStudentsArea");
    show("studentFilterPanel", "flex");
    return;
  }

  if (page === "attendance") {
    if (currentRole !== "admin" && currentRole !== "teacher") {
      alert("You do not have permission");
      showPage("dashboard");
      return;
    }

    if (currentRole === "teacher") {
      applyTeacherScopedDropdowns();
    }

    show("attendancePage");
    if (currentRole === "teacher") {
      ensureTeacherAttendanceSelection();
    }
    if (!$("attendanceDate").value) {
      $("attendanceDate").value = getTodayParts().date;
    }
    clearAttendanceSheet();
    return;
  }

  if (page === "notices") {
    if (currentRole !== "admin" && currentRole !== "teacher") {
      alert("Only admin and teacher can publish notices");
      showPage("dashboard");
      return;
    }

    show("noticePage");
    renderNoticeBoard();
    return;
  }

  if (page === "homework") {
    if (!["admin", "teacher", "student"].includes(currentRole)) {
      alert("You do not have permission");
      showPage("dashboard");
      return;
    }

    show("homeworkPage");
    setupHomeworkPageForRole();
    loadHomeworkData();
    return;
  }

  if (page === "fees") {
    if (currentRole !== "admin" && currentRole !== "student") {
      alert("Only admin and student can access fees");
      showPage("dashboard");
      return;
    }

    show("feesPage");
    setupFeesPageForRole();
    loadFeeRecords();
    return;
  }

  if (page === "teachers") {
    if (currentRole !== "admin") {
      alert("Only admin can assign teachers");
      showPage("dashboard");
      return;
    }

    show("teachersPage");
    loadTeachersForAssignment();
    return;
  }

  if (page === "backup") {
    if (currentRole !== "admin") {
      alert("Only admin can download backups");
      showPage("dashboard");
      return;
    }

    show("backupPage");
    if ($("backupStatus")) {
      $("backupStatus").innerText = "";
    }
    return;
  }

  if (page === "activityLog") {
    if (currentRole !== "admin") {
      alert("Only admin can view activity logs");
      showPage("dashboard");
      return;
    }

    show("activityLogPage");
    loadActivityLogs();
    return;
  }

  if (page === "monthlyReport") {
    if (currentRole !== "admin" && currentRole !== "teacher") {
      alert("You do not have permission");
      showPage("dashboard");
      return;
    }

    show("monthlyReportPage");

    if (!$("reportMonth").value) {
      $("reportMonth").value = getTodayParts().month;
    }

    updateMonthlyReportSubtitle();
    renderMonthlyReport(monthlyAttendanceData);

    return;
  }
};

async function addActivityLog(action, details = {}) {
  const user = auth.currentUser;

  if (!user) return;

  try {
    await addDoc(collection(db, "activityLogs"), {
      action,
      details,
      userId: user.uid,
      userEmail: user.email || "",
      userName: currentDisplayName || user.email || currentRole,
      userRole: currentRole,
      createdAtMillis: Date.now(),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Activity log failed:", error.message);
  }
}

window.loadActivityLogs = async function () {
  if (currentRole !== "admin") {
    alert("Only admin can view activity logs");
    return;
  }

  try {
    const snap = await getDocs(collection(db, "activityLogs"));
    activityLogs = [];

    snap.forEach((item) => {
      activityLogs.push({ id: item.id, ...item.data() });
    });

    activityLogs.sort((a, b) => Number(b.createdAtMillis || 0) - Number(a.createdAtMillis || 0));
    renderActivityLogs();
  } catch (error) {
    alert("Activity log load failed: " + error.message);
  }
};

window.renderActivityLogs = function () {
  const table = $("activityLogTable");
  const empty = $("emptyActivityLogs");

  if (!table || !empty) return;

  updateActivityCustomDateState();

  const filtered = getFilteredActivityLogs();
  filteredActivityLogs = filtered;

  table.innerHTML = "";
  empty.style.display = filtered.length ? "none" : "block";

  filtered.slice(0, 100).forEach((log) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(formatActivityDate(log.createdAtMillis))}</td>
      <td>${escapeHtml(log.userName || log.userEmail || "-")}</td>
      <td>${escapeHtml(log.userRole || "-")}</td>
      <td>${escapeHtml(log.action || "-")}</td>
      <td>${escapeHtml(formatLogDetails(log.details))}</td>
    `;
    table.appendChild(row);
  });
};

function updateActivityCustomDateState() {
  const customDate = $("activityCustomDate");
  if (!customDate) return;

  customDate.disabled = ($("activityDateFilter")?.value || "all") !== "custom";
}

function getFilteredActivityLogs() {
  const search = ($("activitySearch")?.value || "").trim().toLowerCase();
  const dateFilter = $("activityDateFilter")?.value || "all";
  const customDate = $("activityCustomDate")?.value || "";
  const actionFilter = $("activityActionFilter")?.value || "all";

  return activityLogs.filter((log) => {
    const text = [
      log.action,
      log.userName,
      log.userEmail,
      log.userRole,
      formatLogDetails(log.details)
    ].join(" ").toLowerCase();

    return text.includes(search)
      && activityDateMatches(log.createdAtMillis, dateFilter, customDate)
      && activityActionMatches(log.action, actionFilter);
  });
}

function activityDateMatches(value, dateFilter, customDate) {
  if (dateFilter === "all") return true;
  if (!value) return false;

  const logDate = new Date(value);
  const now = new Date();

  if (dateFilter === "today") {
    return logDate.toDateString() === now.toDateString();
  }

  if (dateFilter === "7days") {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    return logDate >= sevenDaysAgo;
  }

  if (dateFilter === "custom") {
    if (!customDate) return true;
    return getDateInputValue(logDate) === customDate;
  }

  return true;
}

function activityActionMatches(action, filter) {
  if (filter === "all") return true;

  const actionText = String(action || "").toLowerCase();
  const groups = {
    student: ["student"],
    attendance: ["attendance"],
    marks: ["marks", "result"],
    notice: ["notice"],
    homework: ["homework"],
    fees: ["fee", "fees"],
    teacher: ["teacher", "assignment"],
    backup: ["backup", "restore", "repair"]
  };

  return (groups[filter] || []).some((keyword) => actionText.includes(keyword));
}

function getDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

window.downloadActivityLogCSV = function () {
  if (currentRole !== "admin") {
    alert("Only admin can download activity logs");
    return;
  }

  const dataToDownload = filteredActivityLogs.length || hasActivityLogFilter()
    ? filteredActivityLogs
    : activityLogs;

  const rows = dataToDownload.map((log) => [
    formatActivityDate(log.createdAtMillis),
    log.userName || log.userEmail || "",
    log.userEmail || "",
    log.userRole || "",
    log.action || "",
    formatLogDetails(log.details)
  ].map(csvSafe).join(","));

  const csv = "Date Time,User,Email,Role,Action,Details\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "activity-logs.csv";
  link.click();

  URL.revokeObjectURL(url);
};

function hasActivityLogFilter() {
  return Boolean(
    ($("activitySearch")?.value || "").trim() ||
    ($("activityDateFilter")?.value || "all") !== "all" ||
    ($("activityActionFilter")?.value || "all") !== "all"
  );
}

function formatActivityDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatLogDetails(details) {
  if (!details || typeof details !== "object") return "-";

  return Object.entries(details)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join(" | ");
}

function loadNotices() {
  if (unsubscribeNotices) {
    unsubscribeNotices();
    unsubscribeNotices = null;
  }

  unsubscribeNotices = onSnapshot(collection(db, "notices"), (snap) => {
    allNotices = [];
    snap.forEach((item) => allNotices.push({ id: item.id, ...item.data() }));
    allNotices.sort((a, b) =>
      Number(b.createdAtMillis || 0) - Number(a.createdAtMillis || 0)
    );
    renderNoticeBoard();
  }, (error) => {
    console.warn("Notice load failed:", error);
    allNotices = [];
    renderNoticeBoard();
  });
}

function getVisibleNotices() {
  return allNotices.filter((notice) => {
    if (notice.audience === "all") return true;
    if (notice.audience === "students" && currentRole === "student") return true;
    if (notice.audience === "teachers" && currentRole === "teacher") return true;
    return currentRole === "admin";
  });
}

function renderNoticeBoard() {
  renderNoticeList("dashboardNotices", getVisibleNotices().slice(0, 5), false);

  if (currentRole === "admin" || currentRole === "teacher") {
    renderNoticeList("noticeManageList", allNotices, true);
  }
}

function renderNoticeList(containerId, notices, canManage) {
  const container = $(containerId);
  if (!container) return;

  if (!notices.length) {
    container.innerHTML = `<div class="emptyState">No notices found</div>`;
    return;
  }

  container.innerHTML = "";

  notices.forEach((notice) => {
    const item = document.createElement("div");
    item.className = "noticeItem";
    const manageButton = canManage && currentRole === "admin"
      ? `<button class="actionBtn deleteBtn" onclick="deleteNotice('${notice.id}')">Delete</button>`
      : "";

    item.innerHTML = `
      <div class="noticeHeader">
        <div>
          <h4 class="noticeTitle">${escapeHtml(notice.title || "Untitled Notice")}</h4>
          <p class="noticeMeta">
            ${escapeHtml(getNoticeAudienceLabel(notice.audience))}
            | ${escapeHtml(notice.createdByName || "Unknown")}
            | ${escapeHtml(formatNoticeDate(notice.createdAtMillis))}
          </p>
        </div>
        ${manageButton}
      </div>
      <p class="noticeMessage">${escapeHtml(notice.message || "")}</p>
    `;

    container.appendChild(item);
  });
}

function getNoticeAudienceLabel(audience) {
  if (audience === "students") return "Students";
  if (audience === "teachers") return "Teachers";
  return "All";
}

function formatNoticeDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

window.publishNotice = async function () {
  if (currentRole !== "admin" && currentRole !== "teacher") {
    alert("You do not have permission");
    return;
  }

  const title = $("noticeTitle").value.trim();
  const message = $("noticeMessage").value.trim();
  const audience = $("noticeAudience").value;
  const user = auth.currentUser;

  if (!title || !message) {
    alert("Enter notice title and message");
    return;
  }

  try {
    await addDoc(collection(db, "notices"), {
      title,
      message,
      audience,
      createdBy: user ? user.uid : "",
      createdByName: currentDisplayName || currentRole,
      createdByRole: currentRole,
      createdAtMillis: Date.now(),
      createdAt: serverTimestamp()
    });

    await addActivityLog("Notice Published", { title, audience });

    $("noticeTitle").value = "";
    $("noticeMessage").value = "";
    $("noticeAudience").value = "all";
    alert("Notice published successfully");
  } catch (error) {
    alert("Notice publish failed: " + error.message);
  }
};

window.deleteNotice = async function (id) {
  if (currentRole !== "admin") {
    alert("Only admin can delete notices");
    return;
  }

  if (!confirm("Delete this notice?")) return;

  try {
    const notice = allNotices.find((item) => item.id === id);
    await deleteDoc(doc(db, "notices", id));
    await addActivityLog("Notice Deleted", {
      noticeId: id,
      title: notice?.title || "-"
    });
  } catch (error) {
    alert("Notice delete failed: " + error.message);
  }
};

function setupHomeworkPageForRole() {
  if (currentRole === "student") {
    hide("homeworkPublishCard");
    hide("homeworkSubmissionCard");
    $("homeworkListTitle").innerText = "My Homework";
    return;
  }

  show("homeworkPublishCard");
  $("homeworkListTitle").innerText = "Homework";

  if (currentRole === "teacher") {
    applyTeacherScopedDropdowns();

    const classSelect = $("homeworkClass");
    if (classSelect && !classSelect.value && currentTeacherAssignments.length) {
      classSelect.value = currentTeacherAssignments[0].classNameRaw;
      updateTeacherSectionDropdown("homeworkClass", "homeworkSection", "Select Assigned Section", true);
    }
  }
}

window.loadHomeworkData = async function () {
  try {
    const [homeworks, submissions] = await Promise.all([
      loadScopedHomeworks(),
      loadScopedHomeworkSubmissions()
    ]);

    allHomeworks = homeworks;
    allHomeworkSubmissions = submissions;

    allHomeworks.sort((a, b) => Number(b.createdAtMillis || 0) - Number(a.createdAtMillis || 0));
    renderHomeworkList();
  } catch (error) {
    alert("Homework load failed: " + error.message);
  }
};

async function loadScopedHomeworks() {
  if (currentRole === "admin") {
    return getCollectionRows("homeworks");
  }

  if (currentRole === "student") {
    const student = getCurrentStudentRecord();
    if (!student) return [];

    return getCollectionRows(
      "homeworks",
      query(
        collection(db, "homeworks"),
        where("classSection", "==", getClassSectionValue(student.className, student.section))
      )
    );
  }

  return getRowsForAssignedClassSections("homeworks");
}

async function loadScopedHomeworkSubmissions() {
  if (currentRole === "admin") {
    return getCollectionRows("homeworkSubmissions");
  }

  if (currentRole === "student") {
    if (!currentStudentId) return [];

    return getCollectionRows(
      "homeworkSubmissions",
      query(collection(db, "homeworkSubmissions"), where("studentId", "==", currentStudentId))
    );
  }

  return getRowsForAssignedClassSections("homeworkSubmissions");
}

async function getRowsForAssignedClassSections(collectionName) {
  const values = uniqueValues(
    currentTeacherAssignments
      .filter((assignment) => assignment.sectionRaw)
      .map((assignment) => getClassSectionValue(assignment.classNameRaw, assignment.sectionRaw))
  );

  const rows = [];

  for (let index = 0; index < values.length; index += 10) {
    const chunk = values.slice(index, index + 10);
    if (!chunk.length) continue;

    const snap = await getDocs(
      query(collection(db, collectionName), where("classSection", "in", chunk))
    );

    snap.forEach((item) => rows.push({ id: item.id, ...item.data() }));
  }

  return rows;
}

async function getCollectionRows(collectionName, scopedQuery = null) {
  const snap = scopedQuery
    ? await getDocs(scopedQuery)
    : await getDocs(collection(db, collectionName));
  const rows = [];

  snap.forEach((item) => rows.push({ id: item.id, ...item.data() }));

  return rows;
}

window.publishHomework = async function () {
  if (currentRole !== "admin" && currentRole !== "teacher") {
    alert("Only admin and teacher can publish homework");
    return;
  }

  const className = $("homeworkClass").value.trim();
  const section = $("homeworkSection").value.trim();
  const subject = $("homeworkSubject").value.trim();
  const title = $("homeworkTitle").value.trim();
  const deadline = $("homeworkDeadline").value;
  const attachmentUrl = $("homeworkAttachment").value.trim();
  const description = $("homeworkDescription").value.trim();
  const user = auth.currentUser;

  if (!className || !section || !subject || !title || !deadline || !description) {
    alert("Fill class, section, subject, title, deadline, and details");
    return;
  }

  if (currentRole === "teacher" && !canTeacherAccessClassSection(className, section)) {
    alert("You can publish homework only for your assigned class/section");
    return;
  }

  try {
    const docRef = await addDoc(collection(db, "homeworks"), {
      className,
      section,
      classSection: getClassSectionValue(className, section),
      subject,
      title,
      description,
      deadline,
      attachmentUrl,
      createdBy: user ? user.uid : "",
      createdByName: currentDisplayName || currentRole,
      createdByRole: currentRole,
      createdAtMillis: Date.now(),
      createdAt: serverTimestamp()
    });

    await addActivityLog("Homework Published", {
      homeworkId: docRef.id,
      title,
      className,
      section,
      subject,
      deadline
    });

    clearHomeworkForm();
    await loadHomeworkData();
    alert("Homework published successfully");
  } catch (error) {
    alert("Homework publish failed: " + error.message);
  }
};

function clearHomeworkForm() {
  ["homeworkSubject", "homeworkTitle", "homeworkDeadline", "homeworkAttachment", "homeworkDescription"]
    .forEach((id) => {
      if ($(id)) $(id).value = "";
    });
}

function renderHomeworkList() {
  const table = $("homeworkTable");
  const empty = $("emptyHomework");

  if (!table || !empty) return;

  const homeworks = getVisibleHomeworks();
  table.innerHTML = "";
  empty.style.display = homeworks.length ? "none" : "block";

  homeworks.forEach((homework) => {
    const submission = getHomeworkSubmissionForCurrentStudent(homework.id);
    const status = getHomeworkStatus(homework, submission);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(getDisplayClassName(homework.className) || "")}</td>
      <td>${escapeHtml(homework.section || "")}</td>
      <td>${escapeHtml(homework.subject || "")}</td>
      <td>
        <b>${escapeHtml(homework.title || "")}</b>
        <p class="homeworkDetails">${escapeHtml(homework.description || "")}</p>
        ${homework.attachmentUrl ? `<a href="${escapeHtml(homework.attachmentUrl)}" target="_blank">Attachment</a>` : ""}
      </td>
      <td>${escapeHtml(homework.deadline || "-")}</td>
      <td><span class="statusBadge ${getHomeworkStatusClass(status)}">${escapeHtml(status)}</span></td>
      <td>${getHomeworkActionButtons(homework, submission)}</td>
    `;

    table.appendChild(row);
  });
}

function getVisibleHomeworks() {
  return allHomeworks.filter((homework) => {
    if (currentRole === "admin") return true;
    if (currentRole === "teacher") {
      return canTeacherAccessClassSection(homework.className, homework.section);
    }

    const student = getCurrentStudentRecord();
    if (!student) return false;

    return normalizeClassName(student.className) === normalizeClassName(homework.className)
      && normalizeText(student.section) === normalizeText(homework.section);
  });
}

function getHomeworkActionButtons(homework, submission) {
  if (currentRole === "student") {
    const label = submission ? "Update Submission" : "Submit";
    return `<button class="actionBtn editBtn" onclick="submitHomework('${homework.id}')">${label}</button>`;
  }

  const canDelete = currentRole === "admin" || homework.createdBy === auth.currentUser?.uid;

  return `
    <button class="actionBtn" onclick="viewHomeworkSubmissions('${homework.id}')">View Submissions</button>
    ${canDelete ? `<button class="actionBtn deleteBtn" onclick="deleteHomework('${homework.id}')">Delete</button>` : ""}
  `;
}

window.submitHomework = async function (homeworkId) {
  if (currentRole !== "student") {
    alert("Only students can submit homework");
    return;
  }

  const homework = allHomeworks.find((item) => item.id === homeworkId);
  const student = getCurrentStudentRecord();

  if (!homework || !student) {
    alert("Homework or student record not found");
    return;
  }

  const existing = getHomeworkSubmissionForCurrentStudent(homeworkId);
  const submissionText = prompt("Write submission text or paste file/link", existing?.submissionText || "");

  if (submissionText === null) return;
  if (!submissionText.trim()) {
    alert("Submission cannot be empty");
    return;
  }

  const submissionId = `${homeworkId}_${student.id}`;
  const now = Date.now();

  try {
    await setDoc(doc(db, "homeworkSubmissions", submissionId), {
      homeworkId,
      studentDocId: student.id,
      studentId: student.studentId || student.studentEmail || "",
      studentName: student.name || "",
      roll: student.roll || "",
      className: student.className || "",
      section: student.section || "",
      classSection: getClassSectionValue(student.className, student.section),
      submissionText: submissionText.trim(),
      submittedAtMillis: now,
      submittedAt: serverTimestamp(),
      status: isAfterHomeworkDeadline(homework, now) ? "Late" : "Submitted"
    }, { merge: true });

    await addActivityLog("Homework Submitted", {
      homeworkId,
      title: homework.title || "-",
      studentName: student.name || "-"
    });

    await loadHomeworkData();
    alert("Homework submitted successfully");
  } catch (error) {
    alert("Homework submission failed: " + error.message);
  }
};

window.viewHomeworkSubmissions = function (homeworkId) {
  const homework = allHomeworks.find((item) => item.id === homeworkId);

  if (!homework) {
    alert("Homework not found");
    return;
  }

  show("homeworkSubmissionCard");
  $("homeworkSubmissionTitle").innerText = `Submissions - ${homework.title || "Homework"}`;

  const table = $("homeworkSubmissionTable");
  const empty = $("emptyHomeworkSubmissions");
  const submissions = allHomeworkSubmissions
    .filter((submission) => submission.homeworkId === homeworkId)
    .sort((a, b) => Number(a.roll || 0) - Number(b.roll || 0));

  table.innerHTML = "";
  empty.style.display = submissions.length ? "none" : "block";

  submissions.forEach((submission) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(submission.studentName || "-")}</td>
      <td>${escapeHtml(submission.roll || "-")}</td>
      <td><span class="statusBadge ${getHomeworkStatusClass(submission.status)}">${escapeHtml(submission.status || "-")}</span></td>
      <td>${escapeHtml(submission.submissionText || "-")}</td>
      <td>${escapeHtml(formatActivityDate(submission.submittedAtMillis))}</td>
    `;
    table.appendChild(row);
  });
};

window.deleteHomework = async function (homeworkId) {
  const homework = allHomeworks.find((item) => item.id === homeworkId);
  const canDelete = currentRole === "admin" || homework?.createdBy === auth.currentUser?.uid;

  if (!canDelete) {
    alert("You do not have permission to delete this homework");
    return;
  }

  if (!confirm("Delete this homework? Existing submissions will remain for record.")) return;

  try {
    await deleteDoc(doc(db, "homeworks", homeworkId));
    await addActivityLog("Homework Deleted", {
      homeworkId,
      title: homework?.title || "-"
    });
    await loadHomeworkData();
  } catch (error) {
    alert("Homework delete failed: " + error.message);
  }
};

function getCurrentStudentRecord() {
  return allData.find((student) =>
    normalizeText(student.studentId) === normalizeText(currentStudentId)
    || normalizeText(student.studentEmail) === normalizeText(currentStudentId)
  ) || allData[0] || null;
}

function getHomeworkSubmissionForCurrentStudent(homeworkId) {
  const student = getCurrentStudentRecord();
  if (!student) return null;

  return allHomeworkSubmissions.find((submission) =>
    submission.homeworkId === homeworkId
    && (
      submission.studentDocId === student.id
      || normalizeText(submission.studentId) === normalizeText(currentStudentId)
    )
  ) || null;
}

function getHomeworkStatus(homework, submission) {
  if (submission) {
    return submission.status || (isAfterHomeworkDeadline(homework, submission.submittedAtMillis) ? "Late" : "Submitted");
  }

  return isAfterHomeworkDeadline(homework) ? "Late" : "Pending";
}

function isAfterHomeworkDeadline(homework, timestamp = Date.now()) {
  if (!homework?.deadline) return false;

  const deadlineEnd = new Date(homework.deadline + "T23:59:59").getTime();
  return timestamp > deadlineEnd;
}

function getHomeworkStatusClass(status) {
  if (status === "Submitted") return "statusSubmitted";
  if (status === "Late") return "statusLate";
  return "statusPending";
}

function setupFeesPageForRole() {
  if (currentRole === "student") {
    hide("feeCreateCard");
    $("feeListTitle").innerText = "My Fees";
    return;
  }

  show("feeCreateCard");
  $("feeListTitle").innerText = "Fees";

  if (!$("feeMonth").value) {
    $("feeMonth").value = getTodayParts().month;
  }
}

window.loadFeeRecords = async function () {
  try {
    allFeeRecords = await loadScopedFeeRecords();
    allFeeRecords.sort((a, b) => {
      const statusOrder = getFeeStatus(a).localeCompare(getFeeStatus(b));
      if (statusOrder !== 0) return statusOrder;
      return String(b.feeMonth || "").localeCompare(String(a.feeMonth || ""));
    });

    renderFees();
  } catch (error) {
    alert("Fee records load failed: " + error.message);
  }
};

async function loadScopedFeeRecords() {
  if (currentRole === "admin") {
    return getCollectionRows("feeRecords");
  }

  if (currentRole === "student") {
    const student = getCurrentStudentRecord();
    const studentIds = uniqueValues([
      currentStudentId,
      student?.studentId,
      student?.studentEmail
    ].filter(Boolean));

    if (!studentIds.length) return [];

    return getRowsByFieldValues("feeRecords", "studentId", studentIds);
  }

  return [];
}

async function getRowsByFieldValues(collectionName, fieldName, values) {
  const rows = [];

  for (let index = 0; index < values.length; index += 10) {
    const chunk = values.slice(index, index + 10);
    if (!chunk.length) continue;

    const snap = await getDocs(
      query(collection(db, collectionName), where(fieldName, "in", chunk))
    );

    snap.forEach((item) => rows.push({ id: item.id, ...item.data() }));
  }

  const merged = new Map();
  rows.forEach((row) => merged.set(row.id, row));
  return Array.from(merged.values());
}

window.generateFees = async function () {
  if (currentRole !== "admin") {
    alert("Only admin can generate fees");
    return;
  }

  const className = $("feeClass").value.trim();
  const section = $("feeSection").value.trim();
  const feeType = $("feeType").value.trim();
  const feeMonth = $("feeMonth").value;
  const amount = Number($("feeAmount").value || 0);
  const dueDate = $("feeDueDate").value;

  if (!className || !section || !feeType || !feeMonth || !amount || !dueDate) {
    alert("Fill class, section, fee type, month, amount, and due date");
    return;
  }

  const students = allData.filter((student) =>
    normalizeClassName(student.className) === normalizeClassName(className)
    && normalizeText(student.section) === normalizeText(section)
  );

  if (!students.length) {
    alert("No students found for this class and section");
    return;
  }

  if (!confirm(`Generate ${feeType} for ${students.length} students?`)) return;

  const feeTypeKey = normalizeFeeType(feeType);
  let added = 0;
  let skipped = 0;

  try {
    for (const student of students) {
      const feeId = `${feeMonth}_${feeTypeKey}_${student.id}`;
      const feeRef = doc(db, "feeRecords", feeId);
      const existing = await getDoc(feeRef);

      if (existing.exists()) {
        skipped++;
        continue;
      }

      await setDoc(feeRef, {
        studentDocId: student.id,
        studentId: student.studentId || student.studentEmail || "",
        studentName: student.name || "",
        roll: student.roll || "",
        className: student.className || className,
        section: student.section || section,
        classSection: getClassSectionValue(student.className || className, student.section || section),
        feeType,
        feeTypeKey,
        feeMonth,
        amount,
        totalAmount: amount,
        paidAmount: 0,
        dueAmount: amount,
        payments: [],
        dueDate,
        status: "Due",
        paidAtMillis: null,
        createdAtMillis: Date.now(),
        createdAt: serverTimestamp()
      });

      added++;
    }

    await addActivityLog("Fees Generated", {
      className,
      section,
      feeType,
      feeMonth,
      amount,
      added,
      skipped
    });

    await loadFeeRecords();
    alert(`Fees generated. Added: ${added}, Skipped existing: ${skipped}`);
  } catch (error) {
    alert("Fee generation failed: " + error.message);
  }
};

function renderFees() {
  const table = $("feeTable");
  const empty = $("emptyFees");

  if (!table || !empty) return;

  const records = getFilteredFeeRecords();
  table.innerHTML = "";
  empty.style.display = records.length ? "none" : "block";

  records.forEach((fee) => {
    const summary = getFeeSummary(fee);
    const status = summary.status;
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <b>${escapeHtml(fee.studentName || "-")}</b>
        <p class="homeworkDetails">Roll: ${escapeHtml(fee.roll || "-")}</p>
      </td>
      <td>${escapeHtml(getDisplayClassName(fee.className) || "")}</td>
      <td>${escapeHtml(fee.section || "")}</td>
      <td>${escapeHtml(fee.feeType || "")}</td>
      <td>${escapeHtml(fee.feeMonth || "")}</td>
      <td>${escapeHtml(formatMoney(summary.totalAmount))}</td>
      <td>${escapeHtml(formatMoney(summary.paidAmount))}</td>
      <td>${escapeHtml(formatMoney(summary.dueAmount))}</td>
      <td>${escapeHtml(fee.dueDate || "-")}</td>
      <td><span class="statusBadge ${getFeeStatusClass(status)}">${escapeHtml(status)}</span></td>
      <td>${getFeeActionButtons(fee, status)}</td>
    `;

    table.appendChild(row);
  });
}

function getFilteredFeeRecords() {
  const search = ($("feeSearch")?.value || "").trim().toLowerCase();
  const statusFilter = $("feeStatusFilter")?.value || "all";

  return allFeeRecords.filter((fee) => {
    const summary = getFeeSummary(fee);
    const status = summary.status;
    const text = [
      fee.studentName,
      fee.roll,
      fee.className,
      fee.section,
      fee.feeType,
      fee.feeMonth,
      status,
      summary.totalAmount,
      summary.paidAmount,
      summary.dueAmount
    ].join(" ").toLowerCase();

    return text.includes(search)
      && (statusFilter === "all" || status === statusFilter);
  });
}

function getFeeActionButtons(fee, status) {
  if (currentRole !== "admin") {
    const historyButton = getPaymentHistory(fee).length
      ? `<button class="actionBtn" onclick="viewFeePaymentHistory('${fee.id}')">History</button>`
      : "";
    return historyButton || "-";
  }

  const paidButton = status === "Paid"
    ? ""
    : `<button class="actionBtn editBtn" onclick="addFeePayment('${fee.id}')">Add Payment</button>`;
  const reminderButton = status === "Paid"
    ? ""
    : `<button class="actionBtn" onclick="sendFeeWhatsAppReminder('${fee.id}')">WhatsApp Reminder</button>`;

  return `
    ${paidButton}
    ${reminderButton}
    <button class="actionBtn" onclick="viewFeePaymentHistory('${fee.id}')">History</button>
    <button class="actionBtn deleteBtn" onclick="deleteFeeRecord('${fee.id}')">Delete</button>
  `;
}

window.addFeePayment = async function (feeId) {
  if (currentRole !== "admin") {
    alert("Only admin can add fee payments");
    return;
  }

  const fee = allFeeRecords.find((item) => item.id === feeId);
  if (!fee) {
    alert("Fee record not found");
    return;
  }

  const summary = getFeeSummary(fee);
  const paymentAmountInput = prompt("Payment amount", summary.dueAmount || summary.totalAmount);
  if (paymentAmountInput === null) return;

  const paymentAmount = Number(paymentAmountInput || 0);

  if (!paymentAmount || paymentAmount <= 0) {
    alert("Enter a valid payment amount");
    return;
  }

  if (paymentAmount > summary.dueAmount) {
    alert("Payment amount cannot be greater than due amount");
    return;
  }

  const now = Date.now();
  const previousPayments = getPaymentHistory(fee);
  const newPayment = {
    amount: paymentAmount,
    paidAtMillis: now,
    paidBy: auth.currentUser ? auth.currentUser.uid : "",
    paidByName: currentDisplayName || "Admin"
  };
  const payments = [...previousPayments, newPayment];
  const paidAmount = payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const dueAmount = Math.max(summary.totalAmount - paidAmount, 0);
  const status = dueAmount <= 0 ? "Paid" : "Partial";

  try {
    await updateDoc(doc(db, "feeRecords", feeId), {
      status,
      totalAmount: summary.totalAmount,
      paidAmount,
      dueAmount,
      payments,
      paidAtMillis: now,
      paidAt: serverTimestamp(),
      paidBy: auth.currentUser ? auth.currentUser.uid : ""
    });

    await addActivityLog("Fee Payment Added", {
      feeId,
      studentName: fee.studentName || "-",
      feeType: fee.feeType || "-",
      feeMonth: fee.feeMonth || "-",
      paymentAmount,
      paidAmount,
      dueAmount,
      status
    });

    await loadFeeRecords();
  } catch (error) {
    alert("Fee payment update failed: " + error.message);
  }
};

window.markFeePaid = window.addFeePayment;

window.sendFeeWhatsAppReminder = async function (feeId) {
  if (currentRole !== "admin") {
    alert("Only admin can send fee reminders");
    return;
  }

  const fee = allFeeRecords.find((item) => item.id === feeId);

  if (!fee) {
    alert("Fee record not found");
    return;
  }

  const student = getStudentForFee(fee);
  const phone = student?.guardianPhone || student?.emergencyContact || "";
  const whatsappPhone = formatWhatsAppPhone(phone);

  if (!whatsappPhone) {
    alert("Guardian phone not found for this student");
    return;
  }

  const summary = getFeeSummary(fee);
  const message = buildFeeReminderMessage(fee, student, summary);
  const url = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;

  window.open(url, "_blank");

  await addActivityLog("Fee WhatsApp Reminder Opened", {
    feeId,
    studentName: fee.studentName || student?.name || "-",
    guardianPhone: phone,
    dueAmount: summary.dueAmount,
    feeType: fee.feeType || "-"
  });
};

window.viewFeePaymentHistory = function (feeId) {
  const fee = allFeeRecords.find((item) => item.id === feeId);

  if (!fee) {
    alert("Fee record not found");
    return;
  }

  const payments = getPaymentHistory(fee);

  if (!payments.length) {
    alert("No payment history found");
    return;
  }

  const lines = payments.map((payment, index) => {
    return `${index + 1}. ${formatMoney(payment.amount)} - ${formatActivityDate(payment.paidAtMillis)} - ${payment.paidByName || "Admin"}`;
  });

  alert(`Payment History\n${fee.studentName || "-"} | ${fee.feeType || "-"} | ${fee.feeMonth || "-"}\n\n${lines.join("\n")}`);
};

window.deleteFeeRecord = async function (feeId) {
  if (currentRole !== "admin") {
    alert("Only admin can delete fee records");
    return;
  }

  const fee = allFeeRecords.find((item) => item.id === feeId);
  if (!confirm("Delete this fee record?")) return;

  try {
    await deleteDoc(doc(db, "feeRecords", feeId));
    await addActivityLog("Fee Record Deleted", {
      feeId,
      studentName: fee?.studentName || "-",
      feeType: fee?.feeType || "-"
    });
    await loadFeeRecords();
  } catch (error) {
    alert("Fee delete failed: " + error.message);
  }
};

function getFeeStatus(fee) {
  return getFeeSummary(fee).status;
}

function getFeeStatusClass(status) {
  if (status === "Paid") return "statusSubmitted";
  if (status === "Partial") return "statusPartial";
  if (status === "Overdue") return "statusLate";
  return "statusPending";
}

function getFeeSummary(fee) {
  const totalAmount = Number(fee.totalAmount ?? fee.amount ?? 0);
  const paymentHistory = getPaymentHistory(fee);
  const paidFromHistory = paymentHistory.reduce((total, payment) => {
    return total + Number(payment.amount || 0);
  }, 0);
  const paidAmount = Math.min(
    Number(fee.paidAmount ?? paidFromHistory ?? 0),
    totalAmount
  );
  const dueAmount = Math.max(totalAmount - paidAmount, 0);
  let status = "Due";

  if (dueAmount <= 0 && totalAmount > 0) {
    status = "Paid";
  } else if (paidAmount > 0) {
    status = "Partial";
  } else if (fee.dueDate && new Date() > new Date(fee.dueDate + "T23:59:59")) {
    status = "Overdue";
  }

  return {
    totalAmount,
    paidAmount,
    dueAmount,
    status
  };
}

function getPaymentHistory(fee) {
  if (Array.isArray(fee.payments) && fee.payments.length) {
    return fee.payments;
  }

  if (Number(fee.paidAmount || 0) > 0) {
    return [{
      amount: Number(fee.paidAmount || 0),
      paidAtMillis: fee.paidAtMillis || null,
      paidBy: fee.paidBy || "",
      paidByName: "Admin"
    }];
  }

  return [];
}

function getStudentForFee(fee) {
  return allData.find((student) =>
    student.id === fee.studentDocId
    || normalizeText(student.studentId) === normalizeText(fee.studentId)
    || normalizeText(student.studentEmail) === normalizeText(fee.studentId)
  ) || null;
}

function formatWhatsAppPhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");

  if (!digits) return "";

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith("01")) {
    return "88" + digits;
  }

  if (digits.length === 10 && digits.startsWith("1")) {
    return "880" + digits;
  }

  return digits;
}

function buildFeeReminderMessage(fee, student, summary) {
  const studentName = fee.studentName || student?.name || "your child";
  const guardianName = student?.fatherName || student?.motherName || "Guardian";
  const feeType = fee.feeType || "School Fee";
  const month = fee.feeMonth || "-";
  const dueDate = fee.dueDate || "-";
  const dueAmount = formatMoney(summary.dueAmount);
  const paidAmount = formatMoney(summary.paidAmount);
  const totalAmount = formatMoney(summary.totalAmount);

  return [
    `Dear ${guardianName},`,
    `This is a reminder from FH School Management System.`,
    `Student: ${studentName}`,
    `Fee: ${feeType}`,
    `Month: ${month}`,
    `Total: ${totalAmount}`,
    `Paid: ${paidAmount}`,
    `Due: ${dueAmount}`,
    `Due Date: ${dueDate}`,
    `Please clear the due amount as soon as possible.`
  ].join("\n");
}

function normalizeFeeType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "fee";
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

window.downloadFullBackup = async function () {
  if (currentRole !== "admin") {
    alert("Only admin can download backup");
    return;
  }

  const status = $("backupStatus");
  if (status) status.innerText = "Preparing backup...";

  try {
    const backup = {
      app: "FH School Management System",
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: auth.currentUser ? auth.currentUser.uid : "",
      collections: {
        students: await getCollectionBackup("students"),
        attendanceRecords: await getCollectionBackup("attendanceRecords"),
        notices: await getCollectionBackup("notices"),
        users: await getCollectionBackup("users"),
        homeworks: await getCollectionBackup("homeworks"),
        homeworkSubmissions: await getCollectionBackup("homeworkSubmissions"),
        feeRecords: await getCollectionBackup("feeRecords")
      }
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = getBackupFileStamp();

    link.href = url;
    link.download = `fh-school-backup-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);

    if (status) {
      status.innerText = `Backup downloaded. Students: ${backup.collections.students.length}, Attendance: ${backup.collections.attendanceRecords.length}, Notices: ${backup.collections.notices.length}, Users: ${backup.collections.users.length}, Homework: ${backup.collections.homeworks.length}, Fees: ${backup.collections.feeRecords.length}`;
    }

    await addActivityLog("Backup Downloaded", {
      students: backup.collections.students.length,
      attendanceRecords: backup.collections.attendanceRecords.length,
      notices: backup.collections.notices.length,
      users: backup.collections.users.length,
      homeworks: backup.collections.homeworks.length,
      homeworkSubmissions: backup.collections.homeworkSubmissions.length,
      feeRecords: backup.collections.feeRecords.length
    });
  } catch (error) {
    if (status) status.innerText = "";
    alert("Backup failed: " + error.message);
  }
};

window.repairClassNames = async function () {
  if (currentRole !== "admin") {
    alert("Only admin can repair class names");
    return;
  }

  if (!confirm("Repair class names to standard format like Class 1, Class 2?")) return;

  const status = $("backupStatus");
  if (status) status.innerText = "Repairing class names...";

  try {
    const studentsFixed = await repairCollectionClassNames("students");
    const attendanceFixed = await repairCollectionClassNames("attendanceRecords");
    const homeworkFixed = await repairCollectionClassNames("homeworks");
    const homeworkSubmissionFixed = await repairCollectionClassNames("homeworkSubmissions");
    const feeFixed = await repairCollectionClassNames("feeRecords");

    studentKeyBackfillDone = false;
    attendanceRecordBackfillDone = false;

    if (status) {
      status.innerText = `Repair complete. Students updated: ${studentsFixed}, Attendance records updated: ${attendanceFixed}, Homework updated: ${homeworkFixed}, Submissions updated: ${homeworkSubmissionFixed}, Fees updated: ${feeFixed}`;
    }

    await addActivityLog("Class Names Repaired", {
      studentsUpdated: studentsFixed,
      attendanceRecordsUpdated: attendanceFixed,
      homeworksUpdated: homeworkFixed,
      homeworkSubmissionsUpdated: homeworkSubmissionFixed,
      feeRecordsUpdated: feeFixed
    });

    alert("Class name repair completed");
  } catch (error) {
    if (status) status.innerText = "";
    alert("Repair failed: " + error.message);
  }
};

window.previewRestoreFile = async function () {
  if (currentRole !== "admin") {
    alert("Only admin can preview restore files");
    return;
  }

  const fileInput = $("restoreFile");
  const previewArea = $("restorePreviewArea");

  if (!fileInput || !fileInput.files || !fileInput.files.length) {
    alert("Select a JSON backup file first");
    return;
  }

  try {
    const text = await fileInput.files[0].text();
    const backup = JSON.parse(text);
    const validation = validateBackupFile(backup);

    renderRestorePreview(backup, validation, fileInput.files[0].name);
    show("restorePreviewArea");
  } catch (error) {
    if (previewArea) {
      previewArea.innerHTML = `
        <div class="restoreWarning">
          Invalid backup file: ${escapeHtml(error.message)}
        </div>
      `;
      show("restorePreviewArea");
    }
  }
};

window.compareRestoreFile = async function () {
  if (currentRole !== "admin") {
    alert("Only admin can compare restore files");
    return;
  }

  const fileInput = $("restoreFile");
  const previewArea = $("restorePreviewArea");

  if (!fileInput || !fileInput.files || !fileInput.files.length) {
    alert("Select a JSON backup file first");
    return;
  }

  try {
    const text = await fileInput.files[0].text();
    const backup = JSON.parse(text);
    const validation = validateBackupFile(backup);

    renderRestorePreview(backup, validation, fileInput.files[0].name);
    show("restorePreviewArea");

    if (!validation.isValid) return;

    const compareRows = await getRestoreCompareRows(backup);
    renderRestoreCompare(compareRows);
  } catch (error) {
    if (previewArea) {
      previewArea.innerHTML = `
        <div class="restoreWarning">
          Compare failed: ${escapeHtml(error.message)}
        </div>
      `;
      show("restorePreviewArea");
    }
  }
};

window.restoreNewBackupData = async function () {
  if (currentRole !== "admin") {
    alert("Only admin can restore backup data");
    return;
  }

  const fileInput = $("restoreFile");
  const previewArea = $("restorePreviewArea");
  const confirmInput = $("restoreConfirm");

  if (!fileInput || !fileInput.files || !fileInput.files.length) {
    alert("Select a JSON backup file first");
    return;
  }

  if (!confirmInput || !confirmInput.checked) {
    alert("Please tick the restore confirmation checkbox first");
    return;
  }

  if (!confirm("Restore only new data from this backup? Existing documents will be skipped.")) {
    return;
  }

  try {
    const text = await fileInput.files[0].text();
    const backup = JSON.parse(text);
    const validation = validateBackupFile(backup);

    renderRestorePreview(backup, validation, fileInput.files[0].name);
    show("restorePreviewArea");

    if (!validation.isValid) {
      alert("Backup file has validation warnings. Fix the file before restore.");
      return;
    }

    if (previewArea) {
      previewArea.insertAdjacentHTML(
        "beforeend",
        `<div class="restoreWarning restoreRunning">Restore running. Please wait...</div>`
      );
    }

    const resultRows = await restoreOnlyNewDocuments(backup);
    renderRestoreResult(resultRows);
    await addActivityLog("Backup Restored New Data", summarizeRestoreRows(resultRows));
    confirmInput.checked = false;
  } catch (error) {
    if (previewArea) {
      previewArea.innerHTML = `
        <div class="restoreWarning">
          Restore failed: ${escapeHtml(error.message)}
        </div>
      `;
      show("restorePreviewArea");
    }
  }
};

function validateBackupFile(backup) {
  const warnings = [];

  if (!backup || typeof backup !== "object") {
    warnings.push("Backup file is not a valid JSON object.");
    return { isValid: false, warnings };
  }

  if (!backup.collections || typeof backup.collections !== "object") {
    warnings.push("Missing collections object.");
    return { isValid: false, warnings };
  }

  ["students", "attendanceRecords", "notices", "users"].forEach((collectionName) => {
    if (!Array.isArray(backup.collections[collectionName])) {
      warnings.push(`${collectionName} collection is missing or not an array.`);
    }
  });

  Object.entries(backup.collections || {}).forEach(([collectionName, rows]) => {
    if (!Array.isArray(rows)) return;

    rows.forEach((row, index) => {
      if (!row || typeof row !== "object" || !row.id || !row.data) {
        warnings.push(`${collectionName} item ${index + 1} is missing id or data.`);
      }
    });
  });

  return {
    isValid: warnings.length === 0,
    warnings
  };
}

function renderRestorePreview(backup, validation, fileName) {
  const previewArea = $("restorePreviewArea");
  if (!previewArea) return;

  const collections = backup.collections || {};
  const summaryItems = backupCollectionNames
    .map((collectionName) => {
      const count = Array.isArray(collections[collectionName])
        ? collections[collectionName].length
        : 0;

      return `
        <div class="restoreSummaryItem">
          <b>${escapeHtml(getBackupCollectionLabel(collectionName))}</b>
          <p>${count}</p>
        </div>
      `;
    })
    .join("");

  const warningsHtml = validation.warnings.length
    ? `
      <div class="restoreWarning">
        <b>Warnings</b>
        <ul>
          ${validation.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
        </ul>
      </div>
    `
    : "";

  previewArea.innerHTML = `
    <div class="restorePreviewHeader">
      <b>${validation.isValid ? "Backup file looks valid" : "Backup file needs attention"}</b>
      <p>File: ${escapeHtml(fileName)}</p>
      <p>Exported at: ${escapeHtml(backup.exportedAt || "-")}</p>
      <p>App: ${escapeHtml(backup.app || "-")} | Version: ${escapeHtml(String(backup.version || "-"))}</p>
    </div>
    <div class="restoreSummaryGrid">
      ${summaryItems}
    </div>
    ${warningsHtml}
  `;
}

async function getRestoreCompareRows(backup) {
  const rows = [];

  for (const collectionName of backupCollectionNames) {
    const backupRows = Array.isArray(backup.collections?.[collectionName])
      ? backup.collections[collectionName]
      : [];
    const currentSnap = await getDocs(collection(db, collectionName));
    const currentIds = new Set();

    currentSnap.forEach((docSnap) => currentIds.add(docSnap.id));

    const backupIds = backupRows
      .map((row) => row.id)
      .filter(Boolean);
    const existing = backupIds.filter((id) => currentIds.has(id)).length;
    const newItems = backupIds.length - existing;

    rows.push({
      collectionName,
      backupCount: backupIds.length,
      currentCount: currentIds.size,
      existing,
      newItems
    });
  }

  return rows;
}

function renderRestoreCompare(rows) {
  const previewArea = $("restorePreviewArea");
  if (!previewArea) return;

  const html = `
    <table class="compareTable">
      <thead>
        <tr>
          <th>Collection</th>
          <th>Backup</th>
          <th>Current DB</th>
          <th>Existing IDs</th>
          <th>New IDs</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(getBackupCollectionLabel(row.collectionName))}</td>
            <td>${row.backupCount}</td>
            <td>${row.currentCount}</td>
            <td>${row.existing}</td>
            <td>${row.newItems}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="restoreWarning">
      Dry-run only. No data was restored or changed.
    </div>
  `;

  previewArea.insertAdjacentHTML("beforeend", html);
}

async function restoreOnlyNewDocuments(backup) {
  const resultRows = [];

  for (const collectionName of backupCollectionNames) {
    const backupRows = Array.isArray(backup.collections?.[collectionName])
      ? backup.collections[collectionName]
      : [];

    const result = {
      collectionName,
      added: 0,
      skipped: 0,
      failed: 0
    };

    for (const row of backupRows) {
      if (!row?.id || !row?.data) {
        result.failed++;
        continue;
      }

      try {
        const targetRef = doc(db, collectionName, row.id);
        const existingSnap = await getDoc(targetRef);

        if (existingSnap.exists()) {
          result.skipped++;
          continue;
        }

        await setDoc(targetRef, row.data);
        result.added++;
      } catch (error) {
        console.error("Restore item failed", collectionName, row.id, error);
        result.failed++;
      }
    }

    resultRows.push(result);
  }

  return resultRows;
}

function renderRestoreResult(rows) {
  const previewArea = $("restorePreviewArea");
  if (!previewArea) return;

  previewArea.querySelector(".restoreRunning")?.remove();

  const failedCount = rows.reduce((total, row) => total + row.failed, 0);

  const html = `
    <table class="compareTable">
      <thead>
        <tr>
          <th>Collection</th>
          <th>Added</th>
          <th>Skipped Existing</th>
          <th>Failed</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(getBackupCollectionLabel(row.collectionName))}</td>
            <td>${row.added}</td>
            <td>${row.skipped}</td>
            <td>${row.failed}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="${failedCount ? "restoreWarning" : "restoreSuccess"}">
      Restore complete. Existing documents were skipped. ${failedCount ? "Some records failed; check the table above." : "No failed records."}
    </div>
  `;

  previewArea.insertAdjacentHTML("beforeend", html);
}

function summarizeRestoreRows(rows) {
  return rows.reduce((summary, row) => {
    summary[`${row.collectionName}Added`] = row.added;
    summary[`${row.collectionName}Skipped`] = row.skipped;
    summary[`${row.collectionName}Failed`] = row.failed;
    return summary;
  }, {});
}

function getBackupCollectionLabel(collectionName) {
  if (collectionName === "attendanceRecords") return "Attendance";
  if (collectionName === "homeworkSubmissions") return "Homework Submissions";
  return collectionName.charAt(0).toUpperCase() + collectionName.slice(1);
}

async function repairCollectionClassNames(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  const updates = [];

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const className = getDisplayClassName(data.className);
    const section = data.section || "";
    const classSection = getClassSectionValue(className, section);

    if (data.className !== className || data.classSection !== classSection) {
      updates.push(updateDoc(doc(db, collectionName, docSnap.id), {
        className,
        classSection
      }));
    }
  });

  await Promise.all(updates);
  return updates.length;
}

async function getCollectionBackup(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  const rows = [];

  snap.forEach((docSnap) => {
    rows.push({
      id: docSnap.id,
      data: docSnap.data()
    });
  });

  return rows;
}

function getBackupFileStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}-${hour}${minute}`;
}

function normalizeTeacherAssignments(userData) {
  const assignments = [];

  if (Array.isArray(userData.assignedClasses)) {
    userData.assignedClasses.forEach((item) => {
      if (!item) return;

      assignments.push({
        className: item.className || item.class || item.assignedClass || "",
        section: item.section || item.assignedSection || ""
      });
    });
  }

  if (Array.isArray(userData.assignedClassSections)) {
    userData.assignedClassSections.forEach((value) => {
      const parts = String(value || "").split("|");

      assignments.push({
        className: parts[0] || "",
        section: parts[1] || ""
      });
    });
  }

  if (userData.assignedClass || userData.assignedClassName || userData.className) {
    assignments.push({
      className: userData.assignedClass || userData.assignedClassName || userData.className || "",
      section: userData.assignedSection || userData.section || ""
    });
  }

  const seen = new Set();

  return assignments
    .map((item) => ({
      classNameRaw: String(item.className || "").trim(),
      sectionRaw: String(item.section || "").trim(),
      className: normalizeClassName(item.className),
      section: normalizeText(item.section)
    }))
    .filter((item) => {
      if (!item.className) return false;

      const key = `${item.className}|${item.section}`;
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeClassName(value) {
  const text = normalizeText(value);
  const numberMatch = text.match(/^(?:class\s*)?(\d+)$/);

  if (numberMatch) {
    return `class ${numberMatch[1]}`;
  }

  return text.replace(/\s+/g, " ");
}

function getDisplayClassName(value) {
  const normalized = normalizeClassName(value);
  const numberMatch = normalized.match(/^class\s+(\d+)$/);

  if (numberMatch) {
    return `Class ${numberMatch[1]}`;
  }

  if (normalized === "kg") return "KG";
  if (normalized === "play") return "Play";
  if (normalized === "nursery") return "Nursery";

  return String(value || "").trim();
}

function getClassNameVariants(className) {
  const raw = String(className || "").trim();
  const normalized = normalizeClassName(raw);
  const numberMatch = normalized.match(/^class\s+(\d+)$/);
  const variants = [raw];

  if (numberMatch) {
    variants.push(numberMatch[1], `Class ${numberMatch[1]}`, `class ${numberMatch[1]}`);
  } else if (raw) {
    variants.push(normalized);
  }

  return uniqueValues(variants);
}

function getClassSectionVariants(className, section) {
  return getClassNameVariants(className).map((classVariant) =>
    getClassSectionValue(classVariant, section)
  );
}

function canTeacherAccessClassSection(className, section) {
  if (currentRole !== "teacher") return true;
  if (!currentTeacherAssignments.length) return false;

  const targetClass = normalizeClassName(className);
  const targetSection = normalizeText(section);

  return currentTeacherAssignments.some((assignment) =>
    normalizeClassName(assignment.classNameRaw) === targetClass &&
    (!assignment.section || assignment.section === targetSection)
  );
}

function canTeacherAccessStudent(student) {
  return canTeacherAccessClassSection(student.className, student.section);
}

function canTeacherAccessAttendanceRecord(record) {
  return canTeacherAccessClassSection(record.className, record.section);
}

function showTeacherAssignmentNotice() {
  if (currentRole !== "teacher") return;

  if (!currentTeacherAssignments.length) {
    alert("No class/section assigned for this teacher. Please ask admin to assign a class.");
  }
}

function renderTeacherProfileCard() {
  if (currentRole !== "teacher") {
    hide("teacherProfileCard");
    return;
  }

  show("teacherProfileCard");
  $("teacherProfileName").innerText = currentDisplayName || "-";

  if (!currentTeacherAssignments.length) {
    $("teacherAssignmentList").innerHTML = `<span class="assignmentBadge">No class assigned</span>`;
    return;
  }

  $("teacherAssignmentList").innerHTML = currentTeacherAssignments
    .map((assignment) => {
      const label = assignment.sectionRaw
        ? `${assignment.classNameRaw} - Section ${assignment.sectionRaw}`
        : `${assignment.classNameRaw} - All sections`;

      return `<span class="assignmentBadge">${escapeHtml(label)}</span>`;
    })
    .join("");
}

function setActiveNav(page) {
  document.querySelectorAll("#sidebarMenu p[data-page]").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });
}

function showStudentRecordOnly() {
  hide("studentFilterPanel");
  const ownRecord = allData.length ? [allData[0]] : [];
  renderStudents(ownRecord);
}

window.showAddStudent = function () {
  if (currentRole !== "admin" && currentRole !== "teacher") {
    alert("You do not have permission");
    return;
  }

  closeStudentModal();
  show("addStudentArea");
  hide("allStudentsArea");
};

window.showAllStudents = function () {
  show("allStudentsArea");
  hide("addStudentArea");
  closeStudentModal();

  if (currentRole === "student") {
    hide("studentButtons");
    hide("studentFilterPanel");
    renderStudents(allData.length ? [allData[0]] : []);
    return;
  }

  show("studentButtons", "flex");
  show("addStudentBtn", "inline-block");
  show("studentFilterPanel", "flex");
  applyFilters();
};

function loadStudents() {
  if (unsubscribeStudents) {
    unsubscribeStudents();
    unsubscribeStudents = null;
  }

  if (currentRole === "teacher") {
    loadAssignedTeacherStudents();
    return;
  }

  const ref = currentRole === "student"
    ? query(collection(db, "students"), where("studentId", "==", currentStudentId))
    : collection(db, "students");

  unsubscribeStudents = onSnapshot(ref, (snap) => {
    const loadedData = [];
    snap.forEach((item) => loadedData.push({ id: item.id, ...item.data() }));
    updateStudentViews(loadedData);
  }, (error) => {
    updateStudentViews([]);
    alert("Student data load failed: " + error.message);
  });
}

function loadAssignedTeacherStudents() {
  if (!currentTeacherAssignments.length) {
    updateStudentViews([]);
    return;
  }

  const teacherQueries = currentTeacherAssignments
    .filter((assignment) => assignment.sectionRaw)
    .flatMap((assignment) => {
      const classSectionQueries = getClassSectionVariants(
        assignment.classNameRaw,
        assignment.sectionRaw
      ).map((classSection) => ({
        mode: "classSection",
        classSection
      }));

      const legacyQueries = getClassNameVariants(assignment.classNameRaw).map((className) => ({
        mode: "legacy",
        className,
        section: assignment.sectionRaw
      }));

      return [...classSectionQueries, ...legacyQueries];
    });

  const assignmentResults = teacherQueries.map(() => new Map());
  const unsubscribes = teacherQueries.map((teacherQuery, index) => {
    const studentsRef = teacherQuery.mode === "classSection"
      ? query(
          collection(db, "students"),
          where("classSection", "==", teacherQuery.classSection)
        )
      : query(
          collection(db, "students"),
          where("className", "==", teacherQuery.className),
          where("section", "==", teacherQuery.section)
        );

    return onSnapshot(studentsRef, (snap) => {
      assignmentResults[index].clear();

      snap.forEach((item) => {
        assignmentResults[index].set(item.id, { id: item.id, ...item.data() });
      });

      const merged = new Map();
      assignmentResults.forEach((result) => {
        result.forEach((student, id) => merged.set(id, student));
      });

      updateStudentViews(Array.from(merged.values()).filter(canTeacherAccessStudent));
    }, (error) => {
      console.warn("Assigned student data load failed:", error);

      if (!allData.length) {
        updateStudentViews([]);
      }
    });
  });

  unsubscribeStudents = () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
}

function getClassSectionValue(className, section) {
  return `${String(className || "").trim()}|${String(section || "").trim()}`;
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function updateStudentViews(data) {
  allData = data;

  backfillStudentKeysIfNeeded(allData);
  backfillAttendanceRecordKeysIfNeeded();
  renderTeacherProfileCard();
  updateDashboardStats(allData);
  updateClassWiseDashboard(allData);
  updateStudentProfileAndResult(allData);

  if (currentRole === "student") {
    showStudentRecordOnly();
  } else {
    applyFilters();
  }
}

function backfillStudentKeysIfNeeded(data) {
  if (currentRole !== "admin" || studentKeyBackfillDone) return;

  studentKeyBackfillDone = true;

  const updates = data
    .filter((student) => {
      const expectedClassName = getDisplayClassName(student.className);
      const expectedClassSection = getClassSectionValue(expectedClassName, student.section);
      const expectedRollKey = normalizeRoll(student.roll);

      return student.className !== expectedClassName ||
        student.classSection !== expectedClassSection ||
        student.rollKey !== expectedRollKey;
    })
    .map((student) => updateDoc(doc(db, "students", student.id), {
      className: getDisplayClassName(student.className),
      classSection: getClassSectionValue(getDisplayClassName(student.className), student.section),
      rollKey: normalizeRoll(student.roll)
    }));

  if (!updates.length) return;

  Promise.all(updates)
    .then(() => console.log(`Backfilled ${updates.length} student records`))
    .catch((error) => console.warn("Student key backfill failed:", error));
}

async function backfillAttendanceRecordKeysIfNeeded() {
  if (currentRole !== "admin" || attendanceRecordBackfillDone) return;

  attendanceRecordBackfillDone = true;

  try {
    const snap = await getDocs(collection(db, "attendanceRecords"));
    const updates = [];

    snap.forEach((docSnap) => {
      const record = docSnap.data();
      const expectedClassName = getDisplayClassName(record.className);
      const expectedClassSection = getClassSectionValue(expectedClassName, record.section);

      if (record.className !== expectedClassName || record.classSection !== expectedClassSection) {
        updates.push(updateDoc(doc(db, "attendanceRecords", docSnap.id), {
          className: expectedClassName,
          classSection: expectedClassSection
        }));
      }
    });

    if (updates.length) {
      await Promise.all(updates);
      console.log(`Backfilled ${updates.length} attendance records`);
    }
  } catch (error) {
    console.warn("Attendance record backfill failed:", error);
  }
}

window.loadTeachersForAssignment = async function () {
  if (currentRole !== "admin") {
    alert("Only admin can assign teachers");
    return;
  }

  const table = $("teachersTable");
  table.innerHTML = `<tr><td colspan="4">Loading teachers...</td></tr>`;

  try {
    const snap = await getDocs(
      query(collection(db, "users"), where("role", "==", "teacher"))
    );

    const teachers = [];
    snap.forEach((docSnap) => {
      teachers.push({ id: docSnap.id, ...docSnap.data() });
    });

    renderTeachersAssignmentTable(teachers);
  } catch (error) {
    alert("Teacher list load failed: " + error.message);
    table.innerHTML = `<tr><td colspan="4">Teacher list load failed</td></tr>`;
  }
};

window.addTeacherProfile = async function () {
  if (currentRole !== "admin") {
    alert("Only admin can add teacher profiles");
    return;
  }

  const uid = $("newTeacherUid").value.trim();
  const name = $("newTeacherName").value.trim();
  const email = $("newTeacherEmail").value.trim();

  if (!uid || !name || !email) {
    alert("Enter teacher UID, name, and email");
    return;
  }

  try {
    await setDoc(doc(db, "users", uid), {
      name,
      email,
      role: "teacher",
      assignedClassSections: []
    }, { merge: true });

    await addActivityLog("Teacher Profile Added", { teacherUid: uid, name, email });

    $("newTeacherUid").value = "";
    $("newTeacherName").value = "";
    $("newTeacherEmail").value = "";

    alert("Teacher profile added. Make sure this UID exists in Firebase Authentication.");
    loadTeachersForAssignment();
  } catch (error) {
    alert("Teacher profile add failed: " + error.message);
  }
};

function renderTeachersAssignmentTable(teachers) {
  const table = $("teachersTable");
  table.innerHTML = "";

  if (!teachers.length) {
    table.innerHTML = `<tr><td colspan="4">No teacher users found</td></tr>`;
    return;
  }

  teachers
    .sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || "")))
    .forEach((teacher) => {
      const row = document.createElement("tr");
      const assignmentText = getTeacherAssignmentText(teacher);

      row.innerHTML = `
        <td>${escapeHtml(teacher.name || "-")}</td>
        <td>${escapeHtml(teacher.email || teacher.userEmail || "-")}</td>
        <td>
          <div class="assignmentEditor">
            <select id="teacherClass-${teacher.id}">
              ${getClassOptionsHtml()}
            </select>
            <select id="teacherSection-${teacher.id}">
              ${getSectionOptionsHtml()}
            </select>
            <button class="actionBtn" onclick="addTeacherAssignment('${teacher.id}')">Add</button>
          </div>
          <textarea
            class="assignmentInput"
            id="teacherAssign-${teacher.id}"
            placeholder="Class 1|A&#10;Class 2|B"
            readonly>${escapeHtml(assignmentText)}</textarea>
        </td>
        <td>
          <button class="actionBtn" onclick="saveTeacherAssignment('${teacher.id}')">Save Assignment</button>
          <button class="actionBtn deleteBtn" onclick="clearTeacherAssignment('${teacher.id}')">Clear</button>
        </td>
      `;

      table.appendChild(row);
    });
}

function getClassOptionsHtml() {
  return classOptions
    .map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`)
    .join("");
}

function getSectionOptionsHtml() {
  return sectionOptions
    .map((section) => `<option value="${escapeHtml(section)}">${escapeHtml(section)}</option>`)
    .join("");
}

function getTeacherAssignmentText(teacher) {
  const assignments = normalizeTeacherAssignments(teacher);

  return assignments
    .map((assignment) =>
      assignment.sectionRaw
        ? `${assignment.classNameRaw}|${assignment.sectionRaw}`
        : assignment.classNameRaw
    )
    .join("\n");
}

window.saveTeacherAssignment = async function (teacherId) {
  if (currentRole !== "admin") {
    alert("Only admin can assign teachers");
    return;
  }

  const input = $(`teacherAssign-${teacherId}`);
  const assignments = parseTeacherAssignmentInput(input.value);

  try {
    await updateDoc(doc(db, "users", teacherId), {
      assignedClassSections: buildTeacherAssignmentValues(assignments)
    });

    await addActivityLog("Teacher Assignment Saved", {
      teacherId,
      assignments: assignments.map((item) => `${item.className}|${item.section}`)
    });

    alert("Teacher assignment saved successfully");
  } catch (error) {
    alert("Teacher assignment save failed: " + error.message);
  }
};

function buildTeacherAssignmentValues(assignments) {
  const values = [];

  assignments.forEach((item) => {
    if (!item.className) return;

    if (!item.section) {
      values.push(item.className);
      return;
    }

    getClassNameVariants(item.className).forEach((className) => {
      values.push(`${className}|${item.section}`);
    });
  });

  return uniqueValues(values);
}

window.addTeacherAssignment = function (teacherId) {
  const className = $(`teacherClass-${teacherId}`).value;
  const section = $(`teacherSection-${teacherId}`).value;
  const input = $(`teacherAssign-${teacherId}`);
  const assignments = parseTeacherAssignmentInput(input.value);
  const newItem = { className, section };
  const exists = assignments.some((item) =>
    normalizeClassName(item.className) === normalizeClassName(newItem.className) &&
    normalizeText(item.section) === normalizeText(newItem.section)
  );

  if (!exists) {
    assignments.push(newItem);
  }

  input.value = assignments
    .map((item) => `${item.className}|${item.section}`)
    .join("\n");
};

window.clearTeacherAssignment = function (teacherId) {
  if (!confirm("Clear all assignments for this teacher?")) return;

  $(`teacherAssign-${teacherId}`).value = "";
};

function parseTeacherAssignmentInput(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.includes("|") ? "|" : ",";
      const parts = line.split(separator);

      return {
        className: String(parts[0] || "").trim(),
        section: String(parts[1] || "").trim()
      };
    })
    .filter((item) => item.className);
}

function updateDashboardStats(data) {
  const total = data.length;
  const present = data.filter((s) => s.attendance === "Present").length;
  const absent = data.filter((s) => s.attendance === "Absent").length;
  const late = data.filter((s) => s.attendance === "Late").length;
  const rate = total ? ((present / total) * 100).toFixed(2) : "0";

  $("totalStudents").innerText = total;
  $("presentStudents").innerText = present;
  $("absentStudents").innerText = absent;
  $("lateStudents").innerText = late;
  $("attendanceRate").innerText = rate + "%";
}

function updateClassWiseDashboard(data) {
  const table = $("classWiseTable");
  if (!table) return;

  table.innerHTML = "";

  const classMap = {};

  data.forEach((student) => {
    const className = getDisplayClassName(student.className) || "Unassigned";

    if (!classMap[className]) {
      classMap[className] = {
        total: 0,
        present: 0,
        absent: 0,
        late: 0
      };
    }

    classMap[className].total++;

    if (student.attendance === "Present") classMap[className].present++;
    if (student.attendance === "Absent") classMap[className].absent++;
    if (student.attendance === "Late") classMap[className].late++;
  });

  const classes = Object.keys(classMap).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  if (!classes.length) {
    table.innerHTML = `<tr><td colspan="6">No class data found</td></tr>`;
    return;
  }

  classes.forEach((className) => {
    const item = classMap[className];
    const attendanceRate = item.total
      ? ((item.present / item.total) * 100).toFixed(2)
      : "0.00";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(className)}</td>
      <td>${item.total}</td>
      <td>${item.present}</td>
      <td>${item.absent}</td>
      <td>${item.late}</td>
      <td>${attendanceRate}%</td>
    `;

    table.appendChild(row);
  });
}

function updateStudentProfileAndResult(data) {
  if (currentRole !== "student") {
    hide("studentProfileArea");
    show("statsRow", "flex");
    show("classWiseDashboard");
    return;
  }

  hide("statsRow");
  hide("classWiseDashboard");
  show("studentProfileArea");

  const student = data[0];

  if (!student) {
    $("studentProfileName").innerText = "No student record found";
    $("studentResultTable").innerHTML = `<tr><td colspan="5">No result found</td></tr>`;
    resetResultSummary();
    return;
  }

  $("studentProfileName").innerText = student.name || "-";
  $("studentProfileClass").innerText = getDisplayClassName(student.className) || "-";
  $("studentProfileSection").innerText = student.section || "-";
  $("studentProfileRoll").innerText = student.roll || "-";
  $("studentProfileEmail").innerText = student.studentEmail || "-";
  $("studentProfileFather").innerText = student.fatherName || "-";
  $("studentProfileMother").innerText = student.motherName || "-";
  $("studentProfileGuardianPhone").innerText = student.guardianPhone || "-";
  $("studentProfileEmergency").innerText = student.emergencyContact || "-";
  $("studentProfileBloodGroup").innerText = student.bloodGroup || "-";
  $("studentProfileAddress").innerText = student.address || "-";
  $("studentProfileAttendance").innerText = student.attendance || "-";
  $("studentProfileAttendancePercent").innerText = (student.attendancePercent || 0) + "%";

  renderStudentResultCard(student, getStudentTermSubjects(student, currentResultTerm));
}

function renderStudentResultCard(student, subjects) {
  const resultTable = $("studentResultTable");
  resultTable.innerHTML = "";

  let grandTotal = 0;
  let subjectCount = 0;

  subjectsList.forEach((subject) => {
    const marks = subjects[subject.key] || {};
    const classMark = Number(marks.classMark || 0);
    const quizMark = Number(marks.quizMark || 0);
    const examMark = Number(marks.examMark || 0);
    const total = classMark + quizMark + examMark;

    grandTotal += total;
    subjectCount++;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${subject.label}</td>
      <td>${classMark}</td>
      <td>${quizMark}</td>
      <td>${examMark}</td>
      <td><b>${total}</b></td>
    `;

    resultTable.appendChild(row);
  });

  const result = calculateResultSummary(subjects, student);

  $("resultTotalMarks").innerText = grandTotal + " / " + result.maxMarks;
  $("resultPercentage").innerText = result.percentage + "%";
  $("resultGrade").innerText = result.grade;
  $("resultGpa").innerText = result.gpa;
  $("resultStatus").innerText = result.status;
  $("resultSectionMerit").innerText = result.sectionMerit;
  $("resultClassRank").innerText = result.classRank;
}

function getStudentTermSubjects(student, termKey) {
  if (termKey === "yearlyFinal") {
    return calculateYearlyFinalSubjects(student);
  }

  const termResult = student?.termResults?.[termKey];
  return termResult?.subjects || student?.subjects || createEmptySubjects();
}

function getCurrentTermLabel() {
  return termOptions.find((term) => term.key === currentResultTerm)?.label || "Yearly Final";
}

function calculateYearlyFinalSubjects(student) {
  const yearlySubjects = {};
  const firstTerm = student?.termResults?.firstTerm?.subjects || {};
  const midTerm = student?.termResults?.midTerm?.subjects || {};
  const finalTerm = student?.termResults?.finalTerm?.subjects || {};

  subjectsList.forEach((subject) => {
    const firstTotal = getSubjectTotal(firstTerm[subject.key]);
    const midTotal = getSubjectTotal(midTerm[subject.key]);
    const finalTotal = getSubjectTotal(finalTerm[subject.key]);

    yearlySubjects[subject.key] = {
      classMark: Number((firstTotal * 0.2).toFixed(2)),
      quizMark: Number((midTotal * 0.3).toFixed(2)),
      examMark: Number((finalTotal * 0.5).toFixed(2))
    };
  });

  return yearlySubjects;
}

function getSubjectTotal(marks) {
  return Number(marks?.classMark || 0) +
    Number(marks?.quizMark || 0) +
    Number(marks?.examMark || 0);
}

function setupResultTermSelect() {
  const select = $("resultTermSelect");
  if (!select) return;

  select.innerHTML = termOptions
    .map((term) =>
      `<option value="${escapeHtml(term.key)}">${escapeHtml(term.label)}</option>`
    )
    .join("");
  select.value = currentResultTerm;
}

function resetResultSummary() {
  $("resultTotalMarks").innerText = "0";
  $("resultPercentage").innerText = "0%";
  $("resultGrade").innerText = "-";
  $("resultGpa").innerText = "0.00";
  $("resultStatus").innerText = "-";
  $("resultSectionMerit").innerText = "-";
  $("resultClassRank").innerText = "-";
}

function getGrade(percentage) {
  if (percentage >= 80) return "A+";
  if (percentage >= 70) return "A";
  if (percentage >= 60) return "A-";
  if (percentage >= 50) return "B";
  if (percentage >= 40) return "C";
  if (percentage >= 33) return "D";
  return "F";
}

function getGpa(percentage) {
  if (percentage >= 80) return "5.00";
  if (percentage >= 70) return "4.00";
  if (percentage >= 60) return "3.50";
  if (percentage >= 50) return "3.00";
  if (percentage >= 40) return "2.00";
  if (percentage >= 33) return "1.00";
  return "0.00";
}

function getRecommendation(percentage) {
  if (percentage >= 80) return "Excellent performance. Keep maintaining this result.";
  if (percentage >= 70) return "Very good result. A little more practice can improve the grade further.";
  if (percentage >= 60) return "Good progress. Focus more on weak subjects.";
  if (percentage >= 50) return "Average result. Regular study and revision are recommended.";
  if (percentage >= 33) return "Passed, but improvement is strongly needed.";
  return "Failed. Extra support, guardian follow-up, and daily study plan are recommended.";
}

function calculateStudentRanking(student, subjectsOverride = null) {
  if (!student) {
    return { sectionMerit: "-", classRank: "-" };
  }

  const sectionPeers = getRankingPeers(student, true, subjectsOverride);
  const classPeers = getRankingPeers(student, false, subjectsOverride);

  return {
    sectionMerit: formatRank(getRankFromPeers(student.id, sectionPeers), sectionPeers.length),
    classRank: formatRank(getRankFromPeers(student.id, classPeers), classPeers.length)
  };
}

function getRankingPeers(student, sameSectionOnly, subjectsOverride) {
  const targetClass = normalizeClassName(student.className);
  const targetSection = normalizeText(student.section);
  const peers = allData.filter((item) => {
    const classMatch = normalizeClassName(item.className) === targetClass;
    const sectionMatch = normalizeText(item.section) === targetSection;
    return classMatch && (!sameSectionOnly || sectionMatch);
  });

  const peerMap = new Map();
  peers.forEach((item) => peerMap.set(item.id, item));
  peerMap.set(student.id, student);

  return Array.from(peerMap.values())
    .map((item) => {
      const subjects = item.id === student.id && subjectsOverride
        ? subjectsOverride
        : getStudentTermSubjects(item, currentResultTerm);
      const score = getResultScore(subjects);

      return {
        id: item.id,
        total: score.total,
        percentage: score.percentage,
        attendancePercent: Number(item.attendancePercent || 0)
      };
    })
    .sort((a, b) => {
      if (b.percentage !== a.percentage) return b.percentage - a.percentage;
      if (b.total !== a.total) return b.total - a.total;
      return b.attendancePercent - a.attendancePercent;
    });
}

function getResultScore(subjects) {
  let total = 0;
  let subjectCount = 0;

  subjectsList.forEach((subject) => {
    const marks = subjects[subject.key] || {};
    total += Number(marks.classMark || 0);
    total += Number(marks.quizMark || 0);
    total += Number(marks.examMark || 0);
    subjectCount++;
  });

  const maxMarks = subjectCount * 100;
  const percentage = maxMarks ? Number(((total / maxMarks) * 100).toFixed(2)) : 0;

  return { total, maxMarks, percentage };
}

function getRankFromPeers(studentId, peers) {
  let previous = null;
  let rank = 0;

  for (let index = 0; index < peers.length; index++) {
    const peer = peers[index];
    const sameScore = previous
      && peer.percentage === previous.percentage
      && peer.total === previous.total
      && peer.attendancePercent === previous.attendancePercent;

    if (!sameScore) {
      rank = index + 1;
    }

    if (peer.id === studentId) {
      return rank;
    }

    previous = peer;
  }

  return 0;
}

function formatRank(rank, total) {
  if (!rank || !total) return "-";
  return `${rank} / ${total}`;
}

window.addStudent = async function () {
  if (currentRole !== "admin" && currentRole !== "teacher") {
    alert("You do not have permission");
    return;
  }

  const name = $("name").value.trim();
  const className = $("studentClass").value.trim();
  const section = $("section").value.trim();
  const roll = $("roll").value.trim();
  const studentEmail = $("studentEmail").value.trim();
  const guardianInfo = getGuardianInfoFromForm();

  if (!name || !className || !section || !roll || !studentEmail) {
    alert("Fill all required fields");
    return;
  }

  if (currentRole === "teacher" && !canTeacherAccessClassSection(className, section)) {
    alert("You can add students only to your assigned class/section");
    return;
  }

  try {
    const duplicateRoll = await studentRollExists(className, section, roll);

    if (duplicateRoll) {
      alert("This roll already exists in the selected class and section");
      return;
    }

    const studentRef = await addDoc(collection(db, "students"), {
      name,
      className,
      section,
      classSection: getClassSectionValue(className, section),
      roll,
      rollKey: normalizeRoll(roll),
      studentEmail,
      studentId: studentEmail,
      ...guardianInfo,
      marks: 0,
      attendance: "Present",
      attendancePercent: 0,
      subjects: createEmptySubjects(),
      createdAt: new Date().toISOString()
    });

    await addActivityLog("Student Added", {
      studentId: studentRef.id,
      name,
      className,
      section,
      roll
    });

    clearStudentForm();
    showAllStudents();
  } catch (error) {
    alert("Add failed: " + error.message);
  }
};

function createEmptySubjects() {
  const subjects = {};

  subjectsList.forEach((subject) => {
    subjects[subject.key] = {
      classMark: 0,
      quizMark: 0,
      examMark: 0
    };
  });

  return subjects;
}

function getGuardianInfoFromForm() {
  return {
    fatherName: $("fatherName")?.value.trim() || "",
    motherName: $("motherName")?.value.trim() || "",
    guardianPhone: $("guardianPhone")?.value.trim() || "",
    emergencyContact: $("emergencyContact")?.value.trim() || "",
    bloodGroup: $("bloodGroup")?.value.trim() || "",
    address: $("address")?.value.trim() || ""
  };
}

function clearStudentForm() {
  [
    "name",
    "studentClass",
    "section",
    "roll",
    "studentEmail",
    "fatherName",
    "motherName",
    "guardianPhone",
    "emergencyContact",
    "bloodGroup",
    "address"
  ].forEach((id) => {
    const element = $(id);
    if (element) element.value = "";
  });
}

window.applyFilters = function () {
  const search = ($("search")?.value || "").toLowerCase();
  const classFilter = ($("filterClass")?.value || "").toLowerCase();
  const sectionFilter = ($("filterSection")?.value || "").toLowerCase();

  filteredData = allData.filter((student) => {
    const nameMatch = (student.name || "").toLowerCase().includes(search);
    const classMatch = classFilter
      ? normalizeClassName(student.className) === normalizeClassName(classFilter)
      : true;
    const sectionMatch = sectionFilter
      ? normalizeText(student.section) === normalizeText(sectionFilter)
      : true;

    return nameMatch && classMatch && sectionMatch;
  });

  renderStudents(filteredData);
};

function renderStudents(data) {
  const table = $("table");
  if (!table) return;

  table.innerHTML = "";
  $("emptyStudents").style.display = data.length ? "none" : "block";

  $("studentsListCount").innerText = `Total Students: ${data.length}`;

  data.forEach((student, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(student.name || "")}</td>
      <td>${escapeHtml(getDisplayClassName(student.className))}</td>
      <td>${escapeHtml(student.section || "")}</td>
      <td>${escapeHtml(student.roll || "")}</td>
      <td>${escapeHtml(student.studentEmail || "")}</td>
      <td>${escapeHtml(student.marks ?? 0)}</td>
      <td>${escapeHtml(student.attendance || "")}</td>
      <td>${escapeHtml(student.attendancePercent ?? 0)}%</td>
      <td>${getActionButtons(student.id)}</td>
    `;

    table.appendChild(row);
  });
}

function getActionButtons(id) {
  if (currentRole === "admin") {
    return `
      <button class="actionBtn" onclick="viewStudentProfile('${id}')">View Profile</button>
      <button class="actionBtn editBtn" onclick="openMarksPanel('${id}')">Update Marks</button>
      <button class="actionBtn" onclick="editStudent('${id}')">Edit Info</button>
      <button class="actionBtn deleteBtn" onclick="deleteStudent('${id}')">Delete</button>
    `;
  }

  if (currentRole === "teacher") {
    return `
      <button class="actionBtn" onclick="viewStudentProfile('${id}')">View Profile</button>
      <button class="actionBtn editBtn" onclick="openMarksPanel('${id}')">Update Marks</button>
      <button class="actionBtn" onclick="editStudent('${id}')">Edit Attendance</button>
    `;
  }

  return `
    <button class="actionBtn" onclick="viewStudentProfile('${id}')">View Profile</button>
  `;
}

window.viewStudentProfile = function (id) {
  const student = allData.find((item) => item.id === id);

  if (!student) {
    alert("Student not found");
    return;
  }

  selectedStudentForMarks = student;
  renderStudentModal(student, false);

  $("studentModalTitle").innerText = "Student Profile & Result Card";
  hide("saveMarksBtn");
  show("studentModal", "flex");
};

window.openMarksPanel = function (id) {
  if (currentRole === "student") {
    viewStudentProfile(id);
    return;
  }

  const student = allData.find((item) => item.id === id);

  if (!student) {
    alert("Student not found");
    return;
  }

  selectedStudentForMarks = student;
  renderStudentModal(student, true);

  $("studentModalTitle").innerText = "Update Student Marks";
  updateSaveMarksButton();
  show("studentModal", "flex");
};

function renderStudentModal(student, editable) {
  currentModalEditable = editable;

  $("modalProfileName").innerText = student.name || "-";
  $("modalProfileClass").innerText = getDisplayClassName(student.className) || "-";
  $("modalProfileSection").innerText = student.section || "-";
  $("modalProfileRoll").innerText = student.roll || "-";
  $("modalProfileEmail").innerText = student.studentEmail || "-";
  $("modalProfileFather").innerText = student.fatherName || "-";
  $("modalProfileMother").innerText = student.motherName || "-";
  $("modalProfileGuardianPhone").innerText = student.guardianPhone || "-";
  $("modalProfileEmergency").innerText = student.emergencyContact || "-";
  $("modalProfileBloodGroup").innerText = student.bloodGroup || "-";
  $("modalProfileAddress").innerText = student.address || "-";
  $("modalProfileAttendance").innerText = student.attendance || "-";
  $("modalProfileAttendancePercent").innerText = (student.attendancePercent || 0) + "%";

  setupResultTermSelect();
  renderModalMarksTable(
    getStudentTermSubjects(student, currentResultTerm),
    editable && currentResultTerm !== "yearlyFinal"
  );
  updateSaveMarksButton();
}

window.changeResultTerm = function () {
  const select = $("resultTermSelect");
  if (!select || !selectedStudentForMarks) return;

  currentResultTerm = select.value || "finalTerm";
  renderStudentModal(selectedStudentForMarks, currentModalEditable);
};

function updateSaveMarksButton() {
  if (!currentModalEditable || currentResultTerm === "yearlyFinal") {
    hide("saveMarksBtn");
    return;
  }

  show("saveMarksBtn", "inline-block");
}

function renderModalMarksTable(subjects, editable) {
  const table = $("modalMarksTable");
  table.innerHTML = "";
  const markLabels = getResultMarkLabels();

  let grandTotal = 0;
  let subjectCount = 0;

  subjectsList.forEach((subject) => {
    const marks = subjects[subject.key] || {};
    const classMark = Number(marks.classMark || 0);
    const quizMark = Number(marks.quizMark || 0);
    const examMark = Number(marks.examMark || 0);
    const total = classMark + quizMark + examMark;
    const readonly = editable ? "" : "readonly";

    grandTotal += total;
    subjectCount++;

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${subject.label}</td>
      <td>
        <input class="marksInput subjectMark" ${readonly}
          data-subject="${subject.key}" data-type="classMark"
          type="number" min="0" title="${escapeHtml(markLabels.first)}" value="${classMark}"
          oninput="refreshModalResult()">
      </td>
      <td>
        <input class="marksInput subjectMark" ${readonly}
          data-subject="${subject.key}" data-type="quizMark"
          type="number" min="0" title="${escapeHtml(markLabels.second)}" value="${quizMark}"
          oninput="refreshModalResult()">
      </td>
      <td>
        <input class="marksInput subjectMark" ${readonly}
          data-subject="${subject.key}" data-type="examMark"
          type="number" min="0" title="${escapeHtml(markLabels.third)}" value="${examMark}"
          oninput="refreshModalResult()">
      </td>
      <td class="subjectTotal">${total}</td>
    `;

    table.appendChild(row);
  });

  updateModalSummary(grandTotal, subjectCount);
}

window.refreshModalResult = function () {
  let grandTotal = 0;
  let subjectCount = 0;

  document.querySelectorAll("#modalMarksTable tr").forEach((row) => {
    let rowTotal = 0;

    row.querySelectorAll(".subjectMark").forEach((input) => {
      rowTotal += Number(input.value || 0);
    });

    row.querySelector(".subjectTotal").innerText = rowTotal;
    grandTotal += rowTotal;
    subjectCount++;
  });

  updateModalSummary(grandTotal, subjectCount);
};

function updateModalSummary(grandTotal, subjectCount) {
  const subjects = collectSubjectsFromModalInputs();
  const result = calculateResultSummary(subjects, selectedStudentForMarks);

  $("modalTotalMarks").innerText = result.total + " / " + result.maxMarks;
  $("modalPercentage").innerText = result.percentage + "%";
  $("modalGrade").innerText = result.grade;
  $("modalGpa").innerText = result.gpa;
  $("modalStatus").innerText = result.status;
  $("modalSectionMerit").innerText = result.sectionMerit;
  $("modalClassRank").innerText = result.classRank;
  $("modalRecommendation").innerText = result.recommendation;
}

function collectSubjectsFromModalInputs() {
  if (currentResultTerm === "yearlyFinal" && selectedStudentForMarks) {
    return calculateYearlyFinalSubjects(selectedStudentForMarks);
  }

  const subjects = createEmptySubjects();
  const inputs = document.querySelectorAll("#modalMarksTable .subjectMark");

  if (!inputs.length && selectedStudentForMarks) {
    return getStudentTermSubjects(selectedStudentForMarks, currentResultTerm);
  }

  inputs.forEach((input) => {
    const subject = input.dataset.subject;
    const type = input.dataset.type;
    subjects[subject][type] = Number(input.value || 0);
  });

  return subjects;
}

function getResultMarkLabels() {
  if (currentResultTerm === "yearlyFinal") {
    return {
      first: "First Term 20%",
      second: "Mid Term 30%",
      third: "Final Term 50%"
    };
  }

  return {
    first: "Class Mark",
    second: "Quiz Mark",
    third: "Exam Mark"
  };
}

window.updateStudentMarks = async function () {
  if (currentRole === "student") {
    alert("Students can view marks only");
    return;
  }

  if (!selectedStudentForMarks) {
    alert("No student selected");
    return;
  }

  if (currentResultTerm === "yearlyFinal") {
    alert("Yearly Final is calculated automatically from First Term, Mid Term, and Final Term");
    return;
  }

  const subjects = createEmptySubjects();

  document.querySelectorAll("#modalMarksTable .subjectMark").forEach((input) => {
    const subject = input.dataset.subject;
    const type = input.dataset.type;
    subjects[subject][type] = Number(input.value || 0);
  });

  const termResults = {
    ...(selectedStudentForMarks.termResults || {}),
    [currentResultTerm]: {
      termName: getCurrentTermLabel(),
      subjects,
      totalMarks: calculateOverallMarks(subjects),
      updatedAt: new Date().toISOString()
    }
  };

  try {
    await updateDoc(doc(db, "students", selectedStudentForMarks.id), {
      termResults,
      activeTerm: currentResultTerm,
      subjects,
      marks: calculateOverallMarks(subjects)
    });

    await addActivityLog("Marks Updated", {
      studentId: selectedStudentForMarks.id,
      studentName: selectedStudentForMarks.name || "-",
      term: getCurrentTermLabel(),
      totalMarks: calculateOverallMarks(subjects)
    });

    alert(getCurrentTermLabel() + " marks updated successfully");
    closeStudentModal();
  } catch (error) {
    alert("Update failed: " + error.message);
  }
};

window.closeStudentModal = function () {
  selectedStudentForMarks = null;
  hide("studentModal");
};

window.closeMarksPanel = function () {
  closeStudentModal();
};

function calculateOverallMarks(subjects) {
  let total = 0;

  Object.values(subjects).forEach((subject) => {
    total += Number(subject.classMark || 0);
    total += Number(subject.quizMark || 0);
    total += Number(subject.examMark || 0);
  });

  return total;
}

window.deleteStudent = async function (id) {
  if (currentRole !== "admin") {
    alert("Only admin can delete");
    return;
  }

  if (!confirm("Are you sure?")) return;

  try {
    const student = allData.find((item) => item.id === id);
    await deleteDoc(doc(db, "students", id));
    await addActivityLog("Student Deleted", {
      studentId: id,
      studentName: student?.name || "-",
      className: student?.className || "-",
      section: student?.section || "-",
      roll: student?.roll || "-"
    });
  } catch (error) {
    alert("Delete failed: " + error.message);
  }
};

window.editStudent = async function (id) {
  if (currentRole !== "admin" && currentRole !== "teacher") {
    alert("You do not have permission");
    return;
  }

  const student = allData.find((item) => item.id === id);

  if (!student) {
    alert("Student not found");
    return;
  }

  if (currentRole === "admin") {
    await editStudentInfo(student);
    return;
  }

  const newAttendance = prompt(
    "Attendance: Present / Absent / Late",
    student.attendance || "Present"
  );

  if (newAttendance === null) return;

  const attendanceValue = newAttendance.trim();
  const allowedAttendance = ["Present", "Absent", "Late"];

  if (!allowedAttendance.includes(attendanceValue)) {
    alert("Invalid attendance value");
    return;
  }

  const newAttendancePercent = prompt(
    "Attendance %",
    student.attendancePercent || 0
  );

  if (newAttendancePercent === null) return;

  try {
    await updateDoc(doc(db, "students", id), {
      attendance: attendanceValue,
      attendancePercent: Number(newAttendancePercent || 0)
    });
    await addActivityLog("Student Attendance Edited", {
      studentId: id,
      studentName: student.name || "-",
      attendance: attendanceValue,
      attendancePercent: Number(newAttendancePercent || 0)
    });
  } catch (error) {
    alert("Update failed: " + error.message);
  }
};

window.loadAttendanceSheet = async function () {
  if (currentRole !== "admin" && currentRole !== "teacher") {
    alert("You do not have permission");
    return;
  }

  const date = $("attendanceDate").value;
  const className = $("attendanceClass").value.trim();
  const section = $("attendanceSection").value.trim();

  if (!date || !className || !section) {
    alert("Select date, class, and section");
    return;
  }

  if (currentRole === "teacher" && !canTeacherAccessClassSection(className, section)) {
    alert("You can take attendance only for your assigned class/section");
    return;
  }

  try {
    attendanceStudents = await loadStudentsForClassSection(className, section);
    let savedRecords = {};

    try {
      savedRecords = await getAttendanceRecordsForDate(date, className, section);
    } catch (error) {
      console.warn("Saved attendance records load failed:", error);
    }

    renderAttendanceSheet(savedRecords);
  } catch (error) {
    alert("Attendance sheet load failed: " + error.message);
  }
};

async function editStudentInfo(student) {
  const name = prompt("Student Name", student.name || "");
  if (name === null) return;

  const studentEmail = prompt("Student Email", student.studentEmail || "");
  if (studentEmail === null) return;

  const fatherName = prompt("Father Name", student.fatherName || "");
  if (fatherName === null) return;

  const motherName = prompt("Mother Name", student.motherName || "");
  if (motherName === null) return;

  const guardianPhone = prompt("Guardian Phone", student.guardianPhone || "");
  if (guardianPhone === null) return;

  const emergencyContact = prompt("Emergency Contact", student.emergencyContact || "");
  if (emergencyContact === null) return;

  const bloodGroup = prompt("Blood Group", student.bloodGroup || "");
  if (bloodGroup === null) return;

  const address = prompt("Address", student.address || "");
  if (address === null) return;

  try {
    await updateDoc(doc(db, "students", student.id), {
      name: name.trim(),
      studentEmail: studentEmail.trim(),
      studentId: studentEmail.trim(),
      fatherName: fatherName.trim(),
      motherName: motherName.trim(),
      guardianPhone: guardianPhone.trim(),
      emergencyContact: emergencyContact.trim(),
      bloodGroup: bloodGroup.trim(),
      address: address.trim()
    });

    await addActivityLog("Student Info Updated", {
      studentId: student.id,
      oldName: student.name || "-",
      newName: name.trim()
    });

    alert("Student info updated successfully");
  } catch (error) {
    alert("Update failed: " + error.message);
  }
}

async function loadStudentsForClassSection(className, section) {
  const localStudents = allData
    .filter((student) =>
      normalizeClassName(student.className) === normalizeClassName(className) &&
      normalizeText(student.section) === normalizeText(section)
    );

  if (localStudents.length) {
    return sortStudentsByRoll(localStudents);
  }

  const students = [];

  await Promise.all(getClassSectionVariants(className, section).map(async (classSection) => {
    try {
      const snap = await getDocs(
        query(collection(db, "students"), where("classSection", "==", classSection))
      );

      snap.forEach((docSnap) => {
        students.push({ id: docSnap.id, ...docSnap.data() });
      });
    } catch (error) {
      console.warn("classSection student query failed:", error);
    }
  }));

  await Promise.all(getClassNameVariants(className).map(async (classVariant) => {
    try {
      const fallbackSnap = await getDocs(
        query(
          collection(db, "students"),
          where("className", "==", classVariant),
          where("section", "==", section)
        )
      );

      fallbackSnap.forEach((docSnap) => {
        students.push({ id: docSnap.id, ...docSnap.data() });
      });
    } catch (error) {
      console.warn("legacy class/section student query failed:", error);
    }
  }));

  const merged = new Map();
  students
    .filter(canTeacherAccessStudent)
    .forEach((student) => merged.set(student.id, student));

  return sortStudentsByRoll(Array.from(merged.values()));
}

function sortStudentsByRoll(students) {
  return students.sort((a, b) => Number(a.roll || 0) - Number(b.roll || 0));
}

async function getAttendanceRecordsForDate(date, className, section) {
  const snap = await getDocs(
    query(
      collection(db, "attendanceRecords"),
      where("date", "==", date),
      where("classSection", "==", getClassSectionValue(className, section))
    )
  );
  const records = {};

  snap.forEach((docSnap) => {
    const record = docSnap.data();
    records[record.studentDocId] = record.status;
  });

  return records;
}

function clearAttendanceSheet() {
  attendanceStudents = [];
  hide("attendanceSheetArea");

  const table = $("attendanceTable");
  if (table) table.innerHTML = "";
}

function renderAttendanceSheet(savedRecords = {}) {
  const table = $("attendanceTable");
  table.innerHTML = "";

  show("attendanceSheetArea");

  const date = $("attendanceDate").value;
  const className = $("attendanceClass").value.trim();
  const section = $("attendanceSection").value.trim();

  $("attendanceSheetTitle").innerText =
    `Attendance Sheet - ${date} - ${className}, Section ${section}`;

  if (!attendanceStudents.length) {
    table.innerHTML = `
      <tr>
        <td colspan="5">
          No students found for this class and section. If students exist, admin should save this teacher assignment again.
        </td>
      </tr>
    `;
    return;
  }

  attendanceStudents.forEach((student) => {
    const row = document.createElement("tr");
    const selectedStatus = savedRecords[student.id] || "Present";

    row.innerHTML = `
      <td>${escapeHtml(student.roll || "")}</td>
      <td>${escapeHtml(student.name || "")}</td>
      <td>${escapeHtml(getDisplayClassName(student.className))}</td>
      <td>${escapeHtml(student.section || "")}</td>
      <td>
        <select class="attendanceStatus" data-id="${student.id}">
          <option value="Present" ${selectedStatus === "Present" ? "selected" : ""}>Present</option>
          <option value="Absent" ${selectedStatus === "Absent" ? "selected" : ""}>Absent</option>
          <option value="Late" ${selectedStatus === "Late" ? "selected" : ""}>Late</option>
        </select>
      </td>
    `;

    table.appendChild(row);
  });
}

window.saveAttendance = async function () {
  if (currentRole !== "admin" && currentRole !== "teacher") {
    alert("You do not have permission");
    return;
  }

  if (!attendanceStudents.length) {
    alert("No students to save");
    return;
  }

  const date = $("attendanceDate").value;
  const month = date.slice(0, 7);
  const currentUser = auth.currentUser;

  if (!date) {
    alert("Select attendance date");
    return;
  }

  const updates = Array.from(document.querySelectorAll(".attendanceStatus"))
    .map((select) => {
      const student = attendanceStudents.find((item) => item.id === select.dataset.id);

      if (!student) return Promise.resolve();

      const recordId = `${date}_${student.id}`;

      return Promise.all([
        updateDoc(doc(db, "students", student.id), {
          attendance: select.value,
          attendanceDate: date
        }),
        setDoc(doc(db, "attendanceRecords", recordId), {
          date,
          month,
          className: student.className || "",
          section: student.section || "",
          classSection: getClassSectionValue(student.className, student.section),
          studentId: student.studentId || student.studentEmail || "",
          studentDocId: student.id,
          studentName: student.name || "",
          roll: student.roll || "",
          status: select.value,
          markedBy: currentUser ? currentUser.uid : "",
          markedAt: serverTimestamp()
        }, { merge: true })
      ]);
    });

  try {
    await Promise.all(updates);
    await updateMonthlyAttendancePercentForLoadedStudents(month);
    await addActivityLog("Attendance Saved", {
      date,
      className: $("attendanceClass").value.trim(),
      section: $("attendanceSection").value.trim(),
      students: attendanceStudents.length
    });
    alert("Attendance saved successfully");
  } catch (error) {
    alert("Attendance save failed: " + error.message);
  }
};

async function updateMonthlyAttendancePercentForLoadedStudents(month) {
  if (!attendanceStudents.length) return;

  const firstStudent = attendanceStudents[0];
  const classSection = getClassSectionValue(firstStudent.className, firstStudent.section);
  const snap = await getDocs(
    query(
      collection(db, "attendanceRecords"),
      where("month", "==", month),
      where("classSection", "==", classSection)
    )
  );

  const summary = {};

  snap.forEach((docSnap) => {
    const record = docSnap.data();
    const id = record.studentDocId;

    if (!summary[id]) {
      summary[id] = { total: 0, present: 0 };
    }

    summary[id].total++;
    if (record.status === "Present") {
      summary[id].present++;
    }
  });

  await Promise.all(attendanceStudents.map((student) => {
    const item = summary[student.id];
    const attendancePercent = item && item.total
      ? Number(((item.present / item.total) * 100).toFixed(2))
      : 0;

    return updateDoc(doc(db, "students", student.id), {
      attendancePercent
    });
  }));
}

async function studentRollExists(className, section, roll) {
  const localDuplicate = allData.some((student) =>
    getClassSectionValue(student.className, student.section) === getClassSectionValue(className, section) &&
    normalizeRoll(student.roll) === normalizeRoll(roll)
  );

  if (localDuplicate) return true;

  const snap = await getDocs(
    query(
      collection(db, "students"),
      where("classSection", "==", getClassSectionValue(className, section)),
      where("rollKey", "==", normalizeRoll(roll))
    )
  );

  return !snap.empty;
}

function normalizeRoll(roll) {
  const trimmed = String(roll || "").trim();
  const numeric = Number(trimmed);

  return Number.isFinite(numeric) && trimmed !== ""
    ? String(numeric)
    : trimmed.toLowerCase();
}

window.loadMonthlyReport = async function () {
  if (currentRole !== "admin" && currentRole !== "teacher") {
    alert("You do not have permission");
    return;
  }

  const month = $("reportMonth").value;
  const className = $("reportClass").value.trim();
  const section = $("reportSection").value.trim();

  if (!month) {
    alert("Select month");
    return;
  }

  try {
    monthlyAttendanceData = currentRole === "teacher"
      ? await getTeacherMonthlyAttendanceRecords(month)
      : await getMonthlyAttendanceRecords(month);

    if (className) {
      monthlyAttendanceData = monthlyAttendanceData.filter((item) =>
        normalizeClassName(item.className) === normalizeClassName(className)
      );
    }

    if (section) {
      monthlyAttendanceData = monthlyAttendanceData.filter((item) =>
        normalizeText(item.section) === normalizeText(section)
      );
    }

    updateMonthlyReportSubtitle();
    renderMonthlyReport(monthlyAttendanceData);
  } catch (error) {
    monthlyAttendanceData = [];
    updateMonthlyReportSubtitle();
    renderMonthlyReport(monthlyAttendanceData);
    console.warn("Monthly report load failed:", error);
  }
};

async function getMonthlyAttendanceRecords(month) {
  const snap = await getDocs(
    query(collection(db, "attendanceRecords"), where("month", "==", month))
  );

  const records = [];
  snap.forEach((docSnap) => records.push({ id: docSnap.id, ...docSnap.data() }));

  return records;
}

async function getTeacherMonthlyAttendanceRecords(month) {
  if (!currentTeacherAssignments.length) return [];

  const resultMap = new Map();
  const assignedClassSections = currentTeacherAssignments
    .filter((assignment) => assignment.sectionRaw)
    .flatMap((assignment) =>
      getClassSectionVariants(assignment.classNameRaw, assignment.sectionRaw)
    );

  await Promise.all(uniqueValues(assignedClassSections).map(async (classSection) => {
    const recordsRef = query(
      collection(db, "attendanceRecords"),
      where("month", "==", month),
      where("classSection", "==", classSection)
    );

    const snap = await getDocs(recordsRef);

    snap.forEach((docSnap) => {
      const record = { id: docSnap.id, ...docSnap.data() };

      if (canTeacherAccessAttendanceRecord(record)) {
        resultMap.set(record.id, record);
      }
    });
  }));

  return Array.from(resultMap.values());
}

function updateMonthlyReportSubtitle() {
  const month = $("reportMonth")?.value || getTodayParts().month;
  const className = $("reportClass")?.value.trim() || "All classes";
  const section = $("reportSection")?.value.trim() || "All sections";
  const count = monthlyAttendanceData.length;

  $("monthlyReportSubtitle").innerText =
    `Showing: ${month} | Class: ${className} | Section: ${section} | Records: ${count}`;
}

function renderMonthlyReport(records) {
  renderMonthlyClassSummary(records);
  renderMonthlyStudentSummary(records);
  renderMonthlyAbsentList(records);
}

function renderMonthlyClassSummary(records) {
  const table = $("monthlyClassSummaryTable");
  table.innerHTML = "";

  const map = {};

  records.forEach((record) => {
    const key = `${record.className || "Unassigned"}_${record.section || "-"}`;

    if (!map[key]) {
      map[key] = {
        className: getDisplayClassName(record.className) || "Unassigned",
        section: record.section || "-",
        total: 0,
        present: 0,
        absent: 0,
        late: 0
      };
    }

    map[key].total++;
    if (record.status === "Present") map[key].present++;
    if (record.status === "Absent") map[key].absent++;
    if (record.status === "Late") map[key].late++;
  });

  const rows = Object.values(map).sort((a, b) =>
    String(a.className).localeCompare(String(b.className), undefined, { numeric: true })
  );

  if (!rows.length) {
    table.innerHTML = `<tr><td colspan="7">No monthly data found</td></tr>`;
    return;
  }

  rows.forEach((item) => {
    const percent = item.total ? ((item.present / item.total) * 100).toFixed(2) : "0.00";
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(item.className)}</td>
      <td>${escapeHtml(item.section)}</td>
      <td>${item.total}</td>
      <td>${item.present}</td>
      <td>${item.absent}</td>
      <td>${item.late}</td>
      <td>${percent}%</td>
    `;

    table.appendChild(row);
  });
}

function renderMonthlyStudentSummary(records) {
  const table = $("monthlyStudentSummaryTable");
  table.innerHTML = "";

  const map = {};

  records.forEach((record) => {
    const key = record.studentDocId || record.studentId || record.id;

    if (!map[key]) {
      map[key] = {
        roll: record.roll || "",
        name: record.studentName || "",
        className: getDisplayClassName(record.className) || "",
        section: record.section || "",
        total: 0,
        present: 0,
        absent: 0,
        late: 0
      };
    }

    map[key].total++;
    if (record.status === "Present") map[key].present++;
    if (record.status === "Absent") map[key].absent++;
    if (record.status === "Late") map[key].late++;
  });

  const rows = Object.values(map).sort((a, b) => Number(a.roll || 0) - Number(b.roll || 0));

  if (!rows.length) {
    table.innerHTML = `<tr><td colspan="8">No student summary found</td></tr>`;
    return;
  }

  rows.forEach((item) => {
    const percent = item.total ? ((item.present / item.total) * 100).toFixed(2) : "0.00";
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(item.roll)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.className)}</td>
      <td>${escapeHtml(item.section)}</td>
      <td>${item.present}</td>
      <td>${item.absent}</td>
      <td>${item.late}</td>
      <td>${percent}%</td>
    `;

    table.appendChild(row);
  });
}

function renderMonthlyAbsentList(records) {
  const table = $("monthlyAbsentTable");
  table.innerHTML = "";

  const rows = records
    .filter((record) => record.status === "Absent")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (!rows.length) {
    table.innerHTML = `<tr><td colspan="6">No absent records found</td></tr>`;
    return;
  }

  rows.forEach((record) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(record.date || "")}</td>
      <td>${escapeHtml(record.roll || "")}</td>
      <td>${escapeHtml(record.studentName || "")}</td>
      <td>${escapeHtml(getDisplayClassName(record.className) || "")}</td>
      <td>${escapeHtml(record.section || "")}</td>
      <td>${escapeHtml(record.status || "")}</td>
    `;

    table.appendChild(row);
  });
}

window.downloadMonthlyAttendanceCSV = function () {
  if (!monthlyAttendanceData.length) {
    alert("Load monthly report first");
    return;
  }

  const rows = monthlyAttendanceData.map((record) => [
    record.date || "",
    record.roll || "",
    record.studentName || "",
    getDisplayClassName(record.className) || "",
    record.section || "",
    record.status || ""
  ].map(csvSafe).join(","));

  const csv = "Date,Roll,Name,Class,Section,Status\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "monthly-attendance-report.csv";
  link.click();

  URL.revokeObjectURL(url);
};

window.downloadMonthlyAttendancePDF = function () {
  if (!monthlyAttendanceData.length) {
    alert("Load monthly report first");
    return;
  }

  if (!window.jspdf) {
    alert("PDF library not loaded");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  const month = $("reportMonth").value || "";

  pdf.setFontSize(16);
  pdf.text("FH School Management System", 14, 16);
  pdf.setFontSize(13);
  pdf.text("Monthly Attendance Report - " + month, 14, 26);

  const studentRows = getMonthlyStudentSummaryRows(monthlyAttendanceData).map((item) => [
    item.roll,
    item.name,
    getDisplayClassName(item.className),
    item.section,
    item.present,
    item.absent,
    item.late,
    item.percent + "%"
  ]);

  pdf.autoTable({
    startY: 34,
    head: [["Roll", "Name", "Class", "Section", "Present", "Absent", "Late", "Attendance %"]],
    body: studentRows
  });

  const absentRows = monthlyAttendanceData
    .filter((record) => record.status === "Absent")
    .map((record) => [
      record.date || "",
      record.roll || "",
      record.studentName || "",
      getDisplayClassName(record.className) || "",
      record.section || ""
    ]);

  pdf.addPage();
  pdf.setFontSize(13);
  pdf.text("Monthly Absent List", 14, 16);
  pdf.autoTable({
    startY: 24,
    head: [["Date", "Roll", "Name", "Class", "Section"]],
    body: absentRows.length ? absentRows : [["-", "-", "No absent records", "-", "-"]]
  });

  pdf.save(`monthly-attendance-report-${month || "report"}.pdf`);
};

function getMonthlyStudentSummaryRows(records) {
  const map = {};

  records.forEach((record) => {
    const key = record.studentDocId || record.studentId || record.id;

    if (!map[key]) {
      map[key] = {
        roll: record.roll || "",
        name: record.studentName || "",
        className: record.className || "",
        section: record.section || "",
        total: 0,
        present: 0,
        absent: 0,
        late: 0
      };
    }

    map[key].total++;
    if (record.status === "Present") map[key].present++;
    if (record.status === "Absent") map[key].absent++;
    if (record.status === "Late") map[key].late++;
  });

  return Object.values(map)
    .map((item) => ({
      ...item,
      percent: item.total ? ((item.present / item.total) * 100).toFixed(2) : "0.00"
    }))
    .sort((a, b) => Number(a.roll || 0) - Number(b.roll || 0));
}

function getTodayParts() {
  const today = new Date();
  const year = today.getFullYear();
  const monthNumber = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const month = `${year}-${monthNumber}`;
  const date = `${month}-${day}`;

  return { date, month };
}

window.downloadCSV = function () {
  const dataToDownload = filteredData.length || isFilterActive()
    ? filteredData
    : allData;

  const rows = dataToDownload.map((student) => [
    student.name || "",
    getDisplayClassName(student.className) || "",
    student.section || "",
    student.roll || "",
    student.studentEmail || "",
    student.fatherName || "",
    student.motherName || "",
    student.guardianPhone || "",
    student.emergencyContact || "",
    student.bloodGroup || "",
    student.address || "",
    student.marks || 0,
    student.attendance || "",
    student.attendancePercent || 0
  ].map(csvSafe).join(","));

  const csv = "Name,Class,Section,Roll,Student Email,Father Name,Mother Name,Guardian Phone,Emergency Contact,Blood Group,Address,Marks,Attendance,Attendance Percent\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "students.csv";
  link.click();

  URL.revokeObjectURL(url);
};

function isFilterActive() {
  return Boolean(
    ($("search")?.value || "").trim() ||
    ($("filterClass")?.value || "").trim() ||
    ($("filterSection")?.value || "").trim()
  );
}

window.downloadResultPDF = function () {
  if (!selectedStudentForMarks) {
    alert("No student selected");
    return;
  }

  if (!window.jspdf) {
    alert("PDF library not loaded");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const student = selectedStudentForMarks;
  const subjects = collectCurrentModalSubjects();
  const result = calculateResultSummary(subjects, student);

  pdf.setFontSize(16);
  pdf.text("FH School Management System", 14, 16);

  pdf.setFontSize(13);
  pdf.text("Student Result Card - " + getCurrentTermLabel(), 14, 26);

  pdf.setFontSize(10);
  pdf.text("Name: " + (student.name || "-"), 14, 38);
  pdf.text("Class: " + (getDisplayClassName(student.className) || "-"), 14, 45);
  pdf.text("Section: " + (student.section || "-"), 70, 45);
  pdf.text("Roll: " + (student.roll || "-"), 125, 45);
  pdf.text("Email: " + (student.studentEmail || "-"), 14, 52);
  pdf.text("Attendance: " + (student.attendance || "-"), 14, 59);
  pdf.text("Attendance %: " + (student.attendancePercent || 0) + "%", 70, 59);
  pdf.text("Term: " + getCurrentTermLabel(), 125, 59);
  pdf.text("Father: " + (student.fatherName || "-"), 14, 66);
  pdf.text("Mother: " + (student.motherName || "-"), 70, 66);
  pdf.text("Guardian Phone: " + (student.guardianPhone || "-"), 14, 73);
  pdf.text("Blood Group: " + (student.bloodGroup || "-"), 100, 73);
  const markLabels = getResultMarkLabels();

  const rows = subjectsList.map((subject) => {
    const marks = subjects[subject.key] || {};
    const classMark = Number(marks.classMark || 0);
    const quizMark = Number(marks.quizMark || 0);
    const examMark = Number(marks.examMark || 0);

    return [
      subject.label,
      classMark,
      quizMark,
      examMark,
      classMark + quizMark + examMark
    ];
  });

  pdf.autoTable({
    startY: 82,
    head: [["Subject", markLabels.first, markLabels.second, markLabels.third, "Total"]],
    body: rows
  });

  const y = pdf.lastAutoTable.finalY + 10;

  pdf.text("Total Marks: " + result.total + " / " + result.maxMarks, 14, y);
  pdf.text("Percentage: " + result.percentage + "%", 14, y + 7);
  pdf.text("Grade: " + result.grade, 14, y + 14);
  pdf.text("GPA: " + result.gpa, 70, y + 14);
  pdf.text("Status: " + result.status, 14, y + 21);
  pdf.text("Section Merit: " + result.sectionMerit, 14, y + 28);
  pdf.text("Class Rank: " + result.classRank, 70, y + 28);

  pdf.text("Recommendation:", 14, y + 41);
  pdf.text(pdf.splitTextToSize(result.recommendation, 180), 14, y + 48);

  const fileName = `result-card-${currentResultTerm}-${student.roll || student.name || "student"}.pdf`;
  pdf.save(fileName);
};

function collectCurrentModalSubjects() {
  return collectSubjectsFromModalInputs();
}

function calculateResultSummary(subjects, student = null) {
  let total = 0;
  let subjectCount = 0;

  subjectsList.forEach((subject) => {
    const marks = subjects[subject.key] || {};
    total += Number(marks.classMark || 0);
    total += Number(marks.quizMark || 0);
    total += Number(marks.examMark || 0);
    subjectCount++;
  });

  const maxMarks = subjectCount * 100;
  const percentage = maxMarks ? Number(((total / maxMarks) * 100).toFixed(2)) : 0;
  const ranking = student
    ? calculateStudentRanking(student, subjects)
    : { sectionMerit: "-", classRank: "-" };

  return {
    total,
    maxMarks,
    percentage,
    grade: getGrade(percentage),
    gpa: getGpa(percentage),
    status: percentage >= 33 ? "Passed" : "Failed",
    sectionMerit: ranking.sectionMerit,
    classRank: ranking.classRank,
    recommendation: getRecommendation(percentage)
  };
}

function csvSafe(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
