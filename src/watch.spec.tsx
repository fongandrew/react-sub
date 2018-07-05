import * as React from 'react';
import { mount } from 'enzyme';
import { watch, SubscriptionManager } from './';


// Create two mock subscription managers to test multiple manager interaction

const get1 = jest.fn(key => `get1-${key}`);
const subscribe1 = jest.fn();
const unsubscribe1 = jest.fn();
let deferred1 = () => {};
const updateSubscription1 = jest.fn((fn) => { deferred1 = fn; });
let manager1: SubscriptionManager<string, string>;
const createManager1 = () => {
    manager1 = new SubscriptionManager({
        get: get1,
        subscribe: subscribe1,
        unsubscribe: unsubscribe1,
        updateSubscription: updateSubscription1,
    });
};

const get2 = jest.fn(key => `get2-${key}`);
const subscribe2 = jest.fn();
const unsubscribe2 = jest.fn();
let deferred2 = () => {};
const updateSubscription2 = jest.fn((fn) => { deferred2 = fn; });
let manager2: SubscriptionManager<string, string>;
const createManager2 = () => {
    manager2 = new SubscriptionManager({
        get: get2,
        subscribe: subscribe2,
        unsubscribe: unsubscribe2,
        updateSubscription: updateSubscription2,
    });
};


// Mock component just spits out queries as is

interface Props {
    q1: string[];
    q2: string[];
}
const WatchedComponent = watch(({ q1, q2 }: Props) => <div>
    { q1.map(key => <span key={`get1-${key}`} id={manager1.get(key)} />) }
    { q2.map(key => <span key={`get2-${key}`} id={manager2.get(key)} />) }
</div>);


// Actual tests

describe('Watch', () => {
    beforeEach(() => {
        // Re(set) managers
        createManager1();
        createManager2();
    });

    it('batches subscribe calls per manager', () => {
        const wrapper = mount(<WatchedComponent
            q1={['p1a', 'p1b']}
            q2={['p2a', 'p2b']}
        />);
        expect(wrapper.find('#get1-p1a')).toHaveLength(1);
        expect(wrapper.find('#get1-p1b')).toHaveLength(1);
        expect(wrapper.find('#get2-p2a')).toHaveLength(1);
        expect(wrapper.find('#get2-p2b')).toHaveLength(1);

        expect(updateSubscription1).toHaveBeenCalledTimes(1);
        expect(updateSubscription2).toHaveBeenCalledTimes(1);
        expect(subscribe1).not.toHaveBeenCalled();
        expect(subscribe2).not.toHaveBeenCalled();

        deferred1();
        expect(subscribe1).toHaveBeenCalledTimes(1);
        expect(subscribe1).toHaveBeenCalledWith(['p1a', 'p1b']);
        expect(unsubscribe1).not.toHaveBeenCalled();

        deferred2();
        expect(subscribe2).toHaveBeenCalledTimes(1);
        expect(subscribe2).toHaveBeenCalledWith(['p2a', 'p2b']);
        expect(unsubscribe2).not.toHaveBeenCalled();
    });

    it('does not subscribe to queries no longer needed', () => {
        const wrapper = mount(<WatchedComponent
            q1={['p1a']}
            q2={['p2a']}
        />);
        wrapper.setProps({
            q1: ['p1b'],
            q2: [],
        });
        expect(updateSubscription1).toHaveBeenCalledTimes(1);
        expect(updateSubscription2).toHaveBeenCalledTimes(1);

        deferred1();
        expect(subscribe1).toHaveBeenCalledTimes(1);
        expect(subscribe1).toHaveBeenCalledWith(['p1b']);
        expect(unsubscribe1).not.toHaveBeenCalled();

        deferred2();
        expect(subscribe2).not.toHaveBeenCalled();
        expect(unsubscribe2).not.toHaveBeenCalled();
    });

    it('unsubscribes from queries on prop change after subscribing', () => {
        const wrapper = mount(<WatchedComponent
            q1={['p1a']}
            q2={['p2a']}
        />);
        deferred1();
        deferred2();

        wrapper.setProps({
            q1: ['p1b'],
            q2: [],
        });
        deferred1();
        deferred2();

        expect(updateSubscription1).toHaveBeenCalledTimes(2);
        expect(subscribe1).toHaveBeenCalledTimes(2);
        expect(subscribe1).toHaveBeenCalledWith(['p1a']);
        expect(subscribe1).toHaveBeenCalledWith(['p1b']);
        expect(unsubscribe1).toHaveBeenCalledTimes(1);
        expect(unsubscribe1).toHaveBeenCalledWith(['p1a']);

        expect(updateSubscription2).toHaveBeenCalledTimes(2);
        expect(subscribe2).toHaveBeenCalledTimes(1);
        expect(subscribe2).toHaveBeenCalledWith(['p2a']);
        expect(unsubscribe2).toHaveBeenCalledTimes(1);
        expect(unsubscribe2).toHaveBeenCalledWith(['p2a']);
    });

    it('unsubscribes on unmount', () => {
        const wrapper = mount(<WatchedComponent
            q1={['p1a']}
            q2={['p2a']}
        />);
        deferred1();
        deferred2();

        wrapper.unmount();
        deferred1();
        deferred2();

        expect(updateSubscription1).toHaveBeenCalledTimes(2);
        expect(unsubscribe1).toHaveBeenCalledTimes(1);
        expect(unsubscribe1).toHaveBeenCalledWith(['p1a']);
        expect(updateSubscription2).toHaveBeenCalledTimes(2);
        expect(unsubscribe2).toHaveBeenCalledTimes(1);
        expect(unsubscribe2).toHaveBeenCalledWith(['p2a']);
    });

    it('batches subscription updates across multiple component instances', () => {
        mount(<WatchedComponent
            q1={['p1a']}
            q2={['p2a']}
        />);

        mount(<WatchedComponent
            q1={['p1a', 'p1b']}
            q2={['p2b']}
        />);

        expect(updateSubscription1).toHaveBeenCalledTimes(1);
        expect(updateSubscription2).toHaveBeenCalledTimes(1);
        expect(subscribe1).not.toHaveBeenCalled();
        expect(subscribe2).not.toHaveBeenCalled();

        deferred1();
        expect(subscribe1).toHaveBeenCalledTimes(1);
        expect(subscribe1).toHaveBeenCalledWith(['p1a', 'p1b']);
        expect(unsubscribe1).not.toHaveBeenCalled();

        deferred2();
        expect(subscribe2).toHaveBeenCalledTimes(1);
        expect(subscribe2).toHaveBeenCalledWith(['p2a', 'p2b']);
        expect(unsubscribe2).not.toHaveBeenCalled();
    });

    it('batches unsubscribes across multiple components', () => {
        const wrapper1 = mount(<WatchedComponent
            q1={['p1a']}
            q2={['p2a']}
        />);
        const wrapper2 = mount(<WatchedComponent
            q1={['p1b']}
            q2={['p2b']}
        />);
        deferred1();
        deferred2();

        wrapper1.setProps({
            q1: [],
            q2: ['p2b'], // Fromerly in wrapper2
        });
        wrapper2.setProps({
            q1: ['p1a'], // Formerly i wrapper1
            q2: [],
        });
        deferred1();
        deferred2();

        expect(updateSubscription1).toHaveBeenCalledTimes(2);
        expect(subscribe1).toHaveBeenCalledTimes(1);
        expect(subscribe1).toHaveBeenCalledWith(['p1a', 'p1b']);
        expect(unsubscribe1).toHaveBeenCalledTimes(1);
        expect(unsubscribe1).toHaveBeenCalledWith(['p1b']);

        expect(updateSubscription2).toHaveBeenCalledTimes(2);
        expect(subscribe2).toHaveBeenCalledTimes(1);
        expect(subscribe2).toHaveBeenCalledWith(['p2a', 'p2b']);
        expect(unsubscribe2).toHaveBeenCalledTimes(1);
        expect(unsubscribe2).toHaveBeenCalledWith(['p2a']);
    });

    it('updates components when manager updates all queries', () => {
        const wrapper1 = mount(<WatchedComponent
            q1={['p1a', 'p1b']}
            q2={['p2a']}
        />);
        const wrapper2 = mount(<WatchedComponent
            q1={['p1b']}
            q2={['p2a', 'p2b']}
        />);

        const forceUpdate1 = jest.spyOn(wrapper1.instance(), 'forceUpdate');
        const forceUpdate2 = jest.spyOn(wrapper2.instance(), 'forceUpdate');

        manager1.updateQueries();
        expect(forceUpdate1).toHaveBeenCalledTimes(1);
        expect(forceUpdate2).toHaveBeenCalledTimes(1);

        manager2.updateQueries();
        expect(forceUpdate1).toHaveBeenCalledTimes(2);
        expect(forceUpdate2).toHaveBeenCalledTimes(2);
    });

    it('updates components when manager updates queries by ID', () => {
        const wrapper1 = mount(<WatchedComponent
            q1={['p1a', 'p1b']}
            q2={['p2a']}
        />);
        const wrapper2 = mount(<WatchedComponent
            q1={['p1b']}
            q2={['p2b']}
        />);

        const forceUpdate1 = jest.spyOn(wrapper1.instance(), 'forceUpdate');
        const forceUpdate2 = jest.spyOn(wrapper2.instance(), 'forceUpdate');

        manager1.updateQueries(['p1a']);
        expect(forceUpdate1).toHaveBeenCalledTimes(1);
        expect(forceUpdate2).toHaveBeenCalledTimes(0);

        manager2.updateQueries(['p2a', 'p2b']);
        expect(forceUpdate1).toHaveBeenCalledTimes(2);
        expect(forceUpdate2).toHaveBeenCalledTimes(1);
    });

    it('updates components when manager updates queries by test function', () => {
        const wrapper1 = mount(<WatchedComponent
            q1={['p1a']}
            q2={['p2a']}
        />);
        const wrapper2 = mount(<WatchedComponent
            q1={[]}
            q2={['p2a', 'p2b', 'p2c']}
        />);

        const forceUpdate1 = jest.spyOn(wrapper1.instance(), 'forceUpdate');
        const forceUpdate2 = jest.spyOn(wrapper2.instance(), 'forceUpdate');

        manager1.updateQueries(query => query.endsWith('a'));
        expect(forceUpdate1).toHaveBeenCalledTimes(1);
        expect(forceUpdate2).toHaveBeenCalledTimes(0);

        manager2.updateQueries(query => query.startsWith('p'));
        expect(forceUpdate1).toHaveBeenCalledTimes(2);
        expect(forceUpdate2).toHaveBeenCalledTimes(1);
    });
});
