
import Synthesizer from './Synthesizer';
import waitForReady from './waitForReady';

import {
	Constants,
	SynthesizerStatus
} from './AudioWorkletNodeSynthesizer';

import {
	initializeReturnPort,
	postReturn,
	postReturnError,
    ReturnMessageInstance
} from './MethodMessaging';

const promiseWasmInitialized = waitForReady();

/** Registers processor using Synthesizer for AudioWorklet. */
export default function registerAudioWorkletProcessor() {
	/**
	 * The processor using Synthesizer
	 */
	class Processor extends AudioWorkletProcessor {

		private synth: Synthesizer | undefined;
		private _messaging: ReturnMessageInstance;

		constructor(options: AudioWorkletNodeOptions) {
			super(options);

			const promiseInitialized = this.doInit();
			this._messaging = initializeReturnPort(this.port, promiseInitialized, () => this.synth!, (data) => {
				if (data.method === 'init') {
					this.synth!.init(sampleRate);
					return true;
				} else if (data.method === 'createSequencer') {
					this.doCreateSequencer(data.args[0]).then(() => {
						postReturn(this._messaging!, data.id, data.method, void (0));
					});
					return true;
				} else if (data.method === 'hookPlayerMIDIEventsByName') {
					const r = this.doHookPlayerMIDIEvents(data.args[0]);
					if (r) {
						postReturn(this._messaging!, data.id, data.method, void (0));
					} else {
						postReturnError(this._messaging!, data.id, data.method, new Error('Name not found'));
					}
					return true;
				}
				return false;
			});
		}

		private async doInit() {
			await promiseWasmInitialized;
			this.synth = new Synthesizer();
			this.synth.init(sampleRate);
		}

		private doCreateSequencer(port: MessagePort): Promise<void> {
			return Synthesizer.createSequencer().then((seq) => {
				initializeReturnPort(port, null, () => seq);
			});
		}

		private doHookPlayerMIDIEvents(name: string | null | undefined) {
			if (!name) {
				this.synth!.hookPlayerMIDIEvents(null);
				return true;
			}
			const fn: any = (AudioWorkletGlobalScope[name]);
			if (fn && typeof fn === 'function') {
				this.synth!.hookPlayerMIDIEvents(fn);
				return true;
			}
			return false;
		}

		public process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
			if (!this.synth) {
				return true;
			}
			const syn = this.synth!;
			syn.render(outputs[0]);
			postReturn(this._messaging, -1, Constants.UpdateStatus, {
				playing: syn.isPlaying(),
				playerPlaying: syn.isPlayerPlaying()
			} as SynthesizerStatus);
			return true;
		}
	}

	registerProcessor(Constants.ProcessorName, Processor);
}
