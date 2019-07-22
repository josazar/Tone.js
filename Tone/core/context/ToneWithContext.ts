import { getContext } from "../Global";
import { Tone } from "../Tone";
import { FrequencyClass } from "../type/Frequency";
import { TimeClass } from "../type/Time";
import { TransportTimeClass } from "../type/TransportTime";
import "../type/Units";
import { getDefaultsFromInstance, omitFromObject, optionsFromArguments } from "../util/Defaults";
import { RecursivePartial } from "../util/Interface";
import { isArray, isDefined, isNumber, isString, isUndef } from "../util/TypeCheck";
import { Context } from "./Context";

/**
 * A unit which process audio
 */
export interface ToneWithContextOptions {
	context: Context;
}

/**
 * The Base class for all nodes that have an AudioContext.
 */
export abstract class ToneWithContext<Options extends ToneWithContextOptions> extends Tone {

	/**
	 * The context belonging to the node.
	 */
	readonly context: Context;

	/**
	 * The default context to use if no AudioContext is passed in to the constructor
	 */
	readonly defaultContext?: Context;

	constructor(context?: Context | Partial<ToneWithContextOptions>) {
		const options = optionsFromArguments(ToneWithContext.getDefaults(), arguments, ["context"]);
		super();
		if (this.defaultContext) {
			this.context = this.defaultContext;
		} else {
			this.context = options.context;
		}
	}

	static getDefaults(): ToneWithContextOptions {
		return {
			context: getContext(),
		};
	}

	/**
	 * Return the current time of the Context clock plus the lookAhead.
	 */
	now(): Seconds {
		return this.context.currentTime + this.context.lookAhead;
	}

	/**
	 * Return the current time of the Context clock without any lookAhead.
	 */
	immediate(): Seconds {
		return this.context.currentTime;
	}

	/**
	 * The duration in seconds of one sample.
	 */
	get sampleTime(): Seconds {
		return 1 / this.context.sampleRate;
	}

	/**
	 * The number of seconds of 1 processing block (128 samples)
	 */
	get blockTime(): Seconds {
		return 128 / this.context.sampleRate;
	}

	/**
	 * Convert the incoming time to seconds
	 */
	toSeconds(time: Time): Seconds {
		return new TimeClass(this.context, time).toSeconds();
	}

	/**
	 * Convert the input to a frequency number
	 */
	toFrequency(freq: Frequency): Hertz {
		return new FrequencyClass(this.context, freq).toFrequency();
	}

	/**
	 * Convert the input time into ticks
	 */
	toTicks(time: Time): Ticks {
		return new TransportTimeClass(this.context, time).toTicks();
	}

	///////////////////////////////////////////////////////////////////////////
	// 	GET/SET
	///////////////////////////////////////////////////////////////////////////

	/**
	 * Get the object's attributes.
	 * @example
	 * osc.get();
	 * //returns {"type" : "sine", "frequency" : 440, ...etc}
	 */
	get(): Options {
		const defaults = getDefaultsFromInstance(this) as Options;
		Object.keys(defaults).forEach(attribute => {
			if (Reflect.has(this, attribute)) {
				const member = this[attribute];
				if (isDefined(member) && isDefined(member.value) && isDefined(member.setValueAtTime)) {
					defaults[attribute] = member.value;
				} else if (member instanceof ToneWithContext) {
					defaults[attribute] = member.get();
				// otherwise make sure it's a serializable type
				} else if (isArray(member) || isNumber(member) || isString(member)) {
					defaults[attribute] = member;
				} else {
					// remove all undefined and unserializable attributes
					delete defaults[attribute];
				}
			}
		});

		return defaults;
	}

	/**
	 * Set the parameters at once. Either pass in an
	 * object mapping parameters to values, or to set a
	 * single parameter, by passing in a string and value.
	 * The last argument is an optional ramp time which
	 * will ramp any signal values to their destination value
	 * over the duration of the rampTime.
	 * @param  params
	 * @example
	 * //set values using an object
	 * filter.set({
	 * 	"frequency" : 300,
	 * 	"type" : "highpass"
	 * });
	 */
	set(props: RecursivePartial<Options>): this {
		Object.keys(props).forEach(attribute => {
			if (Reflect.has(this, attribute) && isDefined(this[attribute])) {
				if (isDefined(this[attribute].value) && isDefined(this[attribute].setValueAtTime)) {
					this[attribute].value = props[attribute];
				} else if (this[attribute] instanceof ToneWithContext) {
					this[attribute].set(props[attribute]);
				} else {
					this[attribute] = props[attribute];
				}
			}
		});
		return this;
	}
}