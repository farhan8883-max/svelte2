<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  let full_name = "";
  let username = "";
  let email = "";
  let password = "";
  let role = "santri"; // default
  let message = "";

  async function register() {
    if (!full_name || !username || !email || !password) {
      message = "Semua field wajib diisi";
      return;
    }

    const password_hash = btoa(password);

    const { error } = await supabase
      .from("users")
      .insert([{ full_name, username, email, password_hash, role }]);

    if (error) {
      message = "Gagal daftar: " + error.message;
    } else {
      message = "Registrasi berhasil, silakan login.";
      full_name = "";
      username = "";
      email = "";
      password = "";
      role = "santri";
    }
  }
</script>

<div class="wrapper">
  <div class="register-container">
  <div class="brand">
    <img src="/logo.png" alt="Logo" class="logo" />
    <span class="company-name">Daarulhikam</span>
  </div>

  <div class="register-box">
    <h1>Register</h1>
    <input placeholder="Nama Lengkap" bind:value={full_name} />
    <input placeholder="Username" bind:value={username} />
    <input type="email" placeholder="Email" bind:value={email} />
    <input type="password" placeholder="Password" bind:value={password} />

    <select bind:value={role}>
      <option value="santri">Santri</option>
      <option value="admin">Admin</option>
    </select>

    <button on:click={register}>Daftar</button>
    <p class="message">{message}</p>

    <p class="login-link">
      Sudah punya akun? <a href="/login">Login di sini</a>
    </p>
  </div>
</div>
</div>

<style>
  body {
    margin: 0;
    font-family: "Poppins", sans-serif;
    background: linear-gradient(135deg, #cce7ff, #e6f4ff);
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .register-container {
    background: #ffffff;
    padding: 2rem 3rem;
    border-radius: 20px;
    box-shadow: 0 10px 25px rgba(0, 123, 255, 0.2);
    width: 380px;
    text-align: center;
    animation: fadeIn 0.7s ease;
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .brand .logo {
    width: 70px;
    height: 70px;
    margin-bottom: 10px;
  }

  .brand .company-name {
    font-size: 1.4rem;
    font-weight: bold;
    color: #007bff;
  }

  h1 {
    color: #007bff;
    margin-bottom: 1rem;
  }

  input,
  select {
    width: 100%;
    padding: 10px 14px;
    margin: 8px 0;
    border: 1px solid #cce0ff;
    border-radius: 10px;
    font-size: 1rem;
    outline: none;
    transition: all 0.3s ease;
  }

  input:focus,
  select:focus {
    border-color: #007bff;
    box-shadow: 0 0 8px rgba(0, 123, 255, 0.3);
  }

  button {
    width: 100%;
    padding: 12px;
    margin-top: 12px;
    border: none;
    border-radius: 10px;
    background: #007bff;
    color: white;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.3s ease, transform 0.2s ease;
  }

  button:hover {
    background: #0056b3;
    transform: scale(1.02);
  }

  .message {
    margin-top: 10px;
    color: red;
    font-size: 0.9rem;
  }

  .login-link {
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .login-link a {
    color: #007bff;
    text-decoration: none;
    font-weight: bold;
  }

  .login-link a:hover {
    text-decoration: underline;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}
</style>
