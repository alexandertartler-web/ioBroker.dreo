export type DreoLogger = {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
};
export type DreoRawDevice = Record<string, any>;
export type DreoRawState = Record<string, any>;
export declare class DreoApiError extends Error {
    readonly code?: number | string;
    readonly status?: number;
    readonly retryable: boolean;
    readonly authError: boolean;
    constructor(message: string, options?: {
        code?: number | string;
        status?: number;
        retryable?: boolean;
        authError?: boolean;
    });
}
type DreoClientOptions = {
    email: string;
    password: string;
    logger: DreoLogger;
    debugMode?: boolean;
    timeoutMs?: number;
};
export declare class DreoClient {
    private readonly email;
    private readonly password;
    private readonly logger;
    private readonly debugMode;
    private readonly http;
    private endpoint?;
    private accessToken?;
    private legacyEndpoint?;
    private legacyAccessToken?;
    private legacyRegion;
    constructor(options: DreoClientOptions);
    get tokenInfo(): {
        endpoint?: string;
        region: "NA" | "EU";
        hasToken: boolean;
    };
    login(): Promise<void>;
    getDevices(): Promise<DreoRawDevice[]>;
    getDeviceState(deviceSn: string): Promise<DreoRawState>;
    updateDeviceState(deviceSn: string, desired: Record<string, any>): Promise<Record<string, any>>;
    private requestWithReauth;
    private legacyLogin;
    private getLegacyDevices;
    private getLegacyDeviceState;
    private ensureLegacyAuthenticated;
    private legacyRequest;
    private ensureAuthenticated;
    private request;
    private extractDeviceItems;
    private baseParams;
    private preparePassword;
    private resolveEndpoint;
    private extractTokenRegion;
    private stripTokenRegion;
    private requireEndpoint;
    private requireAccessToken;
    private requireLegacyEndpoint;
    private requireLegacyAccessToken;
    private unwrapData;
    private isObject;
    private debug;
    private debugJson;
    private redactUrl;
    private errorToObject;
}
export {};
