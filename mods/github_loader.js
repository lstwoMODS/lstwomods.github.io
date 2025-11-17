
export class GitHubAPI {
    constructor() {
        this.baseUrl = "https://api.github.com";
        this.token = this.loadTokenFromSession();
        this.bindPopupEvents();
    }

    GITHUB_CLIENT_ID = 'Ov23liqUzte2MVDUdFjq';
    GITHUB_SCOPE = '';

    /* ------------------------- GITHUB DEVICE FLOW LOGIN ----------------------- */

    pollGitHubForLogin(device_code, interval) {

        const poll = setInterval(async () => {
            const tokenResp = await fetch('https://lstwomods-website-github-proxy.lstwomods.workers.dev/device/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    client_id: this.GITHUB_CLIENT_ID,
                    device_code: device_code,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                })
            }).then(r => r.json());

            if(tokenResp.error === 'authorization_pending') {
                return;
            }

            if(tokenResp.error) {
                clearInterval(poll);
                $('#gh-popup-code').text('Error: ' + tokenResp.error);
                return;
            }

            clearInterval(poll);
            this.saveTokenToSession(tokenResp.access_token);
            this.hideRateLimitPopup();

            window.location.reload();
            
        }, (interval + 0.5) * 1000);
    }

    async startGitHubLogin() {
        $("#gh-auth-btn").prop('disabled', true);

        const deviceResp = await fetch("https://lstwomods-website-github-proxy.lstwomods.workers.dev/device/code", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                client_id: this.GITHUB_CLIENT_ID,
                scope: this.GITHUB_SCOPE
            })
        }).then(r => r.json());

        $('#gh-popup-code').text('Code: ' + deviceResp.user_code);
        window.open(deviceResp.verification_uri, '_blank');
        this.pollGitHubForLogin(deviceResp.device_code, deviceResp.interval);
    }

    /*startGitHubLogin() {
        $("#gh-auth-btn").prop('disabled', true);

        const state = [...crypto.getRandomValues(new Uint8Array(16))]
        .map(b => b.toString(16).padStart(2, '0'))
        .join("");

        sessionStorage.setItem("oauth_state", state);

        const redirect = encodeURIComponent(window.location.origin + "/auth");

        const url =
            `https://github.com/login/oauth/authorize` +
            `?client_id=${this.GITHUB_CLIENT_ID}` +
            `&redirect_uri=${redirect}` +
            `&scope=${encodeURIComponent(this.GITHUB_SCOPES)}` +
            `&allow_signup=true` +
            `&response_type=token` +
            `&state`;

        window.location = url;
    }*/

    /* ------------------------- TOKEN / SESSION SUPPORT ------------------------- */

    /*loadTokenFromCookie() {
        const match = document.cookie.match(/github_token=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    saveTokenToCookie(token) {
        const encoded = encodeURIComponent(token);
        document.cookie = `github_token=${encoded}; path=/; max-age=${60 * 60 * 24 * 365}`;
        this.token = token;
    }

    clearToken() {
        document.cookie = "github_token=; path=/; max-age=0;";
        this.token = null;
    }*/

    loadTokenFromSession() {
        return sessionStorage.getItem('gh_token');
    }

    saveTokenToSession(token) {
        sessionStorage.setItem('gh_token', token);
        this.token = token;
    }

    clearToken() {
        sessionStorage.removeItem('gh_token');
        this.token = null;
    }

    /* ------------------------- INTERNAL FETCH WRAPPER ------------------------- */

    async apiRequest(url) {
        const headers = {
            "Accept": "application/vnd.github+json"
        };

        if (this.token)
            headers["Authorization"] = `Bearer ${this.token}`;

        const res = await fetch(url, { headers });

        if (res.status === 403) {
            const data = await res.json().catch(() => ({}));

            if (data.message && data.message.includes("API rate limit")) {

                if(!this.token) {
                    this.showRateLimitPopup();
                }

                throw new Error("GitHub API rate limit exceeded");
            }
        }

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`GitHub API error: ${res.status} — ${errorText}`);
        }

        return await res.json();
    }

    /* ------------------------- POPUP UI ------------------------- */

    bindPopupEvents() {
        $("#gh-popup-close").on("click", () => this.hideRateLimitPopup());

        $("#gh-auth-btn").on("click", () => this.startGitHubLogin());
    }

    showRateLimitPopup() {
        if(this.token) return;

        $("#gh-rate-popup").removeClass("hidden");
    }

    hideRateLimitPopup() {
        $("#gh-rate-popup").addClass('hidden');
    }

    /* ------------------------- PUBLIC API METHODS ------------------------- */

    async getRepo(owner, repo) {
        const url = `${this.baseUrl}/repos/${owner}/${repo}`;
        return await this.apiRequest(url);
    }

    async getReleaseTags(owner, repo) {
        const url = `${this.baseUrl}/repos/${owner}/${repo}/releases`;
        const releases = await this.apiRequest(url);
        return releases.map(r => r.tag_name);
    }

    async getReleaseByTag(owner, repo, tag) {
        const url = `${this.baseUrl}/repos/${owner}/${repo}/releases/tags/${tag}`;
        return await this.apiRequest(url);
    }

    async getLatestRelease(owner, repo) {
        const url = `${this.baseUrl}/repos/${owner}/${repo}/releases/latest`;
        return await this.apiRequest(url);
    }

    async getReleaseAssets(owner, repo, tag) {
        const release = await this.getReleaseByTag(owner, repo, tag);
        return release.assets || [];
    }

    async getTotalDownloads(owner, repo) {
        const releases = await this.apiRequest(
            `${this.baseUrl}/repos/${owner}/${repo}/releases?per_page=100`
        );

        let total = 0;

        for (const release of releases) {
            if (!release.assets) continue;

            for (const asset of release.assets) {
                total += asset.download_count || 0;
            }
        }

        return total;
    }
}
