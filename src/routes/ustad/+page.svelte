
<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount, onDestroy } from "svelte";
  import QRCode from "qrcode";
  import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
  import { goto } from "$app/navigation";

  /* =========================
     INTERFACES
  ========================= */

  interface User {
    id: number;
    username: string;
    full_name?: string | null;
    role: "admin" | "santri" | "ustad";
    kelas?: string | null;
    class_name?: string | null;
    class_id?: number | null;
  }

  interface ClassRoom {
    id: number;
    name: string;
  }

  interface StudentGrade {
    id?: number;
    user_id: number;
    class_id: number;
    subject: string;
    academic_year: string;
    semester: number;
    nilai_tugas: number | null;
    nilai_ulangan_harian: number | null;
    nilai_pts: number | null;
    nilai_pas: number | null;
    nilai_sikap_karakter: number | null;
    nilai_ujian_sekolah: number | null;
    nilai_akhir?: number | null;
  }

  interface Entry {
    id: number;
    date: string;
    amount: number;
    kind: "pemasukan" | "pengeluaran";
    name: string;
    user_id: number;
  }

  interface SPPRecord {
    id?: number;
    user_id: number;
    year: number;

    january: boolean;
    february: boolean;
    march: boolean;
    april: boolean;
    may: boolean;
    june: boolean;
    july: boolean;
    august: boolean;
    september: boolean;
    october: boolean;
    november: boolean;
    december: boolean;
  }

  interface Attendance {
    id?: number;
    user_id: number;
    date: string;
    status: "hadir" | "izin" | "sakit" | "alpha";
  }

  type AttendanceStatus = Attendance["status"] | "";

  // Status absensi sementara. Tidak dikirim ke Supabase sampai tombol
  // "Simpan Semua Absensi" ditekan.
  let attendanceDrafts: Record<number, AttendanceStatus> = {};
  let attendanceSaving = false;

  interface Schedule {
    id?: number;
    day: string;
    subject: string;
    subject2?: string | null;
    teacher_id: number | null;
    time: string;
  }

  interface Announcement {
    id?: number;
    title: string;
    content: string;
    created_at?: string;
    created_by: number | null;
  }

  type ActiveView =
    | "home"
    | "spp"
    | "users"
    | "attendance"
    | "attendanceScan"
    | "schedule"
    | "grades"
    | "barcode"
    | "topup"
    | "announcement";

  /* =========================
     MONTHS
  ========================= */

  const months: {
    key: keyof Omit<
      SPPRecord,
      "id" | "user_id" | "year"
    >;
    label: string;
  }[] = [
    { key: "january", label: "Jan" },
    { key: "february", label: "Feb" },
    { key: "march", label: "Mar" },
    { key: "april", label: "Apr" },
    { key: "may", label: "Mei" },
    { key: "june", label: "Jun" },
    { key: "july", label: "Jul" },
    { key: "august", label: "Agu" },
    { key: "september", label: "Sep" },
    { key: "october", label: "Okt" },
    { key: "november", label: "Nov" },
    { key: "december", label: "Des" }
  ];

  /* =========================
     MAIN STATE
  ========================= */

  let activeView: ActiveView = "home";
  let sidebarOpen = false;

  let currentUser: User | null = null;

  let users: User[] = [];
  let entries: Entry[] = [];
  let schedules: Schedule[] = [];
  let attendanceData: Attendance[] = [];
  let announcements: Announcement[] = [];

  let sppData: Record<number, SPPRecord> = {};

  /* =========================
     GRADE / REKAP NILAI
  ========================= */

  let classes: ClassRoom[] = [];
  let grades: StudentGrade[] = [];
  let gradesLoading = false;
  let gradeLoadError = "";

  let gradeFilterClass = "";
  let gradeFilterStudent = "";
  let gradeFilterAcademicYear = `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
  let gradeFilterSemester = "1";

  let showGradeModal = false;
  let editingGradeId: number | null = null;
  let gradeClassId = "";
  let gradeStudentId = "";
  const subjectOptions = [
    "Al-Qur'an Hadits",
    "Aqidah Akhlak",
    "Fiqih",
    "Sejarah Kebudayaan Islam",
    "Bahasa Arab",
    "Bahasa Indonesia",
    "Bahasa Inggris",
    "Matematika",
    "IPA",
    "IPS",
    "Pendidikan Pancasila",
    "Informatika",
    "Tahfidz",
    "Olahraga"
  ];
  let gradeSubject = "";
  let gradeAcademicYear = `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
  let gradeSemester = "1";
  let gradeTask: number | string = "";
  let gradeDailyTest: number | string = "";
  let gradePTS: number | string = "";
  let gradePAS: number | string = "";
  let gradeCharacter: number | string = "";
  let gradeSchoolExam: number | string = "";

  /* =========================
     ASSIGN CLASS TO STUDENT
  ========================= */

  let showStudentClassModal = false;
  let selectedStudentForClass = "";
  let selectedClassForStudent = "";

  /* =========================
     DASHBOARD STATS
  ========================= */

  let totalSaldo = 0;
  let totalPemasukan = 0;
  let totalPengeluaran = 0;

  /* =========================
     TOAST
  ========================= */

  let message = "";
  let isError = false;
  let toastTimer: ReturnType<typeof setTimeout>;

  /* =========================
     SPP
  ========================= */

  let selectedYear = new Date().getFullYear();
  let searchKeyword = "";

  /* =========================
     USER MODAL
  ========================= */

  let showUserModal = false;
  let editingUserId: number | null = null;

  let formUsername = "";

  let formRole:
    | "admin"
    | "santri"
    | "ustad" = "santri";

  /* =========================
     TOP UP
  ========================= */

  let transactionName = "";

  let transactionDate =
    new Date()
      .toISOString()
      .split("T")[0];

  let transactionAmount:
    | number
    | string = "";

  let transactionUserId = "";

  /* =========================
     ATTENDANCE
  ========================= */

  let attendanceDate =
    new Date()
      .toISOString()
      .split("T")[0];

  let selectedAttendanceUser = "";

  let attendanceStatus:
    | "hadir"
    | "izin"
    | "sakit"
    | "alpha" = "hadir";

  /* =========================
     QR ATTENDANCE SCANNER
  ========================= */

  let qrCodes: Record<number, string> = {};
  let qrScanner: Html5Qrcode | null = null;
  let qrScannerRunning = false;
  let qrScanBusy = false;
  let qrScannerStarting = false;
  let lastScannedPayload = "";
  let lastScannedStudent: User | null = null;
  let qrScanMessage = "";
  let cameraError = "";

  async function generateQRCode(userId: number) {
    try {
      return await QRCode.toDataURL(`SANTRI:${userId}`, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "H",
        type: "image/png"
      });
    } catch (error) {
      console.error("Gagal membuat QR Code:", error);
      return "";
    }
  }

  async function generateAllQRCodes() {
    const result: Record<number, string> = {};

    for (const santri of santriUsers) {
      result[santri.id] = await generateQRCode(santri.id);
    }

    qrCodes = result;
  }

  function parseSantriQr(payload: string) {
    const value = payload.trim();

    if (!value.toUpperCase().startsWith("SANTRI:")) return null;

    const id = Number(value.slice(7).trim());
    if (!Number.isInteger(id) || id <= 0) return null;

    return id;
  }

  async function saveAttendanceFromQR(userId: number) {
    if (!canManageAttendance) {
      showToast("Hanya admin atau ustad yang dapat mengisi absensi.", true);
      return false;
    }

    const santri = santriUsers.find(user => user.id === userId);

    if (!santri) {
      showToast("QR Code bukan milik santri yang terdaftar.", true);
      return false;
    }

    const saved = await saveAttendanceForStudent(userId, "hadir", false);
    if (!saved) return false;

    lastScannedStudent = santri;
    qrScanMessage = `✓ ${santri.full_name || santri.username} berhasil disimpan sebagai Hadir.`;
    showToast(`${santri.full_name || santri.username} berhasil disimpan sebagai Hadir.`);
    return true;
  }

  async function handleQRCode(decodedText: string) {
    if (qrScanBusy) return;

    const payload = decodedText.trim();
    if (!payload || payload === lastScannedPayload) return;

    const userId = parseSantriQr(payload);

    if (!userId) {
      lastScannedPayload = payload;
      qrScanMessage = "QR tidak dikenali. Gunakan QR Code santri dari halaman Barcode Santri.";
      showToast(qrScanMessage, true);
      setTimeout(() => {
        if (lastScannedPayload === payload) lastScannedPayload = "";
      }, 1800);
      return;
    }

    qrScanBusy = true;
    lastScannedPayload = payload;

    try {
      await saveAttendanceFromQR(userId);
    } finally {
      setTimeout(() => {
        qrScanBusy = false;
        lastScannedPayload = "";
      }, 1800);
    }
  }

  function getCameraErrorMessage(error: unknown) {
    const name = error instanceof DOMException ? error.name : "";
    const message = error instanceof Error ? error.message : String(error || "");

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Izin kamera ditolak. Izinkan kamera untuk situs ini, lalu tekan Mulai Scan lagi.";
    }

    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "Kamera tidak ditemukan pada perangkat ini.";
    }

    if (name === "NotReadableError" || name === "TrackStartError") {
      return "Kamera sedang digunakan aplikasi/tab lain. Tutup penggunaan kamera lain lalu coba lagi.";
    }

    if (name === "SecurityError") {
      return "Browser memblokir akses kamera karena alasan keamanan.";
    }

    if (name === "OverconstrainedError") {
      return "Kamera yang dipilih tidak tersedia. Sistem akan mencoba kamera lain.";
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      return "Akses kamera membutuhkan HTTPS (atau localhost saat development).";
    }

    return message
      ? `Kamera tidak dapat dibuka: ${message}`
      : "Kamera tidak dapat dibuka. Periksa izin kamera dan HTTPS.";
  }

  async function releaseQRScanner() {
    const scanner = qrScanner;
    qrScanner = null;

    if (!scanner) {
      qrScannerRunning = false;
      return;
    }

    try {
      if (qrScannerRunning) {
        await scanner.stop();
      }
    } catch (error) {
      console.warn("Gagal menghentikan kamera:", error);
    }

    try {
      await scanner.clear();
    } catch (error) {
      console.warn("Gagal membersihkan scanner:", error);
    }

    qrScannerRunning = false;
  }

  async function startQRScanner() {
    if (qrScannerRunning || qrScannerStarting) return;

    if (!canManageAttendance) {
      showToast("Hanya admin atau ustad yang dapat menggunakan scanner absensi.", true);
      return;
    }

    if (typeof window === "undefined") return;

    const reader = document.getElementById("qr-reader");
    if (!reader) {
      showToast("Area kamera belum siap. Buka halaman Scan Absensi lalu coba lagi.", true);
      return;
    }

    if (!window.isSecureContext) {
      cameraError = "Kamera browser membutuhkan HTTPS. Jika development, gunakan localhost.";
      qrScanMessage = cameraError;
      showToast(cameraError, true);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraError = "Browser ini tidak mendukung akses kamera.";
      qrScanMessage = cameraError;
      showToast(cameraError, true);
      return;
    }

    qrScannerStarting = true;
    cameraError = "";
    qrScanMessage = "Meminta izin kamera...";
    lastScannedPayload = "";
    qrScanBusy = false;

    // Pastikan instance lama benar-benar dilepas sebelum membuat instance baru.
    await releaseQRScanner();

    // Bersihkan isi target agar html5-qrcode tidak bertabrakan dengan instance sebelumnya.
    reader.innerHTML = "";

    try {
      // getCameras() sekaligus memicu permission request pada browser yang mendukungnya.
      const cameras = await Html5Qrcode.getCameras();

      if (!cameras?.length) {
        throw new Error("Tidak ada kamera yang tersedia.");
      }

      // Utamakan kamera belakang pada HP berdasarkan label.
      const backCamera =
        cameras.find(camera =>
          /back|rear|environment|belakang|belakang/i.test(camera.label)
        ) || cameras[cameras.length > 1 ? 1 : 0] || cameras[0];

      const scanner = new Html5Qrcode("qr-reader");
      qrScanner = scanner;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1,
        disableFlip: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8
        ]
      };

      try {
        // Memulai berdasarkan deviceId lebih stabil daripada hanya mengandalkan facingMode.
        await scanner.start(
          backCamera.id,
          config,
          async (decodedText) => {
            await handleQRCode(decodedText);
          },
          () => {
            // Tidak ada QR pada frame ini: abaikan.
          }
        );
      } catch (firstError) {
        // Fallback untuk perangkat/browser yang menolak deviceId tertentu.
        try {
          await scanner.clear();

          const fallbackScanner = new Html5Qrcode("qr-reader");
          qrScanner = fallbackScanner;

          await fallbackScanner.start(
            { facingMode: { ideal: "environment" } },
            config,
            async (decodedText) => {
              await handleQRCode(decodedText);
            },
            () => {}
          );
        } catch (fallbackError) {
          try {
            await scanner.clear();
          } catch {}

          throw fallbackError ?? firstError;
        }
      }

      qrScannerRunning = true;
      qrScanMessage = "Kamera aktif. Arahkan kamera ke QR Code/barcode santri.";
    } catch (error) {
      console.error("Gagal membuka kamera:", error);

      await releaseQRScanner();
      reader.innerHTML = "";

      cameraError = getCameraErrorMessage(error);
      qrScanMessage = cameraError;
      showToast(cameraError, true);
    } finally {
      qrScannerStarting = false;
    }
  }

  async function stopQRScanner() {
    cameraError = "";
    qrScanMessage = "Kamera dihentikan.";
    qrScanBusy = false;
    lastScannedPayload = "";

    await releaseQRScanner();

    const reader = document.getElementById("qr-reader");
    if (reader) reader.innerHTML = "";
  }

  async function restartQRScannerForDate() {
    lastScannedStudent = null;
    lastScannedPayload = "";
    qrScanMessage = qrScannerRunning
      ? "Tanggal diperbarui. Kamera tetap aktif."
      : "";
    cameraError = "";
    await loadAttendance();
  }

  // Kelompok pendidikan dan kelas untuk halaman absensi
  // Setiap jenjang ditampilkan terpisah. Setelah memilih jenjang,
  // daftar santri hanya menampilkan kelas yang dipilih.
  let selectedAttendanceGroup: "SD" | "SMP" | "SMA" = "SD";
  let selectedAttendanceClass = "1";

  /* =========================
     SCHEDULE
  ========================= */

  let showScheduleModal = false;
  let editingScheduleId: number | null = null;

  let scheduleDay = "";
  let scheduleSubject = "";
  let scheduleSubject2 = "";
  let scheduleTeacherId = "";
  let scheduleTime = "";

  // Urutan hari untuk tampilan jadwal per kelompok
  const scheduleDays = [
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
    "Minggu"
  ];

  // Kelompokkan jadwal berdasarkan hari dan urutkan berdasarkan jam
  $: schedulesByDay = scheduleDays.map(day => ({
    day,
    schedules: schedules
      .filter(schedule => schedule.day === day)
      .sort((a, b) => a.time.localeCompare(b.time))
  }));

  /* =========================
     ANNOUNCEMENT
  ========================= */

  let showAnnouncementModal = false;

  let editingAnnouncementId:
    | number
    | null = null;

  let announcementTitle = "";
  let announcementContent = "";

  /* =========================
     INITIAL LOAD
  ========================= */

  onMount(async () => {

    const storedUser =
      localStorage.getItem("user");

    if (!storedUser) {

      goto("/login");

      return;
    }

    try {

      currentUser =
        JSON.parse(storedUser);

    } catch {

      localStorage.removeItem("user");

      goto("/login");

      return;
    }

    await Promise.all([
      loadUsers(),
      loadEntries(),
      loadSPPData(),
      loadAttendance(),
      loadSchedules(),
      loadAnnouncements(),
      loadClasses(),
      loadGrades()
    ]);
  });

  /* =========================
     COMPUTED USERS
  ========================= */

  $: santriUsers =
    users.filter(
      user =>
        user.role === "santri"
    );

  function getEducationGroup(user: User): "SD" | "SMP" | "SMA" | null {
    const classRoomName = user.class_name || user.kelas || classes.find(item => item.id === Number(user.class_id))?.name || "";
    const classText = classRoomName.toLowerCase();

    // Jika nama kelas sudah menyebut jenjang, gunakan langsung.
    if (classText.includes("sma") || classText.includes("smk")) return "SMA";
    if (classText.includes("smp") || classText.includes("mts")) return "SMP";
    if (classText.includes("sd") || classText.includes("mi")) return "SD";

    // Jika hanya berupa nomor kelas: 1-6 = SD, 7-9 = SMP, 10-12 = SMA.
    const match = classText.match(/\b(\d{1,2})\b/);
    const gradeNumber = match ? Number(match[1]) : NaN;

    if (gradeNumber >= 1 && gradeNumber <= 6) return "SD";
    if (gradeNumber >= 7 && gradeNumber <= 9) return "SMP";
    if (gradeNumber >= 10 && gradeNumber <= 12) return "SMA";

    return null;
  }

  function getEducationClassNumber(user: User, group: "SD" | "SMP" | "SMA") {
    const classRoomName = user.class_name || user.kelas || classes.find(item => item.id === Number(user.class_id))?.name || "";
    const classText = classRoomName.toLowerCase();

    // Bentuk yang didukung: "SD Kelas 1", "SMP 2", "Kelas 8", "10", dll.
    const match = classText.match(/(?:kelas\s*)?(\d{1,2})/i);
    if (!match) return null;

    const rawNumber = Number(match[1]);
    if (!Number.isFinite(rawNumber)) return null;

    if (group === "SD" && rawNumber >= 1 && rawNumber <= 6) {
      return String(rawNumber);
    }

    if (group === "SMP" && rawNumber >= 7 && rawNumber <= 9) {
      return String(rawNumber - 6);
    }

    if (group === "SMA" && rawNumber >= 10 && rawNumber <= 12) {
      return String(rawNumber - 9);
    }

    // Jika database sudah menyimpan "SMP Kelas 1" / "SMA Kelas 1",
    // angka tersebut langsung dianggap sebagai kelas 1-3.
    if ((group === "SMP" || group === "SMA") && rawNumber >= 1 && rawNumber <= 3) {
      return String(rawNumber);
    }

    return null;
  }

  $: attendanceStudents = santriUsers.filter(santri => {
    const group = getEducationGroup(santri);
    if (group !== selectedAttendanceGroup) return false;
    // SD dan SMA digabung. SMP saja yang dipisah kelas 1-3.
    if (selectedAttendanceGroup !== "SMP") return true;
    return getEducationClassNumber(santri, "SMP") === selectedAttendanceClass;
  });

  $: attendanceGroupCounts = {
    SD: santriUsers.filter(santri => getEducationGroup(santri) === "SD").length,
    SMP: santriUsers.filter(santri => getEducationGroup(santri) === "SMP").length,
    SMA: santriUsers.filter(santri => getEducationGroup(santri) === "SMA").length
  };

  $: attendanceClassCounts = {
    SMP: ["1", "2", "3"].map(kelas => ({
      kelas,
      count: santriUsers.filter(santri =>
        getEducationGroup(santri) === "SMP" &&
        getEducationClassNumber(santri, "SMP") === kelas
      ).length
    }))
  };

  $: attendanceGroupData = attendanceStudents.map(santri => ({
    student: santri,
    attendance: getAttendance(santri.id)
  }));

  $: attendanceGroupSummary = {
    hadir: attendanceGroupData.filter(item => item.attendance?.status === "hadir").length,
    izin: attendanceGroupData.filter(item => item.attendance?.status === "izin").length,
    sakit: attendanceGroupData.filter(item => item.attendance?.status === "sakit").length,
    alpha: attendanceGroupData.filter(item => item.attendance?.status === "alpha").length
  };

  $: ustadUsers =
    users.filter(
      user =>
        user.role === "ustad"
    );

  $: unassignedSantri = santriUsers.filter(
    user => !user.class_id
  );


  $: gradeStudents = santriUsers.filter(user =>
    !gradeClassId || Number(user.class_id) === Number(gradeClassId)
  );

  $: filteredGradeStudents = santriUsers.filter(user =>
    !gradeFilterClass || Number(user.class_id) === Number(gradeFilterClass)
  );

  $: filteredGrades = grades.filter(grade => {
    // Role santri sudah difilter langsung di query Supabase dan tidak boleh
    // tersembunyi oleh filter tahun/semester milik halaman admin/ustad.
    if (currentUser?.role === "santri") return true;

    if (gradeFilterClass && grade.class_id !== Number(gradeFilterClass)) return false;
    if (gradeFilterStudent && grade.user_id !== Number(gradeFilterStudent)) return false;
    if (gradeFilterAcademicYear && grade.academic_year !== gradeFilterAcademicYear) return false;
    if (gradeFilterSemester && grade.semester !== Number(gradeFilterSemester)) return false;
    return true;
  });

  $: filteredSantri =
    santriUsers.filter(
      user =>
        user.username
          .toLowerCase()
          .includes(
            searchKeyword.toLowerCase()
          )
    );

  /* =========================
     ADMIN CHECK
  ========================= */

  $: isAdmin =
    currentUser?.role === "admin";

  // Admin dan Ustad dapat mengisi absensi santri
  $: canManageAttendance =
    currentUser?.role === "admin" ||
    currentUser?.role === "ustad";

  /* =========================
     ASSIGN CLASS TO SANTRI
  ========================= */

  function openStudentClassModal() {
    if (currentUser?.role !== "admin" && currentUser?.role !== "ustad") {
      showToast("Anda tidak memiliki akses untuk mengatur kelas santri.", true);
      return;
    }

    selectedStudentForClass = "";
    selectedClassForStudent = "";
    showStudentClassModal = true;
  }

  async function saveStudentClass() {
    if (currentUser?.role !== "admin" && currentUser?.role !== "ustad") {
      showToast("Anda tidak memiliki akses untuk mengatur kelas santri.", true);
      return;
    }

    if (!selectedStudentForClass || !selectedClassForStudent) {
      showToast("Pilih santri dan kelas terlebih dahulu.", true);
      return;
    }

    const student = santriUsers.find(
      user => user.id === Number(selectedStudentForClass)
    );

    const classRoom = classes.find(
      item => item.id === Number(selectedClassForStudent)
    );

    if (!student || !classRoom) {
      showToast("Data santri atau kelas tidak ditemukan.", true);
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({
        class_id: classRoom.id,
        class_name: classRoom.name,
        kelas: classRoom.name
      })
      .eq("id", student.id)
      .eq("role", "santri");

    if (error) {
      showToast("Gagal mengatur kelas santri: " + error.message, true);
      return;
    }

    showToast(`Kelas ${student.username} berhasil diatur ke ${classRoom.name}.`);
    showStudentClassModal = false;
    await loadUsers();
  }

  /* =========================
     LOAD USERS
  ========================= */

  async function loadUsers() {

    const {
      data,
      error
    } = await supabase
      .from("users")
      .select(
        "id, username, full_name, role, kelas, class_name, class_id"
      )
      .order(
        "username",
        {
          ascending: true
        }
      );

    if (error) {

      showToast(
        "Gagal memuat user: " +
          error.message,
        true
      );

      return;
    }

    users =
      (data || []) as User[];

    await generateAllQRCodes();
  }

  /* =========================
     REKAP NILAI
  ========================= */

  async function loadClasses() {
    const { data, error } = await supabase
      .from("classes")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      showToast("Gagal memuat kelas: " + error.message, true);
      return;
    }

    classes = (data || []) as ClassRoom[];
  }

  async function loadGrades() {
    gradesLoading = true;
    gradeLoadError = "";

    try {
      let query = supabase
        .from("student_grades")
        .select("*")
        .order("academic_year", { ascending: false })
        .order("semester", { ascending: false })
        .order("id", { ascending: false });

      // Santri hanya mengambil nilai miliknya sendiri.
      if (currentUser?.role === "santri") {
        query = query.eq("user_id", currentUser.id);
      }

      const { data, error } = await query;

      if (error) {
        gradeLoadError = error.message;
        showToast("Gagal memuat rekap nilai: " + error.message, true);
        grades = [];
        return;
      }

      grades = (data || []) as StudentGrade[];
    } finally {
      gradesLoading = false;
    }
  }

  async function refreshGradeData() {
    await Promise.all([loadUsers(), loadClasses(), loadGrades()]);
  }

  function resetGradeForm() {
    editingGradeId = null;
    gradeClassId = "";
    gradeStudentId = "";
    gradeSubject = "";
    gradeAcademicYear = gradeFilterAcademicYear;
    gradeSemester = gradeFilterSemester;
    gradeTask = "";
    gradeDailyTest = "";
    gradePTS = "";
    gradePAS = "";
    gradeCharacter = "";
    gradeSchoolExam = "";
  }

  function openAddGrade() {
    if (currentUser?.role !== "admin" && currentUser?.role !== "ustad") {
      showToast("Anda tidak memiliki akses untuk menginput nilai.", true);
      return;
    }

    resetGradeForm();
    showGradeModal = true;
  }

  function openEditGrade(grade: StudentGrade) {
    if (currentUser?.role !== "admin" && currentUser?.role !== "ustad") return;

    editingGradeId = grade.id || null;
    gradeClassId = String(grade.class_id);
    gradeStudentId = String(grade.user_id);
    gradeSubject = grade.subject;
    gradeAcademicYear = grade.academic_year;
    gradeSemester = String(grade.semester);
    gradeTask = grade.nilai_tugas ?? "";
    gradeDailyTest = grade.nilai_ulangan_harian ?? "";
    gradePTS = grade.nilai_pts ?? "";
    gradePAS = grade.nilai_pas ?? "";
    gradeCharacter = grade.nilai_sikap_karakter ?? "";
    gradeSchoolExam = grade.nilai_ujian_sekolah ?? "";
    showGradeModal = true;
  }

  function normalizeGrade(value: number | string) {
    if (value === "" || value === null || value === undefined) return null;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) return undefined;
    return numberValue;
  }

  async function saveGrade() {
    if (currentUser?.role !== "admin" && currentUser?.role !== "ustad") {
      showToast("Anda tidak memiliki akses untuk menyimpan nilai.", true);
      return;
    }

    if (!gradeClassId || !gradeStudentId || !gradeSubject || !gradeAcademicYear.trim()) {
      showToast("Kelas, santri, mata pelajaran, tahun ajaran, dan semester wajib diisi.", true);
      return;
    }

    if (!["1", "2"].includes(gradeSemester)) {
      showToast("Semester harus 1 atau 2.", true);
      return;
    }

    const values = [gradeTask, gradeDailyTest, gradePTS, gradePAS, gradeCharacter, gradeSchoolExam]
      .map(normalizeGrade);

    if (values.some(value => value === undefined)) {
      showToast("Semua nilai harus berada di antara 0 sampai 100.", true);
      return;
    }

    const payload = {
      user_id: Number(gradeStudentId),
      class_id: Number(gradeClassId),
      subject: gradeSubject.trim(),
      academic_year: gradeAcademicYear.trim(),
      semester: Number(gradeSemester),
      nilai_tugas: values[0],
      nilai_ulangan_harian: values[1],
      nilai_pts: values[2],
      nilai_pas: values[3],
      nilai_sikap_karakter: values[4],
      nilai_ujian_sekolah: values[5]
    };

    const student = santriUsers.find(user => user.id === payload.user_id);
        if (!student || Number(student.class_id) !== payload.class_id) {
      showToast("Santri yang dipilih tidak sesuai dengan kelas.", true);
      return;
    }

    let error;
    if (editingGradeId) {
      ({ error } = await supabase.from("student_grades").update(payload).eq("id", editingGradeId));
    } else {
      ({ error } = await supabase
        .from("student_grades")
        .upsert(payload, { onConflict: "user_id,subject,academic_year,semester" }));
    }

    if (error) {
      showToast("Gagal menyimpan nilai: " + error.message, true);
      return;
    }

    showToast("Nilai berhasil disimpan.");
    showGradeModal = false;
    await loadGrades();
  }

  async function deleteGrade(id: number) {
    if (currentUser?.role !== "admin" && currentUser?.role !== "ustad") return;
    if (!confirm("Hapus data nilai ini?")) return;

    const { error } = await supabase
      .from("student_grades")
      .delete()
      .eq("id", id);

    if (error) {
      showToast("Gagal menghapus nilai: " + error.message, true);
      return;
    }

    showToast("Data nilai berhasil dihapus.");
    await loadGrades();
  }

  function getGradeStudentName(userId: number) {
    const user = users.find(user => user.id === userId);
    return user?.full_name || user?.username || "-";
  }

  function getGradeClassName(classId: number) {
    return classes.find(item => item.id === classId)?.name || "-";
  }


  function getGradeAverage(grade: StudentGrade) {
    if (grade.nilai_akhir !== null && grade.nilai_akhir !== undefined) {
      return Number(grade.nilai_akhir).toFixed(2);
    }

    const values = [
      grade.nilai_tugas,
      grade.nilai_ulangan_harian,
      grade.nilai_pts,
      grade.nilai_pas,
      grade.nilai_sikap_karakter,
      grade.nilai_ujian_sekolah
    ];

    const total = values.reduce((sum, value) => sum + Number(value ?? 0), 0);
    return (total / 6).toFixed(2);
  }

  /* =========================
     LOAD ENTRIES
  ========================= */

  async function loadEntries() {

    const {
      data,
      error
    } = await supabase
      .from("entries")
      .select("*")
      .order(
        "id",
        {
          ascending: false
        }
      );

    if (error) {

      showToast(
        "Gagal memuat transaksi: " +
          error.message,
        true
      );

      return;
    }

    entries =
      (data || []) as Entry[];

    calculateStats();
  }

  /* =========================
     CALCULATE MONEY
  ========================= */

  function calculateStats() {

    totalPemasukan =
      entries
        .filter(
          entry =>
            entry.kind ===
            "pemasukan"
        )
        .reduce(
          (
            total,
            entry
          ) =>
            total +
            Number(
              entry.amount
            ),
          0
        );

    totalPengeluaran =
      entries
        .filter(
          entry =>
            entry.kind ===
            "pengeluaran"
        )
        .reduce(
          (
            total,
            entry
          ) =>
            total +
            Number(
              entry.amount
            ),
          0
        );

    totalSaldo =
      totalPemasukan -
      totalPengeluaran;
  }

  /* =========================
     LOAD SPP
  ========================= */

  async function loadSPPData() {

    const {
      data,
      error
    } = await supabase
      .from("spp_payments")
      .select("*")
      .eq(
        "year",
        selectedYear
      );

    if (error) {

      showToast(
        "Gagal memuat SPP: " +
          error.message,
        true
      );

      return;
    }

    const map:
      Record<
        number,
        SPPRecord
      > = {};

    (
      (data || []) as
      SPPRecord[]
    ).forEach(
      item => {

        map[
          Number(
            item.user_id
          )
        ] = {
          ...item,
          user_id:
            Number(
              item.user_id
            )
        };

      }
    );

    sppData = map;
  }

  /* =========================
     TOGGLE SPP
  ========================= */

  async function toggleSPP(
    userId: number,

    monthKey: keyof Omit<
      SPPRecord,
      "id" |
      "user_id" |
      "year"
    >
  ) {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat mengubah SPP.",
        true
      );

      return;
    }

    const currentRecord =
      sppData[userId] || {

        user_id:
          userId,

        year:
          selectedYear,

        january:
          false,

        february:
          false,

        march:
          false,

        april:
          false,

        may:
          false,

        june:
          false,

        july:
          false,

        august:
          false,

        september:
          false,

        october:
          false,

        november:
          false,

        december:
          false
      };

    const nextValue =
      !currentRecord[
        monthKey
      ];

    const {
      error
    } = await supabase
      .from("spp_payments")
      .upsert(
        {
          ...currentRecord,

          user_id:
            userId,

          year:
            selectedYear,

          [monthKey]:
            nextValue
        },
        {
          onConflict:
            "user_id,year"
        }
      );

    if (error) {

      showToast(
        "Gagal mengubah SPP: " +
          error.message,
        true
      );

      return;
    }

    sppData = {

      ...sppData,

      [userId]: {

        ...currentRecord,

        [monthKey]:
          nextValue
      }
    };

    showToast(
      nextValue
        ? "✓ SPP berhasil ditandai lunas"
        : "Status SPP dibatalkan"
    );
  }

  /* =========================
     COUNT SPP
  ========================= */

  function getLunasCount(
    userId: number
  ) {

    const record =
      sppData[userId];

    if (!record) {
      return 0;
    }

    return months.filter(
      month =>
        record[
          month.key
        ]
    ).length;
  }

  /* =========================
     ADD TRANSACTION
  ========================= */

  async function addTransaction() {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat melakukan top up.",
        true
      );

      return;
    }

    if (
      !transactionName.trim() ||
      !transactionDate ||
      !transactionAmount ||
      !transactionUserId
    ) {

      showToast(
        "Semua data wajib diisi!",
        true
      );

      return;
    }

    const {
      error
    } = await supabase
      .from("entries")
      .insert([
        {
          name:
            transactionName.trim(),

          date:
            transactionDate,

          amount:
            Number(
              transactionAmount
            ),

          kind:
            "pemasukan",

          user_id:
            Number(
              transactionUserId
            )
        }
      ]);

    if (error) {

      showToast(
        "Gagal mengirim uang: " +
          error.message,
        true
      );

      return;
    }

    showToast(
      "✓ Uang berhasil terkirim!"
    );

    transactionName = "";
    transactionAmount = "";
    transactionUserId = "";

    await loadEntries();
  }

  /* =========================
     USER MODAL
  ========================= */

  function openAddUserModal() {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat menambah user.",
        true
      );

      return;
    }

    editingUserId = null;

    formUsername = "";

    formRole =
      "santri";

    showUserModal = true;
  }

  function openEditUserModal(
    user: User
  ) {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat mengedit user.",
        true
      );

      return;
    }

    editingUserId =
      user.id;

    formUsername =
      user.username;

    formRole =
      user.role;

    showUserModal = true;
  }

  /* =========================
     SAVE USER
  ========================= */

  async function saveUser() {

    if (!isAdmin) {
      return;
    }

    if (
      !formUsername.trim()
    ) {

      showToast(
        "Nama user wajib diisi!",
        true
      );

      return;
    }

    if (
      editingUserId !== null
    ) {

      const {
        error
      } = await supabase
        .from("users")
        .update({
          username:
            formUsername.trim(),

          role:
            formRole
        })
        .eq(
          "id",
          editingUserId
        );

      if (error) {

        showToast(
          "Gagal memperbarui user: " +
            error.message,
          true
        );

        return;
      }

      showToast(
        "✓ User berhasil diperbarui!"
      );

    } else {

      const {
        error
      } = await supabase
        .from("users")
        .insert([
          {
            username:
              formUsername.trim(),

            role:
              formRole
          }
        ]);

      if (error) {

        showToast(
          "Gagal menambah user: " +
            error.message,
          true
        );

        return;
      }

      showToast(
        "✓ User berhasil ditambahkan!"
      );
    }

    showUserModal = false;

    await loadUsers();
  }

  /* =========================
     DELETE USER
  ========================= */

  async function deleteUser(
    id: number,
    username: string
  ) {

    if (!isAdmin) {
      return;
    }

    const confirmed =
      confirm(
        `Hapus user "${username}"?`
      );

    if (!confirmed) {
      return;
    }

    const {
      error
    } = await supabase
      .from("users")
      .delete()
      .eq(
        "id",
        id
      );

    if (error) {

      showToast(
        "Gagal menghapus user: " +
          error.message,
        true
      );

      return;
    }

    showToast(
      "✓ User berhasil dihapus!"
    );

    await Promise.all([
      loadUsers(),
      loadSPPData(),
      loadAttendance(),
      loadSchedules()
    ]);
  }

  /* =========================
     LOAD ATTENDANCE
  ========================= */

  async function loadAttendance() {
    const {
      data,
      error
    } = await supabase
      .from("attendance")
      .select("*")
      .eq("date", attendanceDate)
      .order("id", { ascending: false });

    if (error) {
      showToast("Gagal memuat absensi: " + error.message, true);
      attendanceData = [];
      attendanceDrafts = {};
      return;
    }

    attendanceData = (data || []) as Attendance[];

    // Isi draft dari data database. Santri yang belum punya data
    // sengaja dibiarkan kosong agar wajib diinput sebelum disimpan.
    const drafts: Record<number, AttendanceStatus> = {};
    attendanceData.forEach(item => {
      drafts[Number(item.user_id)] = item.status;
    });
    attendanceDrafts = drafts;
  }

  async function changeAttendanceDate() {
    lastScannedStudent = null;
    qrScanMessage = "";
    await loadAttendance();
  }

  function getAttendance(userId: number) {
    return attendanceData.find(
      item => Number(item.user_id) === userId
    );
  }

  function getDraftAttendance(userId: number): AttendanceStatus {
    return attendanceDrafts[userId] ?? "";
  }

  function setDraftAttendance(userId: number, status: AttendanceStatus) {
    attendanceDrafts = {
      ...attendanceDrafts,
      [userId]: status
    };
  }

  $: attendanceDraftGroup = attendanceStudents.map(santri => ({
    student: santri,
    status: getDraftAttendance(santri.id)
  }));

  $: attendanceDraftSummary = {
    hadir: attendanceDraftGroup.filter(item => item.status === "hadir").length,
    izin: attendanceDraftGroup.filter(item => item.status === "izin").length,
    sakit: attendanceDraftGroup.filter(item => item.status === "sakit").length,
    alpha: attendanceDraftGroup.filter(item => item.status === "alpha").length,
    belum: attendanceDraftGroup.filter(item => !item.status).length
  };

  $: attendanceUnsavedCount = attendanceDraftGroup.filter(item => {
    const saved = getAttendance(item.student.id)?.status ?? "";
    return item.status !== saved;
  }).length;

  /* =========================
     SAVE SINGLE ATTENDANCE
  ========================= */

  async function saveAttendanceForStudent(
    userId: number,
    status: AttendanceStatus,
    showMessage = true
  ) {
    if (!canManageAttendance || !status) {
      if (showMessage) showToast("Pilih status absensi terlebih dahulu.", true);
      return false;
    }

    const existing = getAttendance(userId);

    const result = existing?.id
      ? await supabase.from("attendance").update({ status }).eq("id", existing.id)
      : await supabase.from("attendance").insert([{
          user_id: userId,
          date: attendanceDate,
          status
        }]);

    if (result.error) {
      if (showMessage) showToast("Gagal menyimpan absensi: " + result.error.message, true);
      return false;
    }

    attendanceDrafts = {
      ...attendanceDrafts,
      [userId]: status
    };

    await loadAttendance();

    if (showMessage) {
      const student = santriUsers.find(user => user.id === userId);
      showToast(`✓ ${student?.full_name || student?.username || "Absensi"} berhasil disimpan.`);
    }

    return true;
  }

  /* =========================
     SAVE ALL ATTENDANCE
  ========================= */

  async function saveAllAttendance() {
    if (!canManageAttendance) {
      showToast("Hanya admin atau ustad yang dapat mengisi absensi.", true);
      return;
    }

    if (!attendanceStudents.length) {
      showToast("Tidak ada santri pada kelompok yang dipilih.", true);
      return;
    }

    const pendingStudents = attendanceStudents.filter(santri => {
      const draft = getDraftAttendance(santri.id);
      const saved = getAttendance(santri.id)?.status ?? "";
      return !!draft && draft !== saved;
    });

    if (!pendingStudents.length) {
      showToast("Tidak ada absensi baru yang perlu disimpan.", true);
      return;
    }

    attendanceSaving = true;

    try {
      const operations = pendingStudents.map(async santri => {
        const status = getDraftAttendance(santri.id) as Attendance["status"];
        const existing = getAttendance(santri.id);

        if (existing?.id) {
          return supabase
            .from("attendance")
            .update({ status })
            .eq("id", existing.id);
        }

        return supabase
          .from("attendance")
          .insert([{
            user_id: santri.id,
            date: attendanceDate,
            status
          }]);
      });

      const results = await Promise.all(operations);
      const failed = results.find(result => result.error);

      if (failed?.error) {
        showToast("Gagal menyimpan semua absensi: " + failed.error.message, true);
        return;
      }

      showToast(`✓ ${pendingStudents.length} absensi berhasil disimpan.`);
      await loadAttendance();
    } finally {
      attendanceSaving = false;
    }
  }

  // Fungsi lama dipertahankan sebagai alias agar event/fitur lain
  // yang masih memanggil saveAttendance tidak error.
  async function saveAttendance() {
    await saveAllAttendance();
  }

  /* =========================
     LOAD SCHEDULE
  ========================= */

  async function loadSchedules() {

    const {
      data,
      error
    } = await supabase
      .from("schedules")
      .select("*")
      .order(
        "id",
        {
          ascending:
            true
        }
      );

    if (error) {

      showToast(
        "Gagal memuat jadwal: " +
          error.message,
        true
      );

      schedules = [];

      return;
    }

    schedules =
      (data || []) as
      Schedule[];
  }

  /* =========================
     ADD SCHEDULE
  ========================= */

  function openAddSchedule() {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat menambah jadwal.",
        true
      );

      return;
    }

    editingScheduleId = null;

    scheduleDay = "";
    scheduleSubject = "";
    scheduleSubject2 = "";
    scheduleTeacherId = "";
    scheduleTime = "";

    showScheduleModal = true;
  }

  /* =========================
     EDIT SCHEDULE
  ========================= */

  function openEditSchedule(
    schedule: Schedule
  ) {

    if (!isAdmin) {
      return;
    }

    editingScheduleId =
      schedule.id || null;

    scheduleDay =
      schedule.day;

    scheduleSubject =
      schedule.subject || "";

    scheduleSubject2 =
      schedule.subject2 || "";

    scheduleTeacherId =
      schedule.teacher_id
        ? String(
            schedule.teacher_id
          )
        : "";

    scheduleTime =
      schedule.time;

    showScheduleModal = true;
  }

  /* =========================
     SAVE SCHEDULE
  ========================= */

  async function saveSchedule() {

    if (!isAdmin) {
      return;
    }

    if (
      !scheduleDay ||
      !scheduleSubject ||
      !scheduleTeacherId ||
      !scheduleTime
    ) {

      showToast(
        "Semua data jadwal wajib diisi!",
        true
      );

      return;
    }

    const payload = {

      day:
        scheduleDay,

      subject:
        scheduleSubject.trim(),

      subject2:
        scheduleSubject2.trim() || null,

      teacher_id:
        Number(
          scheduleTeacherId
        ),

      time:
        scheduleTime
    };

    if (
      editingScheduleId !== null
    ) {

      const {
        error
      } = await supabase
        .from("schedules")
        .update(
          payload
        )
        .eq(
          "id",
          editingScheduleId
        );

      if (error) {

        showToast(
          "Gagal mengedit jadwal: " +
            error.message,
          true
        );

        return;
      }

      showToast(
        "✓ Jadwal berhasil diperbarui!"
      );

    } else {

      const {
        error
      } = await supabase
        .from("schedules")
        .insert([
          payload
        ]);

      if (error) {

        showToast(
          "Gagal menambah jadwal: " +
            error.message,
          true
        );

        return;
      }

      showToast(
        "✓ Jadwal berhasil ditambahkan!"
      );
    }

    showScheduleModal = false;

    await loadSchedules();
  }

  /* =========================
     DELETE SCHEDULE
  ========================= */

  async function deleteSchedule(
    id: number
  ) {

    if (!isAdmin) {
      return;
    }

    if (
      !confirm(
        "Hapus jadwal ini?"
      )
    ) {
      return;
    }

    const {
      error
    } = await supabase
      .from("schedules")
      .delete()
      .eq(
        "id",
        id
      );

    if (error) {

      showToast(
        "Gagal menghapus jadwal: " +
          error.message,
        true
      );

      return;
    }

    showToast(
      "✓ Jadwal berhasil dihapus!"
    );

    await loadSchedules();
  }

  /* =========================
     GET TEACHER
  ========================= */

  function getTeacherName(
    teacherId:
      | number
      | null
  ) {

    if (!teacherId) {
      return "-";
    }

    return (
      users.find(
        user =>
          user.id ===
          Number(
            teacherId
          )
      )?.username ||
      "Pengajar tidak ditemukan"
    );
  }

  /* =========================
     LOAD ANNOUNCEMENTS
  ========================= */

  async function loadAnnouncements() {

    const {
      data,
      error
    } = await supabase
      .from("announcements")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      );

    if (error) {

      showToast(
        "Gagal memuat pengumuman: " +
          error.message,
        true
      );

      announcements = [];

      return;
    }

    announcements =
      (data || []) as
      Announcement[];
  }

  /* =========================
     OPEN ADD ANNOUNCEMENT
  ========================= */

  function openAddAnnouncement() {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat membuat pengumuman.",
        true
      );

      return;
    }

    editingAnnouncementId = null;

    announcementTitle = "";

    announcementContent = "";

    showAnnouncementModal = true;
  }

  /* =========================
     EDIT ANNOUNCEMENT
  ========================= */

  function openEditAnnouncement(
    announcement: Announcement
  ) {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat mengedit pengumuman.",
        true
      );

      return;
    }

    editingAnnouncementId =
      announcement.id || null;

    announcementTitle =
      announcement.title;

    announcementContent =
      announcement.content;

    showAnnouncementModal = true;
  }

  /* =========================
     SAVE ANNOUNCEMENT
  ========================= */

  async function saveAnnouncement() {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat menyimpan pengumuman.",
        true
      );

      return;
    }

    if (
      !announcementTitle.trim() ||
      !announcementContent.trim()
    ) {

      showToast(
        "Judul dan isi pengumuman wajib diisi!",
        true
      );

      return;
    }

    if (
      editingAnnouncementId !== null
    ) {

      const {
        error
      } = await supabase
        .from("announcements")
        .update({
          title:
            announcementTitle.trim(),

          content:
            announcementContent.trim()
        })
        .eq(
          "id",
          editingAnnouncementId
        );

      if (error) {

        showToast(
          "Gagal mengubah pengumuman: " +
            error.message,
          true
        );

        return;
      }

      showToast(
        "✓ Pengumuman berhasil diperbarui!"
      );

    } else {

      const {
        error
      } = await supabase
        .from("announcements")
        .insert([
          {
            title:
              announcementTitle.trim(),

            content:
              announcementContent.trim(),

            created_by:
              currentUser?.id || null
          }
        ]);

      if (error) {

        showToast(
          "Gagal membuat pengumuman: " +
            error.message,
          true
        );

        return;
      }

      showToast(
        "✓ Pengumuman berhasil dibuat!"
      );
    }

    showAnnouncementModal = false;

    announcementTitle = "";

    announcementContent = "";

    await loadAnnouncements();
  }

  /* =========================
     DELETE ANNOUNCEMENT
  ========================= */

  async function deleteAnnouncement(
    id: number
  ) {

    if (!isAdmin) {
      return;
    }

    if (
      !confirm(
        "Hapus pengumuman ini?"
      )
    ) {
      return;
    }

    const {
      error
    } = await supabase
      .from("announcements")
      .delete()
      .eq(
        "id",
        id
      );

    if (error) {

      showToast(
        "Gagal menghapus pengumuman: " +
          error.message,
        true
      );

      return;
    }

    showToast(
      "✓ Pengumuman berhasil dihapus!"
    );

    await loadAnnouncements();
  }


  /* =========================
     TOAST
  ========================= */

  function showToast(
    msg: string,
    error = false
  ) {

    message = msg;

    isError = error;

    clearTimeout(
      toastTimer
    );

    toastTimer =
      setTimeout(
        () => {

          message = "";

        },
        3500
      );
  }

  /* =========================
     FORMAT RUPIAH
  ========================= */

  function formatRupiah(
    value: number
  ) {

    return new Intl.NumberFormat(
      "id-ID"
    ).format(
      Number(value)
    );
  }

  /* =========================
     FORMAT DATE
  ========================= */

  function formatDate(
    value?: string
  ) {

    if (!value) {
      return "-";
    }

    return new Date(
      value
    ).toLocaleDateString(
      "id-ID",
      {
        day:
          "numeric",

        month:
          "long",

        year:
          "numeric"
      }
    );
  }

  /* =========================
     STATUS LABEL
  ========================= */

  function attendanceLabel(
    status: string
  ) {

    const labels:
      Record<
        string,
        string
      > = {

        hadir:
          "Hadir",

        izin:
          "Izin",

        sakit:
          "Sakit",

        alpha:
          "Alpha"

      };

    return (
      labels[status] ||
      status
    );
  }

  /* =========================
     LOGOUT
  ========================= */

  function logout() {

    localStorage.removeItem(
      "user"
    );

    goto(
      "/login"
    );
  }

  /* =========================
     NAVIGATION
  ========================= */

  async function changeView(
    view: ActiveView
  ) {
    // Kamera hanya aktif pada halaman Scan Absensi.
    if (activeView === "attendanceScan" && view !== "attendanceScan") {
      await stopQRScanner();
    }

    activeView = view;
    sidebarOpen = false;

    if (view === "attendance" || view === "attendanceScan") {
      lastScannedStudent = null;
      lastScannedPayload = "";
      qrScanMessage = "";
      await loadAttendance();
    }

    if (view === "barcode") {
      await generateAllQRCodes();
    }

    if (view === "grades") {
      await refreshGradeData();
    }
  }

  onDestroy(() => {
    void stopQRScanner();
  });
</script>


<!-- =========================
     APP
========================= -->

<div class="app-layout">

  <!-- =========================
       SIDEBAR
  ========================= -->

  <aside
    class:open={sidebarOpen}
    class="sidebar"
  >

    <div class="brand">

      <div class="brand-logo">
        💳
      </div>

      <div>

        <h2>
          Pengajar
        </h2>

        <p>
          Daarulhikam 
        </p>

      </div>

    </div>


    <nav class="nav-menu">

      <button
        class:active={
          activeView === "home"
        }
        class="nav-item"
        on:click={() =>
          changeView("home")}
      >
        🏠
        Beranda
      </button>
<button
        class:active={
          activeView === "attendance"
        }
        class="nav-item"
        on:click={() =>
          changeView("attendance")}
      >
        📅
        Absensi Manual
      </button>

      {#if canManageAttendance}
        <button
          class:active={activeView === "attendanceScan"}
          class="nav-item scan-nav-item"
          on:click={() => changeView("attendanceScan")}
        >
          📷
          Scan Absensi
        </button>
      {/if}


      <button
        class:active={
          activeView === "schedule"
        }
        class="nav-item"
        on:click={() =>
          changeView("schedule")}
      >
        🗓️
        Jadwal
      </button>

      <button
        class:active={activeView === "grades"}
        class="nav-item"
        on:click={() => changeView("grades")}
      >
        📊
        Rekap Nilai
      </button>


      <button
        class:active={
          activeView === "announcement"
        }
        class="nav-item"
        on:click={() =>
          changeView("announcement")}
      >
        📢
        Pengumuman
      </button>


      {#if isAdmin}

        <button
          class:active={
            activeView === "users"
          }
          class="nav-item"
          on:click={() =>
            changeView("users")}
        >
          👥
          Kelola User
        </button>

      {/if}


      <button
        class:active={
          activeView === "barcode"
        }
        class="nav-item"
        on:click={() =>
          changeView("barcode")}
      >
        🆔
        Barcode Santri
      </button>


      {#if isAdmin}

        <button
          class:active={
            activeView === "topup"
          }
          class="nav-item"
          on:click={() =>
            changeView("topup")}
        >
          ➕
          Top Up Saldo
        </button>

      {/if}

    </nav>


    <button
      class="logout-btn-side"
      on:click={logout}
    >
      🚪
      Keluar Aplikasi
    </button>

  </aside>


  {#if sidebarOpen}

    <div
      class="sidebar-overlay"
      on:click={() =>
        sidebarOpen = false}
    ></div>

  {/if}


  <!-- =========================
       MAIN
  ========================= -->

  <main class="main-content">


    <!-- =========================
         HEADER
    ========================= -->

    <div class="bca-header-bg">

      <div class="top-nav-bar">


        <button
          class="hamburger"
          on:click={() =>
            sidebarOpen =
              !sidebarOpen}
        >
          ☰
        </button>


        <div class="welcome-box">

          <div class="avatar-circle">

            {
              currentUser?.username
                ?.charAt(0)
                .toUpperCase()
              || "U"
            }

          </div>


          <div class="welcome-text">

            <span>
              Selamat Datang,
            </span>

            <strong>
              {
                currentUser?.username ||
                "User"
              }
            </strong>

          </div>

        </div>


        <button
          class="logout-btn-header"
          on:click={logout}
        >
          🚪
          <span>
            Keluar
          </span>
        </button>

      </div>

    </div>


    <!-- =========================
         TOAST
    ========================= -->

    {#if message}

      <div
        class:error={isError}
        class:success={!isError}
        class="toast"
      >
        {message}
      </div>

    {/if}


    <div class="dashboard-body">


      <!-- =========================
           HOME
      ========================= -->

      {#if activeView === "home"}

        <div class="portal-grid teacher-dashboard-grid">

          <div class="bca-card saldo-card teacher-card">
            <div class="card-top-row">
              <span class="card-label">Ustad / Ustadzah</span>
              <span class="badge-brand">Pengajar</span>
            </div>

            <div class="teacher-profile-card">
              <div class="teacher-avatar">
                {currentUser?.username?.charAt(0).toUpperCase() || "U"}
              </div>

              <div class="teacher-info">
                <strong>{currentUser?.username || "Pengajar"}</strong>
                <span>Pengajar yang bertugas</span>
              </div>
            </div>

            <div class="card-footer-info">
              <span>Kelola absensi santri dengan mudah</span>
            </div>
          </div>

        </div>

        <div class="portal-grid-secondary">
          <div class="bca-card services-card">
            <h3 class="box-title">Layanan Utama</h3>

            <div class="services-grid">
              <button class="service-item" on:click={() => changeView("attendance")}>
                <div class="s-icon red">📅</div>
                <span>Absensi Manual</span>
              </button>

              {#if canManageAttendance}
                <button class="service-item" on:click={() => changeView("attendanceScan")}>
                  <div class="s-icon blue">📷</div>
                  <span>Scan Absensi</span>
                </button>
              {/if}

              <button class="service-item" on:click={() => changeView("schedule")}>
                <div class="s-icon purple">🗓️</div>
                <span>Jadwal</span>
              </button>

              <button class="service-item" on:click={() => changeView("announcement")}>
                <div class="s-icon orange">📢</div>
                <span>Pengumuman</span>
              </button>

              {#if isAdmin}
                <button class="service-item" on:click={() => changeView("users")}>
                  <div class="s-icon cyan">👥</div>
                  <span>Kelola User</span>
                </button>

                <button class="service-item" on:click={() => changeView("topup")}>
                  <div class="s-icon green">➕</div>
                  <span>Top Up</span>
                </button>
              {/if}

              <button class="service-item" on:click={() => changeView("barcode")}>
                <div class="s-icon blue">🆔</div>
                <span>Barcode Santri</span>
              </button>
            </div>
          </div>
        </div>

{:else if activeView === "attendance"}

        <div
          class="bca-card sub-view-container"
        >

          <div
            class="sub-header-row"
          >

            <div>

              <h3>
                📅 Absensi Santri
              </h3>

              <p
                class="sub-description"
              >
                Pilih jenjang dan kelas untuk melihat
                absensi santri yang sesuai saja.
              </p>

            </div>


            <button
              class="btn-back"
              on:click={() =>
                changeView("home")}
            >
              ← Kembali
            </button>

          </div>


          <div
            class="attendance-date-box"
          >

            <label>
              Pilih Tanggal
            </label>


            <input
              type="date"
              bind:value={
                attendanceDate
              }
              on:change={
                changeAttendanceDate
              }
            />

          </div>





          <div class="attendance-group-tabs">
            <button
              class:active={selectedAttendanceGroup === "SD"}
              class="attendance-group-tab"
              on:click={() => { selectedAttendanceGroup = "SD"; selectedAttendanceClass = "1"; selectedAttendanceUser = ""; }}
            >
              <span>SD</span>
              <small>{attendanceGroupCounts.SD} santri</small>
            </button>

            <button
              class:active={selectedAttendanceGroup === "SMP"}
              class="attendance-group-tab"
              on:click={() => { selectedAttendanceGroup = "SMP"; selectedAttendanceClass = "1"; selectedAttendanceUser = ""; }}
            >
              <span>SMP</span>
              <small>{attendanceGroupCounts.SMP} santri</small>
            </button>

            <button
              class:active={selectedAttendanceGroup === "SMA"}
              class="attendance-group-tab"
              on:click={() => { selectedAttendanceGroup = "SMA"; selectedAttendanceClass = "1"; selectedAttendanceUser = ""; }}
            >
              <span>SMA</span>
              <small>{attendanceGroupCounts.SMA} santri</small>
            </button>
          </div>

          {#if selectedAttendanceGroup === "SMP"}
            <div class="attendance-class-tabs">
              {#each attendanceClassCounts.SMP as item}
                <button
                  type="button"
                  class:active={selectedAttendanceClass === item.kelas}
                  class="attendance-class-tab"
                  on:click={() => { selectedAttendanceClass = item.kelas; selectedAttendanceUser = ""; }}
                >
                  <span>Kelas {item.kelas}</span>
                  <small>{item.count} santri</small>
                </button>
              {/each}
            </div>
          {/if}


          <div class="attendance-group-title">
            <div>
              <strong>Absensi {selectedAttendanceGroup}{selectedAttendanceGroup === "SMP" ? ` • Kelas ${selectedAttendanceClass}` : ""}</strong>
              <span>
                {#if selectedAttendanceGroup === "SMP"}
                  Absensi santri SMP kelas {selectedAttendanceClass} pada {attendanceDate}
                {:else}
                  Absensi seluruh santri {selectedAttendanceGroup} pada {attendanceDate}
                {/if}
              </span>
            </div>
            <span class="attendance-student-count">{attendanceStudents.length} santri</span>
          </div>


          {#if canManageAttendance}

            <div class="attendance-input-header">
              <div>
                <strong>Input Absensi Per Santri</strong>
                <span>Pilih status setiap santri terlebih dahulu. Data belum disimpan sampai tombol simpan ditekan.</span>
              </div>

              <div class="attendance-draft-info">
                <strong>{attendanceDraftSummary.belum}</strong>
                <span>belum diisi</span>
              </div>
            </div>

            <div class="attendance-bulk-actions">
              {#if attendanceUnsavedCount > 0}
                <span class="attendance-unsaved">
                  {attendanceUnsavedCount} perubahan belum disimpan
                </span>
              {:else}
                <span class="attendance-saved">
                  ✓ Tidak ada perubahan yang belum disimpan
                </span>
              {/if}
            </div>

            <div class="attendance-form attendance-form-single">
              <select bind:value={selectedAttendanceUser}>
                <option value="">-- Pilih Santri untuk input cepat --</option>
                {#each attendanceStudents as santri}
                  <option value={santri.id}>
                    {santri.full_name || santri.username}
                  </option>
                {/each}
              </select>

              <select
                value={selectedAttendanceUser ? getDraftAttendance(Number(selectedAttendanceUser)) : ""}
                on:change={(event) => {
                  if (selectedAttendanceUser) {
                    setDraftAttendance(
                      Number(selectedAttendanceUser),
                      (event.currentTarget as HTMLSelectElement).value as AttendanceStatus
                    );
                  }
                }}
                disabled={!selectedAttendanceUser}
              >
                <option value="">-- Status --</option>
                <option value="hadir">Hadir</option>
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
                <option value="alpha">Alpha</option>
              </select>

              <span class="attendance-quick-note">
                Input cepat ini mengubah draft saja.
              </span>
            </div>

          {/if}

          <div class="attendance-summary">
            <div class="attendance-summary-item">
              <strong>{attendanceDraftSummary.hadir}</strong>
              <span>Hadir</span>
            </div>
            <div class="attendance-summary-item">
              <strong>{attendanceDraftSummary.izin}</strong>
              <span>Izin</span>
            </div>
            <div class="attendance-summary-item">
              <strong>{attendanceDraftSummary.sakit}</strong>
              <span>Sakit</span>
            </div>
            <div class="attendance-summary-item">
              <strong>{attendanceDraftSummary.alpha}</strong>
              <span>Alpha</span>
            </div>
            <div class="attendance-summary-item">
              <strong>{attendanceDraftSummary.belum}</strong>
              <span>Belum Diisi</span>
            </div>
          </div>

          <div
            class="table-responsive"
          >

            <table
              class="data-table"
            >

              <thead>

                <tr>

                  <th>
                    Nama Santri
                  </th>

                  <th>
                    Input Status
                  </th>

                  <th>
                    Status Tersimpan
                  </th>

                  <th>
                    Tanggal
                  </th>

                </tr>

              </thead>


              <tbody>

                {#each attendanceStudents as santri}

                  {@const attendance =
                    getAttendance(
                      santri.id
                    )}


                  <tr>

                    <td>

                      <div
                        class="user-cell"
                      >

                        <span
                          class="user-avatar"
                        >

                          {
                            santri.username
                              .charAt(0)
                              .toUpperCase()
                          }

                        </span>


                        <strong>
                          {santri.username}
                        </strong>

                      </div>

                    </td>


                    <td>
                      <select
                        class="attendance-row-select"
                        value={getDraftAttendance(santri.id)}
                        on:change={async (event) => {
                          const status = (event.currentTarget as HTMLSelectElement).value as AttendanceStatus;
                          setDraftAttendance(santri.id, status);
                          if (status) {
                            await saveAttendanceForStudent(santri.id, status);
                          }
                        }}
                        disabled={attendanceSaving}
                      >
                        <option value="">-- Pilih --</option>
                        <option value="hadir">Hadir</option>
                        <option value="izin">Izin</option>
                        <option value="sakit">Sakit</option>
                        <option value="alpha">Alpha</option>
                      </select>
                    </td>

                    <td>
                      {#if attendance}
                        <span class="attendance-badge {attendance.status}">
                          {attendanceLabel(attendance.status)}
                        </span>
                      {:else}
                        <span class="attendance-badge belum">
                          Belum disimpan
                        </span>
                      {/if}
                    </td>


                    <td>
                      {attendanceDate}
                    </td>
                  </tr>

                {/each}

              </tbody>

            </table>

          </div>

        </div>


      <!-- =========================
           SCAN ABSEN
      ========================= -->

      {:else if activeView === "attendanceScan"}

        <div class="bca-card sub-view-container scan-attendance-page">

          <div class="sub-header-row">
            <div>
              <span class="section-kicker">ABSENSI DIGITAL</span>
              <h3>📷 Scan QR / Barcode Absensi</h3>
              <p class="sub-description">
                Halaman ini khusus untuk scan QR/barcode santri. Form absensi manual tetap berada di halaman Absensi Manual.
              </p>
            </div>

            <button class="btn-back" type="button" on:click={() => changeView("attendance")}>
              ← Absensi Manual
            </button>
          </div>

          {#if !canManageAttendance}
            <div class="qr-attendance-box scanner-access-denied">
              <div class="scanner-placeholder-icon">🔒</div>
              <strong>Akses scan absensi tidak tersedia</strong>
              <span>Hanya admin atau ustad yang dapat menggunakan scanner absensi.</span>
            </div>
          {:else}
            <div class="scan-attendance-grid">
              <div class="scan-date-card">
                <label for="scan-attendance-date">Tanggal Absensi</label>
                <input
                  id="scan-attendance-date"
                  type="date"
                  bind:value={attendanceDate}
                  on:change={changeAttendanceDate}
                />
                <small>Hasil scan akan dicatat sebagai <strong>Hadir</strong> pada tanggal ini.</small>
              </div>

              <div class="scan-status-card">
                <span>Status Scanner</span>
                {#if qrScannerRunning}
                  <strong class="scan-status-live">● Kamera aktif</strong>
                {:else}
                  <strong>○ Kamera belum aktif</strong>
                {/if}
              </div>
            </div>

            <div class="qr-attendance-box scanner-box">
              <div class="qr-attendance-header">
                <div>
                  <span class="section-kicker">SCANNER</span>
                  <h3>📱 Arahkan kamera ke QR / Barcode Santri</h3>
                  <p>Setelah kode terbaca, sistem otomatis menyimpan status Hadir.</p>
                </div>

                {#if qrScannerRunning}
                  <button class="btn-danger" type="button" on:click={stopQRScanner}>
                    ⏹ Stop Kamera
                  </button>
                {:else}
                  <button
                    class="btn-primary"
                    type="button"
                    on:click={startQRScanner}
                    disabled={qrScannerStarting}
                  >
                    {qrScannerStarting ? "⏳ Membuka Kamera..." : "📷 Mulai Scan"}
                  </button>
                {/if}
              </div>

              <div id="qr-reader" class:qr-reader-active={qrScannerRunning}></div>

              {#if !qrScannerRunning}
                <div class="scanner-placeholder">
                  <div class="scanner-placeholder-icon">📱</div>
                  <strong>Kamera belum aktif</strong>
                  <span>Tekan “Mulai Scan” lalu arahkan kamera ke kode santri.</span>
                </div>
              {/if}

              {#if qrScanMessage}
                <div class:success={!!lastScannedStudent} class:error={!!cameraError} class="qr-scan-message">
                  {qrScanMessage}
                </div>
              {/if}

              {#if cameraError}
                <div class="camera-help-box">
                  <strong>Jika kamera belum bisa dibuka:</strong>
                  <span>Pastikan izin kamera untuk situs ini diaktifkan dan halaman dibuka melalui HTTPS atau localhost.</span>
                </div>
              {/if}

              {#if lastScannedStudent}
                <div class="qr-student-result">
                  <div class="user-avatar">{(lastScannedStudent.full_name || lastScannedStudent.username).charAt(0).toUpperCase()}</div>
                  <div>
                    <strong>{lastScannedStudent.full_name || lastScannedStudent.username}</strong>
                    <span>ID-{lastScannedStudent.id} • Hadir • {attendanceDate}</span>
                  </div>
                </div>
              {/if}
            </div>

            <div class="scan-help-grid">
              <div>
                <strong>1. Pilih tanggal</strong>
                <span>Tanggal menjadi tanggal absensi hasil scan.</span>
              </div>
              <div>
                <strong>2. Mulai kamera</strong>
                <span>Izinkan akses kamera pada browser.</span>
              </div>
              <div>
                <strong>3. Scan kode</strong>
                <span>QR/barcode santri langsung dicatat sebagai Hadir.</span>
              </div>
            </div>
          {/if}

        </div>


      <!-- =========================
           SCHEDULE
      ========================= -->

      {:else if activeView === "schedule"}

        <div class="bca-card sub-view-container">

          <div class="sub-header-row">
            <div>
              <h3>🗓️ Jadwal & Pengajar</h3>
              <p class="sub-description">
                Jadwal ditampilkan dan dikelompokkan berdasarkan hari.
              </p>
            </div>

            <div class="action-group-top">
              {#if isAdmin}
                <button class="btn-primary" on:click={openAddSchedule}>
                  ➕ Tambah Jadwal
                </button>
              {/if}

              <button class="btn-back" on:click={() => changeView("home")}>
                ← Kembali
              </button>
            </div>
          </div>

          {#if schedules.length === 0}
            <div class="empty-schedule">
              📭 Belum ada jadwal.
            </div>
          {:else}
            <div class="schedule-day-list">

              {#each schedulesByDay as group}
                {#if group.schedules.length > 0}

                  <section class="schedule-day-group">
                    <div class="schedule-day-header">
                      <h4>📅 {group.day}</h4>
                      <span>{group.schedules.length} Jadwal</span>
                    </div>

                    <div class="schedule-card-list">
                      {#each group.schedules as schedule}

                        <article class="schedule-item-card">
                          <div class="schedule-time">
                            🕒
                            <strong>{schedule.time}</strong>
                          </div>

                          <div class="schedule-main-info">
                            <strong class="schedule-subject">
                              {schedule.subject}
                              {#if schedule.subject2}
                                <span class="subject-separator"> + </span>
                                {schedule.subject2}
                              {/if}
                            </strong>

                            <span class="schedule-teacher">
                              👨‍🏫 {getTeacherName(schedule.teacher_id)}
                            </span>
                          </div>

                          {#if isAdmin}
                            <div class="schedule-actions">
                              <button
                                class="btn-icon"
                                title="Edit jadwal"
                                on:click={() => openEditSchedule(schedule)}
                              >
                                ✏️
                              </button>

                              {#if schedule.id}
                                <button
                                  class="btn-icon danger"
                                  title="Hapus jadwal"
                                  on:click={() => deleteSchedule(schedule.id)}
                                >
                                  🗑️
                                </button>
                              {/if}
                            </div>
                          {/if}
                        </article>

                      {/each}
                    </div>
                  </section>

                {/if}
              {/each}

            </div>
          {/if}

        </div>


      <!-- =========================
           REKAP NILAI
      ========================= -->

      {:else if activeView === "grades"}

        <div class="bca-card sub-view-container">
          <div class="sub-header-row">
            <div>
              <h3>📊 Rekap Nilai Santri</h3>
              <p class="sub-description">
                {#if currentUser?.role === "santri"}
                  Berikut rekap nilai Anda.
                {:else}
                  Kelola nilai santri berdasarkan kelas, mata pelajaran, dan semester.
                {/if}
              </p>
            </div>

            <div class="action-group-top">
              {#if currentUser?.role === "admin" || currentUser?.role === "ustad"}
                <button class="btn-secondary" on:click={openStudentClassModal}>👨‍🎓 Atur Kelas Santri</button>
                <button class="btn-primary" on:click={openAddGrade}>➕ Input Nilai</button>
              {/if}
              <button class="btn-secondary" on:click={refreshGradeData} disabled={gradesLoading}>🔄 Muat Ulang</button>
              <button class="btn-back" on:click={() => changeView("home")}>← Kembali</button>
            </div>
          </div>

          {#if currentUser?.role !== "santri"}
            <div class="grade-filter">
              <div class="form-group-modal">
                <label>Kelas</label>
                <select bind:value={gradeFilterClass} on:change={() => gradeFilterStudent = ""}>
                  <option value="">Semua Kelas</option>
                  {#each classes as classRoom}
                    <option value={classRoom.id}>{classRoom.name}</option>
                  {/each}
                </select>
              </div>

              <div class="form-group-modal">
                <label>Santri</label>
                <select bind:value={gradeFilterStudent}>
                  <option value="">Semua Santri</option>
                  {#each filteredGradeStudents as student}
                    <option value={student.id}>{student.username}</option>
                  {/each}
                </select>
              </div>

              <div class="form-group-modal">
                <label>Tahun Ajaran</label>
                <input type="text" bind:value={gradeFilterAcademicYear} placeholder="2026/2027" />
              </div>

              <div class="form-group-modal">
                <label>Semester</label>
                <select bind:value={gradeFilterSemester}>
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </select>
              </div>
            </div>
          {/if}

          {#if gradeLoadError}
            <div class="error-message">⚠️ Gagal terhubung ke data nilai: {gradeLoadError}</div>
          {/if}

          <div class="table-responsive">
            <table class="data-table grade-table">
              <thead>
                <tr>
                  {#if currentUser?.role !== "santri"}<th>Santri</th>{/if}
                  <th>Kelas</th>
                  <th>Mata Pelajaran</th>
                  <th>Tugas</th>
                  <th>UH</th>
                  <th>PTS</th>
                  <th>PAS</th>
                  <th>Sikap</th>
                  <th>Ujian Sekolah</th>
                  <th>Nilai Akhir</th>
                  {#if currentUser?.role === "admin" || currentUser?.role === "ustad"}<th>Aksi</th>{/if}
                </tr>
              </thead>
              <tbody>
                {#if gradesLoading}
                  <tr>
                    <td colspan={currentUser?.role === "santri" ? 9 : 11} class="empty-cell">⏳ Memuat data nilai...</td>
                  </tr>
                {:else if filteredGrades.length === 0}
                  <tr>
                    <td colspan={currentUser?.role === "santri" ? 9 : 11} class="empty-cell">📭 Belum ada data nilai.</td>
                  </tr>
                {:else}
                  {#each filteredGrades as grade}
                    <tr>
                      {#if currentUser?.role !== "santri"}<td>{getGradeStudentName(grade.user_id)}</td>{/if}
                      <td>{getGradeClassName(grade.class_id)}</td>
                      <td>{grade.subject || "-"}</td>
                      <td>{grade.nilai_tugas ?? "-"}</td>
                      <td>{grade.nilai_ulangan_harian ?? "-"}</td>
                      <td>{grade.nilai_pts ?? "-"}</td>
                      <td>{grade.nilai_pas ?? "-"}</td>
                      <td>{grade.nilai_sikap_karakter ?? "-"}</td>
                      <td>{grade.nilai_ujian_sekolah ?? "-"}</td>
                      <td><strong>{getGradeAverage(grade)}</strong></td>
                      {#if currentUser?.role === "admin" || currentUser?.role === "ustad"}
                        <td>
                          <div class="action-buttons">
                            <button class="btn-icon" on:click={() => openEditGrade(grade)} title="Edit nilai">✏️</button>
                            {#if grade.id}
                              <button class="btn-icon danger" on:click={() => deleteGrade(grade.id!)} title="Hapus nilai">🗑️</button>
                            {/if}
                          </div>
                        </td>
                      {/if}
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </div>

      <!-- =========================
           ANNOUNCEMENT
      ========================= -->

      {:else if activeView === "announcement"}

        <div
          class="bca-card sub-view-container"
        >

          <div
            class="sub-header-row"
          >

            <div>

              <h3>
                📢 Pengumuman
              </h3>

              <p
                class="sub-description"
              >
                Informasi terbaru dari
                administrasi pesantren.
              </p>

            </div>


            <div
              class="action-group-top"
            >

              {#if isAdmin}

                <button
                  class="btn-primary"
                  on:click={
                    openAddAnnouncement
                  }
                >
                  ➕ Buat Pengumuman
                </button>

              {/if}


              <button
                class="btn-back"
                on:click={() =>
                  changeView("home")}
              >
                ← Kembali
              </button>

            </div>

          </div>


          {#if announcements.length === 0}

            <div
              class="empty-announcement"
            >

              <div>
                📭
              </div>

              <p>
                Belum ada pengumuman.
              </p>

            </div>

          {:else}

            <div
              class="announcement-list"
            >

              {#each announcements as announcement}

                <div
                  class="announcement-card"
                >

                  <div
                    class="announcement-header"
                  >

                    <div>

                      <h4>
                        📢
                        {announcement.title}
                      </h4>


                      <small>
                        {
                          formatDate(
                            announcement.created_at
                          )
                        }
                      </small>

                    </div>


                    {#if isAdmin}

                      <div
                        class="action-buttons"
                      >

                        <button
                          class="btn-icon"
                          title="Edit"
                          on:click={() =>
                            openEditAnnouncement(
                              announcement
                            )}
                        >
                          ✏️
                        </button>


                        {#if announcement.id}

                          <button
                            class="btn-icon danger"
                            title="Hapus"
                            on:click={() =>
                              deleteAnnouncement(
                                announcement.id
                              )}
                          >
                            🗑️
                          </button>

                        {/if}

                      </div>

                    {/if}

                  </div>


                  <div
                    class="announcement-content"
                  >

                    {announcement.content}

                  </div>

                </div>

              {/each}

            </div>

          {/if}

        </div>


      <!-- =========================
           BARCODE
      ========================= -->

      {:else if activeView === "barcode"}

        <div
          class="bca-card sub-view-container"
        >

          <div
            class="sub-header-row"
          >

            <div>

              <h3>
                🔳 QR Code Santri
              </h3>

              <p
                class="sub-description"
              >
                Setiap santri memiliki QR Code unik. Saat dipindai pada halaman absensi, data santri otomatis dicatat hadir.
              </p>

            </div>


            <button
              class="btn-back"
              on:click={() =>
                changeView("home")}
            >
              ← Kembali
            </button>

          </div>


          <div
            class="barcode-grid"
          >

            {#if santriUsers.length === 0}

              <p
                class="empty-cell"
              >
                Belum ada santri.
              </p>

            {:else}

              {#each santriUsers as santri}

                <div
                  class="barcode-card"
                >

                  <div
                    class="barcode-user"
                  >

                    <div
                      class="user-avatar"
                    >

                      {
                        santri.username
                          .charAt(0)
                          .toUpperCase()
                      }

                    </div>


                    <strong>
                      {santri.username}
                    </strong>

                  </div>


                  <div class="qr-code-box">
                    {#if qrCodes[santri.id]}
                      <img
                        src={qrCodes[santri.id]}
                        alt="QR Code {santri.full_name || santri.username}"
                        class="qr-code-image"
                      />
                    {:else}
                      <div class="qr-loading">Membuat QR...</div>
                    {/if}
                  </div>

                  <div class="barcode-number">
                    ID-{santri.id}
                  </div>

                  <div class="qr-payload">SANTRI:{santri.id}</div>

                </div>

              {/each}

            {/if}

          </div>

        </div>


      <!-- =========================
           TOP UP
      ========================= -->

      {:else if activeView === "topup"}

        <div
          class="bca-card sub-view-container"
        >

          <div
            class="sub-header-row"
          >

            <div>

              <h3>
                ➕ Top Up Saldo Santri
              </h3>

              <p
                class="sub-description"
              >
                Kirim saldo ke akun
                santri.
              </p>

            </div>


            <button
              class="btn-back"
              on:click={() =>
                changeView("home")}
            >
              ← Kembali
            </button>

          </div>


          <form
            class="quick-form"
            on:submit|preventDefault={
              addTransaction
            }
          >

            <div
              class="form-group"
            >

              <label>
                Pilih Santri
              </label>

              <select
                bind:value={
                  transactionUserId
                }
              >

                <option value="">
                  -- Pilih Santri --
                </option>


                {#each santriUsers as santri}

                  <option
                    value={santri.id}
                  >
                    {santri.username}
                  </option>

                {/each}

              </select>

            </div>


            <div
              class="form-group"
            >

              <label>
                Keterangan
              </label>

              <input
                type="text"
                placeholder="Contoh: Uang jajan"
                bind:value={
                  transactionName
                }
              />

            </div>


            <div
              class="form-group"
            >

              <label>
                Tanggal
              </label>

              <input
                type="date"
                bind:value={
                  transactionDate
                }
              />

            </div>


            <div
              class="form-group"
            >

              <label>
                Jumlah Top Up
              </label>

              <input
                type="number"
                placeholder="Contoh: 50000"
                min="1"
                bind:value={
                  transactionAmount
                }
              />

            </div>


            <button
              type="submit"
              class="btn-primary big-button"
            >
              💸 Kirim Uang
            </button>

          </form>

        </div>

      {/if}

    </div>

  </main>

</div>


<!-- =========================
     USER MODAL
========================= -->

{#if showUserModal}

  <div
    class="modal-backdrop"
    on:click={() =>
      showUserModal = false}
  >

    <div
      class="modal-card"
      on:click|stopPropagation
    >

      <div
        class="modal-header"
      >

        <h3>

          {
            editingUserId !== null
              ? "Edit User"
              : "Tambah User"
          }

        </h3>


        <button
          class="btn-close-modal"
          on:click={() =>
            showUserModal =
              false}
        >
          ✕
        </button>

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Nama
        </label>

        <input
          type="text"
          placeholder="Masukkan nama..."
          bind:value={
            formUsername
          }
        />

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Role
        </label>

        <select
          bind:value={
            formRole
          }
        >

          <option value="santri">
            Santri
          </option>

          <option value="ustad">
            Ustad / Ustadzah
          </option>

          <option value="admin">
            Admin
          </option>

        </select>

      </div>


      <div
        class="modal-footer"
      >

        <button
          class="btn-secondary"
          on:click={() =>
            showUserModal =
              false}
        >
          Batal
        </button>


        <button
          class="btn-primary"
          on:click={
            saveUser
          }
        >
          Simpan
        </button>

      </div>

    </div>

  </div>

{/if}


<!-- =========================
     SCHEDULE MODAL
========================= -->

{#if showScheduleModal}

  <div
    class="modal-backdrop"
    on:click={() =>
      showScheduleModal =
        false}
  >

    <div
      class="modal-card"
      on:click|stopPropagation
    >

      <div
        class="modal-header"
      >

        <h3>

          {
            editingScheduleId !== null
              ? "Edit Jadwal"
              : "Tambah Jadwal"
          }

        </h3>


        <button
          class="btn-close-modal"
          on:click={() =>
            showScheduleModal =
              false}
        >
          ✕
        </button>

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Hari
        </label>

        <select
          bind:value={
            scheduleDay
          }
        >

          <option value="">
            Pilih Hari
          </option>

          <option value="Senin">
            Senin
          </option>

          <option value="Selasa">
            Selasa
          </option>

          <option value="Rabu">
            Rabu
          </option>

          <option value="Kamis">
            Kamis
          </option>

          <option value="Jumat">
            Jumat
          </option>

          <option value="Sabtu">
            Sabtu
          </option>

          <option value="Minggu">
            Minggu
          </option>

        </select>

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Mata Pelajaran 1
        </label>

        <input
          type="text"
          placeholder="Contoh: Matematika"
          bind:value={
            scheduleSubject
          }
        />

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Mata Pelajaran 2 (Opsional)
        </label>

        <input
          type="text"
          placeholder="Contoh: IPA"
          bind:value={
            scheduleSubject2
          }
        />

        <small class="form-help">
          Jika diisi, kedua mata pelajaran akan digabung dalam satu jadwal.
        </small>

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Pengajar
        </label>

        <select
          bind:value={
            scheduleTeacherId
          }
        >

          <option value="">
            Pilih Pengajar
          </option>


          {#each ustadUsers as ustad}

            <option
              value={ustad.id}
            >
              {ustad.username}
            </option>

          {/each}

        </select>

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Jam
        </label>

        <input
          type="text"
          placeholder="Contoh: 08:00 - 09:00"
          bind:value={
            scheduleTime
          }
        />

      </div>


      <div
        class="modal-footer"
      >

        <button
          class="btn-secondary"
          on:click={() =>
            showScheduleModal =
              false}
        >
          Batal
        </button>


        <button
          class="btn-primary"
          on:click={
            saveSchedule
          }
        >
          Simpan
        </button>

      </div>

    </div>

  </div>

{/if}


<!-- =========================
     ASSIGN STUDENT CLASS MODAL
========================= -->

{#if showStudentClassModal}
  <div class="modal-backdrop" on:click={() => showStudentClassModal = false}>
    <div class="modal-card small-modal-card" on:click|stopPropagation>
      <div class="modal-header">
        <div>
          <h3>👨‍🎓 Atur Kelas Santri</h3>
          <p class="modal-subtitle">Pilih santri lalu tentukan kelasnya.</p>
        </div>
        <button class="btn-close-modal" on:click={() => showStudentClassModal = false}>✕</button>
      </div>

      <div class="form-group-modal">
        <label>Santri</label>
        <select bind:value={selectedStudentForClass}>
          <option value="">-- Pilih Santri --</option>
          {#each santriUsers as santri}
            <option value={santri.id}>
              {santri.full_name || santri.username} — {santri.class_id ? (santri.class_name || getGradeClassName(Number(santri.class_id))) : "Belum memiliki kelas"}
            </option>
          {/each}
        </select>
        {#if unassignedSantri.length > 0}
          <small class="form-help">{unassignedSantri.length} santri belum memiliki kelas.</small>
        {/if}
      </div>

      <div class="form-group-modal">
        <label>Kelas</label>
        <select bind:value={selectedClassForStudent}>
          <option value="">-- Pilih Kelas --</option>
          {#each classes as classRoom}
            <option value={classRoom.id}>{classRoom.name}</option>
          {/each}
        </select>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" on:click={() => showStudentClassModal = false}>Batal</button>
        <button class="btn-primary" on:click={saveStudentClass}>💾 Simpan Kelas</button>
      </div>
    </div>
  </div>
{/if}

<!-- =========================
     GRADE MODAL
========================= -->

{#if showGradeModal}
  <div class="modal-backdrop" on:click={() => showGradeModal = false}>
    <div class="modal-card grade-modal-card" on:click|stopPropagation>
      <div class="modal-header">
        <h3>{editingGradeId ? "Edit Nilai Santri" : "Input Nilai Santri"}</h3>
        <button class="btn-close-modal" on:click={() => showGradeModal = false}>✕</button>
      </div>

      <div class="grade-form-grid">
        <div class="form-group-modal">
          <label>Kelas</label>
          <select bind:value={gradeClassId} on:change={() => { gradeStudentId = ""; gradeSubject = ""; }}>
            <option value="">-- Pilih Kelas --</option>
            {#each classes as classRoom}
              <option value={classRoom.id}>{classRoom.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-group-modal">
          <label>Santri</label>
          <select bind:value={gradeStudentId}>
            <option value="">-- Pilih Santri --</option>
            {#each gradeStudents as student}
              <option value={student.id}>{student.username}</option>
            {/each}
          </select>
        </div>

        <div class="form-group-modal">
          <label>Mata Pelajaran</label>
          <select bind:value={gradeSubject}>
            <option value="">-- Pilih Mata Pelajaran --</option>
            {#each subjectOptions as subject}
              <option value={subject}>{subject}</option>
            {/each}
          </select>
        </div>

        <div class="form-group-modal">
          <label>Tahun Ajaran</label>
          <input type="text" bind:value={gradeAcademicYear} placeholder="2026/2027" />
        </div>

        <div class="form-group-modal">
          <label>Semester</label>
          <select bind:value={gradeSemester}>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>

        <div class="form-group-modal"><label>Nilai Tugas</label><input type="number" min="0" max="100" bind:value={gradeTask} /></div>
        <div class="form-group-modal"><label>Nilai Ulangan Harian</label><input type="number" min="0" max="100" bind:value={gradeDailyTest} /></div>
        <div class="form-group-modal"><label>Penilaian Tengah Semester</label><input type="number" min="0" max="100" bind:value={gradePTS} /></div>
        <div class="form-group-modal"><label>Penilaian Akhir Semester</label><input type="number" min="0" max="100" bind:value={gradePAS} /></div>
        <div class="form-group-modal"><label>Nilai Sikap / Karakter</label><input type="number" min="0" max="100" bind:value={gradeCharacter} /></div>
        <div class="form-group-modal"><label>Nilai Ujian Sekolah</label><input type="number" min="0" max="100" bind:value={gradeSchoolExam} /></div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" on:click={() => showGradeModal = false}>Batal</button>
        <button class="btn-primary" on:click={saveGrade}>💾 Simpan Nilai</button>
      </div>
    </div>
  </div>
{/if}


<!-- =========================
     ANNOUNCEMENT MODAL
========================= -->

{#if showAnnouncementModal}

  <div
    class="modal-backdrop"
    on:click={() =>
      showAnnouncementModal =
        false}
  >

    <div
      class="modal-card"
      on:click|stopPropagation
    >

      <div
        class="modal-header"
      >

        <h3>

          {
            editingAnnouncementId !== null
              ? "Edit Pengumuman"
              : "Buat Pengumuman"
          }

        </h3>


        <button
          class="btn-close-modal"
          on:click={() =>
            showAnnouncementModal =
              false}
        >
          ✕
        </button>

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Judul Pengumuman
        </label>

        <input
          type="text"
          placeholder="Masukkan judul..."
          bind:value={
            announcementTitle
          }
        />

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Isi Pengumuman
        </label>

        <textarea
          class="announcement-textarea"
          placeholder="Tulis isi pengumuman..."
          bind:value={
            announcementContent
          }
        ></textarea>

      </div>


      <div
        class="modal-footer"
      >

        <button
          class="btn-secondary"
          on:click={() =>
            showAnnouncementModal =
              false}
        >
          Batal
        </button>


        <button
          class="btn-primary"
          on:click={
            saveAnnouncement
          }
        >
          💾 Simpan
        </button>

      </div>

    </div>

  </div>

{/if}


<style>

  :global(*) {

    box-sizing:
      border-box;

  }


  :global(body) {

    margin:
      0;

    background:
      #f4f6f9;

    font-family:
      Arial,
      sans-serif;

    color:
      #2d3748;

  }


  :global(button),
  :global(input),
  :global(select),
  :global(textarea) {

    font-family:
      inherit;

  }


  /* =========================
     APP
  ========================= */

  .app-layout {

    display:
      flex;

    min-height:
      100vh;

  }


  /* =========================
     SIDEBAR
  ========================= */

  .sidebar {

    width:
      260px;

    min-height:
      100vh;

    background:
      linear-gradient(
        180deg,
        #004d99,
        #003366
      );

    color:
      white;

    padding:
      24px 18px;

    display:
      flex;

    flex-direction:
      column;

    gap:
      24px;

    transition:
      0.3s;

    position:
      fixed;

    left:
      0;

    top:
      0;

    z-index:
      100;

  }


  .brand {

    display:
      flex;

    align-items:
      center;

    gap:
      12px;

  }


  .brand-logo {

    font-size:
      24px;

    background:
      rgba(
        255,
        255,
        255,
        0.15
      );

    padding:
      10px;

    border-radius:
      12px;

  }


  .brand h2 {

    margin:
      0;

    font-size:
      19px;

  }


  .brand p {

    margin:
      3px 0 0;

    font-size:
      11px;

    opacity:
      0.75;

  }


  .nav-menu {

    display:
      flex;

    flex-direction:
      column;

    gap:
      7px;

    flex:
      1;

  }


  .nav-item {

    width:
      100%;

    border:
      none;

    background:
      transparent;

    color:
      white;

    text-align:
      left;

    padding:
      13px 15px;

    border-radius:
      10px;

    cursor:
      pointer;

    font-size:
      14px;

    opacity:
      0.8;

    transition:
      0.2s;

  }


  .nav-item:hover,
  .nav-item.active {

    opacity:
      1;

    background:
      rgba(
        255,
        255,
        255,
        0.15
      );

  }


  .logout-btn-side {

    border:
      none;

    background:
      rgba(
        239,
        68,
        68,
        0.25
      );

    color:
      white;

    padding:
      12px;

    border-radius:
      10px;

    cursor:
      pointer;

    font-weight:
      600;

  }


  .sidebar-overlay {

    display:
      none;

  }


  /* =========================
     MAIN
  ========================= */

  .main-content {

    flex:
      1;

    margin-left:
      260px;

    min-width:
      0;

  }


  /* =========================
     HEADER
  ========================= */

  .bca-header-bg {

    background:
      linear-gradient(
        135deg,
        #005caf,
        #003366
      );

    padding:
      24px 32px 70px;

    border-bottom-left-radius:
      30px;

    border-bottom-right-radius:
      30px;

  }


  .top-nav-bar {

    display:
      flex;

    align-items:
      center;

    justify-content:
      space-between;

  }


  .hamburger {

    display:
      none;

    border:
      none;

    background:
      transparent;

    color:
      white;

    font-size:
      28px;

    cursor:
      pointer;

  }


  .welcome-box {

    display:
      flex;

    align-items:
      center;

    gap:
      12px;

  }


  .avatar-circle {

    width:
      45px;

    height:
      45px;

    border-radius:
      50%;

    background:
      #00a3e0;

    display:
      flex;

    align-items:
      center;

    justify-content:
      center;

    font-weight:
      bold;

    color:
      white;

  }


  .welcome-text {

    display:
      flex;

    flex-direction:
      column;

    color:
      white;

  }


  .welcome-text span {

    font-size:
      12px;

    opacity:
      0.8;

  }


  .welcome-text strong {

    font-size:
      16px;

  }


  .logout-btn-header {

    border:
      none;

    background:
      rgba(
        255,
        255,
        255,
        0.15
      );

    color:
      white;

    padding:
      9px 15px;

    border-radius:
      20px;

    cursor:
      pointer;

    font-weight:
      600;

  }


  /* =========================
     BODY
  ========================= */

  .dashboard-body {

    padding:
      0 32px 32px;

    margin-top:
      -38px;

  }


  .portal-grid {

    display:
      grid;

    grid-template-columns:
      2fr 1fr;

    gap:
      20px;

    margin-bottom:
      20px;

  }


  .portal-grid-secondary {

    display:
      grid;

    grid-template-columns:
      1fr 1fr;

    gap:
      20px;

  }


  .bca-card {

    background:
      white;

    border-radius:
      18px;

    padding:
      22px;

    box-shadow:
      0 5px 22px
      rgba(
        0,
        0,
        0,
        0.06
      );

    border:
      1px solid
      #e2e8f0;

  }


  /* =========================
     SALDO
  ========================= */

  .saldo-card {

    background:
      linear-gradient(
        135deg,
        #005caf,
        #003366
      );

    color:
      white;

    border:
      none;

  }


  .card-top-row {

    display:
      flex;

    justify-content:
      space-between;

    align-items:
      center;

  }


  .card-label {

    font-size:
      13px;

    opacity:
      0.85;

  }


  .badge-brand {

    background:
      rgba(
        255,
        255,
        255,
        0.18
      );

    padding:
      5px 10px;

    border-radius:
      20px;

    font-size:
      11px;

  }


  .card-main-balance {

    font-size:
      32px;

    font-weight:
      800;

    margin:
      24px 0;

  }


  .card-footer-info {

    border-top:
      1px solid
      rgba(
        255,
        255,
        255,
        0.2
      );

    padding-top:
      12px;

    font-size:
      12px;

    opacity:
      0.85;

  }


  /* =========================
     SUMMARY
  ========================= */

  .box-title {

    margin:
      0 0 16px;

    font-size:
      16px;

  }


  .summary-pills-row {

    display:
      flex;

    flex-direction:
      column;

    gap:
      10px;

  }


  .summary-pill {

    padding:
      14px;

    border-radius:
      12px;

    display:
      flex;

    flex-direction:
      column;

    gap:
      4px;

  }


  .summary-pill.green {

    background:
      #e6f4ea;

    border-left:
      4px solid
      #137333;

  }


  .summary-pill.red {

    background:
      #fce8e6;

    border-left:
      4px solid
      #c5221f;

  }


  .pill-title {

    font-size:
      11px;

    color:
      #64748b;

    font-weight:
      600;

  }


  .pill-value {

    font-size:
      15px;

    font-weight:
      bold;

  }


  .summary-pill.green
  .pill-value {

    color:
      #137333;

  }


  .summary-pill.red
  .pill-value {

    color:
      #c5221f;

  }


  /* =========================
     SERVICES
  ========================= */

  .services-grid {

    display:
      grid;

    grid-template-columns:
      repeat(
        3,
        1fr
      );

    gap:
      12px;

  }


  .service-item {

    border:
      1px solid
      #edf2f7;

    background:
      #f8fafc;

    border-radius:
      12px;

    padding:
      14px 8px;

    cursor:
      pointer;

    display:
      flex;

    flex-direction:
      column;

    align-items:
      center;

    gap:
      8px;

    transition:
      0.2s;

  }


  .service-item:hover {

    transform:
      translateY(-2px);

    background:
      #edf2f7;

  }


  .service-item span {

    font-size:
      11px;

    font-weight:
      600;

    color:
      #475569;

  }


  .s-icon {

    width:
      42px;

    height:
      42px;

    border-radius:
      12px;

    display:
      flex;

    align-items:
      center;

    justify-content:
      center;

    font-size:
      19px;

  }


  .blue {
    background: #e1f5fe;
  }

  .red {
    background: #ffebee;
  }

  .purple {
    background: #f3e5f5;
  }

  .orange {
    background: #fff3e0;
  }

  .cyan {
    background: #e0f7fa;
  }

  .green {
    background: #e8f5e9;
  }


  /* =========================
     TRANSACTION
  ========================= */

  .transaction-list {

    display:
      flex;

    flex-direction:
      column;

    gap:
      8px;

  }


  .trx-item {

    display:
      flex;

    align-items:
      center;

    gap:
      12px;

    padding:
      10px 0;

    border-bottom:
      1px solid
      #f1f5f9;

  }


  .trx-icon-wrapper {

    width:
      35px;

    height:
      35px;

    border-radius:
      50%;

    display:
      flex;

    align-items:
      center;

    justify-content:
      center;

    font-weight:
      bold;

  }


  .trx-icon-wrapper.pemasukan {

    background:
      #e6f4ea;

    color:
      #137333;

  }


  .trx-icon-wrapper.pengeluaran {

    background:
      #fce8e6;

    color:
      #c5221f;

  }


  .trx-details {

    flex:
      1;

    display:
      flex;

    flex-direction:
      column;

  }


  .trx-details strong {

    font-size:
      13px;

  }


  .trx-details small {

    font-size:
      11px;

    color:
      #94a3b8;

  }


  .trx-amount {

    font-size:
      13px;

    font-weight:
      bold;

  }


  .trx-amount.pemasukan {

    color:
      #137333;

  }


  .trx-amount.pengeluaran {

    color:
      #c5221f;

  }


  /* =========================
     SUB PAGE
  ========================= */

  .sub-header-row {

    display:
      flex;

    justify-content:
      space-between;

    align-items:
      center;

    gap:
      15px;

    flex-wrap:
      wrap;

    margin-bottom:
      20px;

  }


  .sub-header-row h3 {

    margin:
      0;

    font-size:
      18px;

  }


  .sub-description {

    margin:
      5px 0 0;

    font-size:
      12px;

    color:
      #64748b;

  }


  .action-group-top {

    display:
      flex;

    gap:
      8px;

    flex-wrap:
      wrap;

  }


  /* =========================
     BUTTONS
  ========================= */

  .btn-primary {

    border:
      none;

    background:
      #005caf;

    color:
      white;

    padding:
      10px 15px;

    border-radius:
      9px;

    cursor:
      pointer;

    font-size:
      12px;

    font-weight:
      600;

  }


  .btn-primary:hover {

    background:
      #004b8f;

  }


  .btn-secondary {

    border:
      none;

    background:
      #e2e8f0;

    color:
      #475569;

    padding:
      9px 14px;

    border-radius:
      8px;

    cursor:
      pointer;

  }


  .btn-back {

    border:
      none;

    background:
      #e2e8f0;

    color:
      #475569;

    padding:
      10px 14px;

    border-radius:
      9px;

    cursor:
      pointer;

    font-weight:
      600;

    font-size:
      12px;

  }


  .btn-icon {

    border:
      none;

    background:
      #f1f5f9;

    padding:
      7px 9px;

    border-radius:
      7px;

    cursor:
      pointer;

  }


  .btn-icon.danger {

    background:
      #fee2e2;

  }


  .action-buttons {

    display:
      flex;

    gap:
      6px;

    justify-content:
      center;

  }


  /* =========================
     CONTROLS
  ========================= */

  .control-card-inline {

    display:
      flex;

    justify-content:
      space-between;

    align-items:
      center;

    gap:
      12px;

    flex-wrap:
      wrap;

    margin-bottom:
      16px;

  }


  .search-box {

    display:
      flex;

    align-items:
      center;

    gap:
      6px;

    background:
      #f8fafc;

    border:
      1px solid
      #cbd5e1;

    padding:
      8px 12px;

    border-radius:
      9px;

    width:
      260px;

  }


  .search-box input {

    border:
      none;

    background:
      transparent;

    outline:
      none;

    width:
      100%;

  }


  .year-picker {

    display:
      flex;

    align-items:
      center;

    gap:
      8px;

    font-size:
      12px;

  }


  .year-picker select {

    padding:
      8px;

    border-radius:
      8px;

    border:
      1px solid
      #cbd5e1;

  }


  /* =========================
     TABLE
  ========================= */

  .table-responsive {

    width:
      100%;

    overflow-x:
      auto;

  }


  .data-table {

    width:
      100%;

    min-width:
      650px;

    border-collapse:
      collapse;

    font-size:
      12px;

  }


  .data-table th {

    background:
      #f8fafc;

    color:
      #475569;

    padding:
      12px 8px;

    text-align:
      left;

    border-bottom:
      1px solid
      #e2e8f0;

  }


  .data-table td {

    padding:
      10px 8px;

    border-bottom:
      1px solid
      #f1f5f9;

  }


  .text-center {

    text-align:
      center;

  }


  .empty-cell {

    text-align:
      center;

    padding:
      25px;

    color:
      #94a3b8;

  }


  .user-cell {

    display:
      flex;

    align-items:
      center;

    gap:
      8px;

  }


  .user-avatar {

    width:
      30px;

    height:
      30px;

    border-radius:
      50%;

    background:
      #e1f5fe;

    color:
      #0288d1;

    display:
      flex;

    align-items:
      center;

    justify-content:
      center;

    font-size:
      11px;

    font-weight:
      bold;

    flex-shrink:
      0;

  }


  /* =========================
     ROLE
  ========================= */

  .role-badge {

    display:
      inline-block;

    padding:
      4px 8px;

    border-radius:
      20px;

    font-size:
      10px;

    font-weight:
      bold;

    text-transform:
      uppercase;

  }


  .role-badge.santri {

    background:
      #e1f5fe;

    color:
      #0288d1;

  }


  .role-badge.admin {

    background:
      #fff3e0;

    color:
      #ef6c00;

  }


  .role-badge.ustad {

    background:
      #ede9fe;

    color:
      #6d28d9;

  }


  /* =========================
     SPP
  ========================= */

  .spp-chip {

    width:
      26px;

    height:
      26px;

    border:
      none;

    border-radius:
      7px;

    font-weight:
      bold;

    cursor:
      pointer;

  }


  .spp-chip.lunas {

    background:
      #dcfce7;

    color:
      #15803d;

  }


  .spp-chip.belum {

    background:
      #fee2e2;

    color:
      #dc2626;

  }


  .spp-chip.disabled {

    cursor:
      not-allowed;

    opacity:
      0.7;

  }


  .badge-count {

    background:
      #f1f5f9;

    padding:
      5px 8px;

    border-radius:
      20px;

    font-weight:
      bold;

  }


  .badge-count.full {

    background:
      #dcfce7;

    color:
      #15803d;

  }


  /* =========================
     ATTENDANCE
  ========================= */

  .attendance-group-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 18px 0 14px;
  }

  .attendance-group-tab {
    border: 1px solid #dbe3ef;
    background: #f8fafc;
    border-radius: 14px;
    padding: 13px 14px;
    cursor: pointer;
    text-align: left;
    transition: 0.2s ease;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .attendance-group-tab span {
    font-size: 16px;
    font-weight: 800;
  }

  .attendance-group-tab small {
    color: #64748b;
    font-size: 12px;
  }

  .attendance-group-tab:hover {
    transform: translateY(-1px);
    border-color: #94a3b8;
  }

  .attendance-group-tab.active {
    background: #eff6ff;
    border-color: #2563eb;
    box-shadow: 0 5px 16px rgba(37, 99, 235, 0.12);
  }

  .attendance-group-tab.active span {
    color: #1d4ed8;
  }

  .attendance-class-tabs {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
    margin: 0 0 14px;
  }

  .attendance-class-tab {
    border: 1px solid #dbe3ef;
    background: #ffffff;
    border-radius: 12px;
    padding: 11px 10px;
    cursor: pointer;
    text-align: center;
    transition: 0.2s ease;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .attendance-class-tab span {
    font-size: 14px;
    font-weight: 800;
  }

  .attendance-class-tab small {
    color: #64748b;
    font-size: 11px;
  }

  .attendance-class-tab:hover {
    transform: translateY(-1px);
    border-color: #94a3b8;
  }

  .attendance-class-tab.active {
    background: #f1f5ff;
    border-color: #2563eb;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.10);
  }

  .attendance-class-tab.active span {
    color: #1d4ed8;
  }

  .attendance-group-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 8px 0 14px;
    padding: 14px 16px;
    border-radius: 14px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }

  .attendance-group-title > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .attendance-group-title strong {
    font-size: 16px;
  }

  .attendance-group-title span {
    color: #64748b;
    font-size: 12px;
  }

  .attendance-student-count {
    white-space: nowrap;
    font-weight: 700;
    color: #1d4ed8 !important;
  }

  .attendance-date-box {

    display:
      flex;

    flex-direction:
      column;

    gap:
      6px;

    margin-bottom:
      15px;

    max-width:
      250px;

  }


  .attendance-date-box label {

    font-size:
      12px;

    font-weight:
      600;

  }


  .attendance-date-box input {

    padding:
      10px;

    border:
      1px solid
      #cbd5e1;

    border-radius:
      9px;

  }


  .attendance-form {

    display:
      flex;

    gap:
      10px;

    flex-wrap:
      wrap;

    margin-bottom:
      20px;

  }


  .attendance-form select {

    padding:
      10px;

    border:
      1px solid
      #cbd5e1;

    border-radius:
      9px;

    min-width:
      180px;

  }


  .attendance-input-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 16px;
    margin-bottom: 10px;
    border: 1px solid #dbe3ef;
    border-radius: 14px;
    background: #f8fafc;
  }

  .attendance-input-header > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .attendance-input-header span {
    color: #64748b;
    font-size: 12px;
  }

  .attendance-draft-info {
    min-width: 90px;
    text-align: center;
    padding: 8px 12px;
    border-radius: 10px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
  }

  .attendance-draft-info strong {
    display: block;
    font-size: 18px;
  }

  .attendance-bulk-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin: 10px 0 14px;
  }

  .attendance-save-all:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .attendance-unsaved {
    color: #b45309 !important;
    font-size: 12px;
    font-weight: 700;
  }

  .attendance-saved {
    color: #15803d !important;
    font-size: 12px;
    font-weight: 700;
  }

  .attendance-form-single {
    margin-bottom: 18px;
  }

  .attendance-quick-note {
    color: #64748b;
    font-size: 12px;
    align-self: center;
  }

  .attendance-row-select {
    width: 100%;
    min-width: 130px;
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    background: #ffffff;
    font-size: 12px;
  }

  .attendance-row-select:focus {
    outline: 2px solid rgba(37, 99, 235, 0.15);
    border-color: #2563eb;
  }

  .attendance-summary {

    display:
      grid;

    grid-template-columns:
      repeat(
        4,
        1fr
      );

    gap:
      12px;

    margin-bottom:
      20px;

  }


  .attendance-summary-item {

    background:
      #f8fafc;

    border:
      1px solid
      #e2e8f0;

    border-radius:
      12px;

    padding:
      14px;

    display:
      flex;

    flex-direction:
      column;

  }


  .attendance-summary-item strong {

    font-size:
      22px;

  }


  .attendance-summary-item span {

    font-size:
      11px;

    color:
      #64748b;

  }


  .attendance-badge {

    display:
      inline-block;

    padding:
      5px 9px;

    border-radius:
      20px;

    font-size:
      11px;

    font-weight:
      bold;

  }


  .attendance-badge.hadir {

    background:
      #dcfce7;

    color:
      #15803d;

  }


  .attendance-badge.izin {

    background:
      #dbeafe;

    color:
      #1d4ed8;

  }


  .attendance-badge.sakit {

    background:
      #fef3c7;

    color:
      #b45309;

  }


  .attendance-badge.alpha {

    background:
      #fee2e2;

    color:
      #dc2626;

  }


  .attendance-badge.belum {

    background:
      #f1f5f9;

    color:
      #64748b;

  }


  /* =========================
     TEACHER
  ========================= */

  .teacher-cell {

    display:
      flex;

    align-items:
      center;

    gap:
      6px;

  }


  /* =========================
     ANNOUNCEMENT
  ========================= */

  .announcement-list {

    display:
      flex;

    flex-direction:
      column;

    gap:
      15px;

  }


  .announcement-card {

    border:
      1px solid
      #e2e8f0;

    border-radius:
      14px;

    padding:
      18px;

    background:
      #ffffff;

    transition:
      0.2s;

  }


  .announcement-card:hover {

    transform:
      translateY(-2px);

    box-shadow:
      0 8px 20px
      rgba(
        0,
        0,
        0,
        0.06
      );

  }


  .announcement-header {

    display:
      flex;

    justify-content:
      space-between;

    align-items:
      flex-start;

    gap:
      12px;

    margin-bottom:
      14px;

  }


  .announcement-header h4 {

    margin:
      0 0 5px;

    font-size:
      16px;

    color:
      #1e293b;

  }


  .announcement-header small {

    color:
      #94a3b8;

    font-size:
      11px;

  }


  .announcement-content {

    color:
      #475569;

    font-size:
      13px;

    line-height:
      1.7;

    white-space:
      pre-wrap;

  }


  .empty-announcement {

    text-align:
      center;

    padding:
      50px 20px;

    color:
      #94a3b8;

    font-size:
      14px;

  }


  .empty-announcement div {

    font-size:
      35px;

  }


  .announcement-textarea {

    width:
      100%;

    min-height:
      140px;

    padding:
      10px;

    border:
      1px solid
      #cbd5e1;

    border-radius:
      9px;

    font-family:
      inherit;

    font-size:
      13px;

    resize:
      vertical;

    outline:
      none;

  }


  .announcement-textarea:focus {

    border-color:
      #005caf;

    box-shadow:
      0 0 0 3px
      rgba(
        0,
        92,
        175,
        0.1
      );

  }


  /* =========================
     HOME ANNOUNCEMENT
  ========================= */

  .home-announcement-card {

    margin-top:
      20px;

  }


  .home-announcement-list {

    display:
      flex;

    flex-direction:
      column;

    gap:
      12px;

  }


  .home-announcement-item {

    display:
      flex;

    justify-content:
      space-between;

    align-items:
      flex-start;

    gap:
      20px;

    padding:
      14px;

    background:
      #f8fafc;

    border-radius:
      12px;

    border:
      1px solid
      #e2e8f0;

  }


  .home-announcement-item strong {

    font-size:
      13px;

  }


  .home-announcement-item p {

    margin:
      6px 0 0;

    font-size:
      12px;

    color:
      #64748b;

    line-height:
      1.5;

  }


  .home-announcement-item small {

    color:
      #94a3b8;

    white-space:
      nowrap;

    font-size:
      11px;

  }


  /* =========================
     QR CODE & SCANNER
  ========================= */

  .barcode-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
  }

  .barcode-card {
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 18px;
    background: #fff;
    text-align: center;
  }

  .barcode-user {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 16px;
  }

  .qr-code-box {
    min-height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 10px;
  }

  .qr-code-image {
    display: block;
    width: 260px;
    height: 260px;
    max-width: 100%;
    object-fit: contain;
  }

  .qr-loading {
    color: #64748b;
    font-size: 14px;
  }

  .qr-payload {
    margin-top: 8px;
    color: #64748b;
    font: 12px monospace;
  }

  .qr-attendance-box {
    margin: 20px 0;
    padding: 20px;
    border: 1px solid #e2e8f0;
    border-radius: 18px;
    background: #fff;
  }

  .qr-attendance-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 15px;
  }

  .qr-attendance-header h3 {
    margin: 0 0 5px;
  }

  .qr-attendance-header p {
    margin: 0;
    color: #64748b;
    font-size: 14px;
    line-height: 1.5;
  }

  .scan-nav-item {
    border: 1px solid rgba(37, 99, 235, 0.14);
  }

  .scan-attendance-page {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .section-kicker {
    display: inline-block;
    margin-bottom: 6px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .scan-attendance-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(220px, 0.8fr);
    gap: 14px;
  }

  .scan-date-card,
  .scan-status-card {
    padding: 18px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 16px;
    background: #fff;
  }

  .scan-date-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .scan-date-card input {
    width: 100%;
  }

  .scan-date-card small,
  .scan-status-card span,
  .scan-help-grid span {
    color: #64748b;
  }

  .scan-status-card {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 7px;
  }

  .scan-status-live {
    color: #16a34a;
  }

  .scanner-box {
    overflow: hidden;
  }

  .scanner-access-denied {
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    text-align: center;
  }

  .scan-help-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .scan-help-grid > div {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 15px;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.035);
  }

  @media (max-width: 760px) {
    .scan-attendance-grid,
    .scan-help-grid {
      grid-template-columns: 1fr;
    }

    .qr-attendance-header {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  #qr-reader {
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
    overflow: hidden;
    border-radius: 16px;
  }

  #qr-reader video {
    width: 100% !important;
    border-radius: 16px;
  }

  #qr-reader.qr-reader-active {
    min-height: 280px;
  }

  .scanner-placeholder {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 8px;
    border: 2px dashed #cbd5e1;
    border-radius: 16px;
    color: #64748b;
    text-align: center;
  }

  .scanner-placeholder-icon {
    font-size: 48px;
  }

  .qr-scan-message.error {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }

  .camera-help-box {
    margin-top: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: #eff6ff;
    color: #1e40af;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }

  button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .qr-scan-message {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: 10px;
    background: #fff7ed;
    color: #9a3412;
    font-size: 14px;
  }

  .qr-scan-message.success {
    background: #ecfdf5;
    color: #047857;
  }

  .qr-student-result {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    padding: 12px 14px;
    border: 1px solid #bbf7d0;
    border-radius: 12px;
    background: #f0fdf4;
  }

  .qr-student-result strong,
  .qr-student-result span {
    display: block;
  }

  .qr-student-result span {
    margin-top: 3px;
    color: #64748b;
    font-size: 12px;
  }

  .btn-danger {
    border: none;
    padding: 10px 16px;
    border-radius: 10px;
    background: #dc2626;
    color: #fff;
    cursor: pointer;
  }



  /* =========================
     FORM
  ========================= */

  .quick-form {

    max-width:
      500px;

    display:
      flex;

    flex-direction:
      column;

    gap:
      14px;

  }


  .form-group {

    display:
      flex;

    flex-direction:
      column;

    gap:
      6px;

  }


  .form-group label {

    font-size:
      12px;

    font-weight:
      600;

  }


  .form-group input,
  .form-group select {

    padding:
      11px;

    border:
      1px solid
      #cbd5e1;

    border-radius:
      9px;

    outline:
      none;

  }


  .big-button {

    padding:
      13px;

    font-size:
      14px;

  }


  /* =========================
     MODAL
  ========================= */

  .modal-backdrop {

    position:
      fixed;

    inset:
      0;

    background:
      rgba(
        0,
        0,
        0,
        0.5
      );

    display:
      flex;

    align-items:
      center;

    justify-content:
      center;

    padding:
      20px;

    z-index:
      1000;

  }


  .modal-card {

    width:
      100%;

    max-width:
      430px;

    background:
      white;

    border-radius:
      16px;

    padding:
      22px;

    box-shadow:
      0 20px 50px
      rgba(
        0,
        0,
        0,
        0.2
      );

  }


  .modal-header {

    display:
      flex;

    align-items:
      center;

    justify-content:
      space-between;

    margin-bottom:
      18px;

  }


  .modal-header h3 {

    margin:
      0;

  }


  .btn-close-modal {

    border:
      none;

    width:
      30px;

    height:
      30px;

    border-radius:
      50%;

    cursor:
      pointer;

    background:
      #f1f5f9;

  }


  .form-group-modal {

    display:
      flex;

    flex-direction:
      column;

    gap:
      6px;

    margin-bottom:
      14px;

  }


  .form-group-modal label {

    font-size:
      12px;

    font-weight:
      600;

  }


  .form-group-modal input,
  .form-group-modal select {

    padding:
      10px;

    border:
      1px solid
      #cbd5e1;

    border-radius:
      9px;

    outline:
      none;

  }


  .modal-footer {

    display:
      flex;

    justify-content:
      flex-end;

    gap:
      8px;

    margin-top:
      20px;

  }


  /* =========================
     TOAST
  ========================= */

  .toast {

    position:
      fixed;

    top:
      20px;

    right:
      20px;

    z-index:
      2000;

    padding:
      14px 18px;

    border-radius:
      12px;

    font-size:
      13px;

    font-weight:
      600;

    box-shadow:
      0 10px 30px
      rgba(
        0,
        0,
        0,
        0.15
      );

  }


  .toast.success {

    background:
      #dcfce7;

    color:
      #15803d;

  }


  .toast.error {

    background:
      #fee2e2;

    color:
      #dc2626;

  }


  /* =========================
     TABLET
  ========================= */

  @media (
    max-width:
    1000px
  ) {

    .portal-grid,
    .portal-grid-secondary {

      grid-template-columns:
        1fr;

    }


    .services-grid {

      grid-template-columns:
        repeat(
          4,
          1fr
        );

    }

  }


  /* =========================
     MOBILE
  ========================= */

  @media (
    max-width:
    768px
  ) {

    .sidebar {

      transform:
        translateX(
          -100%
        );

    }


    .sidebar.open {

      transform:
        translateX(
          0
        );

    }


    .sidebar-overlay {

      display:
        block;

      position:
        fixed;

      inset:
        0;

      background:
        rgba(
          0,
          0,
          0,
          0.4
        );

      z-index:
        90;

    }


    .main-content {

      margin-left:
        0;

    }


    .hamburger {

      display:
        block;

    }


    .bca-header-bg {

      padding:
        20px 18px 65px;

    }


    .dashboard-body {

      padding:
        0 16px 25px;

      margin-top:
        -32px;

    }


    .bca-card {

      padding:
        16px;

    }


    .card-main-balance {

      font-size:
        25px;

    }


    .welcome-text strong {

      font-size:
        14px;

    }


    .logout-btn-header span {

      display:
        none;

    }


    .services-grid {

      grid-template-columns:
        repeat(
          3,
          1fr
        );

    }


    .attendance-group-tabs {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .attendance-group-tab {
      padding: 11px 12px;
    }

    .attendance-class-tabs {
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .attendance-group-title {
      align-items: flex-start;
      flex-direction: column;
    }

    .attendance-summary {

      grid-template-columns:
        repeat(
          2,
          1fr
        );

    }


    .attendance-form {

      flex-direction:
        column;

    }


    .attendance-form select,
    .attendance-form button {

      width:
        100%;

    }


    .sub-header-row {

      align-items:
        flex-start;

    }


    .announcement-header {

      flex-direction:
        column;

    }


    .home-announcement-item {

      flex-direction:
        column;

      gap:
        8px;

    }

  }


  /* =========================
     SMALL MOBILE
  ========================= */

  @media (
    max-width:
    430px
  ) {

    .services-grid {

      grid-template-columns:
        repeat(
          2,
          1fr
        );

    }


    .top-nav-bar {

      gap:
        8px;

    }


    .welcome-box {

      gap:
        8px;

    }


    .avatar-circle {

      width:
        38px;

      height:
        38px;

    }


    .card-main-balance {

      font-size:
        22px;

    }


    .action-group-top {

      width:
        100%;

    }


    .action-group-top button {

      flex:
        1;

    }

  }


  /* =========================
     PENGAJAR / USTAD CARD
  ========================= */

  .teacher-card {
    min-height: 245px;
  }

  .teacher-profile-card {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 22px 0;
    padding: 18px;
    border-radius: 18px;
    background: linear-gradient(135deg, #eff6ff, #f8fafc);
    border: 1px solid #dbeafe;
  }

  .teacher-avatar {
    width: 58px;
    height: 58px;
    flex: 0 0 58px;
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2563eb;
    color: white;
    font-size: 22px;
    font-weight: 800;
    box-shadow: 0 8px 20px rgba(37, 99, 235, .18);
  }

  .teacher-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .teacher-info strong {
    font-size: 19px;
    color: #0f172a;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .teacher-info span {
    font-size: 12px;
    color: #64748b;
  }

  @media (max-width: 640px) {
    .teacher-profile-card {
      padding: 14px;
      margin: 16px 0;
    }

    .teacher-avatar {
      width: 50px;
      height: 50px;
      flex-basis: 50px;
      border-radius: 15px;
    }

    .teacher-info strong {
      font-size: 16px;
    }
  }


  .teacher-dashboard-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .teacher-card {
    min-height: 245px;
  }

  .teacher-profile-card {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 22px 0;
    padding: 18px;
    border-radius: 18px;
    background: linear-gradient(135deg, #eff6ff, #f8fafc);
    border: 1px solid #dbeafe;
  }

  .teacher-avatar {
    width: 58px;
    height: 58px;
    flex: 0 0 58px;
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2563eb;
    color: #fff;
    font-size: 22px;
    font-weight: 800;
    box-shadow: 0 8px 20px rgba(37, 99, 235, .18);
  }

  .teacher-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .teacher-info strong {
    font-size: 19px;
    color: #0f172a;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .teacher-info span {
    font-size: 12px;
    color: #64748b;
  }

  @media (max-width: 640px) {
    .teacher-profile-card {
      padding: 14px;
      margin: 16px 0;
    }

    .teacher-avatar {
      width: 50px;
      height: 50px;
      flex-basis: 50px;
      border-radius: 15px;
    }

    .teacher-info strong {
      font-size: 16px;
    }
  }


  /* =========================
     SCHEDULE BY DAY
  ========================= */
  .schedule-day-list {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .schedule-day-group {
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    overflow: hidden;
    background: #ffffff;
  }

  .schedule-day-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .schedule-day-header h4 {
    margin: 0;
    font-size: 18px;
    color: #0f172a;
  }

  .schedule-day-header span {
    font-size: 12px;
    font-weight: 700;
    color: #475569;
    background: #e2e8f0;
    padding: 5px 10px;
    border-radius: 999px;
  }

  .schedule-card-list {
    display: flex;
    flex-direction: column;
  }

  .schedule-item-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 18px;
    border-bottom: 1px solid #f1f5f9;
  }

  .schedule-item-card:last-child {
    border-bottom: none;
  }

  .schedule-time {
    min-width: 100px;
    display: flex;
    align-items: center;
    gap: 7px;
    color: #334155;
  }

  .schedule-main-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .subject-separator {
    opacity: 0.65;
    margin: 0 2px;
  }

  .schedule-subject {
    font-size: 16px;
    color: #0f172a;
  }

  .schedule-teacher {
    font-size: 13px;
    color: #64748b;
  }

  .schedule-actions {
    display: flex;
    gap: 8px;
  }

  .empty-schedule {
    padding: 35px 20px;
    text-align: center;
    color: #64748b;
  }

  @media (max-width: 640px) {
    .schedule-item-card {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .schedule-time {
      min-width: auto;
      width: 100%;
    }

    .schedule-actions {
      width: 100%;
      justify-content: flex-end;
    }
  }

  /* =========================
     REKAP NILAI
  ========================= */

  .grade-filter {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    padding: 16px;
    margin-bottom: 20px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #f8fafc;
  }

  .grade-form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
    padding: 4px 0 18px;
  }

  .grade-modal-card {
    width: min(920px, 96vw);
    max-height: 92vh;
    overflow-y: auto;
  }

  .grade-table th,
  .grade-table td {
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .grade-filter,
    .grade-form-grid {
      grid-template-columns: 1fr;
    }
  }

  .small-modal-card {
    max-width: 560px;
  }

  .modal-subtitle {
    margin: 4px 0 0;
    font-size: 0.9rem;
    color: #64748b;
  }

  .form-help {
    display: block;
    margin-top: 6px;
    color: #64748b;
    font-size: 0.82rem;
  }


  .attendance-save-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    padding: 16px;
    border: 1px solid #dbe3ef;
    border-radius: 14px;
    background: #f8fafc;
  }

  .attendance-save-bottom > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .attendance-save-bottom span {
    color: #64748b;
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .attendance-save-bottom {
      align-items: stretch;
      flex-direction: column;
    }
  }

  @media (max-width: 720px) {
    .attendance-input-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .attendance-bulk-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .attendance-save-all {
      width: 100%;
    }

    .attendance-table th,
    .attendance-table td {
      min-width: 120px;
    }
  }
</style>

