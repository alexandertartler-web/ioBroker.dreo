import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import crypto from "node:crypto";

export type DreoLogger = {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type DreoRawDevice = Record<string, any>;
export type DreoRawState = Record<string, any>;

export class DreoApiError extends Error {
  public readonly code?: number | string;
  public readonly status?: number;
  public readonly retryable: boolean;
  public readonly authError: boolean;

  public constructor(message: string, options: { code?: number | string; status?: number; retryable?: boolean; authError?: boolean } = {}) {
    super(message);
    this.name = "DreoApiError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.authError = options.authError ?? false;
  }
}

type LoginResponse = {
  access_token?: string;
  token?: string;
  endpoint?: string;
};

type DreoClientOptions = {
  email: string;
  password: string;
  logger: DreoLogger;
  debugMode?: boolean;
  timeoutMs?: number;
};

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

export class DreoClient {
  private readonly email: string;
  private readonly password: string;
  private readonly logger: DreoLogger;
  private readonly debugMode: boolean;
  private readonly http: AxiosInstance;

  private endpoint?: string;
  private accessToken?: string;

  public constructor(options: DreoClientOptions) {
    this.email = options.email;
    this.password = options.password;
    this.logger = options.logger;
    this.debugMode = !!options.debugMode;
    this.http = axios.create({
      timeout: options.timeoutMs ?? 10_000,
      validateStatus: () => true,
    });
  }

  public get tokenInfo(): { endpoint?: string; region: "NA" | "EU"; hasToken: boolean } {
    return {
      endpoint: this.endpoint,
      region: this.extractTokenRegion(this.accessToken),
      hasToken: !!this.accessToken,
    };
  }

  public async login(): Promise<void> {
    if (!this.email || !this.password) {
      throw new DreoApiError("Dreo email and password are required", { authError: true });
    }

    const payload = await this.request<LoginResponse>({
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

  public async getDevices(): Promise<DreoRawDevice[]> {
    await this.ensureAuthenticated();
    const payload = await this.requestWithReauth<any>({
      url: `${this.requireEndpoint()}${ENDPOINTS.devices}`,
      method: "GET",
      params: this.baseParams(),
    });

    const data = this.unwrapData(payload);
    if (Array.isArray(data)) return data.filter(this.isObject);
    if (this.isObject(data)) {
      for (const key of ["devices", "deviceList", "list", "items", "records"]) {
        if (Array.isArray(data[key])) return data[key].filter(this.isObject);
      }
    }
    this.logger.warn("Dreo device list response did not contain a known device array");
    this.debugJson("Unexpected device list payload", payload);
    return [];
  }

  public async getDeviceState(deviceSn: string): Promise<DreoRawState> {
    await this.ensureAuthenticated();
    const payload = await this.requestWithReauth<any>({
      url: `${this.requireEndpoint()}${ENDPOINTS.deviceState}`,
      method: "GET",
      params: { ...this.baseParams(), deviceSn },
    });
    const data = this.unwrapData(payload);
    return this.isObject(data) ? data : {};
  }

  public async updateDeviceState(deviceSn: string, desired: Record<string, any>): Promise<Record<string, any>> {
    if (!Object.keys(desired).length) {
      throw new DreoApiError("Refusing to send an empty command payload");
    }

    await this.ensureAuthenticated();
    return await this.requestWithReauth<Record<string, any>>({
      url: `${this.requireEndpoint()}${ENDPOINTS.deviceControl}`,
      method: "POST",
      params: this.baseParams(),
      data: {
        devicesn: deviceSn,
        desired,
      },
    });
  }

  private async requestWithReauth<T>(config: AxiosRequestConfig & { skipAuth?: boolean }): Promise<T> {
    await this.ensureAuthenticated();

    try {
      return await this.request<T>(config);
    } catch (error) {
      if (!(error instanceof DreoApiError) || !error.authError) throw error;
      this.logger.warn("Dreo token was rejected; refreshing session and retrying once");
      this.accessToken = undefined;
      this.endpoint = undefined;
      await this.login();
      return await this.request<T>(config);
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || !this.endpoint) {
      await this.login();
    }
  }

  private async request<T>(config: AxiosRequestConfig & { skipAuth?: boolean }): Promise<T> {
    const headers: Record<string, string> = {
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
      if (!this.isObject(body)) return body as T;
      if (body.code === 0 || body.code === "0" || body.code === undefined) {
        return this.unwrapData(body) as T;
      }
      throw new DreoApiError(String(body.msg ?? body.message ?? "Dreo business error"), {
        code: body.code,
        authError: body.code === 401 || body.code === 403,
      });
    } catch (error) {
      if (error instanceof DreoApiError) throw error;
      const axiosError = error as AxiosError;
      if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
        throw new DreoApiError("Dreo request timed out", { retryable: true });
      }
      throw new DreoApiError(`Dreo request failed: ${axiosError.message ?? String(error)}`, { retryable: true });
    }
  }

  private baseParams(): Record<string, any> {
    return {
      timestamp: Date.now(),
      dreover: API_VERSION,
    };
  }

  private preparePassword(password: string): string {
    return /^[0-9a-f]{32}$/i.test(password) ? password : crypto.createHash("md5").update(password, "utf8").digest("hex");
  }

  private resolveEndpoint(token?: string): string {
    return this.extractTokenRegion(token) === "EU" ? EU_BASE_URL : BASE_URL;
  }

  private extractTokenRegion(token?: string): "NA" | "EU" {
    if (!token || !token.includes(":")) return "NA";
    return token.split(":", 2)[1]?.toUpperCase() === "EU" ? "EU" : "NA";
  }

  private stripTokenRegion(token: string): string {
    return token.split(":", 1)[0];
  }

  private requireEndpoint(): string {
    if (!this.endpoint) throw new DreoApiError("Dreo endpoint is unavailable; login has not completed", { authError: true });
    return this.endpoint;
  }

  private requireAccessToken(): string {
    if (!this.accessToken) throw new DreoApiError("Dreo access token is unavailable; login has not completed", { authError: true });
    return this.accessToken;
  }

  private unwrapData(payload: any): any {
    return this.isObject(payload) && "data" in payload ? payload.data : payload;
  }

  private isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  private debug(message: string): void {
    if (this.debugMode) this.logger.debug(`[DreoClient] ${message}`);
  }

  private debugJson(message: string, value: any): void {
    if (this.debugMode) this.logger.debug(`[DreoClient] ${message}: ${JSON.stringify(value)}`);
  }

  private redactUrl(url: string): string {
    return url.replace(/accessToken=([^&]+)/i, "accessToken=<redacted>");
  }
}
