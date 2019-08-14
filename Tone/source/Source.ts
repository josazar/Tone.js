import { Volume } from "../component/channel/Volume";
import "../core/context/Destination";
import { Param } from "../core/context/Param";
import { OutputNode, ToneAudioNode, ToneAudioNodeOptions } from "../core/context/ToneAudioNode";
import { Decibels, Seconds, Time } from "../core/type/Units";
import { defaultArg } from "../core/util/Defaults";
import { noOp, readOnly } from "../core/util/Interface";
import { BasicPlaybackState, StateTimeline } from "../core/util/StateTimeline";
import { isUndef } from "../core/util/TypeCheck";

type onStopCallback = (source: Source<any>) => void;

export interface SourceOptions extends ToneAudioNodeOptions {
	volume: Decibels;
	mute: boolean;
	onstop: onStopCallback;
}

/**
 *  @class  Base class for sources. Sources have start/stop methods
 *          and the ability to be synced to the
 *          start/stop of this.context.transport.
 *
 *  @constructor
 *  @extends {Tone.AudioNode}
 *  @example
 * //Multiple state change events can be chained together,
 * //but must be set in the correct order and with ascending times
 *
 * // OK
 * state.start().stop("+0.2");
 * // AND
 * state.start().stop("+0.2").start("+0.4").stop("+0.7")
 *
 * // BAD
 * state.stop("+0.2").start();
 * // OR
 * state.start("+0.3").stop("+0.2");
 *
 */
export abstract class Source<Options extends SourceOptions> extends ToneAudioNode<Options> {

	/**
	 *  The output volume node
	 */
	private _volume: Volume;

	/**
	 * The output note
	 */
	output: OutputNode;

	/**
	 * Sources have no inputs
	 */
	input = undefined;

	/**
	 * The volume of the output in decibels.
	 * @example
	 * source.volume.value = -6;
	 */
	volume: Param<Decibels>;

	/**
	 * The callback to invoke when the source is stopped.
	 */
	onstop: onStopCallback;

	/**
	 * 	Keep track of the scheduled state.
	 */
	protected _state: StateTimeline<{
		duration?: Seconds;
		offset?: Seconds;
		/**
		 * Either the buffer is explicitly scheduled to end using the stop method,
		 * or it's implicitly ended when the buffer is over.
		 */
		implicitEnd?: boolean;
	}> = new StateTimeline("stopped");

	/**
	 *  The synced `start` callback function from the transport
	 *  @type {Function}
	 *  @private
	 */
	protected _synced = false;

	/**
	 *  Keep track of all of the scheduled event ids
	 */
	private _scheduled: number[] = [];

	/**
	 * Placeholder functions for syncing/unsyncing to transport
	 */
	private _syncedStart: (time: Seconds, offset: Seconds) => void = noOp;
	private _syncedStop: (time: Seconds) => void = noOp;

	constructor(options: SourceOptions) {
		super(options);
		this._state.memory = 100;

		this._volume = this.output = new Volume({
			context: this.context,
			mute: options.mute,
			volume: options.volume,
		});
		this.volume = this._volume.volume;
		readOnly(this, "volume");
		this.onstop = options.onstop;
	}

	static getDefaults(): SourceOptions {
		return Object.assign(ToneAudioNode.getDefaults(), {
			mute: false,
			onstop: noOp,
			volume: 0,
		});
	}

	/**
	 *  Returns the playback state of the source, either "started" or "stopped".
	 */
	get state(): BasicPlaybackState {
		if (this._synced) {
			if (this.context.transport.state === "started") {
				return this._state.getValueAtTime(this.context.transport.seconds) as BasicPlaybackState;
			} else {
				return "stopped";
			}
		} else {
			return this._state.getValueAtTime(this.now()) as BasicPlaybackState;
		}
	}

	/**
	 * Mute the output.
	 * @example
	 * //mute the output
	 * source.mute = true;
	 */
	get mute(): boolean {
		return this._volume.mute;
	}
	set mute(mute: boolean) {
		this._volume.mute = mute;
	}

	// overwrite these functions
	protected abstract _start(time: Time, offset?: Time, duration?: Time): void;
	protected abstract _stop(time: Time): void;
	abstract restart(time: Time, offset?: Time, duration?: Time): this;

	/**
	 *  Start the source at the specified time. If no time is given,
	 *  start the source now.
	 *  @param  time When the source should be started.
	 *  @example
	 * source.start("+0.5"); //starts the source 0.5 seconds from now
	 */
	start(time?: Time, offset?: Time, duration?: Time): this {
		const computedTime = isUndef(time) && this._synced ?
			this.context.transport.seconds : Math.max(this.toSeconds(time), this.context.currentTime);
		this.log("start", computedTime);
		// if it's started, stop it and restart it
		if (this._state.getValueAtTime(computedTime) === "started") {
			this._state.cancel(computedTime);
			this._state.setStateAtTime("started", computedTime);
			this.restart(computedTime, offset, duration);
		} else {
			this._state.setStateAtTime("started", computedTime);
			if (this._synced) {
				// add the offset time to the event
				const event = this._state.get(computedTime);
				if (event) {
					event.offset = this.toSeconds(defaultArg(offset, 0));
					event.duration = duration ? this.toSeconds(duration) : undefined;
				}
				const sched = this.context.transport.schedule(t => {
					this._start(t, offset, duration);
				}, computedTime);
				this._scheduled.push(sched);

				// if it's already started
				if (this.context.transport.state === "started") {
					this._syncedStart(this.now(), this.context.transport.seconds);
				}
			} else {
				this._start(computedTime, offset, duration);
			}
		}
		return this;
	}

	/**
	 *  Stop the source at the specified time. If no time is given,
	 *  stop the source now.
	 *  @param  time When the source should be stopped.
	 *  @example
	 * source.stop(); // stops the source immediately
	 */
	stop(time?: Time): this {
		const computedTime = isUndef(time) && this._synced ?
			this.context.transport.seconds : Math.max(this.toSeconds(time), this.context.currentTime);
		this.log("stop", computedTime);
		if (!this._synced) {
			this._stop(computedTime);
		} else {
			const sched = this.context.transport.schedule(this._stop.bind(this), computedTime);
			this._scheduled.push(sched);
		}
		this._state.cancel(computedTime);
		this._state.setStateAtTime("stopped", computedTime);
		return this;
	}

	/**
	 *  Sync the source to the Transport so that all subsequent
	 *  calls to `start` and `stop` are synced to the TransportTime
	 *  instead of the AudioContext time.
	 *
	 * @example
	 * //sync the source so that it plays between 0 and 0.3 on the Transport's timeline
	 * source.sync().start(0).stop(0.3);
	 * //start the transport.
	 * this.context.transport.start();
	 *
	 * @example
	 * //start the transport with an offset and the sync'ed sources
	 * //will start in the correct position
	 * source.sync().start(0.1);
	 * //the source will be invoked with an offset of 0.4 = (0.5 - 0.1)
	 * this.context.transport.start("+0.5", 0.5);
	 */
	sync(): this {
		if (!this._synced) {
			this._synced = true;
			this._syncedStart = (time, offset) => {
				if (offset > 0) {
					// get the playback state at that time
					const stateEvent = this._state.get(offset);
					// listen for start events which may occur in the middle of the sync'ed time
					if (stateEvent && stateEvent.state === "started" && stateEvent.time !== offset) {
						// get the offset
						const startOffset = offset - this.toSeconds(stateEvent.time);
						let duration;
						if (stateEvent.duration) {
							duration = this.toSeconds(stateEvent.duration) - startOffset;
						}
						this._start(time, this.toSeconds(stateEvent.offset) + startOffset, duration);
					}
				}
			};
			this._syncedStop = time => {
				const seconds = this.context.transport.getSecondsAtTime(Math.max(time - this.sampleTime, 0));
				if (this._state.getValueAtTime(seconds) === "started") {
					this._stop(time);
				}
			};
			this.context.transport.on("start", this._syncedStart);
			this.context.transport.on("loopStart", this._syncedStart);
			this.context.transport.on("stop", this._syncedStop);
			this.context.transport.on("pause", this._syncedStop);
			this.context.transport.on("loopEnd", this._syncedStop);
		}
		return this;
	}

	/**
	 *  Unsync the source to the Transport. See Source.sync
	 */
	unsync(): this {
		if (this._synced) {
			this.context.transport.off("stop", this._syncedStop);
			this.context.transport.off("pause", this._syncedStop);
			this.context.transport.off("loopEnd", this._syncedStop);
			this.context.transport.off("start", this._syncedStart);
			this.context.transport.off("loopStart", this._syncedStart);
		}
		this._synced = false;
		// clear all of the scheduled ids
		this._scheduled.forEach(id => this.context.transport.clear(id));
		this._scheduled = [];
		this._state.cancel(0);
		return this;
	}

	/**
	 * Clean up.
	 */
	dispose(): this {
		super.dispose();
		this.onstop = noOp;
		this.unsync();
		this._volume.dispose();
		this._state.dispose();
		return this;
	}
}
