# Admin Config UI: Strip System Fingerprints Toggle Spec

**Goal:** Add a UI toggle switch in the Admin Web Console configuration modal allowing administrators to view and toggle `STRIP_SYSTEM_FINGERPRINTS` live with persistence.

## Architecture & Requirements

1. **Backend Integration (`src/admin/controllers/adminController.ts`)**:
   - Include `stripSystemFingerprints: config.stripSystemFingerprints` in `/api/admin/status` response.
   - Include `stripSystemFingerprints: config.stripSystemFingerprints` in `/api/admin/config` (POST/PUT update) response.

2. **Frontend UI Integration (`frontend/src/components/ConfigModal.tsx`)**:
   - Add state: `stripSystemFingerprints` (boolean, default true).
   - In initialization/fetch: parse `stripSystemFingerprints !== false`.
   - In save handler: pass `stripSystemFingerprints` to `updateConfig` API call.
   - In UI: Add a sleek toggle under Tab 3 (Translation & Context Rules), adjacent to `SYSTEM_ROLE_TO_INSTRUCTION`.

3. **Internationalization (`frontend/src/i18n/locales/`)**:
   - `zh.ts`: Add `stripFingerprintsTitle` and `stripFingerprintsDesc`.
   - `en.ts`: Add `stripFingerprintsTitle` and `stripFingerprintsDesc`.
