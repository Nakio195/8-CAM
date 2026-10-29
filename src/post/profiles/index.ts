// Post-processor profiles shipped with pcbCAM (specification 6.8), from FlatCAM preprocessors GRBL_11.py, Marlin.py
// and default.py, and for the Snapmaker Artisan from Snapmaker sources (Artisan-Controller firmware, Artisan screen app,
// snapmaker_cnc_post_process): see docs/architecture.md section 19.

import { normalizeProfile, type PostProfile } from "../engine/profile";
import grbl from "./grbl.json";
import linuxcnc from "./linuxcnc.json";
import marlin from "./marlin.json";
import snapmakerArtisan from "./snapmaker-artisan.json";

export const BUILT_IN_PROFILES: readonly PostProfile[] = ([grbl, marlin, linuxcnc, snapmakerArtisan] as PostProfile[]).map(normalizeProfile);
