/**
 * Terms of use: the acceptance gate, and the readable page behind it.
 *
 * The text lives here once and is used by both, so the wording a visitor
 * agreed to and the wording they can re-read later cannot drift apart.
 *
 * Deliberately no network call. The gate has to render before any data is
 * requested and must still appear when the API is unreachable — fetching the
 * terms would mean an outage silently drops the notice.
 *
 * NOT LEGAL ADVICE. This is a scaffold written by an engineer, not a lawyer.
 * Have it reviewed before relying on it, and fill in the placeholders below.
 */

// ---------------------------------------------------------------------------
// Fill these in. They are deliberately obvious so an unreviewed deployment is
// visible rather than silently wrong.
// ---------------------------------------------------------------------------

/** Who operates this instance. Shown as the party the terms are with. */
const OPERATOR = "the operator of this site";

/** Where to send questions. An address here will be scraped; use a form or an alias. */
const CONTACT = "[contact address — to be completed]";

/** Governing law. Ask a lawyer; the right answer depends on where you are. */
const JURISDICTION = "[governing jurisdiction — to be completed]";

/**
 * Bump when the terms change materially. Everyone is asked to accept again,
 * which is the point: consent to v1 is not consent to v2.
 */
export const TERMS_VERSION = "1.0";

const STORAGE_KEY = "drugdiscovery.terms";

// ---------------------------------------------------------------------------
// The terms
// ---------------------------------------------------------------------------

/** The short form, shown in the gate above the full text. */
export const SUMMARY = [
  "This is a research and education tool. It is not medical advice.",
  "It is not a medical device and has not been reviewed by any regulator.",
  "Never use it to diagnose, treat, or make a decision about any person.",
];

/**
 * The full terms, as HTML.
 *
 * Static markup with no interpolation of anything a visitor controls, so there
 * is nothing here to escape.
 */
export function termsHtml() {
  return `
<section class="legal">
  <h3>1. What this is, and what it is not</h3>
  <p>
    This site presents an interconnected view of published biomedical data —
    diseases, therapeutics, molecular targets, chemical structures, pathways,
    trials and literature. It exists for <strong>scientific research and
    education only</strong>.
  </p>
  <p class="legal-strong">
    It is not medical advice, and nothing on it is a substitute for the
    judgement of a qualified healthcare professional.
  </p>
  <p>
    Using this site creates no doctor–patient relationship, no clinician–patient
    relationship, and no professional relationship of any kind between you and
    ${OPERATOR}.
  </p>

  <h3>2. Not a medical device</h3>
  <p>
    This software is <strong>not a medical device</strong>. It has not been
    cleared, approved, certified or otherwise reviewed by the FDA, the EMA, the
    MHRA, or any other regulatory authority. It is not intended for the
    diagnosis, cure, mitigation, treatment or prevention of disease, and it must
    not be used for those purposes.
  </p>
  <p>
    It is not validated for clinical use and must not be relied on in clinical
    care, in prescribing, in dosing, or in any decision affecting a real person.
  </p>

  <h3>3. Do not act on this information</h3>
  <ul>
    <li>Always seek the advice of a qualified healthcare professional with any
        question about a medical condition or a medicine.</li>
    <li>Never disregard professional medical advice, or delay seeking it,
        because of something you read here.</li>
    <li>Never start, stop or change any treatment based on this site.</li>
    <li><strong>In an emergency, contact your local emergency services
        immediately.</strong> Do not use this site.</li>
  </ul>

  <h3>4. The data comes from third parties</h3>
  <p>
    Records are aggregated from public sources, each retaining its own licence
    and terms, which you are responsible for observing if you reuse the data.
    The evidence level shown with each relationship describes the strength of
    the underlying source — it is not an endorsement or a recommendation.
  </p>
  <p>
    Data may be <strong>incomplete, outdated, mis-mapped or simply wrong</strong>.
    It is presented as retrieved and is not independently verified, and coverage
    is partial by construction: an absence here is not evidence of absence.
  </p>

  <h3>5. Automatically generated content</h3>
  <p>
    Where this site produces generated prose or summaries, that output is
    produced by a language model. It may be inaccurate, may misrepresent the
    records it cites, and <strong>may state things that are not true</strong>.
    Treat the retrieved source records as the material, and the generated text
    as a convenience over them. Verify anything before relying on it.
  </p>

  <h3>6. Do not submit personal or patient data</h3>
  <p>
    Do not enter personal health information, identifiable patient data, or any
    confidential information into this site, including into any search or
    assistant feature. It is not designed, secured or operated as a system for
    handling such data, and no undertaking is given regarding its protection.
  </p>

  <h3>7. No warranty</h3>
  <p>
    This site is provided <strong>“as is” and “as available”, without warranty
    of any kind</strong>, whether express, implied or statutory, including
    without limitation any implied warranty of merchantability, fitness for a
    particular purpose, accuracy, completeness, currency, title or
    non-infringement. No warranty is given that it will be uninterrupted,
    error-free, or that any defect will be corrected.
  </p>

  <h3>8. Limitation of liability</h3>
  <p>
    To the maximum extent permitted by applicable law, ${OPERATOR} and any
    contributor shall not be liable for any direct, indirect, incidental,
    special, consequential, punitive or exemplary damages, nor for any loss of
    profits, data, goodwill, or for any personal injury or death, arising out of
    or in connection with your use of, or inability to use, this site or
    anything obtained through it — whether based in contract, tort (including
    negligence), strict liability or otherwise, and whether or not the
    possibility of such damage was advised.
  </p>
  <p class="legal-note">
    Some jurisdictions do not allow the exclusion of certain warranties or the
    limitation of liability for personal injury, death, fraud, or gross
    negligence. Nothing here excludes or limits liability where the law does not
    permit it, and in that case liability is limited to the least extent the law
    allows.
  </p>

  <h3>9. Your responsibility</h3>
  <p>
    You are responsible for how you use this site and for anything you do with
    what you find on it. You agree to use it lawfully, and not to present its
    output as clinical guidance to anyone. To the extent permitted by law, you
    agree to indemnify and hold harmless ${OPERATOR} against claims arising from
    your use of the site or your breach of these terms.
  </p>

  <h3>10. Availability and changes</h3>
  <p>
    This is a research project. It may change, break, or be withdrawn at any
    time, without notice, and there is no undertaking to preserve any data or
    to keep it available. These terms may be revised; material revisions will
    ask you to accept again.
  </p>

  <h3>11. Governing law</h3>
  <p>
    These terms are governed by the laws of ${JURISDICTION}, without regard to
    conflict-of-law rules.
  </p>

  <h3>12. Contact</h3>
  <p>Questions about these terms: ${CONTACT}</p>

  <p class="legal-note">
    Terms version ${TERMS_VERSION}.
  </p>
</section>`;
}

// ---------------------------------------------------------------------------
// Acceptance
// ---------------------------------------------------------------------------

/**
 * Whether this browser has accepted the current version.
 *
 * Wrapped because storage throws rather than returning null in Safari's
 * private mode and wherever cookies are blocked; a visitor with storage
 * disabled should see the gate every visit, not a broken page.
 */
export function hasAccepted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    return JSON.parse(raw).version === TERMS_VERSION;
  } catch {
    return false;
  }
}

function recordAcceptance() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: TERMS_VERSION, at: new Date().toISOString() }),
    );
  } catch {
    /* storage unavailable — the gate simply reappears next visit */
  }
}

/** Clear the record, so the gate is shown again. Used by the terms page. */
export function revokeAcceptance() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** When acceptance was recorded, or null. */
export function acceptedAt() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw).at || null : null;
  } catch {
    return null;
  }
}

/**
 * Block until the terms are accepted.
 *
 * Resolves immediately when this browser has already accepted the current
 * version. This is a notice-and-consent gate, not a security control: it
 * governs the UI only, and the API is separately public.
 */
export function requireAcceptance() {
  if (hasAccepted()) return Promise.resolve();

  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;

    const backdrop = document.createElement("div");
    backdrop.className = "gate-backdrop";
    backdrop.innerHTML = `
      <div class="gate" role="dialog" aria-modal="true"
           aria-labelledby="gate-title" aria-describedby="gate-summary">
        <div class="gate-head">
          <h2 id="gate-title">Before you continue</h2>
          <p id="gate-summary" class="gate-summary">
            ${SUMMARY.map((line) => `<span>${line}</span>`).join("")}
          </p>
        </div>

        <div class="gate-body" tabindex="0">${termsHtml()}</div>

        <div class="gate-foot">
          <label class="gate-check">
            <input type="checkbox" id="gate-agree" />
            <span>I have read and agree to these terms. I understand this is a
                  research and education tool, that it is not medical advice,
                  and that I must not use it to make decisions about any
                  person's care.</span>
          </label>
          <div class="gate-actions">
            <button id="gate-decline" class="sm" type="button">Decline</button>
            <button id="gate-accept" class="primary" type="button" disabled>
              Agree and continue
            </button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    document.body.classList.add("gated");

    const agree = backdrop.querySelector("#gate-agree");
    const accept = backdrop.querySelector("#gate-accept");
    const decline = backdrop.querySelector("#gate-decline");
    const dialog = backdrop.querySelector(".gate");

    agree.addEventListener("change", () => {
      accept.disabled = !agree.checked;
    });

    accept.addEventListener("click", () => {
      if (!agree.checked) return;
      recordAcceptance();
      backdrop.remove();
      document.body.classList.remove("gated");
      document.removeEventListener("keydown", trap, true);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
      resolve();
    });

    decline.addEventListener("click", () => {
      // Declining has to actually mean something, so the app is not revealed.
      dialog.innerHTML = `
        <div class="gate-head">
          <h2>Terms not accepted</h2>
        </div>
        <div class="gate-body">
          <p>You have not accepted the terms, so this tool is not available.</p>
          <p>If you reached this by mistake, reload the page to see them again.</p>
        </div>`;
    });

    // Keep focus inside the dialog: a keyboard user must not be able to tab
    // into the application sitting behind it. Escape deliberately does nothing
    // — dismissing the notice without a decision is the one exit not offered.
    function trap(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialog.querySelectorAll(
        'button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trap, true);

    // Focus the scrollable text rather than the checkbox: the reasonable
    // default is to read, and a screen reader should start at the top.
    backdrop.querySelector(".gate-body").focus();
  });
}

// ---------------------------------------------------------------------------
// The readable page
// ---------------------------------------------------------------------------

/** Route view: the same terms, re-readable at any time. */
export function termsView(host) {
  const at = acceptedAt();
  host.innerHTML = `
    <div class="page-head">
      <h2>Terms &amp; disclaimer</h2>
      <p class="lede">
        The terms you accepted to use this site. They apply to every part of it.
      </p>
    </div>
    ${
      at
        ? `<div class="notice notice-info"><span class="ico">✓</span>
             <div>Accepted version ${TERMS_VERSION} on
             ${new Date(at).toLocaleString()}.
             <button id="terms-revoke" class="sm">Withdraw acceptance</button>
             </div></div>`
        : ""
    }
    ${termsHtml()}`;

  host.querySelector("#terms-revoke")?.addEventListener("click", () => {
    revokeAcceptance();
    window.location.reload();
  });
}
