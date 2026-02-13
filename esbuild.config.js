const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: "node24",
    outfile: "dist/index.js",
    format: "cjs",
    // Size optimizations
    minify: true,
    treeShaking: true,
    legalComments: "none",
    keepNames: false,
    // External packages that shouldn't be bundled (keep native modules external)
    external: [],
    // Source maps (optional, can be removed for smaller size)
    sourcemap: false,
    // Additional optimizations
    metafile: true,
    logLevel: "info",
  })
  .then((result) => {
    if (result.metafile) {
      console.log("\nBuild analysis:");
      console.log(
        "Output size:",
        Object.values(result.metafile.outputs)[0].bytes,
        "bytes",
      );
    }
  })
  .catch(() => process.exit(1));
