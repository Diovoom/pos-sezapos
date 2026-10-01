// Execute ShellApp's actual lifecycle effect with startup delayed across cleanup.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../capacitor-shell/main.tsx"), "utf8");
const ast = ts.createSourceFile(
  "main.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const shell = ast.statements.find(
  (n) => ts.isFunctionDeclaration(n) && n.name?.text === "ShellApp",
);
const effect = shell.body.statements.find(
  (n) =>
    ts.isExpressionStatement(n) &&
    ts.isCallExpression(n.expression) &&
    n.expression.expression.getText(ast) === "useEffect",
).expression.arguments[0];
const compiled = ts.transpileModule(`module.exports = ${effect.getText(ast)}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
async function run(disposeEarly) {
  let release,
    starts = 0,
    stops = 0,
    unsubscribed = 0;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const mocks = {
    initAndroidLifecycle: () => pending,
    startDeviceHeartbeat: () => {
      starts++;
      return () => {
        stops++;
      };
    },
    router: {},
    queryClient: {},
    setReady() {},
    hideNativeSplash: async () => {},
    supabase: {
      auth: {
        onAuthStateChange: () => ({
          data: {
            subscription: {
              unsubscribe() {
                unsubscribed++;
              },
            },
          },
        }),
      },
    },
    window: { addEventListener() {}, removeEventListener() {} },
    require: () => {
      throw new Error("Updater unavailable in test");
    },
  };
  const mod = { exports: null };
  new Function(...Object.keys(mocks), "module", compiled)(...Object.values(mocks), mod);
  const cleanup = mod.exports();
  if (disposeEarly) cleanup();
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(starts, disposeEarly ? 0 : 1);
  if (!disposeEarly) cleanup();
  assert.equal(stops, disposeEarly ? 0 : 1);
  assert.equal(unsubscribed, 1);
}
(async () => {
  await run(true);
  console.log("PASS cleaned-up shell cannot start a late heartbeat");
  await run(false);
  console.log("PASS mounted shell starts heartbeat and cleans up once");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
