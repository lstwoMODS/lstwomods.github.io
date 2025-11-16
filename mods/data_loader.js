
export const DataLoader = (() => {

    async function loadIndex() {
        const res = await fetch("/data/index.json");
        if (!res.ok) throw new Error("Failed to fetch /data/index.json");
        return await res.json();
    }

    async function loadMod(modId, folder) {
        const path = `/data/games/${folder}/mods/${modId}.json`;
        try {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`Failed to fetch ${path}`);
            const json = await res.json();

            if (!json.name && json.repo?.name) json.name = json.repo.name;
            if (!json.author && json.repo?.owner) json.author = json.repo.owner;
            if (!json.description) json.description = json.description || "";

            json.id = modId;
            json.folder = folder;
            return json;
        } catch (err) {
            console.warn(err);
            return null;
        }
    }

    async function loadModsForGame(index, gameFolder) {
        const modsToLoad = [
            ...(index.mods[gameFolder] || [])
        ];

        const mods = [];
        for (const modId of modsToLoad) {
            const mod = await loadMod(modId, gameFolder === index.global ? "global" : gameFolder);
            mod.id = modId;
            if (mod) mods.push(mod);
        }
        return mods;
    }

    async function loadGameData(gameFolder) {
        const res = await fetch(`/data/games/${gameFolder}/data.json`);
        if (!res.ok) throw new Error(`Failed to fetch /data/games/${gameFolder}/data.json`);
        return await res.json();
    }

    async function loadAll() {
        const index = await loadIndex();
        const result = {
            globalFolder: index.global,
            games: {},
        };

        let games = index.games;
        games.push(index.global);

        for (const gameFolder of games || []) {
            const game = await loadGameData(gameFolder);
            const mods = await loadModsForGame(index, gameFolder);
            
            game.id = gameFolder;
            game.mods = mods;

            result.games[gameFolder] = game;
        }

        return result;
    }

    return {
        loadIndex,
        loadMod,
        loadModsForGame,
        loadAll
    };

})();
