"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DreoClient = exports.DreoApiError = void 0;
const axios_1 = __importDefault(require("axios"));
const node_crypto_1 = __importDefault(require("node:crypto"));
class DreoApiError extends Error {
    code;
    status;
    retryable;
    authError;
    constructor(message, options = {}) {
        super(message);
        this.name = "DreoApiError";
        this.code = options.code;
        this.status = options.status;
        this.retryable = options.retryable ?? false;
        this.authError = options.authError ?? false;
    }
}
exports.DreoApiError = DreoApiError;
const BASE_URL = "https://open-api-us.dreo-tech.com";
const EU_BASE_URL = "https://open-api-eu.dreo-tech.com";
const CLIENT_ID = "89ef537b2202481aaaf9077068bcb0c9";
const CLIENT_SECRET = "41b20a1f60e9499e89c8646c31f93ea1";
const USER_AGENT = "openapi/1.0.0";
const API_VERSION = "1.0.0";
const ENDPOINTS = {
    login: "/api/oauth/login",
    devices: "/api/v2/device/list",
    deviceState: "/api/v2/device/state",
    deviceControl: "/api/v2/device/control",
};
class DreoClient {
    email;
    password;
    logger;
    debugMode;
    http;
    endpoint;
    accessToken;
    constructor(options) {
        this.email = options.email;
        this.password = options.password;
        this.logger = options.logger;
        this.debugMode = !!options.debugMode;
        this.http = axios_1.default.create({
            timeout: options.timeoutMs ?? 10_000,
            validateStatus: () => true,
        });
    }
    get tokenInfo() {
        return {
            endpoint: this.endpoint,
            region: this.extractTokenRegion(this.accessToken),
            hasToken: !!this.accessToken,
        };
    }
    async login() {
        if (!this.email || !this.password) {
            throw new DreoApiError("Dreo email and password are required", { authError: true });
        }
        const payload = await this.request({
            url: `${BASE_URL}${ENDPOINTS.login}`,
            method: "POST",
            params: this.baseParams(),
            data: {
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "openapi",
                scope: "all",
                email: this.email,
                password: this.preparePassword(this.password),
            },
            skipAuth: true,
        });
        this.accessToken = payload.access_token ?? payload.token;
        if (!this.accessToken) {
            throw new DreoApiError("Dreo login response did not contain an access token", { authError: true });
        }
        this.endpoint = payload.endpoint ?? this.resolveEndpoint(this.accessToken);
        this.debug(`Login successful. endpoint=${this.endpoint}, region=${this.extractTokenRegion(this.accessToken)}`);
    }
    async getDevices() {
        await this.ensureAuthenticated();
        const payload = await this.requestWithReauth({
            url: `${this.requireEndpoint()}${ENDPOINTS.devices}`,
            method: "GET",
            params: this.baseParams(),
        });
        const data = this.unwrapData(payload);
        if (Array.isArray(data))
            return data.filter(this.isObject);
        if (this.isObject(data)) {
            for (const key of ["devices", "deviceList", "list", "items", "records"]) {
                if (Array.isArray(data[key]))
                    return data[key].filter(this.isObject);
            }
        }
        this.logger.warn("Dreo device list response did not contain a known device array");
        this.debugJson("Unexpected device list payload", payload);
        return [];
    }
    async getDeviceState(deviceSn) {
        await this.ensureAuthenticated();
        const payload = await this.requestWithReauth({
            url: `${this.requireEndpoint()}${ENDPOINTS.deviceState}`,
            method: "GET",
            params: { ...this.baseParams(), deviceSn },
        });
        const data = this.unwrapData(payload);
        return this.isObject(data) ? data : {};
    }
    async updateDeviceState(deviceSn, desired) {
        if (!Object.keys(desired).length) {
            throw new DreoApiError("Refusing to send an empty command payload");
        }
        await this.ensureAuthenticated();
        return await this.requestWithReauth({
            url: `${this.requireEndpoint()}${ENDPOINTS.deviceControl}`,
            method: "POST",
            params: this.baseParams(),
            data: {
                devicesn: deviceSn,
                desired,
            },
        });
    }
    async requestWithReauth(config) {
        await this.ensureAuthenticated();
        try {
            return await this.request(config);
        }
        catch (error) {
            if (!(error instanceof DreoApiError) || !error.authError)
                throw error;
            this.logger.warn("Dreo token was rejected; refreshing session and retrying once");
            this.accessToken = undefined;
            this.endpoint = undefined;
            await this.login();
            return await this.request(config);
        }
    }
    async ensureAuthenticated() {
        if (!this.accessToken || !this.endpoint) {
            await this.login();
        }
    }
    async request(config) {
        const headers = {
            "Content-Type": "application/json",
            UA: USER_AGENT,
        };
        if (!config.skipAuth) {
            headers.Authorization = `Bearer ${this.stripTokenRegion(this.requireAccessToken())}`;
        }
        try {
            this.debug(`${config.method ?? "GET"} ${this.redactUrl(config.url ?? "")}`);
            const response = await this.http.request({
                ...config,
                headers: {
                    ...headers,
                    ...(config.headers ?? {}),
                },
            });
            if (response.status === 401 || response.status === 403) {
                throw new DreoApiError("Dreo authentication failed", { status: response.status, authError: true });
            }
            if (response.status === 429) {
                throw new DreoApiError("Dreo rate limit exceeded", { status: response.status, retryable: true });
            }
            if (response.status >= 500) {
                throw new DreoApiError(`Dreo server error: HTTP ${response.status}`, { status: response.status, retryable: true });
            }
            if (response.status < 200 || response.status >= 300) {
                throw new DreoApiError(`Dreo request failed: HTTP ${response.status}`, { status: response.status });
            }
            const body = response.data;
            if (!this.isObject(body))
                return body;
            if (body.code === 0 || body.code === "0" || body.code === undefined) {
                return this.unwrapData(body);
            }
            throw new DreoApiError(String(body.msg ?? body.message ?? "Dreo business error"), {
                code: body.code,
                authError: body.code === 401 || body.code === 403,
            });
        }
        catch (error) {
            if (error instanceof DreoApiError)
                throw error;
            const axiosError = error;
            if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
                throw new DreoApiError("Dreo request timed out", { retryable: true });
            }
            throw new DreoApiError(`Dreo request failed: ${axiosError.message ?? String(error)}`, { retryable: true });
        }
    }
    baseParams() {
        return {
            timestamp: Date.now(),
            dreover: API_VERSION,
        };
    }
    preparePassword(password) {
        return /^[0-9a-f]{32}$/i.test(password) ? password : node_crypto_1.default.createHash("md5").update(password, "utf8").digest("hex");
    }
    resolveEndpoint(token) {
        return this.extractTokenRegion(token) === "EU" ? EU_BASE_URL : BASE_URL;
    }
    extractTokenRegion(token) {
        if (!token || !token.includes(":"))
            return "NA";
        return token.split(":", 2)[1]?.toUpperCase() === "EU" ? "EU" : "NA";
    }
    stripTokenRegion(token) {
        return token.split(":", 1)[0];
    }
    requireEndpoint() {
        if (!this.endpoint)
            throw new DreoApiError("Dreo endpoint is unavailable; login has not completed", { authError: true });
        return this.endpoint;
    }
    requireAccessToken() {
        if (!this.accessToken)
            throw new DreoApiError("Dreo access token is unavailable; login has not completed", { authError: true });
        return this.accessToken;
    }
    unwrapData(payload) {
        return this.isObject(payload) && "data" in payload ? payload.data : payload;
    }
    isObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }
    debug(message) {
        if (this.debugMode)
            this.logger.debug(`[DreoClient] ${message}`);
    }
    debugJson(message, value) {
        if (this.debugMode)
            this.logger.debug(`[DreoClient] ${message}: ${JSON.stringify(value)}`);
    }
    redactUrl(url) {
        return url.replace(/accessToken=([^&]+)/i, "accessToken=<redacted>");
    }
}
exports.DreoClient = DreoClient;
//# sourceMappingURL=DreoClient.js.map