import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/cas.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  outfile: "dist-test/cas.js",
});
