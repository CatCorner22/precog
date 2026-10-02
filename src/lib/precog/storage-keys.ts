/**
 * The keys this browser keeps a business under. A leaf module: the crash
 * screen and the workspace storage read these without loading the business
 * engine that practice-profile.ts brings with it.
 */

/** Every business this device knows about, in full, keyed by id. */
export const PORTFOLIO_KEY = "precog.portfolio.v1";
/** The business open in this browser: what a reload comes back to. */
export const ACTIVE_PROFILE_KEY = "precog.practiceProfile.v2";
/** The open business as versions before v2 kept it; read, never written. */
export const LEGACY_PROFILE_KEY = "precog.practiceProfile.v1";
