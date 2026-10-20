import fs from "fs";

let code = fs.readFileSync("motion/src/server.ts", "utf8");
code = code.replace(
  'import networkRouter from "./routes/network.js";',
  'import networkRouter from "./routes/network.js";\nimport applicationsRouter from "./routes/applications.js";'
);
code = code.replace(
  'app.use("/api/integrations", requireAuth, integrationsRouter);',
  'app.use("/api/integrations", requireAuth, integrationsRouter);\napp.use("/api/applications", requireAuth, applicationsRouter);'
);

fs.writeFileSync("motion/src/server.ts", code, "utf8");
console.log("server.ts successfully patched");
