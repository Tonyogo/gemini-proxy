# Admin Config UI: Strip System Fingerprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose `stripSystemFingerprints` in the Admin API config payload and add a toggle switch in the Web Console's configuration modal under the Translation & Context rules tab.

**Architecture:** Include `stripSystemFingerprints` in the `/api/admin/status` and `/api/admin/config` JSON payloads in `adminController.ts`. Update `ConfigModal.tsx` and i18n resources (`zh.ts`, `en.ts`) to display a toggle switch with bilingual explanations and wire it into the config fetch/update lifecycles.

**Tech Stack:** TypeScript, Node.js, Express, React, Tailwind CSS, Vite, Jest.

**Spec:** `docs/superpowers/specs/2026-09-29-admin-ui-strip-fingerprints-design.md`

## Global Constraints

- Default state in UI must be `true` if `data.config.stripSystemFingerprints` is undefined or not `false`.
- The toggle must follow the exact Tailwind UI styling as `SYSTEM_ROLE_TO_INSTRUCTION` in `ConfigModal.tsx`.
- Must support bilingual rendering (`zh` and `en`).
- `npm run build:frontend` and `npm test` must succeed.

## Review Focus

1. **Hot reload reflection**: Updating `stripSystemFingerprints` via POST/PUT `/api/admin/config` returns updated `config.stripSystemFingerprints` in the response body.
2. **Boolean coercion**: Saving `false` correctly persists as a boolean `false` rather than a string or truthy value.
3. **Empty or undefined fallback in UI**: When loading server config where `stripSystemFingerprints` is missing, the UI defaults to `true`.
4. **Layout responsiveness**: The toggle card behaves well on mobile (hiding long secondary description text gracefully like adjacent cards).
5. **No regression in existing config fields**: Updating `stripSystemFingerprints` does not drop or corrupt other runtime configuration keys.

---

### Task 1: Expose `stripSystemFingerprints` in Admin Controller

**Files:**
- Modify: `src/admin/controllers/adminController.ts:12-30,89-106`
- Test: `tests/adminController.test.ts:23-35`

**Interfaces:**
- Produces: `stripSystemFingerprints` in `/api/admin/status` and `/api/admin/config` response `config` object
- Consumes: `config.stripSystemFingerprints` from `config/default.ts`

- [ ] **Step 1: Write failing test in `tests/adminController.test.ts`**

Add assertion in `tests/adminController.test.ts`:
```typescript
test('GET /api/admin/status returns stripSystemFingerprints in config', async () => {
  const res = await request(app).get('/api/admin/status');
  expect(res.status).toBe(200);
  expect(res.body.config).toHaveProperty('stripSystemFingerprints');
  expect(typeof res.body.config.stripSystemFingerprints).toBe('boolean');
});

test('POST /api/admin/config updates stripSystemFingerprints', async () => {
  const updateRes = await request(app)
    .post('/api/admin/config')
    .send({ stripSystemFingerprints: false });
  expect(updateRes.status).toBe(200);
  expect(updateRes.body.config.stripSystemFingerprints).toBe(false);

  // Revert back to true
  const revertRes = await request(app)
    .post('/api/admin/config')
    .send({ stripSystemFingerprints: true });
  expect(revertRes.status).toBe(200);
  expect(revertRes.body.config.stripSystemFingerprints).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/adminController.test.ts -t "stripSystemFingerprints"`
Expected: FAIL (property missing on res.body.config).

- [ ] **Step 3: Modify `src/admin/controllers/adminController.ts`**

Add `stripSystemFingerprints: config.stripSystemFingerprints` in both `getStatus` and `updateConfig` response payload objects:
In `getStatus`:
```typescript
      config: {
        logLevel: config.logLevel,
        geminiBaseUrl: config.geminiBaseUrl,
        geminiBaseUrls: upstreamManager.getBaseUrls(),
        upstreamServers: config.upstreamServers,
        systemRoleToInstruction: config.systemRoleToInstruction,
        stripSystemFingerprints: config.stripSystemFingerprints,
        runtimeContextTag: config.runtimeContextTag,
        ...
```

In `updateConfig`:
```typescript
        config: {
          logLevel: config.logLevel,
          geminiBaseUrl: config.geminiBaseUrl,
          geminiBaseUrls: upstreamManager.getBaseUrls(),
          upstreamServers: config.upstreamServers,
          systemRoleToInstruction: config.systemRoleToInstruction,
          stripSystemFingerprints: config.stripSystemFingerprints,
          runtimeContextTag: config.runtimeContextTag,
          ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/adminController.test.ts -t "stripSystemFingerprints"`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/admin/controllers/adminController.ts tests/adminController.test.ts
git commit -m "feat(admin): expose stripSystemFingerprints in admin config endpoints"
```

---

### Task 2: Add Toggle Switch in Web Console & i18n Translations

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/components/ConfigModal.tsx`

**Interfaces:**
- Produces: UI toggle switch for `STRIP_SYSTEM_FINGERPRINTS` sending `{ stripSystemFingerprints: boolean }` to backend
- Consumes: `stripSystemFingerprints` from `/api/admin/status`

- [ ] **Step 1: Add i18n translation keys in `zh.ts` and `en.ts`**

In `frontend/src/i18n/locales/zh.ts` under `config`:
```typescript
    stripFingerprintsTitle: "STRIP_SYSTEM_FINGERPRINTS",
    stripFingerprintsDesc: "自动过滤 Claude 系统提示词指纹（包括 x-anthropic-billing-header 整段丢弃、身份中性化及 Git 署名剥离）。",
```

In `frontend/src/i18n/locales/en.ts` under `config`:
```typescript
    stripFingerprintsTitle: "STRIP_SYSTEM_FINGERPRINTS",
    stripFingerprintsDesc: "Automatically strip Claude system prompt fingerprints (drop x-anthropic-billing-header blocks, neutralize identity, remove git attributions).",
```

- [ ] **Step 2: Add state and toggle in `frontend/src/components/ConfigModal.tsx`**

1. Add state variable:
```typescript
const [stripSystemFingerprints, setStripSystemFingerprints] = useState<boolean>(true);
```

2. In fetch/load handler:
```typescript
setStripSystemFingerprints(data.config.stripSystemFingerprints !== false);
```

3. In save handler payload:
```typescript
await updateConfig({
  ...
  systemRoleToInstruction,
  stripSystemFingerprints,
  ...
});
```

4. In JSX Tab 3 (Translation & Context Rules), immediately below the `SYSTEM_ROLE_TO_INSTRUCTION` toggle card:
```tsx
                    {/* STRIP_SYSTEM_FINGERPRINTS Toggle Switch */}
                    <div className="ui-card-sub p-3 sm:p-4 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold text-slate-200 block">{t('config.stripFingerprintsTitle')}</span>
                        <p className="hidden sm:block text-[10px] text-slate-400 mt-0.5">{t('config.stripFingerprintsDesc')}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setStripSystemFingerprints(!stripSystemFingerprints)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          stripSystemFingerprints ? 'bg-emerald-500' : 'bg-slate-800'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            stripSystemFingerprints ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
```

- [ ] **Step 3: Build frontend and run full tests**

Run: `npm run build:frontend`
Expected: Vite build succeeds with 0 errors.

Run: `npm test`
Expected: 100% test suites pass.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts frontend/src/components/ConfigModal.tsx
git commit -m "feat(ui): add stripSystemFingerprints toggle switch in config modal"
```
