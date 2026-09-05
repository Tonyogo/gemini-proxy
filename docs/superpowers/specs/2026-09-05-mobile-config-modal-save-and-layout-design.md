# Mobile Config Modal Save & Touch Interaction Optimization Design

## Problem Statement
On mobile devices, users modifying runtime configuration in `ConfigModal.tsx` experience two critical issues:
1. **Save button occasionally unresponsive (点击无效)**:
   - When users tap an input field (e.g. Model Mappings, Upstream Timeout, Custom System Instruction), the virtual soft keyboard pops up.
   - Fixed viewport units (`h-[92vh]`) and `sticky bottom-0` do not properly account for dynamic visual viewport resizing.
   - When tapping the bottom "Save & Apply" button while an input is focused, mobile browsers often first trigger an input `blur` event, causing layout jitter and swallowing the `click` event so the user has to tap twice or finds the button unresponsive.
   - In addition, iOS safe area insets (`safe-area-inset-bottom`) are unhandled, so the sticky footer overlaps with the system home indicator / gesture bar on modern iPhones.
2. **Button tap misalignment (按钮点击错位)**:
   - When the modal is open, the background webpage (`document.body`) is not scroll-locked, allowing background inertia scrolling to desynchronize touch coordinates.
   - On the Model Mappings tab, compact buttons (`HIGH`, `Trash2`, strategy select) lack explicit minimum touch target heights (`h-8`), causing mis-clicks on mobile screens.

## User Decisions & Approved Approach
1. **Dual Save Buttons (Top Header + Bottom Footer)**:
   - Add a prominent mobile-only quick Save button in the modal header right next to the close button:
     ```tsx
     <button
       type="button"
       onClick={handleSave}
       disabled={saving}
       className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 sm:hidden shadow-sm active:scale-95 disabled:opacity-50"
     >
       {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
       <span>{saving ? t('config.applying') : t('config.save')}</span>
     </button>
     ```
   - Retain the bottom footer Save button with touch safety padding (`pb-[max(0.875rem,env(safe-area-inset-bottom))]`).
2. **Body Scroll Lock**:
   - When `ConfigModal` is open, lock `document.body.style.overflow = 'hidden'`.
   - Restore previous body overflow style upon unmount/close.
3. **Dynamic Viewport Height Adaptation**:
   - Change modal container height to `h-[92dvh] sm:h-auto sm:max-h-[90vh]` using dynamic viewport height (`dvh`) with `vh` fallback.
4. **Touch Target Sizing in Model Mappings**:
   - Ensure strategy dropdown, `HIGH` toggle, and remove buttons have dedicated min heights and clean padding (`gap-1.5 sm:gap-1`, `h-8`).
5. **Touch & Focus Event Hygiene**:
   - Ensure buttons in the footer have explicit `type="button"` and `type="submit"`, preventing unwanted blur suppression.

## Affected Components
1. `frontend/src/components/ConfigModal.tsx`
2. `tests/configModalOptimization.test.ts` (new or updated assertions)
