import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    Build output directory, overridable per invocation.

    `next build` deletes and rewrites its output directory. Run against `.next`
    while `next dev` is serving from the same folder, and every chunk reference
    the dev server holds goes stale — the app starts 500ing with
    `Cannot find module './331.js'`, which looks like an application bug and is
    not one. This has cost real debugging time at least once.

    Setting NEXT_DIST_DIR sends a build somewhere else entirely, cache included
    (the build cache lives inside this directory), so a verification build can
    run while the dev server keeps working:

        NEXT_DIST_DIR=.next-build npm run build

    Unset — which is the case on Vercel and in `next dev` — it stays `.next`,
    so nothing about the deployed build changes.
  */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
