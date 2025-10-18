import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

function App() {
  // We've wrapped the h1 in a div and applied Tailwind classes
  return (
    <div className="bg-slate-800 text-white min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">Card Game Frontend is Running!</h1>
      <p className="text-slate-400 mt-2">Tailwind CSS is working.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
