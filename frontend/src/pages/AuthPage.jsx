import React, { useState } from "react";
import { useStore } from "../store";

const AuthPage = ({ onGuestLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setToken } = useStore();

  const handleAuth = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const url = isLogin
      ? "http://localhost:8000/api/token"
      : "http://localhost:8000/api/register";
      
    try {
      if (isLogin) {
        // --- Login ---
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
        setToken(data.access_token);
        // setToken will update the view and trigger navigation
      } else {
        // --- Register ---
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Registration failed");
        }
        // On successful registration, switch to login tab
        // and show a success message (clears error)
        setError("Registration successful! Please log in.");
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
        <h1 className="text-3xl font-bold text-center text-orange-400">
          {isLogin ? "Log In" : "Register"}
        </h1>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 mt-1 bg-gray-700 border border-gray-600 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 mt-1 bg-gray-700 border border-gray-600 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>
          
          {error && (
            <p className={`text-sm ${error.includes("successful") ? 'text-green-400' : 'text-red-400'}`}>
              {error}
            </p>
          )}

          <button 
            type="submit" 
            className="w-full py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-md shadow-lg transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? 'Processing...' : (isLogin ? "Login" : "Create Account")}
          </button>
        </form>
        
        <div className="text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            className="text-sm text-orange-400 hover:underline hover:text-orange-300"
            disabled={loading}
          >
            {isLogin
              ? "Need an account? Register"
              : "Already have an account? Login"}
          </button>
        </div>

        <div className="relative flex items-center justify-center py-2">
          <div className="flex-grow border-t border-gray-600"></div>
          <span className="flex-shrink mx-4 text-xs font-medium text-gray-400 uppercase">Or</span>
          <div className="flex-grow border-t border-gray-600"></div>
        </div>
        
        <button 
          onClick={onGuestLogin} 
          className="w-full py-2 px-4 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-md shadow-lg transition duration-200 ease-in-out disabled:opacity-50"
          disabled={loading}
        >
          Play as Guest
        </button>
      </div>
    </div>
  );
};

export default AuthPage;