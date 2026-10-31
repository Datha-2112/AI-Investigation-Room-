# Implementation decisions

- The repository was empty except for `spec.md`; the project is scaffolded as npm workspaces (`server` and `client`).
- MongoDB is the sole source of persisted users, cases, evidence, and attempts. The generation worker is an in-process queue, as allowed for v1.
- Case text and blueprint generation are fail-closed when Gemini is unavailable. The image adapter reports generation failure and the case only becomes playable if the specified minimum media succeeds; no fabricated evidence is used.
- CCTV uses still keyframes in v1. `ENABLE_VIDEO` remains opt-in; video generation is not silently substituted for keyframes.
- Password recovery, email verification, guest play, and account profile editing are outside the v1 spec.

- The first implementation does not yet include S3 storage, optional video, media placeholders, automatic full-pipeline regeneration, or a Playwright end-to-end test. These remain explicit follow-up work rather than simulated features.
- Gemini safety depends on provider defaults; a dedicated seed moderation stage and comprehensive refusal tests are still required before production use.
- Account deletion is available through the protected API endpoint but is not yet exposed in the interface.
