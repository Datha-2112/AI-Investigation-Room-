# AI Mystery Room

A fictional, single-player investigation game built with React, Express, MongoDB, and Google Gemini. The Gemini API key stays on the server. Generation is blueprint-first; private solution fields and clue references are withheld until an accusation is submitted.

## Run locally

1. Install Node.js 20+ and MongoDB (local or Atlas).
2. Copy `.env.example` to `server/.env` and set `MONGODB_URI`, `JWT_SECRET`, and `GEMINI_API_KEY`.
3. Set `GEMINI_TEXT_MODEL` to a model enabled for your Gemini API key. Set an image-capable `GEMINI_IMAGE_MODEL`.
4. From the repository root run `npm install`.
5. Run `npm run dev`.
6. Open http://localhost:5173, register, and create a case.
7. Run `npm test`, `npm run lint`, and `npm run build` for checks.
8. Run `npm run gen:case` to generate a blueprint from the CLI (provide `SCENARIO`, `DIFFICULTY`, and `TONE` in the environment).

The API listens on port 5000 by default. Media is stored under `server/uploads` when `UPLOAD_DIR=./uploads` is set in `server/.env`. CCTV currently uses generated stills presented as timestamped keyframes. Video generation is optional and disabled by default.

## Configuration and limitations

See `.env.example` for server settings. S3 storage and optional generated video are configuration placeholders and are not implemented; use local storage and CCTV keyframes. Sensitive-seed screening relies on Gemini safety behavior and must be reviewed before production deployment. Generation requires valid Gemini text and image access; cases fail cleanly when the pipeline cannot produce the minimum media or pass the independent solvability check.

## Project notes

See [spec.md](./spec.md) for the full product and technical specification and [DECISIONS.md](./DECISIONS.md) for implementation assumptions.
