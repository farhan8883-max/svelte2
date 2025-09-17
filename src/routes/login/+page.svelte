<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { goto } from "$app/navigation";

  let email = "";
  let password = "";
  let message = "";

  async function login() {
    if (!email || !password) {
      message = "Email dan password wajib diisi";
      return;
    }

    const password_hash = btoa(password);

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("password_hash", password_hash)
      .single();

    if (error || !data) {
      message = "Email atau password salah";
      return;
    }

    message = "Login berhasil!";
    localStorage.setItem("user", JSON.stringify(data));

    if (data.role === "admin") {
      goto("/dashboard");
    } else {
      goto("/santri");
    }
  }
</script>

<div class="wrapper">
  <div class="login-container">
  <div class="brand">
    <img src="/logo.png" alt="Logo" class="logo" />
    <span class="company-name">Daarulhikam</span>
  </div>

  <div class="login-box">
    <h1>Login</h1>
    <input type="email" placeholder="Email" bind:value={email} />
    <input type="password" placeholder="Password" bind:value={password} />
    <button on:click={login}>Login</button>
    <p class="message">{message}</p>

    <p class="register">
      Belum punya akun? <a href="/register">Daftar di sini</a>
    </p>
  </div>
</div>
</div>

<style>
  body {
    margin: 0;
    font-family: "Poppins", sans-serif;
    background: linear-gradient(135deg, #cce7ff, #e6f4ff);
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
  }

  .login-container {
    background: #ffffff;
    padding: 2rem 3rem;
    border-radius: 20px;
    box-shadow: 0 10px 25px rgba(0, 123, 255, 0.2);
    width: 350px;
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

  input {
    width: 100%;
    padding: 10px 14px;
    margin: 8px 0;
    border: 1px solid #cce0ff;
    border-radius: 10px;
    font-size: 1rem;
    outline: none;
    transition: all 0.3s ease;
  }

  input:focus {
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

  .register {
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .register a {
    color: #007bff;
    text-decoration: none;
    font-weight: bold;
  }

  .register a:hover {
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
