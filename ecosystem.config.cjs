module.exports = {
  apps: [
    {
      name: "tudo_em_simas_backend",
      script: "npm",
      args: "run start",
      cwd: "/var/www/Tudo_em_SIMAS/server",
      env: {
        NODE_ENV: "production",
      }
    },
    {
      name: "tudo_em_simas_frontend",
      script: "npm",
      args: "run preview -- --host --port 4173",
      cwd: "/var/www/Tudo_em_SIMAS",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
