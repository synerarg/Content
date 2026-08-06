@AGENTS.md

# Synera Content Studio

**Read `HANDOFF.md` in this directory before doing any work on this project.**

It contains the architecture, the exact stack decisions and why they were made, live
credential/account state, honest verification status (including one significant gap),
and a list of traps that each cost real debugging time to find — storage RLS policy
form, views bypassing RLS, canvas tainting, font embedding, structured-output length
limits, Storage discarding the content type you pass it, and several Windows/PowerShell
and provider-API quirks.

Phases 0–6 of the build plan are complete. What remains is listed in the last section of
`HANDOFF.md` and needs the account owner: Google OAuth credentials, the Vercel project,
and confirming the PNG export by hand. `DEPLOY.md` has the deployment steps.
