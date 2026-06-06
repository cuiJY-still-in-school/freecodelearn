import { useEffect, useState } from "react";
import { api } from "../api/client";
import { BUILTIN_CATALOG, type ServiceCatalogEntry } from "./catalog";

interface UseCatalogResult {
  catalog: ServiceCatalogEntry[];
  modCount: number;
  reload: () => Promise<void>;
}

/** Returns the merged catalog: built-in entries plus user mods from
 *  `<data_dir>/mods/*.json`. Mods override builtins with the same `id`. */
export function useCatalog(): UseCatalogResult {
  const [catalog, setCatalog] = useState<ServiceCatalogEntry[]>(
    BUILTIN_CATALOG.map((s) => ({ ...s, source: "builtin" as const }))
  );
  const [modCount, setModCount] = useState(0);

  async function reload() {
    let mods: Array<{ path: string; [k: string]: unknown }> = [];
    try {
      mods = await api.listServiceMods();
    } catch {
      mods = [];
    }
    const byId = new Map<string, ServiceCatalogEntry>();
    for (const e of BUILTIN_CATALOG) {
      byId.set(e.id, { ...e, source: "builtin" });
    }
    let mc = 0;
    for (const m of mods) {
      const entry = m as unknown as ServiceCatalogEntry & { path?: string };
      if (!entry.id || !entry.name) continue;
      byId.set(entry.id, {
        ...entry,
        source: "mod",
        modPath: m.path,
      });
      mc++;
    }
    setCatalog(Array.from(byId.values()));
    setModCount(mc);
  }

  useEffect(() => {
    void reload();
  }, []);

  return { catalog, modCount, reload };
}
