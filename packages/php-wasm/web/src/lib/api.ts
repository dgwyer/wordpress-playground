import { PHPResponse, PHPResponseData } from '@php-wasm/universal';
import * as Comlink from 'comlink';

export type WithAPIState = {
	/**
	 * Resolves to true when the remote API is ready for
	 * Comlink communication, but not necessarily fully initialized yet.
	 */
	isConnected: () => Promise<void>;
	/**
	 * Resolves to true when the remote API is declares it's
	 * fully loaded and ready to be used.
	 */
	isReady: () => Promise<void>;
};
export type RemoteAPI<T> = Comlink.Remote<T> & WithAPIState;

export function consumeAPI<APIType>(
	remote: Worker | Window
): RemoteAPI<APIType> {
	setupTransferHandlers();

	const endpoint =
		remote instanceof Worker ? remote : Comlink.windowEndpoint(remote);

	/**
	 * This shouldn't be necessary, but Comlink doesn't seem to
	 * handle the initial isConnected() call correctly unless it's
	 * explicitly provided here. This is especially weird
	 * since the only thing this proxy does is to call the
	 * isConnected() method on the remote API.
	 *
	 * @TODO: Remove this workaround.
	 */
	const api = Comlink.wrap<APIType & WithAPIState>(endpoint);
	const methods = proxyClone(api);
	return new Proxy(methods, {
		get: (target, prop) => {
			if (prop === 'isConnected') {
				return async () => {
					/*
					 * If exposeAPI() is called after this function,
					 * the isConnected() call will hang forever. Let's
					 * retry it a few times.
					 */
					for (let i = 0; i < 10; i++) {
						try {
							await runWithTimeout(api.isConnected(), 200);
							break;
						} catch (e) {
							// Timeout exceeded, try again
						}
					}
				};
			}
			return (api as any)[prop];
		},
	}) as unknown as RemoteAPI<APIType>;
}

async function runWithTimeout<T>(
	promise: Promise<T>,
	timeout: number
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		setTimeout(reject, timeout);
		promise.then(resolve);
	});
}

export type PublicAPI<Methods, PipedAPI = unknown> = RemoteAPI<
	Methods & PipedAPI
>;
export function exposeAPI<Methods, PipedAPI>(
	apiMethods?: Methods,
	pipedApi?: PipedAPI
): [() => void, PublicAPI<Methods, PipedAPI>] {
	setupTransferHandlers();

	const connected = Promise.resolve();

	let setReady: any;
	const ready = new Promise((resolve) => {
		setReady = resolve;
	});

	const methods = proxyClone(apiMethods);
	const exposedApi = new Proxy(methods, {
		get: (target, prop) => {
			if (prop === 'isConnected') {
				return () => connected;
			} else if (prop === 'isReady') {
				return () => ready;
			} else if (prop in target) {
				return target[prop];
			}
			return (pipedApi as any)?.[prop];
		},
	}) as unknown as PublicAPI<Methods, PipedAPI>;

	Comlink.expose(
		exposedApi,
		typeof window !== 'undefined'
			? Comlink.windowEndpoint(self.parent)
			: undefined
	);
	return [setReady, exposedApi];
}

let isTransferHandlersSetup = false;
function setupTransferHandlers() {
	if (isTransferHandlersSetup) {
		return;
	}
	isTransferHandlersSetup = true;
	Comlink.transferHandlers.set('EVENT', {
		canHandle: (obj): obj is CustomEvent => obj instanceof CustomEvent,
		serialize: (ev: CustomEvent) => {
			return [
				{
					detail: ev.detail,
				},
				[],
			];
		},
		deserialize: (obj) => obj,
	});
	Comlink.transferHandlers.set('FUNCTION', {
		canHandle: (obj: unknown): obj is Function => typeof obj === 'function',
		serialize(obj: Function) {
			console.debug('[Comlink][Performance] Proxying a function');
			const { port1, port2 } = new MessageChannel();
			Comlink.expose(obj, port1);
			return [port2, [port2]];
		},
		deserialize(port: any) {
			port.start();
			return Comlink.wrap(port);
		},
	});
	Comlink.transferHandlers.set('PHPResponse', {
		canHandle: (obj: unknown): obj is PHPResponseData =>
			typeof obj === 'object' &&
			obj !== null &&
			'headers' in obj &&
			'bytes' in obj &&
			'errors' in obj &&
			'exitCode' in obj &&
			'httpStatusCode' in obj,
		serialize(obj: PHPResponse): [PHPResponseData, Transferable[]] {
			return [obj.toRawData(), []];
		},
		deserialize(responseData: PHPResponseData): PHPResponse {
			return PHPResponse.fromRawData(responseData);
		},
	});
}

function proxyClone(object: any): any {
	return new Proxy(object, {
		get(target, prop) {
			switch (typeof target[prop]) {
				case 'function':
					return (...args: any[]) => target[prop](...args);
				case 'object':
					if (target[prop] === null) {
						return target[prop];
					}
					return proxyClone(target[prop]);
				case 'undefined':
				case 'number':
				case 'string':
					return target[prop];
				default:
					return Comlink.proxy(target[prop]);
			}
		},
	});
}
