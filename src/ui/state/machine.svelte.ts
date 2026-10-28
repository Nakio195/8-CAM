// Machines and post-processor profiles of the user (docs/architecture.md section 5.1, specification 6.8), kept in this
// browser (IndexedDB) and exchangeable as JSON files. The active machine gives the travel and limits checked before
// writing G-code, and the profile used to write it.

import {
    BUILT_IN_PROFILES,
    DEFAULT_MACHINE,
    exportMachine,
    exportProfile,
    importMachine,
    importProfile,
    type MachineIssue,
    type MachineProfile,
    type PostProfile,
    type ProfileIssue
} from "@post/index";
import { loadSetting, saveSetting } from "./storage";

const MACHINES_KEY = "machines";
const ACTIVE_KEY = "activeMachine";
const PROFILES_KEY = "postProfiles";

function newId(prefix: string): string
{
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `${prefix}-${crypto.randomUUID()}`
        : `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

class MachineState
{
    public machines: MachineProfile[] = $state.raw([{ ...DEFAULT_MACHINE }]);
    public activeId: string = $state(DEFAULT_MACHINE.id);
    /** The user's own profiles; built-in ones are always there and can be copied, not changed. */
    public userProfiles: PostProfile[] = $state.raw([]);
    /** False when the browser refused to store the settings (private browsing): changes last for this session only. */
    public persistent = $state(true);

    private mLoaded = false;

    public get active(): MachineProfile
    {
        return this.machines.find((machine) => machine.id === this.activeId) ?? this.machines[0] ?? DEFAULT_MACHINE;
    }

    public get profiles(): PostProfile[]
    {
        return [...BUILT_IN_PROFILES, ...this.userProfiles];
    }

    /** Profile of the active machine (GRBL when it was removed). */
    public get activeProfile(): PostProfile
    {
        return this.profile(this.active.postProfileId) ?? (BUILT_IN_PROFILES[0] as PostProfile);
    }

    public profile(id: string): PostProfile | undefined
    {
        return this.profiles.find((profile) => profile.id === id);
    }

    public async load(): Promise<void>
    {
        if (this.mLoaded)
        {
            return;
        }
        this.mLoaded = true;
        const [machines, active, profiles] = await Promise.all([
            loadSetting<MachineProfile[]>(MACHINES_KEY),
            loadSetting<string>(ACTIVE_KEY),
            loadSetting<PostProfile[]>(PROFILES_KEY)
        ]);
        if (Array.isArray(machines) && machines.length > 0)
        {
            // Fields added in later versions take their default values
            this.machines = machines.map((machine) => ({ ...DEFAULT_MACHINE, ...machine }));
        }
        if (typeof active === "string")
        {
            this.activeId = active;
        }
        if (Array.isArray(profiles))
        {
            this.userProfiles = profiles;
        }
    }

    public select(id: string): void
    {
        this.activeId = id;
        void saveSetting(ACTIVE_KEY, id).then((saved) => (this.persistent = saved));
    }

    public saveMachine(machine: MachineProfile): void
    {
        this.setMachines(this.machines.map((entry) => (entry.id === machine.id ? machine : entry)));
    }

    /** New machine copied from the active one, made active. */
    public addMachine(name: string): MachineProfile
    {
        const machine = { ...this.active, id: newId("machine"), name };
        this.setMachines([...this.machines, machine]);
        this.select(machine.id);
        return machine;
    }

    /** The last machine cannot be removed: there must always be one to check the G-code against. */
    public removeMachine(id: string): void
    {
        if (this.machines.length <= 1)
        {
            return;
        }
        this.setMachines(this.machines.filter((machine) => machine.id !== id));
        if (this.activeId === id)
        {
            this.select(this.machines[0]?.id ?? DEFAULT_MACHINE.id);
        }
    }

    public exportMachine(): string
    {
        return exportMachine(this.active);
    }

    /** Adds the machine of a file and makes it active (a new id, so it never replaces another one). */
    public importMachine(text: string): { machine: MachineProfile } | { issues: MachineIssue[] }
    {
        const result = importMachine(text);
        if ("machine" in result)
        {
            const machine = { ...result.machine, id: newId("machine") };
            this.setMachines([...this.machines, machine]);
            this.select(machine.id);
            return { machine };
        }
        return result;
    }

    /** Editable copy of a profile, given to the active machine. */
    public copyProfile(id: string, name: string): PostProfile | null
    {
        const source = this.profile(id);
        if (!source)
        {
            return null;
        }
        const copy: PostProfile = { ...structuredClone($state.snapshot(source)), id: newId("post"), name, builtIn: false };
        this.setProfiles([...this.userProfiles, copy]);
        this.saveMachine({ ...this.active, postProfileId: copy.id });
        return copy;
    }

    public saveProfile(profile: PostProfile): void
    {
        if (profile.builtIn)
        {
            return;
        }
        this.setProfiles(this.userProfiles.map((entry) => (entry.id === profile.id ? profile : entry)));
    }

    public removeProfile(id: string): void
    {
        this.setProfiles(this.userProfiles.filter((profile) => profile.id !== id));
        // Machines using it fall back to GRBL
        this.setMachines(this.machines.map((machine) =>
            (machine.postProfileId === id ? { ...machine, postProfileId: DEFAULT_MACHINE.postProfileId } : machine)));
    }

    public exportProfile(id: string): string | null
    {
        const profile = this.profile(id);
        return profile ? exportProfile(profile) : null;
    }

    /** Adds the profile of a file (a new id when it already exists) and gives it to the active machine. */
    public importProfile(text: string): { profile: PostProfile } | { issues: ProfileIssue[] }
    {
        const result = importProfile(text);
        if ("profile" in result)
        {
            const profile = this.profile(result.profile.id) ? { ...result.profile, id: newId("post") } : result.profile;
            this.setProfiles([...this.userProfiles, profile]);
            this.saveMachine({ ...this.active, postProfileId: profile.id });
            return { profile };
        }
        return result;
    }

    private setMachines(machines: MachineProfile[]): void
    {
        this.machines = machines;
        // IndexedDB clones what it stores and refuses reactive proxies: always hand it plain data
        void saveSetting(MACHINES_KEY, $state.snapshot(machines)).then((saved) => (this.persistent = saved));
    }

    private setProfiles(profiles: PostProfile[]): void
    {
        this.userProfiles = profiles;
        void saveSetting(PROFILES_KEY, $state.snapshot(profiles)).then((saved) => (this.persistent = saved));
    }
}

export const machineState = new MachineState();
