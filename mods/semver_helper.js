import semver from "https://esm.sh/semver@7.5.4";

export class SemverHelper {
    applyTagFilters(versions, tagFilters) {
        if (!tagFilters) return versions;

        const include = tagFilters.include || [];
        const exclude = tagFilters.exclude || [];

        return versions.filter(v => {
            const isSemver = semver.valid(v);

            if (include.length > 0) {
                let includePass = include.some(rule =>
                    isSemver && semver.satisfies(v, rule) || v.includes(rule)
                );
                if (!includePass) return false;
            }

            if (exclude.length > 0) {
                let excludeHit = exclude.some(rule =>
                    isSemver && semver.satisfies(v, rule) || v.includes(rule)
                );
                if (excludeHit) return false;
            }

            return true;
        });
    }

    applyVersionOverrides(versions, overrides) {
        return versions.filter(v => {
            for (const o of overrides) {
                const range = o.range;

                if (semver.valid(v) && semver.satisfies(v, range)) {
                    // version matched override range → apply filters
                    return applyTagFilters([v], o.tag_filters).length > 0;
                }
            }
            return true; 
        });
    }
}

