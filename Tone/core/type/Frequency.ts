import { getContext } from "../Global";
import { intervalToFrequencyRatio, mtof } from "./Conversions";
import { ftom, getA4, setA4 } from "./Conversions";
import { TimeClass } from "./Time";
import { TimeBaseClass, TimeBaseUnit, TimeExpression, TimeValue } from "./TimeBase";
import { Frequency, Hertz, Interval, MidiNote, Note, Seconds, Ticks } from "./Units";

export type FrequencyUnit = TimeBaseUnit | "midi";

/**
 * Frequency is a primitive type for encoding Frequency values.
 * Eventually all time values are evaluated to hertz using the `eval` method.
 * @example
 * Frequency("C3") // 261
 * Frequency(38, "midi") //
 * Frequency("C3").transpose(4);
 */
export class FrequencyClass<Type extends number = Hertz> extends TimeClass<Type, FrequencyUnit> {

	name = "Frequency";

	readonly defaultUnits: FrequencyUnit = "hz";

	/**
	 * The [concert tuning pitch](https://en.wikipedia.org/wiki/Concert_pitch) which is used
	 * to generate all the other pitch values from notes. A4's values in Hertz.
	 */
	static get A4(): Hertz {
		return getA4();
	}
	static set A4(freq: Hertz) {
		setA4(freq);
	}

	///////////////////////////////////////////////////////////////////////////
	// 	AUGMENT BASE EXPRESSIONS
	///////////////////////////////////////////////////////////////////////////

	protected _getExpressions(): TimeExpression<Type> {
		return Object.assign({}, super._getExpressions(), {
			midi : {
				regexp : /^(\d+(?:\.\d+)?midi)/,
				method(value): number {
					if (this.defaultUnits === "midi") {
						return value;
					} else {
						return FrequencyClass.mtof(value);
					}
				},
			},
			note : {
				regexp : /^([a-g]{1}(?:b|#|x|bb)?)(-?[0-9]+)/i,
				method(pitch, octave): number {
					const index = noteToScaleIndex[pitch.toLowerCase()];
					const noteNumber = index + (parseInt(octave, 10) + 1) * 12;
					if (this.defaultUnits === "midi") {
						return noteNumber;
					} else {
						return FrequencyClass.mtof(noteNumber);
					}
				},
			},
			tr : {
				regexp : /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?):?(\d+(?:\.\d+)?)?/,
				method(m, q, s): number {
					let total = 1;
					if (m && m !== "0") {
						total *= this._beatsToUnits(this._getTimeSignature() * parseFloat(m));
					}
					if (q && q !== "0") {
						total *= this._beatsToUnits(parseFloat(q));
					}
					if (s && s !== "0") {
						total *= this._beatsToUnits(parseFloat(s) / 4);
					}
					return total;
				},
			},
		});
	}

	///////////////////////////////////////////////////////////////////////////
	// 	EXPRESSIONS
	///////////////////////////////////////////////////////////////////////////

	/**
	 *  Transposes the frequency by the given number of semitones.
	 *  @return  A new transposed frequency
	 *  @example
	 * Frequency("A4").transpose(3); //"C5"
	 */
	transpose(interval: Interval): FrequencyClass {
		return new FrequencyClass(this.context, this.valueOf() * intervalToFrequencyRatio(interval));
	}

	/**
	 *  Takes an array of semitone intervals and returns
	 *  an array of frequencies transposed by those intervals.
	 *  @return  Returns an array of Frequencies
	 *  @example
	 * Frequency("A4").harmonize([0, 3, 7]); //["A4", "C5", "E5"]
	 */
	harmonize(intervals: Interval[]): FrequencyClass[] {
		return intervals.map(interval => {
			return this.transpose(interval);
		});
	}

	///////////////////////////////////////////////////////////////////////////
	// 	UNIT CONVERSIONS
	///////////////////////////////////////////////////////////////////////////

	/**
	 * Return the value of the frequency as a MIDI note
	 * @example
	 * Frequency("C4").toMidi(); //60
	 */
	toMidi(): MidiNote {
		return ftom(this.valueOf());
	}

	/**
	 * Return the value of the frequency in Scientific Pitch Notation
	 * @example
	 * Frequency(69, "midi").toNote(); //"A4"
	 */
	toNote(): Note {
		const freq = this.toFrequency();
		const log = Math.log2(freq / FrequencyClass.A4);
		let noteNumber = Math.round(12 * log) + 57;
		const octave = Math.floor(noteNumber / 12);
		if (octave < 0) {
			noteNumber += -12 * octave;
		}
		const noteName = scaleIndexToNote[noteNumber % 12];
		return noteName + octave.toString() as Note;
	}

	/**
	 *  Return the duration of one cycle in seconds.
	 */
	toSeconds(): Seconds {
		return 1 / super.toSeconds();
	}

	/**
	 *  Return the duration of one cycle in ticks
	 */
	toTicks(): Ticks {
		const quarterTime = this._beatsToUnits(1);
		const quarters = this.valueOf() / quarterTime;
		return Math.floor(quarters * this._getPPQ());
	}

	///////////////////////////////////////////////////////////////////////////
	// 	UNIT CONVERSIONS HELPERS
	///////////////////////////////////////////////////////////////////////////

	/**
	 *  With no arguments, return 0
	 */
	protected _noArg(): Type {
		return 0 as Type;
	}

	/**
	 *  Returns the value of a frequency in the current units
	 */
	protected _frequencyToUnits(freq: Hertz): Type {
		return freq as Type;
	}

	/**
	 *  Returns the value of a tick in the current time units
	 */
	protected _ticksToUnits(ticks: Ticks): Type {
		return 1 / ((ticks * 60) / (this._getBpm() * this._getPPQ())) as Type;
	}

	/**
	 *  Return the value of the beats in the current units
	 */
	protected _beatsToUnits(beats: number): Type {
		return 1 / super._beatsToUnits(beats) as Type;
	}

	/**
	 *  Returns the value of a second in the current units
	 */
	protected _secondsToUnits(seconds: Seconds): Type {
		return 1 / seconds as Type;
	}

	/**
	 * Convert a MIDI note to frequency value.
	 * @param  midi The midi number to convert.
	 * @return The corresponding frequency value
	 * @example
	 * FrequencyClass.mtof(69); // returns 440
	 */
	static mtof(midi: MidiNote): Hertz {
		return mtof(midi);
	}

	/**
	 * Convert a frequency value to a MIDI note.
	 * @param frequency The value to frequency value to convert.
	 * @example
	 * Frequency.ftom(440); // returns 69
	 */
	static ftom(frequency: Hertz): MidiNote {
		return ftom(frequency);
	}
}

///////////////////////////////////////////////////////////////////////////
// 	FREQUENCY CONVERSIONS
///////////////////////////////////////////////////////////////////////////

/**
 *  Note to scale index
 *  @type  {Object}
 *  @private
 */
const noteToScaleIndex = {
	// tslint:disable-next-line
	"cbb" : -2, "cb" : -1, "c" : 0, "c#" : 1, "cx" : 2,
	"dbb" : 0, "db" : 1, "d" : 2, "d#" : 3, "dx" : 4,
	"ebb" : 2, "eb" : 3, "e" : 4, "e#" : 5, "ex" : 6,
	"fbb" : 3, "fb" : 4, "f" : 5, "f#" : 6, "fx" : 7,
	"gbb" : 5, "gb" : 6, "g" : 7, "g#" : 8, "gx" : 9,
	"abb" : 7, "ab" : 8, "a" : 9, "a#" : 10, "ax" : 11,
	"bbb" : 9, "bb" : 10, "b" : 11, "b#" : 12, "bx" : 13,
};

/**
 *  scale index to note (sharps)
 *  @type  {Array}
 *  @private
 */
const scaleIndexToNote = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Convert a value into a FrequencyClass object.
 */
export function Frequency(value?: TimeValue | Frequency, units?: FrequencyUnit): FrequencyClass {
	return new FrequencyClass(getContext(), value, units);
}