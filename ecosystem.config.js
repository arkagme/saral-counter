module.exports = {
  apps: [
    {
      name: "saral-user-tracker",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "512M",
    },
  ],
};
