# web-shadow-boxing

## Vercel CI/CD

GitHub Actions workflows:
- `.github/workflows/ci.yml`: runs `npm run test:run` and `npm run build` on PR and `main`.
- `.github/workflows/vercel-deploy.yml`: deploys to Vercel Preview on PR, and Production on `main` push.

Required GitHub repository secrets:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

How to get Vercel IDs:
1. Run `vercel login` locally.
2. Run `vercel link` in this repo once.
3. Read `.vercel/project.json` and copy `orgId`, `projectId` into GitHub secrets.
4. Create `VERCEL_TOKEN` from Vercel account settings.
