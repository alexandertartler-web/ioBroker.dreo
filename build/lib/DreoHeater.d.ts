import { DreoClient, DreoRawDevice } from "./DreoClient";
import { DeviceStateValue, DreoDevice } from "./DreoDevice";
export declare const HEATER_MODES: readonly ["coolair", "hotair", "eco", "off"];
export type DreoHeaterMode = (typeof HEATER_MODES)[number];
export declare class DreoHeater extends DreoDevice {
    constructor(rawDevice: DreoRawDevice, client: DreoClient);
    getCommonStates(): Record<string, DeviceStateValue>;
    supportsControl(control: string): boolean;
    setControl(control: string, value: any): Promise<Record<string, any>>;
    private getOscillationState;
    private sendOscillation;
    private sendAndApply;
    private normalizeMode;
    private durationFromTimer;
    private hasProperty;
    private toInteger;
}
