# Use a Microsoft-provided base image that includes Python, Node.js, and common dev tools.
FROM mcr.microsoft.com/devcontainers/python:3.11-bullseye

# --- MODIFICATION ---
# By switching the user to root, we ensure that 'pip install' writes
# to the global site-packages directory. This makes the executables (like uvicorn)
# available system-wide in the container's PATH, solving the 'command not found' error.
# For a development container, this simplifies permission management significantly.
USER root

# The base image already has Python, pip, Node, and npm.
# We can add any other system-level dependencies here if needed later.
# For example:
# RUN apt-get update && apt-get install -y postgresql-client