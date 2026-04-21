/**
 * Ishtrak Content Script — isolated world (default).
 *
 * Handles FILL_FORM messages from the background for the FORM_FILL strategy.
 */

import { fillAndSubmitForm } from "../src/content/form-filler";
import type { PlatformProfile } from "../src/types/profile";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",

  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type !== "FILL_FORM") return false;

      const { payload, profile } = msg as {
        payload: Parameters<typeof fillAndSubmitForm>[0];
        profile: PlatformProfile;
      };

      fillAndSubmitForm(payload, profile)
        .then(sendResponse)
        .catch((err: Error) => sendResponse({ error: err.message }));

      return true;
    });
  },
});
