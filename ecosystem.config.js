module.exports = {
  apps: [
    {
      name: 'nexus-web',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '500M',
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: 'nexus-cron',
      script: 'src/workers/cron-worker.js',
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
