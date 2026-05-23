# Use Node.js 20 on lightweight Alpine Linux as base image
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package list and package-lock first to leverage Docker layer caching
COPY package*.json ./

# Install npm dependencies (including devDependencies required for typescript compile and Vite build)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build the production Vite bundle
RUN npm run build

# Expose server port
EXPOSE 3000

# Start server in production mode
CMD ["npm", "run", "start"]
