# Fire Alarm Deficiency Manager

A mobile-first Progressive Web App (PWA) for Android and iPhone. It supports technician accounts, a maximum of three technicians per report, live deficiency updates, private photo uploads, labor estimates, and PDF closeout.

## Included
- Responsive browser app; installable from Android Chrome or iPhone Safari.
- Supabase email/password authentication.
- Property reports with share/join codes.
- Maximum three technicians per report (enforced by database join function).
- Live updates for deficiencies, team membership, and report status.
- Camera/file photo selection and private cloud storage.
- Editable labor allowances and calculated estimated hours.
- Scope-of-work draft and PDF export.

## Setup (one-time)
1. Create a project at https://supabase.com/.
2. In the Supabase dashboard, open **SQL Editor**, create a new query, paste all of `supabase_schema.sql`, and run it.
3. In **Project Settings → API** (or API Keys), copy the Project URL and the public anon/publishable key. Never use the `service_role` / secret key in the app.
4. Host this folder on an HTTPS static host. GitHub Pages is one option:
   - Create a new GitHub repository.
   - Upload `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, and `supabase_schema.sql`.
   - In repository Settings → Pages, deploy from the main branch/root.
5. Open the HTTPS site. Paste the Supabase URL and public key into the connection screen.
6. Create an account for each technician. If email confirmation is enabled, each person must confirm their email and then sign in.
7. The report creator creates a property report and shares its join code with up to two other technicians. They sign in and use **Join an existing report**.

## Install on phones
- Android: open the HTTPS app URL in Chrome → menu (⋮) → **Install app** or **Add to Home screen**.
- iPhone/iPad: open the HTTPS app URL in Safari → Share → **Add to Home Screen**.

## Important behavior and limitations
- HTTPS is required for installability and camera access.
- Realtime collaboration requires internet access. The app shell can be cached, but this first version does not queue offline edits or photos.
- PDF generation uses the browser's jsPDF library. Keep an internet connection when opening the app so the library can load.
- Labor estimates are configurable planning allowances entered per deficiency; they are not guaranteed field durations or code requirements.
- The app is a starter release. Before production use, add company branding, a formal technician profile/directory, audit history, stronger report closeout locking, retention/backup rules, and company-specific labor standards.
- Use a test property and test devices first. This app does not perform fire alarm programming, testing, impairment notification, or AHJ approval.

## Troubleshooting
- "Invalid API key": confirm you used the public anon/publishable key for the same Supabase project URL.
- "Email not confirmed": click the confirmation email link, then sign in.
- "Report code not found": check the code and ensure the report exists in the same project.
- Photo upload errors: check the SQL storage bucket and policies were created successfully; use JPG or PNG if the phone produces an unsupported HEIC file.
