import { config, SubscriptionManager } from './';

describe('SubscriptionManager', () => {
    const get = jest.fn(() => 123);
    const subscribe = jest.fn();
    const unsubscribe = jest.fn();

    // Clone and restore config between tests
    let configOriginal: any = {};
    beforeEach(() => {
        configOriginal = { ...config };
    });
    afterEach(() => {
        Object.keys(configOriginal).forEach((key) => {
            (<any> config)[key] = configOriginal[key];
        });
    });

    it('does not allow get outside context by default', () => {
        const manager = new SubscriptionManager({
            get,
            subscribe,
            unsubscribe,
        });
        expect(() => manager.get('testQuery')).toThrowError();
    });

    it('allows get outside context if config is set', () => {
        config.noGetOutsideContext = false;
        const manager = new SubscriptionManager({
            get,
            subscribe,
            unsubscribe,
        });
        expect(manager.get('testQuery')).toEqual(123);
        expect(get).toHaveBeenCalledWith('testQuery');
    });
});