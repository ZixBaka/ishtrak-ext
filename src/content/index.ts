/**
 * Ishtrak Content Script — isolated world entry point.
 *
 * Handles FILL_FORM messages from the background for the FORM_FILL strategy.
 */

import { fillAndSubmitForm } from "./form-filler";
import type { PlatformProfile } from "../types/profile";

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
