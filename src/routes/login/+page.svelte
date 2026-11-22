
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { supabase } from "$lib/supabaseClient";

  let email = "";
  let password = "";
  let message = "";
  let messageType: "error" | "success" = "error";

  let isLoading = false;
  let isCheckingSession = true;
  let showPassword = false;

  // =====================================
  // PENGALIHAN HALAMAN BERDASARKAN ROLE
  // =====================================

  function getDashboardByRole(role: string): string | null {
    switch (role?.toLowerCase().trim()) {
      case "admin":
        return "/dashboard";

      case "ustad":
        return "/ustad";

      case "santri":
        return "/santri";

      default:
        return null;
    }
  }

  // =====================================
  // CEK LOGIN SAAT HALAMAN DIBUKA
  // =====================================

  onMount(async () => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      isCheckingSession = false;
      return;
    }

    try {
      const currentUser = JSON.parse(storedUser);

      if (!currentUser?.id || !currentUser?.role) {
        localStorage.removeItem("user");
        isCheckingSession = false;
        return;
      }

      const destination = getDashboardByRole(currentUser.role);

      if (!destination) {
        localStorage.removeItem("user");
        isCheckingSession = false;
        return;
      }

      // Pengguna yang masih login langsung diarahkan
      await goto(destination, { replaceState: true });
    } catch (error) {
      console.error("Pengecekan sesi gagal:", error);
      localStorage.removeItem("user");
      isCheckingSession = false;
    }
  });

  // =====================================
  // PROSES LOGIN
  // =====================================

  async function login() {
    if (isLoading || isCheckingSession) return;

    message = "";

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      message = "Email dan password wajib diisi.";
      messageType = "error";
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      message = "Format email tidak valid.";
      messageType = "error";
      return;
    }

    isLoading = true;

    try {
      // Mengikuti format password_hash pada database lama
      const password_hash = btoa(
        unescape(encodeURIComponent(password))
      );

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", cleanEmail)
        .eq("password_hash", password_hash)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        message = "Email atau password salah.";
        messageType = "error";
        return;
      }

      // Periksa role pengguna
      const destination = getDashboardByRole(data.role);

      if (!destination) {
        message = "Role akun tidak dikenali.";
        messageType = "error";
        return;
      }

      // Jangan simpan password_hash di localStorage
      const { password_hash: _, ...safeUserData } = data;

      localStorage.setItem(
        "user",
        JSON.stringify(safeUserData)
      );

      message = "Login berhasil!";
      messageType = "success";

      await goto(destination, {
        replaceState: true
      });

    } catch (error: any) {
      console.error("Login gagal:", error);

      message =
        error?.message || "Terjadi kesalahan. Silakan coba lagi.";

      messageType = "error";

    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Login - Daarulhikam</title>
  <meta
    name="description"
    content="Login aplikasi Daarulhikam"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="wrapper">
  {#if isCheckingSession}
    <div class="checking">
      <div class="loader"></div>
      <p>Memeriksa sesi login...</p>
    </div>
  {:else}
    <div class="login-container">

      <div class="brand">
        <div class="logo-wrapper">
          <img
            src="/logo.png"
            alt="Logo Daarulhikam"
            class="logo"
          />
        </div>

        <span class="company-name">Daarulhikam</span>
        <span class="brand-description">
          Sistem Informasi Pesantren
        </span>
      </div>

      <div class="login-box">
        <div class="heading">
          <h1>Selamat Datang</h1>
          <p>Silakan login untuk melanjutkan</p>
        </div>

        <form on:submit|preventDefault={login}>

          <div class="form-group">
            <label for="email">Email</label>

            <input
              id="email"
              type="email"
              placeholder="Masukkan email kamu"
              bind:value={email}
              autocomplete="username"
              required
              disabled={isLoading}
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>

            <div class="password-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Masukkan password"
                bind:value={password}
                autocomplete="current-password"
                required
                disabled={isLoading}
              />

              <button
                type="button"
                class="toggle-password"
                on:click={() => showPassword = !showPassword}
                aria-label={showPassword ? "Sembunyikan password" : "Lihat password"}
              >
                {showPassword ? "Sembunyikan" : "Lihat"}
              </button>
            </div>
          </div>

          {#if message}
            <div
              class:error-message={messageType === "error"}
              class:success-message={messageType === "success"}
              class="message"
              role="alert"
            >
              {message}
            </div>
          {/if}

          <button
            type="submit"
            class="login-button"
            disabled={isLoading}
          >
            {#if isLoading}
              <span class="button-loader"></span>
              Memeriksa akun...
            {:else}
              Login Sekarang
            {/if}
          </button>

        </form>

        <div class="register">
          <span>Belum punya akun?</span>
          <a href="/register">Daftar di sini</a>
        </div>
      </div>

      <div class="footer">
        © {new Date().getFullYear()} Daarulhikam
        <span>•</span>
        Sistem Informasi Pesantren
      </div>

    </div>
  {/if}
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    font-family: "Poppins", sans-serif;
  }

  .wrapper {
    min-height: 100vh;
    width: 100%;
    padding: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(circle at top left, #d8ecff 0, transparent 40%),
      linear-gradient(135deg, #eaf5ff, #f7fbff);
  }

  .login-container {
    width: 100%;
    max-width: 430px;
    padding: 36px;
    background: #ffffff;
    border: 1px solid #e4efff;
    border-radius: 24px;
    box-shadow: 0 18px 55px rgba(0, 87, 170, 0.12);
    animation: fadeIn 0.5s ease;
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 32px;
  }

  .logo-wrapper {
    width: 82px;
    height: 82px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    background: #edf6ff;
    border-radius: 22px;
  }

  .logo {
    width: 68px;
    height: 68px;
    object-fit: contain;
  }

  .company-name {
    color: #0875d1;
    font-size: 25px;
    font-weight: 800;
    letter-spacing: -0.5px;
  }

  .brand-description {
    margin-top: 5px;
    color: #8192a5;
    font-size: 12px;
  }

  .heading {
    margin-bottom: 25px;
    text-align: center;
  }

  h1 {
    margin: 0 0 8px;
    color: #163b61;
    font-size: 27px;
    font-weight: 800;
  }

  .heading p {
    margin: 0;
    color: #8495a8;
    font-size: 13px;
  }

  .form-group {
    margin-bottom: 18px;
  }

  label {
    display: block;
    margin-bottom: 8px;
    color: #294965;
    font-size: 13px;
    font-weight: 700;
  }

  input {
    width: 100%;
    height: 49px;
    padding: 0 15px;
    border: 1px solid #dce8f5;
    border-radius: 11px;
    outline: none;
    background: #fafdff;
    color: #24445f;
    font-size: 14px;
    transition: 0.2s ease;
  }

  input:focus {
    border-color: #1683df;
    background: #ffffff;
    box-shadow: 0 0 0 3px rgba(22, 131, 223, 0.1);
  }

  input:disabled {
    opacity: 0.65;
  }

  .password-wrapper {
    position: relative;
  }

  .password-wrapper input {
    padding-right: 85px;
  }

  .toggle-password {
    position: absolute;
    top: 50%;
    right: 12px;
    transform: translateY(-50%);
    padding: 6px;
    border: none;
    background: transparent;
    color: #0875d1;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .message {
    margin: 12px 0;
    padding: 11px 13px;
    border-radius: 9px;
    font-size: 12px;
    line-height: 1.5;
  }

  .error-message {
    background: #fff0f0;
    color: #d93636;
  }

  .success-message {
    background: #eafaf0;
    color: #168447;
  }

  .login-button {
    width: 100%;
    min-height: 50px;
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: none;
    border-radius: 11px;
    background: linear-gradient(135deg, #1688e5, #0067c5);
    color: #ffffff;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: 0.2s ease;
  }

  .login-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 18px rgba(0, 103, 197, 0.22);
  }

  .login-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .button-loader,
  .loader {
    width: 19px;
    height: 19px;
    border: 3px solid rgba(255,255,255,0.4);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .loader {
    width: 35px;
    height: 35px;
    border-color: #dceeff;
    border-top-color: #0875d1;
  }

  .register {
    margin-top: 25px;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 5px;
    color: #8495a8;
    font-size: 12px;
  }

  .register a {
    color: #0875d1;
    font-weight: 700;
    text-decoration: none;
  }

  .register a:hover {
    text-decoration: underline;
  }

  .footer {
    margin-top: 30px;
    color: #a0adba;
    font-size: 10px;
    text-align: center;
  }

  .footer span {
    padding: 0 5px;
  }

  .checking {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    color: #42617e;
    font-size: 14px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(15px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 480px) {
    .wrapper {
      padding: 16px;
    }

    .login-container {
      padding: 27px 21px;
      border-radius: 19px;
    }

    .brand {
      margin-bottom: 27px;
    }

    h1 {
      font-size: 24px;
    }

    .logo-wrapper {
      width: 72px;
      height: 72px;
    }

    .logo {
      width: 60px;
      height: 60px;
    }
  }
</style>
