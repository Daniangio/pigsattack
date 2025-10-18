Browser Card Game - Development SetupThis repository is configured to use VS Code Dev Containers for a one-click, portable, and consistent development environment.Part 1: Onboarding a New DeveloperThis is the guide for anyone joining the project. The process is designed to be as fast as possible.PrerequisitesYou only need to install these three applications on your local (Windows) machine:Docker Desktop: Make sure it's running.Visual Studio Code: The editor.VS Code Dev Containers Extension: Install this from the VS Code Extensions marketplace.That's it. You do not need to install Python, Node.js, or any other tools locally.Getting StartedClone the Repository:git clone <your-repo-url>
cd <your-repo-name>
Open in VS Code:code .
Reopen in Container:VS Code will detect the .devcontainer folder and show a notification in the bottom-right corner: "Folder contains a Dev Container configuration file. Reopen to folder in container."Click the "Reopen in Container" button.The first time you do this, Docker will build the development image. This might take a few minutes. Subsequent launches will be much faster.Once finished, your entire VS Code UI will be connected to the development container. The integrated terminal, debugger, and all extensions will be running inside it.Start the Services:Open the VS Code integrated terminal (Ctrl + ```). You are now inside the container.Run Docker Compose to start the backend, frontend, and Redis services:docker-compose up --build
You're Ready!The application is now running:Frontend (Vite + React): http://localhost:5173Backend (FastAPI): http://localhost:8000Backend API Docs: http://localhost:8000/docsYou can now start editing files. The backend and frontend both have hot-reloading enabled.One-Click DebuggingOpen any file in the backend/app directory (e.g., main.py).Set a breakpoint.Go to the "Run and Debug" tab in VS Code (Ctrl+Shift+D).Select "Python: FastAPI" from the dropdown and click the green play button.The debugger will attach to the running FastAPI server inside the container.Part 2: First-Time Project SetupThis is the guide for the initial project creator. Follow these steps to create the necessary files and configurations. This command-based approach is more reliable than creating files manually.Create Backend Placeholders:Create the backend directory and the necessary placeholder files.mkdir -p backend/app
touch backend/app/main.py
touch backend/requirements.txt
Populate backend/requirements.txt:fastapi
uvicorn[standard]
redis
debugpy
Populate backend/app/main.py:from fastapi import FastAPI
app = FastAPI()
@app.get("/")
def read_root():
return {"Hello": "Backend"}
Scaffold the Frontend with Vite:Run the following command in the project's root directory to create the frontend project.npm create vite@latest frontend -- --template react
Add Tailwind CSS to Frontend:Navigate into the new frontend directory and follow the official Tailwind CSS installation steps for Vite.cd frontend
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
cd ..
This will create tailwind.config.js and postcss.config.js.Configure Frontend for Dev Container:You need to create/modify three files in the frontend directory to finalize the setup.Configure frontend/tailwind.config.js to scan your source files:/** @type {import('tailwindcss').Config} \*/
export default {
content: [
"./index.html",
"./src/**/\*.{js,ts,jsx,tsx}",
],
theme: {
extend: {},
},
plugins: [],
}
Create frontend/vite.config.js to enable hot-reloading inside Docker:import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
plugins: [react()],
server: {
watch: {
usePolling: true,
},
},
})
Overwrite frontend/src/index.css with the Tailwind directives:@tailwind base;
@tailwind components;
@tailwind utilities;
Add Dev Container and Debugger Configs:Create the .devcontainer and .vscode directories and populate them with the devcontainer.json, Dockerfile, and launch.json files from this project's template.Commit to Git:Create a .gitignore file in the root directory before your first commit. You can use the one provided in this project. Now you can initialize your repository and commit the files.git init
git add .
git commit -m "Initial project structure and dev container setup"
