// Post-processor profiles shipped with 8-CAM (specification 6.8), from FlatCAM preprocessors GRBL_11.py, Marlin.py
// and default.py.

import type { PostProfile } from "../engine/profile";
import grbl from "./grbl.json";
import linuxcnc from "./linuxcnc.json";
import marlin from "./marlin.json";

export const BUILT_IN_PROFILES: readonly PostProfile[] = [grbl, marlin, linuxcnc] as PostProfile[];
