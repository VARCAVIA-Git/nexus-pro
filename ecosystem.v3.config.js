module.exports = {
  apps: [
    {
      name: 'nexus-v3-paper',
      script: './scripts/v3-paper-runner.ts',
      interpreter: './node_modules/.bin/tsx',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 100,
      max_memory_restart: '512M',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        TZ: 'UTC',
      },
      out_file: './.v3-state/pm2.out.log',
      error_file: './.v3-state/pm2.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'nexus-v3-evaluator',
      script: './scripts/v3-evaluator.ts',
      interpreter: './node_modules/.bin/tsx',
      cwd: __dirname,
      autorestart: false,
      cron_restart: '0 */6 * * *', // every 6 hours
      env: {
        NODE_ENV: 'production',
        TZ: 'UTC',
      },
      out_file: './.v3-state/pm2-eval.out.log',
      error_file: './.v3-state/pm2-eval.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
