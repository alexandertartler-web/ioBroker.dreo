"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DreoHeater = exports.HEATER_MODES = void 0;
const DreoDevice_1 = require("./DreoDevice");
exports.HEATER_MODES = ["coolair", "hotair", "eco", "off"];
const COMMANDS = {
    power: "poweron",
    heatLevel: "htalevel",
    currentTemperature: "temperature",
    targetTemperature: "ecolevel",
    mode: "mode",
    oscillation: "oscon",
    oscillationAngle: "oscangle",
    oscillationMode: "oscmode",
    timerOn: "timeron",
    timerOff: "timeroff",
    fanSpeed: "windlevel",
};
const OSCILLATION_LABEL_TO_OSCMODE = {
    off: 0,
    oscillate: 1,
    "60": 2,
    "90": 3,
    "120": 4,
};
class DreoHeater extends DreoDevice_1.DreoDevice {
    constructor(rawDevice, client) {
        super(rawDevice, client);
    }
    getCommonStates() {
        const temperature = this.getStateValue(COMMANDS.currentTemperature);
        const tempOffset = this.getStateValue("tempoffset");
        const calibratedTemperature = typeof temperature === "number" && typeof tempOffset === "number" ? temperature + tempOffset : temperature;
        const timerOn = this.durationFromTimer(this.getStateValue(COMMANDS.timerOn));
        const timerOff = this.durationFromTimer(this.getStateValue(COMMANDS.timerOff));
        return {
            ...super.getCommonStates(),
            "status.power": this.getStateValue(COMMANDS.power),
            "status.currentTemperature": calibratedTemperature,
            "status.targetTemperature": this.getStateValue(COMMANDS.targetTemperature),
            "status.mode": this.getStateValue(COMMANDS.mode),
            "status.fanSpeed": this.getStateValue(COMMANDS.heatLevel) ?? this.getStateValue(COMMANDS.fanSpeed),
            "status.oscillation": this.getOscillationState(),
            "status.timer": timerOff ?? timerOn,
        };
    }
    supportsControl(control) {
        switch (control) {
            case "power":
                return this.hasCapability(COMMANDS.power);
            case "targetTemperature":
                return this.hasCapability(COMMANDS.targetTemperature);
            case "mode":
                return this.hasCapability(COMMANDS.mode);
            case "fanSpeed":
                return this.hasCapability(COMMANDS.heatLevel) || this.hasCapability(COMMANDS.fanSpeed);
            case "oscillation":
                return this.hasCapability(COMMANDS.oscillation) || this.hasCapability(COMMANDS.oscillationAngle) || this.hasCapability(COMMANDS.oscillationMode);
            default:
                return super.supportsControl(control);
        }
    }
    async setControl(control, value) {
        switch (control) {
            case "power":
                return await this.sendAndApply({ [COMMANDS.power]: this.toBoolean(value) });
            case "targetTemperature":
                return await this.sendAndApply({ [COMMANDS.targetTemperature]: this.toInteger(value) });
            case "mode":
                return await this.sendAndApply({ [COMMANDS.mode]: this.normalizeMode(value) });
            case "fanSpeed":
                return await this.sendAndApply({ [COMMANDS.heatLevel]: this.toInteger(value) });
            case "oscillation":
                return await this.sendOscillation(value);
            default:
                return await super.setControl(control, value);
        }
    }
    getOscillationState() {
        const oscMode = this.getStateValue(COMMANDS.oscillationMode);
        if (typeof oscMode === "number")
            return oscMode;
        const oscAngle = this.getStateValue(COMMANDS.oscillationAngle);
        if (typeof oscAngle === "number")
            return oscAngle;
        return this.getStateValue(COMMANDS.oscillation);
    }
    async sendOscillation(value) {
        if (typeof value === "number") {
            if (this.hasProperty(COMMANDS.oscillationMode))
                return await this.sendAndApply({ [COMMANDS.oscillationMode]: value });
            if (this.hasProperty(COMMANDS.oscillationAngle))
                return await this.sendAndApply({ [COMMANDS.oscillationAngle]: value });
        }
        if (typeof value === "string") {
            const normalized = value.toLowerCase().replace(/[^0-9a-z]/g, "");
            if (normalized in OSCILLATION_LABEL_TO_OSCMODE && this.hasProperty(COMMANDS.oscillationMode)) {
                return await this.sendAndApply({ [COMMANDS.oscillationMode]: OSCILLATION_LABEL_TO_OSCMODE[normalized] });
            }
            if (["60", "90", "120", "0"].includes(normalized) && this.hasProperty(COMMANDS.oscillationAngle)) {
                return await this.sendAndApply({ [COMMANDS.oscillationAngle]: Number(normalized) });
            }
        }
        // TODO: Some heater firmware exposes oscmode/oscangle instead of oscon.
        // If neither feature is visible in the latest state, use oscon as the safe
        // legacy command and rely on debug logs/rawData to refine model support.
        return await this.sendAndApply({ [COMMANDS.oscillation]: this.toBoolean(value) });
    }
    async sendAndApply(desired) {
        const result = await this.sendCommand(desired);
        this.applyReportedUpdate(desired);
        return result;
    }
    normalizeMode(value) {
        const mode = String(value).toLowerCase();
        if (exports.HEATER_MODES.includes(mode))
            return mode;
        throw new Error(`Invalid Dreo heater mode: ${value}. Expected one of: ${exports.HEATER_MODES.join(", ")}`);
    }
    durationFromTimer(value) {
        if (typeof value === "number")
            return value;
        if (value && typeof value === "object" && typeof value.du === "number")
            return value.du;
        return null;
    }
    hasProperty(key) {
        return this.hasCapability(key);
    }
    toInteger(value) {
        const parsed = Number.parseInt(String(value), 10);
        if (!Number.isFinite(parsed))
            throw new Error(`Expected integer value, got: ${value}`);
        return parsed;
    }
}
exports.DreoHeater = DreoHeater;
//# sourceMappingURL=DreoHeater.js.map