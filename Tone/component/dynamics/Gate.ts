import { ToneAudioNode, ToneAudioNodeOptions } from "../../core/context/ToneAudioNode";
import { Decibels, Time } from "../../core/type/Units";
import { GreaterThan } from "../../signal/GreaterThan";
import { Gain } from "../../core/context/Gain";
import { Follower } from "../analysis/Follower";
import { optionsFromArguments } from "../../core/util/Defaults";
import { dbToGain, gainToDb } from "../../core/type/Conversions";

export interface GateOptions extends ToneAudioNodeOptions {
	threshold: Decibels;
	smoothing: Time;
}

/**
 * Gate only passes a signal through when the incoming
 * signal exceeds a specified threshold. It uses [[Follower]] to follow the ampltiude
 * of the incoming signal and compares it to the [[threshold]] value using [[GreaterThan]].
 *
 * @example
 * import { Gate, UserMedia } from "tone";
 * const gate = new Gate(-30, 0.2).toDestination();
 * const mic = new UserMedia().connect(gate);
 * // the gate will only pass through the incoming
 * // signal when it's louder than -30db
 */
export class Gate extends ToneAudioNode<GateOptions> {

	readonly name: string = "Gate";

	readonly input: ToneAudioNode;
	readonly output: ToneAudioNode;

	/**
	 * Follow the incoming signal
	 */
	private _follower: Follower;

	/**
	 * Test if it's greater than the threshold
	 */
	private _gt: GreaterThan;

	/**
	 * Gate the incoming signal when it does not exceed the threshold
	 */
	private _gate: Gain;
	
	/**
	 * @param threshold The threshold above which the gate will open.
	 * @param smoothing The follower's smoothing time
	 */
	constructor(threshold?: Decibels, smoothing?: Time);
	constructor(options?: Partial<GateOptions>);
	constructor() {
		super(Object.assign(optionsFromArguments(Gate.getDefaults(), arguments, ["threshold", "smoothing"])));
		const options = optionsFromArguments(Gate.getDefaults(), arguments, ["threshold", "smoothing"]);

		this._follower = new Follower({
			context: this.context,
			smoothing: options.smoothing,
		});
		this._gt = new GreaterThan({
			context: this.context,
			value: dbToGain(options.threshold),
		});
		this.input = new Gain({ context: this.context });
		this._gate = this.output = new Gain({ context: this.context });

		// connections
		this.input.connect(this._gate);
		// the control signal
		this.input.chain(this._follower, this._gt, this._gate.gain);
	}

	static getDefaults(): GateOptions {
		return Object.assign(ToneAudioNode.getDefaults(), {
			smoothing: 0.1,
			threshold: -40
		});
	}

	/**
	 * The threshold of the gate in decibels
	 */
	get threshold(): Decibels {
		return gainToDb(this._gt.value);
	}
	set threshold(thresh) {
		this._gt.value = dbToGain(thresh);
	}

	/**
	 * The attack/decay speed of the gate. See [[Follower.smoothing]]
	 */
	get smoothing(): Time {
		return this._follower.smoothing;
	}
	set smoothing(smoothingTime) {
		this._follower.smoothing = smoothingTime;
	}

	dispose(): this {
		super.dispose();
		this.input.dispose();
		this._follower.dispose();
		this._gt.dispose();
		this._gate.dispose();
		return this;
	}
}
