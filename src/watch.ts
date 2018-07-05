import * as React from 'react';
import { PureComponent, ReactNode } from 'react';

/**
 * Reference to the currently rendering BaseSubscriptionContext.
 */
let currentContext: BaseSubscriptionContext<any>|null = null;

/**
 * @returns The currently rendering BaseSubscriptionContext, if any.
 */
export function getCurrentContext() {
    return currentContext;
}

/**
 * Incrementing index to use for Context IDs.
 */
let idCount = 0;
function getId() {
    idCount += 1;
    return String(idCount);
}

/**
 * Type for a reset callback (registered by SubscriptionManager on a
 * SubscriptionContext). Callbacks  are passed a reference to the context
 * instance (which can be helpful since we don't have to create separate
 * callbacks for each reset context).
 */
type ResetCb<Props> = (ctx: BaseSubscriptionContext<Props>) => void;

/**
 * Base class for a SubscriptionContext used to track component rendering. The
 * context itself is exposed via injection to the render function and on the
 * module level by the `getCurrentContext`. This lets any SubscriptionManagers
 * called which Context it can register resets and unsubscribe calls with. Use
 * the default exported `watch` HOC to instantiate.
 *
 * NB: This uses PureComponent because we don't want to re-run render function
 * unless props change, but it isn't really pure because it can be triggered
 * externally via a manual forceUpdate.
 */
export abstract class BaseSubscriptionContext<Props> extends PureComponent<Props> {
    /**
     * Unique identified to key context by
     */
    public id: string = getId();

    /** List of registered reset functions to call before each tracking call */
    public resets: ResetCb<Props>[] = [];

    /**
     * The render function we're providing a context for.
     */
    abstract renderContent(): React.ReactNode;

    /**
     * The actual React render function. Wraps the `renderContent` method
     * method provided via the `watch` HOC. Sets a reference to this context as
     * the current one
     * @return Result from `renderContent` method
     */
    render() {
        currentContext = this;
        let ret: React.ReactNode;
        try {
            this.reset();
            ret = this.renderContent();
        } finally {
            currentContext = null;
        }
        return ret;
    }

    /** Clear any subscription on unmount */
    componentWillUnmount() {
        this.reset();
    }

    /**
     * Register a reset that can gets called before each render (or can
     * be called later).
     * @param resetCb - The actual callback to use.
     */
    registerReset(resetCb: ResetCb<Props>) {
        this.resets.push(resetCb);
    }

    /** Call the resets previously registered with this context. */
    reset() {
        this.resets.forEach((reset) => {
           reset(this);
        });
        this.resets = [];
    }
}

/**
 * A render function to wrap with a SubscriptionContext that manages calls
 * to SubscriptionManagers. Takes props + reference to SubscriptionContext
 * instance itself.
 */
export type RenderFn<Props> = (
    props: Props,
    ctx: BaseSubscriptionContext<Props>,
) => ReactNode;

/**
 * HOC that takes a render function and returns a React component class that
 * handles calls to SubscriptionManagers made within the render function.
 * @param renderContent - The render function to track
 * @return React component class
 */
export default function watch<Props>(renderContent: RenderFn<Props>) {
    /**
     * A SubscriptionContext for tracking subscriptions within a given
     * render function.
     */
    return class SubscriptionContext extends BaseSubscriptionContext<Props> {
        renderContent(): ReactNode {
            return renderContent(this.props, this);
        }
    };
}
