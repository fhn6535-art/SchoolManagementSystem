
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
    import {
      getFirestore,
      collection,
      addDoc,
      onSnapshot,
      deleteDoc,
      doc,
      updateDoc,
      getDoc,
      query,
      where
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

    const subjectsList = [
      { key: "math", label: "Math" },
      { key: "english", label: "English" },
      { key: "bangla", label: "Bangla" },
      { key: "science", label: "Science" },
      { key: "generalKnowledge", label: "General Knowledge" },
      { key: "islamicEducation", label: "Islamic Education" }
    ];

    let allData = [];
    let filteredData = [];
    let attendanceStudents = [];
    let currentRole = "";
    let currentStudentId = "";
    let selectedStudentForMarks = null;
    let unsubscribeStudents = null;

    const $ = (id) => document.getElementById(id);

    window.login = async function () {
      const email = $("email").value.trim();
      const password = $("password").value.trim();

      if (!email || !password) {
        alert("Enter email and password");
        return;
      }

      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        alert("Login failed: " + error.message);
      }
    };

    window.logout = async function () {
      if (unsubscribeStudents) {
        unsubscribeStudents();
        unsubscribeStudents = null;
      }

      await signOut(auth);
    };

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        $("loginBox").style.display = "flex";
        $("app").style.display = "none";
        currentRole = "";
        currentStudentId = "";
        allData = [];

        if (unsubscribeStudents) {
          unsubscribeStudents();
          unsubscribeStudents = null;
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

        $("loginBox").style.display = "none";
        $("app").style.display = "block";

        setupRoleUI(userData.name || user.email);
        loadStudents();
      } catch (error) {
        alert("Role check failed: " + error.message);
      }
    });

    function setupRoleUI(displayName) {
      if (currentRole === "admin") {
        $("welcomeText").innerText = "Welcome Admin";
        $("sidebarMenu").innerHTML = `
          <h2>Admin Panel</h2><hr>
          <p onclick="showPage('dashboard')">Dashboard</p>
          <p onclick="showPage('students')">Students</p>
          <p onclick="showPage('attendance')">Attendance</p>
          <p onclick="logout()">Logout</p>
        `;
        $("addStudentBtn").style.display = "inline-block";
        $("csvBtn").style.display = "inline-block";
        showPage("dashboard");
        return;
      }

      if (currentRole === "teacher") {
  $("welcomeText").innerText = "Welcome " + displayName;
  $("sidebarMenu").innerHTML = `
    <h2>Teacher Panel</h2><hr>
    <p onclick="showPage('dashboard')">Dashboard</p>
    <p onclick="showPage('students')">Students</p>
    <p onclick="showPage('attendance')">Attendance</p>
    <p onclick="logout()">Logout</p>
  `;

  $("addStudentBtn").style.display = "inline-block";
  $("csvBtn").style.display = "inline-block";

  showPage("dashboard");
  return;
}

      if (currentRole === "student") {
        $("welcomeText").innerText = "Welcome " + displayName;
        $("sidebarMenu").innerHTML = `
          <h2>Student Panel</h2><hr>
          <p onclick="showPage('dashboard')">My Dashboard</p>
          <p onclick="showPage('students')">My Record</p>
          <p onclick="logout()">Logout</p>
        `;
        $("addStudentBtn").style.display = "none";
        $("csvBtn").style.display = "none";
        showPage("dashboard");
        return;
      }

      alert("Invalid role");
      signOut(auth);
    }

    window.showPage = function (page) {
  $("dashboardPage").style.display = "none";
  $("studentsPage").style.display = "none";
  $("attendancePage").style.display = "none";
  closeMarksPanel();

  if (page === "dashboard") {
    $("dashboardPage").style.display = "block";
  }

  if (page === "students") {
  $("studentsPage").style.display = "block";

  if (currentRole === "student") {
    $("studentButtons").style.display = "none";
    $("addStudentArea").style.display = "none";
    $("allStudentsArea").style.display = "block";
    $("marksPanel").style.display = "none";

    showStudentRecordOnly();
  } else {
    $("studentButtons").style.display = "flex";
    $("addStudentArea").style.display = "none";
    $("allStudentsArea").style.display = "none";
  }
}

  if (page === "attendance") {
    if (currentRole !== "admin" && currentRole !== "teacher") {
      alert("You do not have permission");
      showPage("dashboard");
      return;
    }

    $("attendancePage").style.display = "block";
  }
};

function showStudentRecordOnly() {
  $("studentFilterPanel").style.display = "none";

  const ownRecord = allData.length ? [allData[0]] : [];
  renderStudents(ownRecord);
}

    window.showAddStudent = function () {
      if (currentRole !== "admin" && currentRole !== "teacher") {
        alert("You do not have permission");
        return;
      }

      closeMarksPanel();
      $("addStudentArea").style.display = "block";
      $("allStudentsArea").style.display = "none";
    };

window.showAllStudents = function () {
  $("allStudentsArea").style.display = "block";
  $("addStudentArea").style.display = "none";

  if (currentRole === "student") {
    $("studentButtons").style.display = "none";

    if ($("studentFilterPanel")) {
      $("studentFilterPanel").style.display = "none";
    }

    renderStudents(allData.length ? [allData[0]] : []);
    return;
  }

  $("studentButtons").style.display = "flex";
  $("addStudentBtn").style.display = "inline-block";

  if ($("studentFilterPanel")) {
    $("studentFilterPanel").style.display = "flex";
  }

  closeMarksPanel();
  applyFilters();
};

    function loadStudents() {
      if (unsubscribeStudents) {
        unsubscribeStudents();
        unsubscribeStudents = null;
      }

      const ref = currentRole === "student"
        ? query(collection(db, "students"), where("studentId", "==", currentStudentId))
        : collection(db, "students");

      unsubscribeStudents = onSnapshot(ref, (snap) => {
        allData = [];
        snap.forEach((item) => allData.push({ id: item.id, ...item.data() }));

        updateDashboardStats(allData);
        updateClassWiseDashboard(allData);
        updateStudentProfileAndResult(allData);
        applyFilters();
      }, (error) => {
        alert("Student data load failed: " + error.message);
      });
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
    const className = student.className || "Unassigned";

    if (!classMap[className]) {
      classMap[className] = {
        total: 0,
        present: 0,
        absent: 0,
        late: 0
      };
    }

    classMap[className].total++;

    if (student.attendance === "Present") {
      classMap[className].present++;
    } else if (student.attendance === "Absent") {
      classMap[className].absent++;
    } else if (student.attendance === "Late") {
      classMap[className].late++;
    }
  });

  const classes = Object.keys(classMap).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true });
  });

  if (!classes.length) {
    table.innerHTML = `
      <tr>
        <td colspan="6">No class data found</td>
      </tr>
    `;
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
    $("studentProfileArea").style.display = "none";
    $("statsRow").style.display = "flex";
    $("classWiseDashboard").style.display = "block";
    return;
  }

  $("statsRow").style.display = "none";
  $("classWiseDashboard").style.display = "none";
  $("studentProfileArea").style.display = "block";

  const student = data[0];

  if (!student) {
    $("studentProfileName").innerText = "No student record found";
    $("studentResultTable").innerHTML = `
      <tr>
        <td colspan="5">No result found</td>
      </tr>
    `;
    resetResultSummary();
    return;
  }

  $("studentProfileName").innerText = student.name || "-";
  $("studentProfileClass").innerText = student.className || "-";
  $("studentProfileSection").innerText = student.section || "-";
  $("studentProfileRoll").innerText = student.roll || "-";
  $("studentProfileEmail").innerText = student.studentEmail || "-";
  $("studentProfileAttendance").innerText = student.attendance || "-";
  $("studentProfileAttendancePercent").innerText = (student.attendancePercent || 0) + "%";

  renderStudentResultCard(student.subjects || {});
}

function renderStudentResultCard(subjects) {
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

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${subject.label}</td>
      <td>${classMark}</td>
      <td>${quizMark}</td>
      <td>${examMark}</td>
      <td><b>${total}</b></td>
    `;

    resultTable.appendChild(tr);
  });

  const maxMarks = subjectCount * 100;
  const percentage = maxMarks ? ((grandTotal / maxMarks) * 100).toFixed(2) : "0.00";
  const grade = getGrade(Number(percentage));
  const status = Number(percentage) >= 33 ? "Passed" : "Failed";

  $("resultTotalMarks").innerText = grandTotal + " / " + maxMarks;
  $("resultPercentage").innerText = percentage + "%";
  $("resultGrade").innerText = grade;
  $("resultStatus").innerText = status;
}

function resetResultSummary() {
  $("resultTotalMarks").innerText = "0";
  $("resultPercentage").innerText = "0%";
  $("resultGrade").innerText = "-";
  $("resultStatus").innerText = "-";
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
      const marks = Number($("marks").value || 0);
      const attendance = $("attendance").value;
      const attendancePercent = Number($("attendancePercent").value || 0);

      if (!name || !className || !section || !roll || !studentEmail) {
        alert("Fill all required fields");
        return;
      }

      try {
        await addDoc(collection(db, "students"), {
          name,
          className,
          section,
          roll,
          studentEmail,
          studentId: studentEmail,
          marks,
          attendance,
          attendancePercent,
          subjects: createEmptySubjects(),
          createdAt: new Date().toISOString()
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

    function clearStudentForm() {
      [
        "name",
        "studentClass",
        "section",
        "roll",
        "studentEmail",
        "marks",
        "attendancePercent"
      ].forEach((id) => {
        $(id).value = "";
      });

      $("attendance").value = "Present";
    }

    window.applyFilters = function () {
      const search = ($("search")?.value || "").toLowerCase();
      const classFilter = ($("filterClass")?.value || "").toLowerCase();
      const sectionFilter = ($("filterSection")?.value || "").toLowerCase();

      const filtered = allData.filter((student) => {
        const nameMatch = (student.name || "").toLowerCase().includes(search);
        const classMatch = classFilter
          ? (student.className || "").toLowerCase().includes(classFilter)
          : true;
        const sectionMatch = sectionFilter
          ? (student.section || "").toLowerCase().includes(sectionFilter)
          : true;

        return nameMatch && classMatch && sectionMatch;
      });

      filteredData = filtered;
      renderStudents(filteredData);
    };

    function renderStudents(data) {
      const table = $("table");
      table.innerHTML = "";

      $("emptyStudents").style.display = data.length ? "none" : "block";

      data.forEach((student) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${escapeHtml(student.name || "")}</td>
          <td>${escapeHtml(student.className || "")}</td>
          <td>${escapeHtml(student.section || "")}</td>
          <td>${escapeHtml(student.roll || "")}</td>
          <td>${escapeHtml(student.studentEmail || "")}</td>
          <td>${escapeHtml(student.marks ?? 0)}</td>
          <td>${escapeHtml(student.attendance || "")}</td>
          <td>${escapeHtml(student.attendancePercent ?? 0)}%</td>
          <td>${getActionButtons(student.id)}</td>
        `;

        table.appendChild(tr);
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

  $("profileName").innerText = student.name || "-";
  $("profileClass").innerText = student.className || "-";
  $("profileSection").innerText = student.section || "-";
  $("profileRoll").innerText = student.roll || "-";
  $("profileEmail").innerText = student.studentEmail || "-";

  renderMarksTable(student.subjects || {});

  $("marksPanel").style.display = "block";
  $("marksPanel").scrollIntoView({ behavior: "smooth", block: "start" });
};
   
let modalMode = "view";

window.viewStudentProfile = function (id) {
  const student = allData.find((item) => item.id === id);

  if (!student) {
    alert("Student not found");
    return;
  }

  modalMode = "view";
  selectedStudentForMarks = student;
  renderStudentModal(student, false);

  $("studentModalTitle").innerText = "Student Profile & Result Card";
  $("saveMarksBtn").style.display = "none";
  $("studentModal").style.display = "flex";
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

  modalMode = "edit";
  selectedStudentForMarks = student;
  renderStudentModal(student, true);

  $("studentModalTitle").innerText = "Update Student Marks";
  $("saveMarksBtn").style.display = "inline-block";
  $("studentModal").style.display = "flex";
};

function renderStudentModal(student, editable) {
  $("modalProfileName").innerText = student.name || "-";
  $("modalProfileClass").innerText = student.className || "-";
  $("modalProfileSection").innerText = student.section || "-";
  $("modalProfileRoll").innerText = student.roll || "-";
  $("modalProfileEmail").innerText = student.studentEmail || "-";
  $("modalProfileAttendance").innerText = student.attendance || "-";
  $("modalProfileAttendancePercent").innerText = (student.attendancePercent || 0) + "%";

  renderModalMarksTable(student.subjects || {}, editable);
}

function renderModalMarksTable(subjects, editable) {
  const table = $("modalMarksTable");
  table.innerHTML = "";

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

    const readonly = editable ? "" : "readonly";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${subject.label}</td>
      <td>
        <input class="marksInput subjectMark" ${readonly}
          data-subject="${subject.key}" data-type="classMark"
          type="number" min="0" value="${classMark}"
          oninput="refreshModalResult()">
      </td>
      <td>
        <input class="marksInput subjectMark" ${readonly}
          data-subject="${subject.key}" data-type="quizMark"
          type="number" min="0" value="${quizMark}"
          oninput="refreshModalResult()">
      </td>
      <td>
        <input class="marksInput subjectMark" ${readonly}
          data-subject="${subject.key}" data-type="examMark"
          type="number" min="0" value="${examMark}"
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
  const maxMarks = subjectCount * 100;
  const percentage = maxMarks ? ((grandTotal / maxMarks) * 100).toFixed(2) : "0.00";
  const grade = getGrade(Number(percentage));
  const status = Number(percentage) >= 33 ? "Passed" : "Failed";

  $("modalTotalMarks").innerText = grandTotal + " / " + maxMarks;
  $("modalPercentage").innerText = percentage + "%";
  $("modalGrade").innerText = grade;
  $("modalStatus").innerText = status;
  $("modalRecommendation").innerText = getRecommendation(Number(percentage));
}

function getRecommendation(percentage) {
  if (percentage >= 80) return "Excellent performance. Keep maintaining this result.";
  if (percentage >= 70) return "Very good result. A little more practice can improve the grade further.";
  if (percentage >= 60) return "Good progress. Focus more on weak subjects.";
  if (percentage >= 50) return "Average result. Regular study and revision are recommended.";
  if (percentage >= 33) return "Passed, but improvement is strongly needed.";
  return "Failed. Extra support, guardian follow-up, and daily study plan are recommended.";
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

  const subjects = createEmptySubjects();

  document.querySelectorAll("#modalMarksTable .subjectMark").forEach((input) => {
    const subject = input.dataset.subject;
    const type = input.dataset.type;
    subjects[subject][type] = Number(input.value || 0);
  });

  const overallMarks = calculateOverallMarks(subjects);

  try {
    await updateDoc(doc(db, "students", selectedStudentForMarks.id), {
      subjects,
      marks: overallMarks
    });

    alert("Marks updated successfully");
    closeStudentModal();
  } catch (error) {
    alert("Update failed: " + error.message);
  }
};

window.closeStudentModal = function () {
  selectedStudentForMarks = null;
  $("studentModal").style.display = "none";
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
        await deleteDoc(doc(db, "students", id));
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

      const newAttendance = prompt(
        "Attendance: Present / Absent / Late",
        student.attendance || "Present"
      );

      if (newAttendance === null) return;

      const allowedAttendance = ["Present", "Absent", "Late"];

      if (!allowedAttendance.includes(newAttendance.trim())) {
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
          attendance: newAttendance.trim(),
          attendancePercent: Number(newAttendancePercent || 0)
        });
      } catch (error) {
        alert("Update failed: " + error.message);
      }
    };

    window.loadAttendanceSheet = function () {
  if (currentRole !== "admin" && currentRole !== "teacher") {
    alert("You do not have permission");
    return;
  }

  const className = $("attendanceClass").value.trim().toLowerCase();
  const section = $("attendanceSection").value.trim().toLowerCase();

  if (!className || !section) {
    alert("Enter class and section");
    return;
  }

  attendanceStudents = allData
    .filter((student) =>
      (student.className || "").toLowerCase() === className &&
      (student.section || "").toLowerCase() === section
    )
    .sort((a, b) => Number(a.roll || 0) - Number(b.roll || 0));

  renderAttendanceSheet();
};

function renderAttendanceSheet() {
  const table = $("attendanceTable");
  table.innerHTML = "";

  $("attendanceSheetArea").style.display = "block";

  const className = $("attendanceClass").value.trim();
  const section = $("attendanceSection").value.trim();

  $("attendanceSheetTitle").innerText =
    `Attendance Sheet - Class ${className}, Section ${section}`;

  if (!attendanceStudents.length) {
    table.innerHTML = `
      <tr>
        <td colspan="5">No students found for this class and section</td>
      </tr>
    `;
    return;
  }

  attendanceStudents.forEach((student) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(student.roll || "")}</td>
      <td>${escapeHtml(student.name || "")}</td>
      <td>${escapeHtml(student.className || "")}</td>
      <td>${escapeHtml(student.section || "")}</td>
      <td>
        <select class="attendanceStatus" data-id="${student.id}">
          <option value="Present" selected>Present</option>
          <option value="Absent">Absent</option>
          <option value="Late">Late</option>
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

  const updates = Array.from(document.querySelectorAll(".attendanceStatus"))
    .map((select) => {
      return updateDoc(doc(db, "students", select.dataset.id), {
        attendance: select.value
      });
    });

  try {
    await Promise.all(updates);
    alert("Attendance saved successfully");
  } catch (error) {
    alert("Attendance save failed: " + error.message);
  }
};

    window.downloadCSV = function () {
      const dataToDownload = filteredData.length || isFilterActive()
        ? filteredData
        : allData;
      const rows = dataToDownload.map((student) => [
        student.name || "",
        student.className || "",
        student.section || "",
        student.roll || "",
        student.studentEmail || "",
        student.marks || 0,
        student.attendance || "",
        student.attendancePercent || 0
      ].map(csvSafe).join(","));

      const csv = "Name,Class,Section,Roll,Student Email,Marks,Attendance,Attendance Percent\n" + rows.join("\n");
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
    window.downloadResultPDF = function () {
  if (!selectedStudentForMarks) {
    alert("No student selected");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const student = selectedStudentForMarks;
  const subjects = collectCurrentModalSubjects();
  const result = calculateResultSummary(subjects);

  pdf.setFontSize(16);
  pdf.text("FH School Management System", 14, 16);

  pdf.setFontSize(13);
  pdf.text("Student Result Card", 14, 26);

  pdf.setFontSize(10);
  pdf.text("Name: " + (student.name || "-"), 14, 38);
  pdf.text("Class: " + (student.className || "-"), 14, 45);
  pdf.text("Section: " + (student.section || "-"), 70, 45);
  pdf.text("Roll: " + (student.roll || "-"), 125, 45);
  pdf.text("Email: " + (student.studentEmail || "-"), 14, 52);
  pdf.text("Attendance: " + (student.attendance || "-"), 14, 59);
  pdf.text("Attendance %: " + (student.attendancePercent || 0) + "%", 70, 59);

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
    startY: 68,
    head: [["Subject", "Class Mark", "Quiz Mark", "Exam Mark", "Total"]],
    body: rows
  });

  const y = pdf.lastAutoTable.finalY + 10;

  pdf.text("Total Marks: " + result.total + " / " + result.maxMarks, 14, y);
  pdf.text("Percentage: " + result.percentage + "%", 14, y + 7);
  pdf.text("Grade: " + result.grade, 14, y + 14);
  pdf.text("Status: " + result.status, 14, y + 21);

  pdf.text("Recommendation:", 14, y + 34);
  pdf.text(pdf.splitTextToSize(result.recommendation, 180), 14, y + 41);

  const fileName = `result-card-${student.roll || student.name || "student"}.pdf`;
  pdf.save(fileName);
};

function collectCurrentModalSubjects() {
  const subjects = createEmptySubjects();

  document.querySelectorAll("#modalMarksTable .subjectMark").forEach((input) => {
    const subject = input.dataset.subject;
    const type = input.dataset.type;
    subjects[subject][type] = Number(input.value || 0);
  });

  return subjects;
}

function calculateResultSummary(subjects) {
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

  return {
    total,
    maxMarks,
    percentage,
    grade: getGrade(percentage),
    status: percentage >= 33 ? "Passed" : "Failed",
    recommendation: getRecommendation(percentage)
  };
}
