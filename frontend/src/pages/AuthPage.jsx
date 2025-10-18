import React, { useState } from "react";
import { useStore } from "../store.js";

// Receive onGuestLogin as a prop from App.jsx
const AuthPage = ({ onGuestLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { setToken } = useStore();

  const handleAuth = async (e) => {
    e.preventDefault();
    setError("");

    const url = isLogin
      ? "http://localhost:8000/api/token"
      : "http://localhost:8000/api/register";

    try {
      if (isLogin) {
        const formData = new URLSearchParams();
        formData.append("username", username);
        formData.append("password", password);

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData,
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Login failed");
        }
        const data = await response.json();
        // setToken will automatically handle connecting and changing the view
        setToken(data.access_token);
      } else {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Registration failed");
        }
        alert("Registration successful! Please log in.");
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-6 bg-slate-700 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center">
          {isLogin ? "Login" : "Register"}
        </h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 mt-1 bg-slate-600 border border-slate-500 rounded-md focus:outline-none focus:ring focus:ring-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 mt-1 bg-slate-600 border border-slate-500 rounded-md focus:outline-none focus:ring focus:ring-indigo-500"
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="w-full btn btn-primary">
            {isLogin ? "Login" : "Create Account"}
          </button>
        </form>
        <div className="text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-indigo-400 hover:underline"
          >
            {isLogin
              ? "Need an account? Register"
              : "Already have an account? Login"}
          </button>
        </div>
        <div className="divider">OR</div>
        {/* Use the passed-in function here */}
        <button onClick={onGuestLogin} className="w-full btn btn-secondary">
          Play as Guest
        </button>
      </div>
    </div>
  );
};

export default AuthPage;
