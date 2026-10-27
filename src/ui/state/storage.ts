// Local persistence in IndexedDB (specification 6.3: tool library stored locally). Every access is guarded:
// private browsing or blocked storage must never prevent the application from working.

import { openDB, type IDBPDatabase } from "idb";

const DATABASE = "8cam";
const VERSION = 1;
const STORE = "settings";

let database: Promise<IDBPDatabase> | null = null;

function open(): Promise<IDBPDatabase>
{
    database ??= openDB(DATABASE, VERSION, {
        upgrade(db)
        {
            db.createObjectStore(STORE);
        }
    });
    return database;
}

export async function loadSetting<T>(key: string): Promise<T | undefined>
{
    try
    {
        return (await (await open()).get(STORE, key)) as T | undefined;
    }
    catch
    {
        return undefined;
    }
}

export async function saveSetting(key: string, value: unknown): Promise<boolean>
{
    try
    {
        await (await open()).put(STORE, value, key);
        return true;
    }
    catch
    {
        return false;
    }
}
