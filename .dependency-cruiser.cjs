const path = require("node:path");

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "순환 의존성 금지",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: ["node_modules"],
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    // apps/web/tsconfig.json이 @web/*·@server/* 둘 다 매핑해 server도 이걸로 풀린다.
    tsConfig: {
      fileName: path.join(__dirname, "apps/web/tsconfig.json"),
    },
  },
};
