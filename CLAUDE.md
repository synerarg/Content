@AGENTS.md

# Synera Content Studio

**Read `HANDOFF.md` in this directory before doing any work on this project.**

It contains the architecture, the exact stack decisions and why they were made, live
credential/account state, honest verification status (including one significant gap),
and a list of traps that each cost real debugging time to find — storage RLS policy
form, views bypassing RLS, canvas tainting, font embedding, structured-output length
limits, Storage discarding the content type you pass it, and several Windows/PowerShell
and provider-API quirks.

Phases 0–7 are complete and the app is **live on Vercel**, with Google OAuth configured
and the PNG export confirmed working by hand — that last one was the project's long-
standing unverified gap. Phase 7 added batch recipes, the background queue, published-
history dedup, and the three levels of the Nielsen heuristics audit.

What remains is in the last section of `HANDOFF.md`. Nothing there is blocking; the
largest item is that the background queue's rate-limit path has never met a real run.
`DEPLOY.md` has the deployment steps.
