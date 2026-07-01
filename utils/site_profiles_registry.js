// Workspace Manager - Site Profiles Registry
// Manages website selector configurations in local storage

(function (global) {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  const SiteProfilesRegistry = {
    profiles: {},

    // Load profiles from storage
    async load() {
      return new Promise((resolve) => {
        if (!chromeAPI || !chromeAPI.storage || !chromeAPI.storage.local) {
          console.warn("[SiteProfilesRegistry] Storage API not available. Using empty profiles.");
          this.profiles = {};
          resolve();
          return;
        }

        chromeAPI.storage.local.get("siteProfiles", (data) => {
          this.profiles = data.siteProfiles || {};
          console.log(`[SiteProfilesRegistry] Loaded ${Object.keys(this.profiles).length} profiles.`);
          resolve();
        });
      });
    },

    // Save profiles to storage
    async save() {
      return new Promise((resolve, reject) => {
        if (!chromeAPI || !chromeAPI.storage || !chromeAPI.storage.local) {
          console.warn("[SiteProfilesRegistry] Storage API not available. Save aborted.");
          resolve();
          return;
        }

        chromeAPI.storage.local.set({ siteProfiles: this.profiles }, () => {
          if (chromeAPI.runtime.lastError) {
            reject(new Error(chromeAPI.runtime.lastError.message));
          } else {
            console.log("[SiteProfilesRegistry] Profiles saved successfully.");
            resolve();
          }
        });
      });
    },

    // Matches a tab's URL hostname to find the correct profile
    getProfileForUrl(url) {
      if (!url) return null;
      try {
        const parsedUrl = new URL(url);
        const host = parsedUrl.hostname.toLowerCase();
        
        for (const name in this.profiles) {
          const profile = this.profiles[name];
          if (profile.domain && host.includes(profile.domain.toLowerCase())) {
            return profile;
          }
        }
      } catch (e) {
        console.error("[SiteProfilesRegistry] Error parsing URL:", e);
      }
      return null;
    },

    // Returns all profiles as an array
    getAllProfiles() {
      return Object.values(this.profiles);
    },

    // Validates and adds or updates a site profile
    async addOrUpdateProfile(profileObj) {
      if (!profileObj.siteName || !profileObj.domain || !profileObj.selectors) {
        throw new Error("Invalid profile: Must contain siteName, domain, and selectors.");
      }
      
      const requiredSelectors = ["inputSelector", "sendButtonSelector", "messageTurnSelector"];
      for (const sel of requiredSelectors) {
        if (!profileObj.selectors[sel]) {
          throw new Error(`Invalid selectors: Missing required selector "${sel}".`);
        }
      }

      // Add to local map (convert keys if necessary)
      const key = profileObj.siteName.toLowerCase().replace(/\s+/g, '');
      this.profiles[key] = {
        siteName: profileObj.siteName,
        domain: profileObj.domain,
        newChatUrl: profileObj.newChatUrl || "/",
        selectors: {
          inputSelector: profileObj.selectors.inputSelector,
          sendButtonSelector: profileObj.selectors.sendButtonSelector,
          newChatButtonSelector: profileObj.selectors.newChatButtonSelector || "",
          copyButtonSelector: profileObj.selectors.copyButtonSelector || "",
          userCopyButtonSelector: profileObj.selectors.userCopyButtonSelector || "",
          stopButtonSelector: profileObj.selectors.stopButtonSelector || "",
          messageTurnSelector: profileObj.selectors.messageTurnSelector
        },
        flags: {
          useEnterFallback: !!(profileObj.flags && profileObj.flags.useEnterFallback),
          postSubmitDelayMs: parseInt(profileObj.flags && profileObj.flags.postSubmitDelayMs, 10) || 0
        }
      };

      await this.save();
      return this.profiles[key];
    },

    // Deletes a site profile
    async deleteProfile(siteName) {
      const key = siteName.toLowerCase().replace(/\s+/g, '');
      if (this.profiles[key]) {
        delete this.profiles[key];
        await this.save();
        return true;
      }
      return false;
    }
  };

  // Export to global context
  global.SiteProfilesRegistry = SiteProfilesRegistry;
})(typeof self !== 'undefined' ? self : this);
