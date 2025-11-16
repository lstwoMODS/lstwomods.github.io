import { DataLoader } from "./data_loader.js";
import { GitHubAPI } from "./github_loader.js";
import { SemverHelper } from "./semver_helper.js";
import semver from "https://esm.sh/semver@7.5.4";
import "https://cdn.jsdelivr.net/npm/jszip@3.10.0/dist/jszip.min.js";

const data = await DataLoader.loadAll();
let github_api;

const semver_helper = new SemverHelper();

let mod_download_item;
let currentSelectedGameId;

$.get('/mods/components/mod_download_item.html', function(template) {
    mod_download_item = template;
})

function replaceAndInsertHtml(html, el, replacements) {
    Object.keys(replacements).forEach(replacementKey => {
        html = html.replaceAll(`{{${replacementKey}}}`, replacements[replacementKey]);
    });

    const inserted = $(html);
    el.append(inserted);

    return inserted;
}

function addModToDownloads(mod, version, selectedGame, source = "user") {
    const list = $('#mods-download-list');

    const existing = list.find(`li[value="${mod.id}"]`);

    if (existing.length > 0) {
        const existingSource = existing.data("source");
        const existingVersion = existing.data("version");

        if (existingSource === "dependency" && source === "dependency") {
            //console.log(`[mod] Skip: dependency ${mod.id} (${version}) already added.`);
            return;
        }

        if (existingSource === "dependency" && source === "user") {
            //console.log(`[mod] Replacing dependency-added version for ${mod.id} → user version ${version}`);
            existing.remove();
        }

        if (existingSource === "user" && source === "user") {
            //console.log(`[mod] Updating user-selected version for ${mod.id}: ${existingVersion} → ${version}`);
            existing.remove();
        }

        if (existingSource === "user" && source === "dependency") {
            //console.log(`[mod] Skip: user-selected version of ${mod.id} cannot be overridden by dependency.`);
            return;
        }
    }

    const html = (mod_download_item + "")
        .replace(/{{mod_id}}/g, mod.id)
        .replace(/{{mod_name}}/g, mod.name)
        .replace(/{{mod_version}}/g, version);

    const element = $(html);

    element.attr("data-version", version);
    element.attr("data-source", source);

    $('#mods-download-list').append(element).find('button').click(function() {
        $(this).parent().remove();
    });

    const deps = resolveDependencies(mod, version);

    for (const dep of deps) {
        const depMod = selectedGame.mods.find(x => x.id === dep.id) ?? data.games.global.mods.find(x => x.id === dep.id);

        if (!depMod) {
            console.warn(`[mod] Missing dependency: ${dep.id}`);
            continue;
        }

        const depVersion = pickDependencyVersion(depMod, dep.version);
        if (!depVersion) {
            console.warn(`[mod] No version satisfies dependency: ${dep.id} ${dep.version}`);
            continue;
        }

        addModToDownloads(depMod, depVersion, selectedGame, "dependency");
    }
}

function resolveDependencies(mod, version) {
    const deps = [];

    if (mod.dependencies) {
        deps.push(...mod.dependencies);
    }

    if (mod.version_overrides) {
        mod.version_overrides.forEach(override => {
            if (semver.satisfies(version, override.range) && override.dependencies) {
                 deps.push(...override.dependencies);
            }
        });
    }

    return deps;
}

function pickDependencyVersion(mod, range) {
    if (!range || range === "any") {
        return mod.versions[0];
    }

    const filtered = mod.versions.filter(v => semver.satisfies(v.replace(/^v/i, ""), range));

    return filtered[0] || null;
}

function normalizeSemver(tag) {
    let v = tag.replace(/^v/i, "");
    const parts = v.split(".");
    
    while (parts.length < 3) {
        parts.push("0");
    }

    return parts.join(".");
}


function initModList(template, modsList, gameSelectorDropdown) {
    let modsListItem = template;

    gameSelectorDropdown.on('change', function() {
        let downloadsList = $('#mods-download-list');

        if(downloadsList.children().length > 0 && !window.confirm("This will clear your current modpack. Continue?")) {
            $('#game-selector-dropdown').val(currentSelectedGameId);
            return;
        }

        downloadsList.empty();

        let selectedGameId = gameSelectorDropdown.find(':selected').val();
        currentSelectedGameId = selectedGameId;
        let selectedGame = data.games[selectedGameId];
        modsList.empty();

        async function addModItem(mod) {
            if(!mod.downloads) {
                mod.downloads = await github_api.getTotalDownloads(mod.repo.owner, mod.repo.name);
            }

            if (!mod.versions) {
                let tags = await github_api.getReleaseTags(mod.repo.owner, mod.repo.name);

                let versions = tags.map(tag => ({
                    original: tag,
                    normalized: normalizeSemver(tag)
                }));

                if (mod.tag_filters) {
                    versions = semver_helper.applyTagFilters(
                        versions.map(v => v.normalized),
                        mod.tag_filters
                    ).map(n => versions.find(v => v.normalized === n));
                }

                if (mod.version_overrides) {
                    versions = semver_helper.applyVersionOverrides(
                        versions.map(v => v.normalized),
                        mod.version_overrides
                    ).map(n => versions.find(v => v.normalized === n));
                }

                mod.versions = versions.map(v => v.original);
            }

            let download_items = '';

            mod.versions.forEach(version => {
                download_items += `<option value="${version}">${version}</option>\n`;
            });

            const card = replaceAndInsertHtml(modsListItem, modsList, {
                name: mod.name,
                author: mod.author,
                description: mod.description,
                downloads: mod.downloads ?? 0,
                mod_id: mod.id,
                mod_version_items: download_items,
                repo_owner: mod.repo.owner,
                repo_name: mod.repo.name
            });

            card.find('button').click(function() {
                const version = card.find('.mod-version-select').val();
                addModToDownloads(mod, version, selectedGame);
            });
        }

        selectedGame.mods.forEach(mod => {
            addModItem(mod);
        });

        data.games.global.mods.forEach(mod => {
            addModItem(mod);
        });
    });

    gameSelectorDropdown.val(Object.keys(data.games)[0]);
    gameSelectorDropdown.trigger('change');
}

function initGameSelectorDropdown(template, gameSelectorDropdown) {
    let gameSelectorItem = template;

    Object.values(data.games).filter(game => game.id !== "global").forEach(async game => {
        replaceAndInsertHtml(gameSelectorItem, gameSelectorDropdown, {"game_id": game.id, "game_name": game.game_name});

        let mod = game.mod_loader;
        mod.id = "mod_loader";
        mod.name = "Mod Loader";

        if (!mod.versions) {
            let tags = await github_api.getReleaseTags(mod.repo.owner, mod.repo.name);

            let versions = tags.map(tag => ({
                original: tag,
                normalized: tag.replace(/^v/i, "")
            }));

            if (mod.tag_filters) {
                versions = semver_helper.applyTagFilters(
                    versions.map(v => v.normalized),
                    mod.tag_filters
                ).map(n => versions.find(v => v.normalized === n));
            }

            if (mod.version_overrides) {
                versions = semver_helper.applyVersionOverrides(
                    versions.map(v => v.normalized),
                    mod.version_overrides
                ).map(n => versions.find(v => v.normalized === n));
            }

            mod.versions = versions.map(v => v.original);
        }
    });

    let modsList = $('#mods-list-ul');

    $.get('/mods/components/mod_card.html', function(template) {
        initModList(template, modsList, gameSelectorDropdown);
    });
}


async function downloadMods(selectedMods, selectedGame) {
    const zip = new JSZip();
    const modFiles = [];
    const batchFiles = [];

    console.log(selectedMods);

    for (const { mod, version } of selectedMods) {
        try {
            const release = await github_api.getReleaseByTag(mod.repo.owner, mod.repo.name, version);
            let assets = release.assets || [];

            if (mod.file_filters) {
                assets = assets.filter(a => {
                    const name = a.name.toLowerCase();
                    if (mod.file_filters.must_include && !mod.file_filters.must_include.some(f => name.includes(f.toLowerCase()))) return false;
                    if (mod.file_filters.must_exclude && mod.file_filters.must_exclude.some(f => name.includes(f.toLowerCase()))) return false;
                    return true;
                });
            }

            if (mod.version_overrides) {
                for (const override of mod.version_overrides) {
                    if (!semver.satisfies(version, override.range) || !override.file_filters) {
                        continue;
                    }

                    assets = assets.filter(a => {
                        const name = a.name.toLowerCase();
                        if (override.file_filters.must_include && !override.file_filters.must_include.some(f => name.includes(f.toLowerCase()))) return false;
                        if (override.file_filters.must_exclude && override.file_filters.must_exclude.some(f => name.includes(f.toLowerCase()))) return false;
                        return true;
                    });
                }
            }

            for (const asset of assets) {
                const proxiedUrl = `https://lstwomods-website-github-proxy.lstwomods.workers.dev/raw/${mod.repo.owner}/${mod.repo.name}/${version}/${asset.name}`;

                const response = await fetch(proxiedUrl, {
                    headers: { "Authorization": "Bearer " + github_api.token }
                });
                if (!response.ok) {
                    console.warn(`Failed to fetch asset through proxy: ${asset.name}`);
                    continue;
                }

                const blob = await response.blob();
                const pathInZip = `${mod.id}/${asset.name}`;
                zip.file(pathInZip, blob);

                modFiles.push({
                    batchFile: mod.process_file,
                    pathInZip
                });
            }

            if(!batchFiles.includes(mod.process_file)) {
                try {
                    const batchUrl = `/data/batch/${mod.process_file}.bat`;
                    const batchResp = await fetch(batchUrl);
                    const batchText = await batchResp.text();
                    zip.file(`data/batch/${mod.process_file}.bat`, batchText);
                    batchFiles.push(mod.process_file);
                } 
                catch (e) {
                    console.warn(`Failed to fetch batch file for ${mod.id}`);
                }
            }

        } catch (e) {
            console.log(mod);
            console.error(`Failed to process mod ${mod.id}@${version}`, e);
        }
    }

    let masterBat = `@echo off
set "GAME_DIR=%~dp1"
set "MODPACK_DIR=%~dp0"
`;

    for (const modFile of modFiles) {
        const relativePath = modFile.pathInZip.replace(/\//g, '\\');
        masterBat += `call "%MODPACK_DIR%data\\batch\\${modFile.batchFile}.bat" "%MODPACK_DIR%${relativePath}" "%GAME_DIR%"\n`;
    }

    masterBat += `
pause
exit /b 1
`;

    zip.file("DRAG GAME EXE HERE.bat", masterBat);

    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "modpack.zip";
    link.click();
}


$(function() {
    github_api = new GitHubAPI();

    $('#game-selector-dropdown-toggle').on('click', function(e) {
        e.stopPropagation();
        $('#game-selector-dropdown-menu').toggleClass('show');
    });

    $('#game-selector-dropdown-menu li').on('click', function() {
        const text = $(this).text();
        const value = $(this).data('value');

        $('#game-selector-dropdown-toggle').text(text);
        $('#game-selector-dropdown-value').val(value);
        $('#game-selector-dropdown-menu').removeClass('show');
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('#game-selector-container').length) {
            $('#game-selector-dropdown-menu').removeClass('show');
        }
    });

    let gameSelectorDropdown = $('#game-selector-dropdown');
    gameSelectorDropdown.empty();

    $.get('/mods/components/game_li.html', function(template) {
        initGameSelectorDropdown(template, gameSelectorDropdown);
    });
    
    $('#download-button').on('click', async function() {
        const selectedGameId = $('#game-selector-dropdown').val();
        const selectedGame = data.games[selectedGameId];

        const selectedMods = [];

        const modLoader = selectedGame.mod_loader;
        const modLoaderVersion = selectedGame.mod_loader.versions[0];
        selectedMods.push({ mod: modLoader, version: modLoaderVersion });

        $('#mods-download-list li').each(function() {
            const modId = $(this).attr('value');
            const version = $(this).data('version');
            const mod = selectedGame.mods.find(x => x.id === modId) ?? data.games.global.mods.find(x => x.id === modId);
            if(mod) selectedMods.push({ mod, version });
        });

        $('#downloading-popup').removeClass('hidden');
        console.log(selectedMods);

        await downloadMods(selectedMods, selectedGame);
    });

    $('#downloading-popup .close-x').on('click', function() {
        $('#downloading-popup').addClass('hidden');
    });
});